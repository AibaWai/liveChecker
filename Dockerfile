# 使用官方 Playwright 基底（含瀏覽器與必要依賴）
FROM mcr.microsoft.com/playwright:v1.46.0-jammy

WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

# 安裝瀏覽器依賴
RUN npx playwright install --with-deps

# 編譯
RUN npm run build

# 預設環境
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
