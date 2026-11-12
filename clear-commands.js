const { REST, Routes } = require('discord.js');
const config = require('./config.json');

const rest = new REST().setToken(config.token);

(async () => {
    try {
        console.log('🔄 Mevcut komutlar temizleniyor...');

        // Global komutları temizle
        await rest.put(
            Routes.applicationCommands(config.clientId),
            { body: [] },
        );
        console.log('✅ Global komutlar temizlendi!');

        // Guild komutlarını temizle (eğer guildId varsa)
        if (config.guildId) {
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: [] },
            );
            console.log('✅ Guild komutları temizlendi!');
        }

        console.log('🎉 Tüm komutlar başarıyla temizlendi!');
        
    } catch (error) {
        console.error('❌ Komut temizleme hatası:', error);
    }
})();
