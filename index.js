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
const crypto = require('crypto');

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const AUTH_USER = process.env.AUTH_USER;
const AUTH_PASS = process.env.AUTH_PASS;

// Initialize Express
const app = express();
app.use(express.urlencoded({ extended: true })); // Parse form data
app.use(express.json()); // Parse JSON bodies (for API requests)

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
let qrCodeData = null; 
let sock = null;
let isConnected = false; 

async function startWhatsApp() {
    const logger = pino({ level: 'silent' });
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: state,
        browser: ["WhatsApp Logger by notamitgamer", "Chrome", "1.0.0"],
        syncFullHistory: true // CRITICAL: Must be true to get Contact Sync (Real Numbers)
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCodeData = qr;
            isConnected = false;
        }

        if (connection === 'close') {
            isConnected = false;
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                startWhatsApp();
            }
        } else if (connection === 'open') {
            console.log("System: Connection Open and Authenticated");
            qrCodeData = null;
            isConnected = true;
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // --- FEATURE: REAL NUMBER SYNC ---
    // This listener translates LIDs (1155...) into Real Phone Numbers (91...)
    // and updates the Firestore Chat document automatically.
    sock.ev.on('contacts.upsert', async (contacts) => {
        for (const contact of contacts) {
            // We look for contacts that have both a Phone ID and a LID
            if (contact.id && contact.lid) {
                const realNumber = contact.id.split('@')[0];
                const displayName = contact.name || contact.notify || undefined;

                try {
                    const updateData = { phoneNumber: realNumber };
                    if (displayName) updateData.displayName = displayName;

                    // 1. Update the LID Chat (The one you see in the viewer)
                    await db.collection('Chats').doc(contact.lid).set(updateData, { merge: true });
                    
                    // 2. Update the Phone Chat (The "Ghost" chat, just in case)
                    await db.collection('Chats').doc(contact.id).set(updateData, { merge: true });
                    
                } catch (err) {
                    // Silent fail to keep logs clean
                }
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
                
                // Fallback number (will be overwritten by contacts.upsert later)
                const phoneNumber = remoteJid.split('@')[0]; 

                // 1. Ensure Chat Document Exists (Fixes "No Chats" issue)
                await db.collection('Chats').doc(remoteJid).set({
                    lastActive: timestamp,
                    id: remoteJid,
                    // We don't overwrite phoneNumber here blindly, relying on the Sync listener
                    // to provide the accurate "91..." number.
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

            } catch (err) {
                // Silent error handling
            }
        }
    });
}

// --- AUTH UTILS ---
const SESSION_SECRET = crypto.createHash('sha256').update(AUTH_PASS || 'default').digest('hex');

function parseCookies(request) {
    const list = {};
    const rc = request.headers.cookie;
    if (rc) {
        rc.split(';').forEach((cookie) => {
            const parts = cookie.split('=');
            list[parts.shift().trim()] = decodeURI(parts.join('='));
        });
    }
    return list;
}

// --- EXPRESS ROUTES ---

// 1. Ping (UptimeRobot)
app.get('/ping', (req, res) => {
    res.status(200).send('Pong');
});

// 2. API: Verify Credentials (For External Frontend)
app.post('/api/verify', (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

    const { username, password } = req.body;

    if (username === AUTH_USER && password === AUTH_PASS) {
        return res.json({ success: true });
    } else {
        return res.status(401).json({ success: false });
    }
});

// CORS Pre-flight
app.options('/api/verify', (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.sendStatus(200);
});

// 3. Login Page
app.get('/login', (req, res) => {
    res.send(`
        <html>
            <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f2f5;">
                <form action="/login" method="POST" style="background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 300px;">
                    <h2 style="margin-top: 0; text-align: center;">WhatsApp Logger</h2>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem;">Username</label>
                        <input type="text" name="username" required style="width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem;">Password</label>
                        <input type="password" name="password" required style="width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: flex; align-items: center; font-size: 0.9rem;">
                            <input type="checkbox" name="remember" value="yes" style="margin-right: 0.5rem;">
                            Keep me logged in for 5 mins
                        </label>
                    </div>
                    <button type="submit" style="width: 100%; padding: 0.75rem; background: #25D366; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">Login</button>
                </form>
            </body>
        </html>
    `);
});

// 4. Login Action
app.post('/login', (req, res) => {
    const { username, password, remember } = req.body;

    if (username === AUTH_USER && password === AUTH_PASS) {
        let cookieSettings = 'HttpOnly; Path=/;'; 
        if (remember === 'yes') cookieSettings += ' Max-Age=300;';
        
        res.setHeader('Set-Cookie', `auth_session=${SESSION_SECRET}; ${cookieSettings}`);
        return res.redirect('/');
    }
    res.status(401).send('Invalid credentials. <a href="/login">Try again</a>');
});

// 5. Logout
app.get('/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'auth_session=; Max-Age=0; Path=/;');
    res.redirect('/login');
});

// --- MIDDLEWARE ---
const checkAuth = (req, res, next) => {
    if (!AUTH_USER || !AUTH_PASS) return next();
    const cookies = parseCookies(req);
    if (cookies.auth_session === SESSION_SECRET) return next();
    
    if (req.path.startsWith('/api')) res.status(401).send('Unauthorized');
    else res.redirect('/login');
};

app.use(checkAuth);

// 6. Main Route
app.get('/', async (req, res) => {
    const logoutBtn = `<a href="/logout" style="position: absolute; top: 10px; right: 10px; padding: 8px 16px; background: #ff4444; color: white; text-decoration: none; border-radius: 4px; font-size: 14px;">Logout</a>`;

    if (isConnected) {
        return res.send(`
            <html>
                <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background-color: #f0f2f5;">
                    ${logoutBtn}
                    <div style="background: white; padding: 40px; border-radius: 10px; display: inline-block; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                        <h2 style="color: green;">System Operational</h2>
                        <p style="color: #555;">Connected to WhatsApp.</p>
                        <p style="color: #999; font-size: 12px;">Back-end Service</p>
                    </div>
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
                    <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background-color: #f0f2f5;">
                        ${logoutBtn}
                        <div style="background: white; padding: 40px; border-radius: 10px; display: inline-block; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                            <h2>Scan to Link</h2>
                            <img src="${qrImage}" alt="QR Code" />
                            <p style="color: #666;">Refreshes every 5 seconds...</p>
                        </div>
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
            <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                <p>Initializing... please refresh.</p>
                ${logoutBtn}
            </body>
        </html>
    `);
});

// --- START SERVER ---
app.listen(PORT, () => {
    startWhatsApp();
    console.log(`Server running on port ${PORT}`);
});
