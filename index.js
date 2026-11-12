console.log("Running file:", __filename);
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./utils/env'); // config.json + ortam değişkenleri

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ]
});

// Create a collection to store commands
client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`[INFO] Loaded command: ${command.data.name}`);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    
    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
        console.log(`[INFO] Loaded event: ${event.name}`);
    }
}


// Login to Discord
if (!config.token || config.token.startsWith('BURAYA_')) {
    console.error('❌ Bot token\'ı ayarlanmamış! config.json dosyasını düzenleyin.');
    console.error('   → "token" alanına Discord Developer Portal\'dan aldığınız token\'ı yazın.');
    process.exit(1);
}

client.login(config.token).catch((error) => {
    console.error('❌ Discord\'a giriş yapılamadı:', error.message);
    if (error.code === 'TokenInvalid') {
        console.error('   → Token geçersiz. Developer Portal\'dan yeni token alın ve config.json\'a yazın.');
    }
    process.exit(1);
});
