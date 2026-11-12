const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cfg = require('../config.json');

module.exports = {
    name: Events.ChannelDelete,
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
                type: AuditLogEvent.ChannelDelete,
            }).catch(() => null);

            const auditLog = fetchedLogs ? fetchedLogs.entries.first() : null;
            let deleter = "Bilinmiyor";

            if (auditLog && auditLog.target.id === channel.id && Date.now() - auditLog.createdTimestamp < 15000) {
                deleter = auditLog.executor;
                const { checkGuard } = require('../utils/guard.js');
                await checkGuard(deleter, guild);
            }

            const channelEmbed = new EmbedBuilder()
                .setColor(0xFF0000) // Red
                .setTitle('🔹 Kanal Silindi')
                .setDescription(`**Silinen Kanal İsmi:** \`${channel.name}\`\n**Kanal Tipi:** \`${channel.type}\`\n**Silen Yetkili:** ${deleter !== "Bilinmiyor" ? deleter : "Bilinmiyor"}`)
                .setFooter({ text: `${cfg.footer.text} | Kanal Log` })
                .setTimestamp();

            await logChannel.send({ embeds: [channelEmbed] }).catch(() => { });

        } catch (error) {
            console.error('Channel delete log hatası:', error);
        }
    },
};
