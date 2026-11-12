const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');

// Aktiflik testlerini saklamak için Map
const activeTests = new Map();

// Kalıcı kayıt (bot yeniden başlarsa test devam etsin)
const AKTIFLIK_FILE = path.join(__dirname, '../data/aktiflik.json');

function saveTest(test) {
    try {
        fs.writeFileSync(AKTIFLIK_FILE, JSON.stringify({
            messageId: test.message.id,
            channelId: test.message.channel.id,
            endTime: test.endTime,
            participants: [...test.participants],
        }, null, 2), 'utf8');
    } catch (error) {
        console.error('Aktiflik testi kaydedilemedi:', error.message);
    }
}

function loadTest() {
    try {
        if (!fs.existsSync(AKTIFLIK_FILE)) return null;
        return JSON.parse(fs.readFileSync(AKTIFLIK_FILE, 'utf8'));
    } catch {
        return null;
    }
}

function clearTest() {
    try {
        if (fs.existsSync(AKTIFLIK_FILE)) fs.unlinkSync(AKTIFLIK_FILE);
    } catch { /* yoksay */ }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('aktiflik')
        .setDescription('Aktiflik testi başlatır')
        .addStringOption(option =>
            option.setName('süre')
                .setDescription('Test süresi (örn: 1h, 2d, 30m)')
                .setRequired(true)
        ),

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

            const timeInput = interaction.options.getString('süre');

            // Süre parsing - saniye desteği eklendi
            const timeMatch = timeInput.match(/^(\d+)([hdms])$/i);
            if (!timeMatch) {
                return interaction.reply({
                    content: '❌ Geçersiz süre formatı! Örnek: `1h`, `2d`, `30m`, `10s`',
                    ephemeral: true
                });
            }

            const amount = parseInt(timeMatch[1]);
            const unit = timeMatch[2].toLowerCase();

            let durationMs;
            switch (unit) {
                case 'h': durationMs = amount * 60 * 60 * 1000; break;
                case 'd': durationMs = amount * 24 * 60 * 60 * 1000; break;
                case 'm': durationMs = amount * 60 * 1000; break;
                case 's': durationMs = amount * 1000; break;
            }

            // Minimum 1 dakika, max 2 gün kontrolü
            const minDuration = 60 * 1000; // 1 dakika
            const maxDuration = 2 * 24 * 60 * 60 * 1000; // 2 gün

            if (durationMs < minDuration || durationMs > maxDuration) {
                return interaction.reply({
                    content: '❌ Süre en az 1 dakika, en fazla 2 gün olmalıdır!',
                    ephemeral: true
                });
            }

            const endTime = Date.now() + durationMs;
            const participants = new Set();

            // Embed oluştur (1. görsel gibi)
            const embed = new EmbedBuilder()
                .setTitle(`${interaction.guild.name} Aktiflik Testi`)
                .setDescription(
                    '> **Aktiflik Testi başlamıştır.**\n' +
                    'Aşağıdaki butona tıklayarak katılımınızı onaylayabilirsiniz.\n' +
                    `⚠️ **KATILIM SAĞLAMAZSANIZ** <@&${config.memberRoleId}> perminiz çekilecektir...\n\n` +
                    `**Kalan Süre :** <t:${Math.floor(endTime / 1000)}:R>\n` +
                    `**Katılımcı Sayısı :** \`0\``
                )
                .setColor("#add8e6")
                .setThumbnail(interaction.client.user.displayAvatarURL({ size: 256 })); // Bot avatar'ı
            // Buton oluştur
            const button = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('aktiflik_confirm')
                        .setLabel('Aktifliğini Onayla')
                        .setStyle(ButtonStyle.Success)
                );

            // Mesajı gönder
            const message = await interaction.reply({
                embeds: [embed],
                components: [button],
                fetchReply: true
            });

            // Aktiflik testini kaydet
            activeTests.set(message.id, {
                endTime,
                participants,
                message,
                guild: interaction.guild
            });
            saveTest(activeTests.get(message.id));

            // Süre bitince otomatik güncelleme
            setTimeout(async () => {
                await endActivityTest(message.id);
            }, durationMs);

        } catch (error) {
            console.error('Aktiflik komutu hatası:', error);
            if (!interaction.replied) {
                interaction.reply({
                    content: '❌ Bir hata oluştu!',
                    ephemeral: true
                });
            }
        }
    }
};

// Aktiflik testini bitir
async function endActivityTest(messageId) {
    try {
        const test = activeTests.get(messageId);
        if (!test) return;

        const { participants, message, guild } = test;

        // 2. görsel gibi embed oluştur
        const endEmbed = new EmbedBuilder()
            .setTitle('Süre Bitti!')
            .setDescription(
                '> **Aktiflik Testi sona ermiştir.**\n' +
                `**Katılımcı Sayısı:** \`${participants.size}\``
            )
            .setColor("#add8e6")
            .setThumbnail(message.client.user.displayAvatarURL({ size: 256 }))
            .setFooter({ text: '> Basmayan Üyelerin Permleri Çekiliyor...' });

        // Mesajı güncelle
        await message.edit({
            embeds: [endEmbed],
            components: []
        });


        // Crew rolü olan ama butona basmayanları bul ve rolü çek
        const memberRole = guild.roles.cache.get(config.memberRoleId);
        if (!memberRole) return;

        const members = await guild.members.fetch();
        let removedCount = 0;

        for (const [memberId, member] of members) {
            if (member.roles.cache.has(config.memberRoleId) && !participants.has(memberId)) {
                try {
                    await member.roles.remove(memberRole);
                    removedCount++;

                    // Sadece "Ekipten atıldı" mesajını gönder (embed olmadan, düz metin)
                    await message.channel.send(`<@${memberId}> - \`${memberId}\` Ekipten atıldı.`);

                    // Kısa bekleme
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    console.error(`Rol çekme hatası ${memberId}:`, error);
                }
            }
        }

        // Testi temizle
        activeTests.delete(messageId);
        clearTest();

    } catch (error) {
        console.error('Aktiflik testi bitirme hatası:', error);
    }
}

// Bot yeniden başladıktan sonra aktif testi kaldığı yerden devam ettirir
module.exports.resumeTests = async (client) => {
    try {
        const saved = loadTest();
        if (!saved) return;

        const channel = await client.channels.fetch(saved.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return clearTest();

        const message = await channel.messages.fetch(saved.messageId).catch(() => null);
        if (!message) return clearTest();

        const remaining = saved.endTime - Date.now();
        if (remaining <= 0) {
            // Süre bot kapalıyken bitti -> hemen bitir
            activeTests.set(saved.messageId, {
                endTime: saved.endTime,
                participants: new Set(saved.participants),
                message,
                guild: message.guild,
            });
            return endActivityTest(saved.messageId);
        }

        activeTests.set(saved.messageId, {
            endTime: saved.endTime,
            participants: new Set(saved.participants),
            message,
            guild: message.guild,
        });

        setTimeout(async () => {
            await endActivityTest(saved.messageId);
        }, remaining);

        console.log(`[INFO] Aktiflik testi devam ettirildi (${Math.round(remaining / 60000)} dk kaldı).`);
    } catch (error) {
        console.error('Aktiflik testi devam ettirme hatası:', error);
    }
};

// Buton interaction handler (interactionCreate.js'e eklenecek)
module.exports.handleButton = async (interaction) => {
    if (interaction.customId === 'aktiflik_confirm') {
        try {
            const test = activeTests.get(interaction.message.id);
            if (!test) {
                return interaction.reply({
                    content: '❌ Bu aktiflik testi artık geçerli değil!',
                    ephemeral: true
                });
            }

            const { participants, message } = test;

            if (participants.has(interaction.user.id)) {
                return interaction.reply({
                    content: '❌ Zaten katılımınızı onayladınız!',
                    ephemeral: true
                });
            }

            // Katılımcıyı ekle
            participants.add(interaction.user.id);
            saveTest(test);

            // Embed'i güncelle - description'da katılımcı sayısını güncelle
            const currentEmbed = interaction.message.embeds[0];
            const currentDescription = currentEmbed.description;

            // Katılımcı sayısını güncelle
            const updatedDescription = currentDescription.replace(
                /\*\*Katılımcı Sayısı :\*\* `\d+`/,
                `**Katılımcı Sayısı :** \`${participants.size}\``
            );

            const updatedEmbed = EmbedBuilder.from(currentEmbed)
                .setDescription(updatedDescription);

            // Embed'i güncelle ama butonu aktif bırak
            await interaction.message.edit({
                embeds: [updatedEmbed]
            });

            await interaction.reply({
                content: '✅ Aktifliğiniz onaylandı!',
                ephemeral: true
            });

        } catch (error) {
            console.error('Buton interaction hatası:', error);
            if (!interaction.replied) {
                interaction.reply({
                    content: '❌ Bir hata oluştu!',
                    ephemeral: true
                });
            }
        }
    }
};
