#!/bin/bash
set -e

echo "=== Deploying Frontends to /var/www/html ==="

sudo mkdir -p /var/www/html/widget
sudo mkdir -p /var/www/html/dashboard

# Clean old assets and copy fresh widget dist
if [ -d "frontend/widget/dist" ]; then
    echo "Cleaning and copying fresh Widget build..."
    sudo rm -rf /var/www/html/widget/*
    sudo cp -r frontend/widget/dist/* /var/www/html/widget/
else
    echo "WARNING: frontend/widget/dist not found."
fi

# Clean old assets and copy fresh dashboard dist
if [ -d "frontend/dashboard/dist" ]; then
    echo "Cleaning and copying fresh Dashboard build..."
    sudo rm -rf /var/www/html/dashboard/*
    sudo cp -r frontend/dashboard/dist/* /var/www/html/dashboard/
else
    echo "WARNING: frontend/dashboard/dist not found."
fi

# Fix permissions
sudo chown -R www-data:www-data /var/www/html
sudo chmod -R 755 /var/www/html

# Apply Nginx config
echo "=== Configuring Nginx ==="
sudo cp deploy/nginx.conf /etc/nginx/sites-available/default
sudo nginx -t
sudo systemctl reload nginx

echo "=== Successfully Deployed Widget & Dashboard! ==="
