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

# 啟動應用
CMD ["node", "index.js"]