const { Events, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const cfg = require('../config.json');

/* 👉 Sayı -> emoji haritası */
const DIGIT_EMOJIS = {
  '0': '🔹',
  '1': '🔹',
  '2': '🔹',
  '3': '🔹',
  '4': '🔹',
  '5': '🔹',
  '6': '🔹',
  '7': '🔹',
  '8': '🔹',
  '9': '🔹'
};

const numToEmoji = (n) => String(n).split('').map(d => DIGIT_EMOJIS[d] ?? d).join(' ');

/* Türkçe tarih formatı */
const trDate = (d = new Date()) =>
  new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    try {
      /* ---------- ETKİNLİK TEMİZLİĞİ ---------- */
      // Sunucudan ayrılan kişi aktif etkinlikte kayıtlıysa listeden düşürülür;
      // perm verilmiş durumdaysa Discord rolü otomatik çeker, ayrıca embed güncellenir.
      try {
        const etkinlik = require('../commands/etkinlik');
        await etkinlik.handleMemberLeave(member);
      } catch (e) {
        console.error('Etkinlik üye çıkış temizliği hatası:', e);
      }

      // log.json'dan luneriscikis-log kanal ID'sini al
      const logData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/log.json'), 'utf8'));
      const exitLogChannelId = logData['lrcikis-log'];

      if (!exitLogChannelId) {
        console.log('luneriscikis-log kanalı bulunamadı');
        return;
      }

      // Kanalı bul
      const logChannel = member.guild.channels.cache.get(exitLogChannelId);
      if (!logChannel) {
        console.log('Çıkış log kanalı bulunamadı:', exitLogChannelId);
        return;
      }

      const user = member.user;
      const guild = member.guild;
      const currentMemberCount = guild.memberCount;
      const accountCreatedTime = Math.floor(user.createdTimestamp / 1000);
      const exitTime = Math.floor(Date.now() / 1000);

      // Kullanıcının rollerini al (everyone hariç)
      const userRoles = member.roles.cache
        .filter(role => role.id !== guild.id)
        .map(role => role.name)
        .join(', ') || 'Rol yok';

      // Ana mesaj
      const mainMessage = `> 🔹 <@${user.id}> kişisi <t:${accountCreatedTime}:R> açılmış hesabiyla <t:${exitTime}:R> sunucudan çıkış yaptı! Sunucumuz artık ${numToEmoji(currentMemberCount)} kişi!`;

      // Embed oluştur
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setAuthor({
          name: user.username,
          iconURL: user.displayAvatarURL(),
        })
        .setThumbnail(user.displayAvatarURL())
        .setDescription(mainMessage)
        .addFields(
          {
            name: '🔹 Kullanıcı ID',
            value: `\`\`\`fix\n${user.id}\`\`\``,
            inline: false
          },
          {
            name: '🔹 Sunucudan Çıkış Tarihi',
            value: `\`\`\`fix\n${trDate(new Date(exitTime * 1000))}\`\`\``,
            inline: false
          },
          {
            name: '🔹 Kişinin Rolleri',
            value: `\`\`\`fix\n${userRoles}\`\`\``,
            inline: false
          }
        )
        .setFooter({
          text: `${cfg.footer.text} | Log Sistemi`,
          iconURL: member.guild.iconURL() || undefined,
        })
        .setTimestamp();

      // Log kanalına gönder
      await logChannel.send({ embeds: [embed] });

      // ---- KICK LOG (Ceza Log) ----
      const { AuditLogEvent } = require('discord.js');
      const fetchedLogs = await guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MemberKick,
      }).catch(() => null);

      const kickLog = fetchedLogs ? fetchedLogs.entries.first() : null;

      // Eğer son 5 saniye içinde bu kullanıcıya kick atılmışsa
      if (kickLog && kickLog.target.id === user.id && Date.now() - kickLog.createdTimestamp < 5000) {
        const kicker = kickLog.executor;
        const reason = kickLog.reason || 'Belirtilmedi';

        const cezaLogId = logData['lrceza-log'];
        const cezaChannel = guild.channels.cache.get(cezaLogId) || await guild.channels.fetch(cezaLogId).catch(() => null);

        if (cezaChannel) {
          const kickEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
            .setTitle('🔹 Kullanıcı Sunucudan Atıldı (Kick)')
            .setDescription(`**Atılan Kullanıcı:** ${user} (\`${user.id}\`)\n**Atan Yetkili:** ${kicker} (\`${kicker.id}\`)\n**Sebep:** \`${reason}\``)
            .setFooter({ text: `${cfg.footer.text} | Ceza Log` })
            .setTimestamp();

          await cezaChannel.send({ embeds: [kickEmbed] }).catch(() => { });
        }
      }

    } catch (error) {
      console.error('Çıkış log hatası:', error);
    }
  },
};
