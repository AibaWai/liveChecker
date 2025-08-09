// html-analyzer.js - 分析已保存的 HTML 文件
const fs = require('fs');
const path = require('path');

function analyzeHTMLFile(filePath) {
    console.log(`\n🔍 === Analyzing ${path.basename(filePath)} ===`);
    
    if (!fs.existsSync(filePath)) {
        console.log('❌ File not found!');
        return;
    }
    
    const html = fs.readFileSync(filePath, 'utf8');
    console.log(`📊 File size: ${html.length} characters`);
    
    // 1. 尋找所有可能的直播相關文字
    console.log('\n📝 === TEXT CONTENT ANALYSIS ===');
    
    const allText = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const liveKeywords = ['直播', 'LIVE', 'Live', 'live', 'En vivo', 'broadcast', 'streaming'];
    
    liveKeywords.forEach(keyword => {
        const regex = new RegExp(keyword, 'gi');
        const matches = allText.match(regex);
        if (matches) {
            console.log(`✅ "${keyword}": ${matches.length} occurrences in text`);
            
            // 顯示上下文
            const words = allText.split(' ');
            words.forEach((word, idx) => {
                if (word.toLowerCase().includes(keyword.toLowerCase())) {
                    const start = Math.max(0, idx - 10);
                    const end = Math.min(words.length, idx + 10);
                    const context = words.slice(start, end).join(' ');
                    console.log(`   Context: ...${context}...`);
                }
            });
        }
    });
    
    // 2. 分析 window._sharedData
    console.log('\n📦 === SHARED DATA ANALYSIS ===');
    
    const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({.*?});/s);
    if (sharedDataMatch) {
        try {
            const sharedData = JSON.parse(sharedDataMatch[1]);
            console.log('✅ Found window._sharedData');
            
            // 遞迴搜尋所有可能包含直播信息的字段
            const allKeys = getAllKeys(sharedData);
            console.log(`📊 Total keys found: ${allKeys.length}`);
            
            const liveRelatedKeys = allKeys.filter(key => 
                /live|broadcast|stream/i.test(key)
            );
            
            if (liveRelatedKeys.length > 0) {
                console.log('🔴 Found live-related keys:');
                liveRelatedKeys.forEach(key => {
                    console.log(`   ${key}`);
                });
            }
            
            // 檢查 ProfilePage 數據
            const profilePage = sharedData?.entry_data?.ProfilePage?.[0];
            if (profilePage) {
                console.log('✅ Found ProfilePage data');
                const user = profilePage?.graphql?.user;
                if (user) {
                    console.log(`✅ Found user data for: ${user.username || 'unknown'}`);
                    console.log(`📊 User object keys: ${Object.keys(user).slice(0, 10).join(', ')}...`);
                    
                    // 檢查所有可能的直播字段
                    const possibleLiveFields = [
                        'is_live', 'live_broadcast_id', 'broadcast_id',
                        'has_public_story', 'has_story', 'edge_owner_to_timeline_media'
                    ];
                    
                    possibleLiveFields.forEach(field => {
                        if (user[field] !== undefined) {
                            console.log(`📊 ${field}: ${JSON.stringify(user[field])}`);
                        }
                    });
                }
            }
            
        } catch (e) {
            console.log(`❌ Failed to parse _sharedData: ${e.message}`);
        }
    } else {
        console.log('❌ No window._sharedData found');
    }
    
    // 3. 檢查所有 script tags 中的 JSON
    console.log('\n🔧 === SCRIPT TAGS ANALYSIS ===');
    
    const scriptMatches = html.match(/<script[^>]*>(.*?)<\/script>/gis);
    if (scriptMatches) {
        console.log(`📊 Found ${scriptMatches.length} script tags`);
        
        scriptMatches.forEach((script, idx) => {
            // 移除 HTML tags，只保留內容
            const scriptContent = script.replace(/<\/?script[^>]*>/gi, '');
            
            // 尋找 JSON 對象
            const jsonMatches = scriptContent.match(/{[^{}]*"[^"]*"[^{}]*}/g);
            if (jsonMatches) {
                jsonMatches.forEach((jsonStr, jsonIdx) => {
                    try {
                        const jsonObj = JSON.parse(jsonStr);
                        const keys = Object.keys(jsonObj);
                        
                        // 檢查是否包含直播相關 keys
                        const liveKeys = keys.filter(key => 
                            /live|broadcast|stream/i.test(key)
                        );
                        
                        if (liveKeys.length > 0) {
                            console.log(`🔴 Script ${idx}, JSON ${jsonIdx} has live keys: ${liveKeys.join(', ')}`);
                            liveKeys.forEach(key => {
                                console.log(`   ${key}: ${JSON.stringify(jsonObj[key])}`);
                            });
                        }
                    } catch (e) {
                        // 不是有效的 JSON，跳過
                    }
                });
            }
        });
    }
    
    // 4. 檢查 meta tags
    console.log('\n🏷️ === META TAGS ANALYSIS ===');
    
    const metaMatches = html.match(/<meta[^>]+>/gi);
    if (metaMatches) {
        console.log(`📊 Found ${metaMatches.length} meta tags`);
        
        const relevantMetas = metaMatches.filter(meta => 
            /live|broadcast|video|stream/i.test(meta)
        );
        
        if (relevantMetas.length > 0) {
            console.log('🔴 Found relevant meta tags:');
            relevantMetas.forEach(meta => {
                console.log(`   ${meta}`);
            });
        }
    }
    
    // 5. 檢查所有 data attributes
    console.log('\n📊 === DATA ATTRIBUTES ANALYSIS ===');
    
    const dataMatches = html.match(/data-[^=]+=["'][^"']*["']/gi);
    if (dataMatches) {
        const liveDataAttrs = dataMatches.filter(attr => 
            /live|broadcast|stream/i.test(attr)
        );
        
        if (liveDataAttrs.length > 0) {
            console.log('🔴 Found live-related data attributes:');
            liveDataAttrs.forEach(attr => {
                console.log(`   ${attr}`);
            });
        }
    }
    
    // 6. 檢查 CSS classes
    console.log('\n🎨 === CSS CLASSES ANALYSIS ===');
    
    const classMatches = html.match(/class=["'][^"']*["']/gi);
    if (classMatches) {
        const liveClasses = classMatches.filter(cls => 
            /live|broadcast|stream/i.test(cls)
        );
        
        if (liveClasses.length > 0) {
            console.log('🔴 Found live-related CSS classes:');
            liveClasses.forEach(cls => {
                console.log(`   ${cls}`);
            });
        }
    }
    
    console.log('\n✅ === ANALYSIS COMPLETE ===');
}

function getAllKeys(obj, prefix = '', maxDepth = 10, currentDepth = 0) {
    if (currentDepth > maxDepth || !obj || typeof obj !== 'object') {
        return [];
    }
    
    let keys = [];
    
    for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        keys.push(fullKey);
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            keys = keys.concat(getAllKeys(value, fullKey, maxDepth, currentDepth + 1));
        }
    }
    
    return keys;
}

// 使用方法
if (require.main === module) {
    const filePath = process.argv[2];
    if (!filePath) {
        console.log('Usage: node html-analyzer.js <path-to-html-file>');
        process.exit(1);
    }
    
    analyzeHTMLFile(filePath);
}

module.exports = { analyzeHTMLFile };