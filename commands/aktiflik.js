const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');

// Aktiflik testlerini saklamak için Map
const activeTests = new Map();

// Kalıcı kayıt (bot yeniden başlarsa test devam etsin)
const AKTIFLIK_FILE = path.join(__dirname, '../data/aktiflik.json');
const DATA_DIR = path.join(__dirname, '../data');
const IMAGE_PREFIX = 'aktiflik-resim'; // data/aktiflik-resim.png gibi saklanır

/* ---------------- Test resmi (bot dosyalarına kayıt) ---------------- */
function findImageFile() {
    try {
        const name = fs.readdirSync(DATA_DIR).find(n => n.startsWith(`${IMAGE_PREFIX}.`));
        return name ? path.join(DATA_DIR, name) : null;
    } catch { return null; }
}

function clearImages() {
    try {
        for (const n of fs.readdirSync(DATA_DIR)) {
            if (n.startsWith(`${IMAGE_PREFIX}.`)) fs.unlinkSync(path.join(DATA_DIR, n));
        }
    } catch { /* yoksay */ }
}

async function saveImage(attachment) {
    const res = await fetch(attachment.url);
    if (!res.ok) throw new Error(`resim indirilemedi (HTTP ${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error('boş dosya');

    const mime = (attachment.contentType || '').toLowerCase();
    let ext = 'png';
    if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
    else if (mime.includes('gif')) ext = 'gif';
    else if (mime.includes('webp')) ext = 'webp';
    else if (mime.includes('png')) ext = 'png';

    clearImages(); // eski resmi kaldır
    const filePath = path.join(DATA_DIR, `${IMAGE_PREFIX}.${ext}`);
    fs.writeFileSync(filePath, buf);
    return filePath;
}

/* ---------------- Yetki ---------------- */
function isYetkili(interaction) {
    const isOwnerUser = Array.isArray(config.ownerId)
        ? config.ownerId.includes(interaction.user.id)
        : config.ownerId === interaction.user.id;
    const isOwnerRole = config.ownerRoleId && interaction.member?.roles?.cache?.has(config.ownerRoleId);
    return Boolean(isOwnerUser || isOwnerRole);
}

/* ---------------- Kalıcı kayıt ---------------- */
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

/* ---------------- Butonlar ---------------- */
function buildStartButtons() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('aktiflik_confirm')
                .setLabel('ᴀᴋᴛɪғʟɪɢ̆ᴇ ᴋᴀᴛıʟ')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('aktiflik_cancel')
                .setLabel('ɪ̇ᴘᴛᴀʟ ᴇᴛ')
                .setEmoji('⛔')
                .setStyle(ButtonStyle.Danger),
        );
}

function buildEndButtons() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('aktiflik_finished')
                .setLabel('ᴀᴋᴛɪ̇ғʟɪ̇ᴋ ʙɪ̇ᴛᴛɪ')
                .setEmoji('🔴')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true),
        );
}

/* ---------------- Bitiş embed'i (referanstaki gibi) ---------------- */
function buildEndEmbed(test, cancelled) {
    const mention = config.memberRoleId ? `<@&${config.memberRoleId}>` : '@everyone';
    const sonSatir = cancelled
        ? 'TEST İPTAL EDİLDİ — ROL ÇEKME YAPILMADI.'
        : 'AKTİVLİK TESTİ TAMAMLANDI, SONUÇ LOGU AŞAĞIDADIR.';

    const embed = new EmbedBuilder()
        .setTitle('🔴 AKTİVLİK BİTTİ')
        .setDescription(
            `${mention}\n\n` +
            `🕐 **BİTİŞ:** <t:${Math.floor(test.endTime / 1000)}:F>\n` +
            `👤 **KATILIMCI:** ${test.participants.size} KİŞİ\n\n` +
            sonSatir
        )
        .setColor('#e74c3c')
        .setFooter({ text: config.footer.text });

    const imageFile = findImageFile();
    if (imageFile) {
        const name = path.basename(imageFile);
        embed.setImage(`attachment://${name}`).setThumbnail(`attachment://${name}`);
    }

    return { embed, imageFile };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('aktiflik')
        .setDescription('Aktiflik testi başlatır')
        .addStringOption(option =>
            option.setName('süre')
                .setDescription('Test süresi (örn: 1h, 2d, 30m)')
                .setRequired(true)
        )
        .addAttachmentOption(option =>
            option.setName('resim')
                .setDescription('Test embedinde gösterilecek resim (bot dosyalarına kaydedilir)')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('resmi_kaldir')
                .setDescription('Kayıtlı resmi kaldır')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            // Owner / Boss rol kontrolü
            if (!isYetkili(interaction)) {
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

            // --- Resim: yeni yükleme veya kaldırma ---
            const resim = interaction.options.getAttachment('resim');
            const resmiKaldir = interaction.options.getBoolean('resmi_kaldir');

            if (resim) {
                if (resim.contentType && !resim.contentType.startsWith('image/')) {
                    return interaction.reply({ content: '❌ Bu dosya bir resim değil! (png/jpg/gif/webp)', ephemeral: true });
                }
                try {
                    await saveImage(resim);
                } catch (error) {
                    console.error('Aktiflik resmi kaydedilemedi:', error.message);
                    return interaction.reply({ content: `❌ Resim kaydedilemedi: \`${error.message}\``, ephemeral: true });
                }
            } else if (resmiKaldir) {
                clearImages();
            }

            const imageFile = findImageFile();

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

            if (imageFile) embed.setImage(`attachment://${path.basename(imageFile)}`);

            // Butonlar: katılım + iptal (iptal sadece yetkililer)
            const button = buildStartButtons();

            // Mesajı gönder
            const payload = {
                embeds: [embed],
                components: [button],
                fetchReply: true,
            };
            if (imageFile) payload.files = [new AttachmentBuilder(imageFile, { name: path.basename(imageFile) })];

            const message = await interaction.reply(payload);

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
async function endActivityTest(messageId, cancelled = false) {
    try {
        const test = activeTests.get(messageId);
        if (!test) return;

        const { participants, message, guild } = test;

        // Referanstaki gibi embed + pasif buton
        const { embed, imageFile } = buildEndEmbed(test, cancelled);

        const payload = {
            embeds: [embed],
            components: [buildEndButtons()],
        };
        if (imageFile) payload.files = [new AttachmentBuilder(imageFile, { name: path.basename(imageFile) })];

        // Mesajı güncelle
        await message.edit(payload);

        // İptal edildiyse rol çekme yapılmaz
        if (!cancelled) {
            // Crew rolü olan ama butona basmayanları bul ve rolü çek
            const memberRole = guild.roles.cache.get(config.memberRoleId);
            if (memberRole) {
                const members = await guild.members.fetch();

                for (const [memberId, member] of members) {
                    if (member.roles.cache.has(config.memberRoleId) && !participants.has(memberId)) {
                        try {
                            await member.roles.remove(memberRole);
                            // Sadece "Ekipten atıldı" mesajını gönder (embed olmadan, düz metin)
                            await message.channel.send(`<@${memberId}> - \`${memberId}\` Ekipten atıldı.`);

                            // Kısa bekleme
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } catch (error) {
                            console.error(`Rol çekme hatası ${memberId}:`, error);
                        }
                    }
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
    /* --------- İPTAL ET (sadece yetkililer) --------- */
    if (interaction.customId === 'aktiflik_cancel') {
        try {
            if (!isYetkili(interaction)) {
                return interaction.reply({
                    content: '❌ Bu butonu sadece **yetkililer** kullanabilir!',
                    ephemeral: true
                });
            }

            const test = activeTests.get(interaction.message.id);
            if (!test) {
                return interaction.reply({
                    content: '❌ Bu aktiflik testi artık geçerli değil!',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });
            await endActivityTest(interaction.message.id, true);
            return interaction.editReply('⛔ Aktiflik testi iptal edildi. (Rol çekilmedi)');
        } catch (error) {
            console.error('İptal butonu hatası:', error);
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ content: '❌ Bir hata oluştu!', ephemeral: true });
            }
        }
        return;
    }

    if (interaction.customId !== 'aktiflik_confirm') return;

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

        // Embed'i güncelle ama butonu aktif bırak (resmi da koru)
        const payload = { embeds: [updatedEmbed] };
        const imageFile = findImageFile();
        if (imageFile) payload.files = [new AttachmentBuilder(imageFile, { name: path.basename(imageFile) })];
        await message.edit(payload);

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
};
