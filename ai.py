import sys
import requests
import json
import shutil
import os

# Fix encoding for emojis/unicode output
sys.stdout.reconfigure(encoding='utf-8')

if len(sys.argv) < 3:
    print("No query or sender provided.")
    sys.exit()

query = sys.argv[1]
sender = sys.argv[2]

try:
    # Send the message data to the Python logging server
    payload = {
        "sender": sender,
        "query": query
    }
    
    response = requests.post("http://localhost:5000/save_message", json=payload)
    response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)

    print("✅ Message successfully sent to logging server.")

except requests.exceptions.RequestException as e:
    print(f"❌ Error sending message to logging server: {e}")
except Exception as e:
    print(f"❌ An unexpected error occurred: {e}")
