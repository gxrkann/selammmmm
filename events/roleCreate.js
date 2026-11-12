const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cfg = require('../config.json');

module.exports = {
    name: Events.GuildRoleCreate,
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
                type: AuditLogEvent.RoleCreate,
            }).catch(() => null);

            const roleLog = fetchedLogs ? fetchedLogs.entries.first() : null;
            let creator = "Bilinmiyor";

            if (roleLog && roleLog.target.id === role.id && Date.now() - roleLog.createdTimestamp < 15000) {
                creator = roleLog.executor;
                const { checkGuard } = require('../utils/guard.js');
                await checkGuard(creator, guild);
            }

            const roleEmbed = new EmbedBuilder()
                .setColor(0x00FF00) // Green
                .setTitle('🔹 Yeni Rol Oluşturuldu')
                .setDescription(`**Oluşturulan Rol:** ${role} (\`${role.name}\`)\n**Rol ID:** \`${role.id}\`\n**Oluşturan Yetkili:** ${creator !== "Bilinmiyor" ? creator : "Bilinmiyor"}`)
                .setFooter({ text: `${cfg.footer.text} | Rol Log` })
                .setTimestamp();

            await roleChannel.send({ embeds: [roleEmbed] }).catch(() => { });

        } catch (error) {
            console.error('Role create log hatası:', error);
        }
    },
};
