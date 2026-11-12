// commands/setup.js
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const config = require('../config.json');
const BRAND_NAME = `${config.footer.text}`;
const COLORS = { start: 0xf1c40f, step: 0x9b59b6, warn: 0xe67e22, done: 0x1abc9c };
const LOG_FILE = path.join(__dirname, '../data/log.json');

/* ---------------- JSON helpers ---------------- */
function loadLog() {
  if (!fs.existsSync(LOG_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); }
  catch { return {}; }
}
function saveLog(data) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function stripName(name) {
  if (name.includes('┆')) return name.slice(name.lastIndexOf('┆') + 1).trim();
  if (name.includes('┇')) return name.slice(name.lastIndexOf('┇') + 1).trim();
  return name.replace(/^[^\w-]+/, '').trim();
}

/* ---------------- PLAN (Senin İstediğin) ---------------- */
const PLAN = [
  {
    category: "</ CEZA LOG />",
    color: COLORS.step,
    channels: [
      { name: "lrceza-log", emoji: "❗️" },
      { name: "lrwarn-log", emoji: "❗️" }
    ],
    successText: "Ceza sistemi başarıyla {AKSİYON}."
  },
  {
    category: "</ GUARD LOG />",
    color: COLORS.step,
    channels: [
      { name: "lrguard-log", emoji: "🌐" },
      { name: "lrrole-log", emoji: "🌐" },
      { name: "lrchannel-log", emoji: "🌐" },
      { name: "lrserver-log", emoji: "🌐" }
    ],
    successText: "Guard log sistemi {AKSİYON}."
  },
  {
    category: "</ LR LOG />",
    color: COLORS.step,
    channels: [
      { name: "lrgiris-log", emoji: "💻" },
      { name: "lrcikis-log", emoji: "💻" },
      { name: "lrcommand-log", emoji: "💻" },
      { name: "lrmember-log", emoji: "💻" },
      { name: "lrvoice-log", emoji: "💻" }
    ],
    successText: "Lr log sistemi başarıyla {AKSİYON}."
  }
];

/* ---------------- helpers ---------------- */
function baseEmbed(guild, color, title) {
  return new EmbedBuilder()
    .setAuthor({ name: guild.name, iconURL: guild.iconURL({ size: 256 }) || undefined })
    .setColor(color)
    .setTitle(title)
    .setFooter({ text: BRAND_NAME });
}

async function createIfNotExists(guild, planItem) {
  const logData = loadLog();

  let cat = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name === planItem.category
  );
  if (!cat) {
    cat = await guild.channels.create({
      name: planItem.category,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [{
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      }]
    });
  }

  for (const chInfo of planItem.channels) {
    const fullName = `${chInfo.emoji} ┇ ${chInfo.name}`;
    let ch = guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.parentId === cat.id && c.name === fullName
    );
    if (!ch) {
      ch = await guild.channels.create({
        name: fullName,
        type: ChannelType.GuildText,
        parent: cat.id
      });
    }
    logData[chInfo.name] = ch.id;
  }

  saveLog(logData);
}

async function deleteIfExists(guild, planItem, skipChannelId) {
  const logData = loadLog();

  const cat = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name === planItem.category
  );
  if (!cat) return;

  const children = Array.from(guild.channels.cache.filter(ch => ch.parentId === cat.id).values());
  for (const ch of children) {
    if (ch.id === skipChannelId) continue;
    delete logData[stripName(ch.name)];
    await ch.delete().catch(() => { });
  }

  const stillHasChildren = guild.channels.cache.some(ch => ch.parentId === cat.id);
  if (!stillHasChildren) {
    await cat.delete().catch(() => { });
  }
  saveLog(logData);
}

/* ---------------- command ---------------- */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Log kanallarını kurar (aç) veya siler (kapat).')
    .addStringOption(opt =>
      opt.setName('durum')
        .setDescription('Kanalları aç ya da kapat')
        .setRequired(true)
        .addChoices(
          { name: 'AC', value: 'ac' },
          { name: 'KAPA', value: 'kapat' }
        )
    ),

  async execute(interaction) {
    const isOwnerUser = config.ownerId.includes(interaction.user.id);
    const isOwnerRole = config.ownerRoleId && interaction.member?.roles?.cache?.has(config.ownerRoleId);
    if (!isOwnerUser && !isOwnerRole) {
      return interaction.reply({ content: '❌ Bu komutu sadece bot sahibi kullanabilir!', ephemeral: true });
    }

    const { guild, channel } = interaction;
    const mode = interaction.options.getString('durum');
    const AKSIYON = mode === 'ac' ? 'açıldı' : 'silindi';

    await interaction.deferReply({ ephemeral: true });
    const post = (embed) => channel.send({ embeds: [embed] });

    await post(baseEmbed(guild, COLORS.start,
      mode === 'ac' ? 'KANALLAR KURULUYOR…' : 'KANALLAR SİLİNİYOR…'
    ));

    for (const step of PLAN) {
      if (mode === 'ac') {
        await createIfNotExists(guild, step);
      } else {
        await deleteIfExists(guild, step, channel.id);
      }
      await post(baseEmbed(guild, step.color,
        step.successText.replace('{AKSİYON}', AKSIYON)
      ));
    }

    await post(baseEmbed(guild, COLORS.done,
      mode === 'ac' ? 'Kurulumlar Tamamlandı (AÇIK).' : 'Tüm log kanalları silindi (KAPALI).'
    ));

    await interaction.deleteReply().catch(() => { });
  }
};