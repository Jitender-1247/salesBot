#!/bin/bash
set -e

# Automatically resolve repository root directory regardless of where script is run from
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== SalesBot Frontend & Nginx Deployment ==="
echo "Repository root: $REPO_ROOT"

# Ensure target directories exist
sudo mkdir -p /var/www/salesbot/widget /var/www/salesbot/dashboard
sudo mkdir -p /var/www/html/widget /var/www/html/dashboard

# 1. Clean and deploy Widget
if [ -d "$REPO_ROOT/frontend/widget/dist" ]; then
    echo "Deploying fresh Widget build to /var/www/salesbot/widget..."
    sudo rm -rf /var/www/salesbot/widget/* /var/www/html/widget/*
    sudo cp -r "$REPO_ROOT/frontend/widget/dist"/* /var/www/salesbot/widget/
    sudo cp -r "$REPO_ROOT/frontend/widget/dist"/* /var/www/html/widget/ 2>/dev/null || true
    echo "✅ Widget build deployed successfully!"
else
    echo "❌ ERROR: $REPO_ROOT/frontend/widget/dist not found!"
    exit 1
fi

# 2. Clean and deploy Dashboard
if [ -d "$REPO_ROOT/frontend/dashboard/dist" ]; then
    echo "Deploying fresh Dashboard build to /var/www/salesbot/dashboard..."
    sudo rm -rf /var/www/salesbot/dashboard/* /var/www/html/dashboard/*
    sudo cp -r "$REPO_ROOT/frontend/dashboard/dist"/* /var/www/salesbot/dashboard/
    sudo cp -r "$REPO_ROOT/frontend/dashboard/dist"/* /var/www/html/dashboard/ 2>/dev/null || true
    echo "✅ Dashboard build deployed successfully!"
else
    echo "❌ ERROR: $REPO_ROOT/frontend/dashboard/dist not found!"
    exit 1
fi

# 3. Set proper ownership and permissions
sudo chown -R www-data:www-data /var/www/salesbot /var/www/html
sudo chmod -R 755 /var/www/salesbot /var/www/html

# 4. Reload Nginx
echo "Reloading Nginx..."
sudo nginx -t
sudo systemctl reload nginx || sudo systemctl restart nginx

echo ""
echo "=== Successfully Deployed Widget & Dashboard! ==="
