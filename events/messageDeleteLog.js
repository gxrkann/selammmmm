const { Events, EmbedBuilder } = require('discord.js');
const log = require('../data/log.json'); // {"lunerismsg-log": "KANAL_ID"}

// TR tarih helper
const trDate = (d = new Date()) =>
  new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(d);

module.exports = {
  name: Events.MessageDelete,
  async execute(message) {
    try {
      if (!message?.guild) return;
      if (message.author?.bot) return;

      // Partials için
      if (message?.partial) { try { await message.fetch(); } catch { } }

      const logChId = log['lrmember-log'];
      if (!logChId) return;

      const logCh =
        message.guild.channels.cache.get(logChId) ||
        await message.guild.channels.fetch(logChId).catch(() => null);
      if (!logCh?.isTextBased()) return;

      const content = (message.content ?? '').trim();
      const body = content || (message.attachments?.size ? '[Ek(ler) vardı]' : 'İçerik yok / alınamadı.');

      const embed = new EmbedBuilder()
        .setAuthor({
          name: `${message.member?.displayName ?? message.author?.username ?? 'Kullanıcı'}`,
          iconURL: message.author?.displayAvatarURL({ size: 256 }) ?? undefined
        })
        .setDescription(`> <#${message.channelId}> kanalında bir mesaj sildi.`)
        .addFields(
          { name: '🔹 **Mesaj İçeriği**', value: `\`\`\`fix\n${body}\n\`\`\``, inline: false },
          { name: '🔹 **Mesaj Kanalı**', value: `\`\`\`fix\n#${message.channel?.name ?? 'kanal'} - ${message.channelId}\n\`\`\``, inline: false },
          { name: '🔹 **Mesaj Silinme Zamanı**', value: `\`\`\`fix\n${trDate()}\n\`\`\``, inline: false }
        )
        .setThumbnail(message.author?.displayAvatarURL({ size: 256 }) ?? null)
        .setColor(0xff0000) // silme için kırmızı
        .setFooter({ text: "Gxrkan | Log Sistemi." });

      await logCh.send({ embeds: [embed] }).catch(() => { });
    } catch (err) {
      console.error('Mesaj silme logu gönderilemedi:', err);
    }
  }
};
