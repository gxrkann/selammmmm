# Gxrkan Ekip Botu

Discord.js v14 ile geliştirilmiş, ekip yönetimi odaklı Discord botu.

## Komutlar

### Ekip Yönetimi
- `/ekip işlem:DURUM` — Ekip rollerini, üye sayılarını ve günün aktif/pasif üyelerini listeler
- `/ekip işlem:RAPOR` — 7 günlük aktivite raporu (en aktif 10 ses, en aktif 10 mesaj, hiç aktivitesi olmayanlar)
- `/yetkili işlem:AL` — Yetkili kaydet (+ isteğe bağlı rol ver)
- `/yetkili işlem:TERFİ` — Yetkiliye terfi kaydı ekle
- `/yetkili işlem:ÇIKAR` — Yetkiliyi ekipten çıkar (kayıt tutulur)
- `/yetkili işlem:PROFİL` — Yetkili profili: aktivite, uyarılar, terfi geçmişi
- `/yetkili işlem:LİSTE` — Tüm kayıtlı yetkililer

### Mevcut Sistemler
- `/aktiflik süre` — Butonlu aktiflik testi; süre bitince basmayan ekip üyelerinden rol otomatik çekilir (bot yeniden başlasa bile test kaldığı yerden devam eder)
- `/başvuru kanal` — Ekip başvuru ticket sistemi
- `/uyarı ...` — Uyarı verme/sorgulama sistemi (JSON kalıcı)
- `/setup durum:AC|KAPA` — Log kanallarını kurar/siler

### Otomatik Sistemler
- **Aktivite takibi:** Ses süresi (dakika) ve mesaj sayısı gün bazında `data/activity.json` dosyasına kaydedilir
- **Guard:** Rol/kanal/ban koruması ve logları
- **Spam & link koruması:** Otomatik timeout
- **Loglar:** Giriş/çıkış, mesaj düzenleme/silme, ses olayları, komut kullanımı

## Kurulum

1. Node.js 18+ yüklü olduğundan emin olun
2. Gerekli paketleri yükleyin:
```bash
npm install
```

3. `config.json` dosyasını doldurun:
   - `token` — Bot token (Developer Portal'dan)
   - `clientId` — Uygulama (bot) ID'si
   - `guildId` — Sunucu ID'si
   - `ownerId` — Bot sahiplerinin Discord ID'leri
   - `ownerRoleId` — "Boss" rolü ID'si
   - `memberRoleId` — Ekip rolü ID'si
   - `ekipRolleri` — `/ekip` istatistiklerinde izlenecek rol ID'leri
   - `welcomeChannelId` — Karşılama mesajı kanalı
   - `ticketCategoryId`, `voiceChannelId` — Ticket kategorisi ve botun bağlanacağı ses kanalı

4. Slash komutlarını Discord'a kaydedin:
```bash
npm run deploy
```

5. Botu başlatın:
```bash
npm start
```

## Güvenlik Notu
- Token'ınızı asla paylaşmayın. Eski token bir .rar arşivinde paylaşılmışsa **mutlaka** [Developer Portal](https://discord.com/developers/applications) üzerinden yenileyin.
- Bot "Server Members Intent" ve "Message Content Intent" yetkilerinin Developer Portal'dan açık olduğundan emin olun.

## Proje Yapısı

- `index.js` — Ana bot dosyası
- `config.json` — Bot konfigürasyonu
- `commands/` — Slash komutları
- `events/` — Bot olayları
- `utils/` — Aktivite takibi ve yardımcı modüller
- `data/` — JSON veri dosyaları (uyarılar, aktivite, yetkililer, log kanalları)

## Geliştirme

Geliştirme modunda çalıştırmak için:
```bash
npm run dev
```
