// utils/etiket.js
// Discord "Sunucu Etiketi" rolü: üyesi sunucunun etiketini profilinde taşıyan
// üyeye rol verilir, etiketi kaldırınca rol geri alınır.
// Kontrol: user.primaryGuild — identityGuildId (bu sunucu) + identityEnabled (etiket açık mı)
// Veri: data/etiket.json — /etiket komutuyla değişir, restart'ta korunur.

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../data/etiket.json');

/** @type {{ roleId: string|null, enabled: boolean }} */
let data = { roleId: null, enabled: false };

function load() {
    try {
        if (fs.existsSync(FILE)) {
            const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
            // Eski "text" alanı artık kullanılmıyor (Discord sunucu etiketi sistemi)
            data = { roleId: parsed.roleId ?? null, enabled: parsed.enabled ?? false };
        }
    } catch (error) {
        console.error('[ETIKET] Dosya okunamadı:', error.message);
        data = { roleId: null, enabled: false };
    }
}

function save() {
    try {
        fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('[ETIKET] Dosya yazılamadı:', error.message);
    }
}

/** Mevcut ayarları döner */
function get() {
    return { ...data };
}

/** Ayarları günceller (roleId verilirse otomatik aktif edilir) */
function set(patch) {
    data = { ...data, ...patch };
    if (patch.roleId) data.enabled = true;
    save();
    return get();
}

/** Sistemi kapatır (rol kaydı silinmez, sadece pasifleşir) */
function disable() {
    data.enabled = false;
    save();
    return get();
}

/**
 * Üye bu sunucunun etiketini taşıyor mu?
 * - identityGuildId: etiketin geldiği sunucu (bizim sunucumuz olmalı)
 * - identityEnabled: etiket şu anda görünür mü (üye elle kaldırdıysa false)
 */
function memberHasTag(member) {
    const pg = member?.user?.primaryGuild;
    if (!pg) return false;
    return pg.identityGuildId === member.guild.id && pg.identityEnabled === true;
}

async function resolveRole(guild) {
    if (!data.roleId) return null;
    return guild.roles.cache.get(data.roleId) || await guild.roles.fetch(data.roleId).catch(() => null);
}

function roleUsable(guild, role) {
    if (!role) return false;
    if (role.id === guild.id) return false;      // @everyone
    if (role.managed) return false;              // entegrasyon/yükseltme rolü
    const me = guild.members.me;
    if (me && role.position >= me.roles.highest.position) return false; // botun rolünden yüksek
    return true;
}

/**
 * Üyenin etiket durumu ile rolünü eşitler.
 * 'verildi' | 'alindi' | null (değişiklik yok / yapılamadı) döner.
 */
async function sync(member, reason = 'Sunucu etiketi kontrolü') {
    if (!data.enabled || !data.roleId) return null;
    if (!member || member.user?.bot) return null;

    try {
        const guild = member.guild;
        const role = await resolveRole(guild);
        if (!roleUsable(guild, role)) return null;

        const shouldBe = memberHasTag(member);
        const has = member.roles.cache.has(role.id);

        if (shouldBe && !has) {
            await member.roles.add(role, reason);
            return 'verildi';
        }
        if (!shouldBe && has) {
            await member.roles.remove(role, reason);
            return 'alindi';
        }
        return null;
    } catch (error) {
        console.error('[ETIKET] Rol güncellenemedi:', error.message);
        return null;
    }
}

/** Sunucudaki tüm üyeleri tarar (ayar değişince / bot başlarken / periyodik) */
async function sweep(guild, reason = 'Sunucu etiketi taraması') {
    const result = { verilen: 0, alinan: 0 };
    if (!data.enabled || !data.roleId) return result;
    if (!guild.members.me) await guild.members.fetchMe().catch(() => null);

    try {
        const members = await guild.members.fetch();
        for (const [, member] of members) {
            const sonuc = await sync(member, reason);
            if (sonuc === 'verildi') result.verilen++;
            else if (sonuc === 'alindi') result.alinan++;
        }
    } catch (error) {
        console.error('[ETIKET] Tarama hatası:', error.message);
    }
    return result;
}

load();

module.exports = { get, set, disable, memberHasTag, sync, sweep };
