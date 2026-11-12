const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cfg = require('../config.json');

module.exports = {
    name: Events.GuildRoleUpdate,
    async execute(oldRole, newRole) {
        try {
            const logData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/log.json'), 'utf8'));
            const roleLogId = logData['lrrole-log'];
            if (!roleLogId) return;

            const guild = newRole.guild;
            const roleChannel = guild.channels.cache.get(roleLogId) || await guild.channels.fetch(roleLogId).catch(() => null);
            if (!roleChannel) return;

            // Sadece isim veya renk değişikliğini kontrol et
            if (oldRole.name === newRole.name && oldRole.color === newRole.color && oldRole.permissions.bitfield === newRole.permissions.bitfield) {
                return; // Önemsiz bir değişiklikse loglamaya gerek yok
            }

            const fetchedLogs = await guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.RoleUpdate,
            }).catch(() => null);

            const roleLog = fetchedLogs ? fetchedLogs.entries.first() : null;
            let updater = "Bilinmiyor";

            if (roleLog && roleLog.target.id === newRole.id && Date.now() - roleLog.createdTimestamp < 5000) {
                updater = roleLog.executor;
            }

            const roleEmbed = new EmbedBuilder()
                .setColor(0xFFFF00) // Yellow
                .setTitle('🔹 Rol Güncellendi')
                .setDescription(`**Güncellenen Rol:** ${newRole} (\`${newRole.id}\`)\n**Güncelleyen Yetkili:** ${updater !== "Bilinmiyor" ? updater : "Bilinmiyor"}`)
                .addFields(
                    { name: 'Eski İsim', value: `\`${oldRole.name}\``, inline: true },
                    { name: 'Yeni İsim', value: `\`${newRole.name}\``, inline: true }
                )
                .setFooter({ text: `${cfg.footer.text} | Rol Log` })
                .setTimestamp();

            await roleChannel.send({ embeds: [roleEmbed] }).catch(() => { });

        } catch (error) {
            console.error('Role update log hatası:', error);
        }
    },
};
