// Sistem doğrulama testi (login yapmaz, sadece yükler)
const path = require('path');
const fs = require('fs');

let errors = 0;
const ok = (m) => console.log('✅', m);
const fail = (m) => { console.error('❌', m); errors++; };

/* 1) Config */
try {
    const config = require('./utils/env');
    if (config.token && !config.token.startsWith('BURAYA_')) ok(`token yüklü (${config.token.slice(0, 12)}...)`);
    else fail('token eksik!');
    if (/^\d+$/.test(config.clientId)) ok(`clientId: ${config.clientId}`);
    else fail('clientId geçersiz!');
    if (/^\d+$/.test(config.guildId)) ok(`guildId: ${config.guildId}`);
    else fail('guildId geçersiz!');
    if (Array.isArray(config.ownerId) && config.ownerId.length && !config.ownerId[0].startsWith('BURAYA_')) ok(`ownerId: ${config.ownerId.length} kişi`);
    else fail('ownerId listesi eksik!');
    ok(`footer: ${config.footer.text}`);
} catch (e) { fail('config yüklenemedi: ' + e.message); }

/* 2) Komutlar */
try {
    const cmdDir = path.join(__dirname, 'commands');
    const files = fs.readdirSync(cmdDir).filter(f => f.endsWith('.js'));
    for (const f of files) {
        const cmd = require(path.join(cmdDir, f));
        if (cmd.data && cmd.execute) ok(`komut: ${cmd.data.name}`);
        else fail(`${f}: data/execute eksik!`);
    }
} catch (e) { fail('komutlar yüklenemedi: ' + e.message); }

/* 3) Eventler */
try {
    const evDir = path.join(__dirname, 'events');
    const files = fs.readdirSync(evDir).filter(f => f.endsWith('.js'));
    for (const f of files) {
        const ev = require(path.join(evDir, f));
        if (ev.name && ev.execute) ok(`event: ${ev.name}`);
        else fail(`${f}: name/execute eksik!`);
    }
} catch (e) { fail('eventler yüklenemedi: ' + e.message); }

/* 4) Utils */
try {
    require('./utils/activity');
    ok('activity.js yüklendi');
    require('./utils/guard');
    ok('guard.js yüklendi');
} catch (e) { fail('utils hatası: ' + e.message); }

/* 5) Paketler */
try {
    const djVer = JSON.parse(fs.readFileSync(path.join(__dirname, 'node_modules/discord.js/package.json'), 'utf8')).version;
    ok('discord.js v' + djVer);
    const voiceVer = JSON.parse(fs.readFileSync(path.join(__dirname, 'node_modules/@discordjs/voice/package.json'), 'utf8')).version;
    ok('@discordjs/voice v' + voiceVer);
    require('canvafy'); ok('canvafy yüklendi');
    require('canvas'); ok('canvas yüklendi');
} catch (e) { fail('paket hatası: ' + e.message); }

/* 6) Data klasörü */
for (const f of ['log.json', 'tickets.json', 'users.json', 'warnings.json']) {
    const p = path.join(__dirname, 'data', f);
    if (fs.existsSync(p)) ok(`data/${f} mevcut`);
    else {
        try { fs.writeFileSync(p, JSON.stringify({}, null, 2)); ok(`data/${f} oluşturuldu`); }
        catch (e) { fail(`data/${f} yazılamadı!`); }
    }
}

console.log('');
if (errors === 0) { console.log('🎉 HER ŞEY ÇALIŞIYOR — 0 hata'); process.exit(0); }
console.log(`⚠️ ${errors} hata bulundu`);
process.exit(1);
