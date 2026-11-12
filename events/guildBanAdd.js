const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cfg = require('../config.json');

module.exports = {
    name: Events.GuildBanAdd,
    async execute(ban) {
        try {
            const logData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/log.json'), 'utf8'));
            const cezaLogId = logData['lrceza-log'];
            if (!cezaLogId) return;

            const guild = ban.guild;
            const user = ban.user;

            const cezaChannel = guild.channels.cache.get(cezaLogId) || await guild.channels.fetch(cezaLogId).catch(() => null);
            if (!cezaChannel) return;

            const fetchedLogs = await guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MemberBanAdd,
            }).catch(() => null);

            const banLog = fetchedLogs ? fetchedLogs.entries.first() : null;
            let banner = "Bilinmiyor";
            let reason = ban.reason || "Belirtilmedi";

            if (banLog && banLog.target.id === user.id && Date.now() - banLog.createdTimestamp < 5000) {
                banner = banLog.executor;
                reason = banLog.reason || reason;
            }

            const banEmbed = new EmbedBuilder()
                .setColor(0x8B0000) // Dark red
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
                .setTitle('🔹 Kullanıcı Yasaklandı (Ban)')
                .setDescription(`**Yasaklanan Kullanıcı:** ${user} (\`${user.id}\`)\n**Yasaklayan Yetkili:** ${banner !== "Bilinmiyor" ? banner : "Bilinmiyor"}\n**Sebep:** \`${reason}\``)
                .setFooter({ text: `${cfg.footer.text} | Ceza Log` })
                .setTimestamp();

            await cezaChannel.send({ embeds: [banEmbed] }).catch(() => { });

        } catch (error) {
            console.error('Ban log hatası:', error);
        }
    },
};
