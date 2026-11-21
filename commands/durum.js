// commands/durum.js
// Botun durumunu değiştirir: yazı (oynuyor/dinliyor/...), resim ve online durumu.
// Sadece bot sahipleri. Ayarlar data/status.json'a yazılır, restart'ta korunur.
const { SlashCommandBuilder, EmbedBuilder, ActivityType } = require('discord.js');
const config = require('../utils/env');
const status = require('../utils/status');

const TIPLER = [
    { label: '🎮 Oynuyor', value: ActivityType.Playing },
    { label: '📺 İzliyor', value: ActivityType.Watching },
    { label: '🎵 Dinliyor', value: ActivityType.Listening },
    { label: '🏁 Yarışıyor', value: ActivityType.Competing },
    { label: '✏️ Özel', value: ActivityType.Custom },
];

const DURUMLAR = ['online', 'idle', 'dnd', 'invisible'];

function isAuthorized(interaction) {
    if (Array.isArray(config.ownerId) && config.ownerId.includes(interaction.user.id)) return true;
    if (config.ownerRoleId && interaction.member?.roles?.cache?.has(config.ownerRoleId)) return true;
    return false;
}

function tipLabel(type) {
    const t = TIPLER.find(x => x.value === type);
    return t ? t.label : '🎮 Oynuyor';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('durum')
        .setDescription('Botun durumunu (oynuyor/dinliyor...) yazısını ve resmini değiştirir')
        .addStringOption(o => o.setName('yazin').setDescription('Durumda görünecek yazı (örn: Gxrkan | Ekip)').setMaxLength(128).setRequired(false))
        .addStringOption(o => o.setName('tip').setDescription('Durum tipi').addChoices(...TIPLER.map(t => ({ name: t.label, value: String(t.value) }))).setRequired(false))
        .addAttachmentOption(o => o.setName('resim').setDescription('Durumda görünecek resim (yükle)').setRequired(false))
        .addStringOption(o => o.setName('resimurl').setDescription('Resim URL\'si (https://... — kalıcı hosting önerilir)').setMaxLength(512).setRequired(false))
        .addBooleanOption(o => o.setName('resmi_kaldir').setDescription('Durum resmini kaldır').setRequired(false))
        .addStringOption(o => o.setName('online').setDescription('Botun çevrimiçi görünümü').addChoices(
            { name: '🟢 online', value: 'online' },
            { name: '🌙 idle', value: 'idle' },
            { name: '🔴 dnd (meşgul)', value: 'dnd' },
            { name: '⚫ invisible (görünmez)', value: 'invisible' },
        ).setRequired(false))
        .addBooleanOption(o => o.setName('sifirla').setDescription('Her şeyi varsayılana sıfırla').setRequired(false)),

    async execute(interaction) {
        if (!isAuthorized(interaction)) {
            return interaction.reply({ content: '❌ Bu komutu sadece **bot sahipleri** kullanabilir!', ephemeral: true });
        }

        const yazin = interaction.options.getString('yazin');
        const tipStr = interaction.options.getString('tip');
        const resim = interaction.options.getAttachment('resim');
        const resimUrl = interaction.options.getString('resimurl');
        const resmiKaldir = interaction.options.getBoolean('resmi_kaldir');
        const online = interaction.options.getString('online');
        const sifirla = interaction.options.getBoolean('sifirla');

        // Hiçbir seçenek yoksa → mevcut durumu göster
        const birSeyVerildi = [yazin, tipStr, resim, resimUrl, resmiKaldir, online, sifirla].some(v => v !== null && v !== undefined && v !== false);
        if (!birSeyVerildi) {
            return interaction.reply({ embeds: [buildSummary(status.get())], ephemeral: true });
        }

        if (sifirla) {
            status.reset();
            status.apply(interaction.client);
            return interaction.reply({ embeds: [
                new EmbedBuilder().setColor('#2ecc71').setTitle('♻️ Durum sıfırlandı')
                    .setDescription(`Varsayılana dönüldü: \`${config.footer.text} | Ekip Sistemi\` (Oynuyor)`)
                    .setFooter({ text: config.footer.text }),
            ], ephemeral: true });
        }

        const patch = {};

        if (yazin) patch.text = yazin;
        if (tipStr) patch.type = Number(tipStr);

        // Resim: yükleme mı, URL mi?
        if (resim) {
            if (resim.contentType && !resim.contentType.startsWith('image/')) {
                return interaction.reply({ content: '❌ Bu dosya bir resim değil! Sadece görsel yükleyin (png/jpg/gif/webp).', ephemeral: true });
            }
            if (resim.size > 8 * 1024 * 1024) {
                return interaction.reply({ content: '❌ Resim çok büyük! (En fazla 8 MB)', ephemeral: true });
            }
            patch.imageUrl = resim.url;
        } else if (resimUrl) {
            if (!/^https?:\/\/\S+$/i.test(resimUrl)) {
                return interaction.reply({ content: '❌ Geçersiz resim URL\'si! `https://...` ile başlamalı.', ephemeral: true });
            }
            patch.imageUrl = resimUrl;
        } else if (resmiKaldir) {
            patch.imageUrl = null;
        }

        if (online) {
            if (!DURUMLAR.includes(online)) {
                return interaction.reply({ content: '❌ Geçersiz online durumu!', ephemeral: true });
            }
            patch.status = online;
        }

        // Özel durumda resim gösterilmez — uyar
        if (patch.type === ActivityType.Custom && patch.imageUrl) {
            return interaction.reply({ content: '❌ **Özel (✏️)** durum tipinde resim gösterilemez! `tip` olarak başka bir tür seçin.', ephemeral: true });
        }

        const yeni = status.set(patch);
        status.apply(interaction.client);

        return interaction.reply({ embeds: [buildSummary(yeni)], ephemeral: true });
    },
};

function buildSummary(st) {
    const tip = tipLabel(st.type);
    const yazi = st.text ?? `${config.footer.text} | Ekip Sistemi`;

    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🤖 Durum Güncellendi')
        .addFields(
            { name: '📝 Yazı', value: `\`${yazi}\``, inline: true },
            { name: '🎯 Tip', value: tip, inline: true },
            { name: '🖼️ Resim', value: st.imageUrl ? '✅ Var' : '❌ Yok', inline: true },
            { name: '🟢 Online', value: `\`${st.status}\``, inline: true },
        )
        .setFooter({ text: 'Ayarlar restart\'ta korunur.' });

    if (st.imageUrl) embed.setThumbnail(st.imageUrl);

    if (st.type === ActivityType.Custom) {
        embed.setDescription('ℹ️ **Özel** tipinde resim gösterilmez, sadece yazı görünür.');
    } else if (!st.imageUrl) {
        embed.setDescription('ℹ️ Resim eklemek için: `/durum resim:<görsel yükle>`');
    }

    return embed;
}
