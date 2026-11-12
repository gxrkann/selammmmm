const { Events, ChannelType } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const config = require('../config.json');
const aktiflikCommand = require('../commands/aktiflik');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Bot hazır! ${client.user.tag} olarak giriş yapıldı.`);
        console.log(`${client.guilds.cache.size} sunucuda aktif`);
        console.log(`${client.users.cache.size} kullanıcıya hizmet veriyor`);

        // Bot durumu
        client.user.setPresence({
            status: 'dnd',
            activities: [{
                name: `${config.footer.text} | Ekip Sistemi`,
                type: 0 // PLAYING
            }]
        });

        // Yarıda kalan aktiflik testlerini devam ettir
        await aktiflikCommand.resumeTests(client).catch((error) => {
            console.error('Aktiflik testi devam ettirilemedi:', error);
        });

        // Ses kanalına bağlan (ID'ler doluysa)
        if (config.guildId && config.voiceChannelId) {
            try {
                const guild = client.guilds.cache.get(config.guildId);
                if (!guild) {
                    console.error('❌ Guild bulunamadı! config.json > guildId');
                    return;
                }

                const voiceChannel = guild.channels.cache.get(config.voiceChannelId);
                if (!voiceChannel) {
                    console.error('❌ Ses kanalı bulunamadı! config.json > voiceChannelId');
                    return;
                }

                if (voiceChannel.type !== ChannelType.GuildVoice) {
                    console.error('❌ Belirtilen kanal bir ses kanalı değil!');
                    return;
                }

                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: guild.id,
                    adapterCreator: guild.voiceAdapterCreator,
                });

                console.log(`✅ Ses kanalına bağlanıldı: ${voiceChannel.name} (${voiceChannel.id})`);

                connection.on('error', error => {
                    console.error('❌ Ses kanalı bağlantı hatası:', error);
                });

                connection.on('stateChange', (oldState, newState) => {
                    console.log(`🔄 Ses bağlantı durumu: ${oldState.status} -> ${newState.status}`);
                });

            } catch (error) {
                console.error('❌ Ses kanalına bağlanırken hata:', error);
            }
        } else {
            console.log('[BİLGİ] guildId/voiceChannelId boş olduğu için ses kanalına bağlanılmadı.');
        }
    },
};
