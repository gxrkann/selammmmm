// utils/voice.js — Ses kanalı AFK bekleme + otomatik yeniden bağlanma
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');

const VOICE_DATA_FILE = path.join(__dirname, '../data/voice.json');
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 30;
const RECONNECT_DELAY = 5000; // 5 saniye

function loadVoiceData() {
    try {
        if (fs.existsSync(VOICE_DATA_FILE)) return JSON.parse(fs.readFileSync(VOICE_DATA_FILE, 'utf8'));
    } catch (e) { }
    return { active: false };
}

function saveVoiceData(data) {
    try {
        fs.writeFileSync(VOICE_DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) { console.error('[SES] Veri yazılamadı:', e.message); }
}

function setVoiceActive(channelId, guildId) {
    saveVoiceData({ active: true, channelId, guildId, startedAt: new Date().toISOString() });
    reconnectAttempts = 0;
}

function setVoiceInactive() {
    saveVoiceData({ active: false });
    reconnectAttempts = 0;
}

async function connectVoice(guild, channelId) {
    const connection = joinVoiceChannel({
        channelId,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    console.log(`[SES] Bağlanıldı: ${channelId}`);
    reconnectAttempts = 0;
    return connection;
}

async function reconnectVoice(guild) {
    const data = loadVoiceData();
    if (!data.active || !data.channelId || !guild) return;

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('[SES] Maksimum yeniden bağlanma denemesi aşıldı. Durduruluyor.');
        setVoiceInactive();
        return;
    }

    reconnectAttempts++;
    const delay = Math.min(RECONNECT_DELAY * reconnectAttempts, 60000);

    console.log(`[SES] Yeniden bağlanma denemesi ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} (${Math.round(delay / 1000)}s sonra)...`);

    setTimeout(async () => {
        try {
            const data2 = loadVoiceData();
            if (!data2.active || !data2.channelId) return;
            await connectVoice(guild, data2.channelId);
        } catch (e) {
            console.error('[SES] Yeniden bağlanma hatası:', e.message);
            reconnectVoice(guild);
        }
    }, delay);
}

let attachedGuilds = new Set();
const attachedConnections = new WeakSet();

// Bağlantı koparsa / düşerse otomatik yeniden bağlanma dinleyicisi ekle
function attachReconnect(client, guild) {
    if (!guild) return;

    if (!attachedGuilds.has(guild.id)) {
        attachedGuilds.add(guild.id);

        // Periyodik kontrol — beklenmedik kopmalar için (30 sn'de bir)
        setInterval(() => checkConnection(guild), 30_000);
    }

    // Yeni bağlantı nesnesine anlık dinleyiciler
    const connection = getVoiceConnection(guild.id);
    if (connection && !attachedConnections.has(connection)) {
        attachedConnections.add(connection);

        connection.on('stateChange', (oldState, newState) => {
            const data = loadVoiceData();
            if (!data.active) return;
            console.log(`[SES] Durum: ${oldState.status} -> ${newState.status}`);
            if (newState.status === VoiceConnectionStatus.Destroyed) {
                setTimeout(() => checkConnection(guild), RECONNECT_DELAY);
            }
        });
        connection.on('error', (err) => {
            console.error('[SES] Bağlantı hatası:', err.message);
            setTimeout(() => checkConnection(guild), RECONNECT_DELAY);
        });
    }
}

async function checkConnection(guild) {
    const data = loadVoiceData();
    if (!data.active || !data.channelId || !guild) return;

    const conn = getVoiceConnection(guild.id);
    const durum = conn ? conn.state.status : 'yok';

    // Hazır/çalışıyor/seçiliyken dokunma; disconnected'da @discordjs/voice kendisi yeniden dener
    if (durum === 'ready' || durum === 'connecting' || durum === 'disconnected') return;

    // destroyed / yok => tam yeniden bağlanma
    console.log(`[SES] Bağlantı koptu (durum: ${durum}) — yeniden bağlanılıyor...`);
    try {
        await connectVoice(guild, data.channelId);
        attachReconnect(null, guild);
    } catch (e) {
        console.error('[SES] Yeniden bağlanma başarısız:', e.message);
        setTimeout(() => checkConnection(guild), RECONNECT_DELAY);
    }
}

// ready.js'de yeniden bağlanma (bot start olduğunda aktifse)
function resumeVoice(guild) {
    const data = loadVoiceData();
    if (!data.active || !data.channelId || !guild) return;
    connectVoice(guild, data.channelId)
        .then(() => attachReconnect(null, guild))
        .catch(e => {
            console.error('[SES] Devam ettirme hatası:', e.message);
            setTimeout(() => reconnectVoice(guild), RECONNECT_DELAY);
        });
}

module.exports = { loadVoiceData, saveVoiceData, setVoiceActive, setVoiceInactive, connectVoice, reconnectVoice, attachReconnect, resumeVoice };
