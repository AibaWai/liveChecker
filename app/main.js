const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const https = require('https');
const fs = require('fs');

// Environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const TARGET_USERNAME = process.env.TARGET_USERNAME;

// Instagram Session Data (Required for login)
const IG_USERNAME = process.env.IG_USERNAME;
const IG_PASSWORD = process.env.IG_PASSWORD;
const IG_SESSION_ID = process.env.IG_SESSION_ID;
const IG_CSRF_TOKEN = process.env.IG_CSRF_TOKEN;
const IG_DS_USER_ID = process.env.IG_DS_USER_ID;

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let sessionData = {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
    cookies: '',
    csrfToken: '',
    userId: '',
    isLoggedIn: false,
    loginRetries: 0
};

let monitoringState = {
    isLiveNow: false,
    lastCheckTime: null,
    consecutiveErrors: 0,
    lastSuccessfulCheck: null,
    detectionHistory: []
};

function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const defaultHeaders = {
            'User-Agent': sessionData.userAgent,
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'X-Requested-With': 'XMLHttpRequest',
            'X-IG-App-ID': '936619743392459',
            'X-Instagram-AJAX': '1',
            'X-CSRFToken': sessionData.csrfToken,
            'Cookie': sessionData.cookies
        };

        const requestOptions = {
            method: options.method || 'GET',
            headers: { ...defaultHeaders, ...options.headers },
            timeout: 20000
        };

        const req = https.request(url, requestOptions, (res) => {
            let data = [];
            
            res.on('data', (chunk) => data.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(data);
                resolve({ 
                    statusCode: res.statusCode, 
                    data: buffer.toString('utf8'),
                    headers: res.headers
                });
            });
        });
        
        req.on('error', reject);
        req.setTimeout(20000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

async function sendDiscordMessage(content, isEmbed = false) {
    try {
        const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
        
        if (isEmbed) {
            await channel.send({ embeds: [content] });
        } else {
            if (content.length > 1900) {
                content = content.substring(0, 1900) + '...(truncated)';
            }
            await channel.send(content);
        }
    } catch (error) {
        console.error('Failed to send Discord message:', error);
    }
}

// Initialize Instagram Session
async function initializeSession() {
    console.log('\n🔐 Initializing Instagram session...');
    
    // Method 1: Use provided session data
    if (IG_SESSION_ID && IG_CSRF_TOKEN && IG_DS_USER_ID) {
        console.log('✅ Using provided session data');
        sessionData.cookies = `sessionid=${IG_SESSION_ID}; csrftoken=${IG_CSRF_TOKEN}; ds_user_id=${IG_DS_USER_ID}; ig_did=A1B2C3D4-E5F6-7G8H-9I0J-K1L2M3N4O5P6; ig_nrcb=1; mid=Y1Z2A3B4-C5D6-E7F8-G9H0-I1J2K3L4M5N6`;
        sessionData.csrfToken = IG_CSRF_TOKEN;
        sessionData.userId = IG_DS_USER_ID;
        sessionData.isLoggedIn = true;
        
        // Verify session
        const isValid = await verifySession();
        if (isValid) {
            console.log('✅ Session verified successfully');
            return true;
        } else {
            console.log('❌ Provided session is invalid, attempting login...');
            sessionData.isLoggedIn = false;
        }
    }
    
    // Method 2: Attempt login
    if (IG_USERNAME && IG_PASSWORD) {
        return await attemptLogin();
    }
    
    console.log('❌ No valid session data or credentials provided');
    return false;
}

async function verifySession() {
    try {
        const response = await makeRequest('https://www.instagram.com/accounts/edit/');
        return response.statusCode === 200 && response.data.includes('"viewer"');
    } catch (error) {
        console.log('Session verification failed:', error.message);
        return false;
    }
}

async function attemptLogin() {
    console.log('🔑 Attempting Instagram login...');
    
    try {
        // Step 1: Get login page to extract CSRF token
        console.log('📄 Getting login page...');
        const loginPageResponse = await makeRequest('https://www.instagram.com/accounts/login/');
        
        if (loginPageResponse.statusCode !== 200) {
            throw new Error(`Login page request failed: ${loginPageResponse.statusCode}`);
        }
        
        // Extract CSRF token from login page
        const csrfMatch = loginPageResponse.data.match(/"csrf_token":"([^"]+)"/);
        if (!csrfMatch) {
            throw new Error('Could not extract CSRF token from login page');
        }
        
        const csrfToken = csrfMatch[1];
        console.log('✅ Extracted CSRF token');
        
        // Extract cookies from response
        const setCookieHeaders = loginPageResponse.headers['set-cookie'] || [];
        let cookies = '';
        setCookieHeaders.forEach(cookieHeader => {
            if (cookieHeader.includes('csrftoken=')) {
                cookies += cookieHeader.split(';')[0] + '; ';
            }
            if (cookieHeader.includes('mid=')) {
                cookies += cookieHeader.split(';')[0] + '; ';
            }
            if (cookieHeader.includes('ig_did=')) {
                cookies += cookieHeader.split(';')[0] + '; ';
            }
        });
        
        // Step 2: Attempt login
        console.log('🔐 Submitting login credentials...');
        
        const loginData = {
            username: IG_USERNAME,
            password: IG_PASSWORD,
            queryParams: {},
            optIntoOneTap: false
        };
        
        const loginResponse = await makeRequest('https://www.instagram.com/accounts/login/ajax/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-CSRFToken': csrfToken,
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://www.instagram.com/accounts/login/',
                'Cookie': cookies
            },
            body: new URLSearchParams(loginData).toString()
        });
        
        console.log(`Login response status: ${loginResponse.statusCode}`);
        
        if (loginResponse.statusCode === 200) {
            try {
                const loginResult = JSON.parse(loginResponse.data);
                
                if (loginResult.authenticated) {
                    console.log('✅ Login successful!');
                    
                    // Update session data with new cookies
                    const newCookies = loginResponse.headers['set-cookie'] || [];
                    let updatedCookies = cookies;
                    
                    newCookies.forEach(cookieHeader => {
                        if (cookieHeader.includes('sessionid=')) {
                            updatedCookies += cookieHeader.split(';')[0] + '; ';
                        }
                        if (cookieHeader.includes('ds_user_id=')) {
                            updatedCookies += cookieHeader.split(';')[0] + '; ';
                            const userIdMatch = cookieHeader.match(/ds_user_id=([^;]+)/);
                            if (userIdMatch) {
                                sessionData.userId = userIdMatch[1];
                            }
                        }
                    });
                    
                    sessionData.cookies = updatedCookies;
                    sessionData.csrfToken = csrfToken;
                    sessionData.isLoggedIn = true;
                    sessionData.loginRetries = 0;
                    
                    return true;
                } else {
                    console.log('❌ Login failed:', loginResult.message || 'Unknown error');
                    
                    if (loginResult.two_factor_required) {
                        console.log('⚠️ Two-factor authentication required. Please use session ID method instead.');
                    }
                    
                    return false;
                }
            } catch (e) {
                console.log('❌ Could not parse login response:', e.message);
                return false;
            }
        } else {
            console.log(`❌ Login request failed with status: ${loginResponse.statusCode}`);
            return false;
        }
        
    } catch (error) {
        console.error('❌ Login attempt failed:', error.message);
        sessionData.loginRetries++;
        return false;
    }
}

// Check user's live status using Instagram's internal API
async function checkUserLiveStatus() {
    console.log(`\n🔍 Checking live status for @${TARGET_USERNAME}...`);
    
    if (!sessionData.isLoggedIn) {
        console.log('❌ Not logged in to Instagram');
        return { success: false, error: 'Not logged in' };
    }
    
    try {
        // Method 1: Check user's reels/stories API for live status
        console.log('📡 Checking stories API...');
        const storiesResponse = await makeRequest(`https://i.instagram.com/api/v1/feed/reels_media/?reel_ids=${TARGET_USERNAME}`);
        
        if (storiesResponse.statusCode === 200) {
            try {
                const storiesData = JSON.parse(storiesResponse.data);
                
                if (storiesData.reels && storiesData.reels[TARGET_USERNAME]) {
                    const reel = storiesData.reels[TARGET_USERNAME];
                    
                    // Check if any story item is a live broadcast
                    const liveItems = reel.items?.filter(item => 
                        item.media_type === 4 || // Live video type
                        item.story_type === 'live' ||
                        item.broadcast_id
                    ) || [];
                    
                    if (liveItems.length > 0) {
                        console.log('🔴 Live broadcast found in stories!');
                        return {
                            success: true,
                            isLive: true,
                            method: 'Stories API',
                            confidence: 95,
                            broadcastInfo: liveItems[0]
                        };
                    }
                }
            } catch (e) {
                console.log('Could not parse stories response');
            }
        }
        
        // Method 2: Check user info API
        console.log('👤 Checking user info API...');
        const userInfoResponse = await makeRequest(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${TARGET_USERNAME}`);
        
        if (userInfoResponse.statusCode === 200) {
            try {
                const userInfo = JSON.parse(userInfoResponse.data);
                const user = userInfo.data?.user;
                
                if (user) {
                    // Check for live indicators
                    const isLive = user.is_live || 
                                  user.has_public_story || 
                                  (user.edge_owner_to_timeline_media?.edges?.some(edge => 
                                      edge.node?.media_type === 4
                                  ));
                    
                    console.log(`📊 User info: is_live=${user.is_live}, has_story=${user.has_public_story}`);
                    
                    return {
                        success: true,
                        isLive: isLive,
                        method: 'User Info API',
                        confidence: isLive ? 90 : 80,
                        userInfo: {
                            is_live: user.is_live,
                            has_story: user.has_public_story,
                            follower_count: user.edge_followed_by?.count
                        }
                    };
                }
            } catch (e) {
                console.log('Could not parse user info response');
            }
        }
        
        // Method 3: GraphQL query with session
        console.log('🔗 Trying GraphQL query...');
        const variables = {
            username: TARGET_USERNAME,
            include_reel: true
        };
        
        const graphqlResponse = await makeRequest(`https://www.instagram.com/graphql/query/?query_hash=d4d88dc1500312af6f937f7b804c68c3&variables=${encodeURIComponent(JSON.stringify(variables))}`);
        
        if (graphqlResponse.statusCode === 200) {
            try {
                const graphqlData = JSON.parse(graphqlResponse.data);
                const user = graphqlData.data?.user;
                
                if (user) {
                    const isLive = user.is_live || user.has_public_story;
                    
                    return {
                        success: true,
                        isLive: isLive,
                        method: 'GraphQL',
                        confidence: isLive ? 85 : 75,
                        graphqlInfo: {
                            is_live: user.is_live,
                            has_story: user.has_public_story
                        }
                    };
                }
            } catch (e) {
                console.log('Could not parse GraphQL response');
            }
        }
        
        // If we get here, no live status detected
        return {
            success: true,
            isLive: false,
            method: 'Multiple APIs',
            confidence: 70
        };
        
    } catch (error) {
        console.error('❌ Error checking live status:', error.message);
        
        // Check if we need to re-login
        if (error.message.includes('401') || error.message.includes('403')) {
            console.log('🔄 Session might be expired, attempting to refresh...');
            sessionData.isLoggedIn = false;
            const loginSuccess = await initializeSession();
            if (!loginSuccess) {
                return { success: false, error: 'Session expired and login failed' };
            }
        }
        
        return { success: false, error: error.message };
    }
}

// Discord Commands
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const content = message.content.toLowerCase().trim();
    
    if (content === '!login') {
        await message.reply('🔐 Attempting to initialize Instagram session...');
        const success = await initializeSession();
        
        const embed = new EmbedBuilder()
            .setTitle('Instagram Session Status')
            .setColor(success ? 0x00FF00 : 0xFF0000)
            .addFields(
                { name: '🔐 Login Status', value: success ? '✅ Success' : '❌ Failed', inline: true },
                { name: '👤 User ID', value: sessionData.userId || 'Not available', inline: true },
                { name: '🍪 Has Cookies', value: sessionData.cookies ? '✅ Yes' : '❌ No', inline: true }
            )
            .setTimestamp();
        
        await message.reply({ embeds: [embed] });
    }
    
    if (content === '!check' || content === '!live') {
        await message.reply('🔍 Checking Instagram live status (authenticated)...');
        
        const result = await checkUserLiveStatus();
        
        if (result.success) {
            const embed = new EmbedBuilder()
                .setTitle(`Instagram Live Check: @${TARGET_USERNAME}`)
                .setColor(result.isLive ? 0xFF0000 : 0x808080)
                .addFields(
                    { name: '🎯 Status', value: result.isLive ? '🔴 LIVE' : '⚫ Not Live', inline: true },
                    { name: '📊 Confidence', value: `${result.confidence}%`, inline: true },
                    { name: '🔬 Method', value: result.method, inline: true }
                )
                .setTimestamp();
            
            if (result.isLive) {
                embed.setURL(`https://www.instagram.com/${TARGET_USERNAME}/`);
                embed.setDescription('🔴 **User is currently live streaming!**');
            }
            
            // Add additional info if available
            if (result.broadcastInfo) {
                embed.addFields({ 
                    name: '📡 Broadcast Info', 
                    value: `ID: ${result.broadcastInfo.broadcast_id || 'N/A'}`, 
                    inline: false 
                });
            }
            
            await message.reply({ embeds: [embed] });
        } else {
            await message.reply(`❌ **Error**: ${result.error}\n\nTry using \`!login\` first to authenticate.`);
        }
    }
    
    if (content === '!status') {
        const embed = new EmbedBuilder()
            .setTitle('Monitor Status')
            .setColor(sessionData.isLoggedIn ? 0x00FF00 : 0xFF0000)
            .addFields(
                { name: '🎯 Target', value: `@${TARGET_USERNAME}`, inline: true },
                { name: '🔐 Login Status', value: sessionData.isLoggedIn ? '✅ Logged In' : '❌ Not Logged In', inline: true },
                { name: '📊 Current Status', value: monitoringState.isLiveNow ? '🔴 LIVE' : '⚫ Offline', inline: true },
                { name: '⏰ Last Check', value: monitoringState.lastCheckTime ? monitoringState.lastCheckTime.toLocaleString() : 'Never', inline: true },
                { name: '❌ Consecutive Errors', value: monitoringState.consecutiveErrors.toString(), inline: true }
            )
            .setTimestamp();
        
        await message.reply({ embeds: [embed] });
    }
    
    if (content === '!monitor') {
        if (!sessionData.isLoggedIn) {
            await message.reply('❌ **Error**: Not logged in to Instagram. Use `!login` first.');
            return;
        }
        
        await message.reply('🚀 Starting authenticated 24/7 monitoring...');
        startAuthenticatedMonitoring();
    }
    
    if (content === '!help') {
        const embed = new EmbedBuilder()
            .setTitle('🤖 Authenticated Instagram Live Monitor')
            .setDescription('Advanced detection system with Instagram login support')
            .addFields(
                { name: '!login', value: 'Initialize Instagram session', inline: true },
                { name: '!check', value: 'Check live status (requires login)', inline: true },
                { name: '!status', value: 'Check monitor and login status', inline: true },
                { name: '!monitor', value: 'Start 24/7 monitoring', inline: true },
                { name: '!help', value: 'Show this help', inline: true }
            )
            .addFields({ 
                name: '⚙️ Setup Required', 
                value: 'Set environment variables:\n`IG_SESSION_ID`, `IG_CSRF_TOKEN`, `IG_DS_USER_ID`\nor\n`IG_USERNAME`, `IG_PASSWORD`', 
                inline: false 
            })
            .setColor(0x00FF00)
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
});

// Authenticated 24/7 Monitoring
function startAuthenticatedMonitoring() {
    console.log('🚀 Starting authenticated 24/7 monitoring...');
    
    setInterval(async () => {
        try {
            if (!sessionData.isLoggedIn) {
                console.log('⚠️ Session lost, attempting to re-login...');
                const loginSuccess = await initializeSession();
                if (!loginSuccess) {
                    console.log('❌ Re-login failed, skipping this check');
                    monitoringState.consecutiveErrors++;
                    return;
                }
            }
            
            console.log('\n⏰ Scheduled authenticated live check...');
            const result = await checkUserLiveStatus();
            
            if (result.success) {
                // Check for status changes
                if (result.isLive && !monitoringState.isLiveNow) {
                    // Just went live!
                    monitoringState.isLiveNow = true;
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🔴 Instagram Live Alert!')
                        .setDescription(`**@${TARGET_USERNAME}** is now LIVE on Instagram!`)
                        .setColor(0xFF0000)
                        .setURL(`https://www.instagram.com/${TARGET_USERNAME}/`)
                        .addFields(
                            { name: '📊 Detection Confidence', value: `${result.confidence}%`, inline: true },
                            { name: '🔬 Detection Method', value: result.method, inline: true }
                        )
                        .setTimestamp()
                        .setThumbnail('https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Instagram_icon.png/64px-Instagram_icon.png');

                    await sendDiscordMessage(embed, true);
                    console.log('🔴 ALERT: User went LIVE!');
                    
                } else if (!result.isLive && monitoringState.isLiveNow) {
                    // Just went offline
                    monitoringState.isLiveNow = false;
                    
                    const embed = new EmbedBuilder()
                        .setTitle('⚫ Live Stream Ended')
                        .setDescription(`**@${TARGET_USERNAME}** has ended their Instagram Live stream.`)
                        .setColor(0x808080)
                        .setTimestamp();

                    await sendDiscordMessage(embed, true);
                    console.log('⚫ User went offline');
                } else {
                    console.log(`📊 Status unchanged: ${result.isLive ? '🔴 LIVE' : '⚫ Offline'} (${result.confidence}%)`);
                }
                
                monitoringState.consecutiveErrors = 0;
                monitoringState.lastSuccessfulCheck = new Date();
            } else {
                console.error('❌ Check failed:', result.error);
                monitoringState.consecutiveErrors++;
            }
            
            monitoringState.lastCheckTime = new Date();
            
            // Alert if too many consecutive errors
            if (monitoringState.consecutiveErrors >= 5) {
                await sendDiscordMessage(`⚠️ **Monitoring Alert**: ${monitoringState.consecutiveErrors} consecutive errors detected. Last error: ${result.error || 'Unknown'}`);
                monitoringState.consecutiveErrors = 0; // Reset to avoid spam
            }
            
        } catch (error) {
            console.error('❌ Error in monitoring loop:', error);
            monitoringState.consecutiveErrors++;
        }
    }, 2 * 60 * 1000); // Check every 2 minutes
}

client.once('ready', async () => {
    console.log(`✅ Authenticated Instagram Live Monitor ready as ${client.user.tag}!`);
    
    const embed = new EmbedBuilder()
        .setTitle('🤖 Authenticated Instagram Live Monitor Online')
        .setDescription(`Ready to monitor **@${TARGET_USERNAME}** with login support`)
        .addFields(
            { name: '🔐 Authentication', value: 'Supports session cookies or username/password', inline: false },
            { name: '💡 Getting Started', value: 'Use `!login` to authenticate, then `!monitor` to start', inline: false }
        )
        .setColor(0x00FF00)
        .setTimestamp();

    await sendDiscordMessage(embed, true);
    
    // Auto-initialize session if credentials are provided
    if (IG_SESSION_ID || IG_USERNAME) {
        console.log('🔄 Auto-initializing Instagram session...');
        const success = await initializeSession();
        
        if (success) {
            await sendDiscordMessage('✅ **Auto-login successful!** Use `!monitor` to start monitoring.');
            // Auto-start monitoring after successful login
            setTimeout(startAuthenticatedMonitoring, 3000);
        } else {
            await sendDiscordMessage('❌ **Auto-login failed.** Use `!login` to try again or check your credentials.');
        }
    } else {
        await sendDiscordMessage('⚠️ **No credentials provided.** Please set environment variables and use `!login`.');
    }
});

client.on('error', console.error);

client.login(DISCORD_TOKEN);