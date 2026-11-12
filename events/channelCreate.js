const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cfg = require('../config.json');

module.exports = {
    name: Events.ChannelCreate,
    async execute(channel) {
        try {
            if (!channel.guild) return; // Only process inside a guild

            const logData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/log.json'), 'utf8'));
            const channelLogId = logData['lrchannel-log'];
            if (!channelLogId) return;

            const guild = channel.guild;
            const logChannel = guild.channels.cache.get(channelLogId) || await guild.channels.fetch(channelLogId).catch(() => null);
            if (!logChannel) return;

            const fetchedLogs = await guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.ChannelCreate,
            }).catch(() => null);

            const auditLog = fetchedLogs ? fetchedLogs.entries.first() : null;
            let creator = "Bilinmiyor";

            if (auditLog && auditLog.target.id === channel.id && Date.now() - auditLog.createdTimestamp < 15000) {
                creator = auditLog.executor;
                const { checkGuard } = require('../utils/guard.js');
                await checkGuard(creator, guild);
            }

            const channelEmbed = new EmbedBuilder()
                .setColor(0x00FF00) // Green
                .setTitle('🔹 Yeni Kanal Oluşturuldu')
                .setDescription(`**Oluşturulan Kanal:** ${channel} (\`${channel.name}\`)\n**Kanal Tipi:** \`${channel.type}\`\n**Oluşturan Yetkili:** ${creator !== "Bilinmiyor" ? creator : "Bilinmiyor"}`)
                .setFooter({ text: `${cfg.footer.text} | Kanal Log` })
                .setTimestamp();

            await logChannel.send({ embeds: [channelEmbed] }).catch(() => { });

        } catch (error) {
            console.error('Channel create log hatası:', error);
        }
    },
};
