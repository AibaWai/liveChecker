# 使用Node.js 18官方映像
FROM node:18-slim

# 設定工作目錄
WORKDIR /app

# 複製package.json和package-lock.json
COPY package*.json ./

# 安裝依賴
RUN npm ci --only=production

# 複製應用程式碼
COPY . .

# 創建非root用戶
RUN useradd -m -u 1001 botuser && chown -R botuser:botuser /app
USER botuser

# 暴露端口（如果需要HTTP健康檢查）
EXPOSE 3000

# 啟動應用
CMD ["npm", "start"]