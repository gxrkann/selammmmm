// commands/etkinlik.js
// In-game etkinlik yoklama sistemi
// KATIL / AYRIL / BİLGİ / İPTAL butonları + otomatik rol (perm) + etkinlik kodu DM
const {
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits
} = require('discord.js');
const config = require('../config.json');
const fs = require('fs');
const path = require('path');

const ETKINLIK_FILE = path.join(__dirname, '../data/etkinlik.json');
const BRAND = config.footer.text;

/* ---------------- Veri yardımcıları ---------------- */
function load() {
    try {
        if (fs.existsSync(ETKINLIK_FILE)) return JSON.parse(fs.readFileSync(ETKINLIK_FILE, 'utf8'));
    } catch (e) { console.error('[ETKİNİLİK] Veri okunamadı:', e.message); }
    return {};
}

function save(data) {
    try {
        fs.writeFileSync(ETKINLIK_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) { console.error('[ETKİNİLİK] Veri yazılamadı:', e.message); }
}

function getActive() { return load().active || null; }
function setActive(ev) { const d = load(); d.active = ev; save(d); }
function clearActive() { const d = load(); d.active = null; save(d); }

function isOwner(interaction, ev) {
    if (ev && interaction.user.id === ev.ownerId) return true;
    if (config.ownerId.includes(interaction.user.id)) return true;
    if (config.ownerRoleId && interaction.member?.roles?.cache?.has(config.ownerRoleId)) return true;
    return false;
}

function eventRole(guild) {
    return (config.etkinlikRoleId && guild.roles.cache.get(config.etkinlikRoleId)) || null;
}

/* ---------------- Embed ---------------- */
function buildEmbed(ev) {
    const started = ev.status !== 'beklemede';

    const desc =
        `<@&${ev.roleId || '@everyone'}> KADRO (silme) VERİLDİR. AYRILINCA VE SÜRE BİTİNCE ALINIR.` +
        (started ? `\n\n✅ **ETKİNLİK BAŞLADI — Etkinlik kodları DM ile gönderildi.**` : '');

    const kadroList = ev.kadro.map((id, i) => `${i + 1}. <@${id}>`).join('\n') || '_Henüz katılım yok_';
    const yedekList = ev.yedek.length ? ev.yedek.map((id, i) => `${i + 1}. <@${id}>`).join('\n') : '_Yedek yok_';

    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle(`${BRAND.toUpperCase()}_YOKLAMA`)
        .setDescription(desc)
        .addFields(
            { name: '• KADRO:', value: `\`${ev.kadro.length}/${ev.kadroMax}\``, inline: true },
            { name: '• YEDEK:', value: `\`${ev.yedek.length}/${ev.yedekMax}\``, inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
            { name: '• BİRTS:', value: `<t:${Math.floor(ev.startAt / 1000)}:F>\n<t:${Math.floor(ev.startAt / 1000)}:R>`, inline: true },
            { name: '• SÜRE:', value: `\`${ev.sureSaat} SAAT\``, inline: true },
            { name: '• TOPLANMA:', value: `<t:${Math.floor(ev.toplasmaAt / 1000)}:t>`, inline: true },
            { name: `KADRO (${ev.kadro.length})`, value: kadroList.slice(0, 1024) },
            { name: `YEDEK (${ev.yedek.length})`, value: yedekList.slice(0, 1024) },
        )
        .setFooter({ text: BRAND })
        .setTimestamp();

    const logoPath = path.join(__dirname, '../Sanzy_logosu_ve_ylan_detaylar.png');
    if (fs.existsSync(logoPath)) {
        embed.setImage('attachment://logo.png');
        return { embed, file: logoPath };
    }
    return { embed, file: null };
}

function buildButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('etk_katil').setLabel('KATIL').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('etk_ayril').setLabel('AYRIL').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('etk_bilgi').setLabel('BİLGİ').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('etk_iptal').setLabel('İPTAL ET').setStyle(ButtonStyle.Secondary),
    );
}

/* ---------------- Komut ---------------- */
module.exports = {
    data: new SlashCommandBuilder()
        .setName('etkinlik')
        .setDescription('In-game etkinlik yoklaması oluşturur')
        .addIntegerOption(o => o.setName('kadro').setDescription('Kadro kapasitesi (ana kadro)').setRequired(true).setMinValue(1).setMaxValue(50))
        .addIntegerOption(o => o.setName('yedek').setDescription('Yedek kapasitesi').setRequired(true).setMinValue(0).setMaxValue(20))
        .addIntegerOption(o => o.setName('baslangic').setDescription('Kaç dakika sonra başlasın? (5-1440)').setRequired(true).setMinValue(5).setMaxValue(1440))
        .addIntegerOption(o => o.setName('sure').setDescription('Kaç saat sürecek?').setRequired(true).setMinValue(1).setMaxValue(12))
        .addIntegerOption(o => o.setName('toplanma').setDescription('Kaç dakika sonra toplanma? (boş bırakılırsa başlangıçtan 10 dk önce)').setMinValue(5).setMaxValue(1440))
        .addStringOption(o => o.setName('kod').setDescription('Etkinlik kodu (boş bırakılırsa rastgele üretilir)').setMaxLength(20))
        .addChannelOption(o => o.setName('kanal').setDescription('Mesajın gönderileceği kanal (boş: bu kanal)')),

    async execute(interaction) {
        // Sadece owner / boss
        const isOwnerUser = config.ownerId.includes(interaction.user.id);
        const isOwnerRole = config.ownerRoleId && interaction.member?.roles?.cache?.has(config.ownerRoleId);
        if (!isOwnerUser && !isOwnerRole) {
            return interaction.reply({ content: '❌ Bu komutu sadece yetkililer kullanabilir!', ephemeral: true });
        }

        if (getActive()) {
            return interaction.reply({ content: '❌ Zaten aktif bir etkinlik var! Önce `/etkinlik iptal` yapın veya İPTAL ET butonunu kullanın.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const kadroMax = interaction.options.getInteger('kadro');
        const yedekMax = interaction.options.getInteger('yedek');
        const baslangicDk = interaction.options.getInteger('baslangic');
        const sureSaat = interaction.options.getInteger('sure');
        const toplanmaDk = interaction.options.getInteger('toplanma') ?? (baslangicDk - 10);
        const kod = interaction.options.getString('kod') || Math.random().toString(36).slice(2, 8).toUpperCase();
        const kanal = interaction.options.getChannel('kanal') ?? interaction.channel;

        if (toplanmaDk >= baslangicDk) {
            return interaction.editReply('❌ Toplanma zamanı başlangıçtan önce olmalı!');
        }
        if (!kanal || kanal.type !== ChannelType.GuildText) {
            return interaction.editReply('❌ Geçerli bir metin kanalı seçin!');
        }

        const now = Date.now();
        const ev = {
            messageId: null,
            channelId: kanal.id,
            guildId: interaction.guildId,
            ownerId: interaction.user.id,
            kadroMax, yedekMax, sureSaat,
            kadro: [], yedek: [],
            startAt: now + baslangicDk * 60_000,
            toplasmaAt: now + toplanmaDk * 60_000,
            code: kod,
            roleId: config.etkinlikRoleId || null,
            status: 'beklemede',
        };

        const { embed, file } = buildEmbed(ev);
        const payload = {
            embeds: [embed],
            components: [buildButtons()],
            fetchReply: true,
        };
        if (file) payload.files = [new (require('discord.js').AttachmentBuilder)(file, { name: 'logo.png' })];

        const message = await kanal.send(payload);
        ev.messageId = message.id;
        setActive(ev);

        // Zamanlayıcılar
        const delayStart = ev.startAt - now;
        const delayEnd = delayStart + sureSaat * 3600_000;
        setTimeout(() => module.exports.startEvent(message.client), Math.max(1000, delayStart));
        setTimeout(() => module.exports.endEvent(message.client), delayEnd);

        await interaction.editReply(`✅ Etkinlik oluşturuldu: ${kanal} — Başlangıç <t:${Math.floor(ev.startAt / 1000)}:R>`);
    },

    /* ---------------- Buton handler ---------------- */
    async handleButton(interaction) {
        const ev = getActive();
        if (!ev || interaction.message.id !== ev.messageId) {
            return interaction.reply({ content: '❌ Bu etkinlik artık aktif değil!', ephemeral: true });
        }

        const userId = interaction.user.id;

        /* ---- KATIL ---- */
        if (interaction.customId === 'etk_katil') {
            if (ev.status !== 'beklemede') {
                return interaction.reply({ content: '❌ Etkinlik başladı, katılım kapandı!', ephemeral: true });
            }
            if (ev.kadro.includes(userId) || ev.yedek.includes(userId)) {
                return interaction.reply({ content: '⚠️ Zaten katıldın!', ephemeral: true });
            }
            if (ev.kadro.length < ev.kadroMax) {
                ev.kadro.push(userId);
                setActive(ev);
            } else if (ev.yedek.length < ev.yedekMax) {
                ev.yedek.push(userId);
                setActive(ev);
                await updateEmbed(interaction.client, ev);
                return interaction.reply({ content: '✅ Kadro dolu — **YEDEK** olarak kaydoldun!', ephemeral: true });
            } else {
                return interaction.reply({ content: '❌ Kadro ve yedek dolu!', ephemeral: true });
            }
            await updateEmbed(interaction.client, ev);
            return interaction.reply({ content: '✅ Etkinliğe katıldın!', ephemeral: true });
        }

        /* ---- AYRIL ---- */
        if (interaction.customId === 'etk_ayril') {
            const wasInKadro = ev.kadro.includes(userId);
            const wasInYedek = ev.yedek.includes(userId);
            if (!wasInKadro && !wasInYedek) {
                return interaction.reply({ content: '⚠️ Zaten etkinlikte değilsin!', ephemeral: true });
            }

            ev.kadro = ev.kadro.filter(id => id !== userId);
            ev.yedek = ev.yedek.filter(id => id !== userId);

            // Kadroda boşluk açıldıysa yedekten yükselt (etkinlik başlamadan önce)
            if (ev.status === 'beklemede' && ev.kadro.length < ev.kadroMax && ev.yedek.length > 0) {
                const promoted = ev.yedek.shift();
                ev.kadro.push(promoted);
            }

            // Perm verilmişse geri al
            if (ev.status !== 'beklemede' && ev.roleId) {
                const member = await interaction.guild.members.fetch(userId).catch(() => null);
                if (member) await member.roles.remove(ev.roleId, 'Etkinlikten ayrıldı').catch(() => { });
            }

            setActive(ev);
            await updateEmbed(interaction.client, ev);
            return interaction.reply({ content: '👋 Etkinlikten ayrıldın.', ephemeral: true });
        }

        /* ---- BİLGİ ---- */
        if (interaction.customId === 'etk_bilgi') {
            const started = ev.status !== 'beklemede';
            const embed = new EmbedBuilder()
                .setColor('#2b6cb0')
                .setTitle('ℹ️ ETKİNİK BİLGİLERİ')
                .setDescription(
                    `✅ **${interaction.member}** — \`KADRO (silme)\` ${started ? 'VERİLDİ' : 'BAŞLANGIÇTA VERİLECEK'}\n` +
                    `👥 **TOPLANMA:** <t:${Math.floor(ev.toplasmaAt / 1000)}:t>\n` +
                    `🎯 **BİRTS:** <t:${Math.floor(ev.startAt / 1000)}:F> (<t:${Math.floor(ev.startAt / 1000)}:R>)\n` +
                    `🔑 **ETKİNLİK KODU:** ${started ? `\`${ev.code}\`` : '`YOK`'}\n` +
                    `⏳ **SÜRE:** \`${ev.sureSaat} SAAT\`\n\n` +
                    `🚨 **BELİRTİLEN SAATTE OLMAYANLARIN YERİNE YEDEKLERDEN ALINACAKTIR.**`
                )
                .setFooter({ text: BRAND })
                .setTimestamp();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        /* ---- İPTAL ET ---- */
        if (interaction.customId === 'etk_iptal') {
            if (!isOwner(interaction, ev)) {
                return interaction.reply({ content: '❌ Etkinliği sadece oluşturan yetkili veya bot sahipleri iptal edebilir!', ephemeral: true });
            }

            // Perm verilmişse herkesten çek
            if (ev.roleId) {
                for (const id of [...ev.kadro, ...ev.yedek]) {
                    const member = await interaction.guild.members.fetch(id).catch(() => null);
                    if (member) await member.roles.remove(ev.roleId, 'Etkinlik iptal edildi').catch(() => { });
                }
            }

            ev.status = 'iptal';
            setActive(ev);
            await updateEmbed(interaction.client, ev, '🛑 **ETKİNİLİK İPTAL EDİLDİ.**');
            clearActive();
            return interaction.reply({ content: '🛑 Etkinlik iptal edildi, verilen perm/rol geri çekildi.', ephemeral: true });
        }
    },

    /* ---------------- Başlatma ---------------- */
    async startEvent(client) {
        const ev = getActive();
        if (!ev || ev.status !== 'beklemede') return;

        ev.status = 'basladi';
        setActive(ev);

        try {
            const guild = client.guilds.cache.get(ev.guildId);
            if (!guild) { clearActive(); return; }

            await guild.members.fetch().catch(() => { });
            const role = ev.roleId ? guild.roles.cache.get(ev.roleId) : null;

            // Sunucuda olmayanları listeden düşür
            ev.kadro = ev.kadro.filter(id => guild.members.cache.has(id));
            ev.yedek = ev.yedek.filter(id => guild.members.cache.has(id));
            setActive(ev);

            const dmEmbed = new EmbedBuilder()
                .setColor('#2b6cb0')
                .setTitle('✅ ETKİNİK BİLGİLERİ')
                .setDescription(
                    `🔥 **${guild.members.cache.get(Object.values(ev.kadro)[0] || '') ? '' : ''}${BRAND} Kadro (silme) VERİLDİ**\n` +
                    `👥 **TOPLANMA:** <t:${Math.floor(ev.toplasmaAt / 1000)}:t>\n` +
                    `🎯 **BİRTS:** <t:${Math.floor(ev.startAt / 1000)}:F>\n` +
                    `⏳ **SÜRE:** \`${ev.sureSaat} SAAT\`\n` +
                    `🔑 **ETKİNLİK KODU:** \`${ev.code}\`\n\n` +
                    `🚨 **BELİRTİLEN SAATTE OLMAYANLARIN YERİNE YEDEKLERDEN ALINACAKTIR.**`
                )
                .setFooter({ text: BRAND });

            // Role ver + DM at
            for (const id of [...ev.kadro, ...ev.yedek]) {
                const member = guild.members.cache.get(id);
                if (!member) continue;

                if (role && !member.roles.cache.has(role.id)) {
                    await member.roles.add(role, 'Etkinlik katılımı').catch(() => { });
                }
                await member.send({ embeds: [dmEmbed] }).catch(() => { });
            }

            await updateEmbed(client, ev);

            // Süre bitiş zamanlayıcısı (resume sonrası da buradan kurulur)
            const remaining = ev.startAt + ev.sureSaat * 3600_000 - Date.now();
            if (remaining > 0) {
                setTimeout(() => module.exports.endEvent(client), remaining);
            }
        } catch (e) {
            console.error('[ETKİNİLİK] Başlatma hatası:', e);
        }
    },

    /* ---------------- Bitirme ---------------- */
    async endEvent(client) {
        const ev = getActive();
        if (!ev || ev.status === 'beklemede' || ev.status === 'bitti' || ev.status === 'iptal') return;

        try {
            if (ev.roleId) {
                const guild = client.guilds.cache.get(ev.guildId);
                if (guild) {
                    for (const id of [...ev.kadro, ...ev.yedek]) {
                        const member = guild.members.cache.get(id);
                        if (member) await member.roles.remove(ev.roleId, 'Etkinlik süresi doldu').catch(() => { });
                    }
                }
            }

            ev.status = 'bitti';
            setActive(ev);
            await updateEmbed(client, ev, `🏁 **ETKİNİK TAMAMLANDI — Süre doldu, kadro permi geri çekildi.**`);
            clearActive();
        } catch (e) {
            console.error('[ETKİNİLİK] Bitirme hatası:', e);
        }
    },

    /* ---------------- Bot yeniden başlayınca devam ettir ---------------- */
    async resume(client) {
        try {
            const ev = getActive();
            if (!ev) return;

            const channel = await client.channels.fetch(ev.channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) { clearActive(); return; }
            const message = await channel.messages.fetch(ev.messageId).catch(() => null);
            if (!message) { clearActive(); return; }

            const now = Date.now();
            if (ev.status === 'beklemede') {
                if (ev.startAt > now) {
                    setTimeout(() => module.exports.startEvent(client), ev.startAt - now);
                    setTimeout(() => module.exports.endEvent(client), ev.startAt + ev.sureSaat * 3600_000 - now);
                    console.log(`[INFO] Etkinlik devam ettirildi (başlangıç <t:${Math.floor(ev.startAt / 1000)}:R>).`);
                } else {
                    // Başlangıç zamanı bot kapalıyken geçti -> hemen başlat
                    module.exports.startEvent(client);
                }
            } else if (ev.status === 'basladi') {
                const remaining = ev.startAt + ev.sureSaat * 3600_000 - now;
                if (remaining > 0) {
                    setTimeout(() => module.exports.endEvent(client), remaining);
                    console.log('[INFO] Etkinlik (başlamış) devam ettirildi.');
                } else {
                    module.exports.endEvent(client);
                }
            } else {
                clearActive();
            }
        } catch (e) {
            console.error('[ETKİNİLİK] Devam ettirme hatası:', e);
        }
    },
};

/* ---------------- Sunucudan ayrılan katılımcıyı düşür ---------------- */
module.exports.handleMemberLeave = async function (member) {
    try {
        const ev = getActive();
        if (!ev) return;

        const wasInKadro = ev.kadro.includes(member.id);
        const wasInYedek = ev.yedek.includes(member.id);
        if (!wasInKadro && !wasInYedek) return;

        // Listeden düşür
        ev.kadro = ev.kadro.filter(id => id !== member.id);
        ev.yedek = ev.yedek.filter(id => id !== member.id);

        // Başlamadan önce ayrıldıysa yedekten kadroya yükselt
        if (ev.status === 'beklemede' && ev.kadro.length < ev.kadroMax && ev.yedek.length > 0) {
            const promoted = ev.yedek.shift();
            ev.kadro.push(promoted);
        }
        setActive(ev);
        await updateEmbed(member.client, ev, `🚪 <@${member.id}> sunucudan ayrıldı — etkinlik listesinden çıkarıldı.`);
    } catch (e) {
        console.error('[ETKİNİLİK] Üye çıkış temizliği hatası:', e);
    }
};

/* ---------------- Embed güncelleme yardımcısı ---------------- */
async function updateEmbed(client, ev, extraLine = null) {
    try {
        const channel = await client.channels.fetch(ev.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return;
        const message = await channel.messages.fetch(ev.messageId).catch(() => null);
        if (!message) return;

        const { embed, file } = buildEmbed(ev);
        if (extraLine) {
            embed.setDescription(`${embed.data.description ?? ''}\n\n${extraLine}`);
        }

        const payload = { embeds: [embed], components: ev.status === 'beklemede' ? [buildButtons()] : [] };
        if (file) payload.attachments = [new (require('discord.js').AttachmentBuilder)(file, { name: 'logo.png' })];

        await message.edit(payload).catch(() => { });
    } catch (e) {
        console.error('[ETKİNİLİK] Embed güncelleme hatası:', e);
    }
}
