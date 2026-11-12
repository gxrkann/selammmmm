// commands/ekip.js
// Ekip istatistik ve rapor komutu
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const activity = require('../utils/activity');

function isAuthorized(interaction) {
    const isOwnerUser = config.ownerId.includes(interaction.user.id);
    const isOwnerRole = config.ownerRoleId && interaction.member?.roles?.cache?.has(config.ownerRoleId);
    const hasManage = interaction.member?.permissions?.has?.('ManageGuild');
    return isOwnerUser || isOwnerRole || hasManage;
}

function minutesToText(minutes) {
    if (!minutes) return '`0 dk`';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `\`${m} dk\``;
    return `\`${h} sa ${m} dk\``;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ekip')
        .setDescription('Ekip istatistik ve rapor sistemi')
        .addStringOption(opt =>
            opt.setName('işlem')
                .setDescription('Yapılacak işlem')
                .setRequired(true)
                .addChoices(
                    { name: 'DURUM — Ekip rolleri ve günlük aktiflik', value: 'durum' },
                    { name: 'RAPOR — 7 günlük aktivite raporu', value: 'rapor' }
                )
        ),

    async execute(interaction) {
        if (!isAuthorized(interaction)) {
            return interaction.reply({
                content: '❌ Bu komutu sadece yetkililer kullanabilir!',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });
        const action = interaction.options.getString('işlem');

        if (action === 'durum') {
            return sendDurum(interaction);
        }
        return sendRapor(interaction);
    },
};

/* ---------------- Ekip rollerini toplar ---------------- */
function getEkipRoles(guild) {
    const roleIds = (config.ekipRolleri && config.ekipRolleri.length)
        ? config.ekipRolleri
        : (config.memberRoleId ? [config.memberRoleId] : []);

    return roleIds
        .map(id => guild.roles.cache.get(id))
        .filter(Boolean);
}

/* ---------------- /ekip işlem: durum ---------------- */
async function sendDurum(interaction) {
    const { guild } = interaction;
    const roles = getEkipRoles(guild);

    if (!roles.length) {
        return interaction.editReply(
            '❌ Ekip rolü bulunamadı! `config.json > ekipRolleri` alanına rol ID\'lerini ekleyin.'
        );
    }

    const today = activity.getDay();
    await guild.members.fetch();

    const embed = new EmbedBuilder()
        .setColor('#2b6cb0')
        .setTitle(`📊 ${guild.name} — Ekip Durumu`)
        .setThumbnail(guild.iconURL({ size: 256 }))
        .setFooter({ text: config.footer.text })
        .setTimestamp();

    for (const role of roles) {
        const members = role.members;
        const active = members.filter(m => {
            const stat = today[m.id];
            return stat && (stat.messages > 0 || stat.voiceMinutes > 0 || activity.isOnlineVoice(m.id));
        });

        embed.addFields({
            name: `${role.name}`,
            value:
                `👥 **Üye Sayısı:** \`${members.size}\`\n` +
                `🔥 **Bugün Aktif:** \`${active.size}\`\n` +
                `💤 **Bugün Pasif:** \`${members.size - active.size}\``,
            inline: true,
        });
    }

    embed.setDescription(
        `📅 **Tarih:** <t:${Math.floor(Date.now() / 1000)}:F>\n` +
        `_Aktiflik: bugün ses kanalına giren veya mesaj atan ekip üyeleri_`
    );

    await interaction.editReply({ embeds: [embed] });
}

/* ---------------- /ekip işlem: rapor ---------------- */
async function sendRapor(interaction) {
    const { guild } = interaction;
    const roles = getEkipRoles(guild);

    if (!roles.length) {
        return interaction.editReply(
            '❌ Ekip rolü bulunamadı! `config.json > ekipRolleri` alanına rol ID\'lerini ekleyin.'
        );
    }

    await guild.members.fetch();

    const stats = activity.getRange(7); // userId -> { voiceMinutes, messages }
    const staffIds = new Set();
    for (const role of roles) role.members.forEach(m => staffIds.add(m.id));

    // Sadece ekip üyelerinin verisi
    const staffStats = [...staffIds].map(id => ({
        id,
        ...(stats[id] || { voiceMinutes: 0, messages: 0 }),
    }));

    const topVoice = [...staffStats].sort((a, b) => b.voiceMinutes - a.voiceMinutes).slice(0, 10);
    const topMessage = [...staffStats].sort((a, b) => b.messages - a.messages).slice(0, 10);
    const inactive = staffStats.filter(s => s.voiceMinutes === 0 && s.messages === 0);

    const fmtList = (list, key, formatter) =>
        list
            .filter(s => (key === 'voice' ? s.voiceMinutes > 0 : s.messages > 0))
            .map((s, i) => {
                const member = guild.members.cache.get(s.id);
                return `**${i + 1}.** ${member ? member : `<@${s.id}>`} — ${formatter(s)}`;
            })
            .join('\n') || '_Veri yok_';

    const embed = new EmbedBuilder()
        .setColor('#7c3aed')
        .setTitle(`📈 ${guild.name} — 7 Günlük Ekip Raporu`)
        .setThumbnail(guild.iconURL({ size: 256 }))
        .setFooter({ text: config.footer.text })
        .setTimestamp()
        .addFields(
            {
                name: '🎧 En Aktif 10 (Ses Süresi)',
                value: fmtList(topVoice, 'voice', s => minutesToText(s.voiceMinutes)),
            },
            {
                name: '💬 En Aktif 10 (Mesaj)',
                value: fmtList(topMessage, 'message', s => `\`${s.messages} mesaj\``),
            }
        );

    if (inactive.length) {
        const inactiveText = inactive
            .slice(0, 20)
            .map(s => `<@${s.id}>`)
            .join(', ');
        embed.addFields({
            name: `💤 Hiç Aktivitesi Olmayanlar (${inactive.length})`,
            value: inactiveText + (inactive.length > 20 ? `\n_...ve ${inactive.length - 20} kişi daha_` : ''),
        });
    }

    await interaction.editReply({ embeds: [embed] });
}
