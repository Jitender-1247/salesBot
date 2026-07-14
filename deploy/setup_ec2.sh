#!/bin/bash
# ===========================================================
# SalesBot - EC2 Ubuntu 24.04 Setup Script
# Run once after SSH-ing into a fresh EC2 instance:
#   chmod +x setup_ec2.sh && ./setup_ec2.sh
# ===========================================================

set -e
echo "===== SalesBot EC2 Setup ====="

# System update
sudo apt-get update -y && sudo apt-get upgrade -y

# --- Node.js (v20 LTS) ---
echo "[1/7] Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v && npm -v

# --- PM2 (process manager) ---
echo "[2/7] Installing PM2..."
sudo npm install -g pm2

# --- Python & pip ---
echo "[3/7] Installing Python..."
sudo apt-get install -y python3 python3-pip python3-venv

# --- espeak-ng (required by Piper TTS) ---
echo "[4/7] Installing espeak-ng..."
sudo apt-get install -y espeak-ng

# --- Python packages ---
echo "[5/7] Installing Python dependencies..."
pip3 install --upgrade pip
pip3 install faster-whisper fastapi uvicorn python-multipart piper-tts pydantic huggingface_hub

# --- Playwright + Chromium (required by backend for browser automation) ---
echo "[6/7] Installing Playwright + Chromium..."
sudo apt-get install -y \
  libglib2.0-0 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
  libasound2 libx11-xcb1
# Playwright browsers installed per project (done in backend install step)

# --- Git ---
echo "[7/7] Installing Git..."
sudo apt-get install -y git

echo ""
echo "===== Setup complete! Next steps: ====="
echo ""
echo "1. Clone your repo:"
echo "   git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git && cd YOUR_REPO"
echo ""
echo "2. Install backend deps + Playwright browser:"
echo "   cd backend && npm install && npx playwright install chromium && cd .."
echo ""
echo "3. Install Python deps:"
echo "   cd servers && pip3 install -r requirements.txt && cd .."
echo ""
echo "4. Download TTS voice model:"
echo "   cd servers && python3 download_voice.py && cd .."
echo ""
echo "5. Create backend/.env with your production variables"
echo "   nano backend/.env"
echo ""
echo "6. Start all services:"
echo "   pm2 start deploy/ecosystem.config.cjs"
echo "   pm2 save"
echo "   pm2 startup   # follow the printed command"
echo ""
echo "Done! Services will auto-start on reboot."
