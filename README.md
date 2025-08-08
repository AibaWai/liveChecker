# Instagram Live Monitor

24/7 Instagram直播監控機器人，當指定用戶開始直播時自動發送Discord通知。

## 功能特性

- 🔴 實時監控Instagram直播狀態
- 📱 即時Discord通知
- ⏰ 每分鐘自動檢查
- 🤖 Discord命令支持
- 🐳 Docker容器化部署
- 🌐 支持Koyeb免費部署

## Discord命令

- `!status` - 查看監控狀態
- `!check` - 手動檢查直播狀態
- `!ping` - 檢查機器人延遲

## 部署到 Koyeb

### 1. 準備工作

1. **創建Discord機器人**:
   - 前往 [Discord Developer Portal](https://discord.com/developers/applications)
   - 創建新應用程序並生成Bot Token
   - 邀請機器人到你的服務器

2. **獲取Discord頻道ID**:
   - 在Discord中啟用開發者模式
   - 右鍵點擊目標頻道 → 複製ID

### 2. GitHub設置

1. Fork或上傳此項目到你的GitHub倉庫
2. 確保倉庫是公開的（Koyeb免費版只支持公開倉庫）

### 3. Koyeb部署

1. 註冊 [Koyeb](https://www.koyeb.com/) 帳號

2. 創建新服務:
   - 選擇 "Deploy from GitHub"
   - 連接你的GitHub帳號
   - 選擇包含此項目的倉庫

3. 配置環境變量:
   ```
   DISCORD_TOKEN=你的Discord機器人Token
   CHANNEL_ID=你的Discord頻道ID
   TARGET_USERNAME=要監控的Instagram用戶名
   ```

4. 部署設置:
   - **Runtime**: Docker
   - **Port**: 8000
   - **Build Command**: (留空，使用Dockerfile)
   - **Run Command**: (留空，使用Dockerfile中的CMD)

5. 點擊 "Deploy" 開始部署

### 4. 驗證部署

- 檢查Koyeb控制台的部署日誌
- 在Discord中使用 `!status` 命令測試機器人
- 查看是否收到啟動通知

## 本地測試

1. 克隆倉庫:
   ```bash
   git clone <your-repo-url>
   cd instagram-live-monitor
   ```

2. 創建環境文件:
   ```bash
   cp .env.example .env
   # 編輯 .env 文件填入你的配置
   ```

3. 使用Docker運行:
   ```bash
   docker-compose up --build
   ```

## 注意事項

- ⚠️ 此工具僅供學習和個人使用
- 📝 Instagram可能會檢測和阻止自動化請求
- 🔄 需要定期更新以應對Instagram的變化
- 💰 Koyeb免費版有使用限制，請查看其定價頁面

## 故障排除

### 常見問題

1. **機器人無法連接**:
   - 檢查Discord Token是否正確
   - 確認機器人已邀請到服務器並有必要權限

2. **找不到頻道**:
   - 確認Channel ID正確
   - 檢查機器人是否有該頻道的查看和發送消息權限

3. **Instagram檢測失敗**:
   - Instagram可能正在阻止請求
   - 檢查目標用戶名是否正確且為公開帳號

4. **Koyeb部署失敗**:
   - 檢查環境變量是否正確設置
   - 查看部署日誌了解具體錯誤

### 日誌查看

在Koyeb控制台中查看服務日誌來診斷問題。

## 更新

要更新機器人:
1. 推送新代碼到GitHub倉庫
2. Koyeb會自動重新部署（如果啟用了自動部署）
3. 或在Koyeb控制台手動觸發重新部署

## 支持

如有問題，請查看日誌或在GitHub Issues中報告。

## License

MIT License - 請查看 LICENSE 文件了解詳情。