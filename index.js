const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const pino = require('pino');
const admin = require('firebase-admin');
const fs = require('fs');

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;

// Initialize Express
const app = express();

// --- FIREBASE SETUP ---
let serviceAccount;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        serviceAccount = require('./serviceAccountKey.json');
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("System: Firebase Admin initialized successfully.");
} catch (error) {
    console.error("System Error: Failed to initialize Firebase. Make sure FIREBASE_SERVICE_ACCOUNT env var is set.");
    process.exit(1);
}

const db = admin.firestore();

// --- BAILEYS SETUP ---
let qrCodeData = null; // Store current QR code
let sock = null;
let isConnected = false; // <--- FIX: Track actual auth state

async function startWhatsApp() {
    const logger = pino({ level: 'silent' });
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: state,
        browser: ["WhatsApp Logger", "Chrome", "1.0.0"],
        syncFullHistory: false 
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCodeData = qr;
            isConnected = false; // Ensure we know we aren't logged in yet
        }

        if (connection === 'close') {
            isConnected = false; // Reset on disconnect
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                startWhatsApp();
            }
        } else if (connection === 'open') {
            console.log("System: Connection Open and Authenticated");
            qrCodeData = null;
            isConnected = true; // <--- FIX: Only true when fully open
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // --- MESSAGE HANDLING ---
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

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

                await db.collection('Chats').doc(remoteJid).collection('Messages').add({
                    text: textContent,
                    senderId: remoteJid,
                    senderName: msg.pushName || "Unknown",
                    timestamp: timestamp,
                    fromMe: msg.key.fromMe || false,
                    id: msg.key.id
                });

            } catch (err) {
                // Silent error handling
            }
        }
    });
}

// --- EXPRESS ROUTES ---

// Root: Show QR Code or Status
app.get('/', async (req, res) => {
    // FIX: Check isConnected variable, NOT sock.ws.isOpen
    if (isConnected) {
        return res.send(`
            <html>
                <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                    <h2 style="color: green;">System Operational</h2>
                    <p>Connected to WhatsApp.</p>
                </body>
            </html>
        `);
    }

    if (qrCodeData) {
        try {
            const qrImage = await QRCode.toDataURL(qrCodeData);
            return res.send(`
                <html>
                    <head><meta http-equiv="refresh" content="5"></head>
                    <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                        <h2>Scan to Link</h2>
                        <img src="${qrImage}" alt="QR Code" />
                        <p>Refreshes every 5 seconds...</p>
                    </body>
                </html>
            `);
        } catch (e) {
            return res.send("Error generating QR.");
        }
    }

    return res.send(`
        <html>
            <head><meta http-equiv="refresh" content="2"></head>
            <body>Initializing... please refresh.</body>
        </html>
    `);
});

app.get('/ping', (req, res) => {
    res.send('Pong');
});

app.listen(PORT, () => {
    startWhatsApp();
    console.log(`Server running on port ${PORT}`);
});
