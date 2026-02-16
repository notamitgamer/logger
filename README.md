# WhatsApp Logger

A self-hosted, privacy-focused tool to log WhatsApp messages to Firebase Firestore. This application acts as a companion device, storing incoming text messages and timestamps in a database even if the sender subsequently deletes or edits them.

## Features

- **Anti-Delete/Anti-Edit:** Stores the original message content immediately upon receipt.
- **Silent Logging:** To ensure privacy and security, this application does NOT print any message content, sender numbers, or sensitive data to the server terminal or logs.
- **Search & Filter:** Frontend interface includes date-based filtering and text search.
- **Export:** Download chat logs as .txt files.
- **Separated Architecture:** Frontend and Backend can operate on different infrastructure/domains.

## Architecture

1.  **Backend (Node.js/Baileys):** Connects to WhatsApp servers. Serves the QR code for authentication. Pushes encrypted data to Firestore.
2.  **Database (Firebase Firestore):** Stores messages in a structured format separated by sender ID.
3.  **Frontend (HTML/JS):** A static web page to view, search, and export logs.

## Installation

### Backend Setup (Render/VPS)

1.  Clone this repository.
2.  Run `npm install`.
3.  Set up a Firebase project (Project B) and generate a Service Account Key.
4.  Place the service account JSON in the root or set it as an environment variable.
5.  Deploy to a server (e.g., Render).
6.  Access the root URL of your deployed server to view the QR code.
7.  Scan the QR code with WhatsApp (Linked Devices).

### Frontend Setup

1.  Edit the `index.html` (or config file) to include the Firebase Web Config for Project B.
2.  Deploy the static files to your hosting provider (e.g., Firebase Hosting Project A).
3.  Access your domain (e.g., https://amit.is-a.dev/wp-chat/).

## Usage

Once linked, the system runs automatically. Use the frontend to view logs. The server requires no manual intervention unless the session expires.

## License

Distributed under the MIT License. See `LICENSE` for more information.
