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