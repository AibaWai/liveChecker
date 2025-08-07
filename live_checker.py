import requests
import os
from datetime import datetime

USERNAME = os.getenv("IG_USERNAME")
WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL")
TRIGGER_KEYWORD = os.getenv("TRIGGER_KEYWORD", "live over")

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def is_live(username):
    headers = {
        "User-Agent": "Mozilla/5.0"
    }
    url = f"https://www.instagram.com/{username}/?__a=1&__d=dis"
    try:
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code != 200:
            log(f"Instagram API 回應異常: {r.status_code}")
            return False
        data = r.json()
        user = data.get("graphql", {}).get("user", {})
        return user.get("is_live", False)
    except Exception as e:
        log(f"錯誤：{e}")
        return False

def send_discord_notification():
    data = { "content": TRIGGER_KEYWORD }
    r = requests.post(WEBHOOK_URL, json=data)
    if r.status_code == 204:
        log("✅ 發送成功：已通知 Discord")
    else:
        log(f"❌ 發送失敗 {r.status_code}: {r.text}")

if __name__ == "__main__":
    log(f"🔍 開始偵測 IG: {USERNAME}")
    if is_live(USERNAME):
        log("🚨 偵測到直播中！")
        send_discord_notification()
    else:
        log("🟢 尚未直播")
