const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cfg = require('../config.json');

module.exports = {
    name: Events.GuildBanRemove,
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
                type: AuditLogEvent.MemberBanRemove,
            }).catch(() => null);

            const unbanLog = fetchedLogs ? fetchedLogs.entries.first() : null;
            let unbanner = "Bilinmiyor";

            if (unbanLog && unbanLog.target.id === user.id && Date.now() - unbanLog.createdTimestamp < 5000) {
                unbanner = unbanLog.executor;
            }

            const unbanEmbed = new EmbedBuilder()
                .setColor(0x00FF00) // Green
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
                .setTitle('🔹 Kullanıcı Yasağı Kaldırıldı (Unban)')
                .setDescription(`**Yasağı Kalkan Kullanıcı:** ${user} (\`${user.id}\`)\n**Yasağı Kaldıran Yetkili:** ${unbanner !== "Bilinmiyor" ? unbanner : "Bilinmiyor"}`)
                .setFooter({ text: `${cfg.footer.text} | Ceza Log` })
                .setTimestamp();

            await cezaChannel.send({ embeds: [unbanEmbed] }).catch(() => { });

        } catch (error) {
            console.error('Unban log hatası:', error);
        }
    },
};
