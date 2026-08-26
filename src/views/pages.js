const { VERSION } = require('../config');

function logsPage(logBuffer) {
    const logLines = logBuffer.map(l => {
        const time = new Date(l.timestamp).toLocaleTimeString();
        const color = l.level === 'error' ? '#ff6b6b' : '#a9dc76';
        return `<div style="color: ${color}">[${time}] [${l.level.toUpperCase()}] ${l.message}</div>`;
    }).join('');

    return `
        <html>
            <head>
                <meta http-equiv="refresh" content="5">
                <title>System Logs</title>
                <style>
                    body { font-family: monospace; background: #1e1e1e; color: #d4d4d4; padding: 20px; }
                    .log-container { background: #000; padding: 15px; border-radius: 5px; overflow-x: auto; max-width: 100%; white-space: pre-wrap; font-size: 14px; line-height: 1.5; }
                </style>
            </head>
            <body onload="window.scrollTo(0,document.body.scrollHeight);">
                <h2 style="color: #fff; margin-top: 0;">System Logs</h2>
                <div class="log-container">
                    ${logLines.length > 0 ? logLines : '<div>No logs yet...</div>'}
                </div>
            </body>
        </html>
    `;
}

function loginPage() {
    return `
        <html>
            <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f2f5;">
                <form action="/login" method="POST" style="background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 300px;">
                    <h2 style="margin-top: 0; text-align: center;">WhatsApp Logger <span style="font-size: 14px; font-weight: normal; color: #666;">v${VERSION}</span></h2>
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
    `;
}

function loginFailedPage() {
    return 'Invalid credentials. <a href="/login">Try again</a>';
}

const logoutBtn = `<a href="/logout" style="position: absolute; top: 10px; right: 10px; padding: 8px 16px; background: #ff4444; color: white; text-decoration: none; border-radius: 4px; font-size: 14px;">Logout</a>`;

function connectedPage() {
    return `
        <html>
            <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background-color: #f0f2f5;">
                ${logoutBtn}
                <div style="background: white; padding: 40px; border-radius: 10px; display: inline-block; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <h2 style="color: green;">System Operational</h2>
                    <p style="color: #555;">Connected to WhatsApp. State synced to Firestore.</p>
                    <p style="color: #999; font-size: 12px;">Back-end Service</p>
                </div>
            </body>
        </html>
    `;
}

function qrPage(qrImage) {
    return `
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
    `;
}

function qrErrorPage() {
    return "Error generating QR.";
}

function initializingPage() {
    return `
        <html>
            <head><meta http-equiv="refresh" content="2"></head>
            <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                <p>Initializing connection or restoring auth state... please wait.</p>
                ${logoutBtn}
            </body>
        </html>
    `;
}

module.exports = {
    logsPage,
    loginPage,
    loginFailedPage,
    connectedPage,
    qrPage,
    qrErrorPage,
    initializingPage
};
