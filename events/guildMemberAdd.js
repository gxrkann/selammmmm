const {
  Events,
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const canvafy = require('canvafy');
const { createCanvas, loadImage, CanvasRenderingContext2D } = require('canvas');
const fs = require('fs');
const path = require('path');

const cfg = require('../config.json');

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

/* 👉 YENİ: sayı -> emoji haritası */
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

/* küçük yardımcı */
const trDate = (d = new Date()) =>
  new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);

/* ---------------- yardımcılar: uyku & presence zorlama ---------------- */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/* presence'ı birden çok yerden okumayı deneyen yardımcı */
function getPresence(member) {
  if (member?.presence) return member.presence;
  const viaGuild = member?.guild?.presences?.resolve?.(member.id);
  if (viaGuild) return viaGuild;
  return null;
}

async function ensurePresenceStrong(member) {
  const tries = 10;
  let delay = 350;

  for (let i = 0; i < tries; i++) {
    try {
      await member.fetch(true).catch(() => { });
      await member.guild.members.fetch({ user: member.id, withPresences: true }).catch(() => { });
      await member.guild.members.fetch({ withPresences: true }).catch(() => { });
      const p = getPresence(member);
      if (p?.status || p?.clientStatus) return p;
    } catch (_) { }
    await sleep(delay);
    delay = Math.min(delay + 250, 1500);
  }
  return getPresence(member);
}

/* --------- Cihaz ve durum yardımcıları --------- */
function pickPresenceStatus(member) {
  const p = getPresence(member);
  if (!p) return { icon: '⚫', text: 'Çevrimdışı' };
  if (p.clientStatus && p.status === 'offline') {
    return { icon: '🟢', text: 'Çevrimiçi' };
  }
  switch (p.status) {
    case 'online': return { icon: '🟢', text: 'Çevrimiçi' };
    case 'idle': return { icon: '🌙', text: 'Boşta' };
    case 'dnd': return { icon: '🔴', text: 'Rahatsız Etme' };
    default: return { icon: '⚫', text: 'Çevrimdışı' };
  }
}

function pickActiveDevice(member) {
  const cs = getPresence(member)?.clientStatus || {};
  if (cs.desktop) return { icon: '💻', text: 'Bilgisayar / Uygulama' };
  if (cs.mobile) return { icon: '📱', text: 'Mobil / Uygulama' };
  if (cs.web) return { icon: '🌐', text: 'İnternet / Site' };
  return { icon: '❓', text: 'Bilinmiyor' };
}

function buildSecurityMessage(member) {
  const { icon: statIcon, text: statText } = pickPresenceStatus(member);
  const dev = pickActiveDevice(member);
  return (
    `🔹 **Kullanıcı:** <@${member.id}>
  🔹 **Hesap durumu:** (${statIcon}) ${statText}
  🔹 **Giriş yaptığı cihaz:** \`(${dev.icon}) ${dev.text}\``
  );
}

/* --------------- Canvafy welcome --------------- */
async function makeWelcomeCard(member) {
  const avatarURL = member.user.displayAvatarURL({ forceStatic: true, extension: 'png', size: 256 });
  const buffer = await new canvafy.WelcomeLeave()
    .setAvatar(avatarURL)
    .setBackground('color', '#23272a')
    .setTitle('Hoşgeldin!', '#ffffff')
    .setDescription('Sunucumuza hoşgeldin, kuralları okumayı unutma!', '#cfd7dd')
    .setBorder('#9ad7e9')
    .setAvatarBorder('#E4B44B')
    .setOverlayOpacity(0.3)
    .build();
  return buffer;
}

/* --------------- Güvenlik kartı --------------- */

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function makeSecurityCard({ avatarURL, dateText, isTrusted }) {
  const W = 500, H = 100;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  roundedRect(ctx, 0, 0, W, H, 30);
  ctx.fill();

  ctx.fillStyle = '#23272a';
  roundedRect(ctx, 6, 6, W - 12, H - 12, 24);
  ctx.fill();

  ctx.fillStyle = '#191b1d';
  roundedRect(ctx, 16, 16, W - 32, H - 32, 20);
  ctx.fill();

  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(dateText, 30, H / 2);

  const avSize = 56;
  const avCX = W / 2;
  const avCY = H / 2;

  const avatar = await loadImage(avatarURL);
  ctx.save();
  ctx.beginPath();
  ctx.arc(avCX, avCY, avSize / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(avatar, avCX - avSize / 2, avCY - avSize / 2, avSize, avSize);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(avCX, avCY, avSize / 2 + 3, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;

  const icCX = W - 60, icCY = H / 2;
  const ring = isTrusted ? '#2BFF63' : '#FF9F1A';
  const innerCol = isTrusted ? '#0F1712' : '#2B1C10';

  ctx.beginPath();
  ctx.arc(icCX, icCY, 20, 0, Math.PI * 2);
  ctx.fillStyle = innerCol;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = ring;
  ctx.shadowColor = ring;
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = ring;

  if (isTrusted) {
    ctx.beginPath();
    ctx.moveTo(icCX - 8, icCY);
    ctx.lineTo(icCX - 2, icCY + 7);
    ctx.lineTo(icCX + 9, icCY - 6);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(icCX, icCY - 10);
    ctx.lineTo(icCX, icCY + 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(icCX, icCY + 10, 2, 0, Math.PI * 2);
    ctx.fillStyle = ring;
    ctx.fill();
  }

  return canvas.toBuffer('image/png');
}

// Canvas API'ye yuvarlatılmış rect desteği ekleme
CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
  this.beginPath();
  this.moveTo(x + r, y);
  this.arcTo(x + w, y, x + w, y + h, r);
  this.arcTo(x + w, y + h, x, y + h, r);
  this.arcTo(x, y + h, x, y, r);
  this.arcTo(x, y, x + w, y, r);
  this.closePath();
  return this;
};

/* ------------------------------ Event ------------------------------ */
module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    try {
      await ensurePresenceStrong(member);

      const createdAt = member.user.createdAt;
      const isTrusted = (Date.now() - createdAt.getTime()) >= THREE_MONTHS_MS;

      const buffer = await makeWelcomeCard(member);
      const attachment = new AttachmentBuilder(buffer, { name: 'welcome.png' });

      const statusText = isTrusted ? 'Güvenli ✓' : 'İnceleme Gerekli ⚠️';
      const embed = new EmbedBuilder()
        .setTitle(`${cfg.serverName}`)
        .setURL(cfg.joinUrl)
        .setAuthor({
          name: `${member.guild.name} Hoş Geldinn!`,
          iconURL: member.guild.iconURL({ size: 256 }) || undefined
        })
        .setDescription(
          `🔹 · \`Kullanıcı:\` ${member} - \`${member.id}\`\n` +
          `🔹 · \`Kullanıcı ID:\` ${member.id}\n` +
          `🔹 · \`Hesap oluşturma tarihi:\` <t:${Math.floor(member.user.createdTimestamp / 1000)}:f>\n` +
          `🔹 · \`Sunucuya giriş sırası:\` ${member.guild.memberCount}\n` +
          `🔹 · \`Hesap güvenliği:\` ${statusText}\n\n` +
          `🔹 · Merhabalar, sunucumuza hoşgeldin! Katıldığın için üzerine **Kayıtsız Üye** rolünü verdim.`
        )
        .setColor("#92c8dd")
        .setImage('attachment://welcome.png')
        .setThumbnail(member.guild.iconURL({ size: 256 }))
        .setFooter({ text: cfg.footer.text, iconURL: member.guild.iconURL({ size: 256 }) });

      await member.user.send({ embeds: [embed], files: [attachment] });

      const avatarURL = member.user.displayAvatarURL({ forceStatic: true, extension: 'png', size: 256 });
      const dateTR = createdAt.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
      const secPng = await makeSecurityCard({ avatarURL, dateText: dateTR, isTrusted });
      const secAttachment = new AttachmentBuilder(secPng, { name: 'security.png' });

      // log.json'dan lunerissecurity-log kanal ID'sini al
      const logData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/log.json'), 'utf8'));
      const secLogId = logData['lrmember-log'];
      if (!secLogId) return;

      const logCh =
        member.guild.channels.cache.get(secLogId) ||
        await member.guild.channels.fetch(secLogId).catch(() => null);

      if (!logCh) return;

      await logCh.send({ files: [secAttachment], content: buildSecurityMessage(member) });

      const joinLogId = logData['lrgiris-log'];
      if (joinLogId) {
        const joinCh =
          member.guild.channels.cache.get(joinLogId) ||
          await member.guild.channels.fetch(joinLogId).catch(() => null);

        if (joinCh?.isTextBased()) {
          const countEmoji = numToEmoji(member.guild.memberCount);
          const desc =
            `> 🔹 <@${member.id}> kişisi <t:${Math.floor(member.user.createdTimestamp / 1000)}:R> açılmış hesabıyla ` +
            `<t:${Math.floor(Date.now() / 1000)}:R> sunucuya giriş yaptı! ` +
            `Sunucumuz artık ${countEmoji} kişi!`;

          const joinEmbed = new EmbedBuilder()
            .setColor('#046404')
            .setAuthor({ name: `${member.user.username}`, iconURL: member.displayAvatarURL({ size: 256 }) })
            .setDescription(desc)
            .addFields(
              { name: '🔹 Kullanıcı ID', value: `\`\`\`fix\n${member.id}\n\`\`\`` },
              { name: '🔹 Sunucuya Giriş Tarihi', value: `\`\`\`fix\n${trDate()}\n\`\`\`` }
            )
            .setThumbnail(member.displayAvatarURL({ size: 256 }))
            .setFooter({ text: "Gxrkan | Log Sistemi." });

          await joinCh.send({ embeds: [joinEmbed] }).catch(() => { });
        }
      }

      // Karşılama mesajı (config.json > welcomeChannelId)
      const welcomeChannelId = cfg.welcomeChannelId;
      const welcomeCh = welcomeChannelId
        ? (member.guild.channels.cache.get(welcomeChannelId) || await member.guild.channels.fetch(welcomeChannelId).catch(() => null))
        : null;

      if (welcomeCh?.isTextBased()) {
        const welcomeEmbed = new EmbedBuilder()
          .setAuthor({ name: `${cfg.footer.text} Bot System` })
          .setDescription(`<@${member.id}>\n*Sunucumuza hoş geldin! Seninle birlikte ${member.guild.memberCount} kişiyiz.*`)
          .setColor('#2B2D31');
        await welcomeCh.send({ embeds: [welcomeEmbed] }).catch(console.error);
      }

    } catch (err) {
      console.error(`🔹 ${member.user.tag} DM/log gönderilemedi:`, err);
    }
  }
};
