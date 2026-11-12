const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

const commands = [];

// Komutları yükle
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`✅ Komut yüklendi: ${command.data.name}`);
    } else {
        console.log(`⚠️  ${filePath} dosyasında "data" veya "execute" özelliği eksik.`);
    }
}

// REST instance oluştur
const rest = new REST().setToken(config.token);

// Komutları kaydet
(async () => {
    try {
        console.log(`🔄 ${commands.length} adet slash komutu kaydediliyor...`);

        // Eğer guild ID varsa, sadece guild-specific komutlar kaydet
        if (config.guildId) {
            const guildData = await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: commands },
            );
            
            console.log(`✅ ${guildData.length} adet guild komutu başarıyla kaydedildi!`);
        } else {
            // Guild ID yoksa global komutlar kaydet
            const data = await rest.put(
                Routes.applicationCommands(config.clientId),
                { body: commands },
            );

            console.log(`✅ ${data.length} adet global slash komutu başarıyla kaydedildi!`);
        }
        
    } catch (error) {
        console.error('❌ Komut kaydetme hatası:', error);
        if (error.rawError) {
            console.error('📋 Detaylı hata:', error.rawError);
        }
        if (error.errors) {
            console.error('🔍 Hata detayları:', error.errors);
        }
    }
})();
