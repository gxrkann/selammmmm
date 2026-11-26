// commands/etiket.js
// Discord "Sunucu Etiketi" rolü: sunucunun etiketini profilinde taşıyan üyeye
// rol verilir, etiketi kaldırınca rol geri alınır. Ayar data/etiket.json'a yazılır.
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../utils/env');
const etiket = require('../utils/etiket');

function isAuthorized(interaction) {
    if (Array.isArray(config.ownerId) && config.ownerId.includes(interaction.user.id)) return true;
    if (config.ownerRoleId && interaction.member?.roles?.cache?.has(config.ownerRoleId)) return true;
    return false;
}

function buildSummary(st, guild) {
    const rol = st.roleId ? guild.roles.cache.get(st.roleId) : null;
    const rolYazi = st.roleId ? (rol ? `${rol}` : `<@&${st.roleId}> (silinmiş!)`) : '❌ Ayarlanmadı';

    return new EmbedBuilder()
        .setColor(st.enabled && st.roleId ? '#2ecc71' : '#e74c3c')
        .setTitle('🏷️ Sunucu Etiketi Ayarları')
        .addFields(
            { name: '🎭 Verilecek rol', value: rolYazi, inline: true },
            { name: '🟢 Durum', value: st.enabled && st.roleId ? '✅ Aktif' : '⛔ Kapalı', inline: true },
        )
        .setDescription(
            'Sunucunun **Etiketini** profilinde taşıyan üyeye bu rol verilir; ' +
            'üye etiketi kaldırınca rol otomatik geri alınır. ' +
            'Kontrol anları: etiket değişince, sunucuya girişte, açılışta ve periyodik tarama.'
        )
        .setFooter({ text: config.footer.text });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('etiket')
        .setDescription('Sunucu Etiketi rolünü ayarlar (etiketi taşıyana rol verilir)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addRoleOption(o => o.setName('rol').setDescription('Etiketi taşıyana verilecek rol').setRequired(false))
        .addBooleanOption(o => o.setName('kapat').setDescription('Etiket sistemini kapat').setRequired(false))
        .addBooleanOption(o => o.setName('tara').setDescription('Tüm üyeleri şimdi tara').setRequired(false)),

    async execute(interaction) {
        if (!isAuthorized(interaction)) {
            return interaction.reply({ content: '❌ Bu komutu sadece **bot sahipleri** veya **Boss** rolü kullanabilir!', ephemeral: true });
        }

        const rol = interaction.options.getRole('rol');
        const kapat = interaction.options.getBoolean('kapat');
        const tara = interaction.options.getBoolean('tara');

        // Hiçbir seçenek yoksa → mevcut durumu göster
        if (!rol && !kapat && !tara) {
            return interaction.reply({ embeds: [buildSummary(etiket.get(), interaction.guild)], ephemeral: true });
        }

        if (kapat) {
            etiket.disable();
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('⛔ Etiket Sistemi Kapatıldı')
                    .setDescription('Artık etiket değişikliklerinde rol verilip alınmayacak. Mevcut roller korundu. `/etiket rol:@Rol` yazarak tekrar açabilirsin.')
                    .setFooter({ text: config.footer.text })],
                ephemeral: true,
            });
        }

        // --- Rol doğrulama ---
        if (rol) {
            if (rol.id === interaction.guild.id) {
                return interaction.reply({ content: '❌ `@everyone` rolü seçilemez!', ephemeral: true });
            }
            if (rol.managed) {
                return interaction.reply({ content: '❌ Bu rol yönetilen bir roldür (entegrasyon/ytübot), üyelere verilemez!', ephemeral: true });
            }
            const me = interaction.guild.members.me;
            if (me && rol.position >= me.roles.highest.position) {
                return interaction.reply({
                    content: '❌ Seçilen rol, **botun en yüksek rolünden** yüksek veya aynı! Önce botun rolünü o rolün üstüne taşı.',
                    ephemeral: true,
                });
            }
        }

        // --- Ayar güncelle ---
        if (rol) {
            etiket.set({ roleId: rol.id, enabled: true });
        }

        // --- Tüm üyeleri tara (etiket değişse bile roller güncellensin) ---
        await interaction.deferReply({ ephemeral: true });
        const sonuc = await etiket.sweep(interaction.guild, 'Sunucu etiketi: ayar/tarama');

        return interaction.editReply({
            embeds: [
                buildSummary(etiket.get(), interaction.guild),
                new EmbedBuilder().setColor('#3498db')
                    .setDescription(`🔎 Tarama bitti: **${sonuc.verilen}** kişiye rol verildi, **${sonuc.alinan}** kişiden rol alındı.`)
                    .setFooter({ text: config.footer.text }),
            ],
        });
    },
};
