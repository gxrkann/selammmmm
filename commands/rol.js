// commands/rol.js
// Bot üzerinden üyeye rol verme / rol alma.
// Sadece bot sahipleri / Boss rolü. Yetki hiyerarşisi korunur.
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../utils/env');

function isAuthorized(interaction) {
    if (Array.isArray(config.ownerId) && config.ownerId.includes(interaction.user.id)) return true;
    if (config.ownerRoleId && interaction.member?.roles?.cache?.has(config.ownerRoleId)) return true;
    return false;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rol')
        .setDescription('Bir üyeye rol verir veya rolünü alır')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addStringOption(o => o.setName('islem').setDescription('Ne yapılacak?').setRequired(true).addChoices(
            { name: '✅ Rol ver', value: 'ver' },
            { name: '❌ Rol al', value: 'al' },
        ))
        .addUserOption(o => o.setName('uye').setDescription('Rol verilecek/alınacak üye').setRequired(true))
        .addRoleOption(o => o.setName('rol').setDescription('Verilecek/alınacak rol').setRequired(true)),

    async execute(interaction) {
        if (!isAuthorized(interaction)) {
            return interaction.reply({ content: '❌ Bu komutu sadece **bot sahipleri** veya **Boss** rolü kullanabilir!', ephemeral: true });
        }

        const islem = interaction.options.getString('islem');
        const uye = interaction.options.getMember('uye');
        const rol = interaction.options.getRole('rol');

        if (!uye) {
            return interaction.reply({ content: '❌ Bu üye sunucuda değil!', ephemeral: true });
        }
        if (uye.user.id === interaction.user.id) {
            return interaction.reply({ content: '❌ Kendine rol veremez/alınamazsın!', ephemeral: true });
        }
        if (rol.id === interaction.guild.id) {
            return interaction.reply({ content: '❌ `@everyone` rolü verilemez/alınamaz!', ephemeral: true });
        }
        if (rol.managed) {
            return interaction.reply({ content: '❌ Bu rol yönetilen bir roldür (entegrasyon), verilemez/alınamaz!', ephemeral: true });
        }

        // --- Yetki hiyerarşisi ---
        const me = interaction.guild.members.me;
        if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ content: '❌ Botun **Rolleri Yönet** yetkisi yok!', ephemeral: true });
        }
        if (rol.position >= me.roles.highest.position) {
            return interaction.reply({ content: `❌ \`${rol.name}\` rolü botun en yüksek rolünden yüksek! Önce botun rolünü üstüne taşı.`, ephemeral: true });
        }

        // Kendi rolünden yüksek rol verilemez (hiyerarşi koruması)
        const executorHigh = interaction.member?.roles?.highest?.position ?? 0;
        if (rol.position >= executorHigh && interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({ content: `❌ Seçilen rol, **senin en yüksek rolünden** yüksek veya aynı — ona dokunamazsın!`, ephemeral: true });
        }

        // Zaten var mı / yok mu?
        const hedefteVar = uye.roles.cache.has(rol.id);

        if (islem === 'ver' && hedefteVar) {
            return interaction.reply({ content: `⚠️ ${uye} zaten **${rol.name}** rolüne sahip.`, ephemeral: true });
        }
        if (islem === 'al' && !hedefteVar) {
            return interaction.reply({ content: `⚠️ ${uye} zaten **${rol.name}** rolüne sahip değil.`, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            if (islem === 'ver') {
                await uye.roles.add(rol, `Komutla verildi (${interaction.user.tag})`);
            } else {
                await uye.roles.remove(rol, `Komutla alındı (${interaction.user.tag})`);
            }
        } catch (error) {
            console.error('[ROL] İşlem başarısız:', error.message);
            return interaction.editReply(`❌ Rol ${islem === 'ver' ? 'verilemedi' : 'alınamadı'}: \`${error.message}\``);
        }

        const embed = new EmbedBuilder()
            .setColor(islem === 'ver' ? '#2ecc71' : '#e74c3c')
            .setTitle(islem === 'ver' ? '✅ Rol Verildi' : '❌ Rol Alındı')
            .addFields(
                { name: '👤 Üye', value: `${uye} (\`${uye.id}\`)`, inline: true },
                { name: '🎭 Rol', value: `${rol}`, inline: true },
                { name: '📝 İşlem', value: islem === 'ver' ? 'Rol verildi' : 'Rol alındı', inline: true },
            )
            .setFooter({ text: config.footer.text })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    },
};
