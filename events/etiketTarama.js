// events/etiketTarama.js
// 1) Bot başlarken tüm üyeleri tarar (bot açıkken kaçan değişiklikler).
// 2) Güvenlik ağı: her 5 dakikada bir periyodik tarama (etiket olayı gelmezse yakalar).
const { Events } = require('discord.js');
const etiket = require('../utils/etiket');

const SWEEP_INTERVAL_MS = 60 * 1000; // 1 dakika (Discord etiket değişikliğinde olay göndermiyor)

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        // Açılış taraması
        try {
            if (etiket.get().enabled) {
                for (const [, guild] of client.guilds.cache) {
                    const sonuc = await etiket.sweep(guild, 'Sunucu etiketi: açılış taraması');
                    if (sonuc.verilen || sonuc.alinan) {
                        console.log(`[ETIKET] ${guild.name}: ${sonuc.verilen} rol verildi, ${sonuc.alinan} rol alındı.`);
                    }
                }
            }
        } catch (error) {
            console.error('[ETIKET] Açılış taraması hatası:', error.message);
        }

        // Periyodik tarama (güvenlik ağı)
        setInterval(async () => {
            try {
                if (!etiket.get().enabled) return;
                for (const [, guild] of client.guilds.cache) {
                    await etiket.sweep(guild, 'Sunucu etiketi: periyodik tarama');
                }
            } catch (error) {
                console.error('[ETIKET] Periyodik tarama hatası:', error.message);
            }
        }, SWEEP_INTERVAL_MS);
    },
};
