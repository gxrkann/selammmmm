const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const config = require('../config.json');
const fs = require('fs');
const path = require('path');

// Ticket numarasını saklamak için dosya
const TICKET_DATA_FILE = path.join(__dirname, '../data/tickets.json');

// Ticket numarasını yükle
function loadTicketData() {
    if (!fs.existsSync(TICKET_DATA_FILE)) {
        return { lastTicketNumber: 0 };
    }
    try {
        return JSON.parse(fs.readFileSync(TICKET_DATA_FILE, 'utf8'));
    } catch (error) {
        console.error('Ticket verileri yüklenirken hata:', error);
        return { lastTicketNumber: 0 };
    }
}

// Ticket numarasını kaydet
function saveTicketData(data) {
    try {
        fs.writeFileSync(TICKET_DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('Ticket verileri kaydedilirken hata:', error);
    }
}

// Sonraki ticket numarasını al
function getNextTicketNumber() {
    const data = loadTicketData();
    data.lastTicketNumber = (data.lastTicketNumber || 0) + 1;
    saveTicketData(data);
    return data.lastTicketNumber;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('başvuru')
        .setDescription('Ekip başvuru butonu ve mesajını gönderir')
        .addChannelOption(option =>
            option.setName('kanal')
                .setDescription('Mesajın gönderileceği kanal')
                .setRequired(true)
        ),

    async execute(interaction) {
        try {
            // Sadece owner kullanabilir (kullanıcı veya owner rolü)
            const isOwnerUser = config.ownerId.includes(interaction.user.id);
            const isOwnerRole = config.ownerRoleId && interaction.member?.roles?.cache?.has(config.ownerRoleId);
            if (!isOwnerUser && !isOwnerRole) {
                return interaction.reply({
                    content: '❌ Bu komutu sadece bot sahibi kullanabilir!',
                    ephemeral: true
                });
            }

            const targetChannel = interaction.options.getChannel('kanal');

            if (targetChannel.type !== ChannelType.GuildText) {
                return interaction.reply({
                    content: '❌ Sadece metin kanalları seçilebilir!',
                    ephemeral: true
                });
            }

            const imageFile = new AttachmentBuilder(path.join(__dirname, '../Sanzy_logosu_ve_ylan_detaylar.png'));

            // İlk embed (başvuru mesajı)
            const başvuruEmbed = new EmbedBuilder()
                .setTitle('**Ekip Başvuru Butonu**')
                .setDescription('Gxrkan Ekip Sunucumuza Hoşgeldiniz. Ekibe Başvurmak İçin Butona Basabilirsiniz')
                .setImage("attachment://Sanzy_logosu_ve_ylan_detaylar.png")
                .setThumbnail("attachment://Sanzy_logosu_ve_ylan_detaylar.png")
                .setColor("#de4a4a")
                .setFooter({ text: `${config.footer.text} Bot's` });

            // Buton
            const başvuruButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('basvuru_button')
                        .setLabel('Ekip Başvuru')
                        .setStyle(ButtonStyle.Success)
                );

            await targetChannel.send({
                embeds: [başvuruEmbed],
                components: [başvuruButton],
                files: [imageFile]
            });

            await interaction.reply({
                content: `✅ Başvuru mesajı ${targetChannel} kanalına gönderildi!`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Başvuru komutu hatası:', error);
            if (!interaction.replied) {
                interaction.reply({
                    content: '❌ Bir hata oluştu!',
                    ephemeral: true
                }).catch(() => { });
            }
        }
    },

    // Buton tıklama handler'ı
    async handleButton(interaction) {
        try {
            if (interaction.customId !== 'basvuru_button') return;

            const guild = interaction.guild;
            const user = interaction.user;

            // Kategoriyi bul (config'den veya log.json'dan)
            let categoryId = config.ticketCategoryId;

            if (!categoryId) {
                // Log.json'dan TİCKET LOG kategorisini bul
                try {
                    const logData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/log.json'), 'utf8'));
                    const ticketLogCategory = logData['</ TİCKET LOG />'];
                    if (ticketLogCategory) {
                        // Kategoriyi bul
                        const category = guild.channels.cache.find(
                            c => c.type === ChannelType.GuildCategory && c.name.includes('TİCKET')
                        );
                        if (category) {
                            categoryId = category.id;
                        }
                    }
                } catch (error) {
                    console.error('Log dosyası okunamadı:', error);
                }

                // Hala bulunamadıysa genel arama yap
                if (!categoryId) {
                    const category = guild.channels.cache.find(
                        c => c.type === ChannelType.GuildCategory &&
                            (c.name.includes('TİCKET') || c.name.includes('TICKET') || c.name.includes('Ticket'))
                    );
                    if (category) {
                        categoryId = category.id;
                    }
                }

                if (!categoryId) {
                    return interaction.reply({
                        content: '❌ Ticket kategori bulunamadı! Lütfen bir ticket kategorisi oluşturun veya config.json\'a ticketCategoryId ekleyin.',
                        ephemeral: true
                    });
                }
            }

            // Kullanıcının zaten açık bir başvuru kanalı var mı kontrol et
            const existingTicket = guild.channels.cache.find(
                c => c.parentId === categoryId &&
                    c.type === ChannelType.GuildText &&
                    c.permissionOverwrites.cache.has(user.id)
            );

            if (existingTicket) {
                return interaction.reply({
                    content: `❌ Zaten açık bir başvurunuz bulunuyor: ${existingTicket}\nLütfen önce mevcut başvurunuzun sonuçlanmasını bekleyin.`,
                    ephemeral: true
                });
            }

            // Ticket numarası al
            const ticketNumber = getNextTicketNumber();

            // Kullanıcı adını temizle (Discord kanal isimlendirme kurallarına uygun)
            const cleanUsername = user.username.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'user';

            // Kanal adı: ┇1┇kullanıcıadı
            const channelName = `┇${ticketNumber}┇${cleanUsername}`;

            // Ticket kanalı oluştur
            const ticketChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: categoryId,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory
                        ]
                    }
                ]
            });

            // Kullanıcıya ve @ELDER, @Jayfex gibi rollere mention ekle
            const elderRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'elder' || r.name.toLowerCase().includes('elder'));
            const jayfexRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'jayfex' || r.name.toLowerCase().includes('jayfex'));

            let mentions = '';
            if (elderRole) mentions += `<@&${elderRole.id}>`;
            if (elderRole && jayfexRole) mentions += ' | ';
            if (jayfexRole) mentions += `<@&${jayfexRole.id}>`;

            // Eğer hiç rol bulunamadıysa sadece kullanıcıyı mention et
            if (!mentions) mentions = `<@${user.id}>`;

            // İlk embed (Ticket oluşturuldu)
            const ticketCreatedEmbed = new EmbedBuilder()
                .setTitle('**Ekip Başvuru için Ticket Oluşturuldu!**')
                .setDescription(
                    `${user} kişisi <t:${Math.floor(Date.now() / 1000)}:R> tarihinde destek talebi oluşturdu.\n` +
                    `**Oluşturulan destek talebinin bilgilerini aşağıda belirttim;**`
                )
                .setThumbnail(user.displayAvatarURL({ size: 256 }))
                .addFields(
                    {
                        name: '**Oluşturan Kullanıcı:**',
                        value: `\`\`\`fix\n${user.username}\n\`\`\``,
                        inline: false
                    },
                    {
                        name: '**Kategori:**',
                        value: '\`\`\`fix\nEkip Başvuru\n\`\`\`',
                        inline: false
                    }
                )
                .setColor("#1e1f22")
                .setFooter({ text: config.footer.text, iconURL: interaction.client.user.displayAvatarURL({ size: 256 }) })
                .setTimestamp();

            // İkinci embed (Sorular)
            const questionsEmbed = new EmbedBuilder()
                .setTitle('**Ekip Başvuru Soruları**')
                .setDescription(
                    '• Nick ve yaş\n' +
                    '• Önceki ekipleriniz\n' +
                    '• Aktiflik durumunuz.\n' +
                    '• Steam profil linkiniz.\n' +
                    '• Povlarınız varsa videonuz.\n' +
                    '• FiveM saatiniz.\n' +
                    '• Sistem özellikleriniz.'
                )
                .setColor("#1e1f22")
                .setFooter({ text: config.footer.text, iconURL: interaction.client.user.displayAvatarURL({ size: 256 }) })
                .setTimestamp();

            // Ticket kapatma select menu
            const closeSelect = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('ticket_close')
                        .setPlaceholder('Ticket\'ı Kapatmak İçin Tıkla!')
                        .addOptions([
                            {
                                label: 'Ticket Kapat',
                                value: 'close_ticket',
                                description: 'Ticket kanalını kapatır ve siler',
                                emoji: '🔒'
                            }
                        ])
                );

            await ticketChannel.send({
                content: mentions,
                embeds: [ticketCreatedEmbed, questionsEmbed],
                components: [closeSelect]
            });

            await interaction.reply({
                content: `✅ Ticket kanalınız oluşturuldu: ${ticketChannel}`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Başvuru buton handler hatası:', error);
            if (!interaction.replied) {
                interaction.reply({
                    content: '❌ Ticket oluşturulurken bir hata oluştu!',
                    ephemeral: true
                }).catch(() => { });
            }
        }
    },

    // Select menu handler'ı (ticket kapatma)
    async handleSelectMenu(interaction) {
        try {
            if (interaction.customId !== 'ticket_close') return;

            if (interaction.values[0] === 'close_ticket') {
                const channel = interaction.channel;

                await interaction.reply({
                    content: '⏳ Ticket kapatılıyor...',
                    ephemeral: false
                });

                // Kısa bir gecikme sonrası kanalı sil
                setTimeout(async () => {
                    try {
                        await channel.delete();
                    } catch (error) {
                        console.error('Kanal silinirken hata:', error);
                    }
                }, 2000);
            }

        } catch (error) {
            console.error('Ticket kapatma hatası:', error);
            if (!interaction.replied) {
                interaction.reply({
                    content: '❌ Ticket kapatılırken bir hata oluştu!',
                    ephemeral: true
                }).catch(() => { });
            }
        }
    }
};

