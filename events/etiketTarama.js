// events/etiketTarama.js
// Bot başlarken (veya ismi bot açıkken kaçıran üyeler için) tüm üyeleri tarar.
const { Events } = require('discord.js');
const etiket = require('../utils/etiket');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        try {
            if (!etiket.get().enabled) return;
            for (const [, guild] of client.guilds.cache) {
                const sonuc = await etiket.sweep(guild, 'Sunucu etiketi: açılış taraması');
                if (sonuc.verilen || sonuc.alinan) {
                    console.log(`[ETIKET] ${guild.name}: ${sonuc.verilen} rol verildi, ${sonuc.alinan} rol alındı.`);
                }
            }
        } catch (error) {
            console.error('[ETIKET] Açılış taraması hatası:', error.message);
        }
    },
};
