#!/bin/bash
set -e

echo "=== Deploying Frontends to /var/www/html ==="

sudo mkdir -p /var/www/html/widget
sudo mkdir -p /var/www/html/dashboard

# Copy widget dist
if [ -d "frontend/widget/dist" ]; then
    echo "Copying Widget build..."
    sudo cp -r frontend/widget/dist/* /var/www/html/widget/
else
    echo "WARNING: frontend/widget/dist not found."
fi

# Copy dashboard dist
if [ -d "frontend/dashboard/dist" ]; then
    echo "Copying Dashboard build..."
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
