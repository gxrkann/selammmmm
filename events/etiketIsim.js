// events/etiketIsim.js
// Üye güncellendiğinde (isim/takma ad/etiket değişikliği) rolünü eşitler.
// Not: Discord, sunucu etiketi değişimini member update içinde her zaman
// görünür kılmayabilir; bu yüzden diff'e güvenmeden her güncellemede
// sync() çağrılır (sync yerel kontrol yapar, değişiklik yoksa işlem yapmaz).
const { Events } = require('discord.js');
const etiket = require('../utils/etiket');

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        try {
            if (!etiket.get().enabled) return;
            await etiket.sync(newMember, 'Sunucu etiketi: üye güncellemesi');
        } catch (error) {
            console.error('[ETIKET] Üye güncelleme kontrolü hatası:', error.message);
        }
    },
};
