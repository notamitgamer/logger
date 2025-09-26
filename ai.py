import sys
import requests
import json
import shutil
import os

# Fix encoding for emojis/unicode output
sys.stdout.reconfigure(encoding='utf-8')

def log_message(query, sender, message_id):
    """
    Logs a new message to the Python logging server.
    """
    try:
        payload = {
            "sender": sender,
            "query": query,
            "message_id": message_id
        }
        
        response = requests.post("http://localhost:5000/save_message", json=payload)
        response.raise_for_status()
        print("✅ Message successfully sent to logging server.")
    except requests.exceptions.RequestException as e:
        print(f"❌ Error sending message to logging server: {e}")
    except Exception as e:
        print(f"❌ An unexpected error occurred: {e}")

def edit_message(message_id, new_content):
    """
    Sends an updated message to the Python logging server.
    """
    try:
        payload = {
            "message_id": message_id,
            "new_content": new_content
        }
        response = requests.post("http://localhost:5000/edit_message", json=payload)
        response.raise_for_status()
        print("✅ Edited message successfully sent to logging server.")
    except requests.exceptions.RequestException as e:
        print(f"❌ Error sending edited message to logging server: {e}")
    except Exception as e:
        print(f"❌ An unexpected error occurred: {e}")

if len(sys.argv) < 4:
    print("Invalid arguments. Usage: ai.py <query> <sender> <message_id> [action]")
    sys.exit()

query = sys.argv[1]
sender = sys.argv[2]
message_id = sys.argv[3]
action = sys.argv[4] if len(sys.argv) > 4 else "log"

if action == "edit":
    edit_message(message_id, query)
elif action == "log":
    log_message(query, sender, message_id)
else:
    print("Invalid action. Supported actions are 'log' and 'edit'.")
