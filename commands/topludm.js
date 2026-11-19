// commands/topludm.js
// Seçilen role sahip tüm üyelere DM'den toplu mesaj gönderir.
// Yetkili/kullanıcı muafiyetleri, yavaş gönderim (rate limit) ve sonuç özeti.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');

const DELAY_MS = 1200; // DM başına bekleme (rate limit koruması)

function isAuthorized(interaction) {
    if (config.ownerId.includes(interaction.user.id)) return true;
    if (config.ownerRoleId && interaction.member?.roles?.cache?.has(config.ownerRoleId)) return true;
    return false;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('topludm')
        .setDescription('Belirtilen role sahip tüm üyelere DM\'den toplu mesaj gönderir')
        .addRoleOption(o => o.setName('rol').setDescription('Mesajın gideceği rol').setRequired(true))
        .addStringOption(o => o.setName('mesaj').setDescription('DM\'de gönderilecek mesaj').setRequired(true).setMaxLength(1900))
        .addBooleanOption(o => o.setName('onay').setDescription('Evet ise sadece sahipler kullanabilir (varsayılan: evet)').setRequired(false)),

    async execute(interaction) {
        if (!isAuthorized(interaction)) {
            return interaction.reply({ content: '❌ Bu komutu sadece **Boss** rolüne sahip kullanıcılar veya bot sahipleri kullanabilir!', ephemeral: true });
        }

        const rol = interaction.options.getRole('rol');
        const mesaj = interaction.options.getString('mesaj');

        if (rol.id === interaction.guild.id) {
            return interaction.reply({ content: '❌ `@everyone` rolü seçilemez!', ephemeral: true });
        }
        if (rol.managed) {
            return interaction.reply({ content: '❌ Bu rol yönetilen bir roldür, üzerindeki üyeler DM alamaz!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        await interaction.guild.members.fetch().catch(() => { });
        const hedefler = [...interaction.guild.members.cache.values()].filter(m => !m.user.bot && m.roles.cache.has(rol.id));

        if (hedefler.length === 0) {
            return interaction.editReply('❌ Bu role sahip hiç üye yok (botlar hariç).');
        }

        const basari = [];
        const engellenen = []; // DM'leri kapalı
        const hatali = [];

        for (const member of hedefler) {
            try {
                await member.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#2b2d31')
                            .setTitle(`${interaction.guild.name} — Duyuru`)
                            .setDescription(mesaj)
                            .setThumbnail(interaction.guild.iconURL({ size: 256 }))
                            .setFooter({ text: config.footer.text })
                            .setTimestamp()
                    ]
                });
                basari.push(member.id);
            } catch (e) {
                if (e.code === 50007) engellenen.push(member.id);
                else hatali.push(member.id);
            }
            await new Promise(r => setTimeout(r, DELAY_MS));
        }

        const ozet = new EmbedBuilder()
            .setColor(engellenen.length || hatali.length ? '#e67e22' : '#2ecc71')
            .setTitle('📨 Toplu DM Sonucu')
            .addFields(
                { name: '🔹 Hedef rol', value: `${rol} (${hedefler.length} üye)`, inline: true },
                { name: '✅ Gönderildi', value: `\`${basari.length}\``, inline: true },
                { name: '🚫 DM kapalı', value: `\`${engellenen.length}\``, inline: true },
                { name: '❌ Hata', value: `\`${hatali.length}\``, inline: true },
            )
            .setFooter({ text: config.footer.text })
            .setTimestamp();

        return interaction.editReply({ embeds: [ozet] });
    },
};
