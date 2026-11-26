// events/etiketIsim.js
// Üyenin kullanıcı adı / global adı / takma adı değiştiğinde etiket rolünü eşitler.
const { Events } = require('discord.js');
const etiket = require('../utils/etiket');

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        try {
            if (!etiket.get().enabled) return;

            const usernameChanged = oldMember.user.username !== newMember.user.username;
            const globalChanged = (oldMember.user.globalName || null) !== (newMember.user.globalName || null);
            const nicknameChanged = oldMember.nickname !== newMember.nickname;

            if (!usernameChanged && !globalChanged && !nicknameChanged) return;

            await etiket.sync(newMember, 'Sunucu etiketi: isim değişikliği');
        } catch (error) {
            console.error('[ETIKET] İsim değişikliği kontrolü hatası:', error.message);
        }
    },
};
