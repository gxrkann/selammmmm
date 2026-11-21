const { Events } = require('discord.js');
const config = require('../config.json');
const aktiflikCommand = require('../commands/aktiflik');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Bot hazır! ${client.user.tag} olarak giriş yapıldı.`);
        console.log(`${client.guilds.cache.size} sunucuda aktif`);
        console.log(`${client.users.cache.size} kullanıcıya hizmet veriyor`);

        // Bot durumu (ayarlanabilir: /durum komutu — data/status.json)
        try {
            require('../utils/status').apply(client);
        } catch (error) {
            console.error('❌ Durum ayarlanamadı, varsayılana dönülüyor:', error);
            client.user.setPresence({
                status: 'dnd',
                activities: [{ name: `${config.footer.text} | Ekip Sistemi`, type: 0 }],
            });
        }

        // Yarıda kalan aktiflik testlerini devam ettir
        await aktiflikCommand.resumeTests(client).catch((error) => {
            console.error('Aktiflik testi devam ettirilemedi:', error);
        });

        // Yarıda kalan etkinlikleri devam ettir
        require('../commands/etkinlik').resume(client).catch((error) => {
            console.error('Etkinlik devam ettirilemedi:', error);
        });

        // Ses kanalı: aktifse bağlan + kopunca otomatik yeniden bağlan
        try {
            const voice = require('../utils/voice');
            const saved = voice.loadVoiceData();
            const sesKanalId = saved.active && saved.channelId ? saved.channelId : config.voiceChannelId;

            if (config.guildId && sesKanalId) {
                const guild = client.guilds.cache.get(config.guildId) || client.guilds.cache.first();
                if (!guild) {
                    console.error('❌ Guild bulunamadı! config.json > guildId');
                } else {
                    voice.setVoiceActive(sesKanalId, guild.id);
                    voice.resumeVoice(guild);
                    console.log(`🔊 Ses kanalına otomatik bağlanılıyor: ${sesKanalId}`);
                }
            } else {
                console.log('[BİLGİ] guildId/voiceChannelId boş olduğu için ses kanalına bağlanılmadı.');
            }
        } catch (error) {
            console.error('❌ Ses kanalına bağlanırken hata:', error);
        }
    },
};
