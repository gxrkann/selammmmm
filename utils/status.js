// utils/status.js
// Bot durumunu (presence) yönetir: yazı + tip (oynuyor/dinliyor/...) + resim + online durumu.
// Veri: data/status.json — restart'ta korunur, /durum komutuyla değişir.
//
// ÖNEMLİ: discord.js'in setActivity() fonksiyonu activities[] içine sadece
// name/type/state/url kopyalar (ClientPresence._parse) — resim (assets) ELENİR.
// Bu yüzden resim dahil presence, ham gateway paketiyle (opcode 3) gönderilir.

const fs = require('fs');
const path = require('path');
const { ActivityType, GatewayOpcodes } = require('discord.js');
const config = require('./env');

const STATUS_FILE = path.join(__dirname, '../data/status.json');

// Varsayılan: eskisi gibi "Gxrkan | Ekip Sistemi" + Oynuyor + dnd
const DEFAULTS = {
    text: null,      // null → config.footer.text + " | Ekip Sistemi"
    type: ActivityType.Playing,
    imageUrl: null,  // resim URL'si (null → resimsiz)
    status: 'dnd',   // online | idle | dnd | invisible
};

/** @type {{ text: string|null, type: number, imageUrl: string|null, status: string }} */
let data = { ...DEFAULTS };

function load() {
    try {
        if (fs.existsSync(STATUS_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
            data = { ...DEFAULTS, ...parsed };
        }
    } catch (error) {
        console.error('[DURUM] Dosya okunamadı:', error.message);
        data = { ...DEFAULTS };
    }
}

function save() {
    try {
        fs.writeFileSync(STATUS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('[DURUM] Dosya yazılamadı:', error.message);
    }
}

/** Mevcut ayarları döner */
function get() {
    return { ...data };
}

/** Ayarları günceller ve kaydeder */
function set(patch) {
    data = { ...data, ...patch };
    save();
    return get();
}

/** Varsayılana sıfırlar */
function reset() {
    data = { ...DEFAULTS };
    save();
    return get();
}

/** Aktivite nesnesini kurar (resim dahil) */
function buildActivity() {
    const text = data.text ?? `${config.footer.text} | Ekip Sistemi`;
    const type = Number.isInteger(data.type) ? data.type : ActivityType.Playing;

    // Özel durum: name 'Custom Status' olmak ZORUNDA, metin state'te
    if (type === ActivityType.Custom) {
        return { name: 'Custom Status', state: text, type };
    }

    const activity = { name: text, type };
    if (data.imageUrl) {
        activity.assets = { large_image: data.imageUrl, large_text: text };
    }
    return activity;
}

/**
 * Durumu uygular (bağlantı hazırken çağrılmalı).
 * 1) Yerel cache + temel paket (discord.js ile)
 * 2) Resim dahil ham paket (discord.js assets'i eldiği için gerekli)
 */
function apply(client) {
    if (!client?.user) return;

    const status = data.status || 'dnd';
    const activity = buildActivity();

    // 1) Cache + temel alanlar
    try {
        client.user.setPresence({
            status,
            activities: [{ name: activity.name, type: activity.type, state: activity.state }],
        });
    } catch (error) {
        console.error('[DURUM] Temel presence gönderilemedi:', error.message);
    }

    // 2) Resim (assets) dahil ham paket — üstünü yazar
    try {
        client.ws.broadcast({
            op: GatewayOpcodes.PresenceUpdate,
            d: { since: null, activities: [activity], status, afk: false },
        });
    } catch (error) {
        console.error('[DURUM] Resimli presence gönderilemedi:', error.message);
    }
}

load();

module.exports = { get, set, reset, apply, buildActivity };
