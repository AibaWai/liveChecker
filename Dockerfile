# 使用官方 Playwright 基底（含瀏覽器與必要依賴）
FROM mcr.microsoft.com/playwright:v1.46.0-jammy

WORKDIR /app

# 先只拷貝 package.json，產生 lock 再 ci（避免沒有 lock 時失敗）
COPY package.json ./
RUN npm install --package-lock-only --no-audit --no-fund
RUN npm ci --no-audit --no-fund

# 複製其餘程式
COPY tsconfig.json ./
COPY src ./src

# 安裝瀏覽器依賴（確保版本對齊）
RUN npx playwright install --with-deps

# 編譯
RUN npm run build

# 預設環境
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
