#!/bin/bash
# ===========================================================
# Deploy Widget + Dashboard to AWS S3
# Prerequisites:
#   - AWS CLI installed: https://aws.amazon.com/cli/
#   - aws configure (set your Access Key ID + Secret)
#   - Two S3 buckets created with static website hosting enabled
#
# Usage:
#   BACKEND_URL=http://YOUR_EC2_IP:5000 ./deploy/deploy_frontends.sh
# ===========================================================

set -e

BACKEND_URL="${BACKEND_URL:-http://localhost:5000}"
DASHBOARD_BUCKET="${DASHBOARD_BUCKET:-salesbot-dashboard}"
WIDGET_BUCKET="${WIDGET_BUCKET:-salesbot-widget}"

echo "===== Deploying frontends ====="
echo "Backend URL: $BACKEND_URL"
echo "Dashboard bucket: $DASHBOARD_BUCKET"
echo "Widget bucket: $WIDGET_BUCKET"
echo ""

# Build & deploy Dashboard
echo "[1/2] Building Dashboard..."
cd frontend/dashboard
VITE_BACKEND_URL="$BACKEND_URL" npm run build
echo "[1/2] Uploading Dashboard to S3..."
aws s3 sync dist/ "s3://$DASHBOARD_BUCKET" --delete
echo "[1/2] Dashboard deployed!"
cd ../..

# Build & deploy Widget
echo "[2/2] Building Widget..."
cd frontend/widget
VITE_BACKEND_URL="$BACKEND_URL" npm run build
echo "[2/2] Uploading Widget to S3..."
aws s3 sync dist/ "s3://$WIDGET_BUCKET" --delete
echo "[2/2] Widget deployed!"
cd ../..

echo ""
echo "===== Done! ====="
echo "Dashboard: http://$DASHBOARD_BUCKET.s3-website-YOUR_REGION.amazonaws.com"
echo "Widget:    http://$WIDGET_BUCKET.s3-website-YOUR_REGION.amazonaws.com"
echo ""
echo "Remember to update ALLOWED_ORIGINS in your backend .env with the CloudFront URLs."
