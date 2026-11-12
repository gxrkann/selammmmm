const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const config = require('../config.json');
const canvafy = require('canvafy');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

// Uyarı verilerini saklamak için Map
const userWarnings = new Map(); // userId -> totalWarnings
const userWarningHistory = new Map(); // userId -> [{ amount, reason, date, givenBy }]

// Dosya yolu
const WARNINGS_FILE = path.join(__dirname, '../data/warnings.json');

// Uyarı verilerini dosyadan yükle
function loadWarnings() {
    if (!fs.existsSync(WARNINGS_FILE)) {
        // Dosya yoksa boş veri oluştur
        saveWarnings();
        return;
    }

    try {
        const data = JSON.parse(fs.readFileSync(WARNINGS_FILE, 'utf8'));

        // Warnings Map'ini yükle
        if (data.warnings) {
            Object.entries(data.warnings).forEach(([userId, total]) => {
                userWarnings.set(userId, total);
            });
        }

        // History Map'ini yükle (date string'lerini Date objelerine çevir)
        if (data.history) {
            Object.entries(data.history).forEach(([userId, history]) => {
                const parsedHistory = history.map(w => ({
                    ...w,
                    date: w.date ? new Date(w.date) : new Date()
                }));
                userWarningHistory.set(userId, parsedHistory);
            });
        }
    } catch (error) {
        console.error('Uyarı verileri yüklenirken hata:', error);
        // Hata durumunda boş Map'lerle devam et
    }
}

// Uyarı verilerini dosyaya kaydet
function saveWarnings() {
    try {
        const warningsObj = {};
        userWarnings.forEach((total, userId) => {
            warningsObj[userId] = total;
        });

        const historyObj = {};
        userWarningHistory.forEach((history, userId) => {
            // Date objelerini string'e çevir
            historyObj[userId] = history.map(w => ({
                ...w,
                date: w.date instanceof Date ? w.date.toISOString() : (w.date || new Date().toISOString())
            }));
        });

        const data = {
            warnings: warningsObj,
            history: historyObj
        };

        // data dizini yoksa oluştur
        const dataDir = path.dirname(WARNINGS_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        fs.writeFileSync(WARNINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('Uyarı verileri kaydedilirken hata:', error);
    }
}

// Bot başladığında verileri yükle
loadWarnings();

// TR tarih helper
const trDate = (d = new Date()) =>
    new Intl.DateTimeFormat('tr-TR', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    }).format(d);

// Uyarı kartı oluştur
async function makeWarningCard(member, warningAmount, totalWarnings, isDecrease = false) {
    const avatarURL = member.user.displayAvatarURL({ forceStatic: true, extension: 'png', size: 256 });

    const buffer = await new canvafy.WelcomeLeave()
        .setAvatar(avatarURL)
        .setBackground('color', '#23272a') // Koyu gri arka plan
        .setTitle(isDecrease ? 'CEZA Azaldı' : 'CEZA ALDI', '#ffffff')
        .setDescription(`Oyuncu: ${member.user.username}\n${isDecrease ? 'Azalma Miktarı' : 'Cezası'}: ${warningAmount}`, '#ffffff')
        .setBorder('#ffd700') // Altın rengi dış çizgi
        .setAvatarBorder('#ffd700') // Altın rengi avatar çizgisi
        .setOverlayOpacity(0.3)
        .build();

    return buffer;
}

// Ana uyarı komutu (subcommand ile)
const uyariCommand = new SlashCommandBuilder()
    .setName('uyarı')
    .setDescription('Uyarı sistemi komutları')
    .addSubcommand(subcommand =>
        subcommand
            .setName('ver')
            .setDescription('Kullanıcıya uyarı verir')
            .addUserOption(option =>
                option.setName('kullanıcı')
                    .setDescription('Uyarı verilecek kullanıcı')
                    .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName('miktar')
                    .setDescription('Uyarı miktarı')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(10)
            )
            .addStringOption(option =>
                option.setName('sebep')
                    .setDescription('Uyarı sebebi')
                    .setRequired(false)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('sil')
            .setDescription('Kullanıcıdan uyarı siler')
            .addUserOption(option =>
                option.setName('kullanıcı')
                    .setDescription('Uyarısı silinecek kullanıcı')
                    .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName('miktar')
                    .setDescription('Silinecek uyarı miktarı')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(10)
            )
            .addStringOption(option =>
                option.setName('sebep')
                    .setDescription('Silme sebebi')
                    .setRequired(false)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('bilgi')
            .setDescription('Kullanıcının uyarı bilgilerini gösterir')
            .addUserOption(option =>
                option.setName('kullanıcı')
                    .setDescription('Bilgisi görüntülenecek kullanıcı')
                    .setRequired(true)
            )
    );

module.exports = {
    data: uyariCommand,

    async execute(interaction) {
        try {
            // Owner / Boss rol kontrolü
            const isOwnerUser = config.ownerId.includes(interaction.user.id);
            const isOwnerRole = config.ownerRoleId && interaction.member?.roles?.cache?.has(config.ownerRoleId);

            if (!isOwnerUser && !isOwnerRole) {
                return interaction.reply({
                    content: '❌ Bu komutu sadece **Boss** rolüne sahip kullanıcılar kullanabilir!',
                    ephemeral: true
                });
            }

            // Hangi subcommand'in kullanıldığını kontrol et
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'ver') {
                await handleUyariVer(interaction);
            } else if (subcommand === 'sil') {
                await handleUyariSil(interaction);
            } else if (subcommand === 'bilgi') {
                await handleUyariBilgi(interaction);
            }
        } catch (error) {
            console.error('Uyarı komutu hatası:', error);
            if (!interaction.replied) {
                interaction.reply({
                    content: '❌ Bir hata oluştu!',
                    ephemeral: true
                }).catch(() => { });
            }
        }
    }
};

// Uyarı ver fonksiyonu
async function handleUyariVer(interaction) {
    try {
        const targetUser = interaction.options.getUser('kullanıcı');
        const warningAmount = interaction.options.getInteger('miktar');
        const reason = interaction.options.getString('sebep') || 'Belirtilmemiş';

        // Hedef kullanıcıyı guild'den al
        const member = interaction.guild.members.cache.get(targetUser.id);
        if (!member) {
            return interaction.reply({
                content: '❌ Bu kullanıcı sunucuda bulunamadı!',
                ephemeral: true
            });
        }

        // Kullanıcının mevcut uyarılarını al
        const currentWarnings = userWarnings.get(targetUser.id) || 0;
        const newTotal = currentWarnings + warningAmount;

        // Yeni toplam uyarı sayısını kaydet
        userWarnings.set(targetUser.id, newTotal);

        // Uyarı geçmişini kaydet
        const warningHistory = userWarningHistory.get(targetUser.id) || [];
        warningHistory.push({
            amount: warningAmount,
            reason: reason,
            date: new Date(),
            givenBy: interaction.user.id,
            givenByUsername: interaction.user.username
        });
        userWarningHistory.set(targetUser.id, warningHistory);

        // Dosyaya kaydet
        saveWarnings();

        // Uyarı kartı oluştur
        const warningCard = await makeWarningCard(member, warningAmount, newTotal);
        const attachment = new AttachmentBuilder(warningCard, { name: 'warning.png' });

        // Embed oluştur
        const embed = new EmbedBuilder()
            .setAuthor({
                name: `${member.user.username} - UYARI`,
                iconURL: member.user.displayAvatarURL({ size: 256 })
            })
            .setThumbnail((interaction.guild.iconURL({ size: 256 })))
            .setDescription(`<@${interaction.user.id}> *tarafından bir kullanıcıya sunucuda başarılı bir şekilde uyarı verildi.* \n\n **Ceza Türü** \`UYARI\` \n **Ceza ID** \`#${Date.now().toString().slice(-2)}\` \n **ᴄᴇᴢᴀ ᴀʟᴀɴ:** <@${targetUser.id}> \n **ᴄᴇᴢᴀ ᴠᴇʀᴇɴ:** <@${interaction.user.id}> \n **sᴇʙᴇᴘ:** ${reason} \n **ᴍɪᴋᴛᴀʀ:** ${warningAmount}x \n **Toplam** ${newTotal}x \n **ᴛᴀʀɪʜ:** <t:${Math.floor(Date.now() / 1000)}:F> (<t:${Math.floor(Date.now() / 1000)}:R>)\n`)
            .setImage('attachment://warning.png')
            .setColor("#57f288")
            .setFooter({ text: config.footer.text, iconURL: interaction.guild.iconURL({ size: 256 }) });

        // Kullanıcıya DM gönder
        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Uyarı Aldınız!')
                .setDescription(
                    `**Sunucu:** ${interaction.guild.name}\n` +
                    `**Uyarı Miktarı:** ${warningAmount}\n` +
                    `**Toplam Uyarı:** ${newTotal}\n` +
                    `**Sebep:** ${reason}\n` +
                    `**Tarih:** ${trDate()}`
                )
                .setColor(0xff0000)
                .setThumbnail(interaction.guild.iconURL({ size: 256 }))
                .setFooter({ text: config.footer.text });

            await targetUser.send({
                embeds: [dmEmbed],
                files: [attachment]
            });
        } catch (error) {
            console.log('DM gönderilemedi:', error.message);
        }

        // Komut kullanıcısına yanıt ver
        await interaction.reply({
            embeds: [embed],
            files: [attachment]
        });

    } catch (error) {
        console.error('Uyarı ver komutu hatası:', error);
        if (!interaction.replied) {
            interaction.reply({
                content: '❌ Bir hata oluştu!',
                ephemeral: true
            });
        }
    }
}

// Uyarı sil fonksiyonu
async function handleUyariSil(interaction) {
    try {
        const targetUser = interaction.options.getUser('kullanıcı');
        const removeAmount = interaction.options.getInteger('miktar');
        const reason = interaction.options.getString('sebep') || 'Belirtilmemiş';

        // Hedef kullanıcıyı guild'den al
        const member = interaction.guild.members.cache.get(targetUser.id);
        if (!member) {
            return interaction.reply({
                content: '❌ Bu kullanıcı sunucuda bulunamadı!',
                ephemeral: true
            });
        }

        // Kullanıcının mevcut uyarılarını al
        const currentWarnings = userWarnings.get(targetUser.id) || 0;

        // Eğer mevcut uyarı yoksa
        if (currentWarnings === 0) {
            return interaction.reply({
                content: '❌ Bu kullanıcının silinecek uyarısı yok!',
                ephemeral: true
            });
        }

        // Silinecek miktarı kontrol et
        const newTotal = Math.max(0, currentWarnings - removeAmount);
        userWarnings.set(targetUser.id, newTotal);

        // Uyarı geçmişini güncelle (silme işlemini kaydet)
        const warningHistory = userWarningHistory.get(targetUser.id) || [];
        warningHistory.push({
            amount: -removeAmount, // Negatif değer silme işlemini gösterir
            reason: reason,
            date: new Date(),
            givenBy: interaction.user.id,
            givenByUsername: interaction.user.username
        });
        userWarningHistory.set(targetUser.id, warningHistory);

        // Dosyaya kaydet
        saveWarnings();

        // Uyarı azalma kartı oluştur
        const decreaseCard = await makeWarningCard(member, removeAmount, newTotal, true);
        const attachment = new AttachmentBuilder(decreaseCard, { name: 'warning-decrease.png' });

        // Embed oluştur
        const embed = new EmbedBuilder()
            .setAuthor({
                name: `${member.user.username} - UYARI Azaldı`,
                iconURL: (interaction.guild.iconURL({ size: 256 }))
            })
            .setThumbnail(interaction.guild.iconURL({ size: 256 }))
            .setDescription(`<@${interaction.user.id}> *tarafından bir kullanıcıya sunucuda başarılı bir şekilde Uyarısı Azaldı.* \n\n **Ceza Türü** \`UYARI\` \n **CEZA Azalan:** <@${targetUser.id}> \n **CEZA Azaltan:** <@${interaction.user.id}> \n **sᴇʙᴇᴘ:** ${reason} \n **ᴍɪᴋᴛᴀʀ:** ${removeAmount}x \n **Toplam** ${newTotal}x \n **ᴛᴀʀɪʜ:** <t:${Math.floor(Date.now() / 1000)}:F> (<t:${Math.floor(Date.now() / 1000)}:R>)\n`)
            .setImage('attachment://warning-decrease.png')
            .setColor("#57f288")
            .setFooter({ text: config.footer.text, iconURL: interaction.guild.iconURL({ size: 256 }) });

        // Kullanıcıya DM gönder
        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle('✅ Uyarınız Azaldı!')
                .setDescription(
                    `**Sunucu:** ${interaction.guild.name}\n` +
                    `**Azalma Miktarı:** ${removeAmount}\n` +
                    `**Toplam Uyarı:** ${newTotal}\n` +
                    `**Sebep:** ${reason}\n` +
                    `**Tarih:** ${trDate()}`
                )
                .setColor(0x00ff00)
                .setThumbnail(interaction.guild.iconURL({ size: 256 }))
                .setFooter({ text: config.footer.text });

            await targetUser.send({
                embeds: [dmEmbed],
                files: [attachment]
            });
        } catch (error) {
            console.log('DM gönderilemedi:', error.message);
        }

        // Komut kullanıcısına yanıt ver
        await interaction.reply({
            embeds: [embed],
            files: [attachment]
        });

    } catch (error) {
        console.error('Uyarı sil komutu hatası:', error);
        if (!interaction.replied) {
            interaction.reply({
                content: '❌ Bir hata oluştu!',
                ephemeral: true
            });
        }
    }
}

// Uyarı bilgi fonksiyonu
async function handleUyariBilgi(interaction) {
    try {
        const targetUser = interaction.options.getUser('kullanıcı');

        // Hedef kullanıcıyı guild'den al
        const member = interaction.guild.members.cache.get(targetUser.id);
        if (!member) {
            return interaction.reply({
                content: '❌ Bu kullanıcı sunucuda bulunamadı!',
                ephemeral: true
            });
        }

        // Kullanıcının uyarı verilerini al
        const totalWarnings = userWarnings.get(targetUser.id) || 0;
        const warningHistory = userWarningHistory.get(targetUser.id) || [];

        // En son uyarı veren kişiyi bul (pozitif uyarıları)
        const positiveWarnings = warningHistory.filter(w => w.amount > 0);
        const lastWarningGiver = positiveWarnings.length > 0
            ? positiveWarnings[positiveWarnings.length - 1].givenByUsername
            : 'Yok';

        // Tüm sebepleri topla (tekrar edenleri birleştir)
        const reasons = positiveWarnings
            .map(w => w.reason)
            .filter(r => r && r !== 'Belirtilmemiş');

        const uniqueReasons = [...new Set(reasons)];
        const reasonsText = uniqueReasons.length > 0
            ? uniqueReasons.join(', ')
            : 'Belirtilmemiş';

        // Embed oluştur (görseldeki gibi)
        const embed = new EmbedBuilder()
            .setAuthor({
                name: `${member.user.username}`,
                iconURL: (interaction.guild.iconURL({ size: 256 }))
            })
            .setDescription(`${targetUser} - ${targetUser.id} kişisinin <t:${Math.floor(Date.now() / 1000)}:F> Zaman Önceki Ceza Durumu`)
            .addFields(
                {
                    name: '**Toplam Uyarı**',
                    value: `\`\`\`fix\n${totalWarnings}\n\`\`\``,
                    inline: false
                },
                {
                    name: '**En Son Uyarı Veren**',
                    value: `\`\`\`fix\n${lastWarningGiver}\n\`\`\``,
                    inline: false
                },
                {
                    name: '**Sebepler**',
                    value: `\`\`\`fix\n${reasonsText.length > 1024 ? reasonsText.substring(0, 1021) + '...' : reasonsText}\n\`\`\``,
                    inline: false
                }
            )
            .setThumbnail((interaction.guild.iconURL({ size: 256 })))
            .setColor('#1e1f22')
            .setFooter({ text: config.footer.text, iconURL: (interaction.guild.iconURL({ size: 256 })) })
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            ephemeral: false
        });

    } catch (error) {
        console.error('Uyarı bilgi komutu hatası:', error);
        if (!interaction.replied) {
            interaction.reply({
                content: '❌ Bir hata oluştu!',
                ephemeral: true
            });
        }
    }
}
