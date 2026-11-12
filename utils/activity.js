// utils/activity.js
// Ses (dakika) ve mesaj aktivitesini gün bazında takip eder.
// Veri: data/activity.json

const fs = require('fs');
const path = require('path');

const ACTIVITY_FILE = path.join(__dirname, '../data/activity.json');
const KEEP_DAYS = 14; // son 14 günün verisi tutulur

/** @type {{ days: Record<string, Record<string, { voiceMinutes: number, messages: number }>>, voiceSessions: Record<string, { channelId: string, joinedAt: number }> }} */
let data = { days: {}, voiceSessions: {} };

let saveTimer = null;

function todayKey() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function load() {
    try {
        if (fs.existsSync(ACTIVITY_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(ACTIVITY_FILE, 'utf8'));
            data.days = parsed.days || {};
            data.voiceSessions = parsed.voiceSessions || {};
        }
    } catch (error) {
        console.error('[AKTİVİTE] Veri yüklenemedi:', error.message);
        data = { days: {}, voiceSessions: {} };
    }
    prune();
}

function prune() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    for (const key of Object.keys(data.days)) {
        if (key < cutoffKey) delete data.days[key];
    }
}

function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        saveNow();
    }, 30_000);
}

function saveNow() {
    try {
        fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('[AKTİVİTE] Veri kaydedilemedi:', error.message);
    }
}

function ensureDay(key) {
    if (!data.days[key]) data.days[key] = {};
    return data.days[key];
}

/* ---------------- Public API ---------------- */

/** Kullanıcının bugünkü mesaj sayısını arttırır */
function addMessage(userId) {
    const day = ensureDay(todayKey());
    if (!day[userId]) day[userId] = { voiceMinutes: 0, messages: 0 };
    day[userId].messages += 1;
    scheduleSave();
}

/** Kullanıcı ses kanalına girdi */
function startVoice(userId, channelId) {
    if (data.voiceSessions[userId]) endVoice(userId); // önceki oturumu kapat
    data.voiceSessions[userId] = { channelId, joinedAt: Date.now() };
}

/** Kullanıcı ses kanalından çıktı (veya bot yeniden başladı) */
function endVoice(userId) {
    const session = data.voiceSessions[userId];
    if (!session) return;
    delete data.voiceSessions[userId];

    const minutes = Math.max(1, Math.floor((Date.now() - session.joinedAt) / 60_000));
    const day = ensureDay(todayKey());
    if (!day[userId]) day[userId] = { voiceMinutes: 0, messages: 0 };
    day[userId].voiceMinutes += minutes;
    scheduleSave();
}

/** Bugünkü (veya belirtilen günün) istatistiklerini döner */
function getDay(key = todayKey()) {
    return data.days[key] || {};
}

/** Son N günün istatistiklerini kullanıcı bazında toplar */
function getRange(days = 7) {
    const result = {}; // userId -> { voiceMinutes, messages }
    for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const day = data.days[key];
        if (!day) continue;
        for (const [userId, stat] of Object.entries(day)) {
            if (!result[userId]) result[userId] = { voiceMinutes: 0, messages: 0 };
            result[userId].voiceMinutes += stat.voiceMinutes || 0;
            result[userId].messages += stat.messages || 0;
        }
    }
    return result;
}

/** Kullanıcı şu an ses kanalında mı */
function isOnlineVoice(userId) {
    return Boolean(data.voiceSessions[userId]);
}

load();

// Kapanırken kaydet
process.on('exit', saveNow);
process.on('SIGINT', () => { saveNow(); process.exit(0); });

module.exports = {
    addMessage,
    startVoice,
    endVoice,
    getDay,
    getRange,
    isOnlineVoice,
    saveNow,
};
