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
const path = require('path');

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const AUTH_USER = process.env.AUTH_USER;
const AUTH_PASS = process.env.AUTH_PASS;

// Initialize Express
const app = express();

// --- MIDDLEWARE: BASIC AUTH ---
// Protects the frontend and QR code page
const checkAuth = (req, res, next) => {
    if (!AUTH_USER || !AUTH_PASS) return next(); // Skip if vars not set

    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (login && password && login === AUTH_USER && password === AUTH_PASS) {
        return next();
    }

    res.set('WWW-Authenticate', 'Basic realm="401"');
    res.status(401).send('Authentication required to access WhatsApp Logger.');
};

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
let isConnected = false; // Track actual auth state

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
            isConnected = true; // Only true when fully open
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // --- MESSAGE HANDLING ---
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        // Allow 'notify' (incoming) and 'append' (sent from phone/history sync)
        if (type !== 'notify' && type !== 'append') return;

        for (const msg of messages) {
            try {
                if (!msg.message) continue;

                // For sent messages, remoteJid is the Recipient. 
                // For received messages, remoteJid is the Sender.
                // This keeps both sides of the conversation in the same "Chat" bucket.
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
                
                // Determine name: Use "Me" for outgoing, otherwise pushName or Unknown
                const senderName = isFromMe ? "Me" : (msg.pushName || "Unknown");

                await db.collection('Chats').doc(remoteJid).collection('Messages').add({
                    text: textContent,
                    senderId: remoteJid,
                    senderName: senderName,
                    timestamp: timestamp,
                    fromMe: isFromMe,
                    id: msg.key.id
                });

            } catch (err) {
                // Silent error handling
            }
        }
    });
}

// --- EXPRESS ROUTES ---

// 1. Apply Auth to ALL routes (including static files if you add them later)
app.use(checkAuth);

// 2. Serve Static Frontend (Optional: If you place index.html in a 'public' folder)
app.use(express.static(path.join(__dirname, 'public')));

// 3. Root Endpoint: Show QR Code or Status
app.get('/', async (req, res) => {
    // Check isConnected variable
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

// Ping endpoint (Bypass Auth for UptimeRobot)
// We put this BEFORE the auth check middleware? No, we used app.use(checkAuth) globally.
// To fix UptimeRobot failure, we must exclude /ping from auth.
// Let's redefine routes to ensure /ping is open.

// ... resetting routes structure for correctness ...

// Clear previous app.use to handle ordering correctly
app._router.stack.pop(); // (Conceptual remove, we will just restructure below)
