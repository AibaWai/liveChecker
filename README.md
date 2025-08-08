# Instagram Live Monitor (Playwright + Discord)

每 60 秒監控一個 IG 帳號是否開啟直播；偵測到就透過 Discord Webhook 通知。支援：
- ✅ Playwright 自動化
- ✅ 多策略 LIVE 偵測（選擇器備援）
- ✅ Cookie 匯入（2FA 後 session）
- ✅ 用戶活動模擬（降低自動化指紋）
- ✅ 健康檢查 `/health`
- ✅ Docker 一鍵部署（Koyeb OK）

> 風險與條款：請先自行評估法務風險與 IG 條款限制後再使用。此專案僅供學習與個人用途。

## 環境變數
參考 `.env.example`。至少要設定：
- `TARGET_USERNAME`
- `DISCORD_WEBHOOK_URL`
- `COOKIES_JSON` 或掛載 `/app/cookies.json`

## 本機開發
```bash
npm install
npm run build
npm start
# or
npm run dev
