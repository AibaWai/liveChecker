# Playwright 官方 Docker 基底，內建瀏覽器相依
# 版本號請與你的 package.json 中的 playwright 版本對齊
FROM mcr.microsoft.com/playwright:v1.54.0-noble

WORKDIR /app

# 先拷貝鎖檔以利快取
COPY app/package.json app/package-lock.json* ./
RUN npm ci --omit=dev

# 拷貝程式碼
COPY app/ ./

# 安裝 Chromium 與相依（基底已備好系統依賴）
RUN npx playwright install --with-deps chromium

# 以非 root 執行（基底映像已內建 pwuser）
USER pwuser

# Worker 類型不需要對外 Port；移除 EXPOSE
CMD ["node", "index.js"]
