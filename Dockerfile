# 使用Node.js 18官方映像
FROM node:18

# 設定工作目錄
WORKDIR /app

# 複製app資料夾內的所有內容到容器的/app目錄
COPY app/ .

# 安裝依賴
RUN npm install

# 暴露端口（Koyeb需要）
EXPOSE 3000

# 設置環境變數
ENV NODE_ENV=production

# 啟動應用 - 使用exec form確保信號正確處理
ENTRYPOINT ["node", "index.js"]