// commands/sescek.js
// Farklı ses kanallarındaki üyeleri tek seferde seçilen sese çeker.
const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../utils/env');

function isYetkili(interaction) {
    const owner = Array.isArray(config.ownerId)
        ? config.ownerId.includes(interaction.user.id)
        : config.ownerId === interaction.user.id;
    const boss = config.ownerRoleId && interaction.member?.roles?.cache?.has(config.ownerRoleId);
    const moveYetkisi = interaction.member?.permissions?.has?.(PermissionFlagsBits.MoveMembers);
    return Boolean(owner || boss || moveYetkisi);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sescek')
        .setDescription('Farklı ses kanallarındaki herkesi tek seferde seçilen sese çeker')
        .addChannelOption(o => o
            .setName('ses')
            .setDescription('Kişilerin çekileceği ses kanalı')
            .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
            .setRequired(true)),

    async execute(interaction) {
        if (!isYetkili(interaction)) {
            return interaction.reply({ content: '❌ Bu komutu sadece **yetkililer** kullanabilir!', ephemeral: true });
        }

        const hedef = interaction.options.getChannel('ses');
        const guild = interaction.guild;

        await guild.members.fetch().catch(() => { });

        // Hedefte olmayan, başka bir ses kanalında olan üyeler (botlar hariç)
        const cekilecekler = [...guild.members.cache.values()].filter(m =>
            !m.user.bot && m.voice.channelId && m.voice.channelId !== hedef.id
        );

        if (cekilecekler.length === 0) {
            return interaction.reply({
                content: `ℹ️ Başka ses kanalında kimse yok — zaten herkes **${hedef.name}** kanalında.`,
                ephemeral: true,
            });
        }

        await interaction.deferReply({ ephemeral: true });

        // Tek seferde (eş zamanlı) çek
        const sonuclar = await Promise.allSettled(
            cekilecekler.map(m => m.voice.setChannel(hedef, `Toplu çekme (${interaction.user.tag})`))
        );

        const basarili = sonuclar.filter(r => r.status === 'fulfilled').length;
        const basarisiz = sonuclar.length - basarili;

        const embed = new EmbedBuilder()
            .setColor(basarisiz ? '#e67e22' : '#2ecc71')
            .setTitle('🔊 Ses Çekme İşlemi')
            .addFields(
                { name: '🎯 Hedef kanal', value: `${hedef}`, inline: true },
                { name: '✅ Çekilen', value: `\`${basarili}\` kişi`, inline: true },
                { name: '❌ Başarısız', value: `\`${basarisiz}\` kişi`, inline: true },
            )
            .setFooter({ text: config.footer.text })
            .setTimestamp();

        if (basarisiz > 0) {
            embed.setDescription('⚠️ Bazı üyeler çekilemedi (kanal dolu olabilir).');
        }

        return interaction.editReply({ embeds: [embed] });
    },
};
