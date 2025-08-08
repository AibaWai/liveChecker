const express = require('express');
const path = require('path');
const InstagramLiveMonitor = require('./main.js');

const app = express();
const port = process.env.PORT || 3000;

let monitor = null;
let monitorStatus = {
    isRunning: false,
    startTime: null,
    lastCheck: null,
    totalChecks: 0,
    errors: 0,
    targets: []
};

// 中間件
app.use(express.json());
app.use(express.static('public'));

// 健康檢查端點
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        monitor: monitorStatus
    });
});

// 狀態端點
app.get('/status', (req, res) => {
    res.json({
        monitor: monitorStatus,
        system: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: process.version,
            platform: process.platform
        }
    });
});

// 啟動監控端點
app.post('/start', async (req, res) => {
    if (monitorStatus.isRunning) {
        return res.json({ 
            success: false, 
            message: 'Monitor is already running' 
        });
    }

    try {
        monitor = new InstagramLiveMonitor();
        await monitor.init();
        
        monitorStatus.isRunning = true;
        monitorStatus.startTime = new Date();
        monitorStatus.targets = monitor.config.targets;
        
        res.json({ 
            success: true, 
            message: 'Monitor started successfully' 
        });
    } catch (error) {
        console.error('Failed to start monitor:', error);
        monitorStatus.errors++;
        res.status(500).json({ 
            success: false, 
            message: 'Failed to start monitor',
            error: error.message
        });
    }
});

// 停止監控端點
app.post('/stop', async (req, res) => {
    if (!monitorStatus.isRunning) {
        return res.json({ 
            success: false, 
            message: 'Monitor is not running' 
        });
    }

    try {
        if (monitor) {
            await monitor.cleanup();
            monitor = null;
        }
        
        monitorStatus.isRunning = false;
        monitorStatus.startTime = null;
        
        res.json({ 
            success: true, 
            message: 'Monitor stopped successfully' 
        });
    } catch (error) {
        console.error('Failed to stop monitor:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to stop monitor',
            error: error.message
        });
    }
});

// 重啟監控端點
app.post('/restart', async (req, res) => {
    try {
        if (monitorStatus.isRunning && monitor) {
            await monitor.cleanup();
        }
        
        monitor = new InstagramLiveMonitor();
        await monitor.init();
        
        monitorStatus.isRunning = true;
        monitorStatus.startTime = new Date();
        monitorStatus.targets = monitor.config.targets;
        
        res.json({ 
            success: true, 
            message: 'Monitor restarted successfully' 
        });
    } catch (error) {
        console.error('Failed to restart monitor:', error);
        monitorStatus.errors++;
        res.status(500).json({ 
            success: false, 
            message: 'Failed to restart monitor',
            error: error.message
        });
    }
});

// 獲取配置端點
app.get('/config', (req, res) => {
    try {
        const config = monitor ? monitor.config : {};
        // 隱藏敏感信息
        const safeConfig = {
            ...config,
            discord: {
                ...config.discord,
                token: config.discord?.token ? '***隱藏***' : null
            }
        };
        res.json(safeConfig);
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to get config',
            message: error.message
        });
    }
});

// 日誌端點
app.get('/logs', (req, res) => {
    res.json({
        message: 'Log endpoint - implement based on your logging strategy',
        suggestion: 'Consider using winston or similar logging library'
    });
});

// 根路由 - 簡單的狀態頁面
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Instagram Live Monitor</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    max-width: 800px; 
                    margin: 0 auto; 
                    padding: 20px;
                    background-color: #f5f5f5;
                }
                .container {
                    background: white;
                    padding: 30px;
                    border-radius: 10px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .status {
                    padding: 10px;
                    border-radius: 5px;
                    margin: 10px 0;
                }
                .status.running { background-color: #d4edda; color: #155724; }
                .status.stopped { background-color: #f8d7da; color: #721c24; }
                .btn {
                    background-color: #007bff;
                    color: white;
                    padding: 10px 20px;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    margin: 5px;
                }
                .btn:hover { background-color: #0056b3; }
                .btn.danger { background-color: #dc3545; }
                .btn.danger:hover { background-color: #c82333; }
                .info { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 Instagram Live Monitor</h1>
                <div class="status ${monitorStatus.isRunning ? 'running' : 'stopped'}">
                    狀態: ${monitorStatus.isRunning ? '🟢 運行中' : '🔴 已停止'}
                </div>
                
                <div class="info">
                    <h3>📊 統計信息</h3>
                    <p><strong>啟動時間:</strong> ${monitorStatus.startTime || 'N/A'}</p>
                    <p><strong>監控目標:</strong> ${monitorStatus.targets.length} 個用戶</p>
                    <p><strong>系統運行時間:</strong> ${Math.floor(process.uptime())} 秒</p>
                    <p><strong>目標用戶:</strong> ${monitorStatus.targets.join(', ') || '未設置'}</p>
                </div>
                
                <div>
                    <button class="btn" onclick="startMonitor()">▶️ 啟動</button>
                    <button class="btn danger" onclick="stopMonitor()">⏹️ 停止</button>
                    <button class="btn" onclick="restartMonitor()">🔄 重啟</button>
                    <button class="btn" onclick="checkStatus()">📊 狀態</button>
                </div>
                
                <div id="result" style="margin-top: 20px;"></div>
            </div>

            <script>
                async function makeRequest(url, method = 'GET') {
                    try {
                        const response = await fetch(url, { method });
                        const data = await response.json();
                        document.getElementById('result').innerHTML = 
                            '<div class="info"><pre>' + JSON.stringify(data, null, 2) + '</pre></div>';
                        if (data.success !== false) {
                            setTimeout(() => location.reload(), 2000);
                        }
                    } catch (error) {
                        document.getElementById('result').innerHTML = 
                            '<div class="status stopped">錯誤: ' + error.message + '</div>';
                    }
                }

                function startMonitor() { makeRequest('/start', 'POST'); }
                function stopMonitor() { makeRequest('/stop', 'POST'); }
                function restartMonitor() { makeRequest('/restart', 'POST'); }
                function checkStatus() { makeRequest('/status'); }
            </script>
        </body>
        </html>
    `);
});

// 錯誤處理中間件
app.use((error, req, res, next) => {
    console.error('Express error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: error.message
    });
});

// 404處理
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: 'API endpoint not found'
    });
});

// 啟動服務器
const server = app.listen(port, () => {
    console.log(`🌐 HTTP服務器運行在端口 ${port}`);
    console.log(`📊 監控面板: http://localhost:${port}`);
    console.log(`🔍 健康檢查: http://localhost:${port}/health`);
    
    // 自動啟動監控（如果配置存在）
    setTimeout(async () => {
        try {
            if (!monitor && !monitorStatus.isRunning) {
                console.log('🚀 自動啟動Instagram監控...');
                monitor = new InstagramLiveMonitor();
                await monitor.init();
                monitorStatus.isRunning = true;
                monitorStatus.startTime = new Date();
                monitorStatus.targets = monitor.config.targets;
                console.log('✅ 監控已自動啟動');
            }
        } catch (error) {
            console.error('❌ 自動啟動失敗:', error);
            monitorStatus.errors++;
        }
    }, 3000);
});

// 優雅關閉
process.on('SIGINT', async () => {
    console.log('\n👋 正在關閉服務器...');
    
    if (monitor) {
        console.log('🛑 停止監控...');
        await monitor.cleanup();
    }
    
    server.close(() => {
        console.log('✅ 服務器已關閉');
        process.exit(0);
    });
});

module.exports = app;