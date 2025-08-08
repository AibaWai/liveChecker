## 必須環境変数
- IG_USERS: 監視するユーザー名（カンマ区切り）例: `user1,user2`
- DISCORD_WEBHOOK_URL: Discord のチャンネル Webhook URL

## 任意環境変数
- CHECK_INTERVAL_MS: デフォルト 60000（1 分）
- HEADLESS: `true` / `false`（デフォルト true）
- USER_AGENT: 上書きしたい場合に設定
- IG_STORAGE_STATE_B64: Playwright storageState.json を Base64 で渡す（推奨）
- IG_COOKIES_JSON: Cookie 配列(JSON)を直接渡す（storageState がなければ利用）
- EXTRA_LIVE_LOCATORS: `["css or text or xpath", "..."]` の JSON 配列で追加ロケータ
- LOG_LEVEL: `info` / `debug` 等

## 認証の渡し方（例）
# ローカルで storageState を作る
node -e "const fs=require('fs'); const p=process.argv[1]; console.log(Buffer.from(fs.readFileSync(p)).toString('base64'))" storageState.json

# 出力された Base64 を IG_STORAGE_STATE_B64 に設定

## Discord Webhook
Discord サーバー > チャンネル設定 > Integrations > Webhooks > New Webhook で URL を取得して DISCORD_WEBHOOK_URL に設定。
