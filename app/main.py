# main.py
import asyncio
import aiohttp
import discord
from discord.ext import commands, tasks
import json
import random
import time
import os
from datetime import datetime
import logging
from instagrapi import Client
from instagrapi.exceptions import LoginRequired, PleaseWaitFewMinutes, ChallengeRequired

# 設定日誌
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class InstagramLiveMonitor:
    def __init__(self):
        # 從環境變量獲取配置
        self.discord_token = os.getenv('DISCORD_TOKEN')
        self.channel_id = int(os.getenv('CHANNEL_ID'))
        self.target_username = os.getenv('TARGET_USERNAME')
        self.ig_username = os.getenv('IG_USERNAME')  # Instagram登錄帳號
        self.ig_password = os.getenv('IG_PASSWORD')  # Instagram登錄密碼
        
        if not all([self.discord_token, self.channel_id, self.target_username]):
            raise ValueError("請設置所有必要的環境變量: DISCORD_TOKEN, CHANNEL_ID, TARGET_USERNAME")
        
        if not self.ig_username or not self.ig_password:
            logger.warning("未設置Instagram登錄信息，將使用無需登錄的方法（效果可能較差）")
        
        self.is_live = False
        self.session = None
        self.ig_client = None
        self.target_user_id = None
        self.bot = commands.Bot(command_prefix='!', intents=discord.Intents.default())
        
        # 用戶代理輪換 - 更新到最新版本
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0'
        ]
        
        logger.info(f"監控目標: {self.target_username}")
        logger.info(f"Discord頻道ID: {self.channel_id}")
        logger.info(f"Instagram登錄: {'已配置' if self.ig_username else '未配置（僅使用公開方法）'}")
    
    async def setup_instagram_client(self):
        """設置Instagram客戶端"""
        try:
            self.ig_client = Client()
            
            # 如果有登錄信息，嘗試登錄
            if self.ig_username and self.ig_password:
                try:
                    logger.info("嘗試登錄Instagram...")
                    self.ig_client.login(self.ig_username, self.ig_password)
                    logger.info("Instagram登錄成功！")
                    
                    # 獲取目標用戶ID
                    try:
                        user_info = self.ig_client.user_info_by_username(self.target_username)
                        self.target_user_id = user_info.pk
                        logger.info(f"獲取到用戶ID: {self.target_user_id}")
                    except Exception as e:
                        logger.error(f"獲取用戶ID失敗: {e}")
                        
                except ChallengeRequired as e:
                    logger.warning("Instagram要求驗證，將使用無登錄模式")
                    self.ig_client = None
                except LoginRequired as e:
                    logger.warning("Instagram登錄失敗，將使用無登錄模式")
                    self.ig_client = None
                except Exception as e:
                    logger.error(f"Instagram登錄出現未知錯誤: {e}")
                    self.ig_client = None
            else:
                logger.info("未提供Instagram登錄信息，使用無登錄模式")
                
        except Exception as e:
            logger.error(f"設置Instagram客戶端失敗: {e}")
            self.ig_client = None
    
    async def check_live_with_instagrapi(self):
        """使用instagrapi檢查直播狀態"""
        if not self.ig_client or not self.target_user_id:
            return None
            
        try:
            # 方法1: 檢查用戶的廣播
            broadcast = self.ig_client.user_broadcast(self.target_user_id)
            if broadcast:
                logger.info("通過instagrapi檢測到直播！")
                return True
                
            # 方法2: 檢查用戶的故事（可能包含直播）
            try:
                stories = self.ig_client.user_stories(self.target_user_id)
                for story in stories:
                    # 檢查故事是否為直播類型
                    if hasattr(story, 'media_type') and story.media_type == 'live':
                        return True
                    if hasattr(story, 'is_live') and story.is_live:
                        return True
            except Exception as e:
                logger.debug(f"檢查故事失敗: {e}")
                
            return False
            
        except PleaseWaitFewMinutes:
            logger.warning("Instagram要求等待，跳過本次檢查")
            return None
        except Exception as e:
            logger.error(f"instagrapi檢查直播失敗: {e}")
            return None
        """獲取隨機請求頭"""
        return {
            'User-Agent': random.choice(self.user_agents),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
            'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"'
        }
    
    async def check_instagram_profile(self):
        """檢查Instagram個人資料頁面"""
        try:
            headers = await self.get_random_headers()
            url = f"https://www.instagram.com/{self.target_username}/"
            
            async with self.session.get(url, headers=headers, timeout=30) as response:
                if response.status == 200:
                    html = await response.text()
                    
                    # 查找直播相關的關鍵字和JSON數據
                    live_indicators = [
                        '"is_live":true',
                        '"is_live_broadcast":true',
                        'broadcast_status":"active"',
                        'live_broadcast_id',
                        '"broadcast_id"',
                        'InstagramLive',
                        '"__typename":"GraphLiveVideo"'
                    ]
                    
                    html_lower = html.lower()
                    live_found = any(indicator.lower() in html_lower for indicator in live_indicators)
                    
                    if live_found:
                        logger.info("檢測到直播指示器")
                        return True
                    
                    # 檢查頁面標題是否包含LIVE
                    if 'live' in html_lower and self.target_username.lower() in html_lower:
                        # 進一步驗證
                        if any(word in html_lower for word in ['streaming', 'broadcast', 'going live']):
                            return True
                    
                    return False
                    
                elif response.status == 429:
                    logger.warning("被Instagram限制請求，等待更長時間...")
                    await asyncio.sleep(300)  # 等待5分鐘
                    return None
                else:
                    logger.warning(f"HTTP {response.status} when checking Instagram")
                    return None
                    
        except asyncio.TimeoutError:
            logger.warning("請求超時")
            return None
        except Exception as e:
            logger.error(f"檢查Instagram時發生錯誤: {e}")
            return None
    
    async def check_instagram_stories_api(self):
        """嘗試檢查Stories API（可能包含直播信息）"""
        try:
            headers = await self.get_random_headers()
            headers.update({
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': f'https://www.instagram.com/{self.target_username}/',
                'X-CSRFToken': 'dummy-token'  # 某些請求需要
            })
            
            # 嘗試獲取用戶信息
            url = f"https://i.instagram.com/api/v1/users/web_profile_info/?username={self.target_username}"
            
            async with self.session.get(url, headers=headers, timeout=30) as response:
                if response.status == 200:
                    try:
                        data = await response.json()
                        user_data = data.get('data', {}).get('user', {})
                        
                        # 檢查各種可能的直播狀態字段
                        live_fields = [
                            'is_live_broadcast',
                            'is_live', 
                            'live_broadcast_id',
                            'broadcast_id'
                        ]
                        
                        for field in live_fields:
                            if user_data.get(field):
                                logger.info(f"通過API檢測到直播 ({field})")
                                return True
                        
                        # 檢查highlight reels中的直播
                        highlight_reels = user_data.get('highlight_reels', [])
                        for reel in highlight_reels:
                            if reel.get('is_live') or reel.get('contains_live_video'):
                                return True
                        
                        return False
                        
                    except json.JSONDecodeError:
                        logger.warning("API響應不是有效的JSON")
                        return None
                        
                elif response.status == 429:
                    logger.warning("API請求被限制")
                    return None
                else:
                    logger.warning(f"API請求失敗: {response.status}")
                    return None
                    
        except Exception as e:
            logger.error(f"API檢查時發生錯誤: {e}")
            return None
    
    async def check_live_status(self):
        """檢查直播狀態的主方法"""
        # 方法優先級：instagrapi > web scraping
        methods = [
            ("InstagraPI", self.check_live_with_instagrapi),
            ("Web Scraping", self.check_instagram_profile),
            ("Stories API", self.check_instagram_stories_api)
        ]
        
        for method_name, method in methods:
            try:
                logger.info(f"嘗試方法: {method_name}")
                
                if method_name == "InstagraPI":
                    result = await method()
                else:
                    result = await method()
                
                if result is not None:
                    logger.info(f"方法 {method_name} 返回結果: {result}")
                    return result
                    
                # 方法間隨機延遲
                await asyncio.sleep(random.uniform(2, 5))
                
            except Exception as e:
                logger.error(f"方法 {method_name} 執行失敗: {e}")
                continue
        
        logger.warning("所有檢查方法都失敗了")
        return None
    
    async def send_discord_notification(self, is_starting_live):
        """發送Discord通知"""
        try:
            channel = self.bot.get_channel(self.channel_id)
            if not channel:
                logger.error(f"找不到Discord頻道ID: {self.channel_id}")
                return
                
            if is_starting_live:
                message = f"🔴 **{self.target_username}** 開始直播了！"
                embed = discord.Embed(
                    title="🔴 Instagram 直播通知",
                    description=f"**@{self.target_username}** 正在直播！",
                    color=0xE4405F,
                    timestamp=datetime.now()
                )
                embed.add_field(name="👤 用戶", value=f"@{self.target_username}", inline=True)
                embed.add_field(name="📱 狀態", value="🔴 直播中", inline=True)
                embed.add_field(
                    name="🔗 觀看", 
                    value=f"[點擊觀看](https://www.instagram.com/{self.target_username}/live/)", 
                    inline=False
                )
                embed.set_footer(text="Instagram Live Monitor • Powered by Koyeb")
                
                # 添加縮圖（如果可能）
                embed.set_thumbnail(url=f"https://www.instagram.com/{self.target_username}/")
                
                await channel.send(content=f"<@&役色ID> {message}", embed=embed)
                
            else:
                embed = discord.Embed(
                    title="⚫ 直播已結束",
                    description=f"**@{self.target_username}** 的直播已經結束了",
                    color=0x808080,
                    timestamp=datetime.now()
                )
                embed.set_footer(text="Instagram Live Monitor")
                await channel.send(embed=embed)
                
            logger.info(f"Discord通知已發送: {'開始' if is_starting_live else '結束'}直播")
            
        except Exception as e:
            logger.error(f"發送Discord通知時發生錯誤: {e}")
    
    @tasks.loop(minutes=1)
    async def monitor_loop(self):
        """主監控循環 - 每分鐘執行一次"""
        try:
            current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            logger.info(f"[{current_time}] 檢查 {self.target_username} 的直播狀態...")
            
            # 隨機延遲啟動，避免整點請求
            initial_delay = random.uniform(1, 10)
            await asyncio.sleep(initial_delay)
            
            current_live_status = await self.check_live_status()
            
            if current_live_status is None:
                logger.warning("無法獲取直播狀態，跳過本次檢查")
                return
            
            # 狀態變化檢測
            if current_live_status != self.is_live:
                if current_live_status:
                    logger.info(f"🔴 {self.target_username} 開始直播！")
                    await self.send_discord_notification(True)
                else:
                    logger.info(f"⚫ {self.target_username} 直播結束")
                    await self.send_discord_notification(False)
                
                self.is_live = current_live_status
            else:
                status_text = "🔴 直播中" if self.is_live else "⚫ 未直播"
                logger.info(f"{self.target_username} 狀態: {status_text}")
                
        except Exception as e:
            logger.error(f"監控循環中發生錯誤: {e}")
    
    async def setup_session(self):
        """設置HTTP會話"""
        connector = aiohttp.TCPConnector(
            limit=20,
            ttl_dns_cache=300,
            use_dns_cache=True,
            enable_cleanup_closed=True
        )
        
        timeout = aiohttp.ClientTimeout(total=45)
        self.session = aiohttp.ClientSession(
            connector=connector,
            timeout=timeout,
            cookie_jar=aiohttp.CookieJar()
        )
        
        logger.info("HTTP會話已設置")
    
    async def start_monitoring(self):
        """開始監控"""
        await self.setup_session()
        await self.setup_instagram_client()
        
        @self.bot.event
        async def on_ready():
            logger.info(f'🤖 Discord Bot已連接: {self.bot.user}')
            logger.info(f'📱 開始監控Instagram用戶: @{self.target_username}')
            logger.info(f'📢 通知頻道ID: {self.channel_id}')
            logger.info(f'⏰ 檢查間隔: 每1分鐘')
            logger.info(f'🔧 Instagram API: {"已登錄" if self.ig_client else "無登錄模式"}')
            
            # 發送啟動通知
            try:
                channel = self.bot.get_channel(self.channel_id)
                if channel:
                    embed = discord.Embed(
                        title="🚀 監控器已啟動",
                        description=f"正在監控 **@{self.target_username}** 的Instagram直播",
                        color=0x00FF00,
                        timestamp=datetime.now()
                    )
                    embed.add_field(name="⏱️ 檢查頻率", value="每1分鐘", inline=True)
                    embed.add_field(name="🌍 部署平台", value="Koyeb", inline=True)
                    embed.add_field(name="🔧 API模式", value="已登錄" if self.ig_client else "無登錄", inline=True)
                    embed.set_footer(text="使用 !status 查看狀態 | !check 手動檢查")
                    await channel.send(embed=embed)
            except Exception as e:
                logger.error(f"發送啟動通知失敗: {e}")
            
            # 啟動監控循環
            self.monitor_loop.start()
        
        @self.bot.event
        async def on_error(event, *args, **kwargs):
            logger.error(f"Discord Bot錯誤: {event}")
        
        @self.bot.command(name='status')
        async def status(ctx):
            """查看當前監控狀態"""
            status_text = "🔴 直播中" if self.is_live else "⚫ 未直播"
            uptime = datetime.now() - datetime.fromtimestamp(time.time() - 3600)  # 簡單的運行時間計算
            
            embed = discord.Embed(
                title="📊 監控狀態",
                description=f"正在監控: **@{self.target_username}**",
                color=0xE4405F,
                timestamp=datetime.now()
            )
            embed.add_field(name="📱 當前狀態", value=status_text, inline=True)
            embed.add_field(name="⏰ 檢查間隔", value="每1分鐘", inline=True)
            embed.add_field(name="🌍 部署平台", value="Koyeb", inline=True)
            embed.set_footer(text=f"Bot運行中 • 監控目標: @{self.target_username}")
            
            await ctx.send(embed=embed)
        
        @self.bot.command(name='check')
        async def manual_check(ctx):
            """手動檢查直播狀態"""
            embed = discord.Embed(
                title="🔄 正在檢查...",
                description="手動檢查直播狀態中，請稍候...",
                color=0xFFAA00
            )
            message = await ctx.send(embed=embed)
            
            try:
                status = await self.check_live_status()
                
                if status is None:
                    embed = discord.Embed(
                        title="❌ 檢查失敗",
                        description="無法獲取直播狀態，請稍後再試",
                        color=0xFF0000
                    )
                elif status:
                    embed = discord.Embed(
                        title="🔴 正在直播！",
                        description=f"**@{self.target_username}** 目前正在直播！",
                        color=0xFF0000
                    )
                    embed.add_field(
                        name="🔗 觀看直播",
                        value=f"[點擊這裡](https://www.instagram.com/{self.target_username}/live/)",
                        inline=False
                    )
                else:
                    embed = discord.Embed(
                        title="⚫ 未在直播",
                        description=f"**@{self.target_username}** 目前未直播",
                        color=0x808080
                    )
                
                embed.set_footer(text=f"檢查時間: {datetime.now().strftime('%H:%M:%S')}")
                await message.edit(embed=embed)
                
            except Exception as e:
                embed = discord.Embed(
                    title="❌ 檢查錯誤",
                    description=f"檢查時發生錯誤: {str(e)}",
                    color=0xFF0000
                )
                await message.edit(embed=embed)
        
        @self.bot.command(name='ping')
        async def ping(ctx):
            """檢查Bot延遲"""
            latency = round(self.bot.latency * 1000)
            embed = discord.Embed(
                title="🏓 Pong!",
                description=f"延遲: {latency}ms",
                color=0x00FF00
            )
            await ctx.send(embed=embed)
        
        try:
            logger.info("正在啟動Discord Bot...")
            await self.bot.start(self.discord_token)
        except KeyboardInterrupt:
            logger.info("收到中斷信號，正在停止...")
        except Exception as e:
            logger.error(f"Bot啟動失敗: {e}")
        finally:
            if self.session and not self.session.closed:
                await self.session.close()
                logger.info("HTTP會話已關閉")

async def main():
    """主函數"""
    try:
        logger.info("🚀 Instagram Live Monitor 啟動中...")
        logger.info("📦 運行環境: Docker on Koyeb")
        
        monitor = InstagramLiveMonitor()
        await monitor.start_monitoring()
        
    except ValueError as e:
        logger.error(f"配置錯誤: {e}")
        logger.error("請檢查環境變量設置")
    except Exception as e:
        logger.error(f"程序異常退出: {e}")
    finally:
        logger.info("程序已停止")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n程序被用戶中斷")
    except Exception as e:
        print(f"程序執行失敗: {e}")