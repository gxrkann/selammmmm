// commands/kanalsifirla.js
// Kanalı sıfırlar — mesajlar, ayarlar ve izinler AYRI AYRI seçilebilir.
// Onay: "onay:true" ile anında, yoksa embed içindeki ✅ butonuyla tek tık.
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
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

function botYetkileri(kanal, guild) {
    const me = guild.members.me;
    const kanalPerms = kanal.permissionsFor?.(me) ?? me?.permissions;
    return {
        mesajlar: Boolean(kanalPerms?.has(PermissionFlagsBits.ManageMessages)),
        ayarlar: Boolean(kanalPerms?.has(PermissionFlagsBits.ManageChannels)),
        izinler: Boolean(kanalPerms?.has(PermissionFlagsBits.ManageRoles)),
    };
}

/* ---------------- Mesajları sil (sayfa sayfa, en fazla 1000) ---------------- */
async function mesajlariTemizle(channel) {
    // Discord tek istekte en fazla 100 mesaj döner — 10 sayfa × 100 = 1000
    const liste = [];
    let before;
    for (let sayfa = 0; sayfa < 10; sayfa++) {
        const batch = await channel.messages.fetch(before ? { limit: 100, before } : { limit: 100 });
        liste.push(...batch.values());
        if (batch.size < 100) break;
        before = batch.lastKey();
    }

    const toplam = liste.length;
    const now = Date.now();
    const ON14GUN = 14 * 24 * 60 * 60 * 1000;

    const taze = liste.filter(m => now - m.createdTimestamp < ON14GUN);
    const eski = liste.filter(m => now - m.createdTimestamp >= ON14GUN);

    let silinen = 0;
    let hata = 0;

    for (let i = 0; i < taze.length; i += 100) {
        const chunk = taze.slice(i, i + 100);
        try {
            const sonuc = await channel.bulkDelete(chunk, true);
            silinen += sonuc.size;
            // bulkDelete filtresine takılanlar (14 gün sınırına denk gelenler) tek tek
            if (sonuc.size < chunk.length) {
                const silinenIdler = new Set(sonuc.map(m => m.id));
                for (const m of chunk) {
                    if (silinenIdler.has(m.id)) continue;
                    try { await m.delete(); silinen++; } catch { hata++; }
                }
            }
        } catch {
            for (const m of chunk) {
                try { await m.delete(); silinen++; } catch { hata++; }
            }
        }
    }

    // 14 günden eskiler tek tek silinir
    for (const m of eski) {
        try { await m.delete(); silinen++; } catch { hata++; }
    }

    return { toplam, silinen, hata };
}

/* ---------------- Ayarları sıfırla (her adım ayrı ayrı, detaylı rapor) ---------------- */
async function ayarlariSifirla(channel) {
    const yapilan = [];
    const adim = async (etiket, kosul, islem) => {
        if (!kosul) { yapilan.push(`${etiket}: zaten varsayılanda`); return; }
        try {
            await islem();
            yapilan.push(`${etiket}: sıfırlandı`);
        } catch (error) {
            yapilan.push(`${etiket}: ❌ ${error.message}`);
        }
    };

    if (METIN_TURLERI.includes(channel.type)) {
        await adim('Konu', Boolean(channel.topic), () => channel.setTopic(null, 'Kanal sıfırlandı'));
        await adim('Yavaş mod', channel.rateLimitPerUser > 0, () => channel.setRateLimitPerUser(0, 'Kanal sıfırlandı'));
        await adim('NSFW', Boolean(channel.nsfw), () => channel.setNSFW(false, 'Kanal sıfırlandı'));
    } else if (SES_TURLERI.includes(channel.type)) {
        const maxBitrate = channel.guild.maximumBitrate || 96000;
        const varsayilanBitrate = Math.min(64000, maxBitrate);
        await adim('Bitrate', channel.bitrate !== varsayilanBitrate, () => channel.setBitrate(varsayilanBitrate, 'Kanal sıfırlandı'));
        await adim('Kişi limiti', channel.userLimit !== 0, () => channel.setUserLimit(0, 'Kanal sıfırlandı'));
        await adim('Bölge', Boolean(channel.rtcRegion), () => channel.setRTCRegion(null, 'Kanal sıfırlandı'));
    } else {
        yapilan.push('Bu kanal türünde ayar sıfırlanamaz');
    }

    return yapilan;
}

/* ---------------- İzinleri sıfırla (tek tek; biri yetki yüzünden patlarsa diğeri yapılsın) ---------------- */
async function izinleriSifirla(channel) {
    const liste = [...channel.permissionOverwrites.cache.values()];
    if (liste.length === 0) return { kaldirilan: 0, kalan: 0 };

    let kaldirilan = 0;
    let kalan = 0;
    for (const ow of liste) {
        try {
            await channel.permissionOverwrites.delete(ow, 'Kanal izinleri sıfırlandı');
            kaldirilan++;
        } catch {
            kalan++;
        }
    }
    return { kaldirilan, kalan };
}

/* ---------------- Ortak çalıştırıcı ---------------- */
async function calistir(kanal, { mesajlar, ayarlar, izinler }) {
    const yapilan = [];
    const hatalar = [];

    if (mesajlar) {
        try {
            const { toplam, silinen, hata } = await mesajlariTemizle(kanal);
            yapilan.push(`🗑️ **Mesajlar:** kanalda ${toplam} mesaj vardı → **${silinen} silindi**${hata ? ` (${hata} tanesi silinemedi)` : ''}`);
        } catch (error) {
            hatalar.push(`Mesajlar: ${error.message}`);
        }
    }

    if (ayarlar) {
        try {
            const adimlar = await ayarlariSifirla(kanal);
            yapilan.push(`⚙️ **Ayarlar:**\n${adimlar.map(a => `• ${a}`).join('\n')}`);
        } catch (error) {
            hatalar.push(`Ayarlar: ${error.message}`);
        }
    }

    if (izinler) {
        try {
            const { kaldirilan, kalan } = await izinleriSifirla(kanal);
            yapilan.push(kaldirilan || kalan
                ? `🔐 **İzinler:** ${kaldirilan} izin kaydı kaldırıldı${kalan ? ` (${kalan} tanesi yetki yüzünden kaldırılamadı)` : ''}`
                : '🔐 **İzinler:** zaten izin yoktu');
        } catch (error) {
            hatalar.push(`İzinler: ${error.message}`);
        }
    }

    return { yapilan, hatalar };
}

function sonucEmbed(kanal, yapilan, hatalar) {
    return new EmbedBuilder()
        .setColor(hatalar.length ? '#e74c3c' : '#2ecc71')
        .setTitle('🧹 Kanal Sıfırlandı')
        .setDescription(yapilan.join('\n') || 'Yapılacak işlem yok.')
        .addFields({ name: '📍 Kanal', value: `${kanal}`, inline: true })
        .setFooter({ text: config.footer.text })
        .setTimestamp();
}

function secenekMetni({ mesajlar, ayarlar, izinler }) {
    const liste = [];
    if (mesajlar) liste.push('Mesajlar');
    if (ayarlar) liste.push('Ayarlar');
    if (izinler) liste.push('İzinler');
    return liste.join(', ');
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
        .addBooleanOption(o => o.setName('onay').setDescription('Onay butonu beklemeden hemen uygula').setRequired(false)),

    async execute(interaction) {
        if (!isYetkili(interaction)) {
            return interaction.reply({ content: '❌ Bu komutu sadece **bot sahipleri** veya **Boss** rolü kullanabilir!', ephemeral: true });
        }

        const kanal = interaction.options.getChannel('kanal') ?? interaction.channel;
        const secim = {
            mesajlar: interaction.options.getBoolean('mesajlar'),
            ayarlar: interaction.options.getBoolean('ayarlar'),
            izinler: interaction.options.getBoolean('izinler'),
        };
        const onay = interaction.options.getBoolean('onay');

        if (!secim.mesajlar && !secim.ayarlar && !secim.izinler) {
            return interaction.reply({
                content: 'ℹ️ **Ne sıfırlanacak?** Birini seç:\n' +
                    '• `mesajlar:true` — mesaj geçmişini siler\n' +
                    '• `ayarlar:true` — konu/yavaş mod/nsfw/bitrate gibi ayarları varsayılana döndürür\n' +
                    '• `izinler:true` — kanal izinlerini (overwrite) sıfırlar\n\n' +
                    'Örnek: `/kanalsifirla mesajlar:true` → çıkan butona bas',
                ephemeral: true,
            });
        }

        // Tür kontrolleri
        if (secim.mesajlar && kanal.type === ChannelType.GuildForum) {
            return interaction.reply({ content: '❌ Forum kanallarında mesaj silinemez!', ephemeral: true });
        }
        if (secim.mesajlar && !METIN_TURLERI.includes(kanal.type)) {
            return interaction.reply({ content: '❌ Mesajlar sadece **metin kanallarından** silinebilir!', ephemeral: true });
        }
        if (secim.ayarlar && !METIN_TURLERI.includes(kanal.type) && !SES_TURLERI.includes(kanal.type)) {
            return interaction.reply({ content: '❌ Bu kanal türü sıfırlanamaz!', ephemeral: true });
        }

        // Bot yetkileri (hedef kanal bazında)
        const me = interaction.guild.members.me;
        if (!me) {
            return interaction.reply({ content: '❌ Bot üye bilgisi alamadı!', ephemeral: true });
        }
        const yetkiler = botYetkileri(kanal, interaction.guild);
        if (secim.mesajlar && !yetkiler.mesajlar) {
            return interaction.reply({ content: `❌ Botun bu kanalda **Mesajları Yönet** yetkisi yok!`, ephemeral: true });
        }
        if ((secim.ayarlar || secim.izinler) && !yetkiler.ayarlar) {
            return interaction.reply({ content: `❌ Botun bu kanalda **Kanalları Yönet** yetkisi yok!`, ephemeral: true });
        }
        if (secim.izinler && !yetkiler.izinler) {
            return interaction.reply({ content: `❌ Botun bu kanalda **Rolleri Yönet** yetkisi yok!`, ephemeral: true });
        }

        // --- Onay:true varsa direkt uygula ---
        if (onay) {
            await interaction.deferReply({ ephemeral: true });
            const { yapilan, hatalar } = await calistir(kanal, secim);
            return interaction.editReply({ embeds: [sonucEmbed(kanal, yapilan, hatalar)] });
        }

        // --- Yoksa tek tıkla onay butonu ---
        const bayrak = `${secim.mesajlar ? 1 : 0}${secim.ayarlar ? 1 : 0}${secim.izinler ? 1 : 0}`;
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`klsf:${kanal.id}:${bayrak}`)
                .setLabel('Evet, sıfırla')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Danger),
        );

        const embed = new EmbedBuilder()
            .setColor('#e67e22')
            .setTitle('⚠️ Kanal Sıfırlanacak')
            .setDescription(
                `📍 Kanal: ${kanal}\n` +
                `Sıfırlanacak: **${secenekMetni(secim)}**\n\n` +
                'Onaylamak için aşağıdaki butona bas. (Geri alınamaz!)'
            )
            .setFooter({ text: config.footer.text });

        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    },

    /* ---------------- Onay butonu ---------------- */
    async handleButton(interaction) {
        if (!isYetkili(interaction)) {
            return interaction.reply({ content: '❌ Bu işlemi sadece **bot sahipleri** veya **Boss** rolü onaylayabilir!', ephemeral: true });
        }

        const [, kanalId, bayrak] = interaction.customId.split(':');
        const secim = {
            mesajlar: bayrak[0] === '1',
            ayarlar: bayrak[1] === '1',
            izinler: bayrak[2] === '1',
        };

        await interaction.deferUpdate();

        const kanal = await interaction.guild.channels.fetch(kanalId).catch(() => null);
        if (!kanal) {
            return interaction.editReply({ content: '❌ Kanal bulunamadı!', embeds: [], components: [] });
        }

        const { yapilan, hatalar } = await calistir(kanal, secim);
        return interaction.editReply({ embeds: [sonucEmbed(kanal, yapilan, hatalar)], components: [] });
    },
};
