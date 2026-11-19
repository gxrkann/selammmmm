// commands/etkinlik.js
// In-game etkinlik yoklama sistemi — RAGE Crew tarzı
// Butonlar: ✅ ᴋᴀᴛıʟ / ❌ ᴀʏʀɪʟ / ℹ️ ʙɪʟɢɪ / ⛔ ɪ̇ᴘᴛᴀʟ ᴇᴛ
// Liste alfabetik sıralı, DM gitmez, gece 12'de kendini imha eder.
const {
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, ChannelType, AttachmentBuilder
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
function clearActive() { const d = load(); delete d.active; save(d); }

function isOwner(interaction, ev) {
    if (ev && interaction.user.id === ev.ownerId) return true;
    if (config.ownerId.includes(interaction.user.id)) return true;
    if (config.ownerRoleId && interaction.member?.roles?.cache?.has(config.ownerRoleId)) return true;
    return false;
}

/* ---------------- Gece 12 (ertesi 00:00) hesabı ---------------- */
function nextMidnight() {
    const d = new Date();
    d.setHours(24, 0, 0, 0);
    return d.getTime();
}

/* ---------------- Alfabetik sıralama ---------------- */
function sortByIdsAlphabetically(ids, guild) {
    return [...ids].sort((a, b) => {
        const ma = guild?.members?.cache?.get(a);
        const mb = guild?.members?.cache?.get(b);
        const na = (ma?.displayName || ma?.user?.username || a).toLowerCase();
        const nb = (mb?.displayName || mb?.user?.username || b).toLowerCase();
        return na.localeCompare(nb, 'tr');
    });
}

/* ---------------- Embed — referans tasarıma birebir ---------------- */
function buildPayload(ev, guild) {
    const roleMention = ev.roleId ? `<@&${ev.roleId}>` : `@${BRAND}`;

    const sortedKadro = sortByIdsAlphabetically(ev.kadro, guild);
    const sortedYedek = sortByIdsAlphabetically(ev.yedek, guild);

    const kadroList = sortedKadro.length
        ? sortedKadro.map((id, i) => `${i + 1}. <@${id}>`).join('\n')
        : '_Henüz katılım yok_';
    const yedekList = sortedYedek.map((id, i) => `${i + 1}. <@${id}>`).join('\n');

    const sureSaat = Math.max(1, Math.round((ev.endAt - ev.startAt) / 3_600_000));
    const endSec = Math.floor(ev.endAt / 1000);

    // 1. embed — başlık + açıklama + 5 satır bilgi + footer + logo
    const desc1 = [
        `${roleMention} Kadro (silme)`,
        '',
        `1 • 🔴 **KADRO:** ${ev.kadro.length}/${ev.kadroMax}`,
        `2 • 🔵 **YEDEK:** ${ev.yedek.length}/${ev.yedekMax}`,
        `3 • 🌙 **BİTİŞ:** <t:${endSec}:F> · <t:${endSec}:R>`,
        `4 • ☀️ **SÜRE:** ${sureSaat} SAAT`,
        `5 • 🔊 **TOPLANMA:** <t:${Math.floor(ev.toplasmaAt / 1000)}:t>`,
    ].join('\n');

    const embed1 = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`🔊 @${BRAND}-YOKLAMA`)
        .setDescription(desc1)
        .setImage('attachment://logo.png')
        .setThumbnail('attachment://logo.png')
        .setFooter({ text: `Katılınca @${BRAND} Kadro (silme) VERİLİR. AYRILINCA VE SÜRE BİTİNCE ALINIR.` });

    // 2. embed — KADRO/YEDEK listesi
    let listDesc = `**KADRO**\n${kadroList}`;
    if (sortedYedek.length) listDesc += `\n\n**YEDEK**\n${yedekList}`;

    const embed2 = new EmbedBuilder()
        .setColor('#5865F2')
        .setDescription(listDesc.slice(0, 4096));

    const logoPath = path.join(__dirname, '../Sanzy_logosu_ve_ylan_detaylar.png');
    return { embeds: [embed1, embed2], file: fs.existsSync(logoPath) ? logoPath : null };
}

function buildButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('etk_katil').setLabel('ᴋᴀᴛıʟ').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId('etk_ayril').setLabel('ᴀʏʀɪʟ').setStyle(ButtonStyle.Danger).setEmoji('❌'),
        new ButtonBuilder().setCustomId('etk_bilgi').setLabel('ʙɪʟɢɪ').setStyle(ButtonStyle.Primary).setEmoji('ℹ️'),
        new ButtonBuilder().setCustomId('etk_iptal').setLabel('ɪ̇ᴘᴛᴀʟ ᴇᴛ').setStyle(ButtonStyle.Secondary).setEmoji('⛔'),
    );
}

async function sendEventMessage(kanal, ev) {
    // Üyeleri cache'e yükle — alfabetik sıralama için gerekli
    await kanal.guild.members.fetch().catch(() => {});

    const { embeds, file } = buildPayload(ev, kanal.guild);
    const payload = { embeds, components: [buildButtons()], fetchReply: true };
    if (file) payload.files = [new AttachmentBuilder(file, { name: 'logo.png' })];
    return kanal.send(payload);
}

/* ---------------- Komut ---------------- */
module.exports = {
    data: new SlashCommandBuilder()
        .setName('ingame')
        .setDescription('In-game yoklama oluşturur (gece 12\'ye kadar sürer, sonra kendini imha eder)')
        .addIntegerOption(o => o.setName('kadro').setDescription('Kadro kapasitesi (ana kadro)').setRequired(true).setMinValue(1).setMaxValue(50))
        .addIntegerOption(o => o.setName('yedek').setDescription('Yedek kapasitesi').setRequired(true).setMinValue(0).setMaxValue(20))
        .addIntegerOption(o => o.setName('baslangic').setDescription('Kaç dakika sonra başlasın? (boş: hemen başlar)').setMinValue(1).setMaxValue(720))
        .addStringOption(o => o.setName('kod').setDescription('Etkinlik kodu (boş bırakılırsa rastgele üretilir)').setMaxLength(20))
        .addChannelOption(o => o.setName('kanal').setDescription('Mesajın gönderileceği kanal (boş: bu kanal)')),

    async execute(interaction) {
        const isOwnerUser = config.ownerId.includes(interaction.user.id);
        const isOwnerRole = config.ownerRoleId && interaction.member?.roles?.cache?.has(config.ownerRoleId);
        if (!isOwnerUser && !isOwnerRole) {
            return interaction.reply({ content: '❌ Bu komutu sadece yetkililer kullanabilir!', ephemeral: true });
        }

        if (getActive()) {
            return interaction.reply({ content: '❌ Zaten aktif bir etkinlik var! Önce İPTAL ET butonunu kullanın.', ephemeral: true });
        }

        if (!config.etkinlikRoleId || config.etkinlikRoleId.startsWith('BURAYA_')) {
            return interaction.reply({ content: '❌ `config.json` içinde `etkinlikRoleId` ayarlı değil! Önce perm verilecek rolün ID\'sini girin.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const kadroMax = interaction.options.getInteger('kadro');
        const yedekMax = interaction.options.getInteger('yedek');
        const baslangicDk = interaction.options.getInteger('baslangic') ?? 0;
        const kod = interaction.options.getString('kod') || Math.random().toString(36).slice(2, 8).toUpperCase();
        const kanal = interaction.options.getChannel('kanal') ?? interaction.channel;

        if (!kanal || kanal.type !== ChannelType.GuildText) {
            return interaction.editReply('❌ Geçerli bir metin kanalı seçin!');
        }

        const now = Date.now();
        const ev = {
            messageId: null,
            channelId: kanal.id,
            guildId: interaction.guildId,
            ownerId: interaction.user.id,
            kadroMax, yedekMax,
            kadro: [], yedek: [],
            startAt: now + baslangicDk * 60_000,
            endAt: nextMidnight(),
            code: kod,
            roleId: config.etkinlikRoleId,
            status: baslangicDk === 0 ? 'basladi' : 'beklemede',
            toplasmaAt: now + (baslangicDk >= 10 ? (baslangicDk - 10) * 60_000 : now)
        };

        const message = await sendEventMessage(kanal, ev);
        ev.messageId = message.id;
        setActive(ev);

        if (ev.status === 'beklemede') {
            setTimeout(() => module.exports.startEvent(interaction.client), Math.max(1000, ev.startAt - now));
        }
        setTimeout(() => module.exports.endEvent(interaction.client), Math.max(1000, ev.endAt - now));

        await interaction.editReply(`✅ Etkinlik oluşturuldu: ${kanal} — **Gece 12'de** kendini imha edecek ve rolü geri çekecek.`);
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
            if (ev.kadro.includes(userId) || ev.yedek.includes(userId)) {
                return interaction.reply({ content: '⚠️ Zaten katıldın!', ephemeral: true });
            }
            // Önce hemen cevap ver (3 sn limiti), embed güncellemesi sonra çalışsın
            await interaction.deferReply({ ephemeral: true });
            const started = ev.status !== 'beklemede';

            if (ev.kadro.length < ev.kadroMax) {
                ev.kadro.push(userId);
                setActive(ev);
            } else if (ev.yedek.length < ev.yedekMax) {
                ev.yedek.push(userId);
                setActive(ev);
                await updateEmbed(interaction.client, ev);
                return interaction.editReply('✅ Kadro dolu — **YEDEK** olarak kaydoldun!');
            } else {
                return interaction.editReply('❌ Kadro ve yedek dolu!');
            }

            if (started) {
                const member = await interaction.guild.members.fetch(userId).catch(() => null);
                if (member && ev.roleId && !member.roles.cache.has(ev.roleId)) {
                    await member.roles.add(ev.roleId, 'Etkinlik katılımı').catch(() => { });
                }
            }

            await updateEmbed(interaction.client, ev);
            return interaction.editReply(started ? '✅ Etkinliğe katıldın — rol verildi.' : '✅ Etkinliğe katıldın! Rol başlangıçta verilecek.');
        }

        /* ---- AYRIL ---- */
        if (interaction.customId === 'etk_ayril') {
            const wasIn = ev.kadro.includes(userId) || ev.yedek.includes(userId);
            if (!wasIn) {
                return interaction.reply({ content: '⚠️ Zaten etkinlikte değilsin!', ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });

            ev.kadro = ev.kadro.filter(id => id !== userId);
            ev.yedek = ev.yedek.filter(id => id !== userId);

            if (ev.kadro.length < ev.kadroMax && ev.yedek.length > 0) {
                const promoted = ev.yedek.shift();
                ev.kadro.push(promoted);
                if (ev.status !== 'beklemede' && ev.roleId) {
                    const m = await interaction.guild.members.fetch(promoted).catch(() => null);
                    if (m && !m.roles.cache.has(ev.roleId)) {
                        await m.roles.add(ev.roleId, 'Yedekten kadroya yükseltildi').catch(() => { });
                    }
                }
            }

            if (ev.roleId) {
                const member = await interaction.guild.members.fetch(userId).catch(() => null);
                if (member) await member.roles.remove(ev.roleId, 'Etkinlikten ayrıldı').catch(() => { });
            }

            setActive(ev);
            await updateEmbed(interaction.client, ev);
            return interaction.editReply('👋 Etkinlikten ayrıldın.');
        }

        /* ---- BİLGİ ---- */
        if (interaction.customId === 'etk_bilgi') {
            const started = ev.status !== 'beklemede';
            const embed = new EmbedBuilder()
                .setColor('#2b6cb0')
                .setTitle('ℹ️ ETKİNLİK BİLGİLERİ')
                .setDescription(
                    `✅ **${interaction.member}** — \`${ev.roleId ? 'ROL' : ''}\` ${started ? 'VERİLDİ' : 'BAŞLANGIÇTA VERİLECEK'}\n` +
                    `🎯 **BAŞLANGIÇ:** <t:${Math.floor(ev.startAt / 1000)}:F> (<t:${Math.floor(ev.startAt / 1000)}:R>)\n` +
                    `🌙 **BİTİŞ:** GECE 12 — <t:${Math.floor(ev.endAt / 1000)}:R>\n` +
                    `🔑 **ETKİNLİK KODU:** ${started ? `\`${ev.code}\`` : '`YOK`'}\n\n` +
                    `🚨 **GECE 12'DE ETKİNLİK MESAJI SİLİNECEK VE ROLÜ OLAN HERKESDEN ROL GERİ ÇEKİLECEK.**`
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
            await interaction.deferReply({ ephemeral: true });
            await module.exports.destroyEvent(interaction.client, '🛑 Etkinlik yetkili tarafından iptal edildi.');
            return interaction.editReply('🛑 Etkinlik iptal edildi — mesaj silindi, tüm perm\'ler geri çekildi.');
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

            ev.kadro = ev.kadro.filter(id => guild.members.cache.has(id));
            ev.yedek = ev.yedek.filter(id => guild.members.cache.has(id));
            setActive(ev);

            for (const id of [...ev.kadro, ...ev.yedek]) {
                const member = guild.members.cache.get(id);
                if (!member) continue;
                if (role && !member.roles.cache.has(role.id)) {
                    await member.roles.add(role, 'Etkinlik katılımı').catch(() => { });
                }
            }

            await updateEmbed(client, ev);

            const remaining = ev.endAt - Date.now();
            if (remaining > 0) {
                setTimeout(() => module.exports.endEvent(client), remaining);
            } else {
                setTimeout(() => module.exports.endEvent(client), 1000);
            }
        } catch (e) {
            console.error('[ETKİNİLİK] Başlatma hatası:', e);
        }
    },

    /* ---------------- Kendini imha (gece 12) ---------------- */
    async endEvent(client) {
        const ev = getActive();
        if (!ev || ev.status === 'bitti' || ev.status === 'iptal') return;
        await module.exports.destroyEvent(client, null);
    },

    async destroyEvent(client, customNote) {
        const ev = getActive();
        if (!ev) return;

        try {
            const guild = client.guilds.cache.get(ev.guildId);

            if (ev.roleId && guild) {
                await guild.members.fetch().catch(() => { });
                const role = guild.roles.cache.get(ev.roleId);
                if (role) {
                    const holders = guild.members.cache.filter(m => m.roles.cache.has(ev.roleId));
                    for (const [, member] of holders) {
                        await member.roles.remove(ev.roleId, 'Etkinlik sona erdi (gece 12 — kendini imha)').catch(() => { });
                    }
                    console.log(`[ETKİNİLİK] ${holders.size} kişiden rol geri çekildi.`);
                }
            }

            if (guild) {
                const channel = await client.channels.fetch(ev.channelId).catch(() => null);
                if (channel && channel.isTextBased()) {
                    const message = await channel.messages.fetch(ev.messageId).catch(() => null);
                    if (message) await message.delete().catch(() => { });
                }
            }

            clearActive();
            console.log(`[ETKİNİLİK] Etkinlik kendini imha etti.${customNote ? ' (' + customNote + ')' : ''}`);
        } catch (e) {
            console.error('[ETKİNİLİK] Kendini imha hatası:', e);
            clearActive();
        }
    },

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
                } else {
                    module.exports.startEvent(client);
                    return;
                }
            }

            if (ev.endAt > now) {
                setTimeout(() => module.exports.endEvent(client), ev.endAt - now);
                console.log(`[INFO] Etkinlik devam ettirildi (bitiş: gece 12, ${Math.round((ev.endAt - now) / 60000)} dk sonra).`);
            } else {
                module.exports.endEvent(client);
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

        ev.kadro = ev.kadro.filter(id => id !== member.id);
        ev.yedek = ev.yedek.filter(id => id !== member.id);

        if (ev.kadro.length < ev.kadroMax && ev.yedek.length > 0) {
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

        const guild = message.guild;
        // Üyeleri cache'e yükle — alfabetik sıralama için gerekli
        await guild.members.fetch().catch(() => { });

        const { embeds, file } = buildPayload(ev, guild);
        if (extraLine) {
            // Not, liste embed'inin (2.) altına eklenir
            const last = embeds[embeds.length - 1];
            last.setDescription(`${last.data.description ?? ''}\n\n${extraLine}`.slice(0, 4096));
        }

        // ÖNEMLİ: `attachments` DEĞİL `files` kullanılmalı!
        // AttachmentBuilder attachments alanına verilirse API 400 döner ve edit sessizce düşer.
        const payload = { embeds, components: [buildButtons()] };
        if (file) payload.files = [new AttachmentBuilder(file, { name: 'logo.png' })];

        await message.edit(payload);
    } catch (e) {
        console.error('[ETKİNİLİK] Embed güncelleme hatası:', e.message);
    }
}
