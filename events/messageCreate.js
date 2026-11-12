const { Events, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const cfg = require('../config.json');
const activity = require('../utils/activity');

const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|(?:discord\.gg|\.gg)\/[^\s]+)/i;
const logDataPath = path.join(__dirname, '../data/log.json');

// In-memory data structures for fast tracking
const linkViolations = new Map();
const spamTracker = new Map();

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (!message.guild || message.author.bot) return;

        // Mesaj aktivitesi kaydet
        activity.addMessage(message.author.id);

        // Yetki kontrolü (Bypass)
        let isBypassed = false;
        if (cfg.ownerId.includes(message.author.id)) isBypassed = true;
        if (message.member && message.member.roles.cache.has(cfg.ownerRoleId)) isBypassed = true;

        if (!isBypassed) {
            // Spam Koruması (5 saniye içinde 5 mesaj atarsa)
            if (!spamTracker.has(message.author.id)) spamTracker.set(message.author.id, []);
            const timestamps = spamTracker.get(message.author.id);
            timestamps.push(Date.now());
            
            // Eski olanları temizle
            while (timestamps.length > 0 && Date.now() - timestamps[0] > 5000) {
                timestamps.shift();
            }

            if (timestamps.length >= 5) {
                // Saniye gözetmeksizin sustur (Timeout: 5 Dakika)
                if (message.member) {
                    message.member.timeout(5 * 60 * 1000, 'Spam Koruması').catch(() => {});
                    message.channel.send(`${message.author} spam yaptığı için 5 dakika susturuldu!`)
                        .then(msg => setTimeout(() => msg.delete().catch(()=>null), 5000))
                        .catch(() => {});
                }
                spamTracker.delete(message.author.id); // sıfırla
                return; // if spammer, abort further processing
            }
        }

        if (linkRegex.test(message.content)) {
            if (isBypassed) return;

            // Beklemeden direkt silme isteği at (Hız için)
            message.delete().catch(() => {});

            // Link violation tracker
            const linkCount = (linkViolations.get(message.author.id) || 0) + 1;
            linkViolations.set(message.author.id, linkCount);

            if (linkCount >= 5) {
                // 5 ihlal olunca Timeout at (10 Dakika)
                if (message.member) {
                    message.member.timeout(10 * 60 * 1000, 'Link Atma İhlali (5 Defa)').catch(() => {});
                    message.channel.send(`${message.author} 5 defa üst üste link attığı için 10 dakika susturuldu!`)
                        .then(msg => setTimeout(() => msg.delete().catch(()=>null), 7000))
                        .catch(() => null);
                }
                linkViolations.delete(message.author.id); // sıfırla
            } else {
                // Uyarı mesajını arkadan gönder, olayı bekletme
                message.channel.send(`${message.author}, bu sunucuda link paylaşmak yasaktır! (${linkCount}/5 İhlal)`)
                    .then(warnMsg => {
                        setTimeout(() => warnMsg.delete().catch(() => {}), 4000);
                    })
                    .catch(() => {});
            }

            // Log gönderme işlemini asenkron yap
            try {
                if (fsSync.existsSync(logDataPath)) {
                    const fileContent = await fs.readFile(logDataPath, 'utf8');
                    const logData = JSON.parse(fileContent);
                    const linkLogId = logData['lrlink-log'];
                    
                    if (linkLogId) {
                        const linkChannel = message.guild.channels.cache.get(linkLogId) || await message.guild.channels.fetch(linkLogId).catch(() => null);
                        if (linkChannel) {
                            const embed = new EmbedBuilder()
                                .setColor(0xFFA500)
                                .setTitle('🔗 Link Engellendi' + (linkCount >= 5 ? ' & Timeout Atıldı!' : '!'))
                                .setDescription(`**Kullanıcı:** ${message.author} (\`${message.author.id}\`)\n**Kanal:** ${message.channel}\n**İhlal Sayısı:** ${linkCount}/5\n**Mesaj İçeriği:**\n\`${message.content}\``)
                                .setFooter({ text: `${cfg.footer.text} | Anti-Link` })
                                .setTimestamp();
                            
                            // Beklemeden logu at
                            linkChannel.send({ embeds: [embed] }).catch(() => {});
                        }
                    }
                }
            } catch (err) {
                console.error("Link log hatası:", err);
            }
        }
    }
};
