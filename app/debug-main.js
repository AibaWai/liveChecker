const { Client, GatewayIntentBits } = require('discord.js');

// Environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const TARGET_USERNAME = process.env.TARGET_USERNAME;

console.log('=== Environment Variables Check ===');
console.log('DISCORD_TOKEN:', DISCORD_TOKEN ? `Set (${DISCORD_TOKEN.length} chars)` : 'Missing');
console.log('DISCORD_CHANNEL_ID:', DISCORD_CHANNEL_ID || 'Missing');
console.log('TARGET_USERNAME:', TARGET_USERNAME || 'Missing');

// Discord client setup
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', async () => {
    console.log(`✅ Discord bot logged in as ${client.user.tag}!`);
    
    if (!DISCORD_CHANNEL_ID) {
        console.error('❌ DISCORD_CHANNEL_ID is not set!');
        return;
    }
    
    if (!TARGET_USERNAME) {
        console.error('❌ TARGET_USERNAME is not set!');
        return;
    }
    
    try {
        console.log(`🔍 Attempting to fetch channel: ${DISCORD_CHANNEL_ID}`);
        const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
        
        if (!channel) {
            console.error('❌ Channel not found');
            return;
        }
        
        console.log(`✅ Channel found: #${channel.name}`);
        
        // Test sending a message
        await channel.send(`🤖 Instagram Live Monitor started for @${TARGET_USERNAME} (Debug Mode)`);
        console.log('✅ Test message sent successfully!');
        
        // Keep alive
        setInterval(() => {
            console.log(`⏰ Bot is running... Monitoring @${TARGET_USERNAME}`);
        }, 60000); // Every minute
        
    } catch (error) {
        console.error('❌ Error:', error);
        
        if (error.code === 50001) {
            console.error('🚫 Bot is missing access to the channel. Please check:');
            console.error('   1. Bot is invited to the server');
            console.error('   2. Bot has "View Channel" and "Send Messages" permissions');
            console.error('   3. Channel ID is correct:', DISCORD_CHANNEL_ID);
        }
    }
});

client.on('error', (error) => {
    console.error('❌ Discord client error:', error);
});

// Start the bot
client.login(DISCORD_TOKEN);