// utils/etiket.js
// Sunucu etiketi (tag) rolü: üyenin ismi etiketi içerirse rol verilir,
// etiketi çıkarınca rol geri alınır.
// Veri: data/etiket.json — /etiket komutuyla değişir, restart'ta korunur.

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../data/etiket.json');

/** @type {{ text: string|null, roleId: string|null, enabled: boolean }} */
let data = { text: null, roleId: null, enabled: false };

function load() {
    try {
        if (fs.existsSync(FILE)) {
            const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
            data = { text: null, roleId: null, enabled: false, ...parsed };
        }
    } catch (error) {
        console.error('[ETIKET] Dosya okunamadı:', error.message);
        data = { text: null, roleId: null, enabled: false };
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

/** Ayarları günceller (metin + rol birlikte verilirse otomatik aktif edilir) */
function set(patch) {
    data = { ...data, ...patch };
    if (patch.text && patch.roleId) data.enabled = true;
    save();
    return get();
}

/** Sistemi kapatır (rol kaydı silinmez, sadece pasifleşir) */
function disable() {
    data.enabled = false;
    save();
    return get();
}

/** Üyenin ismi etiketi içeriyor mu? (kullanıcı adı + global ad + takma ad) */
function memberHasTag(member) {
    if (!data.text || !member) return false;
    const needle = String(data.text).toLocaleLowerCase('tr-TR');
    const fields = [member.nickname, member.user?.username, member.user?.globalName];
    return fields.some(f => typeof f === 'string' && f.toLocaleLowerCase('tr-TR').includes(needle));
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
 * Üyenin ismi ile rol durumunu eşitler.
 * 'verildi' | 'alindi' | null (değişiklik yok / yapılamadı) döner.
 */
async function sync(member, reason = 'Sunucu etiketi kontrolü') {
    if (!data.enabled || !data.text || !data.roleId) return null;
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

/** Sunucudaki tüm üyeleri tarar (ayar değişince / bot başlarken) */
async function sweep(guild, reason = 'Sunucu etiketi taraması') {
    const result = { verilen: 0, alinan: 0 };
    if (!data.enabled || !data.text || !data.roleId) return result;
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
