// commands/yetkili.js
// Yetkili yönetimi: al / terfi / çıkar / profil / list
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const activity = require('../utils/activity');
const fs = require('fs');
const path = require('path');

const STAFF_FILE = path.join(__dirname, '../data/yetkili.json');

function loadStaff() {
    try {
        if (fs.existsSync(STAFF_FILE)) {
            return JSON.parse(fs.readFileSync(STAFF_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('Yetkili verisi okunamadı:', error.message);
    }
    return { staff: {} };
}

function saveStaff(data) {
    try {
        fs.writeFileSync(STAFF_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('Yetkili verisi kaydedilemedi:', error.message);
    }
}

function loadWarnings() {
    try {
        const file = path.join(__dirname, '../data/warnings.json');
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
    } catch { /* yoksay */ }
    return { warnings: {} };
}

function isAuthorized(interaction) {
    const isOwnerUser = config.ownerId.includes(interaction.user.id);
    const isOwnerRole = config.ownerRoleId && interaction.member?.roles?.cache?.has(config.ownerRoleId);
    const hasManage = interaction.member?.permissions?.has?.('ManageGuild');
    return isOwnerUser || isOwnerRole || hasManage;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('yetkili')
        .setDescription('Yetkili yönetim sistemi')
        .addStringOption(opt =>
            opt.setName('işlem')
                .setDescription('Yapılacak işlem')
                .setRequired(true)
                .addChoices(
                    { name: 'AL — Yetkili kaydet', value: 'al' },
                    { name: 'TERFİ — Yetkiliyi terfi et', value: 'terfi' },
                    { name: 'ÇIKAR — Yetkiliyi ekipten çıkar', value: 'cikar' },
                    { name: 'PROFİL — Yetkili profili', value: 'profil' },
                    { name: 'LİSTE — Tüm yetkililer', value: 'liste' }
                )
        )
        .addUserOption(opt =>
            opt.setName('kullanıcı')
                .setDescription('İşlem yapılacak kullanıcı')
        )
        .addRoleOption(opt =>
            opt.setName('rol')
                .setDescription('Verilecek ekip rolü (AL işlemi için)')
        )
        .addStringOption(opt =>
            opt.setName('sebep')
                .setDescription('Sebep (TERFİ / ÇIKAR için)')
        ),

    async execute(interaction) {
        if (!isAuthorized(interaction)) {
            return interaction.reply({
                content: '❌ Bu komutu sadece yetkililer kullanabilir!',
                ephemeral: true
            });
        }

        const action = interaction.options.getString('işlem');
        const user = interaction.options.getUser('kullanıcı');

        await interaction.deferReply({ ephemeral: true });

        switch (action) {
            case 'al': return cmdAl(interaction, user);
            case 'terfi': return cmdTerfi(interaction, user);
            case 'cikar': return cmdCikar(interaction, user);
            case 'profil': return cmdProfil(interaction, user);
            case 'liste': return cmdListe(interaction);
        }
    },
};

/* ---------------- /yetkili al ---------------- */
async function cmdAl(interaction, user) {
    if (!user) {
        return interaction.editReply('❌ Lütfen bir kullanıcı belirtin!');
    }

    const role = interaction.options.getRole('rol');
    const member = interaction.guild.members.cache.get(user.id);
    const data = loadStaff();

    if (!data.staff[user.id]) {
        data.staff[user.id] = {
            addedAt: new Date().toISOString(),
            addedBy: interaction.user.id,
            promotions: [],
            removed: null,
        };
        saveStaff(data);
    } else if (data.staff[user.id].removed) {
        // Eski kayıt temizlenip yeniden alınıyor
        data.staff[user.id] = {
            addedAt: new Date().toISOString(),
            addedBy: interaction.user.id,
            promotions: data.staff[user.id].promotions || [],
            removed: null,
        };
        saveStaff(data);
    } else {
        return interaction.editReply(`⚠️ <@${user.id}> zaten ekibinizde kayıtlı!`);
    }

    // Rol ver (isteğe bağlı)
    let roleText = '';
    if (role) {
        if (member && role.editable && !role.managed) {
            await member.roles.add(role, 'Yetkili olarak alındı').catch(() => { });
            roleText = `\n🎭 **Verilen Rol:** ${role}`;
        } else {
            roleText = '\n⚠️ **Rol verilemedi** (yetkim yetersiz olabilir).';
        }
    }

    const embed = new EmbedBuilder()
        .setColor('#1abc9c')
        .setTitle('🎉 Yeni Yetkili Kaydedildi')
        .setDescription(
            `👤 **Yetkili:** ${user} (\`${user.id}\`)\n` +
            `📅 **Kayıt Tarihi:** <t:${Math.floor(Date.now() / 1000)}:F>\n` +
            `👮 **Ekleyen:** ${interaction.user}` +
            roleText
        )
        .setFooter({ text: config.footer.text })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/* ---------------- /yetkili terfi ---------------- */
async function cmdTerfi(interaction, user) {
    if (!user) {
        return interaction.editReply('❌ Lütfen bir kullanıcı belirtin!');
    }

    const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi';
    const data = loadStaff();

    if (!data.staff[user.id] || data.staff[user.id].removed) {
        return interaction.editReply(`❌ <@${user.id}> kayıtlı bir yetkili değil! Önce \`/yetkili al\` komutunu kullanın.`);
    }

    data.staff[user.id].promotions.push({
        date: new Date().toISOString(),
        reason,
        by: interaction.user.id,
    });
    saveStaff(data);

    const count = data.staff[user.id].promotions.length;

    const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle('🚀 Terfi Kaydı Eklendi')
        .setDescription(
            `👤 **Yetkili:** ${user} (\`${user.id}\`)\n` +
            `📝 **Sebep:** ${reason}\n` +
            `🎖️ **Toplam Terfi:** \`${count}\`\n` +
            `👮 **Terfi Eden:** ${interaction.user}`
        )
        .setFooter({ text: config.footer.text })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/* ---------------- /yetkili çıkar ---------------- */
async function cmdCikar(interaction, user) {
    if (!user) {
        return interaction.editReply('❌ Lütfen bir kullanıcı belirtin!');
    }

    const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi';
    const data = loadStaff();

    if (!data.staff[user.id] || data.staff[user.id].removed) {
        return interaction.editReply(`❌ <@${user.id}> kayıtlı bir yetkili değil!`);
    }

    data.staff[user.id].removed = {
        date: new Date().toISOString(),
        reason,
        by: interaction.user.id,
    };
    saveStaff(data);

    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🚪 Yetkili Ekipten Çıkarıldı')
        .setDescription(
            `👤 **Yetkili:** ${user} (\`${user.id}\`)\n` +
            `📝 **Sebep:** ${reason}\n` +
            `👮 **Çıkaran:** ${interaction.user}`
        )
        .setFooter({ text: config.footer.text })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/* ---------------- /yetkili profil ---------------- */
async function cmdProfil(interaction, user) {
    if (!user) {
        return interaction.editReply('❌ Lütfen bir kullanıcı belirtin!');
    }

    const data = loadStaff();
    const warningsData = loadWarnings();
    const stats7 = activity.getRange(7);
    const stat = stats7[user.id] || { voiceMinutes: 0, messages: 0 };
    const staff = data.staff[user.id];

    const warns = warningsData.warnings?.[user.id] ?? 0;

    const fields = [
        {
            name: '📈 7 Günlük Aktivite',
            value:
                `🎧 **Ses:** \`${Math.floor(stat.voiceMinutes / 60)} sa ${stat.voiceMinutes % 60} dk\`\n` +
                `💬 **Mesaj:** \`${stat.messages}\`\n` +
                (activity.isOnlineVoice(user.id) ? '🎙️ **Şu An:** `Ses kanalında!`' : '🎙️ **Şu An:** `Kapalı`'),
        },
        {
            name: '⚠️ Uyarılar',
            value: `\`${warns} uyarı\``,
            inline: true,
        },
        {
            name: '🎖️ Terfiler',
            value: staff ? `\`${(staff.promotions || []).length} terfi\`` : '`Kayıtlı değil`',
            inline: true,
        },
    ];

    if (staff && !staff.removed) {
        fields.push({
            name: '👥 Ekip Bilgisi',
            value:
                `📅 **Alındığı Tarih:** <t:${Math.floor(new Date(staff.addedAt).getTime() / 1000)}:f>\n` +
                `👮 **Ekleyen:** <@${staff.addedBy}>`,
        });
    } else if (staff?.removed) {
        fields.push({
            name: '🚪 Çıkış Bilgisi',
            value:
                `📅 **Çıkış:** <t:${Math.floor(new Date(staff.removed.date).getTime() / 1000)}:f>\n` +
                `📝 **Sebep:** ${staff.removed.reason}\n` +
                `👮 **Çıkaran:** <@${staff.removed.by}>`,
        });
    }

    const embed = new EmbedBuilder()
        .setColor(staff && !staff.removed ? '#1abc9c' : '#e74c3c')
        .setTitle(`🪪 Yetkili Profili — ${user.username}`)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setDescription(`👤 ${user} (\`${user.id}\`)`)
        .addFields(fields)
        .setFooter({ text: config.footer.text })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/* ---------------- /yetkili liste ---------------- */
async function cmdListe(interaction) {
    const data = loadStaff();
    const entries = Object.entries(data.staff).filter(([, s]) => !s.removed);

    if (!entries.length) {
        return interaction.editReply('📭 Henüz kayıtlı yetkili yok! `/yetkili al` ile ekleyebilirsiniz.');
    }

    const lines = entries
        .slice(0, 25)
        .map(([id, s], i) => {
            const promotions = (s.promotions || []).length;
            return `**${i + 1}.** <@${id}> — 🎖️ \`${promotions} terfi\` — 📅 <t:${Math.floor(new Date(s.addedAt).getTime() / 1000)}:d>`;
        })
        .join('\n');

    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`📋 Yetkili Listesi (${entries.length})`)
        .setDescription(lines + (entries.length > 25 ? `\n_...ve ${entries.length - 25} kişi daha_` : ''))
        .setFooter({ text: config.footer.text })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}
