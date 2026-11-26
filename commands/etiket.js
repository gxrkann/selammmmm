// commands/etiket.js
// Sunucu etiketi (tag) rolü ayarları: ismi etiketi taşıyana rol verilir,
// etiketi çıkarınca rol geri alınır. Ayar data/etiket.json'a yazılır.
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
    const etiketYazi = st.text ? `\`${st.text}\`` : '❌ Ayarlanmadı';

    return new EmbedBuilder()
        .setColor(st.enabled && st.text && st.roleId ? '#2ecc71' : '#e74c3c')
        .setTitle('🏷️ Sunucu Etiketi Ayarları')
        .addFields(
            { name: '🔤 Etiket metni', value: etiketYazi, inline: true },
            { name: '🎭 Verilecek rol', value: rolYazi, inline: true },
            { name: '🟢 Durum', value: st.enabled && st.text && st.roleId ? '✅ Aktif' : '⛔ Kapalı', inline: true },
        )
        .setDescription(
            'Üyenin **kullanıcı adı**, **global adı** veya **takma adı** etiketi taşıyorsa role verilir; ' +
            'etiketi çıkarınca rol otomatik geri alınır. İsim değişince ve sunucuya girişte kontrol edilir.'
        )
        .setFooter({ text: config.footer.text });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('etiket')
        .setDescription('Sunucu etiketi (tag) rolünü ayarlar')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(o => o.setName('etiket').setDescription('İsimde aranacak etiket metni (örn: GXR)').setRequired(false))
        .addRoleOption(o => o.setName('rol').setDescription('Etiketi taşıyana verilecek rol').setRequired(false))
        .addBooleanOption(o => o.setName('kapat').setDescription('Etiket sistemini kapat').setRequired(false))
        .addBooleanOption(o => o.setName('tara').setDescription('Tüm üyeleri şimdi tara').setRequired(false)),

    async execute(interaction) {
        if (!isAuthorized(interaction)) {
            return interaction.reply({ content: '❌ Bu komutu sadece **bot sahipleri** veya **Boss** rolü kullanabilir!', ephemeral: true });
        }

        const metin = interaction.options.getString('etiket');
        const rol = interaction.options.getRole('rol');
        const kapat = interaction.options.getBoolean('kapat');
        const tara = interaction.options.getBoolean('tara');

        // Hiçbir seçenek yoksa → mevcut durumu göster
        if (!metin && !rol && !kapat && !tara) {
            return interaction.reply({ embeds: [buildSummary(etiket.get(), interaction.guild)], ephemeral: true });
        }

        if (kapat) {
            etiket.disable();
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('⛔ Etiket Sistemi Kapatıldı')
                    .setDescription('Artık isim değişikliğinde rol verilip alınmayacak. Mevcut roller korundu. `/etiket etiket:... rol:...` yazarak tekrar açabilirsin.')
                    .setFooter({ text: config.footer.text })],
                ephemeral: true,
            });
        }

        const mevcut = etiket.get();

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
        const yeniMetin = metin !== null && metin !== undefined ? metin.trim() : mevcut.text;
        const yeniRolId = rol ? rol.id : mevcut.roleId;

        if (metin || rol) {
            if (!yeniMetin) {
                return interaction.reply({ content: '❌ Önce etiket metnini belirt: `/etiket etiket:GXR`', ephemeral: true });
            }
            if (!yeniRolId) {
                return interaction.reply({ content: '❌ Verilecek rolü seç: `/etiket rol:@Rol`', ephemeral: true });
            }
            etiket.set({ text: yeniMetin, roleId: yeniRolId, enabled: true });
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
