// commands/etkinlik.js
// In-game etkinlik yoklama sistemi
// KATIL / AYRIL / BİLGİ / İPTAL butonları + otomatik rol (perm) + etkinlik kodu DM
// Etkinlik GECE 12'ye kadar sürer → o saatte mesaj silinir (kendini imha),
// seçilen roldeki TÜM kişilerden rol geri çekilir, veri temizlenir.
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
    d.setHours(24, 0, 0, 0); // bugünün ertesi gece 00:00 (yerel saat)
    return d.getTime();
}

/* ---------------- Embed ---------------- */
function buildEmbed(ev) {
    const started = ev.status !== 'beklemede';

    const desc =
        `<@&${ev.roleId}> etkinlik rolü verildi. Ayrılınca veya **gece 12'de** geri alınır.` +
        (started ? `\n\n✅ **ETKİNLİK BAŞLADI — Etkinlik kodu DM ile gönderildi.**` : '');

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
            { name: '• BAŞLANGIÇ:', value: `<t:${Math.floor(ev.startAt / 1000)}:F>\n<t:${Math.floor(ev.startAt / 1000)}:R>`, inline: true },
            { name: '• BİTİŞ:', value: `🌙 **GECE 12**\n<t:${Math.floor(ev.endAt / 1000)}:R>`, inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
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

async function sendEventMessage(kanal, ev) {
    const { embed, file } = buildEmbed(ev);
    const payload = { embeds: [embed], components: [buildButtons()], fetchReply: true };
    if (file) payload.files = [new AttachmentBuilder(file, { name: 'logo.png' })];
    return kanal.send(payload);
}

/* ---------------- Komut ---------------- */
module.exports = {
    data: new SlashCommandBuilder()
        .setName('etkinlik')
        .setDescription('In-game etkinlik yoklaması oluşturur (gece 12\'ye kadar sürer)')
        .addIntegerOption(o => o.setName('kadro').setDescription('Kadro kapasitesi (ana kadro)').setRequired(true).setMinValue(1).setMaxValue(50))
        .addIntegerOption(o => o.setName('yedek').setDescription('Yedek kapasitesi').setRequired(true).setMinValue(0).setMaxValue(20))
        .addIntegerOption(o => o.setName('baslangic').setDescription('Kaç dakika sonra başlasın? (boş: hemen başlar)').setMinValue(1).setMaxValue(720))
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
            endAt: nextMidnight(),   // ⏰ gece 12 — kendini imha + rol temizliği
            code: kod,
            roleId: config.etkinlikRoleId,
            status: baslangicDk === 0 ? 'basladi' : 'beklemede',
        };

        const message = await sendEventMessage(kanal, ev);
        ev.messageId = message.id;
        setActive(ev);

        // Zamanlayıcılar
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
            const started = ev.status !== 'beklemede';

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

            // Etkinlik başladıysa permi hemen ver + kodu DM ile gönder
            if (started) {
                const member = await interaction.guild.members.fetch(userId).catch(() => null);
                if (member && ev.roleId && !member.roles.cache.has(ev.roleId)) {
                    await member.roles.add(ev.roleId, 'Etkinlik katılımı').catch(() => { });
                }
                await sendCodeDM(member || { user: interaction.user }, ev).catch(() => { });
            }

            await updateEmbed(interaction.client, ev);
            return interaction.reply({ content: started ? '✅ Etkinliğe katıldın — rol verildi, kod DM kutunda!' : '✅ Etkinliğe katıldın! Rol başlangıçta verilecek.', ephemeral: true });
        }

        /* ---- AYRIL ---- */
        if (interaction.customId === 'etk_ayril') {
            const wasIn = ev.kadro.includes(userId) || ev.yedek.includes(userId);
            if (!wasIn) {
                return interaction.reply({ content: '⚠️ Zaten etkinlikte değilsin!', ephemeral: true });
            }

            ev.kadro = ev.kadro.filter(id => id !== userId);
            ev.yedek = ev.yedek.filter(id => id !== userId);

            // Boşluk açıldıysa yedekten yükselt
            if (ev.kadro.length < ev.kadroMax && ev.yedek.length > 0) {
                const promoted = ev.yedek.shift();
                ev.kadro.push(promoted);
                if (ev.status !== 'beklemede' && ev.roleId) {
                    const m = await interaction.guild.members.fetch(promoted).catch(() => null);
                    if (m && !m.roles.cache.has(ev.roleId)) {
                        await m.roles.add(ev.roleId, 'Yedekten kadroya yükseltildi').catch(() => { });
                        await sendCodeDM(m, ev).catch(() => { });
                    }
                }
            }

            // Perm verilmişse geri al
            if (ev.roleId) {
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
                .setTitle('ℹ️ ETKİNLİK BİLGİLERİ')
                .setDescription(
                    `✅ **${interaction.member}** — \`${ev.roleId ? 'ROL' : ''}\` ${started ? 'VERİLDİ' : 'BAŞLANGIÇTA VERİLECEK'}\n` +
                    `🎯 **BAŞLANGIÇ:** <t:${Math.floor(ev.startAt / 1000)}:F> (<t:${Math.floor(ev.startAt / 1000)}:R>)\n` +
                    `🌙 **BİTİŞ:** GECE 12 — <t:${Math.floor(ev.endAt / 1000)}:R>\n` +
                    `🔑 **ETKİNLİK KODU:** ${started ? `\`${ev.code}\`` : '`BAŞLANGIÇTA DM İLE GÖNDERİLİR`'}\n\n` +
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

            // Sunucuda olmayanları listeden düşür
            ev.kadro = ev.kadro.filter(id => guild.members.cache.has(id));
            ev.yedek = ev.yedek.filter(id => guild.members.cache.has(id));
            setActive(ev);

            // Rol ver + kod DM'i
            for (const id of [...ev.kadro, ...ev.yedek]) {
                const member = guild.members.cache.get(id);
                if (!member) continue;
                if (role && !member.roles.cache.has(role.id)) {
                    await member.roles.add(role, 'Etkinlik katılımı').catch(() => { });
                }
                await sendCodeDM(member, ev).catch(() => { });
            }

            await updateEmbed(client, ev);

            // Gece 12 zamanlayıcısı (resume sonrası da buradan kurulur)
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

    /**
     * Mesajı siler, seçilen roldeki TÜM kişilerden rolü geri çeker, veriyi temizler.
     */
    async destroyEvent(client, customNote) {
        const ev = getActive();
        if (!ev) return;

        try {
            const guild = client.guilds.cache.get(ev.guildId);

            // 1) Rolü OLAN herkesten rolü geri çek (sadece katılımcı listesi değil — roldaki herkes)
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

            // 2) Mesajı sil (kendini imha)
            if (guild) {
                const channel = await client.channels.fetch(ev.channelId).catch(() => null);
                if (channel && channel.isTextBased()) {
                    const message = await channel.messages.fetch(ev.messageId).catch(() => null);
                    if (message) await message.delete().catch(() => { });
                }
            }

            // 3) Veriyi temizle
            clearActive();
            console.log(`[ETKİNİLİK] Etkinlik kendini imha etti.${customNote ? ' (' + customNote + ')' : ''}`);
        } catch (e) {
            console.error('[ETKİNİLİK] Kendini imha hatası:', e);
            clearActive(); // hata olsa bile veriyi bırakma
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
                } else {
                    // Başlangıç zamanı bot kapalıyken geçti -> hemen başlat
                    module.exports.startEvent(client);
                    return;
                }
            }

            // Gece 12 zamanlayıcısı
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

/* ---------------- Kod DM'i ---------------- */
async function sendCodeDM(member, ev) {
    if (!member?.user) return;
    const embed = new EmbedBuilder()
        .setColor('#2b6cb0')
        .setTitle('✅ ETKİNLİK BİLGİLERİ')
        .setDescription(
            `🔥 **${BRAND}** Etkinlik rolü verildi!\n` +
            `🎯 **BAŞLANGIÇ:** <t:${Math.floor(ev.startAt / 1000)}:F>\n` +
            `🌙 **BİTİŞ:** GECE 12 — <t:${Math.floor(ev.endAt / 1000)}:R>\n` +
            `🔑 **ETKİNLİK KODU:** \`${ev.code}\`\n\n` +
            `🚨 **GECE 12'DE ROL GERİ ALINACAKTIR.**`
        )
        .setFooter({ text: BRAND });
    return member.user.send({ embeds: [embed] }).catch(() => { });
}

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

        // Boşluk açıldıysa yedekten kadroya yükselt
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

        const { embed, file } = buildEmbed(ev);
        if (extraLine) {
            embed.setDescription(`${embed.data.description ?? ''}\n\n${extraLine}`);
        }

        const payload = { embeds: [embed], components: [buildButtons()] };
        if (file) payload.attachments = [new AttachmentBuilder(file, { name: 'logo.png' })];

        await message.edit(payload).catch(() => { });
    } catch (e) {
        console.error('[ETKİNİLİK] Embed güncelleme hatası:', e);
    }
}
