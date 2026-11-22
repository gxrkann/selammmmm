// utils/otorol.js
// Sunucuya giren üyelere verilecek oto-rolü yönetir.
// Veri: data/otorol.json — /otorol komutuyla değişir, restart'ta korunur.

const fs = require('fs');
const path = require('path');

const OTO_FILE = path.join(__dirname, '../data/otorol.json');

/** @type {{ roleId: string|null, enabled: boolean }} */
let data = { roleId: null, enabled: false };

function load() {
    try {
        if (fs.existsSync(OTO_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(OTO_FILE, 'utf8'));
            data = { roleId: null, enabled: false, ...parsed };
        }
    } catch (error) {
        console.error('[OTOROL] Dosya okunamadı:', error.message);
        data = { roleId: null, enabled: false };
    }
}

function save() {
    try {
        fs.writeFileSync(OTO_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('[OTOROL] Dosya yazılamadı:', error.message);
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

/** Oto-rolü kapatır (rol kaydı silinmez, sadece pasifleşir) */
function disable() {
    data.enabled = false;
    save();
    return get();
}

/**
 * Giriş yapan üyeye oto-rolü verir.
 * Verildiyse veya zaten varsa role döner, değilse null.
 */
async function giveRole(member) {
    if (!data.enabled || !data.roleId || !member) return null;

    try {
        const guild = member.guild;
        const role = guild.roles.cache.get(data.roleId) || await guild.roles.fetch(data.roleId).catch(() => null);
        if (!role) return null; // rol silinmiş

        if (member.roles.cache.has(role.id)) return role; // zaten var
        await member.roles.add(role, 'Oto-rol (sunucuya giriş)');
        return role;
    } catch (error) {
        console.error('[OTOROL] Rol verilemedi:', error.message);
        return null;
    }
}

load();

module.exports = { get, set, disable, giveRole };
