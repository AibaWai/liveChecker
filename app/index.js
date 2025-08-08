// Instagram Live Monitor — Docker-friendly + multi-strategy detection
// 風險：可能違反 Instagram 條款；請自負風險（條款/未授權爬取說明見文末引用）。
import 'dotenv/config'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import fetch from 'node-fetch'
import playwright from 'playwright'
import { addExtra } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

const chromium = addExtra(playwright.chromium)
chromium.use(StealthPlugin()) // 減少簡單偵測（不是萬靈丹）

// ====== ENV ======
const IG_USERNAME = process.env.IG_USERNAME
const IG_PASSWORD = process.env.IG_PASSWORD
const TARGET_USERS = (process.env.TARGET_USERS || '').split(',').map(s => s.trim()).filter(Boolean)
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL
const STORAGE_DIR = process.env.STORAGE_DIR || './.storage'
const HEADLESS = (process.env.HEADLESS || 'true') === 'true'
const PROXY_URL = process.env.PROXY_URL || ''
const CHECK_AVG_SECONDS = Number(process.env.CHECK_AVG_SECONDS || 60)

// intervals with jitter (0.75x ~ 1.5x)
const MIN_INTERVAL_MS = Math.max(10, Math.floor(CHECK_AVG_SECONDS * 0.75)) * 1000
const MAX_INTERVAL_MS = Math.max(20, Math.floor(CHECK_AVG_SECONDS * 1.5)) * 1000

// ====== helpers ======
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const jitter = () => Math.floor(MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS))
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex')
const nowISO = () => new Date().toISOString()

async function notifyDiscord({ content, embeds }) {
  if (!DISCORD_WEBHOOK_URL) return
  await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, embeds })
  }).catch(()=>{})
}

function randomUA() {
  const chromes = ['125.0.0.0','124.0.0.0','123.0.0.0']
  const plats = ['Windows NT 10.0; Win64; x64','X11; Linux x86_64','Macintosh; Intel Mac OS X 10_15_7']
  const ver = chromes[Math.floor(Math.random()*chromes.length)]
  const plat = plats[Math.floor(Math.random()*plats.length)]
  return `Mozilla/5.0 (${plat}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver} Safari/537.36`
}

const TXT = {
  start: (u,p) => `📺 **${u}** 疑似正在 IG 直播（證據: \`${p}\`）\nhttps://www.instagram.com/${u}/live/`,
  ban: (r) => `⛔ 監看帳號可能被限制/停用：${r || 'unknown'}`,
  authLost: (r) => `🔒 登入失效或需要驗證（${r}）`,
  rateLimited: (n) => `⚠️ 10 分鐘內 429 次數：${n}（疑似被限速）`,
  heartbeat: '💓 監控心跳：系統仍在運作。'
}

// 嘗試偵測帳號問題（ban/checkpoint/密碼異常）
async function detectAccountProblems(page) {
  const html = await page.content()
  if (/your account has been disabled|we've suspended your account/i.test(html)) return 'disabled/suspended'
  if (/checkpoint required|confirm it's you|help us confirm/i.test(html)) return 'checkpoint/identity verification'
  if (/change your password|suspicious login attempt/i.test(html)) return 'password change / suspicious login'
  return null
}

// ---- LIVE 檢測策略 A：web_profile_info JSON（最準但不穩定） ----
// 參考：非公開 web 端點常需特定 header，例如 x-ig-app-id；社群文獻顯示該端點與 header 可能變動/失效。
// 來源：ScrapingDog 教學、SO 討論與多篇社群實務貼文（不保證穩定）。
// 風險：可能 401/403/429、需要正確 UA/區域/Headers。請加重試與退避。
async function tryWebProfileInfo(page, username) {
  try {
    const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`
    const res = await page.evaluate(async ({ url }) => {
      const headers = {
        'accept': '*/*',
        'x-ig-app-id': '936619743392459' // 依社群教學常見值，易變
      }
      const r = await fetch(url, { headers, method: 'GET', credentials: 'include' })
      const status = r.status
      let json = null
      try { json = await r.json() } catch {}
      return { status, json }
    }, { url })

    if (res?.status === 429) throw new Error('HTTP 429')
    if (res?.status && res.status >= 400) return { live: false, proof: `api_status_${res.status}` }

    const user = res?.json?.data?.user
    if (user) {
      // 常見線索（不保證一定存在）：is_live / live_broadcast_id / broadcast
      if (user.is_live === true) return { live: true, proof: 'api:is_live=true' }
      if (user.live_broadcast_id) return { live: true, proof: 'api:live_broadcast_id' }
      if (user.broadcast) return { live: true, proof: 'api:broadcast' }
    }
    return { live: false, proof: 'api:no_live_flag' }
  } catch (e) {
    const msg = String(e?.message || e)
    if (/429/.test(msg)) throw e
    return { live: false, proof: `api_error:${msg.slice(0,60)}` }
  }
}

// ---- LIVE 檢測策略 B：解析個人頁 HTML 內嵌 JSON ----
async function tryEmbeddedJson(page, username) {
  const profileUrl = `https://www.instagram.com/${username}/`
  const resp = await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const status = resp?.status() || 0
  if (status === 429) throw new Error('HTTP 429')
  if (status === 404) return { live: false, proof: 'html:404' }

  const html = await page.content()
  // 寬鬆擷取 key：is_live / has_live / live_broadcast
  const liveHit = /"is_live"\s*:\s*true|"has_live"\s*:\s*true|"live_broadcast/i.test(html)
  if (liveHit) return { live: true, proof: 'html:is_live' }
  return { live: false, proof: 'html:no_live_flag' }
}

// ---- LIVE 檢測策略 C：DOM 標記（LIVE 徽章等）----
async function tryDomBadge(page) {
  try {
    const badge = page.locator('text=LIVE').first()
    if (await badge.isVisible({ timeout: 1000 })) {
      return { live: true, proof: 'dom:LIVE_badge' }
    }
  } catch {}
  return { live: false, proof: 'dom:no_badge' }
}

async function checkUserLive(page, username) {
  // 策略 A
  const a = await tryWebProfileInfo(page, username)
  if (a.live) return { ...a, user: username }
  // 策略 B
  const b = await tryEmbeddedJson(page, username)
  if (b.live) return { ...b, user: username }
  // 策略 C（在 B 的頁面上直接檢）
  const c = await tryDomBadge(page)
  return { ...(c.live ? c : b), user: username } // 帶回最後的 proof
}

async function ensureLoggedIn(context) {
  const page = await context.newPage()
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' })
  await page.setUserAgent(randomUA())
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const already = await page.locator('a[href*="/accounts/edit/"], [aria-label*="profile"]').first().isVisible().catch(()=>false)
  if (already) { await page.close(); return 'ok' }

  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.fill('input[name="username"]', IG_USERNAME, { timeout: 30_000 })
  await page.fill('input[name="password"]', IG_PASSWORD, { timeout: 30_000 })
  await page.click('button[type="submit"]', { timeout: 30_000 })
  await page.waitForTimeout(5000)

  const problem = await detectAccountProblems(page)
  await page.close()
  if (problem) return problem
  return 'ok'
}

async function main() {
  if (!IG_USERNAME || !IG_PASSWORD || !DISCORD_WEBHOOK_URL || TARGET_USERS.length === 0) {
    console.error('請設定 IG_USERNAME, IG_PASSWORD, DISCORD_WEBHOOK_URL, TARGET_USERS')
    process.exit(1)
  }

  await fs.mkdir(STORAGE_DIR, { recursive: true })
  const storagePath = path.join(STORAGE_DIR, 'state.json')

  const ctxOpts = {}
  try { await fs.stat(storagePath); ctxOpts.storageState = storagePath } catch {}
  if (PROXY_URL) ctxOpts.proxy = { server: PROXY_URL }

  const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox'] })
  const context = await browser.newContext(ctxOpts)
  const saveState = async () => context.storageState({ path: storagePath }).catch(()=>{})

  const loginState = await ensureLoggedIn(context)
  if (loginState !== 'ok') {
    await notifyDiscord({ content: `🟡 ${TXT.authLost(loginState)}` })
  } else {
    await notifyDiscord({ content: `🟢 監控啟動：${TARGET_USERS.join(', ')}（${nowISO()}）` })
  }
  await saveState()

  const notified = new Set()
  const recent429 = []
  let lastHeartbeat = Date.now()

  while (true) {
    for (const user of TARGET_USERS) {
      const page = await context.newPage()
      try {
        await page.setUserAgent(randomUA())

        const r = await checkUserLive(page, user)

        const problem = await detectAccountProblems(page)
        if (problem) await notifyDiscord({ content: TXT.ban(problem) })

        if (r.live) {
          const key = `${user}:${sha1(r.proof)}`
          if (!notified.has(key)) {
            await notifyDiscord({ content: `${TXT.start(user, r.proof)} @ ${nowISO()}` })
            notified.add(key)
            if (notified.size > 200) notified.delete(notified.values().next().value)
          }
        }
      } catch (e) {
        const msg = String(e?.message || e)
        if (/429/.test(msg)) {
          recent429.push(Date.now())
        } else {
          console.error(`[${user}]`, msg)
        }
      } finally {
        await page.close().catch(()=>{})
        await sleep(500 + Math.random()*500)
      }
    }

    // 限流視窗與告警（10 分鐘）
    const now = Date.now()
    while (recent429.length && now - recent429[0] > 10*60*1000) recent429.shift()
    if (recent429.length >= 5) await notifyDiscord({ content: TXT.rateLimited(recent429.length) })

    // 每日心跳
    if (now - lastHeartbeat > 24*60*60*1000) {
      await notifyDiscord({ content: `${TXT.heartbeat}（${nowISO()}）` })
      lastHeartbeat = now
    }

    await saveState()
    const wait = jitter()
    console.log(`下一輪：${Math.round(wait/1000)}s`)
    await sleep(wait)
  }
}

main().catch(async (err) => {
  console.error(err)
  try {
    await notifyDiscord({ content: `🔴 監控程序崩潰：${'```'}\n${String(err)}\n${'```'}` })
  } finally {
    process.exit(1)
  }
})
