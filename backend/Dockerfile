FROM mcr.microsoft.com/playwright:v1.51.0-noble

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
