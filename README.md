# 📱 Instagram Live Monitor

24/7 Instagram直播監控工具，當指定用戶開始直播時自動發送Discord通知。

## ✨ 核心功能

- 🤖 **Playwright 自動化** - 使用瀏覽器自動化技術監控Instagram
- 🔴 **實時直播檢測** - 每分鐘檢查目標用戶的直播狀態
- 🍪 **Cookie 管理** - 支持cookie持久化，避免重複登入
- 🎭 **反檢測機制** - 模擬真實用戶行為，防止被識別為機器人
- 💬 **Discord 通知** - 直播狀態變化時發送美觀的Discord消息
- 🔄 **健康檢查** - 自動監控系統狀態並恢復
- 🐳 **Docker 支持** - 完全容器化，支持Koyeb等平台部署
- 🌐 **Web 面板** - 提供簡潔的監控面板和API接口

## 🚀 快速開始

### 1. 克隆倉庫
```bash
git clone https://github.com/AibaWai/instagram-live-monitor.git
cd instagram-live-monitor
```

### 2. 安裝依賴
```bash
npm install
```

### 3. 運行設置嚮導
```bash
npm run setup
```

### 4. 啟動監控
```bash
npm start
```

## 🛠️ 配置說明

### Discord Bot 設置

1. 前往 [Discord Developer Portal](https://discord.com/developers/applications)
2. 創建新應用程序並獲取Bot Token
3. 邀請Bot到你的伺服器並獲取頻道ID

### Instagram Cookies 設置

由於Instagram沒有公開API且需要2FA驗證，你需要提供已登入的cookies：

**方法1: 使用設置嚮導（推薦）**
```bash
npm run setup
# 選擇選項1進行手動登入
```

**方法2: 手動提供cookies文件**
將你的Instagram cookies保存為 `cookies.json` 格式：
```json
[
  {
    "name": "sessionid",
    "value": "your_session_id",
    "domain": ".instagram.com",
    "path": "/",
    "secure": true,
    "httpOnly": true
  }
]
```

### 配置文件 (config.json)
```json
{
  "targets": ["username1", "username2"],
  "discord": {
    "token": "your_discord_bot_token",
    "channelId": "your_discord_channel_id"
  },
  "checkInterval": 60000,
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}
```

## 🐳 Docker 部署

### 本地運行
```bash
# 構建鏡像
docker build -t ig-live-monitor .

# 運行容器
docker run -d \
  --name ig-monitor \
  -p 3000:3000 \
  -v $(pwd)/config.json:/app/config.json:ro \
  -v $(pwd)/cookies.json:/app/cookies.json:ro \
  ig-live-monitor
```

### Koyeb 部署

1. **準備GitHub倉庫**
   - Fork這個項目到你的GitHub
   - 確保 `config.json` 和 `cookies.json` 已正確配置

2. **設置Koyeb**
   - 註冊 [Koyeb](https://www.koyeb.com/) 帳戶
   - 連接你的GitHub倉庫
   - 選擇Dockerfile構建方式
   - 配置環境變量：
     ```
     DISCORD_TOKEN=your_bot_token
     DISCORD_CHANNEL_ID=your_channel_id
     ```

3. **部署設置**
   - 選擇 **Free** 計劃
   - 設置端口：`3000`
   - 選擇地區（建議選擇離你較近的）

4. **保持24/7運行**
   - 使用 [UptimeRobot](https://uptimerobot.com/) 
   - 設置HTTP監控，每5分鐘ping你的Koyeb URL
   - 這樣可以防止容器因為閒置而休眠

## 📊 監控面板

部署後訪問 `https://your-app-url.koyeb.app/` 查看監控面板

### API 端點

- `GET /` - 監控面板
- `GET /health` - 健康檢查
- `GET /status` - 詳細狀態
- `POST /start` - 啟動監控
- `POST /stop` - 停止監控  
- `POST /restart` - 重啟監控

## 🔧 進階配置

### 環境變量支持
```bash
DISCORD_TOKEN=your_token
DISCORD_CHANNEL_ID=your_channel_id
CONFIG='{"targets":["user1","user2"]}'
NODE_ENV=production
PORT=3000
```

### 自定義檢查間隔
```json
{
  "checkInterval": 120000,  // 2分鐘檢查一次
  "healthCheckInterval": 300000  // 5分鐘健康檢查
}
```

### 反檢測設置
```json
{
  "instagram": {
    "activityInterval": 300000,  // 用戶活動模擬間隔
    "pageTimeout": 30000,       // 頁面載入超時
    "loginRetries": 3           // 登入重試次數
  }
}
```

## 🐛 故障排除

### 常見問題

1. **登入失效**
   ```bash
   # 重新獲取cookies
   npm run setup
   ```

2. **Discord通知失效**
   - 檢查Bot權限
   - 確認頻道ID正確
   - 驗證Token有效性

3. **監控停止工作**
   - 查看日誌輸出
   - 使用 `/restart` 端點重啟
   - 檢查網絡連接

### 日誌查看
```bash
# 本地運行
npm start

# Docker運行
docker logs ig-monitor -f
```

## 📝 更新日誌

### v1.0.0
- ✅ 基礎直播監控功能
- ✅ Discord通知集成
- ✅ Cookie管理系統
- ✅ Docker支持
- ✅ Web監控面板
- ✅ Koyeb部署支持

## 🤝 貢獻指南

1. Fork 項目
2. 創建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打開 Pull Request

## 📄 許可證

本項目基於 MIT 許可證 - 查看 [LICENSE](LICENSE) 文件了解詳情

## ⚠️ 免責聲明

本工具僅用於教育和個人用途。使用時請遵守Instagram的服務條款和相關法律法規。

## 🆘 支持

如果遇到問題或有功能建議：

- 📧 提交 [GitHub Issue](https://github.com/AibaWai/instagram-live-monitor/issues)
- 💬 參考已有的討論和解決方案

---

⭐ 如果這個項目對你有幫助，請給個星星！