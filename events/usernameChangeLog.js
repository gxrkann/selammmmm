const { Events, EmbedBuilder } = require('discord.js');
const log = require('../data/log.json');

// TR tarih helper
const trDate = (d = new Date()) =>
  new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(d);

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    try {
      // Username veya nickname değişikliği kontrolü
      const usernameChanged = oldMember.user.username !== newMember.user.username;
      const nicknameChanged = oldMember.nickname !== newMember.nickname;

      if (!usernameChanged && !nicknameChanged) {
        return; // Değişiklik yoksa çık
      }

      // Log kanalını al
      const logChId = log['lrmember-log'];
      if (!logChId) return;

      const logCh = newMember.guild.channels.cache.get(logChId) || await newMember.guild.channels.fetch(logChId).catch(() => null);
      if (!logCh?.isTextBased()) return;

      // Embed oluştur - görseldeki stile uygun
      const embed = new EmbedBuilder()
        .setAuthor({
          name: `${newMember.user.username}`,
          iconURL: newMember.user.displayAvatarURL({ size: 256 })
        })
        .setDescription(`> <@${newMember.user.id}> tarafından <@${newMember.user.id}> kişisinin kullanıcı adı güncellendi.`)
        .addFields(
          {
            name: '🔹 **Eski Adı**',
            value: `\`\`\`fix\n${usernameChanged ? oldMember.user.username : (oldMember.nickname || 'Yok')}\n\`\`\``,
            inline: false
          },
          {
            name: '🔹 **Yeni Adı**',
            value: `\`\`\`fix\n${newMember.user.username}\n\`\`\``,
            inline: false
          },
          {
            name: '🔹 **Değiştiren Kişi**',
            value: `\`\`\`fix\n<@${newMember.user.id}>\n\`\`\``,
            inline: false
          },
          {
            name: '🔹 **Sebep**',
            value: `\`\`\`fix\nBelirtilmemiş\n\`\`\``,
            inline: false
          }
        )
        .setThumbnail(newMember.user.displayAvatarURL({ size: 256 }))
        .setColor(0xe91e63) // Pembe/magenta renk (görseldeki gibi)
        .setFooter({ text: "Gxrkan | Log Sistemi." });

      await logCh.send({ embeds: [embed] }).catch((sendErr) => {
        console.error('Embed gönderilirken hata:', sendErr);
      });
    } catch (err) {
      console.error('Kullanıcı adı değişikliği logu gönderilemedi:', err);
    }
  }
};
