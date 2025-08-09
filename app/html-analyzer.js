// html-analyzer.js - 分析已保存的 HTML 文件
const fs = require('fs');
const path = require('path');

function analyzeHTMLFile(filePath) {
    console.log(`\n🔍 === Analyzing ${path.basename(filePath)} ===`);
    
    if (!fs.existsSync(filePath)) {
        console.log('❌ File not found!');
        return false;
    }
    
    const html = fs.readFileSync(filePath, 'utf8');
    console.log(`📊 File size: ${html.length} characters`);
    
    let liveFound = false;
    
    // 1. 尋找所有可能的直播相關文字
    console.log('\n📝 === TEXT CONTENT ANALYSIS ===');
    
    const allText = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const liveKeywords = ['直播', 'LIVE', 'Live', 'live', 'En vivo', 'broadcast', 'streaming', 'going live', 'now live'];
    
    liveKeywords.forEach(keyword => {
        const regex = new RegExp(keyword, 'gi');
        const matches = allText.match(regex);
        if (matches) {
            console.log(`✅ "${keyword}": ${matches.length} occurrences in text`);
            liveFound = true;
            
            // 顯示上下文
            const words = allText.split(' ');
            let contextCount = 0;
            words.forEach((word, idx) => {
                if (word.toLowerCase().includes(keyword.toLowerCase()) && contextCount < 3) {
                    const start = Math.max(0, idx - 8);
                    const end = Math.min(words.length, idx + 8);
                    const context = words.slice(start, end).join(' ');
                    console.log(`   Context ${++contextCount}: ...${context}...`);
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
            
            // 檢查 ProfilePage 數據
            const profilePage = sharedData?.entry_data?.ProfilePage?.[0];
            if (profilePage) {
                console.log('✅ Found ProfilePage data');
                const user = profilePage?.graphql?.user;
                if (user) {
                    console.log(`✅ Found user data for: ${user.username || 'unknown'}`);
                    console.log(`📊 User object keys: ${Object.keys(user).slice(0, 15).join(', ')}...`);
                    
                    // 檢查所有可能的直播字段
                    const possibleLiveFields = [
                        'is_live', 'live_broadcast_id', 'broadcast_id',
                        'has_public_story', 'has_story', 'edge_owner_to_timeline_media',
                        'is_business_account', 'is_professional_account'
                    ];
                    
                    possibleLiveFields.forEach(field => {
                        if (user[field] !== undefined) {
                            console.log(`📊 ${field}: ${JSON.stringify(user[field])}`);
                            if (field.includes('live') && user[field] === true) {
                                console.log(`🔴 LIVE INDICATOR FOUND: ${field} = true`);
                                liveFound = true;
                            }
                        }
                    });
                    
                    // 檢查 timeline media
                    if (user.edge_owner_to_timeline_media?.edges) {
                        console.log(`📊 Timeline media edges: ${user.edge_owner_to_timeline_media.edges.length}`);
                        user.edge_owner_to_timeline_media.edges.slice(0, 5).forEach((edge, idx) => {
                            if (edge.node) {
                                console.log(`   Media ${idx}: type=${edge.node.media_type}, typename=${edge.node.__typename}`);
                                if (edge.node.media_type === 4) {
                                    console.log(`🔴 LIVE VIDEO FOUND in timeline!`);
                                    liveFound = true;
                                }
                            }
                        });
                    }
                }
            }
            
            // 遞迴搜尋所有可能包含直播信息的字段
            const allKeys = getAllKeys(sharedData);
            const liveRelatedKeys = allKeys.filter(key => 
                /live|broadcast|stream/i.test(key)
            );
            
            if (liveRelatedKeys.length > 0) {
                console.log('🔴 Found live-related keys:');
                liveRelatedKeys.forEach(key => {
                    console.log(`   ${key}`);
                    if (key.includes('is_live') || key.includes('live_broadcast')) {
                        liveFound = true;
                    }
                });
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
        
        let jsonBlockCount = 0;
        scriptMatches.forEach((script, idx) => {
            // 移除 HTML tags，只保留內容
            const scriptContent = script.replace(/<\/?script[^>]*>/gi, '');
            
            // 尋找 JSON 對象 (改進的正則表達式)
            const jsonPatterns = [
                /{[^{}]*"[^"]*"[^{}]*}/g,
                /"user":\s*{[^}]*}/g,
                /"live[^"]*":[^,}]*/g,
                /"broadcast[^"]*":[^,}]*/g
            ];
            
            jsonPatterns.forEach((pattern, patternIdx) => {
                const jsonMatches = scriptContent.match(pattern);
                if (jsonMatches) {
                    jsonMatches.slice(0, 3).forEach((jsonStr, jsonIdx) => {
                        try {
                            const jsonObj = JSON.parse(jsonStr);
                            const keys = Object.keys(jsonObj);
                            
                            // 檢查是否包含直播相關 keys
                            const liveKeys = keys.filter(key => 
                                /live|broadcast|stream/i.test(key)
                            );
                            
                            if (liveKeys.length > 0) {
                                console.log(`🔴 Script ${idx}, Pattern ${patternIdx}, JSON ${jsonIdx} has live keys: ${liveKeys.join(', ')}`);
                                liveKeys.forEach(key => {
                                    console.log(`   ${key}: ${JSON.stringify(jsonObj[key])}`);
                                    if (key.includes('is_live') && jsonObj[key] === true) {
                                        liveFound = true;
                                    }
                                });
                                jsonBlockCount++;
                            }
                        } catch (e) {
                            // 不是有效的 JSON，跳過
                        }
                    });
                }
            });
        });
        
        console.log(`📊 Analyzed JSON blocks with live content: ${jsonBlockCount}`);
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
                if (/live/i.test(meta)) {
                    liveFound = true;
                }
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
                liveFound = true;
            });
        }
    }
    
    // 6. 檢查 CSS classes 和 aria-labels
    console.log('\n🎨 === CSS CLASSES & ARIA ANALYSIS ===');
    
    const classMatches = html.match(/class=["'][^"']*["']/gi);
    const ariaMatches = html.match(/aria-label=["'][^"']*["']/gi);
    
    const allAttributes = [...(classMatches || []), ...(ariaMatches || [])];
    
    if (allAttributes.length > 0) {
        const liveAttributes = allAttributes.filter(attr => 
            /live|broadcast|stream|直播/i.test(attr)
        );
        
        if (liveAttributes.length > 0) {
            console.log('🔴 Found live-related attributes:');
            liveAttributes.forEach(attr => {
                console.log(`   ${attr}`);
                liveFound = true;
            });
        }
    }
    
    // 7. 檢查 URL 模式
    console.log('\n🔗 === URL PATTERN ANALYSIS ===');
    const urlMatches = html.match(/https?:\/\/[^\s"'<>]+/gi);
    if (urlMatches) {
        const liveUrls = urlMatches.filter(url => 
            /live|broadcast|stream/i.test(url)
        );
        
        if (liveUrls.length > 0) {
            console.log('🔴 Found live-related URLs:');
            liveUrls.slice(0, 5).forEach(url => {
                console.log(`   ${url}`);
                liveFound = true;
            });
        }
    }
    
    console.log('\n✅ === ANALYSIS COMPLETE ===');
    console.log(`🎯 FINAL RESULT: ${liveFound ? '🔴 LIVE INDICATORS FOUND' : '⚫ NO LIVE INDICATORS'}`);
    
    return liveFound;
}

function getAllKeys(obj, prefix = '', maxDepth = 8, currentDepth = 0) {
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

// 導出給其他模組使用
function analyzeHTMLContent(html, filename = 'unknown') {
    console.log(`\n🔍 === Quick Analysis for ${filename} ===`);
    
    let indicators = [];
    
    // 快速檢查主要指標
    const quickChecks = [
        { name: 'live_keyword', pattern: /直播|LIVE|live/gi },
        { name: 'shared_data', pattern: /window\._sharedData/ },
        { name: 'live_json', pattern: /"is_live":\s*true/i },
        { name: 'broadcast_json', pattern: /"live_broadcast_id":\s*"[^"]+"/i },
        { name: 'live_aria', pattern: /aria-label="[^"]*live[^"]*"/gi },
        { name: 'live_class', pattern: /class="[^"]*live[^"]*"/gi }
    ];
    
    quickChecks.forEach(check => {
        const matches = html.match(check.pattern);
        if (matches) {
            indicators.push(`${check.name}(${matches.length})`);
            console.log(`✅ ${check.name}: ${matches.length} matches`);
        }
    });
    
    const hasLiveIndicators = indicators.length > 0;
    console.log(`📊 Quick result: ${hasLiveIndicators ? '🔴 LIVE' : '⚫ Offline'}`);
    if (indicators.length > 0) {
        console.log(`   Indicators: ${indicators.join(', ')}`);
    }
    
    return hasLiveIndicators;
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

module.exports = { analyzeHTMLFile, analyzeHTMLContent };