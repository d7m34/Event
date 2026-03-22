
// ═══════════════════════════════════════════════════════════════
// 🎴 بوت Card Roulette - روليت البطاقات
// بوت ديسكورد متكامل لفعاليات البطاقات العشوائية
// ═══════════════════════════════════════════════════════════════

const {
    Client, GatewayIntentBits, Partials,
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ModalBuilder, TextInputBuilder,
    TextInputStyle, PermissionFlagsBits, ActivityType,
    SlashCommandBuilder, REST, Routes, ComponentType,
    ChannelType
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// ─── تحميل الملفات ───
const configPath = path.join(__dirname, 'config.json');
const cardsPath = path.join(__dirname, 'data', 'cards.json');

let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
let cardsData = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));

// ─── حفظ الملفات ───
function saveConfig() {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

function saveCards() {
    fs.writeFileSync(cardsPath, JSON.stringify(cardsData, null, 2), 'utf8');
}

// ─── إنشاء الكلاينت ───
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message]
});

// ═══════════════════════════════════════════════════════════════
// 🎨 ثوابت الألوان والأيقونات لكل نوع بطاقة
// ═══════════════════════════════════════════════════════════════
const CARD_TYPES = {
    eidiya: {
        name: '🎁 عيدية',
        color: 0xFFD700,    // ذهبي
        emoji: '🎁',
        label: 'عيدية'
    },
    challenge: {
        name: '⚡ تحدي',
        color: 0x3498DB,    // أزرق
        emoji: '⚡',
        label: 'تحدي'
    },
    punishment: {
        name: '💀 عقاب',
        color: 0xE74C3C,    // أحمر
        emoji: '💀',
        label: 'عقاب'
    },
    mystery: {
        name: '❓ غامضة',
        color: 0x9B59B6,    // بنفسجي
        emoji: '❓',
        label: 'غامضة'
    },
    joker: {
        name: '🃏 جوكر',
        color: 0x2ECC71,    // أخضر
        emoji: '🃏',
        label: 'جوكر'
    },
    swap: {
        name: '🔄 مبادلة',
        color: 0xE67E22,    // برتقالي
        emoji: '🔄',
        label: 'مبادلة'
    }
};

// ═══════════════════════════════════════════════════════════════
// 🎮 متغيرات حالة اللعبة
// ═══════════════════════════════════════════════════════════════
let gameState = {
    active: false,          // هل اللعبة شغالة؟
    paused: false,          // هل اللعبة متوقفة مؤقتاً؟
    phase: 'idle',          // idle / registration / playing / ended
    players: [],            // قائمة اللاعبين المسجلين
    currentPlayerIndex: 0,  // مؤشر اللاعب الحالي
    availableCards: [],     // البطاقات المتوفرة للسحب
    drawnCards: [],         // البطاقات المسحوبة (للإحصائيات)
    doubleMode: false,      // وضع الضغط المضاعف
    gameChannel: null,      // قناة اللعبة
    gameMessage: null,      // رسالة اللعبة الرئيسية
    registrationMessage: null, // رسالة التسجيل
    timerInterval: null,    // مؤقت التنفيذ
    adminPanelMessage: null // رسالة لوحة الأدمن
};

// ═══════════════════════════════════════════════════════════════
// 🔧 دوال مساعدة
// ═══════════════════════════════════════════════════════════════

// التحقق من صلاحيات الأدمن
function isAdmin(userId) {
    return userId === config.ownerId || config.admins.includes(userId);
}

// خلط المصفوفة عشوائياً (Fisher-Yates)
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// توليد ID فريد
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// تأخير
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════
// 📋 بناء لوحة الأدمن (Embed + أزرار)
// ═══════════════════════════════════════════════════════════════
function buildAdminPanel() {
    // الـ Embed الرئيسي للوحة الأدمن
    const embed = new EmbedBuilder()
        .setTitle('🎴 لوحة تحكم Card Roulette')
        .setDescription('تحكم كامل بالبوت والبطاقات والإعدادات')
        .setColor(0x2F3136)
        .addFields(
            {
                name: '📊 إحصائيات سريعة',
                value: [
                    `📦 عدد البطاقات: **${cardsData.cards.length}**`,
                    `👥 المسؤولين: **${config.admins.length + 1}**`,
                    `🎮 حالة اللعبة: **${gameState.active ? '🟢 شغالة' : '🔴 متوقفة'}**`,
                    `🎯 عدد بطاقات اللعبة: **${config.gameSettings.cardCount}**`,
                    `⏱️ تايمر التنفيذ: **${config.gameSettings.executionTimer} ثانية**`,
                    `🔇 وضع الكتمان: **${config.gameSettings.muteMode ? '✅ مفعّل' : '❌ معطّل'}**`
                ].join('\n'),
                inline: false
            },
            {
                name: '🎁 أنواع البطاقات',
                value: Object.values(CARD_TYPES).map(t => {
                    const count = cardsData.cards.filter(c => c.type === Object.keys(CARD_TYPES).find(k => CARD_TYPES[k] === t)).length;
                    return `${t.emoji} ${t.label}: **${count}**`;
                }).join('\n'),
                inline: true
            }
        )
        .setFooter({ text: 'Card Roulette Admin Panel • استخدم الأزرار للتحكم' })
        .setTimestamp();

    // ─── صف أزرار البطاقات ───
    const cardsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('admin_add_card')
            .setLabel('➕ إضافة بطاقة')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('admin_view_cards')
            .setLabel('📋 عرض البطاقات')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('admin_delete_card')
            .setLabel('🗑️ حذف بطاقة')
            .setStyle(ButtonStyle.Danger)
    );

    // ─── صف أزرار المسؤولين ───
    const adminsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('admin_manage_admins')
            .setLabel('👑 إدارة المسؤولين')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('admin_bot_settings')
            .setLabel('⚙️ إعدادات البوت')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('admin_game_settings')
            .setLabel('🎮 إعدادات اللعبة')
            .setStyle(ButtonStyle.Secondary)
    );

    // ─── صف أزرار إضافي ───
    const extraRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('admin_refresh_panel')
            .setLabel('🔄 تحديث اللوحة')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('admin_reset_all')
            .setLabel('🔄 إعادة تعيين البطاقات')
            .setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [cardsRow, adminsRow, extraRow] };
}

// ═══════════════════════════════════════════════════════════════
// 🎮 بناء Embed التسجيل
// ═══════════════════════════════════════════════════════════════
function buildRegistrationEmbed(guild) {
    const embed = new EmbedBuilder()
        .setTitle('🎴 روليت البطاقات — التسجيل مفتوح!')
        .setDescription(config.gameSettings.eventDescription || 'فعالية روليت البطاقات!')
        .setColor(0xFFD700)
        .addFields(
            {
                name: '👥 اللاعبين المسجلين',
                value: gameState.players.length > 0
                    ? gameState.players.map((p, i) => `\`${i + 1}\` <@${p.id}>`).join('\n')
                    : '*لا يوجد لاعبين بعد...*',
                inline: false
            },
            {
                name: '📊 العدد',
                value: `**${gameState.players.length}** لاعب مسجل`,
                inline: true
            },
            {
                name: '🎯 البطاقات',
                value: `**${config.gameSettings.cardCount}** بطاقة متوفرة`,
                inline: true
            }
        )
        .setFooter({ text: 'اضغط "انضم" للتسجيل في الفعالية!' })
        .setTimestamp();

    // إضافة banner السيرفر لو موجود
    if (guild && guild.bannerURL()) {
        embed.setImage(guild.bannerURL({ size: 1024 }));
    } else if (guild && guild.iconURL()) {
        embed.setThumbnail(guild.iconURL({ size: 256 }));
    }

    // أزرار التسجيل
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('game_join')
            .setLabel('🙋 انضم')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('game_leave')
            .setLabel('🚪 انسحب')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('game_start')
            .setLabel('🚀 ابدأ اللعبة')
            .setStyle(ButtonStyle.Primary)
    );

    return { embeds: [embed], components: [row] };
}

// ═══════════════════════════════════════════════════════════════
// 🎴 بناء Embed دور اللاعب
// ═══════════════════════════════════════════════════════════════
function buildPlayerTurnEmbed() {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer) return null;

    const remaining = gameState.availableCards.length;
    const total = config.gameSettings.cardCount;

    const embed = new EmbedBuilder()
        .setTitle(`🎴 دور اللاعب`)
        .setDescription(`<@${currentPlayer.id}>\n\nاسحب بطاقتك الآن! 🃏`)
        .setColor(0x3498DB)
        .addFields(
            {
                name: '📊 التقدم',
                value: `تبقى **${remaining}/${total}** بطاقة`,
                inline: true
            },
            {
                name: '🎯 الدور',
                value: `**${gameState.currentPlayerIndex + 1}/${gameState.players.length}**`,
                inline: true
            },
            {
                name: '⏱️ المؤقت',
                value: `**${config.gameSettings.executionTimer}** ثانية`,
                inline: true
            }
        )
        .setFooter({ text: gameState.doubleMode ? '⚡ وضع الضغط المضاعف مفعّل!' : 'Card Roulette' })
        .setTimestamp();

    // أزرار اللاعب
    const playerRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('game_draw')
            .setLabel('🎴 اسحب بطاقة')
            .setStyle(ButtonStyle.Primary)
    );

    // أزرار المسؤول
    const adminRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('game_next')
            .setLabel('✅ التالي')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('game_skip')
            .setLabel('⏭️ تخطي')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('game_pause')
            .setLabel(gameState.paused ? '▶️ استمرار' : '⏸️ إيقاف')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('game_double')
            .setLabel(gameState.doubleMode ? '✖️ إلغاء x2' : 'x2 مضاعف')
            .setStyle(gameState.doubleMode ? ButtonStyle.Danger : ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('game_end')
            .setLabel('🛑 إنهاء')
            .setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [playerRow, adminRow] };
}

// ═══════════════════════════════════════════════════════════════
// 🎴 بناء Embed البطاقة المسحوبة
// ═══════════════════════════════════════════════════════════════
function buildCardEmbed(card, playerName) {
    const cardType = CARD_TYPES[card.type] || CARD_TYPES.mystery;

    const embed = new EmbedBuilder()
        .setTitle(`${cardType.emoji} ${card.name}`)
        .setDescription(card.description)
        .setColor(cardType.color)
        .addFields(
            { name: '🎴 النوع', value: cardType.name, inline: true },
            { name: '👤 اللاعب', value: playerName, inline: true }
        )
        .setFooter({ text: 'Card Roulette 🎲' })
        .setTimestamp();

    return embed;
}

// ═══════════════════════════════════════════════════════════════
// 📊 بناء Embed الملخص النهائي
// ═══════════════════════════════════════════════════════════════
function buildSummaryEmbed() {
    const stats = {};
    // حساب الإحصائيات لكل نوع
    for (const type of Object.keys(CARD_TYPES)) {
        stats[type] = gameState.drawnCards.filter(c => c.card.type === type).length;
    }

    const embed = new EmbedBuilder()
        .setTitle('🏆 انتهت الجولة — الملخص')
        .setColor(0xFFD700)
        .addFields(
            {
                name: '📊 إحصائيات البطاقات',
                value: Object.entries(stats)
                    .filter(([, count]) => count > 0)
                    .map(([type, count]) => `${CARD_TYPES[type].emoji} ${CARD_TYPES[type].label}: **${count}**`)
                    .join('\n') || 'لا توجد بطاقات مسحوبة',
                inline: true
            },
            {
                name: '👥 اللاعبين',
                value: `**${gameState.players.length}** لاعب شارك`,
                inline: true
            },
            {
                name: '🎴 البطاقات المسحوبة',
                value: `**${gameState.drawnCards.length}** بطاقة`,
                inline: true
            }
        )
        .setTimestamp();

    // إضافة تفاصيل كل سحبة
    if (gameState.drawnCards.length > 0) {
        const details = gameState.drawnCards
            .slice(-15)  // آخر 15 سحبة
            .map((d, i) => `\`${i + 1}\` <@${d.playerId}> ← ${CARD_TYPES[d.card.type]?.emoji || '❓'} **${d.card.name}**`)
            .join('\n');
        embed.addFields({ name: '📜 آخر السحبات', value: details, inline: false });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('game_new_round')
            .setLabel('🔄 جولة جديدة')
            .setStyle(ButtonStyle.Success)
    );

    return { embeds: [embed], components: [row] };
}

// ═══════════════════════════════════════════════════════════════
// ⏱️ مؤقت التنفيذ — لو انتهى يتخطى تلقائي
// ═══════════════════════════════════════════════════════════════
function startExecutionTimer() {
    // إلغاء أي مؤقت سابق
    clearExecutionTimer();

    if (!config.gameSettings.executionTimer || config.gameSettings.executionTimer <= 0) return;

    let timeLeft = config.gameSettings.executionTimer;

    gameState.timerInterval = setInterval(async () => {
        timeLeft--;

        if (timeLeft <= 0) {
            clearExecutionTimer();
            // تخطي تلقائي
            await skipToNextPlayer();
        }
    }, 1000);
}

function clearExecutionTimer() {
    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
        gameState.timerInterval = null;
    }
}

// ═══════════════════════════════════════════════════════════════
// ⏭️ الانتقال للاعب التالي
// ═══════════════════════════════════════════════════════════════
async function moveToNextPlayer() {
    clearExecutionTimer();

    // التحقق من وجود بطاقات
    if (gameState.availableCards.length === 0) {
        await endGame();
        return;
    }

    // الانتقال للاعب التالي
    gameState.currentPlayerIndex++;

    // لو وصلنا لآخر لاعب نرجع من البداية
    if (gameState.currentPlayerIndex >= gameState.players.length) {
        gameState.currentPlayerIndex = 0;
    }

    // تحديث رسالة اللعبة
    const turnData = buildPlayerTurnEmbed();
    if (turnData && gameState.gameMessage) {
        try {
            await gameState.gameMessage.edit(turnData);
        } catch (e) {
            // لو الرسالة انحذفت نرسل وحدة جديدة
            if (gameState.gameChannel) {
                gameState.gameMessage = await gameState.gameChannel.send(turnData);
            }
        }
    }

    // تشغيل المؤقت
    startExecutionTimer();

    // إرسال DM تذكير لو مفعّل
    if (config.gameSettings.dmReminder) {
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];
        try {
            const user = await client.users.fetch(currentPlayer.id);
            await user.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('🎴 دورك الآن!')
                        .setDescription(`دورك في روليت البطاقات! روح القناة واسحب بطاقتك 🃏`)
                        .setColor(0xFFD700)
                ]
            });
        } catch (e) {
            // المستخدم مقفل الـ DM
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// ⏭️ تخطي اللاعب الحالي
// ═══════════════════════════════════════════════════════════════
async function skipToNextPlayer() {
    if (!gameState.active || !gameState.gameChannel) return;

    try {
        const skippedPlayer = gameState.players[gameState.currentPlayerIndex];
        await gameState.gameChannel.send({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`⏭️ تم تخطي <@${skippedPlayer.id}> — انتهى الوقت!`)
                    .setColor(0x95A5A6)
            ]
        });
    } catch (e) { }

    await moveToNextPlayer();
}

// ═══════════════════════════════════════════════════════════════
// 🏁 إنهاء اللعبة
// ═══════════════════════════════════════════════════════════════
async function endGame() {
    clearExecutionTimer();
    gameState.active = false;
    gameState.phase = 'ended';

    if (gameState.gameChannel) {
        try {
            const summary = buildSummaryEmbed();
            await gameState.gameChannel.send(summary);
        } catch (e) { }
    }
}

// ═══════════════════════════════════════════════════════════════
// 🎬 أنيميشن سحب البطاقة (3-5 ثواني)
// ═══════════════════════════════════════════════════════════════
async function playDrawAnimation(channel, playerName) {
    const frames = [
        '🎴 جاري السحب .',
        '🎴 جاري السحب . .',
        '🎴 جاري السحب . . .',
        '🃏 البطاقة طلعت...',
    ];

    const animMsg = await channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle(frames[0])
                .setColor(0x2F3136)
                .setDescription(`🎲 ${playerName} يسحب بطاقة...`)
        ]
    });

    for (let i = 1; i < frames.length; i++) {
        await delay(1000);
        try {
            await animMsg.edit({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(frames[i])
                        .setColor(i === frames.length - 1 ? 0xFFD700 : 0x2F3136)
                        .setDescription(`🎲 ${playerName} يسحب بطاقة...`)
                ]
            });
        } catch (e) { }
    }

    await delay(1000);
    return animMsg;
}

// ═══════════════════════════════════════════════════════════════
// 📝 تسجيل الأوامر Slash
// ═══════════════════════════════════════════════════════════════
async function registerCommands() {
    const commands = [
        new SlashCommandBuilder()
            .setName('بدأ')
            .setDescription('🎴 بدء فعالية روليت البطاقات'),
        new SlashCommandBuilder()
            .setName('لوحة')
            .setDescription('🎛️ فتح لوحة تحكم الأدمن'),
        new SlashCommandBuilder()
            .setName('مساعدة')
            .setDescription('❓ عرض معلومات البوت والأوامر')
    ];

    const rest = new REST({ version: '10' }).setToken(config.token);

    try {
        console.log('📝 جاري تسجيل الأوامر...');
        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: commands.map(c => c.toJSON()) }
        );
        console.log('✅ تم تسجيل الأوامر بنجاح!');
    } catch (error) {
        console.error('❌ خطأ في تسجيل الأوامر:', error);
    }
}

// ═══════════════════════════════════════════════════════════════
// 🟢 عند تشغيل البوت
// ═══════════════════════════════════════════════════════════════
client.once('ready', async () => {
    console.log(`✅ البوت شغال: ${client.user.tag}`);

    // تعيين الستاتس
    client.user.setActivity(config.botStatus || '🎴 روليت البطاقات', {
        type: ActivityType.Playing
    });

    // تسجيل الأوامر
    await registerCommands();

    // إرسال لوحة الأدمن في القناة المخصصة
    try {
        const adminChannel = await client.channels.fetch(config.adminChannelId);
        if (adminChannel) {
            // حذف الرسائل القديمة للبوت
            const messages = await adminChannel.messages.fetch({ limit: 10 });
            const botMessages = messages.filter(m => m.author.id === client.user.id);
            for (const [, msg] of botMessages) {
                try { await msg.delete(); } catch (e) { }
            }

            // إرسال اللوحة الجديدة
            const panel = buildAdminPanel();
            gameState.adminPanelMessage = await adminChannel.send(panel);
            console.log('📋 تم إرسال لوحة الأدمن');
        }
    } catch (e) {
        console.error('❌ خطأ في إرسال لوحة الأدمن:', e.message);
    }
});

// ═══════════════════════════════════════════════════════════════
// 🎯 التعامل مع التفاعلات (أزرار، قوائم، نوافذ)
// ═══════════════════════════════════════════════════════════════
client.on('interactionCreate', async (interaction) => {
    try {
        // ─── أوامر Slash ───
        if (interaction.isChatInputCommand()) {
            await handleSlashCommand(interaction);
        }
        // ─── أزرار ───
        else if (interaction.isButton()) {
            await handleButton(interaction);
        }
        // ─── قوائم اختيار ───
        else if (interaction.isStringSelectMenu()) {
            await handleSelectMenu(interaction);
        }
        // ─── نوافذ Modal ───
        else if (interaction.isModalSubmit()) {
            await handleModal(interaction);
        }
    } catch (error) {
        console.error('❌ خطأ في التفاعل:', error);
        try {
            const reply = { content: '❌ حدث خطأ، حاول مرة ثانية.', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
            }
        } catch (e) { }
    }
});

// ═══════════════════════════════════════════════════════════════
// 🔧 التعامل مع أوامر Slash
// ═══════════════════════════════════════════════════════════════
async function handleSlashCommand(interaction) {
    const { commandName } = interaction;

    if (commandName === 'بدأ') {
        // ─── أمر بدء الفعالية ───
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ هذا الأمر للمسؤولين فقط!', ephemeral: true });
        }

        if (gameState.active) {
            return interaction.reply({ content: '❌ فيه لعبة شغالة بالفعل!', ephemeral: true });
        }

        // التحقق من وجود بطاقات كافية
        if (cardsData.cards.length === 0) {
            return interaction.reply({ content: '❌ لا توجد بطاقات! أضف بطاقات من لوحة الأدمن أولاً.', ephemeral: true });
        }

        // تجهيز اللعبة
        gameState = {
            ...gameState,
            active: true,
            paused: false,
            phase: 'registration',
            players: [],
            currentPlayerIndex: 0,
            availableCards: [],
            drawnCards: [],
            doubleMode: false,
            gameChannel: interaction.channel,
            gameMessage: null,
            registrationMessage: null,
            timerInterval: null
        };

        // إرسال embed التسجيل
        const regData = buildRegistrationEmbed(interaction.guild);
        await interaction.reply(regData);
        gameState.registrationMessage = await interaction.fetchReply();

    } else if (commandName === 'لوحة') {
        // ─── أمر فتح لوحة الأدمن ───
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ هذا الأمر للمسؤولين فقط!', ephemeral: true });
        }

        const panel = buildAdminPanel();
        await interaction.reply({ ...panel, ephemeral: true });

    } else if (commandName === 'مساعدة') {
        // ─── أمر المساعدة ───
        const helpEmbed = new EmbedBuilder()
            .setTitle('❓ مساعدة Card Roulette')
            .setDescription('بوت فعاليات البطاقات العشوائية')
            .setColor(0x3498DB)
            .addFields(
                { name: '🎴 `/بدأ`', value: 'بدء فعالية جديدة (للمسؤولين)', inline: true },
                { name: '🎛️ `/لوحة`', value: 'فتح لوحة التحكم (للمسؤولين)', inline: true },
                { name: '❓ `/مساعدة`', value: 'عرض هذه الرسالة', inline: true },
                {
                    name: '🎴 أنواع البطاقات',
                    value: Object.values(CARD_TYPES).map(t => `${t.emoji} **${t.label}**`).join('\n'),
                    inline: false
                }
            )
            .setFooter({ text: config.botBio || 'Card Roulette Bot' });

        await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    }
}

// ═══════════════════════════════════════════════════════════════
// 🔘 التعامل مع الأزرار
// ═══════════════════════════════════════════════════════════════
async function handleButton(interaction) {
    const customId = interaction.customId;

    // ══════════════════════════════════
    // 🔐 أزرار لوحة الأدمن
    // ══════════════════════════════════

    if (customId === 'admin_add_card') {
        // ─── إضافة بطاقة — أول خطوة: اختيار النوع ───
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_card_type_for_add')
            .setPlaceholder('اختر نوع البطاقة...')
            .addOptions(
                Object.entries(CARD_TYPES).map(([key, type]) => ({
                    label: type.label,
                    value: key,
                    emoji: type.emoji,
                    description: `إضافة بطاقة من نوع ${type.label}`
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.reply({
            content: '🎴 اختر نوع البطاقة الجديدة:',
            components: [row],
            ephemeral: true
        });

    } else if (customId === 'admin_view_cards') {
        // ─── عرض البطاقات ───
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }

        if (cardsData.cards.length === 0) {
            return interaction.reply({ content: '📦 لا توجد بطاقات حالياً!', ephemeral: true });
        }

        // تقسيم البطاقات حسب النوع
        const embeds = [];
        for (const [typeKey, typeInfo] of Object.entries(CARD_TYPES)) {
            const typeCards = cardsData.cards.filter(c => c.type === typeKey);
            if (typeCards.length === 0) continue;

            const embed = new EmbedBuilder()
                .setTitle(`${typeInfo.emoji} بطاقات ${typeInfo.label} (${typeCards.length})`)
                .setColor(typeInfo.color)
                .setDescription(
                    typeCards.map((c, i) => `\`${i + 1}\` **${c.name}**\n└ ${c.description}`).join('\n\n')
                );
            embeds.push(embed);
        }

        // إرسال حتى 10 embeds (حد ديسكورد)
        await interaction.reply({
            embeds: embeds.slice(0, 10),
            ephemeral: true
        });

    } else if (customId === 'admin_delete_card') {
        // ─── حذف بطاقة ───
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }

        if (cardsData.cards.length === 0) {
            return interaction.reply({ content: '📦 لا توجد بطاقات للحذف!', ephemeral: true });
        }

        // إنشاء قائمة اختيار بالبطاقات (حد 25)
        const options = cardsData.cards.slice(0, 25).map(card => {
            const typeInfo = CARD_TYPES[card.type] || CARD_TYPES.mystery;
            return {
                label: card.name.substring(0, 100),
                value: card.id,
                emoji: typeInfo.emoji,
                description: card.description.substring(0, 100)
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_card_delete')
            .setPlaceholder('اختر البطاقة للحذف...')
            .setMinValues(1)
            .setMaxValues(Math.min(options.length, 25))
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.reply({
            content: '🗑️ اختر البطاقات التي تريد حذفها:',
            components: [row],
            ephemeral: true
        });

    } else if (customId === 'admin_manage_admins') {
        // ─── إدارة المسؤولين ───
        if (interaction.user.id !== config.ownerId) {
            return interaction.reply({ content: '❌ فقط مالك البوت يقدر يدير المسؤولين!', ephemeral: true });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_admin_action')
            .setPlaceholder('اختر الإجراء...')
            .addOptions([
                { label: '➕ إضافة مسؤول', value: 'add_admin', emoji: '👑', description: 'إضافة مسؤول جديد' },
                { label: '➖ حذف مسؤول', value: 'remove_admin', emoji: '🚫', description: 'حذف مسؤول' },
                { label: '📋 عرض المسؤولين', value: 'list_admins', emoji: '📋', description: 'عرض قائمة المسؤولين' }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.reply({
            content: '👑 إدارة المسؤولين:',
            components: [row],
            ephemeral: true
        });

    } else if (customId === 'admin_bot_settings') {
        // ─── إعدادات البوت ───
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_bot_setting')
            .setPlaceholder('اختر الإعداد...')
            .addOptions([
                { label: '📝 تغيير اسم البوت', value: 'bot_name', emoji: '📝' },
                { label: '🎮 تغيير الستاتس', value: 'bot_status', emoji: '🎮' },
                { label: '📄 تغيير البايو', value: 'bot_bio', emoji: '📄' }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.reply({
            content: '⚙️ إعدادات البوت:',
            components: [row],
            ephemeral: true
        });

    } else if (customId === 'admin_game_settings') {
        // ─── إعدادات اللعبة ───
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_game_setting')
            .setPlaceholder('اختر الإعداد...')
            .addOptions([
                {
                    label: `🎯 عدد البطاقات (حالياً: ${config.gameSettings.cardCount})`,
                    value: 'card_count',
                    emoji: '🎯'
                },
                {
                    label: `🔇 وضع الكتمان (${config.gameSettings.muteMode ? 'مفعّل' : 'معطّل'})`,
                    value: 'mute_mode',
                    emoji: '🔇'
                },
                {
                    label: `⏱️ تايمر التنفيذ (${config.gameSettings.executionTimer}ث)`,
                    value: 'execution_timer',
                    emoji: '⏱️'
                },
                {
                    label: `📬 DM تذكير (${config.gameSettings.dmReminder ? 'مفعّل' : 'معطّل'})`,
                    value: 'dm_reminder',
                    emoji: '📬'
                },
                {
                    label: `📊 إحصائيات (${config.gameSettings.showStats ? 'مفعّل' : 'معطّل'})`,
                    value: 'show_stats',
                    emoji: '📊'
                },
                {
                    label: '📝 شرح الفعالية',
                    value: 'event_description',
                    emoji: '📝'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.reply({
            content: '🎮 إعدادات اللعبة:',
            components: [row],
            ephemeral: true
        });

    } else if (customId === 'admin_refresh_panel') {
        // ─── تحديث لوحة الأدمن ───
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }

        // تحديث الرسالة الحالية
        const panel = buildAdminPanel();
        try {
            await interaction.update(panel);
        } catch (e) {
            await interaction.reply({ ...panel, ephemeral: true });
        }

    } else if (customId === 'admin_reset_all') {
        // ─── إعادة تعيين البطاقات ───
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }

        // تأكيد
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_reset_yes')
                .setLabel('✅ نعم، إعادة تعيين')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('confirm_reset_no')
                .setLabel('❌ إلغاء')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({
            content: '⚠️ **هل أنت متأكد من إعادة تعيين جميع البطاقات؟** هذا الإجراء لا يمكن التراجع عنه!',
            components: [confirmRow],
            ephemeral: true
        });

    } else if (customId === 'confirm_reset_yes') {
        // تأكيد إعادة التعيين
        cardsData.cards = [];
        saveCards();

        await interaction.update({
            content: '✅ تم إعادة تعيين جميع البطاقات!',
            components: []
        });

        // تحديث لوحة الأدمن
        await refreshAdminPanel();

    } else if (customId === 'confirm_reset_no') {
        await interaction.update({
            content: '❌ تم إلغاء إعادة التعيين.',
            components: []
        });

    // ══════════════════════════════════
    // 🎮 أزرار اللعبة
    // ══════════════════════════════════

    } else if (customId === 'game_join') {
        // ─── انضمام لاعب ───
        if (gameState.phase !== 'registration') {
            return interaction.reply({ content: '❌ التسجيل مغلق!', ephemeral: true });
        }

        // التحقق هل اللاعب مسجل من قبل
        if (gameState.players.find(p => p.id === interaction.user.id)) {
            return interaction.reply({ content: '❌ أنت مسجل بالفعل!', ephemeral: true });
        }

        // إضافة اللاعب
        gameState.players.push({
            id: interaction.user.id,
            username: interaction.user.username,
            displayName: interaction.member?.displayName || interaction.user.username
        });

        // تحديث embed التسجيل
        const regData = buildRegistrationEmbed(interaction.guild);
        await interaction.update(regData);

    } else if (customId === 'game_leave') {
        // ─── انسحاب لاعب ───
        if (gameState.phase !== 'registration') {
            return interaction.reply({ content: '❌ لا يمكن الانسحاب الآن!', ephemeral: true });
        }

        const index = gameState.players.findIndex(p => p.id === interaction.user.id);
        if (index === -1) {
            return interaction.reply({ content: '❌ أنت غير مسجل!', ephemeral: true });
        }

        gameState.players.splice(index, 1);

        const regData = buildRegistrationEmbed(interaction.guild);
        await interaction.update(regData);

    } else if (customId === 'game_start') {
        // ─── بدء اللعبة (مسؤول فقط) ───
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ فقط المسؤول يقدر يبدأ اللعبة!', ephemeral: true });
        }

        if (gameState.phase !== 'registration') {
            return interaction.reply({ content: '❌ اللعبة مو في مرحلة التسجيل!', ephemeral: true });
        }

        if (gameState.players.length < 2) {
            return interaction.reply({ content: '❌ يحتاج على الأقل 2 لاعبين!', ephemeral: true });
        }

        // تجهيز البطاقات — خلط عشوائي
        const cardCount = Math.min(config.gameSettings.cardCount, cardsData.cards.length);
        if (cardCount === 0) {
            return interaction.reply({ content: '❌ لا توجد بطاقات متوفرة!', ephemeral: true });
        }

        // خلط البطاقات واختيار العدد المطلوب
        gameState.availableCards = shuffleArray([...cardsData.cards]).slice(0, cardCount);
        // خلط اللاعبين
        gameState.players = shuffleArray(gameState.players);
        gameState.currentPlayerIndex = 0;
        gameState.phase = 'playing';
        gameState.drawnCards = [];

        // إرسال رسالة البدء
        await interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🎮 اللعبة بدأت!')
                    .setDescription(`👥 **${gameState.players.length}** لاعب\n🎴 **${gameState.availableCards.length}** بطاقة`)
                    .setColor(0x2ECC71)
            ],
            components: []
        });

        // إرسال embed الدور الأول
        const turnData = buildPlayerTurnEmbed();
        gameState.gameMessage = await interaction.channel.send(turnData);

        // تشغيل المؤقت
        startExecutionTimer();

    } else if (customId === 'game_draw') {
        // ─── سحب بطاقة ───
        if (gameState.phase !== 'playing' || gameState.paused) {
            return interaction.reply({ content: '❌ اللعبة غير متاحة حالياً!', ephemeral: true });
        }

        const currentPlayer = gameState.players[gameState.currentPlayerIndex];

        // التحقق إن هذا دور اللاعب الصحيح
        if (interaction.user.id !== currentPlayer.id) {
            // التحقق هل هو مسجل أصلاً
            if (!gameState.players.find(p => p.id === interaction.user.id)) {
                return interaction.reply({ content: '❌ أنت غير مسجل في اللعبة!', ephemeral: true });
            }
            return interaction.reply({ content: '❌ مو دورك! انتظر دورك 😊', ephemeral: true });
        }

        // التحقق من وجود بطاقات
        if (gameState.availableCards.length === 0) {
            await endGame();
            return interaction.reply({ content: '❌ البطاقات خلصت!', ephemeral: true });
        }

        await interaction.deferUpdate();
        clearExecutionTimer();

        // أنيميشن السحب
        const animMsg = await playDrawAnimation(
            interaction.channel,
            currentPlayer.displayName || currentPlayer.username
        );

        // سحب البطاقة
        const drawnCard = gameState.availableCards.pop();

        // حذف البطاقة من البيانات الأصلية
        const originalIndex = cardsData.cards.findIndex(c => c.id === drawnCard.id);
        if (originalIndex !== -1) {
            cardsData.cards.splice(originalIndex, 1);
            saveCards();
        }

        // تسجيل السحبة
        gameState.drawnCards.push({
            playerId: currentPlayer.id,
            playerName: currentPlayer.displayName || currentPlayer.username,
            card: drawnCard,
            timestamp: Date.now()
        });

        // في وضع الضغط المضاعف — سحب بطاقة ثانية
        let secondCard = null;
        if (gameState.doubleMode && gameState.availableCards.length > 0) {
            secondCard = gameState.availableCards.pop();
            const secondOrigIndex = cardsData.cards.findIndex(c => c.id === secondCard.id);
            if (secondOrigIndex !== -1) {
                cardsData.cards.splice(secondOrigIndex, 1);
                saveCards();
            }
            gameState.drawnCards.push({
                playerId: currentPlayer.id,
                playerName: currentPlayer.displayName || currentPlayer.username,
                card: secondCard,
                timestamp: Date.now()
            });
        }

        // تحديث رسالة الأنيميشن بالبطاقة
        const cardEmbed = buildCardEmbed(drawnCard, currentPlayer.displayName || currentPlayer.username);
        const embeds = [cardEmbed];

        if (secondCard) {
            embeds.push(buildCardEmbed(secondCard, `${currentPlayer.displayName || currentPlayer.username} (x2)`));
        }

        try {
            await animMsg.edit({ embeds, components: [] });
        } catch (e) { }

        // ─── التعامل مع البطاقات الخاصة ───

        if (drawnCard.type === 'joker') {
            // 🃏 جوكر — اختيار شخص يسحب بدله
            const otherPlayers = gameState.players.filter(p => p.id !== currentPlayer.id);
            if (otherPlayers.length > 0) {
                const jokerSelect = new StringSelectMenuBuilder()
                    .setCustomId('joker_select_player')
                    .setPlaceholder('🃏 اختر شخص يسحب بدلك...')
                    .addOptions(
                        otherPlayers.slice(0, 25).map(p => ({
                            label: p.displayName || p.username,
                            value: p.id,
                            description: `اختر ${p.displayName || p.username}`
                        }))
                    );

                const jokerRow = new ActionRowBuilder().addComponents(jokerSelect);
                await interaction.channel.send({
                    content: `🃏 <@${currentPlayer.id}> سحب جوكر! اختر شخص يسحب بدلك:`,
                    components: [jokerRow]
                });
                return; // لا ننتقل للتالي — ننتظر الاختيار
            }

        } else if (drawnCard.type === 'swap') {
            // 🔄 مبادلة — اختيار شخص للمبادلة
            const otherWithCards = gameState.drawnCards
                .filter(d => d.playerId !== currentPlayer.id)
                .reduce((acc, d) => {
                    if (!acc.find(a => a.playerId === d.playerId)) {
                        acc.push(d);
                    }
                    return acc;
                }, []);

            if (otherWithCards.length > 0) {
                const swapSelect = new StringSelectMenuBuilder()
                    .setCustomId('swap_select_player')
                    .setPlaceholder('🔄 اختر شخص تبادله بطاقته...')
                    .addOptions(
                        otherWithCards.slice(0, 25).map(d => ({
                            label: d.playerName,
                            value: d.playerId,
                            description: `آخر بطاقة: ${d.card.name}`
                        }))
                    );

                const swapRow = new ActionRowBuilder().addComponents(swapSelect);
                await interaction.channel.send({
                    content: `🔄 <@${currentPlayer.id}> سحب بطاقة مبادلة! اختر شخص تبادله:`,
                    components: [swapRow]
                });
                return; // ننتظر الاختيار
            }
        }

        // تحديث embed الدور
        await updateGameMessage();

    } else if (customId === 'game_next') {
        // ─── الانتقال للتالي (مسؤول) ───
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }
        if (gameState.phase !== 'playing') {
            return interaction.reply({ content: '❌ اللعبة غير شغالة!', ephemeral: true });
        }

        await interaction.deferUpdate();
        await moveToNextPlayer();

    } else if (customId === 'game_skip') {
        // ─── تخطي (مسؤول) ───
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }
        if (gameState.phase !== 'playing') {
            return interaction.reply({ content: '❌ اللعبة غير شغالة!', ephemeral: true });
        }

        await interaction.deferUpdate();
        await skipToNextPlayer();

    } else if (customId === 'game_pause') {
        // ─── إيقاف/استمرار (مسؤول) ───
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }
        if (gameState.phase !== 'playing') {
            return interaction.reply({ content: '❌ اللعبة غير شغالة!', ephemeral: true });
        }

        gameState.paused = !gameState.paused;

        if (gameState.paused) {
            clearExecutionTimer();
            await interaction.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⏸️ اللعبة متوقفة مؤقتاً')
                        .setColor(0xF39C12)
                ]
            });
        } else {
            startExecutionTimer();
            await interaction.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('▶️ اللعبة مستمرة!')
                        .setColor(0x2ECC71)
                ]
            });
        }

        // تحديث الأزرار
        await updateGameMessage();
        try { await interaction.deferUpdate(); } catch (e) { }

    } else if (customId === 'game_double') {
        // ─── وضع الضغط المضاعف (مسؤول) ───
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }

        gameState.doubleMode = !gameState.doubleMode;

        await interaction.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle(gameState.doubleMode ? '⚡ وضع الضغط المضاعف مفعّل!' : '✖️ وضع الضغط المضاعف معطّل')
                    .setDescription(gameState.doubleMode ? 'اللاعب التالي يسحب بطاقتين!' : 'رجعنا لبطاقة وحدة')
                    .setColor(gameState.doubleMode ? 0xE74C3C : 0x95A5A6)
            ]
        });

        await updateGameMessage();
        try { await interaction.deferUpdate(); } catch (e) { }

    } else if (customId === 'game_end') {
        // ─── إنهاء اللعبة (مسؤول) ───
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }

        await interaction.deferUpdate();
        await endGame();

    } else if (customId === 'game_new_round') {
        // ─── جولة جديدة ───
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }

        // إعادة تعيين حالة اللعبة
        gameState = {
            ...gameState,
            active: true,
            paused: false,
            phase: 'registration',
            players: [],
            currentPlayerIndex: 0,
            availableCards: [],
            drawnCards: [],
            doubleMode: false,
            gameChannel: interaction.channel,
            timerInterval: null
        };

        const regData = buildRegistrationEmbed(interaction.guild);
        await interaction.update(regData);
        gameState.registrationMessage = await interaction.fetchReply();
    }
}

// ═══════════════════════════════════════════════════════════════
// 📋 التعامل مع قوائم الاختيار
// ═══════════════════════════════════════════════════════════════
async function handleSelectMenu(interaction) {
    const customId = interaction.customId;

    if (customId === 'select_card_type_for_add') {
        // ─── اختيار نوع البطاقة ثم فتح Modal ───
        const selectedType = interaction.values[0];

        const modal = new ModalBuilder()
            .setCustomId(`modal_add_card_${selectedType}`)
            .setTitle(`إضافة بطاقة — ${CARD_TYPES[selectedType].label}`);

        const nameInput = new TextInputBuilder()
            .setCustomId('card_name')
            .setLabel('اسم البطاقة')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('مثال: عيدية 100 ريال')
            .setRequired(true)
            .setMaxLength(100);

        const descInput = new TextInputBuilder()
            .setCustomId('card_description')
            .setLabel('وصف البطاقة')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('مثال: مبروك! ربحت عيدية 100 ريال 🎉')
            .setRequired(true)
            .setMaxLength(500);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(descInput)
        );

        await interaction.showModal(modal);

    } else if (customId === 'select_card_delete') {
        // ─── حذف البطاقات المختارة ───
        const selectedIds = interaction.values;
        let deleted = 0;

        for (const id of selectedIds) {
            const index = cardsData.cards.findIndex(c => c.id === id);
            if (index !== -1) {
                cardsData.cards.splice(index, 1);
                deleted++;
            }
        }

        saveCards();

        await interaction.update({
            content: `✅ تم حذف **${deleted}** بطاقة بنجاح!`,
            components: []
        });

        await refreshAdminPanel();

    } else if (customId === 'select_admin_action') {
        const action = interaction.values[0];

        if (action === 'add_admin') {
            // إضافة مسؤول — Modal لإدخال ID
            const modal = new ModalBuilder()
                .setCustomId('modal_add_admin')
                .setTitle('إضافة مسؤول جديد');

            const idInput = new TextInputBuilder()
                .setCustomId('admin_id')
                .setLabel('أدخل ID المسؤول الجديد')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('مثال: 123456789012345678')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(idInput));
            await interaction.showModal(modal);

        } else if (action === 'remove_admin') {
            if (config.admins.length === 0) {
                return interaction.update({ content: '📋 لا يوجد مسؤولين للحذف!', components: [] });
            }

            const options = [];
            for (const adminId of config.admins) {
                try {
                    const user = await client.users.fetch(adminId);
                    options.push({
                        label: user.username,
                        value: adminId,
                        description: `ID: ${adminId}`
                    });
                } catch (e) {
                    options.push({
                        label: `مسؤول (${adminId})`,
                        value: adminId
                    });
                }
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_admin_remove')
                .setPlaceholder('اختر المسؤول للحذف...')
                .addOptions(options);

            await interaction.update({
                content: '🚫 اختر المسؤول الذي تريد حذفه:',
                components: [new ActionRowBuilder().addComponents(selectMenu)]
            });

        } else if (action === 'list_admins') {
            let adminList = `👑 **المالك:** <@${config.ownerId}>\n\n`;

            if (config.admins.length > 0) {
                adminList += '👥 **المسؤولين:**\n';
                for (const adminId of config.admins) {
                    adminList += `• <@${adminId}>\n`;
                }
            } else {
                adminList += '*لا يوجد مسؤولين إضافيين*';
            }

            await interaction.update({
                content: adminList,
                components: []
            });
        }

    } else if (customId === 'select_admin_remove') {
        // حذف مسؤول
        const adminId = interaction.values[0];
        const index = config.admins.indexOf(adminId);

        if (index !== -1) {
            config.admins.splice(index, 1);
            saveConfig();

            await interaction.update({
                content: `✅ تم حذف المسؤول <@${adminId}> بنجاح!`,
                components: []
            });

            // نقل الصلاحيات للمسؤول التالي تلقائياً
            if (config.admins.length > 0) {
                console.log(`📋 المسؤول التالي: ${config.admins[0]}`);
            }
        }

        await refreshAdminPanel();

    } else if (customId === 'select_bot_setting') {
        const setting = interaction.values[0];

        const modal = new ModalBuilder()
            .setCustomId(`modal_bot_setting_${setting}`)
            .setTitle(
                setting === 'bot_name' ? 'تغيير اسم البوت' :
                setting === 'bot_status' ? 'تغيير الستاتس' :
                'تغيير البايو'
            );

        const input = new TextInputBuilder()
            .setCustomId('setting_value')
            .setLabel(
                setting === 'bot_name' ? 'الاسم الجديد' :
                setting === 'bot_status' ? 'الستاتس الجديد' :
                'البايو الجديد'
            )
            .setStyle(setting === 'bot_bio' ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setPlaceholder(
                setting === 'bot_name' ? config.botName :
                setting === 'bot_status' ? config.botStatus :
                config.botBio
            )
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);

    } else if (customId === 'select_game_setting') {
        const setting = interaction.values[0];

        if (setting === 'mute_mode') {
            // تبديل وضع الكتمان
            config.gameSettings.muteMode = !config.gameSettings.muteMode;
            saveConfig();
            await interaction.update({
                content: `✅ وضع الكتمان: **${config.gameSettings.muteMode ? '✅ مفعّل' : '❌ معطّل'}**`,
                components: []
            });
            await refreshAdminPanel();

        } else if (setting === 'dm_reminder') {
            // تبديل DM تذكير
            config.gameSettings.dmReminder = !config.gameSettings.dmReminder;
            saveConfig();
            await interaction.update({
                content: `✅ DM تذكير: **${config.gameSettings.dmReminder ? '✅ مفعّل' : '❌ معطّل'}**`,
                components: []
            });
            await refreshAdminPanel();

        } else if (setting === 'show_stats') {
            // تبديل الإحصائيات
            config.gameSettings.showStats = !config.gameSettings.showStats;
            saveConfig();
            await interaction.update({
                content: `✅ إحصائيات: **${config.gameSettings.showStats ? '✅ مفعّل' : '❌ معطّل'}**`,
                components: []
            });
            await refreshAdminPanel();

        } else {
            // فتح Modal للإعدادات الرقمية والنصية
            const modal = new ModalBuilder()
                .setCustomId(`modal_game_setting_${setting}`)
                .setTitle(
                    setting === 'card_count' ? 'تغيير عدد البطاقات' :
                    setting === 'execution_timer' ? 'تغيير تايمر التنفيذ' :
                    'تغيير شرح الفعالية'
                );

            const input = new TextInputBuilder()
                .setCustomId('setting_value')
                .setLabel(
                    setting === 'card_count' ? 'عدد البطاقات (رقم)' :
                    setting === 'execution_timer' ? 'التايمر بالثواني (رقم)' :
                    'شرح الفعالية'
                )
                .setStyle(setting === 'event_description' ? TextInputStyle.Paragraph : TextInputStyle.Short)
                .setPlaceholder(
                    setting === 'card_count' ? String(config.gameSettings.cardCount) :
                    setting === 'execution_timer' ? String(config.gameSettings.executionTimer) :
                    config.gameSettings.eventDescription || 'اكتب شرح الفعالية...'
                )
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }

    } else if (customId === 'joker_select_player') {
        // ─── 🃏 جوكر — اختيار اللاعب ───
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];

        // التحقق إن اللي اختار هو صاحب الجوكر
        if (interaction.user.id !== currentPlayer.id) {
            return interaction.reply({ content: '❌ مو أنت صاحب الجوكر!', ephemeral: true });
        }

        const selectedPlayerId = interaction.values[0];
        const selectedPlayerIndex = gameState.players.findIndex(p => p.id === selectedPlayerId);

        if (selectedPlayerIndex !== -1) {
            // تغيير الدور للاعب المختار
            gameState.currentPlayerIndex = selectedPlayerIndex;

            await interaction.update({
                content: `🃏 <@${currentPlayer.id}> اختار <@${selectedPlayerId}> يسحب بدله!`,
                components: []
            });

            // تحديث embed الدور
            await updateGameMessage();
            startExecutionTimer();
        }

    } else if (customId === 'swap_select_player') {
        // ─── 🔄 مبادلة — اختيار اللاعب ───
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];

        if (interaction.user.id !== currentPlayer.id) {
            return interaction.reply({ content: '❌ مو أنت صاحب بطاقة المبادلة!', ephemeral: true });
        }

        const selectedPlayerId = interaction.values[0];

        // إيجاد آخر بطاقة لكل لاعب
        const myLastDraw = [...gameState.drawnCards].reverse().find(d => d.playerId === currentPlayer.id);
        const theirLastDraw = [...gameState.drawnCards].reverse().find(d => d.playerId === selectedPlayerId);

        if (myLastDraw && theirLastDraw) {
            // المبادلة
            const tempCard = myLastDraw.card;
            myLastDraw.card = theirLastDraw.card;
            theirLastDraw.card = tempCard;

            const theirTypeInfo = CARD_TYPES[theirLastDraw.card.type] || CARD_TYPES.mystery;
            const myTypeInfo = CARD_TYPES[myLastDraw.card.type] || CARD_TYPES.mystery;

            await interaction.update({
                content: `🔄 تمت المبادلة!\n<@${currentPlayer.id}> حصل على: ${myTypeInfo.emoji} **${myLastDraw.card.name}**\n<@${selectedPlayerId}> حصل على: ${theirTypeInfo.emoji} **${theirLastDraw.card.name}**`,
                components: []
            });
        } else {
            await interaction.update({
                content: '❌ ما يقدر يتم المبادلة — أحد اللاعبين ما سحب بطاقة!',
                components: []
            });
        }

        // الانتقال للتالي
        await moveToNextPlayer();
    }
}

// ═══════════════════════════════════════════════════════════════
// 📝 التعامل مع نوافذ Modal
// ═══════════════════════════════════════════════════════════════
async function handleModal(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith('modal_add_card_')) {
        // ─── إضافة بطاقة جديدة ───
        const cardType = customId.replace('modal_add_card_', '');
        const cardName = interaction.fields.getTextInputValue('card_name');
        const cardDescription = interaction.fields.getTextInputValue('card_description');

        const newCard = {
            id: generateId(),
            name: cardName,
            type: cardType,
            description: cardDescription
        };

        cardsData.cards.push(newCard);
        saveCards();

        const typeInfo = CARD_TYPES[cardType];

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('✅ تم إضافة البطاقة!')
                    .setColor(typeInfo.color)
                    .addFields(
                        { name: '📝 الاسم', value: cardName, inline: true },
                        { name: '🎴 النوع', value: `${typeInfo.emoji} ${typeInfo.label}`, inline: true },
                        { name: '📄 الوصف', value: cardDescription, inline: false }
                    )
            ],
            ephemeral: true
        });

        await refreshAdminPanel();

    } else if (customId === 'modal_add_admin') {
        // ─── إضافة مسؤول ───
        const adminId = interaction.fields.getTextInputValue('admin_id').trim();

        // التحقق من صحة الـ ID
        if (!/^\d{17,20}$/.test(adminId)) {
            return interaction.reply({ content: '❌ ID غير صحيح! أدخل ID ديسكورد صحيح.', ephemeral: true });
        }

        if (config.admins.includes(adminId)) {
            return interaction.reply({ content: '❌ هذا المسؤول موجود بالفعل!', ephemeral: true });
        }

        if (adminId === config.ownerId) {
            return interaction.reply({ content: '❌ هذا هو مالك البوت!', ephemeral: true });
        }

        // التحقق من وجود المستخدم
        try {
            const user = await client.users.fetch(adminId);
            config.admins.push(adminId);
            saveConfig();

            await interaction.reply({
                content: `✅ تم إضافة **${user.username}** كمسؤول!`,
                ephemeral: true
            });
        } catch (e) {
            return interaction.reply({ content: '❌ لم يتم العثور على المستخدم!', ephemeral: true });
        }

        await refreshAdminPanel();

    } else if (customId.startsWith('modal_bot_setting_')) {
        // ─── إعدادات البوت ───
        const setting = customId.replace('modal_bot_setting_', '');
        const value = interaction.fields.getTextInputValue('setting_value');

        if (setting === 'bot_name') {
            config.botName = value;
            // تغيير اسم البوت في ديسكورد
            try {
                await client.user.setUsername(value);
            } catch (e) {
                // قد يفشل بسبب rate limit
                console.log('⚠️ لم يتم تغيير اسم البوت في ديسكورد (rate limit)');
            }
        } else if (setting === 'bot_status') {
            config.botStatus = value;
            client.user.setActivity(value, { type: ActivityType.Playing });
        } else if (setting === 'bot_bio') {
            config.botBio = value;
        }

        saveConfig();

        await interaction.reply({
            content: `✅ تم تحديث الإعداد بنجاح!\n**القيمة الجديدة:** ${value}`,
            ephemeral: true
        });

        await refreshAdminPanel();

    } else if (customId.startsWith('modal_game_setting_')) {
        // ─── إعدادات اللعبة ───
        const setting = customId.replace('modal_game_setting_', '');
        const value = interaction.fields.getTextInputValue('setting_value');

        if (setting === 'card_count') {
            const num = parseInt(value);
            if (isNaN(num) || num < 1 || num > 100) {
                return interaction.reply({ content: '❌ أدخل رقم صحيح بين 1 و 100!', ephemeral: true });
            }
            config.gameSettings.cardCount = num;

        } else if (setting === 'execution_timer') {
            const num = parseInt(value);
            if (isNaN(num) || num < 10 || num > 300) {
                return interaction.reply({ content: '❌ أدخل رقم بين 10 و 300 ثانية!', ephemeral: true });
            }
            config.gameSettings.executionTimer = num;

        } else if (setting === 'event_description') {
            config.gameSettings.eventDescription = value;
        }

        saveConfig();

        await interaction.reply({
            content: `✅ تم تحديث الإعداد بنجاح!`,
            ephemeral: true
        });

        await refreshAdminPanel();
    }
}

// ═══════════════════════════════════════════════════════════════
// 🔄 تحديث لوحة الأدمن
// ═══════════════════════════════════════════════════════════════
async function refreshAdminPanel() {
    if (!gameState.adminPanelMessage) return;

    try {
        const panel = buildAdminPanel();
        await gameState.adminPanelMessage.edit(panel);
    } catch (e) {
        // لو الرسالة انحذفت، نرسل وحدة جديدة
        try {
            const adminChannel = await client.channels.fetch(config.adminChannelId);
            if (adminChannel) {
                const panel = buildAdminPanel();
                gameState.adminPanelMessage = await adminChannel.send(panel);
            }
        } catch (err) {
            console.error('❌ خطأ في تحديث لوحة الأدمن:', err.message);
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// 🔄 تحديث رسالة اللعبة
// ═══════════════════════════════════════════════════════════════
async function updateGameMessage() {
    if (!gameState.gameMessage || !gameState.gameChannel) return;

    const turnData = buildPlayerTurnEmbed();
    if (!turnData) return;

    try {
        await gameState.gameMessage.edit(turnData);
    } catch (e) {
        // لو الرسالة انحذفت نرسل وحدة جديدة
        try {
            gameState.gameMessage = await gameState.gameChannel.send(turnData);
        } catch (err) { }
    }
}

// ═══════════════════════════════════════════════════════════════
// 👋 عند خروج عضو من السيرفر
// ═══════════════════════════════════════════════════════════════
client.on('guildMemberRemove', async (member) => {
    // لو العضو مسؤول، ننقل الصلاحيات
    const adminIndex = config.admins.indexOf(member.id);
    if (adminIndex !== -1) {
        config.admins.splice(adminIndex, 1);
        saveConfig();
        console.log(`👋 المسؤول ${member.user.tag} طلع من السيرفر — تم حذفه من القائمة`);

        // إشعار في قناة الأدمن
        try {
            const adminChannel = await client.channels.fetch(config.adminChannelId);
            if (adminChannel) {
                const nextAdmin = config.admins.length > 0 ? config.admins[0] : config.ownerId;
                await adminChannel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('⚠️ تنبيه — مسؤول طلع')
                            .setDescription(`المسؤول **${member.user.tag}** طلع من السيرفر.\nالصلاحيات انتقلت تلقائياً لـ <@${nextAdmin}>`)
                            .setColor(0xE74C3C)
                    ]
                });
            }
        } catch (e) { }

        await refreshAdminPanel();
    }

    // لو اللاعب في لعبة شغالة
    if (gameState.active) {
        const playerIndex = gameState.players.findIndex(p => p.id === member.id);
        if (playerIndex !== -1) {
            gameState.players.splice(playerIndex, 1);

            // تعديل المؤشر لو لزم
            if (gameState.currentPlayerIndex >= gameState.players.length) {
                gameState.currentPlayerIndex = 0;
            }

            // لو ما بقى لاعبين كافيين
            if (gameState.players.length < 2 && gameState.phase === 'playing') {
                await endGame();
            } else {
                await updateGameMessage();
            }
        }
    }
});

// ═══════════════════════════════════════════════════════════════
// 🚀 تشغيل البوت
// ═══════════════════════════════════════════════════════════════
console.log('🎴 جاري تشغيل Card Roulette...');
client.login(config.token).catch(err => {
    console.error('❌ فشل تسجيل الدخول:', err.message);
    console.log('📝 تأكد من صحة التوكن في config.json');
});
