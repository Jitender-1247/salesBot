#!/bin/bash
# ===========================================================
# SalesBot - EC2 Docker Setup Script
# Run once after SSH-ing into a fresh EC2 instance (Ubuntu):
#   chmod +x deploy/setup_ec2_docker.sh && ./deploy/setup_ec2_docker.sh
# ===========================================================

set -e
echo "===== SalesBot EC2 Docker Setup ====="

# System update
sudo apt-get update -y && sudo apt-get upgrade -y

# --- Docker & Docker Compose ---
echo "[1/3] Installing Docker..."
# Add Docker's official GPG key:
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add the repository to Apt sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -y

# Install Docker packages
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow current user to run docker without sudo
sudo usermod -aG docker $USER

# --- Git ---
echo "[2/3] Installing Git..."
sudo apt-get install -y git

echo "[3/3] Setup complete!"
echo ""
echo "===== Next Steps ====="
echo "1. Clone your repo (if you haven't already):"
echo "   git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git && cd YOUR_REPO"
echo ""
echo "2. Setup your environment variables:"
echo "   nano backend/.env"
echo "   (Make sure you have LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, GROQ_API_KEY, etc.)"
echo ""
echo "3. Start the Docker containers:"
echo "   docker compose up -d --build"
echo ""
echo "4. View logs if something goes wrong:"
echo "   docker compose logs -f"
echo ""
echo "Note: You may need to log out and log back in for the 'docker' group changes to take effect."
