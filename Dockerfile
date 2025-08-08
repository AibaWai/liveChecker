# 使用官方 Python 映像
FROM python:3.9-slim

# 安裝系統依賴
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

# 安裝 Playwright 和依賴
RUN pip install playwright requests
RUN playwright install chromium

# 設置工作目錄
WORKDIR /app

# 複製應用程式檔案
COPY app/ .

# 運行腳本
CMD ["python", "main.py"]