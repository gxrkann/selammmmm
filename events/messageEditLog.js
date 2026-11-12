const { Events, EmbedBuilder } = require('discord.js');
const log = require('../data/log.json'); // {"lunerismsg-log":"KANAL_ID"} veya {"lunerismessage-log":"KANAL_ID"}

// TR tarih helper
const trDate = (d = new Date()) =>
  new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(d);

module.exports = {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    try {
      // DM / bot mesajları yok
      if (!newMessage?.guild) return;
      if (newMessage.author?.bot) return;

      // Partials ise fetch etmeyi dene
      if (oldMessage?.partial) { try { await oldMessage.fetch(); } catch { } }
      if (newMessage?.partial) { try { await newMessage.fetch(); } catch { } }

      // LOG kanalı ID (luneris anahtarını kullan)
      const logChId = log['lrmember-log'];
      if (!logChId) return;

      const logCh =
        newMessage.guild.channels.cache.get(logChId) ||
        await newMessage.guild.channels.fetch(logChId).catch(() => null);
      if (!logCh?.isTextBased()) return;

      // İçerikler (Message Content intent yoksa boş gelebilir)
      const oldContent = (oldMessage?.content ?? '').trim();
      const newContent = (newMessage?.content ?? '').trim();

      const oldHadAtch = !!oldMessage?.attachments?.size;
      const newHadAtch = !!newMessage?.attachments?.size;

      // İçerik aynıysa ve ek durumu da değişmediyse log atma
      const contentSame = oldContent === newContent;
      const attachSame = oldHadAtch === newHadAtch;
      if (contentSame && attachSame) return;

      // Fallback metinler
      const oldText =
        oldContent ||
        (oldHadAtch ? '[Ek(ler) vardı]' : 'İçerik yok / alınamadı.');
      const newText =
        newContent ||
        (newHadAtch ? '[Ek(ler) var]' : 'İçerik yok / alınamadı.');

      // İsim/pp güvenli al
      const displayName = newMessage.member?.displayName || newMessage.author?.username || 'Kullanıcı';
      const avatarURL = newMessage.author?.displayAvatarURL({ size: 256 }) || undefined;

      const embed = new EmbedBuilder()
        .setAuthor({ name: displayName, iconURL: avatarURL })
        .setDescription(`> <#${newMessage.channelId}> kanalında bir mesaj düzenledi.`)
        .addFields(
          { name: '🔹 **Eski Mesaj İçeriği**', value: `\`\`\`fix\n${oldText}\n\`\`\``, inline: false },
          { name: '🔹 **Yeni Mesaj İçeriği**', value: `\`\`\`fix\n${newText}\n\`\`\``, inline: false },
          { name: '🔹 **Mesaj Kanalı**', value: `\`\`\`fix\n#${newMessage.channel?.name ?? 'kanal'} - ${newMessage.channelId}\n\`\`\``, inline: false },
          { name: '🔹 **Mesaj Düzenleme Zamanı**', value: `\`\`\`fix\n${trDate()}\n\`\`\``, inline: false },
        )
        .setThumbnail(avatarURL ?? null)
        .setColor(0xf1c40f)
        .setFooter({ text: "Gxrkan | Log Sistemi." });

      await logCh.send({ embeds: [embed] }).catch(() => { });
    } catch (err) {
      console.error('Mesaj düzenleme logu gönderilemedi:', err);
    }
  }
};
