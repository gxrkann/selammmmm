// commands/ses.js
// Botu bir ses kanalına bağlar ve AFK olarak bekletir.
// Bağlantı kopsa bile otomatik yeniden bağlanır. /ses cikar ile durdurulur.
const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config.json');
const voice = require('../utils/voice');

function isAuthorized(interaction) {
    if (config.ownerId.includes(interaction.user.id)) return true;
    if (config.ownerRoleId && interaction.member?.roles?.cache?.has(config.ownerRoleId)) return true;
    return false;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ses')
        .setDescription('Botu ses kanalına bağlar ve AFK olarak bekletir (kopunca otomatik bağlanır)')
        .addSubcommand(s => s
            .setName('baglan')
            .setDescription('Belirtilen ses kanalına bağlanır ve bekler')
            .addChannelOption(o => o.setName('kanal').setDescription('Ses kanalı (boş: botun varsayılan kanalı)').addChannelTypes(ChannelType.GuildVoice).setRequired(false)))
        .addSubcommand(s => s
            .setName('cikar')
            .setDescription('Ses kanalından çıkar ve otomatik yeniden bağlanmayı durdurur')),

    async execute(interaction) {
        if (!isAuthorized(interaction)) {
            return interaction.reply({ content: '❌ Bu komutu sadece **Boss** rolüne sahip kullanıcılar veya bot sahipleri kullanabilir!', ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        /* ---------- ÇIKAR ---------- */
        if (sub === 'cikar') {
            voice.setVoiceInactive();
            try {
                const conn = require('@discordjs/voice').getVoiceConnection(interaction.guildId);
                if (conn) conn.destroy();
            } catch (e) { /* yoksay */ }
            return interaction.reply({ content: '⏏️ Ses kanalından çıkıldı, otomatik yeniden bağlanma durduruldu.', ephemeral: true });
        }

        /* ---------- BAĞLAN ---------- */
        const kanal = interaction.options.getChannel('kanal');

        let hedef = kanal;
        if (!hedef) {
            const saved = voice.loadVoiceData();
            if (saved.active && saved.channelId) {
                hedef = await interaction.guild.channels.fetch(saved.channelId).catch(() => null);
            }
        }
        if (!hedef) {
            return interaction.reply({ content: '❌ Bir ses kanalı seçin! (`/ses baglan kanal:`)', ephemeral: true });
        }
        if (hedef.type !== ChannelType.GuildVoice) {
            return interaction.reply({ content: '❌ Seçilen kanal bir ses kanalı değil!', ephemeral: true });
        }

        const perms = hedef.permissionsFor(interaction.client.user);
        if (perms && !perms.has(PermissionFlagsBits.Connect)) {
            return interaction.reply({ content: `❌ Botun \`${hedef.name}\` kanalına bağlanma izni yok!`, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            voice.setVoiceActive(hedef.id, interaction.guildId);
            await voice.connectVoice(interaction.guild, hedef.id);

            // Kopma durumunda otomatik yeniden bağlanma dinleyicileri
            voice.attachReconnect(interaction.client, interaction.guild);

            return interaction.editReply(`🔊 \`${hedef.name}\` kanalına bağlandım ve **AFK** olarak bekliyorum.\n🔄 Bağlantım koparsa otomatik yeniden bağlanırım.\n⏏️ Durdurmak için: \`/ses cikar\``);
        } catch (e) {
            console.error('[SES] Bağlanma hatası:', e.message);
            voice.setVoiceInactive();
            return interaction.editReply(`❌ Ses kanalına bağlanılamadı: ${e.message}`);
        }
    },
};
