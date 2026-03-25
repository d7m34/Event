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
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));
if (!fs.existsSync(cardsPath)) fs.writeFileSync(cardsPath, JSON.stringify({ cards: [] }, null, 2));
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
        name: 'عيدية',
        color: 0xFFD700,
        label: 'عيدية'
    },
    challenge: {
        name: 'تحدي',
        color: 0x3498DB,
        label: 'تحدي'
    },
    punishment: {
        name: 'عقوبة',
        color: 0xE74C3C,
        label: 'عقوبة'
    }
};

// ═══════════════════════════════════════════════════════════════
// 🎮 متغيرات حالة اللعبة
// ═══════════════════════════════════════════════════════════════
let gameState = {
    active: false,
    paused: false,
    phase: 'idle',
    players: [],
    currentPlayerIndex: 0,
    availableCards: [],
    drawnCards: [],
    doubleMode: false,
    gameChannel: null,
    gameMessage: null,
    registrationMessage: null,
    timerInterval: null,
    adminPanelMessage: null
};

// ═══════════════════════════════════════════════════════════════
// 🔧 دوال مساعدة
// ═══════════════════════════════════════════════════════════════

function isAdmin(userId) {
    return userId === process.env.OWNER_ID || config.admins.includes(userId);
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════
// 🔍 استخراج أول إيموجي من نص
// ═══════════════════════════════════════════════════════════════
function extractEmoji(text) {
    const customMatch = text.match(/<a?:\w+:\d+>/);
    if (customMatch) return customMatch[0];

    const emojiRegex = /(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*/u;
    const unicodeMatch = text.match(emojiRegex);
    if (unicodeMatch) return unicodeMatch[0];

    return null;
}

// ═══════════════════════════════════════════════════════════════
// 📋 بناء لوحة الأدمن (Embed + أزرار)
// ═══════════════════════════════════════════════════════════════
function buildAdminPanel() {
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
                name: 'أنواع البطاقات',
                value: Object.entries(CARD_TYPES).map(([key, t]) => {
                    const count = cardsData.cards.filter(c => c.type === key).length;
                    return `${t.label}: **${count}**`;
                }).join('\n'),
                inline: true
            }
        )
        .setFooter({ text: 'روليت البطاقات — لوحة التحكم' })
        .setTimestamp();

    const cardsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('admin_add_card')
            .setLabel('إضافة بطاقة')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('admin_view_cards')
            .setLabel('عرض البطاقات')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('admin_delete_card')
            .setLabel('حذف بطاقة')
            .setStyle(ButtonStyle.Danger)
    );

    const adminsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('admin_manage_admins')
            .setLabel('إدارة المسؤولين')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('admin_bot_settings')
            .setLabel('إعدادات البوت')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('admin_game_settings')
            .setLabel('إعدادات اللعبة')
            .setStyle(ButtonStyle.Secondary)
    );

    const extraRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('admin_refresh_panel')
            .setLabel('تحديث اللوحة')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('admin_reset_all')
            .setLabel('إعادة تعيين البطاقات')
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

    if (guild && guild.bannerURL()) {
        embed.setImage(guild.bannerURL({ size: 1024 }));
    } else if (guild && guild.iconURL()) {
        embed.setThumbnail(guild.iconURL({ size: 256 }));
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('game_join')
            .setLabel('انضم')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('game_leave')
            .setLabel('انسحب')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('game_start')
            .setLabel('ابدأ اللعبة')
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
        .setTitle(`دور اللاعب`)
        .setDescription(`<@${currentPlayer.id}>\n\nاسحب البطاقة الآن وادر العجلة`)
        .setColor(0x3498DB)
        .addFields(
            {
                name: 'التقدم',
                value: `تبقى **${remaining}/${total}** بطاقة`,
                inline: true
            },
            {
                name: 'الدور',
                value: `**${gameState.currentPlayerIndex + 1}/${gameState.players.length}**`,
                inline: true
            },
            {
                name: 'المؤقت',
                value: `**${config.gameSettings.executionTimer}** ثانية`,
                inline: true
            }
        )
        .setFooter({ text: gameState.doubleMode ? 'وضع الضغط المضاعف مفعّل!' : 'روليت البطاقات' })
        .setTimestamp();

    const playerRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('game_draw')
            .setLabel('دوّر العجلة')
            .setStyle(ButtonStyle.Primary)
    );

    const adminRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('game_next')
            .setLabel('التالي')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('game_skip')
            .setLabel('تخطي')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('game_pause')
            .setLabel(gameState.paused ? 'استمرار' : 'ايقاف')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('game_double')
            .setLabel(gameState.doubleMode ? 'الغاء x2' : 'x2 مضاعف')
            .setStyle(gameState.doubleMode ? ButtonStyle.Danger : ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('game_end')
            .setLabel('انهاء')
            .setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [playerRow, adminRow] };
}

// ═══════════════════════════════════════════════════════════════
// 🎴 بناء Embed البطاقة المسحوبة (مع دعم card.emoji)
// ═══════════════════════════════════════════════════════════════
function buildCardEmbed(card, playerName) {
    const cardType = CARD_TYPES[card.type] || CARD_TYPES.punishment;

    const typeDescriptions = {
        eidiya:     'حصلت على عيدية — شيء ايجابي لك!',
        challenge:  'تحدي — عليك تنفيذ هذا التحدي!',
        punishment: 'عقوبة — عليك تنفيذ هذه العقوبة!'
    };

    const cardTitle = card.emoji ? `${card.emoji} ${card.name}` : card.name;

    const embed = new EmbedBuilder()
        .setTitle(cardTitle)
        .setDescription(`**${typeDescriptions[card.type] || ''}**\n\n${card.description}`)
        .setColor(cardType.color)
        .addFields(
            { name: 'النوع', value: cardType.label, inline: true },
            { name: 'اللاعب', value: playerName, inline: true }
        )
        .setFooter({ text: 'روليت البطاقات' })
        .setTimestamp();

    return embed;
}

// ═══════════════════════════════════════════════════════════════
// 📊 بناء Embed الملخص النهائي
// ═══════════════════════════════════════════════════════════════
function buildSummaryEmbed() {
    const stats = {};
    for (const type of Object.keys(CARD_TYPES)) {
        stats[type] = gameState.drawnCards.filter(c => c.card.type === type).length;
    }

    const embed = new EmbedBuilder()
        .setTitle('انتهت الجولة — الملخص')
        .setColor(0xFFD700)
        .addFields(
            {
                name: '📊 إحصائيات البطاقات',
                value: Object.entries(stats)
                    .filter(([, count]) => count > 0)
                    .map(([type, count]) => `${CARD_TYPES[type].label}: **${count}**`)
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

    if (gameState.drawnCards.length > 0) {
        const details = gameState.drawnCards
            .slice(-15)
            .map((d, i) => {
                const emojiPrefix = d.card.emoji ? `${d.card.emoji} ` : '❓ ';
                return `\`${i + 1}\` <@${d.playerId}> ← ${emojiPrefix}**${d.card.name}**`;
            })
            .join('\n');
        embed.addFields({ name: '📜 آخر السحبات', value: details, inline: false });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('game_new_round')
            .setLabel('جولة جديدة')
            .setStyle(ButtonStyle.Success)
    );

    return { embeds: [embed], components: [row] };
}

// ═══════════════════════════════════════════════════════════════
// ⏱️ مؤقت التنفيذ
// ═══════════════════════════════════════════════════════════════
function startExecutionTimer() {
    clearExecutionTimer();

    if (!config.gameSettings.executionTimer || config.gameSettings.executionTimer <= 0) return;

    let timeLeft = config.gameSettings.executionTimer;

    gameState.timerInterval = setInterval(async () => {
        timeLeft--;

        if (timeLeft <= 0) {
            clearExecutionTimer();
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

    if (gameState.availableCards.length === 0) {
        await endGame();
        return;
    }

    gameState.currentPlayerIndex++;

    if (gameState.currentPlayerIndex >= gameState.players.length) {
        gameState.currentPlayerIndex = 0;
    }

    if (gameState.gameChannel) {
        await playPlayerRouletteAnimation(
            gameState.gameChannel,
            gameState.players,
            gameState.currentPlayerIndex
        );
    }

    const turnData = buildPlayerTurnEmbed();
    if (turnData && gameState.gameMessage) {
        try {
            await gameState.gameMessage.edit(turnData);
        } catch (e) {
            if (gameState.gameChannel) {
                gameState.gameMessage = await gameState.gameChannel.send(turnData);
            }
        }
    }

    startExecutionTimer();

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
        } catch (e) { }
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
                    .setDescription(`تم تخطي <@${skippedPlayer.id}> — انتهى الوقت!`)
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
// روليت 1 — اختيار اللاعب التالي
// ═══════════════════════════════════════════════════════════════
async function playPlayerRouletteAnimation(channel, players, resultIndex) {
    const resultPlayer = players[resultIndex];

    function buildRow(highlightIdx) {
        const visible = players.slice(0, Math.min(players.length, 6));
        return visible.map((p, i) => {
            const name = (p.displayName || p.username).substring(0, 10);
            return i === highlightIdx % visible.length ? `**[ ${name} ]**` : name;
        }).join('  •  ');
    }

    const animMsg = await channel.send({
        embeds: [new EmbedBuilder()
            .setTitle('عجلة الاختيار تدور...')
            .setDescription(`من سيكون اللاعب التالي؟\n\n${buildRow(0)}\n\n▲  ▲  ▲`)
            .setColor(0x2F3136).setFooter({ text: 'روليت البطاقات' })]
    });

    for (let i = 0; i < 10; i++) {
        await delay(200);
        try { await animMsg.edit({ embeds: [new EmbedBuilder()
            .setTitle('عجلة الاختيار تدور...')
            .setDescription(`من سيكون اللاعب التالي؟\n\n${buildRow(i)}\n\n▲  ▲  ▲`)
            .setColor(0x2F3136).setFooter({ text: 'روليت البطاقات' })] }); } catch(e) {}
    }

    const slowSpeeds = [350, 500, 700, 900, 1100];
    for (let s = 0; s < slowSpeeds.length; s++) {
        await delay(slowSpeeds[s]);
        try { await animMsg.edit({ embeds: [new EmbedBuilder()
            .setTitle('العجلة تتباطأ...')
            .setDescription(`من سيكون اللاعب التالي؟\n\n${buildRow(10 + s)}\n\n▲  ▲  ▲`)
            .setColor(0x5865F2).setFooter({ text: 'روليت البطاقات' })] }); } catch(e) {}
    }

    await delay(600);
    try { await animMsg.edit({ embeds: [new EmbedBuilder()
        .setTitle('تم الاختيار!')
        .setDescription(`**${resultPlayer.displayName || resultPlayer.username}**\n\nهذا دوره الآن — دوّر عجلة البطاقة!`)
        .setColor(0xFFD700).setFooter({ text: 'روليت البطاقات' })] }); } catch(e) {}

    await delay(800);
    return animMsg;
}

// ═══════════════════════════════════════════════════════════════
// روليت 2 — اختيار نوع البطاقة
// ═══════════════════════════════════════════════════════════════
async function playDrawAnimation(channel, playerName, resultType) {
    const allTypes = ['eidiya', 'challenge', 'punishment'];
    const segColors = { eidiya: '🟡', challenge: '🔵', punishment: '🔴' };
    const segLabels = { eidiya: 'عيدية', challenge: 'تحدي', punishment: 'عقوبة' };

    function buildCardRow(highlightType) {
        return allTypes.map(t =>
            t === highlightType
                ? `**[ ${segColors[t]} ${segLabels[t]} ]**`
                : `${segColors[t]} ${segLabels[t]}`
        ).join('  •  ');
    }

    const animMsg = await channel.send({
        embeds: [new EmbedBuilder()
            .setTitle('عجلة البطاقة تدور...')
            .setDescription(`${playerName} يدور العجلة\n\n${buildCardRow('eidiya')}\n\n▲  ▲  ▲`)
            .setColor(0x2F3136).setFooter({ text: 'روليت البطاقات' })]
    });

    const fastSeq = ['eidiya','challenge','punishment','eidiya','challenge','punishment','eidiya','challenge'];
    for (const pos of fastSeq) {
        await delay(300);
        try { await animMsg.edit({ embeds: [new EmbedBuilder()
            .setTitle('عجلة البطاقة تدور...')
            .setDescription(`${playerName} يدور العجلة\n\n${buildCardRow(pos)}\n\n▲  ▲  ▲`)
            .setColor(0x2F3136).setFooter({ text: 'روليت البطاقات' })] }); } catch(e) {}
    }

    const resultIdx = allTypes.indexOf(resultType) !== -1 ? allTypes.indexOf(resultType) : 0;
    const slowPath = [allTypes[(resultIdx+1)%3], allTypes[(resultIdx+2)%3], allTypes[resultIdx]];
    const slowSpeeds = [600, 900, 1200];

    for (let i = 0; i < slowPath.length; i++) {
        await delay(slowSpeeds[i]);
        try { await animMsg.edit({ embeds: [new EmbedBuilder()
            .setTitle('العجلة تتباطأ...')
            .setDescription(`${playerName} يدور العجلة\n\n${buildCardRow(slowPath[i])}\n\n▲  ▲  ▲`)
            .setColor(0x5865F2).setFooter({ text: 'روليت البطاقات' })] }); } catch(e) {}
    }

    const resultInfo = CARD_TYPES[resultType] || CARD_TYPES.punishment;
    await delay(600);
    try { await animMsg.edit({ embeds: [new EmbedBuilder()
        .setTitle('توقفت العجلة!')
        .setDescription(`${playerName}\n\n**${segColors[resultType] || '⚪'} ${segLabels[resultType] || resultType}**`)
        .setColor(resultInfo.color).setFooter({ text: 'روليت البطاقات' })] }); } catch(e) {}

    await delay(800);
    return animMsg;
}

// ═══════════════════════════════════════════════════════════════
// 📝 تسجيل الأوامر Slash
// ═══════════════════════════════════════════════════════════════
async function registerCommands() {
    const commands = [
        new SlashCommandBuilder()
            .setName('بدء')
            .setDescription('🎴 بدء فعالية روليت البطاقات'),
        new SlashCommandBuilder()
            .setName('لوحة')
            .setDescription('🎛️ فتح لوحة تحكم الأدمن'),
        new SlashCommandBuilder()
            .setName('مساعدة')
            .setDescription('❓ عرض معلومات البوت والأوامر'),
        new SlashCommandBuilder()
            .setName('إعادة')
            .setDescription('🔄 إعادة تعيين حالة اللعبة'),
        new SlashCommandBuilder()
            .setName('ايموجي')
            .setDescription('🎨 تعيين إيموجي لبطاقة معينة')
            .addStringOption(option =>
                option
                    .setName('بطاقة')
                    .setDescription('اختر البطاقة التي تريد تعيين إيموجي لها')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

    try {
        console.log('📝 جاري تسجيل الأوامر...');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
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

    client.user.setActivity(config.botStatus || '🎴 روليت البطاقات', {
        type: ActivityType.Playing
    });

    await registerCommands();

    try {
        const adminChannel = await client.channels.fetch(config.adminChannelId);
        if (adminChannel) {
            const messages = await adminChannel.messages.fetch({ limit: 10 });
            const botMessages = messages.filter(m => m.author.id === client.user.id);
            for (const [, msg] of botMessages) {
                try { await msg.delete(); } catch (e) { }
            }

            const panel = buildAdminPanel();
            gameState.adminPanelMessage = await adminChannel.send(panel);
            console.log('📋 تم إرسال لوحة الأدمن');
        }
    } catch (e) {
        console.error('❌ خطأ في إرسال لوحة الأدمن:', e.message);
    }
});

// ═══════════════════════════════════════════════════════════════
// 🎯 التعامل مع التفاعلات
// ═══════════════════════════════════════════════════════════════
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isAutocomplete()) {
            await handleAutocomplete(interaction);
        }
        else if (interaction.isChatInputCommand()) {
            await handleSlashCommand(interaction);
        }
        else if (interaction.isButton()) {
            await handleButton(interaction);
        }
        else if (interaction.isStringSelectMenu()) {
            await handleSelectMenu(interaction);
        }
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
// 🔍 التعامل مع Autocomplete
// ═══════════════════════════════════════════════════════════════
async function handleAutocomplete(interaction) {
    if (interaction.commandName === 'ايموجي') {
        const focusedValue = interaction.options.getFocused().toLowerCase();

        const filtered = cardsData.cards
            .filter(card => card.name.toLowerCase().includes(focusedValue))
            .slice(0, 25)
            .map(card => {
                const typeLabel = CARD_TYPES[card.type]?.label || card.type;
                const emojiIndicator = card.emoji ? `${card.emoji} ` : '';
                return {
                    name: `${emojiIndicator}${card.name} (${typeLabel})`.substring(0, 100),
                    value: card.id
                };
            });

        await interaction.respond(filtered);
    }
}

// ═══════════════════════════════════════════════════════════════
// 🔧 التعامل مع أوامر Slash
// ═══════════════════════════════════════════════════════════════
async function handleSlashCommand(interaction) {
    const { commandName } = interaction;

    if (commandName === 'بدء') {
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ هذا الأمر للمسؤولين فقط!', ephemeral: true });
        }

        if (gameState.active) {
            return interaction.reply({ content: '❌ فيه لعبة شغالة بالفعل!', ephemeral: true });
        }

        if (cardsData.cards.length === 0) {
            return interaction.reply({ content: '❌ لا توجد بطاقات! أضف بطاقات من لوحة الأدمن أولاً.', ephemeral: true });
        }

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

        const regData = buildRegistrationEmbed(interaction.guild);
        await interaction.reply(regData);
        gameState.registrationMessage = await interaction.fetchReply();

    } else if (commandName === 'لوحة') {
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ هذا الأمر للمسؤولين فقط!', ephemeral: true });
        }

        const panel = buildAdminPanel();
        await interaction.reply({ ...panel, ephemeral: true });

    } else if (commandName === 'مساعدة') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('❓ مساعدة Card Roulette')
            .setDescription('بوت فعاليات البطاقات العشوائية')
            .setColor(0x3498DB)
            .addFields(
                { name: '🎴 `/بدء`', value: 'بدء فعالية جديدة (للمسؤولين)', inline: true },
                { name: '🎛️ `/لوحة`', value: 'فتح لوحة التحكم (للمسؤولين)', inline: true },
                { name: '🎨 `/ايموجي`', value: 'تعيين إيموجي لبطاقة (للمسؤولين)', inline: true },
                { name: '❓ `/مساعدة`', value: 'عرض هذه الرسالة', inline: true },
                {
                    name: '🎴 أنواع البطاقات',
                    value: Object.values(CARD_TYPES).map(t => `**${t.label}**`).join('\n'),
                    inline: false
                }
            )
            .setFooter({ text: config.botBio || 'Card Roulette Bot' });

        await interaction.reply({ embeds: [helpEmbed], ephemeral: true });

    } else if (commandName === 'إعادة') {
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }
        clearExecutionTimer();
        gameState.active = false;
        gameState.phase = 'idle';
        gameState.players = [];
        gameState.gameMessage = null;
        gameState.registrationMessage = null;
        gameState.timerInterval = null;
        await interaction.reply({ content: '✅ تم إعادة تعيين اللعبة! استخدم /بدء لبدء جولة جديدة.', ephemeral: true });

    } else if (commandName === 'ايموجي') {
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ هذا الأمر للمسؤولين فقط!', ephemeral: true });
        }

        const cardId = interaction.options.getString('بطاقة');

        const card = cardsData.cards.find(c => c.id === cardId);
        if (!card) {
            return interaction.reply({ content: '❌ لم يتم العثور على البطاقة! تأكد من اختيار بطاقة صحيحة.', ephemeral: true });
        }

        const currentEmoji = card.emoji ? ` (الإيموجي الحالي: ${card.emoji})` : '';

        await interaction.reply({
            content: `🎨 أرسل الإيموجي الذي تريده للبطاقة **${card.name}**${currentEmoji}\n\n⏱️ عندك **30 ثانية** لإرسال الإيموجي...`,
            ephemeral: true
        });

        const filter = (msg) => msg.author.id === interaction.user.id;

        try {
            const collected = await interaction.channel.awaitMessages({
                filter,
                max: 1,
                time: 30000,
                errors: ['time']
            });

            const message = collected.first();
            const emoji = extractEmoji(message.content);

            try { await message.delete(); } catch (e) { }

            if (!emoji) {
                return interaction.followUp({
                    content: '❌ لم يتم العثور على إيموجي في رسالتك! أرسل إيموجي صحيح (Unicode أو إيموجي سيرفر).',
                    ephemeral: true
                });
            }

            card.emoji = emoji;
            saveCards();

            await interaction.followUp({
                content: `✅ تم تحديث إيموجي البطاقة **${card.name}** إلى ${emoji}`,
                ephemeral: true
            });

        } catch (err) {
            await interaction.followUp({
                content: '⏱️ انتهى الوقت! لم يتم تعيين إيموجي. استخدم الأمر مرة ثانية.',
                ephemeral: true
            });
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// 🔘 التعامل مع الأزرار
// ═══════════════════════════════════════════════════════════════
async function handleButton(interaction) {
    const customId = interaction.customId;

    if (customId === 'admin_add_card') {
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
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }

        if (cardsData.cards.length === 0) {
            return interaction.reply({ content: '📦 لا توجد بطاقات حالياً!', ephemeral: true });
        }

        const embeds = [];
        for (const [typeKey, typeInfo] of Object.entries(CARD_TYPES)) {
            const typeCards = cardsData.cards.filter(c => c.type === typeKey);
            if (typeCards.length === 0) continue;

            const embed = new EmbedBuilder()
                .setTitle(`بطاقات ${typeInfo.label} (${typeCards.length})`)
                .setColor(typeInfo.color)
                .setDescription(
                    typeCards.map((c, i) => {
                        const emojiPrefix = c.emoji ? `${c.emoji} ` : '';
                        return `\`${i + 1}\` ${emojiPrefix}**${c.name}**\n└ ${c.description}`;
                    }).join('\n\n')
                );
            embeds.push(embed);
        }

        await interaction.reply({
            embeds: embeds.slice(0, 10),
            ephemeral: true
        });

    } else if (customId === 'admin_delete_card') {
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }

        if (cardsData.cards.length === 0) {
            return interaction.reply({ content: '📦 لا توجد بطاقات للحذف!', ephemeral: true });
        }

        const options = cardsData.cards.slice(0, 25).map(card => {
            return {
                label: card.name.substring(0, 100),
                value: card.id,
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
        if (interaction.user.id !== process.env.OWNER_ID) {
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
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_bot_setting')
            .setPlaceholder('اختر الإعداد...')
            .addOptions([
                { label: '📝 تغيير اسم البوت', value: 'bot_name', emoji: '📝' },
                { label: '🎮 تغيير الستاتس', value: 'bot_status', emoji: '🎮' },
                { label: '📄 تغيير البايو', value: 'bot_bio', emoji: '📄' },
                { label: '🖼️ تغيير أفتار البوت', value: 'bot_avatar', emoji: '🖼️' },
                { label: '🎨 تغيير بنر البوت', value: 'bot_banner', emoji: '🎨' },
                { label: '📢 تغيير قناة الأدمن', value: 'admin_channel', emoji: '📢' }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.reply({
            content: '⚙️ إعدادات البوت:',
            components: [row],
            ephemeral: true
        });

    } else if (customId === 'admin_game_settings') {
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
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }

        const panel = buildAdminPanel();
        try {
            await interaction.update(panel);
        } catch (e) {
            await interaction.reply({ ...panel, ephemeral: true });
        }

    } else if (customId === 'admin_reset_all') {
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }

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
        cardsData.cards = [];
        saveCards();

        await interaction.update({
            content: '✅ تم إعادة تعيين جميع البطاقات!',
            components: []
        });

        await refreshAdminPanel();

    } else if (customId === 'confirm_reset_no') {
        await interaction.update({
            content: '❌ تم إلغاء إعادة التعيين.',
            components: []
        });

    } else if (customId === 'game_join') {
        if (gameState.phase !== 'registration') {
            return interaction.reply({ content: '❌ التسجيل مغلق!', ephemeral: true });
        }

        if (gameState.players.find(p => p.id === interaction.user.id)) {
            return interaction.reply({ content: '❌ أنت مسجل بالفعل!', ephemeral: true });
        }

        gameState.players.push({
            id: interaction.user.id,
            username: interaction.user.username,
            displayName: interaction.member?.displayName || interaction.user.username
        });

        const regData = buildRegistrationEmbed(interaction.guild);
        await interaction.update(regData);

    } else if (customId === 'game_leave') {
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
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ فقط المسؤول يقدر يبدأ اللعبة!', ephemeral: true });
        }

        if (gameState.phase !== 'registration') {
            return interaction.reply({ content: '❌ اللعبة مو في مرحلة التسجيل!', ephemeral: true });
        }

        if (gameState.players.length < 2) {
            return interaction.reply({ content: '❌ يحتاج على الأقل 2 لاعبين!', ephemeral: true });
        }

        const cardCount = Math.min(config.gameSettings.cardCount, cardsData.cards.length);
        if (cardCount === 0) {
            return interaction.reply({ content: '❌ لا توجد بطاقات متوفرة!', ephemeral: true });
        }

        gameState.availableCards = shuffleArray([...cardsData.cards]).slice(0, cardCount);
        gameState.players = shuffleArray(gameState.players);
        gameState.currentPlayerIndex = 0;
        gameState.phase = 'playing';
        gameState.drawnCards = [];

        await interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setTitle('اللعبة بدأت!')
                    .setDescription(`عدد اللاعبين: **${gameState.players.length}**\nعدد البطاقات: **${gameState.availableCards.length}**`)
                    .setColor(0x2ECC71)
            ],
            components: []
        });

        await playPlayerRouletteAnimation(
            interaction.channel,
            gameState.players,
            gameState.currentPlayerIndex
        );

        const turnData = buildPlayerTurnEmbed();
        gameState.gameMessage = await interaction.channel.send(turnData);

        startExecutionTimer();

    } else if (customId === 'game_draw') {
        if (gameState.phase !== 'playing' || gameState.paused) {
            return interaction.reply({ content: '❌ اللعبة غير متاحة حالياً!', ephemeral: true });
        }

        const currentPlayer = gameState.players[gameState.currentPlayerIndex];

        if (interaction.user.id !== currentPlayer.id) {
            if (!gameState.players.find(p => p.id === interaction.user.id)) {
                return interaction.reply({ content: '❌ أنت غير مسجل في اللعبة!', ephemeral: true });
            }
            return interaction.reply({ content: '❌ مو دورك! انتظر دورك 😊', ephemeral: true });
        }

        if (gameState.availableCards.length === 0) {
            await endGame();
            return interaction.reply({ content: '❌ البطاقات خلصت!', ephemeral: true });
        }

        await interaction.deferUpdate();
        clearExecutionTimer();

        const drawnCard = gameState.availableCards.pop();

        const animMsg = await playDrawAnimation(
            interaction.channel,
            currentPlayer.displayName || currentPlayer.username,
            drawnCard.type
        );

        const originalIndex = cardsData.cards.findIndex(c => c.id === drawnCard.id);
        if (originalIndex !== -1) {
            cardsData.cards.splice(originalIndex, 1);
            saveCards();
        }

        gameState.drawnCards.push({
            playerId: currentPlayer.id,
            playerName: currentPlayer.displayName || currentPlayer.username,
            card: drawnCard,
            timestamp: Date.now()
        });

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

        const cardEmbed = buildCardEmbed(drawnCard, currentPlayer.displayName || currentPlayer.username);
        const embeds = [cardEmbed];

        if (secondCard) {
            embeds.push(buildCardEmbed(secondCard, `${currentPlayer.displayName || currentPlayer.username} (x2)`));
        }

        try {
            await animMsg.edit({ embeds, components: [] });
        } catch (e) { }

        await updateGameMessage();

    } else if (customId === 'game_next') {
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }
        if (gameState.phase !== 'playing') {
            return interaction.reply({ content: '❌ اللعبة غير شغالة!', ephemeral: true });
        }

        await interaction.deferUpdate();
        await moveToNextPlayer();

    } else if (customId === 'game_skip') {
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }
        if (gameState.phase !== 'playing') {
            return interaction.reply({ content: '❌ اللعبة غير شغالة!', ephemeral: true });
        }

        await interaction.deferUpdate();
        await skipToNextPlayer();

    } else if (customId === 'game_pause') {
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
                        .setTitle('اللعبة متوقفة مؤقتاً')
                        .setColor(0xF39C12)
                ]
            });
        } else {
            startExecutionTimer();
            await interaction.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('اللعبة مستمرة!')
                        .setColor(0x2ECC71)
                ]
            });
        }

        await updateGameMessage();
        try { await interaction.deferUpdate(); } catch (e) { }

    } else if (customId === 'game_double') {
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
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }

        await interaction.deferUpdate();
        await endGame();

    } else if (customId === 'game_new_round') {
        if (!isAdmin(interaction.user.id)) {
            return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        }

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
            let adminList = `👑 **المالك:** <@${process.env.OWNER_ID}>\n\n`;

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
        const adminId = interaction.values[0];
        const index = config.admins.indexOf(adminId);

        if (index !== -1) {
            config.admins.splice(index, 1);
            saveConfig();

            await interaction.update({
                content: `✅ تم حذف المسؤول <@${adminId}> بنجاح!`,
                components: []
            });

            if (config.admins.length > 0) {
                console.log(`📋 المسؤول التالي: ${config.admins[0]}`);
            }
        }

        await refreshAdminPanel();

    } else if (customId === 'select_bot_setting') {
        const setting = interaction.values[0];

        // ─── الأفتار والبنر وقناة الأدمن ───
        if (setting === 'bot_avatar' || setting === 'bot_banner' || setting === 'admin_channel') {
            const modal = new ModalBuilder()
                .setCustomId(`modal_bot_setting_${setting}`)
                .setTitle(
                    setting === 'bot_avatar' ? 'تغيير أفتار البوت' :
                    setting === 'bot_banner' ? 'تغيير بنر البوت' :
                    'تغيير قناة الأدمن'
                );

            const input = new TextInputBuilder()
                .setCustomId('setting_value')
                .setLabel(
                    setting === 'bot_avatar' ? 'رابط صورة الأفتار' :
                    setting === 'bot_banner' ? 'رابط صورة البنر' :
                    'أدخل ID القناة الجديدة'
                )
                .setStyle(TextInputStyle.Short)
                .setPlaceholder(
                    setting === 'bot_avatar' ? 'https://example.com/avatar.png' :
                    setting === 'bot_banner' ? 'https://example.com/banner.png' :
                    'مثال: 123456789012345678'
                )
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return;
        }

        // ─── باقي الإعدادات (الاسم، الستاتس، البايو) ───
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
            config.gameSettings.muteMode = !config.gameSettings.muteMode;
            saveConfig();
            await interaction.update({
                content: `✅ وضع الكتمان: **${config.gameSettings.muteMode ? '✅ مفعّل' : '❌ معطّل'}**`,
                components: []
            });
            await refreshAdminPanel();

        } else if (setting === 'dm_reminder') {
            config.gameSettings.dmReminder = !config.gameSettings.dmReminder;
            saveConfig();
            await interaction.update({
                content: `✅ DM تذكير: **${config.gameSettings.dmReminder ? '✅ مفعّل' : '❌ معطّل'}**`,
                components: []
            });
            await refreshAdminPanel();

        } else if (setting === 'show_stats') {
            config.gameSettings.showStats = !config.gameSettings.showStats;
            saveConfig();
            await interaction.update({
                content: `✅ إحصائيات: **${config.gameSettings.showStats ? '✅ مفعّل' : '❌ معطّل'}**`,
                components: []
            });
            await refreshAdminPanel();

        } else {
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
    }
}

// ═══════════════════════════════════════════════════════════════
// 📝 التعامل مع نوافذ Modal
// ═══════════════════════════════════════════════════════════════
async function handleModal(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith('modal_add_card_')) {
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
                        { name: '🎴 النوع', value: `${typeInfo.label}`, inline: true },
                        { name: '📄 الوصف', value: cardDescription, inline: false }
                    )
            ],
            ephemeral: true
        });

        await refreshAdminPanel();

    } else if (customId === 'modal_add_admin') {
        const adminId = interaction.fields.getTextInputValue('admin_id').trim();

        if (!/^\d{17,20}$/.test(adminId)) {
            return interaction.reply({ content: '❌ ID غير صحيح! أدخل ID ديسكورد صحيح.', ephemeral: true });
        }

        if (config.admins.includes(adminId)) {
            return interaction.reply({ content: '❌ هذا المسؤول موجود بالفعل!', ephemeral: true });
        }

        if (adminId === process.env.OWNER_ID) {
            return interaction.reply({ content: '❌ هذا هو مالك البوت!', ephemeral: true });
        }

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
        const setting = customId.replace('modal_bot_setting_', '');
        const value = interaction.fields.getTextInputValue('setting_value').trim();

        if (setting === 'bot_name') {
            config.botName = value;
            try {
                await client.user.setUsername(value);
            } catch (e) {
                console.log('⚠️ لم يتم تغيير اسم البوت في ديسكورد (rate limit)');
            }
            saveConfig();
            await interaction.reply({
                content: `✅ تم تغيير اسم البوت إلى: **${value}**`,
                ephemeral: true
            });

        } else if (setting === 'bot_status') {
            config.botStatus = value;
            client.user.setActivity(value, { type: ActivityType.Playing });
            saveConfig();
            await interaction.reply({
                content: `✅ تم تغيير الستاتس إلى: **${value}**`,
                ephemeral: true
            });

        } else if (setting === 'bot_bio') {
            config.botBio = value;
            saveConfig();
            await interaction.reply({
                content: `✅ تم تغيير البايو إلى: **${value}**`,
                ephemeral: true
            });

        } else if (setting === 'bot_avatar') {
            try {
                await client.user.setAvatar(value);
                await interaction.reply({
                    content: `✅ تم تغيير أفتار البوت بنجاح!`,
                    ephemeral: true
                });
            } catch (e) {
                await interaction.reply({
                    content: `❌ فشل تغيير الأفتار!\n**السبب:** ${e.message}\n\n💡 تأكد أن الرابط صحيح وينتهي بـ .png أو .jpg أو .gif\n⏱️ ديسكورد يسمح بتغيير الأفتار مرتين كل ساعة`,
                    ephemeral: true
                });
            }

        } else if (setting === 'bot_banner') {
            try {
                await client.user.setBanner(value);
                await interaction.reply({
                    content: `✅ تم تغيير بنر البوت بنجاح!`,
                    ephemeral: true
                });
            } catch (e) {
                await interaction.reply({
                    content: `❌ فشل تغيير البنر!\n**السبب:** ${e.message}\n\n💡 تأكد أن الرابط صحيح وينتهي بـ .png أو .jpg`,
                    ephemeral: true
                });
            }

        } else if (setting === 'admin_channel') {
            if (!/^\d{17,20}$/.test(value)) {
                return interaction.reply({
                    content: '❌ ID القناة غير صحيح! أدخل ID قناة صحيح.',
                    ephemeral: true
                });
            }

            try {
                const newChannel = await client.channels.fetch(value);

                if (!newChannel || !newChannel.isTextBased()) {
                    return interaction.reply({
                        content: '❌ القناة غير موجودة أو ليست قناة نصية!',
                        ephemeral: true
                    });
                }

                if (gameState.adminPanelMessage) {
                    try { await gameState.adminPanelMessage.delete(); } catch (e) { }
                }

                const oldChannelId = config.adminChannelId;
                config.adminChannelId = value;
                saveConfig();

                const panel = buildAdminPanel();
                gameState.adminPanelMessage = await newChannel.send(panel);

                await interaction.reply({
                    content: `✅ تم نقل قناة الأدمن!\n\n📢 **القناة القديمة:** <#${oldChannelId}>\n📢 **القناة الجديدة:** <#${value}>\n\n📋 تم إرسال لوحة التحكم في القناة الجديدة.`,
                    ephemeral: true
                });

            } catch (e) {
                await interaction.reply({
                    content: `❌ فشل تغيير القناة!\n**السبب:** ${e.message}\n\n💡 تأكد أن ID القناة صحيح والبوت يقدر يرسل فيها.`,
                    ephemeral: true
                });
            }
        }

        await refreshAdminPanel();

    } else if (customId.startsWith('modal_game_setting_')) {
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
        try {
            gameState.gameMessage = await gameState.gameChannel.send(turnData);
        } catch (err) { }
    }
}

// ═══════════════════════════════════════════════════════════════
// 👋 عند خروج عضو من السيرفر
// ═══════════════════════════════════════════════════════════════
client.on('guildMemberRemove', async (member) => {
    const adminIndex = config.admins.indexOf(member.id);
    if (adminIndex !== -1) {
        config.admins.splice(adminIndex, 1);
        saveConfig();
        console.log(`👋 المسؤول ${member.user.tag} طلع من السيرفر — تم حذفه من القائمة`);

        try {
            const adminChannel = await client.channels.fetch(config.adminChannelId);
            if (adminChannel) {
                const nextAdmin = config.admins.length > 0 ? config.admins[0] : process.env.OWNER_ID;
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

    if (gameState.active) {
        const playerIndex = gameState.players.findIndex(p => p.id === member.id);
        if (playerIndex !== -1) {
            gameState.players.splice(playerIndex, 1);

            if (gameState.currentPlayerIndex >= gameState.players.length) {
                gameState.currentPlayerIndex = 0;
            }

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
client.login(process.env.BOT_TOKEN).catch(err => {
    console.error('❌ فشل تسجيل الدخول:', err.message);
    console.log('📝 تأكد من صحة BOT_TOKEN في متغيرات البيئة');
});
