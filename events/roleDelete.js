const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cfg = require('../config.json');

module.exports = {
    name: Events.GuildRoleDelete,
    async execute(role) {
        try {
            const logData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/log.json'), 'utf8'));
            const roleLogId = logData['lrrole-log'];
            if (!roleLogId) return;

            const guild = role.guild;
            const roleChannel = guild.channels.cache.get(roleLogId) || await guild.channels.fetch(roleLogId).catch(() => null);
            if (!roleChannel) return;

            const fetchedLogs = await guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.RoleDelete,
            }).catch(() => null);

            const roleLog = fetchedLogs ? fetchedLogs.entries.first() : null;
            let deleter = "Bilinmiyor";

            if (roleLog && roleLog.target.id === role.id && Date.now() - roleLog.createdTimestamp < 15000) {
                deleter = roleLog.executor;
                const { checkGuard } = require('../utils/guard.js');
                await checkGuard(deleter, guild);
            }

            const roleEmbed = new EmbedBuilder()
                .setColor(0xFF0000) // Red
                .setTitle('🔹 Rol Silindi')
                .setDescription(`**Silinen Rol İsmi:** \`${role.name}\`\n**Rol ID:** \`${role.id}\`\n**Silen Yetkili:** ${deleter !== "Bilinmiyor" ? deleter : "Bilinmiyor"}`)
                .setFooter({ text: `${cfg.footer.text} | Rol Log` })
                .setTimestamp();

            await roleChannel.send({ embeds: [roleEmbed] }).catch(() => { });

        } catch (error) {
            console.error('Role delete log hatası:', error);
        }
    },
};
