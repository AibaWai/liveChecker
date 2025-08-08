from playwright.sync_api import sync_playwright
import time
import requests
import os
import json

# 環境變數
INSTAGRAM_USERNAME = os.getenv("INSTAGRAM_USERNAME")
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL")
SESSIONID = os.getenv("SESSIONID")
CSRFTOKEN = os.getenv("CSRFTOKEN")
DS_USER_ID = os.getenv("DS_USER_ID")

def send_discord_notification(message):
    """發送 Discord 通知"""
    payload = {"content": message}
    response = requests.post(DISCORD_WEBHOOK_URL, json=payload)
    if response.status_code != 204:
        print(f"Discord 通知發送失敗：{response.text}")

def check_instagram_live(page, username):
    """檢查 Instagram 直播狀態"""
    # 訪問用戶頁面
    page.goto(f"https://www.instagram.com/{username}/", timeout=60000)
    
    # 檢查是否被重定向到登錄頁面
    if "/accounts/login/" in page.url:
        send_discord_notification("Instagram Cookies 已失效，請手動更新！")
        return False, True  # (直播狀態, 是否需要更新 Cookies)

    # 檢查直播標誌（使用穩定的選擇器）
    try:
        # 假設直播標誌是一個帶有 "LIVE" 文字的元素，根據實際 DOM 調整
        live_indicator = page.query_selector('text="LIVE"') or \
                         page.query_selector('span[class*="live"]') or \
                         page.query_selector('div[aria-label*="live"]')
        is_live = live_indicator is not None
        return is_live, False
    except Exception as e:
        print(f"檢查直播狀態時出錯：{e}")
        return False, False

def main():
    last_live_status = False
    cookies_invalid_notified = False  # 避免重複通知 Cookies 失效

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        )

        # 設置 Cookies
        cookies = [
            {"name": "sessionid", "value": SESSIONID, "domain": ".instagram.com", "path": "/"},
            {"name": "csrftoken", "value": CSRFTOKEN, "domain": ".instagram.com", "path": "/"},
            {"name": "ds_user_id", "value": DS_USER_ID, "domain": ".instagram.com", "path": "/"}
        ]
        context.add_cookies(cookies)
        page = context.new_page()

        while True:
            try:
                is_live, cookies_invalid = check_instagram_live(page, INSTAGRAM_USERNAME)
                
                # 處理 Cookies 失效
                if cookies_invalid and not cookies_invalid_notified:
                    print("Cookies 失效，已發送通知")
                    cookies_invalid_notified = True
                elif not cookies_invalid:
                    cookies_invalid_notified = False  # 重置通知狀態

                # 處理直播狀態
                if is_live and not last_live_status:
                    send_discord_notification(f"{INSTAGRAM_USERNAME} 正在 Instagram 直播！")
                    print(f"{INSTAGRAM_USERNAME} 直播開始，已發送通知！")
                elif not is_live and last_live_status:
                    print(f"{INSTAGRAM_USERNAME} 直播結束。")
                
                last_live_status = is_live
            except Exception as e:
                print(f"錯誤：{e}")
                send_discord_notification(f"腳本運行錯誤：{str(e)}")
            
            time.sleep(60)  # 每 60 秒檢查一次

        browser.close()

if __name__ == "__main__":
    main()