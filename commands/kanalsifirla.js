// commands/kanalsifirla.js
// Kanalı sıfırlar — mesajlar, ayarlar ve izinler AYRI AYRI seçilebilir.
const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../utils/env');

const METIN_TURLERI = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum];
const SES_TURLERI = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];

function isYetkili(interaction) {
    const owner = Array.isArray(config.ownerId)
        ? config.ownerId.includes(interaction.user.id)
        : config.ownerId === interaction.user.id;
    const boss = config.ownerRoleId && interaction.member?.roles?.cache?.has(config.ownerRoleId);
    return Boolean(owner || boss);
}

/* ---------------- Mesajları sil ---------------- */
async function mesajlariTemizle(channel) {
    const mesajlar = await channel.messages.fetch({ limit: 1000 });
    const liste = [...mesajlar.values()];
    const now = Date.now();
    const ON14GUN = 14 * 24 * 60 * 60 * 1000;

    // Discord toplu silme sadece 14 günden eski olmayanları kabul eder
    const taze = liste.filter(m => now - m.createdTimestamp < ON14GUN);
    const eski = liste.filter(m => now - m.createdTimestamp >= ON14GUN);

    let silinen = 0;
    let hata = 0;

    for (let i = 0; i < taze.length; i += 100) {
        const chunk = taze.slice(i, i + 100);
        try {
            await channel.bulkDelete(chunk, true);
            silinen += chunk.length;
        } catch {
            // Toplu silemediyse tek tek dene
            for (const m of chunk) {
                try { await m.delete(); silinen++; } catch { hata++; }
            }
        }
    }

    // 14 günden eskiler tek tek silinir
    for (const m of eski) {
        try { await m.delete(); silinen++; } catch { hata++; }
    }

    return { silinen, hata };
}

/* ---------------- Ayarları sıfırla ---------------- */
async function ayarlariSifirla(channel) {
    const yapilan = [];

    if (METIN_TURLERI.includes(channel.type)) {
        if (channel.topic) { await channel.setTopic(null, 'Kanal sıfırlandı'); yapilan.push('konu temizlendi'); }
        if (channel.rateLimitPerUser > 0) { await channel.setRateLimitPerUser(0, 'Kanal sıfırlandı'); yapilan.push('yavaş mod kapatıldı'); }
        if (channel.nsfw) { await channel.setNSFW(false, 'Kanal sıfırlandı'); yapilan.push('NSFW kapatıldı'); }
        if (yapilan.length === 0) yapilan.push('metin kanalı zaten varsayılanda');
    } else if (SES_TURLERI.includes(channel.type)) {
        const maxBitrate = channel.guild.maximumBitrate || 96000;
        const varsayilanBitrate = Math.min(64000, maxBitrate);
        if (channel.bitrate !== varsayilanBitrate) { await channel.setBitrate(varsayilanBitrate, 'Kanal sıfırlandı'); yapilan.push('bitrate sıfırlandı'); }
        if (channel.userLimit !== 0) { await channel.setUserLimit(0, 'Kanal sıfırlandı'); yapilan.push('kişi limiti kaldırıldı'); }
        if (channel.rtcRegion) { await channel.setRTCRegion(null, 'Kanal sıfırlandı'); yapilan.push('bölge otomatik yapıldı'); }
        if (yapilan.length === 0) yapilan.push('ses kanalı zaten varsayılanda');
    }

    return yapilan;
}

/* ---------------- İzinleri sıfırla ---------------- */
async function izinleriSifirla(channel) {
    const sayi = channel.permissionOverwrites.cache.size;
    await channel.permissionOverwrites.set([], 'Kanal izinleri sıfırlandı');
    return sayi;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kanalsifirla')
        .setDescription('Kanalı sıfırlar: mesajlar, ayarlar ve izinler ayrı ayrı seçilebilir')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addChannelOption(o => o
            .setName('kanal')
            .setDescription('Sıfırlanacak kanal (boş: bu kanal)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildStageVoice)
            .setRequired(false))
        .addBooleanOption(o => o.setName('mesajlar').setDescription('Mesaj geçmişini sil (son 1000 mesaj)').setRequired(false))
        .addBooleanOption(o => o.setName('ayarlar').setDescription('Kanal ayarlarını varsayılana döndür (konu, yavaş mod, nsfw, bitrate...)').setRequired(false))
        .addBooleanOption(o => o.setName('izinler').setDescription('Kanal izinlerini (overwrite) sıfırla').setRequired(false))
        .addBooleanOption(o => o.setName('onay').setDescription('Gerçekten sıfırlamak istiyor musun? (evet olmalı)').setRequired(false)),

    async execute(interaction) {
        if (!isYetkili(interaction)) {
            return interaction.reply({ content: '❌ Bu komutu sadece **bot sahipleri** veya **Boss** rolü kullanabilir!', ephemeral: true });
        }

        const kanal = interaction.options.getChannel('kanal') ?? interaction.channel;
        const mesajlar = interaction.options.getBoolean('mesajlar');
        const ayarlar = interaction.options.getBoolean('ayarlar');
        const izinler = interaction.options.getBoolean('izinler');
        const onay = interaction.options.getBoolean('onay');

        if (!mesajlar && !ayarlar && !izinler) {
            return interaction.reply({
                content: 'ℹ️ **Ne sıfırlanacak?** Birini seç:\n' +
                    '• `mesajlar:true` — mesaj geçmişini siler\n' +
                    '• `ayarlar:true` — konu/yavaş mod/nsfw/bitrate gibi ayarları varsayılana döndürür\n' +
                    '• `izinler:true` — kanal izinlerini (overwrite) sıfırlar\n' +
                    '• `onay:true` — işlemi onaylar\n\n' +
                    'Örnek: `/kanalsifirla mesajlar:true onay:true`',
                ephemeral: true,
            });
        }

        if (!onay) {
            return interaction.reply({
                content: '❌ Bu işlem **geri alınamaz**! Devam etmek için `onay:true` yaz.',
                ephemeral: true,
            });
        }

        // Tür kontrolleri
        if (mesajlar && kanal.type === ChannelType.GuildForum) {
            return interaction.reply({ content: '❌ Forum kanallarında mesaj silinemez!', ephemeral: true });
        }
        if (mesajlar && !METIN_TURLERI.includes(kanal.type)) {
            return interaction.reply({ content: '❌ Mesajlar sadece **metin kanallarından** silinebilir!', ephemeral: true });
        }
        if (ayarlar && !METIN_TURLERI.includes(kanal.type) && !SES_TURLERI.includes(kanal.type)) {
            return interaction.reply({ content: '❌ Bu kanal türü sıfırlanamaz!', ephemeral: true });
        }

        // Bot yetkileri
        const me = interaction.guild.members.me;
        if (mesajlar && !me?.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: '❌ Botun **Mesajları Yönet** yetkisi yok!', ephemeral: true });
        }
        if ((ayarlar || izinler) && !me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({ content: '❌ Botun **Kanalları Yönet** yetkisi yok!', ephemeral: true });
        }
        if (izinler && !me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ content: '❌ Botun **Rolleri Yönet** yetkisi yok!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const yapilan = [];
        const hatalar = [];

        if (mesajlar) {
            try {
                const { silinen, hata } = await mesajlariTemizle(kanal);
                yapilan.push(`🗑️ **Mesajlar:** ${silinen} mesaj silindi${hata ? ` (${hata} tanesi silinemedi)` : ''}`);
            } catch (error) {
                hatalar.push(`Mesajlar: ${error.message}`);
            }
        }

        if (ayarlar) {
            try {
                const adimlar = await ayarlariSifirla(kanal);
                yapilan.push(`⚙️ **Ayarlar:** ${adimlar.join(', ')}`);
            } catch (error) {
                hatalar.push(`Ayarlar: ${error.message}`);
            }
        }

        if (izinler) {
            try {
                const sayi = await izinleriSifirla(kanal);
                yapilan.push(`🔐 **İzinler:** ${sayi} izin kaydı sıfırlandı`);
            } catch (error) {
                hatalar.push(`İzinler: ${error.message}`);
            }
        }

        const embed = new EmbedBuilder()
            .setColor(hatalar.length ? '#e74c3c' : '#2ecc71')
            .setTitle('🧹 Kanal Sıfırlandı')
            .setDescription(`${yapilan.join('\n') || 'Yapılacak işlem yok.'}`)
            .addFields({ name: '📍 Kanal', value: `${kanal}`, inline: true })
            .setFooter({ text: config.footer.text })
            .setTimestamp();

        if (hatalar.length) {
            embed.addFields({ name: '⚠️ Hatalar', value: hatalar.join('\n') });
        }

        return interaction.editReply({ embeds: [embed] });
    },
};
