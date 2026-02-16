import os
from datetime import datetime

def write_file(filename, content):
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
    print(f"Generated: {filename}")

# Configuration
project_name = "WhatsApp Logger"
author_email = "mail@amit.is-a.dev"
security_email = "amitddutta4255@gmail.com"
year = datetime.now().year

# 1. README.md
readme_content = f"""
# {project_name}

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
"""

# 2. CONTRIBUTING.md
contributing_content = f"""
# Contributing to {project_name}

Thank you for your interest in contributing to {project_name}.

## How to Contribute

1.  Fork the repository.
2.  Create a new branch for your feature or fix.
3.  Commit your changes.
4.  Push to your fork and submit a Pull Request.

## Reporting Bugs

If you encounter an issue that is not a security vulnerability, please open an Issue on GitHub or email {author_email}.

## Guidelines

-   **No Logging of Data:** Do not submit code that adds `console.log` or print statements revealing message content, phone numbers, or user data. Pull Requests containing such logs will be rejected to protect user privacy.
-   **Clean Code:** Ensure your code is readable and commented where necessary.
"""

# 3. CODE_OF_CONDUCT.md
code_of_conduct_content = f"""
# Code of Conduct

## Our Pledge

We as members, contributors, and leaders pledge to make participation in our community a harassment-free experience for everyone, regardless of age, body size, visible or invisible disability, ethnicity, sex characteristics, gender identity and expression, level of experience, education, socio-economic status, nationality, personal appearance, race, religion, or sexual identity and orientation.

## Our Standards

Examples of behavior that contributes to a positive environment for our community include:

-   Demonstrating empathy and kindness toward other people
-   Being respectful of differing opinions, viewpoints, and experiences
-   Giving and gracefully accepting constructive feedback
-   Accepting responsibility and apologizing to those affected by our mistakes, and learning from the experience
-   Focusing on what is best not just for us as individuals, but for the overall community

## Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be reported to the project maintainer at {author_email}. All complaints will be reviewed and investigated promptly and fairly.
"""

# 4. SECURITY.md
security_content = f"""
# Security Policy

## Supported Versions

Please use the latest version of this project to ensure you have the latest security patches.

## Reporting a Vulnerability

We take the security of this project seriously. If you discover a security vulnerability, please do **NOT** open a public issue.

Instead, please send an email to:
**{security_email}**

Please include:
-   A description of the vulnerability.
-   Steps to reproduce the issue.
-   Any relevant code snippets or logs (redacted).

We will acknowledge your email within 48 hours and will keep you updated on the progress of the fix.

## Privacy & Logs

This application handles private communication data.
-   **Strict No-Logging Policy:** The application is designed to never output message content to system logs (stdout/stderr).
-   If you modify the source code, you are responsible for maintaining this policy to prevent leaking private messages into server logs (e.g., Render or Heroku logs).
"""

# 5. LICENSE (MIT)
license_content = f"""
MIT License

Copyright (c) {year} Amit

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""

def main():
    write_file("README.md", readme_content)
    write_file("CONTRIBUTING.md", contributing_content)
    write_file("CODE_OF_CONDUCT.md", code_of_conduct_content)
    write_file("SECURITY.md", security_content)
    write_file("LICENSE", license_content)
    print("\nAll files generated successfully.")

if __name__ == "__main__":
    main()