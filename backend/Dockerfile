# ── Multi-stage Dockerfile for SalesBot Backend ──
# Stage 1: Full image with Playwright browsers (for local dev / single-server mode)
# Stage 2: Slim image without browsers (when using remote browser grid like Browserless)

# Use build arg to select mode: "local" (default) or "remote"
ARG BROWSER_MODE=local

# ── Stage: Local mode (includes Chromium for Playwright) ──
FROM mcr.microsoft.com/playwright:v1.61.1-noble AS local

WORKDIR /app

# Install dependencies first for better caching
COPY package.json package-lock.json* ./
RUN npm install

# Copy application code
COPY . .

# Expose backend port
EXPOSE 5000

# Start server
CMD ["npm", "start"]


# ── Stage: Remote mode (slim, no Chromium — connects to Browserless) ──
FROM node:20-slim AS remote

WORKDIR /app

# Install only the system deps needed for Playwright's WebSocket client
# (no browser binaries needed — they run on the remote grid)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Skip Playwright browser download since we connect remotely
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

EXPOSE 5000

CMD ["npm", "start"]


# ── Final stage: select based on BROWSER_MODE ──
FROM ${BROWSER_MODE} AS final
