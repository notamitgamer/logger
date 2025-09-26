import os
import json
from datetime import datetime
from flask import Flask, request, jsonify, render_template_string

# Initialize a Flask web application
app = Flask(__name__)

# Define the log file path
log_dir = "Data"
log_file = os.path.join(log_dir, "message_log.json")

# Ensure the Data directory exists
if not os.path.exists(log_dir):
    os.makedirs(log_dir)

# Ensure the log file exists and is a valid JSON array
if not os.path.exists(log_file) or os.path.getsize(log_file) == 0:
    with open(log_file, "w", encoding='utf-8') as f:
        f.write("[]")

def log_message(sender_id, message_content):
    """
    Logs a new message to a JSON file.
    Each message is stored with a timestamp, sender ID, and content.
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    message_entry = {
        "timestamp": timestamp,
        "sender": sender_id,
        "content": message_content
    }

    # Read existing log or create a new one
    try:
        with open(log_file, "r", encoding='utf-8') as f:
            log_data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        log_data = []
    
    # Append the new message entry and save
    log_data.append(message_entry)
    with open(log_file, "w", encoding='utf-8') as f:
        json.dump(log_data, f, indent=4)
    print(f"Logged message from {sender_id}")

@app.route("/health", methods=["GET"])
def health_check():
    """
    Provides a simple health check endpoint.
    Returns a 200 OK status for services like UptimeRobot.
    """
    return "OK", 200

@app.route("/logs", methods=["GET"])
def show_logs():
    """
    Displays all logged messages in a human-readable format.
    """
    try:
        with open(log_file, "r", encoding='utf-8') as f:
            log_data = json.load(f)
    except FileNotFoundError:
        return render_template_string("<h1>No messages have been logged yet.</h1>")
    except json.JSONDecodeError:
        return render_template_string("<h1>No messages have been logged yet.</h1>")

    if not log_data:
        return render_template_string("<h1>No messages have been logged yet.</h1>")

    # Create an HTML-formatted string for display
    log_html = "<h1>Recorded Messages</h1>"
    for entry in log_data:
        log_html += f"""
            <div style="border: 1px solid #ccc; margin: 10px; padding: 10px; border-radius: 8px;">
                <strong>Timestamp:</strong> {entry['timestamp']}<br>
                <strong>From:</strong> {entry['sender']}<br>
                <p><strong>Message:</strong><br>{entry['content']}</p>
            </div>
        """
    return render_template_string(log_html)

@app.route("/save_message", methods=["POST"])
def save_message():
    """
    Endpoint to receive messages from the Node.js client and log them.
    """
    try:
        data = request.json
        sender = data.get("sender")
        query = data.get("query")
        
        if not sender or not query:
            return jsonify({"error": "Missing sender or query"}), 400
        
        log_message(sender, query)
        return jsonify({"status": "success", "message": "Message logged successfully"}), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Run the Flask app on a local server
if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000)
