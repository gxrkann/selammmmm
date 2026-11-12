const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const cfg = require('../config.json');

const guardDataPath = path.join(__dirname, '../data/guard.json');
const LIMIT = 3;                 // izin verilen işlem sayısı
const WINDOW_MS = 10 * 60 * 1000; // 10 dakika pencere (eski işlemler sayılmaz)

function initGuardData() {
    if (!fs.existsSync(guardDataPath)) {
        fs.writeFileSync(guardDataPath, JSON.stringify({ limits: {} }, null, 4));
    }
}

async function checkGuard(executor, guild) {
    if (!executor) return;

    /* ---------- MUAF LİSTESİ ---------- */
    // 1) Botun kendisi (setup kanal kurarken kendini atmasın!)
    if (cfg.clientId && executor.id === cfg.clientId) return;
    // 2) Bot sahipleri
    if (cfg.ownerId.includes(executor.id)) return;

    const member = await guild.members.fetch(executor.id).catch(() => null);
    // 3) Boss rolü olanlar
    if (cfg.ownerRoleId && member && member.roles.cache.has(cfg.ownerRoleId)) return;
    // 4) Sunucuyu yönetme yetkisi olanlar guard'ı tetiklemesin (yetkili işlemleri güvenli sayılır)
    if (member && member.permissions.has('ManageGuild')) return;

    initGuardData();
    let data;
    try {
        data = JSON.parse(fs.readFileSync(guardDataPath, 'utf8'));
    } catch {
        data = { limits: {} };
    }
    if (!data.limits) data.limits = {};

    // Eski format (sayı) veya zaman aşımı -> sıfırla
    const now = Date.now();
    let entry = data.limits[executor.id];
    if (typeof entry === 'number') entry = { count: entry, ts: now };
    if (!entry || typeof entry !== 'object' || now - (entry.ts || 0) > WINDOW_MS) {
        entry = { count: 0, ts: now };
    }

    entry.count += 1;
    entry.ts = now;
    data.limits[executor.id] = entry;
    fs.writeFileSync(guardDataPath, JSON.stringify(data, null, 4));

    if (entry.count >= LIMIT) {
        if (member && member.kickable) {
            await member.kick('Guard Sistemi İhlali: Kurallar limitinden fazla işlem (Limit: 3)').catch(e => console.error('Kick error:', e));
        }

        const logDataPath = path.join(__dirname, '../data/log.json');
        if (fs.existsSync(logDataPath)) {
            const logData = JSON.parse(fs.readFileSync(logDataPath, 'utf8'));
            const guardLogId = logData['lrguard-log'];
            if (guardLogId) {
                const guardChannel = guild.channels.cache.get(guardLogId) || await guild.channels.fetch(guardLogId).catch(() => null);
                if (guardChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('🛡️ Guard İhlali Tespit Edildi!')
                        .setDescription(`**Yetkili:** ${executor} (\`${executor.id}\`)\n**Sebep:** Kanal/Rol işlem limiti (${LIMIT}) 10 dakika içinde aşıldı.\n**İşlem:** Üye sunucudan atıldı.`)
                        .setFooter({ text: `${cfg.footer.text} | Guard Sistemi` })
                        .setTimestamp();
                    await guardChannel.send({ embeds: [embed] }).catch(() => {});
                }
            }
        }

        // Sayaç sıfırla
        data.limits[executor.id] = { count: 0, ts: now };
        fs.writeFileSync(guardDataPath, JSON.stringify(data, null, 4));
    }
}

module.exports = { checkGuard };
