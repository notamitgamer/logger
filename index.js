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
// We check for the environment variable 'FIREBASE_SERVICE_ACCOUNT'
// This should contain the JSON string of your service account key.
let serviceAccount;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        // Fallback for local testing if file exists
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

async function startWhatsApp() {
    // Silent logger to prevent leaking data to logs
    const logger = pino({ level: 'silent' });
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false, // We serve it via HTTP
        auth: state,
        browser: ["WhatsApp Logger", "Chrome", "1.0.0"],
        syncFullHistory: false 
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCodeData = qr; // Update the QR to be served
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            // Only log system status, never data
            if (shouldReconnect) {
                startWhatsApp();
            }
        } else if (connection === 'open') {
            qrCodeData = null; // Clear QR code on success
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // --- MESSAGE HANDLING ---
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            try {
                if (!msg.message) continue;

                // Extract Sender ID (phone number)
                const remoteJid = msg.key.remoteJid;
                
                // Skip status updates (broadcasts)
                if (remoteJid === 'status@broadcast') continue;

                // Extract Content
                // We check multiple fields to support text, replies, and captions
                const textContent = 
                    msg.message.conversation || 
                    msg.message.extendedTextMessage?.text || 
                    msg.message.imageMessage?.caption || 
                    msg.message.videoMessage?.caption || 
                    "";

                if (!textContent) continue; // Skip if no text found

                const timestamp = msg.messageTimestamp 
                    ? (typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : msg.messageTimestamp.low) 
                    : Math.floor(Date.now() / 1000);

                // --- SAVE TO FIRESTORE ---
                // Structure: Chats -> [PhoneNumber] -> Messages -> [AutoID]
                await db.collection('Chats').doc(remoteJid).collection('Messages').add({
                    text: textContent,
                    senderId: remoteJid,
                    senderName: msg.pushName || "Unknown",
                    timestamp: timestamp,
                    fromMe: msg.key.fromMe || false,
                    id: msg.key.id
                });

            } catch (err) {
                // Silently handle errors to keep logs clean
            }
        }
    });
}

// --- EXPRESS ROUTES ---

// Root: Show QR Code or Status
app.get('/', async (req, res) => {
    if (sock?.ws?.isOpen) {
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
                    <meta http-equiv="refresh" content="5">
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

    return res.send("Initializing... please refresh.");
});

// Ping endpoint for UptimeRobot
app.get('/ping', (req, res) => {
    res.send('Pong');
});

// Start the server
app.listen(PORT, () => {
    startWhatsApp();
    console.log(`Server running on port ${PORT}`);
});