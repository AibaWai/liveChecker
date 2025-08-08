'''
# Node.js的版本
FROM node:18

# 作業目錄設為 /app
WORKDIR /app

# app 資料夾內的內容複製到容器的 /app 
COPY app/ .

# 依賴關係的安裝
RUN npm install

# 端口開放（Koyeb用）
EXPOSE 3000

# 應用程式的啟動
CMD ["node", "index.js"]
'''

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

# app 資料夾內的內容複製到容器的 /app 
COPY app/ .

# Copy package files
COPY package*.json ./

# Install npm dependencies
RUN npm ci --only=production

# Install Playwright and browser
RUN npx playwright install chromium --with-deps

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose port (if needed for health checks)
EXPOSE 3000

# Run the application
CMD ["node", "index.js"]
