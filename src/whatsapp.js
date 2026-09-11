const {
    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { db } = require('./firebase');
const { useFirestoreAuthState } = require('./authState');

// --- BAILEYS SETUP ---
let qrCodeData = null;
let sock = null;
let isConnected = false;

let consecutiveAuthFailures = 0;
let consecutiveConnectFailures = 0;

async function startWhatsApp() {
    const logger = pino({ level: 'silent' });

    let authResult;
    try {
        authResult = await useFirestoreAuthState(db, 'whatsapp_auth');
    } catch (err) {
        consecutiveAuthFailures++;
        const backoff = Math.min(5000 * Math.pow(2, consecutiveAuthFailures), 300000); // cap 5 min
        console.error(`System: Auth state read failed (attempt ${consecutiveAuthFailures}). Retrying in ${backoff / 1000}s.`);
        setTimeout(startWhatsApp, backoff);
        return;
    }
    consecutiveAuthFailures = 0; // Reset on success

    const { state, saveCreds, clearState } = authResult;
    const { version } = await fetchLatestBaileysVersion();

    console.log("System: Connecting to WhatsApp servers...");

    sock = makeWASocket({
        version,
        logger,
        auth: state,
        browser: ["WhatsApp Logger v4.2.1", "Chrome", "4.2.1"],
        syncFullHistory: true
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("System: No valid credentials. New QR Code generated.");
            qrCodeData = qr;
            isConnected = false;
        }

        if (connection === 'close') {
            isConnected = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            if (shouldReconnect) {
                consecutiveConnectFailures++;
                const backoff = Math.min(5000 * Math.pow(2, consecutiveConnectFailures), 300000); // cap 5 min
                console.log(`System: Connection closed (Status: ${statusCode}). Reconnecting in ${backoff / 1000}s...`);
                setTimeout(startWhatsApp, backoff);
            } else {
                console.log("System: Device Logged Out. Wiping session from Firestore.");
                await clearState();
                qrCodeData = null;
                consecutiveConnectFailures = 0;
                startWhatsApp();
            }
        } else if (connection === 'open') {
            console.log("System: Connection Open and Authenticated. Firebase Auth Sync Active.");
            qrCodeData = null;
            isConnected = true;
            consecutiveConnectFailures = 0; // Reset on success
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('contacts.upsert', async (contacts) => {
        for (const contact of contacts) {
            let updateData = {};
            const displayName = contact.name || contact.notify;

            if (displayName) updateData.displayName = displayName;

            if (contact.id && contact.id.endsWith('@s.whatsapp.net')) {
                updateData.phoneNumber = contact.id.split('@')[0];
            }

            const primaryId = contact.lid || contact.id;

            if (primaryId && Object.keys(updateData).length > 0) {
                try {
                    await db.collection('Chats').doc(primaryId).set(updateData, { merge: true });

                    if (contact.lid && contact.id !== contact.lid) {
                        await db.collection('Chats').doc(contact.id).set(updateData, { merge: true });
                    }
                } catch (err) {}
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify' && type !== 'append') return;

        for (const msg of messages) {
            try {
                if (!msg.message) continue;

                const remoteJid = msg.key.remoteJid;
                if (remoteJid === 'status@broadcast') continue;

                const textContent =
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption ||
                    msg.message.videoMessage?.caption ||
                    "";

                if (!textContent) continue;

                const timestamp = msg.messageTimestamp
                    ? (typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : msg.messageTimestamp.low)
                    : Math.floor(Date.now() / 1000);

                const isFromMe = msg.key.fromMe || false;
                const senderName = isFromMe ? "Me" : (msg.pushName || "Unknown");

                // 1. Ensure Chat Document Exists
                await db.collection('Chats').doc(remoteJid).set({
                    lastActive: timestamp,
                    id: remoteJid,
                    preview: textContent
                }, { merge: true });

                // 2. Save Message
                await db.collection('Chats')
                    .doc(remoteJid)
                    .collection('Messages')
                    .doc(msg.key.id)
                    .set({
                        text: textContent,
                        senderId: remoteJid,
                        senderName: senderName,
                        timestamp: timestamp,
                        fromMe: isFromMe,
                        id: msg.key.id
                    }, { merge: true });

            } catch (err) {}
        }
    });

    // --- Edited message handling ---
    // Unlike a regular new message, an edit to an existing message arrives
    // via messages.update (not messages.upsert). Baileys already unwraps it:
    // `key` is the ORIGINAL message's key, and `update.message` is the new
    // content directly — there's no protocolMessage/editedMessage nesting on
    // the receiving side (that shape is only for constructing an outgoing
    // edit yourself via sock.sendMessage(..., { edit: key })).
    //
    // We keep the original text plus every subsequent edit in `edits`
    // (oldest first) so the UI can show original -> edit 1 -> edit 2 ...
    // instead of overwriting history.
    sock.ev.on('messages.update', async (updates) => {
        for (const { key, update } of updates) {
            try {
                if (!update.message) continue; // not an edit (e.g. a status/ack update)

                const remoteJid = key.remoteJid;
                const targetId = key.id;
                if (!remoteJid || !targetId || remoteJid === 'status@broadcast') continue;

                const editedText =
                    update.message.conversation ||
                    update.message.extendedTextMessage?.text ||
                    update.message.imageMessage?.caption ||
                    update.message.videoMessage?.caption ||
                    "";

                if (!editedText) {
                    console.error(`System: Received edit for ${targetId} with no extractable text — ignoring.`);
                    continue;
                }

                const editTimestamp = Math.floor(Date.now() / 1000);
                const msgRef = db.collection('Chats').doc(remoteJid).collection('Messages').doc(targetId);

                // Guard against a race: if this edit arrives before the original
                // message's own write has committed (e.g. someone edits within
                // ~1s of sending), the doc won't exist yet. Retry briefly instead
                // of silently dropping the edit.
                let applied = false;
                for (let attempt = 0; attempt < 3 && !applied; attempt++) {
                    if (attempt > 0) await new Promise(r => setTimeout(r, 500 * attempt));

                    try {
                        applied = await db.runTransaction(async (tx) => {
                            const snap = await tx.get(msgRef);
                            if (!snap.exists) return false;

                            const data = snap.data();
                            const priorEdits = Array.isArray(data.edits) ? data.edits : [];

                            // On the first edit, seed history with the pre-edit text so
                            // the original is preserved alongside every later revision.
                            const history = priorEdits.length > 0
                                ? priorEdits
                                : [{ text: data.text, timestamp: data.timestamp }];

                            history.push({ text: editedText, timestamp: editTimestamp });

                            tx.set(msgRef, {
                                text: editedText,       // latest text — existing UI keeps working unchanged
                                edited: true,
                                editCount: history.length - 1,
                                lastEditedAt: editTimestamp,
                                edits: history           // full chronological history, oldest (original) first
                            }, { merge: true });

                            return true;
                        });
                    } catch (err) {
                        console.error(`System: Edit-history transaction failed for ${targetId} (attempt ${attempt + 1}):`, err.message);
                    }
                }

                if (applied) {
                    console.log(`System: Recorded edit for message ${targetId} in ${remoteJid}.`);
                } else {
                    console.error(`System: Could not attach edit for message ${targetId} in ${remoteJid} — original was never found (gave up after retries).`);
                }
            } catch (err) {}
        }
    });
}

module.exports = {
    startWhatsApp,
    getQrCodeData: () => qrCodeData,
    getIsConnected: () => isConnected
};
