// events/etiketIsim.js
// Üye etiketini değiştirdiğinde / kaldırdığında (user nesnesi değişince) rolünü eşitler.
// Discord docs: "Sent when a guild member is updated. This will also fire when the
// user object of a guild member changes." → sunucu etiketi değişimi buraya düşer.
const { Events } = require('discord.js');
const etiket = require('../utils/etiket');

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        try {
            if (!etiket.get().enabled) return;

            const userChanged = oldMember.user.username !== newMember.user.username
                || (oldMember.user.globalName || null) !== (newMember.user.globalName || null)
                || oldMember.nickname !== newMember.nickname;

            const etiketChanged = (oldMember.user.primaryGuild?.identityGuildId || null) !== (newMember.user.primaryGuild?.identityGuildId || null)
                || (oldMember.user.primaryGuild?.identityEnabled ?? null) !== (newMember.user.primaryGuild?.identityEnabled ?? null)
                || (oldMember.user.primaryGuild?.tag || null) !== (newMember.user.primaryGuild?.tag || null);

            if (!userChanged && !etiketChanged) return;

            await etiket.sync(newMember, 'Sunucu etiketi: etiket/isim değişikliği');
        } catch (error) {
            console.error('[ETIKET] Güncelleme kontrolü hatası:', error.message);
        }
    },
};
