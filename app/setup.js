const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');

class SetupWizard {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async askQuestion(question) {
        return new Promise((resolve) => {
            this.rl.question(question, (answer) => {
                resolve(answer.trim());
            });
        });
    }

    async setup() {
        console.log('🚀 Instagram Live Monitor 設置嚮導');
        console.log('=====================================\n');

        try {
            // 檢查配置文件
            await this.setupConfig();
            
            // 設置Instagram cookies
            await this.setupInstagramCookies();
            
            console.log('\n✅ 設置完成！');
            console.log('💡 提示: 運行 npm start 開始監控');
            
        } catch (error) {
            console.error('❌ 設置失敗:', error);
        } finally {
            this.rl.close();
        }
    }

    async setupConfig() {
        console.log('📝 配置設置');
        console.log('------------');

        const config = {
            targets: [],
            discord: {
                token: '',
                channelId: ''
            },
            checkInterval: 60000,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        // Discord設置
        config.discord.token = await this.askQuestion('請輸入Discord Bot Token: ');
        config.discord.channelId = await this.askQuestion('請輸入Discord頻道ID: ');

        // 監控目標設置
        console.log('\n🎯 設置監控目標');
        let addMore = true;
        while (addMore) {
            const username = await this.askQuestion('請輸入要監控的Instagram用戶名 (不包含@): ');
            if (username) {
                config.targets.push(username);
                console.log(`✅ 已添加: ${username}`);
            }
            
            const continueAdding = await this.askQuestion('是否繼續添加用戶？(y/n): ');
            addMore = continueAdding.toLowerCase() === 'y' || continueAdding.toLowerCase() === 'yes';
        }

        // 檢查間隔設置
        const intervalMinutes = await this.askQuestion('監控間隔（分鐘，預設1分鐘）: ') || '1';
        config.checkInterval = parseInt(intervalMinutes) * 60000;

        // 保存配置
        fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
        console.log('✅ 配置文件已保存');
    }

    async setupInstagramCookies() {
        console.log('\n🍪 Instagram Cookies 設置');
        console.log('---------------------------');
        
        const setupMethod = await this.askQuestion(
            '選擇Cookies設置方式:\n' +
            '1. 手動登入（推薦）\n' +
            '2. 導入現有cookies文件\n' +
            '3. 跳過（稍後手動設置）\n' +
            '請選擇 (1-3): '
        );

        switch (setupMethod) {
            case '1':
                await this.manualLogin();
                break;
            case '2':
                await this.importCookies();
                break;
            case '3':
                console.log('⚠️ 已跳過cookies設置，請稍後手動設置');
                break;
            default:
                console.log('❌ 無效選擇，已跳過cookies設置');
        }
    }

    async manualLogin() {
        console.log('🔐 啟動瀏覽器進行手動登入...');
        
        const browser = await chromium.launch({ 
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        
        try {
            await page.goto('https://www.instagram.com/accounts/login/');
            
            console.log('📱 請在打開的瀏覽器中登入Instagram');
            console.log('⚠️ 如果有2FA驗證，請完成驗證');
            
            await this.askQuestion('登入完成後按Enter繼續...');
            
            // 檢查是否成功登入
            await page.goto('https://www.instagram.com/');
            await page.waitForTimeout(3000);
            
            const loginButton = await page.$('a[href="/accounts/login/"]');
            if (loginButton) {
                console.log('❌ 登入失敗，請重試');
                return;
            }
            
            // 保存cookies
            const cookies = await page.context().cookies();
            fs.writeFileSync('./cookies.json', JSON.stringify(cookies, null, 2));
            
            console.log('✅ Cookies已保存');
            
        } catch (error) {
            console.error('❌ 登入過程出現錯誤:', error);
        } finally {
            await browser.close();
        }
    }

    async importCookies() {
        const cookiesPath = await this.askQuestion('請輸入cookies文件路徑: ');
        
        try {
            if (fs.existsSync(cookiesPath)) {
                const cookiesData = fs.readFileSync(cookiesPath, 'utf8');
                JSON.parse(cookiesData); // 驗證格式
                
                fs.copyFileSync(cookiesPath, './cookies.json');
                console.log('✅ Cookies文件已導入');
            } else {
                console.log('❌ 文件不存在');
            }
        } catch (error) {
            console.error('❌ 導入失敗:', error);
        }
    }

    async createEnvFile() {
        if (!fs.existsSync('./.env')) {
            const envContent = `# Discord配置
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CHANNEL_ID=your_discord_channel_id_here

# 可選：JSON格式的完整配置
CONFIG={}

# 運行環境
NODE_ENV=production
PORT=3000
`;
            fs.writeFileSync('./.env', envContent);
            console.log('✅ .env文件已創建');
        }
    }
}

// 主程序
async function main() {
    const wizard = new SetupWizard();
    await wizard.setup();
    process.exit(0);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = SetupWizard;