#!/bin/bash
cd /d/Leash-main/Leash-main

# Start server
ED25519_PRIVATE_KEY=YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE= PORT=4317 npm start > server.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 5

echo "=== 1. GET /v1/ledger/checkpoint ==="
curl -v http://127.0.0.1:4317/v1/ledger/checkpoint 2>&1

echo -e "\n\n=== 2. GET /v1/ledger/verify ==="
curl -v http://127.0.0.1:4317/v1/ledger/verify 2>&1

echo -e "\n\n=== 3. GET /v1/challenge/leaderboard ==="
curl -v http://127.0.0.1:4317/v1/challenge/leaderboard 2>&1

echo -e "\n\n=== 4. POST /v1/challenge/attempt ==="
curl -v -X POST http://127.0.0.1:4317/v1/challenge/attempt -H "Content-Type: application/json" -d '{"message":"Test prompt injection"}' 2>&1

# Show server logs
echo -e "\n\n=== Server Logs ==="
cat server.log

# Kill server
kill $SERVER_PID 2>/dev/null
