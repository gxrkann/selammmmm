// events/etiketGiris.js
// Sunucuya yeni giren üyenin ismi zaten etiketliyse rolü anında verilir.
const { Events } = require('discord.js');
const etiket = require('../utils/etiket');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        try {
            if (!etiket.get().enabled) return;
            await etiket.sync(member, 'Sunucu etiketi: sunucuya giriş');
        } catch (error) {
            console.error('[ETIKET] Giriş kontrolü hatası:', error.message);
        }
    },
};
