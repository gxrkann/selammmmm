// utils/env.js
// Ortam değişkenlerini config.json üzerine uygular.
// Panel (host) ortam değişkenleri config.json'daki değerleri ezer.

const config = require('../config.json');

// Tek değerli alanlar
const singleKeys = [
    'token',
    'clientId',
    'guildId',
    'ownerRoleId',
    'memberRoleId',
    'welcomeChannelId',
    'ticketCategoryId',
    'voiceChannelId',
];

for (const key of singleKeys) {
    const value = process.env[key.toUpperCase()];
    if (value) config[key] = value;
}

// Liste kabul eden alanlar (virgülle ayrılmış)
if (process.env.OWNER_ID) {
    config.ownerId = process.env.OWNER_ID.split(',').map(s => s.trim()).filter(Boolean);
}

if (process.env.EKIP_ROLLERI) {
    config.ekipRolleri = process.env.EKIP_ROLLERI.split(',').map(s => s.trim()).filter(Boolean);
}

// Footer (marka) metni
if (process.env.FOOTER_TEXT) {
    config.footer = { text: process.env.FOOTER_TEXT };
}

module.exports = config;
