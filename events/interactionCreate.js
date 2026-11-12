const { Events, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const aktiflikCommand = require('../commands/aktiflik');
const başvuruCommand = require('../commands/başvuru');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // Buton interaction'ları
        if (interaction.isButton()) {
            if (interaction.customId === 'aktiflik_confirm') {
                return aktiflikCommand.handleButton(interaction);
            }
            if (interaction.customId === 'basvuru_button') {
                return başvuruCommand.handleButton(interaction);
            }
        }

        // Select menu interaction'ları
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'ticket_close') {
                return başvuruCommand.handleSelectMenu(interaction);
            }
        }

        if (!interaction.isChatInputCommand()) return;

        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`❌ ${interaction.commandName} komutu bulunamadı.`);
            return;
        }

        try {
            console.log(`🔧 ${interaction.user.tag} kullanıcısı ${interaction.commandName} komutunu kullandı.`);

            // Komut log sistemi
            await logCommandUsage(interaction);

            await command.execute(interaction);
        } catch (error) {
            console.error(`❌ Komut çalıştırılırken hata oluştu: ${error}`);

            const errorMessage = {
                content: '❌ Bu komutu çalıştırırken bir hata oluştu!',
                flags: 64 // EPHEMERAL flag
            };

            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            } catch (replyError) {
                console.error(`Kullanıcıya hata mesajı gönderilemedi: ${replyError.message}`);
            }
        }
    },
};

async function logCommandUsage(interaction) {
    try {
        // log.json dosyasını oku
        const logData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/log.json'), 'utf8'));

        // luneriscommand-log kanal ID'sini al
        const commandLogChannelId = logData['lrcommand-log'];

        if (!commandLogChannelId) {
            console.log('luneriscommand-log kanalı bulunamadı');
            return;
        }

        // Kanalı bul
        const logChannel = interaction.client.channels.cache.get(commandLogChannelId);
        if (!logChannel) {
            console.log('Log kanalı bulunamadı:', commandLogChannelId);
            return;
        }

        const user = interaction.user;
        const channel = interaction.channel;
        const commandUsed = interaction.commandName;
        const ts = Math.floor(Date.now() / 1000);

        // Embed oluştur
        const embed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setAuthor({
                name: user.username,
                iconURL: user.displayAvatarURL(),
            })
            .setThumbnail(interaction.client.user.displayAvatarURL())
            .setDescription(
                `${user} tarafından ${channel} kanalında komut kullanıldı!\n\n` +
                `🔹 \`Komutu Kullanan Kişi:\` ${user}\n` +
                `🔹 \`Kullanılan Komut:\` **/${commandUsed}**\n` +
                `🔹 \`Kullanılan Zaman:\` <t:${ts}:F> (<t:${ts}:R>)`
            )
            .setFooter({
                text: `${interaction.client.user.username} | ${interaction.client.user.id}`,
                iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setTimestamp(interaction.createdAt);

        // Log kanalına gönder
        await logChannel.send({ embeds: [embed] });

    } catch (error) {
        console.error('Komut log hatası:', error);
    }
}
