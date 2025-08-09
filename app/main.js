// Enhanced detection logic to add to your main.js

function checkHTMLForLiveStatus(html) {
    console.log('\n🔍 === Enhanced Live Detection Analysis ===');
    
    // Method 1: 更廣泛的直播關鍵詞檢測
    const liveKeywords = [
        // 中文
        '直播', '正在直播', '現在直播', '直播中',
        // 英文
        'LIVE', 'Live', 'live', 'Live now', 'Going live', 'Now live',
        // 其他語言
        'En vivo', 'En directo', 'Live stream', 'Broadcasting',
        // Instagram 特定
        'instagram live', 'ig live', 'live video'
    ];
    
    console.log('📝 Keyword detection:');
    let foundKeywords = [];
    
    liveKeywords.forEach(keyword => {
        const regex = new RegExp(keyword, 'gi');
        const matches = html.match(regex);
        if (matches) {
            foundKeywords.push({ keyword, count: matches.length });
            console.log(`   ✅ "${keyword}": ${matches.length} matches`);
            
            // 顯示上下文
            const contextRegex = new RegExp(`.{0,100}${keyword}.{0,100}`, 'gi');
            const contexts = html.match(contextRegex) || [];
            contexts.slice(0, 2).forEach((context, idx) => {
                console.log(`      Context ${idx + 1}: ...${context.trim()}...`);
            });
        }
    });
    
    // Method 2: 檢查特定的 HTML 結構
    console.log('\n🏗️ HTML structure analysis:');
    
    // 檢查是否有直播相關的 CSS classes
    const liveClassPatterns = [
        /class="[^"]*live[^"]*"/gi,
        /class="[^"]*broadcast[^"]*"/gi,
        /class="[^"]*streaming[^"]*"/gi
    ];
    
    liveClassPatterns.forEach(pattern => {
        const matches = html.match(pattern);
        if (matches) {
            console.log(`   ✅ Found live-related classes: ${matches.length} matches`);
            matches.slice(0, 3).forEach(match => {
                console.log(`      ${match}`);
            });
        }
    });
    
    // Method 3: 檢查 data attributes
    const dataAttributes = [
        /data-[^=]*live[^=]*="[^"]*"/gi,
        /data-[^=]*broadcast[^=]*="[^"]*"/gi,
        /aria-label="[^"]*live[^"]*"/gi,
        /aria-label="[^"]*直播[^"]*"/gi
    ];
    
    console.log('\n📊 Data attributes analysis:');
    dataAttributes.forEach(pattern => {
        const matches = html.match(pattern);
        if (matches) {
            console.log(`   ✅ Found live data attributes: ${matches.length} matches`);
            matches.slice(0, 3).forEach(match => {
                console.log(`      ${match}`);
            });
        }
    });
    
    // Method 4: 檢查 JSON 數據中的直播狀態
    console.log('\n📦 JSON data deep analysis:');
    
    // 尋找所有 JSON 數據
    const jsonPatterns = [
        /window\._sharedData\s*=\s*({.*?});/s,
        /window\.__additionalDataLoaded\([^,]+,\s*({.*?})\)/s,
        /"props"\s*:\s*({.*?})/s,
        /"user"\s*:\s*({.*?})/s
    ];
    
    jsonPatterns.forEach((pattern, idx) => {
        const match = html.match(pattern);
        if (match) {
            try {
                const jsonData = JSON.parse(match[1]);
                console.log(`   ✅ Found JSON data block ${idx + 1}`);
                
                // 遞迴搜尋所有可能的直播字段
                const liveFields = findLiveFields(jsonData);
                if (liveFields.length > 0) {
                    console.log(`      🔴 Found potential live fields:`);
                    liveFields.forEach(field => {
                        console.log(`         ${field.path}: ${field.value}`);
                    });
                    return true;
                }
                
            } catch (e) {
                console.log(`   ❌ Failed to parse JSON block ${idx + 1}: ${e.message}`);
            }
        }
    });
    
    // Method 5: 檢查 URL 模式
    console.log('\n🔗 URL pattern analysis:');
    const urlPatterns = [
        /https?:\/\/[^"'\s]*live[^"'\s]*/gi,
        /https?:\/\/[^"'\s]*broadcast[^"'\s]*/gi,
        /\/live\//gi,
        /\/broadcast\//gi
    ];
    
    urlPatterns.forEach(pattern => {
        const matches = html.match(pattern);
        if (matches) {
            console.log(`   ✅ Found live URLs: ${matches.length} matches`);
            matches.slice(0, 3).forEach(match => {
                console.log(`      ${match}`);
            });
        }
    });
    
    // Method 6: 檢查 meta tags
    console.log('\n🏷️ Meta tags analysis:');
    const metaPatterns = [
        /<meta[^>]+property="og:type"[^>]+content="video[^"]*"/gi,
        /<meta[^>]+property="og:video[^>]+/gi,
        /<meta[^>]+content="[^"]*live[^"]*"/gi,
        /<meta[^>]+content="[^"]*直播[^"]*"/gi
    ];
    
    metaPatterns.forEach(pattern => {
        const matches = html.match(pattern);
        if (matches) {
            console.log(`   ✅ Found relevant meta tags: ${matches.length} matches`);
            matches.forEach(match => {
                console.log(`      ${match}`);
            });
        }
    });
    
    // 決定是否在直播
    const hasLiveKeywords = foundKeywords.length > 0;
    const result = hasLiveKeywords; // 可以根據需要調整邏輯
    
    console.log(`\n📊 Final decision: ${result ? '🔴 LIVE DETECTED' : '⚫ No live indicators found'}`);
    if (foundKeywords.length > 0) {
        console.log(`   Based on keywords: ${foundKeywords.map(k => k.keyword).join(', ')}`);
    }
    
    return result;
}

// 遞迴搜尋 JSON 中的直播相關字段
function findLiveFields(obj, path = '', maxDepth = 5, currentDepth = 0) {
    if (currentDepth > maxDepth || !obj || typeof obj !== 'object') {
        return [];
    }
    
    const liveFields = [];
    const liveKeywords = [
        'is_live', 'isLive', 'live', 'broadcast', 'streaming',
        'live_broadcast_id', 'broadcast_id', 'live_status',
        'live_stream', 'is_broadcasting', 'broadcast_status'
    ];
    
    for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        
        // 檢查 key 是否包含直播相關詞彙
        if (liveKeywords.some(keyword => key.toLowerCase().includes(keyword.toLowerCase()))) {
            liveFields.push({ path: currentPath, value: value });
        }
        
        // 遞迴檢查嵌套對象
        if (typeof value === 'object' && value !== null) {
            liveFields.push(...findLiveFields(value, currentPath, maxDepth, currentDepth + 1));
        }
    }
    
    return liveFields;
}

// 新增：檢查特定 Instagram API endpoint
async function checkInstagramAPI(username) {
    console.log('\n🌐 === Trying Instagram API endpoints ===');
    
    const endpoints = [
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
        `https://i.instagram.com/api/v1/users/${username}/info/`,
        `https://www.instagram.com/${username}/?__a=1`,
        `https://www.instagram.com/graphql/query/` // 需要 query_hash
    ];
    
    for (const endpoint of endpoints) {
        try {
            console.log(`🔍 Trying: ${endpoint}`);
            
            const response = await makeRequest(endpoint, {
                method: 'GET',
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': `https://www.instagram.com/${username}/`
                }
            });
            
            if (response.statusCode === 200) {
                console.log(`   ✅ Success! Response length: ${response.data.length}`);
                
                try {
                    const jsonData = JSON.parse(response.data);
                    const liveFields = findLiveFields(jsonData);
                    
                    if (liveFields.length > 0) {
                        console.log(`   🔴 Found live fields in API:`);
                        liveFields.forEach(field => {
                            console.log(`      ${field.path}: ${field.value}`);
                        });
                        return true;
                    }
                } catch (e) {
                    console.log(`   ❌ Failed to parse API response: ${e.message}`);
                }
            } else {
                console.log(`   ❌ Failed: ${response.statusCode}`);
            }
            
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
        }
        
        // 避免太快的請求
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return false;
}

// 使用方法：在你的 checkLiveStatusWithComparison 函數中加入：
// const apiResult = await checkInstagramAPI(TARGET_USERNAME);
// results.api = apiResult;