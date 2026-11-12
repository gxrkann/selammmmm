const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cfg = require('../config.json');

module.exports = {
    name: Events.ChannelUpdate,
    async execute(oldChannel, newChannel) {
        try {
            if (!newChannel.guild) return; // Only process inside a guild

            const logData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/log.json'), 'utf8'));
            const channelLogId = logData['lrchannel-log'];
            if (!channelLogId) return;

            const guild = newChannel.guild;
            const logChannel = guild.channels.cache.get(channelLogId) || await guild.channels.fetch(channelLogId).catch(() => null);
            if (!logChannel) return;

            // Sadece isim değişikliğini raporla ki spam olmasın
            if (oldChannel.name === newChannel.name) return;

            const fetchedLogs = await guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.ChannelUpdate,
            }).catch(() => null);

            const auditLog = fetchedLogs ? fetchedLogs.entries.first() : null;
            let updater = "Bilinmiyor";

            if (auditLog && auditLog.target.id === newChannel.id && Date.now() - auditLog.createdTimestamp < 5000) {
                updater = auditLog.executor;
            }

            const channelEmbed = new EmbedBuilder()
                .setColor(0xFFFF00) // Yellow
                .setTitle('🔹 Kanal İsmi Değiştirildi')
                .setDescription(`**Güncellenen Kanal:** ${newChannel} (\`${newChannel.id}\`)\n**Güncelleyen Yetkili:** ${updater !== "Bilinmiyor" ? updater : "Bilinmiyor"}`)
                .addFields(
                    { name: 'Eski İsim', value: `\`${oldChannel.name}\``, inline: true },
                    { name: 'Yeni İsim', value: `\`${newChannel.name}\``, inline: true }
                )
                .setFooter({ text: `${cfg.footer.text} | Kanal Log` })
                .setTimestamp();

            await logChannel.send({ embeds: [channelEmbed] }).catch(() => { });

        } catch (error) {
            console.error('Channel update log hatası:', error);
        }
    },
};
