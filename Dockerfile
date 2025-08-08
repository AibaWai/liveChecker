FROM node:18-slim

# Install dependencies for Playwright
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    libgconf-2-4 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libcairo-gobject2 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrender1 \
    libxtst6 \
    libglib2.0-0 \
    libnss3 \
    libdrm2 \
    libxss1 \
    libgbm1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better caching
COPY app/package*.json ./

# Install npm dependencies
RUN npm install --only=production

# Install Playwright and browser
RUN npx playwright install chromium --with-deps

# Copy application code
COPY app/ .

# Create logs directory
RUN mkdir -p logs

# Expose port (for health checks)
EXPOSE 3000

# Run the application
CMD ["node", "index.js"]