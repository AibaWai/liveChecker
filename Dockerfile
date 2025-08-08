FROM mcr.microsoft.com/playwright:v1.46.0-jammy

WORKDIR /usr/src/app
COPY app ./app
COPY app/package.json ./

RUN npm ci --omit=dev || npm i --omit=dev

# 健康チェック用ポート
EXPOSE 3000

# Koyeb のヘルスチェックで利用
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
