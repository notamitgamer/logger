import {
    makeWASocket,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { execFile } from "child_process";
import qrcode from "qrcode-terminal";
import fs from "fs";

// Initialize a silent logger for Baileys
const logger = pino().child({ level: "silent" });

// Define the path for the authentication credentials
const authPath = "./baileys_auth_info";

// Function to run the Python script
const runPythonScript = (text, sender, messageId, action = "log") => {
    // Execute the Python script "ai.py" to handle the message.
    execFile('python', ['ai.py', text, sender, messageId, action], (error, stdout, stderr) => {
        if (error) {
            console.error("❌ Python Error:", error.message);
            return;
        }
        if (stderr) {
            console.error("⚠️ Python stderr:", stderr);
            return;
        }
        console.log("🐍 Python stdout:", stdout);
    });
};

// Main function to start the bot
const startSock = async () => {
    // Check if the auth directory exists, otherwise create it
    if (!fs.existsSync(authPath)) {
        fs.mkdirSync(authPath);
    }

    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    
    // Fetch the latest compatible version of WhatsApp Web
    const { version } = await fetchLatestBaileysVersion();
    console.log(`Using WhatsApp version: ${version.join('.')}`);

    const sock = makeWASocket({
        version,
        logger,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger.child({ level: 'silent' })),
        },
        browser: ["WhatsApp Bot", "Chrome", "1.0.0"], // This is a fake browser ID
        patchMessageBeforeSending: (message) => {
            const requiresPatch = !!(
                message.buttonsMessage ||
                message.listMessage
            );
            if (requiresPatch) {
                message = {
                    viewOnceMessage: {
                        message: {
                            ...message,
                        },
                    },
                };
            }
            return message;
        },
    });

    // Save credentials when they are updated
    sock.ev.on("creds.update", saveCreds);

    // Handle connection state changes
    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log("Scan the QR code to connect:");
            qrcode.generate(qr, { small: true });
        }
        if (connection === "close") {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                console.log("Logged out. Deleting auth directory and trying again.");
                fs.rmSync(authPath, { recursive: true, force: true });
                startSock();
            } else {
                console.log("Connection closed. Reconnecting...");
                startSock();
            }
        } else if (connection === "open") {
            console.log("✅ Baileys bot is ready and running!");
        }
    });

    // Listen for incoming messages
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type === "notify") {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const sender = msg.key.remoteJid;
            const senderName = msg.pushName || sender;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            const messageId = msg.key.id;

            if (text) {
                console.log(`📥 From ${senderName} (${sender}): ${text}`);
                runPythonScript(text, sender, messageId);
            }
        }
    });

    // Listen for edited messages
    sock.ev.on("messages.update", async (messages) => {
        const message = messages[0];
        if (message.update.edited) {
            const updatedText = message.update.edited.message.extendedTextMessage?.text;
            const originalMessageId = message.key.id;

            if (updatedText) {
                console.log(`✏️ Edited message from ${message.key.remoteJid}: ${updatedText}`);
                runPythonScript(updatedText, message.key.remoteJid, originalMessageId, "edit");
            }
        }
    });
};

// Start the bot
startSock();
