// events/voiceStateUpdate.js
// Ses olayları log sistemi + aktivite takibi
const { EmbedBuilder, AuditLogEvent, time } = require('discord.js');
const fs = require('node:fs');
const path = require('path');
const config = require('../config.json');
const activity = require('../utils/activity');

const BRAND = `${config.footer.text} | Log Sistemi.`;

// log.json'dan ses log kanalı ID'sini al
function getVoiceLogChannel() {
    try {
        const logData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/log.json'), 'utf8'));
        return logData['lrvoice-log'];
    } catch {
        return null;
    }
}

/* Yardımcılar */
const unixNow = () => Math.floor(Date.now() / 1000);

function fieldTime(unix) {
    return {
        name: 'Zaman / Tarih',
        value: `<t:${unix}:f>  (${time(unix, 'R')})`,
        inline: false,
    };
}

function sendLog(guild, embed) {
    const channelId = getVoiceLogChannel();
    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    channel.send({ embeds: [embed] }).catch(() => { });
}

async function fetchExecutor(guild, targetId) {
    try {
        const logs = await guild.fetchAuditLogs({
            type: AuditLogEvent.MemberUpdate,
            limit: 5,
        });
        const now = Date.now();
        const entry = logs.entries.find(
            (e) =>
                e.target?.id === targetId &&
                now - e.createdTimestamp < 15_000
        );
        return entry?.executor || null;
    } catch {
        return null;
    }
}

module.exports = {
    name: 'voiceStateUpdate',

    /**
     * @param {import('discord.js').VoiceState} oldState
     * @param {import('discord.js').VoiceState} newState
     */
    async execute(oldState, newState) {
        const guild = newState.guild || oldState.guild;
        const member = newState.member || oldState.member;
        if (!guild || !member) return;

        const user = member.user;
        if (user.bot) return;

        /* ---------- AKTİVİTE TAKİBİ ---------- */
        // Kanala giriş
        if (!oldState.channelId && newState.channelId) {
            activity.startVoice(member.id, newState.channelId);
        }
        // Kanaldan çıkış
        else if (oldState.channelId && !newState.channelId) {
            activity.endVoice(member.id);
        }
        // Kanal değiştirme (oturum devam ediyor, kanal kaydını güncelle)
        else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            activity.startVoice(member.id, newState.channelId);
        }
        // Bot yeniden başlarken açık oturumları yutmayalım: mute/deafen değişimleri oturumu etkilemez

        /* ---------- LOG SİSTEMİ ---------- */
        const unix = unixNow();

        // 1) KANALA GİRİŞ
        if (!oldState.channelId && newState.channelId) {
            const ch = newState.channel;
            const e = new EmbedBuilder()
                .setColor("#04fc04")
                .setDescription(`🔹 ${member}, <#${ch.id}> **Adlı Kanala Katıldı!**`)
                .addFields(fieldTime(unix))
                .setFooter({ text: BRAND })
                .setThumbnail(user.displayAvatarURL({ size: 256 }));
            return sendLog(guild, e);
        }

        // 2) KANALDAN AYRILMA
        if (oldState.channelId && !newState.channelId) {
            const ch = oldState.channel;
            const e = new EmbedBuilder()
                .setColor("#fc0404")
                .setDescription(`🔹 ${member}, <#${ch.id}> **Adlı Kanaldan Ayrıldı!**`)
                .addFields(fieldTime(unix))
                .setFooter({ text: BRAND })
                .setThumbnail(user.displayAvatarURL({ size: 256 }));
            return sendLog(guild, e);
        }

        // 3) KANAL DEĞİŞTİRME
        if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            const oldCh = oldState.channel;
            const newCh = newState.channel;
            const e = new EmbedBuilder()
                .setColor("#04fcfc")
                .setDescription(`🔹 ${member}, <#${oldCh.id}> **Adlı Kanaldan** <#${newCh.id}> **Adlı Kanala Geçti!**`)
                .addFields(fieldTime(unix))
                .setFooter({ text: BRAND })
                .setThumbnail(user.displayAvatarURL({ size: 256 }));
            return sendLog(guild, e);
        }

        // 4) SUNUCU (SERVER) MUTE AÇILDI
        if (!oldState.serverMute && newState.serverMute) {
            const exec = await fetchExecutor(guild, member.id);
            const ch = newState.channel ?? oldState.channel;
            const e = new EmbedBuilder()
                .setColor("#b41414")
                .setDescription(
                    `🔹 ${exec ? `${exec}` : 'Bir yetkili'}, <#${ch?.id}> **Adlı Kanalda** ${member}\n` +
                    `**Tarafından Susturuldu!** Sebep: Belirtilmemiş`
                )
                .addFields(fieldTime(unix))
                .setFooter({ text: BRAND })
                .setThumbnail(user.displayAvatarURL({ size: 256 }));
            return sendLog(guild, e);
        }

        // 5) SUNUCU (SERVER) MUTE KALDIRILDI
        if (oldState.serverMute && !newState.serverMute) {
            const exec = await fetchExecutor(guild, member.id);
            const ch = newState.channel ?? oldState.channel;
            const e = new EmbedBuilder()
                .setColor("#04fc04")
                .setDescription(
                    `🔹 ${exec ? `${exec}` : 'Bir yetkili'}, <#${ch?.id}> **Adlı Kanalda** ${member}\n` +
                    `**Tarafından Susturması Kaldırıldı!** Sebep: Belirtilmemiş`
                )
                .addFields(fieldTime(unix))
                .setFooter({ text: BRAND })
                .setThumbnail(user.displayAvatarURL({ size: 256 }));
            return sendLog(guild, e);
        }

        // 6) SUNUCU (SERVER) SAĞIRLAŞTIRILDI
        if (!oldState.serverDeaf && newState.serverDeaf) {
            const exec = await fetchExecutor(guild, member.id);
            const ch = newState.channel ?? oldState.channel;
            const e = new EmbedBuilder()
                .setColor("#54542c")
                .setDescription(
                    `🔹 ${exec ? `${exec}` : 'Bir yetkili'}, <#${ch?.id}> **Adlı Kanalda** ${member}\n` +
                    `**Tarafından Sağırlaştırıldı!** Sebep: Belirtilmemiş`
                )
                .addFields(fieldTime(unix))
                .setFooter({ text: BRAND })
                .setThumbnail(user.displayAvatarURL({ size: 256 }));
            return sendLog(guild, e);
        }

        // 7) SUNUCU (SERVER) SAĞIRLAŞTIRMA KALDIRILDI
        if (oldState.serverDeaf && !newState.serverDeaf) {
            const exec = await fetchExecutor(guild, member.id);
            const ch = newState.channel ?? oldState.channel;
            const e = new EmbedBuilder()
                .setColor("#ecec0c")
                .setDescription(
                    `🔹 ${exec ? `${exec}` : 'Bir yetkili'}, <#${ch?.id}> **Adlı Kanalda** ${member}\n` +
                    `**Tarafından Sağırlaştırması Kaldırıldı!** Sebep: Belirtilmemiş`
                )
                .addFields(fieldTime(unix))
                .setFooter({ text: BRAND })
                .setThumbnail(user.displayAvatarURL({ size: 256 }));
            return sendLog(guild, e);
        }
    },
};
