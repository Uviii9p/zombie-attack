from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os

app = Flask(__name__)
CORS(app)

DB_FILE = 'game_data.json'

def load_data():
    if os.path.exists(DB_FILE):
        with open(DB_FILE, 'r') as f:
            return json.load(f)
    return {"coins": 0, "kill_count": 0}

def save_data(data):
    with open(DB_FILE, 'w') as f:
        json.dump(data, f)

@app.route('/get-stats', methods=['GET'])
def get_stats():
    return jsonify(load_data())

@app.route('/update-coins', methods=['POST'])
def update_coins():
    data = request.json
    amount = data.get('amount', 0)
    is_absolute = data.get('absolute', False)
    
    current_data = load_data()
    if is_absolute:
        current_data['coins'] = max(0, amount)
    else:
        current_data['coins'] = max(0, current_data['coins'] + amount)
        
    # Only inc kill count if we gained coins roughly equivalent to kills
    if not is_absolute and amount > 0:
        current_data['kill_count'] += 1
    
    save_data(current_data)
    return jsonify({"status": "success", "new_balance": current_data['coins']})

if __name__ == '__main__':
    app.run(port=5000, debug=True)
