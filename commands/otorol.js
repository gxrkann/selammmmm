// commands/otorol.js
// Sunucuya girenlere verilecek oto-rolü ayarlar (kapatılabilir).
// Sadece bot sahipleri / Boss rolü. Ayar data/otorol.json'a yazılır.
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../utils/env');
const otorol = require('../utils/otorol');

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
        .setTitle('🔑 Oto-Rol Ayarları')
        .addFields(
            { name: '🎭 Verilecek rol', value: rolYazi, inline: true },
            { name: '🟢 Durum', value: st.enabled && st.roleId ? '✅ Aktif' : '⛔ Kapalı', inline: true },
        )
        .setDescription('Sunucuya her giriş yapan üyeye bu rol otomatik verilir.')
        .setFooter({ text: config.footer.text });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('otorol')
        .setDescription('Sunucuya girenlere verilecek oto-rolü ayarlar')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addRoleOption(o => o.setName('rol').setDescription('Giren kişilere verilecek rol').setRequired(false))
        .addBooleanOption(o => o.setName('kapat').setDescription('Oto-rolü kapat').setRequired(false)),

    async execute(interaction) {
        if (!isAuthorized(interaction)) {
            return interaction.reply({ content: '❌ Bu komutu sadece **bot sahipleri** veya **Boss** rolü kullanabilir!', ephemeral: true });
        }

        const rol = interaction.options.getRole('rol');
        const kapat = interaction.options.getBoolean('kapat');

        // Hiçbir seçenek yoksa → mevcut durumu göster
        if (!rol && !kapat) {
            return interaction.reply({ embeds: [buildSummary(otorol.get(), interaction.guild)], ephemeral: true });
        }

        if (kapat) {
            otorol.disable();
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('⛔ Oto-Rol Kapatıldı')
                    .setDescription('Artık giriş yapan üyelere rol verilmeyecek. Rol kaydı duruyor, tekrar `/otorol rol:@Rol` yazarak açabilirsin.')
                    .setFooter({ text: config.footer.text })],
                ephemeral: true,
            });
        }

        // --- Rol doğrulama ---
        if (rol.id === interaction.guild.id) {
            return interaction.reply({ content: '❌ `@everyone` rolü seçilemez!', ephemeral: true });
        }
        if (rol.managed) {
            return interaction.reply({ content: '❌ Bu rol yönetilen bir roldür (entegrasyon/ytübot), üyelere verilemez!', ephemeral: true });
        }

        const me = interaction.guild.members.me;
        if (me) {
            if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
                return interaction.reply({ content: '❌ Botun **Rolleri Yönet** yetkisi yok! Sunucu ayarlarından verin.', ephemeral: true });
            }
            if (rol.position >= me.roles.highest.position) {
                return interaction.reply({
                    content: `❌ Seçilen rol, **botun en yüksek rolünden** yüksek veya aynı! Önce botun rolünü o rolün üstüne taşı.`,
                    ephemeral: true,
                });
            }
        }

        const yeni = otorol.set({ roleId: rol.id });
        return interaction.reply({ embeds: [buildSummary(yeni, interaction.guild)], ephemeral: true });
    },
};
