const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const cfg = require('../config.json');

const guardDataPath = path.join(__dirname, '../data/guard.json');

function initGuardData() {
    if (!fs.existsSync(guardDataPath)) {
        fs.writeFileSync(guardDataPath, JSON.stringify({ limits: {} }, null, 4));
    }
}

async function checkGuard(executor, guild) {
    if (!executor) return;
    if (cfg.ownerId.includes(executor.id)) return;
    
    const member = await guild.members.fetch(executor.id).catch(() => null);
    if (member && member.roles.cache.has(cfg.ownerRoleId)) return;

    initGuardData();
    let data;
    try {
        data = JSON.parse(fs.readFileSync(guardDataPath, 'utf8'));
    } catch {
        data = { limits: {} };
    }

    if (!data.limits[executor.id]) {
        data.limits[executor.id] = 0;
    }

    data.limits[executor.id] += 1;
    fs.writeFileSync(guardDataPath, JSON.stringify(data, null, 4));

    if (data.limits[executor.id] >= 3) {
        if (member) {
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
                        .setDescription(`**Yetkili:** ${executor} (\`${executor.id}\`)\n**Sebep:** Kanal/Rol işlem limiti (3) aşıldı.\n**İşlem:** Üye sunucudan atıldı.`)
                        .setFooter({ text: `${cfg.footer.text} | Guard Sistemi` })
                        .setTimestamp();
                    await guardChannel.send({ embeds: [embed] }).catch(() => {});
                }
            }
        }
        
        data.limits[executor.id] = 0; // reset
        fs.writeFileSync(guardDataPath, JSON.stringify(data, null, 4));
    }
}

module.exports = { checkGuard };
