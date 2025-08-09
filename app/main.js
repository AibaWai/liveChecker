const https = require('https');
const { Client, GatewayIntentBits } = require('discord.js');

class InstagramMobileAPI {
    constructor() {
        this.session = {
            userAgent: 'Instagram 302.0.0.23.113 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 492113219)',
            deviceId: this.generateDeviceId(),
            uuid: this.generateUUID(),
            sessionId: null,
            csrfToken: null
        };
    }
    
    generateDeviceId() {
        return 'android-' + Array.from({ length: 16 }, () => 
            Math.floor(Math.random() * 16).toString(16)
        ).join('');
    }
    
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    async makeRequest(endpoint, data = null) {
        const timestamp = Math.floor(Date.now() / 1000);
        
        const options = {
            hostname: 'i.instagram.com',
            path: `/api/v1/${endpoint}`,
            method: data ? 'POST' : 'GET',
            headers: {
                'User-Agent': this.session.userAgent,
                'X-IG-App-Locale': 'en_US',
                'X-IG-Device-Locale': 'en_US',
                'X-IG-Mapped-Locale': 'en_US',
                'X-Pigeon-Session-Id': this.session.uuid,
                'X-Pigeon-Rawclienttime': timestamp,
                'X-IG-Bandwidth-Speed-KBPS': '-1.000',
                'X-IG-Bandwidth-TotalBytes-B': '0',
                'X-IG-Bandwidth-TotalTime-MS': '0',
                'X-IG-App-Startup-Country': 'US',
                'X-Bloks-Version-Id': 'abcd1234567890abcdef1234567890abcdef1234',
                'X-IG-WWW-Claim': '0',
                'X-Bloks-Is-Layout-RTL': 'false',
                'X-IG-Device-ID': this.session.deviceId,
                'X-IG-Family-Device-ID': this.session.uuid,
                'X-IG-Android-ID': this.session.deviceId,
                'Accept-Language': 'en-US',
                'X-IG-Timezone-Offset': '0',
                'X-IG-Connection-Type': 'WIFI',
                'X-IG-Capabilities': '3brTvx8=',
                'X-IG-App-ID': '567067343352427',
                'Accept-Encoding': 'gzip, deflate',
                'Host': 'i.instagram.com',
                'X-FB-HTTP-Engine': 'Liger',
                'Connection': 'keep-alive'
            }
        };
        
        if (data) {
            options.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
            options.headers['Content-Length'] = Buffer.byteLength(data);
        }
        
        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let responseData = '';
                
                res.on('data', chunk => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(responseData);
                        resolve({
                            statusCode: res.statusCode,
                            data: parsed,
                            headers: res.headers
                        });
                    } catch (e) {
                        resolve({
                            statusCode: res.statusCode,
                            data: responseData,
                            headers: res.headers
                        });
                    }
                });
            });
            
            req.on('error', reject);
            req.setTimeout(30000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            
            if (data) {
                req.write(data);
            }
            
            req.end();
        });
    }
    
    async getUserInfo(username) {
        try {
            console.log(`🔍 Fetching user info for @${username}...`);
            
            const response = await this.makeRequest(`users/${username}/usernameinfo/`);
            
            if (response.statusCode === 200 && response.data.user) {
                const user = response.data.user;
                console.log(`✅ User found: ${user.username}`);
                console.log(`📊 User data keys: ${Object.keys(user).join(', ')}`);
                
                // Check for live status indicators
                const liveIndicators = [
                    'is_live',
                    'live_broadcast_id',
                    'broadcast_id',
                    'is_live_streaming',
                    'live_subscription_status'
                ];
                
                for (const indicator of liveIndicators) {
                    if (user[indicator] !== undefined) {
                        console.log(`📊 ${indicator}: ${user[indicator]}`);
                        if (user[indicator] === true || user[indicator] !== null) {
                            console.log('🔴 LIVE DETECTED via mobile API!');
                            return true;
                        }
                    }
                }
                
                // Check timeline media for live broadcasts
                if (user.timeline_media && user.timeline_media.edges) {
                    for (const edge of user.timeline_media.edges) {
                        if (edge.node && edge.node.media_type === 4) { // Live video
                            console.log('🔴 LIVE DETECTED in timeline media!');
                            return true;
                        }
                    }
                }
                
                console.log('⚫ No live indicators found in mobile API');
                return false;
                
            } else {
                console.log(`❌ Failed to get user info: ${response.statusCode}`);
                return false;
            }
            
        } catch (error) {
            console.error('❌ Error getting user info:', error);
            return false;
        }
    }
    
    async checkReels(username) {
        try {
            console.log(`🎬 Checking reels for @${username}...`);
            
            const response = await this.makeRequest(`clips/user/`);
            
            if (response.statusCode === 200 && response.data.items) {
                for (const item of response.data.items) {
                    if (item.media_type === 4 && item.video_versions) { // Live content
                        console.log('🔴 LIVE DETECTED in reels!');
                        return true;
                    }
                }
            }
            
            return false;
            
        } catch (error) {
            console.error('❌ Error checking reels:', error);
            return false;
        }
    }
}

// Usage example
const igAPI = new InstagramMobileAPI();

async function checkLiveStatusMobileAPI(username) {
    try {
        console.log(`\n🔍 === Checking @${username} live status (Mobile API) ===`);
        
        // Method 1: Check user info
        const userInfoLive = await igAPI.getUserInfo(username);
        if (userInfoLive) return true;
        
        // Method 2: Check reels/clips
        const reelsLive = await igAPI.checkReels(username);
        if (reelsLive) return true;
        
        console.log('⚫ Not live (Mobile API)');
        return false;
        
    } catch (error) {
        console.error('❌ Error in mobile API check:', error);
        return false;
    }
}

module.exports = { InstagramMobileAPI, checkLiveStatusMobileAPI };