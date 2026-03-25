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

const configPath = path.join(__dirname, 'config.json');
const cardsPath = path.join(__dirname, 'data', 'cards.json');

let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));
if (!fs.existsSync(cardsPath)) fs.writeFileSync(cardsPath, JSON.stringify({ cards: [] }, null, 2));
let cardsData = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));

function saveConfig() { fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8'); }
function saveCards() { fs.writeFileSync(cardsPath, JSON.stringify(cardsData, null, 2), 'utf8'); }

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel, Partials.Message]
});

const CARD_TYPES = {
    eidiya: { name: 'عيدية', color: 0xFFD700, label: 'عيدية' },
    challenge: { name: 'تحدي', color: 0x3498DB, label: 'تحدي' },
    punishment: { name: 'عقوبة', color: 0xE74C3C, label: 'عقوبة' }
};

let gameState = {
    active: false, paused: false, phase: 'idle', players: [], currentPlayerIndex: 0,
    availableCards: [], drawnCards: [], doubleMode: false, gameChannel: null,
    gameMessage: null, registrationMessage: null, timerInterval: null, adminPanelMessage: null,
    currentPlayerDrew: false, initialEidiyaCount: 0,
    // ═══ جديد: تتبع رسالة التحدي للأدمن ═══
    challengeAdminMessage: null, pendingChallengePlayer: null, pendingChallengeCard: null
};

let broadcastState = {
    active: false, stopped: false, totalMembers: 0, sent: 0, failed: 0,
    remaining: 0, failedMembers: [], statusMessage: null, lastMessage: null, lastEmbed: null
};

function isAdmin(userId) { return userId === process.env.OWNER_ID || config.admins.includes(userId); }

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    return shuffled;
}

function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function extractEmoji(text) {
    const customMatch = text.match(/<a?:\w+:\d+>/);
    if (customMatch) return customMatch[0];
    const emojiRegex = /(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*/u;
    const unicodeMatch = text.match(emojiRegex);
    if (unicodeMatch) return unicodeMatch[0];
    return null;
}

function buildProgressBar(current, total, length = 20) {
    if (total === 0) return '░'.repeat(length) + ' 0%';
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty) + ` ${percentage}%`;
}

function getRemainingEidiyaCount() {
    return gameState.availableCards.filter(c => c.type === 'eidiya').length;
}

function buildBroadcastStatusEmbed() {
    const { totalMembers, sent, failed, remaining, active, stopped } = broadcastState;
    const processed = sent + failed;
    let statusText = '🔄 جاري الإرسال...';
    let statusColor = 0x3498DB;
    if (stopped) { statusText = '⏹️ تم إيقاف الإرسال'; statusColor = 0xE74C3C; }
    else if (!active && processed > 0) { statusText = '✅ اكتمل الإرسال'; statusColor = 0x2ECC71; }

    const embed = new EmbedBuilder()
        .setTitle('📢 بودكاست — إحصائيات الإرسال').setDescription(statusText).setColor(statusColor)
        .addFields(
            { name: '📊 التقدم', value: buildProgressBar(processed, totalMembers), inline: false },
            { name: '👥 إجمالي الأعضاء', value: `**${totalMembers}**`, inline: true },
            { name: '✅ نجح', value: `**${sent}**`, inline: true },
            { name: '❌ فشل', value: `**${failed}**`, inline: true },
            { name: '⏳ متبقي', value: `**${remaining}**`, inline: true },
            { name: '📬 معدل النجاح', value: processed > 0 ? `**${Math.round((sent / processed) * 100)}%**` : '**—**', inline: true }
        ).setFooter({ text: 'روليت البطاقات — نظام البودكاست' }).setTimestamp();

    const components = [];
    if (active && !stopped) {
        components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('broadcast_stop').setLabel('⏹️ إيقاف الإرسال').setStyle(ButtonStyle.Danger)));
    } else if (!active && failed > 0) {
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('broadcast_retry').setLabel(`🔄 إعادة المحاولة (${failed})`).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('broadcast_dismiss').setLabel('✖️ إغلاق').setStyle(ButtonStyle.Secondary)
        ));
    } else if (!active) {
        components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('broadcast_dismiss').setLabel('✖️ إغلاق').setStyle(ButtonStyle.Secondary)));
    }
    return { embeds: [embed], components };
}

async function sendBroadcast(channel, members, embedToSend) {
    broadcastState.active = true; broadcastState.stopped = false; broadcastState.totalMembers = members.length;
    broadcastState.sent = 0; broadcastState.failed = 0; broadcastState.remaining = members.length;
    broadcastState.failedMembers = []; broadcastState.lastEmbed = embedToSend;
    broadcastState.statusMessage = await channel.send(buildBroadcastStatusEmbed());

    for (let i = 0; i < members.length; i++) {
        if (broadcastState.stopped) { broadcastState.remaining = members.length - i; break; }
        try { await members[i].send({ embeds: [embedToSend] }); broadcastState.sent++; }
        catch (e) { broadcastState.failed++; broadcastState.failedMembers.push(members[i]); }
        broadcastState.remaining = members.length - (i + 1);
        if ((i + 1) % 5 === 0 || i === members.length - 1) { try { await broadcastState.statusMessage.edit(buildBroadcastStatusEmbed()); } catch (e) { } }
        await delay(1200);
    }
    broadcastState.active = false;
    try { await broadcastState.statusMessage.edit(buildBroadcastStatusEmbed()); } catch (e) { }
}

async function retryBroadcast(channel) {
    if (broadcastState.failedMembers.length === 0) return;
    const retryMembers = [...broadcastState.failedMembers];
    const embedToSend = broadcastState.lastEmbed;
    broadcastState.active = true; broadcastState.stopped = false; broadcastState.totalMembers = retryMembers.length;
    broadcastState.sent = 0; broadcastState.failed = 0; broadcastState.remaining = retryMembers.length; broadcastState.failedMembers = [];
    try { await broadcastState.statusMessage.edit(buildBroadcastStatusEmbed()); } catch (e) { broadcastState.statusMessage = await channel.send(buildBroadcastStatusEmbed()); }

    for (let i = 0; i < retryMembers.length; i++) {
        if (broadcastState.stopped) { broadcastState.remaining = retryMembers.length - i; break; }
        try { await retryMembers[i].send({ embeds: [embedToSend] }); broadcastState.sent++; }
        catch (e) { broadcastState.failed++; broadcastState.failedMembers.push(retryMembers[i]); }
        broadcastState.remaining = retryMembers.length - (i + 1);
        if ((i + 1) % 5 === 0 || i === retryMembers.length - 1) { try { await broadcastState.statusMessage.edit(buildBroadcastStatusEmbed()); } catch (e) { } }
        await delay(1200);
    }
    broadcastState.active = false;
    try { await broadcastState.statusMessage.edit(buildBroadcastStatusEmbed()); } catch (e) { }
}

function buildAdminPanel() {
    const embed = new EmbedBuilder()
        .setTitle('🎴 لوحة تحكم Card Roulette').setDescription('تحكم كامل بالبوت والبطاقات والإعدادات').setColor(0x2F3136)
        .addFields(
            { name: '📊 إحصائيات سريعة', value: [`📦 عدد البطاقات: **${cardsData.cards.length}**`, `👥 المسؤولين: **${config.admins.length + 1}**`, `🎮 حالة اللعبة: **${gameState.active ? '🟢 شغالة' : '🔴 متوقفة'}**`, `🎯 عدد بطاقات اللعبة: **${config.gameSettings.cardCount}**`, `⏱️ تايمر التنفيذ: **${config.gameSettings.executionTimer} ثانية**`, `🔇 وضع الكتمان: **${config.gameSettings.muteMode ? '✅ مفعّل' : '❌ معطّل'}**`].join('\n'), inline: false },
            { name: 'أنواع البطاقات', value: Object.entries(CARD_TYPES).map(([key, t]) => `${t.label}: **${cardsData.cards.filter(c => c.type === key).length}**`).join('\n'), inline: true }
        ).setFooter({ text: 'روليت البطاقات — لوحة التحكم' }).setTimestamp();

    return { embeds: [embed], components: [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_add_card').setLabel('إضافة بطاقة').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('admin_view_cards').setLabel('عرض البطاقات').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('admin_delete_card').setLabel('حذف بطاقة').setStyle(ButtonStyle.Danger)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_manage_admins').setLabel('إدارة المسؤولين').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('admin_bot_settings').setLabel('إعدادات البوت').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('admin_game_settings').setLabel('إعدادات اللعبة').setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_broadcast').setLabel('📢 بودكاست').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('admin_refresh_panel').setLabel('تحديث اللوحة').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('admin_reset_all').setLabel('إعادة تعيين البطاقات').setStyle(ButtonStyle.Danger)
        )
    ]};
}

function buildRegistrationEmbed(guild) {
    const embed = new EmbedBuilder()
        .setTitle('🎴 روليت البطاقات — التسجيل مفتوح!').setDescription(config.gameSettings.eventDescription || 'فعالية روليت البطاقات!').setColor(0xFFD700)
        .addFields(
            { name: '👥 اللاعبين المسجلين', value: gameState.players.length > 0 ? gameState.players.map((p, i) => `\`${i + 1}\` <@${p.id}>`).join('\n') : '*لا يوجد لاعبين بعد...*', inline: false },
            { name: '📊 العدد', value: `**${gameState.players.length}** لاعب مسجل`, inline: true },
            { name: '🎯 البطاقات', value: `**${config.gameSettings.cardCount}** بطاقة متوفرة`, inline: true }
        ).setFooter({ text: 'اضغط "انضم" للتسجيل في الفعالية!' }).setTimestamp();
    if (guild && guild.bannerURL()) embed.setImage(guild.bannerURL({ size: 1024 }));
    else if (guild && guild.iconURL()) embed.setThumbnail(guild.iconURL({ size: 256 }));
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('game_join').setLabel('انضم').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('game_leave').setLabel('انسحب').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('game_start').setLabel('ابدأ اللعبة').setStyle(ButtonStyle.Primary)
    )]};
}

function buildPlayerTurnEmbed() {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer) return null;
    const remainingEidiya = getRemainingEidiyaCount();
    const embed = new EmbedBuilder()
        .setTitle('دور اللاعب').setDescription(`<@${currentPlayer.id}>\n\nاسحب البطاقة الآن وادر العجلة`).setColor(0x3498DB)
        .addFields(
            { name: 'التقدم', value: `تبقى **${gameState.availableCards.length}** بطاقة`, inline: true },
            { name: 'الدور', value: `**${gameState.currentPlayerIndex + 1}/${gameState.players.length}**`, inline: true },
            { name: 'المؤقت', value: `**${config.gameSettings.executionTimer}** ثانية`, inline: true },
            { name: '🎁 عيديات متبقية', value: `**${remainingEidiya}/${gameState.initialEidiyaCount}**`, inline: true },
            { name: '👥 لاعبين متبقين', value: `**${gameState.players.length}**`, inline: true }
        ).setFooter({ text: 'روليت البطاقات — كل لاعب يسحب بطاقة وحدة' }).setTimestamp();

    const drawButton = new ButtonBuilder()
        .setCustomId('game_draw')
        .setLabel('دوّر العجلة')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(gameState.currentPlayerDrew);

    return { embeds: [embed], components: [
        new ActionRowBuilder().addComponents(drawButton),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('game_next').setLabel('التالي').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('game_skip').setLabel('تخطي').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('game_pause').setLabel(gameState.paused ? 'استمرار' : 'ايقاف').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('game_end').setLabel('انهاء').setStyle(ButtonStyle.Danger)
        )
    ]};
}

function buildCardEmbed(card, playerName) {
    const cardType = CARD_TYPES[card.type] || CARD_TYPES.punishment;
    const typeDescriptions = { eidiya: 'حصلت على عيدية — شيء ايجابي لك!', challenge: 'تحدي — عليك تنفيذ هذا التحدي!', punishment: 'عقوبة — عليك تنفيذ هذه العقوبة!' };
    const cardTitle = card.emoji ? `${card.emoji} ${card.name}` : card.name;
    return new EmbedBuilder().setTitle(cardTitle).setDescription(`**${typeDescriptions[card.type] || ''}**\n\n${card.description}`).setColor(cardType.color)
        .addFields({ name: 'النوع', value: cardType.label, inline: true }, { name: 'اللاعب', value: playerName, inline: true })
        .setFooter({ text: 'روليت البطاقات' }).setTimestamp();
}

function buildSummaryEmbed() {
    const stats = {};
    for (const type of Object.keys(CARD_TYPES)) stats[type] = gameState.drawnCards.filter(c => c.card.type === type).length;
    const embed = new EmbedBuilder().setTitle('انتهت الجولة — الملخص').setColor(0xFFD700)
        .addFields(
            { name: '📊 إحصائيات البطاقات', value: Object.entries(stats).filter(([, count]) => count > 0).map(([type, count]) => `${CARD_TYPES[type].label}: **${count}**`).join('\n') || 'لا توجد بطاقات مسحوبة', inline: true },
            { name: '👥 اللاعبين', value: `**${gameState.drawnCards.length}** لاعب شارك`, inline: true },
            { name: '🎴 البطاقات المسحوبة', value: `**${gameState.drawnCards.length}** بطاقة`, inline: true }
        ).setTimestamp();
    if (gameState.drawnCards.length > 0) {
        embed.addFields({ name: '📜 سجل السحبات', value: gameState.drawnCards.slice(-15).map((d, i) => `\`${i + 1}\` <@${d.playerId}> ← ${d.card.emoji ? d.card.emoji + ' ' : '❓ '}**${d.card.name}**`).join('\n'), inline: false });
    }
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('game_new_round').setLabel('جولة جديدة').setStyle(ButtonStyle.Success))] };
}

function startExecutionTimer() {
    clearExecutionTimer();
    if (!config.gameSettings.executionTimer || config.gameSettings.executionTimer <= 0) return;
    let timeLeft = config.gameSettings.executionTimer;
    gameState.timerInterval = setInterval(async () => { timeLeft--; if (timeLeft <= 0) { clearExecutionTimer(); await skipToNextPlayer(); } }, 1000);
}

function clearExecutionTimer() { if (gameState.timerInterval) { clearInterval(gameState.timerInterval); gameState.timerInterval = null; } }

async function moveToNextPlayer() {
    clearExecutionTimer();

    if (gameState.currentPlayerDrew && gameState.players.length > 0) {
        gameState.players.splice(gameState.currentPlayerIndex, 1);
        if (gameState.players.length === 0) { await endGame(); return; }
        if (gameState.currentPlayerIndex >= gameState.players.length) gameState.currentPlayerIndex = 0;
    } else {
        gameState.currentPlayerIndex++;
        if (gameState.currentPlayerIndex >= gameState.players.length) gameState.currentPlayerIndex = 0;
    }

    if (gameState.availableCards.length === 0) { await endGame(); return; }
    if (gameState.players.length === 0) { await endGame(); return; }

    gameState.currentPlayerDrew = false;

    if (gameState.gameChannel) await playPlayerRouletteAnimation(gameState.gameChannel, gameState.players, gameState.currentPlayerIndex);
    const turnData = buildPlayerTurnEmbed();
    if (turnData && gameState.gameMessage) { try { await gameState.gameMessage.edit(turnData); } catch (e) { if (gameState.gameChannel) gameState.gameMessage = await gameState.gameChannel.send(turnData); } }
    startExecutionTimer();
    if (config.gameSettings.dmReminder) { const cp = gameState.players[gameState.currentPlayerIndex]; try { const user = await client.users.fetch(cp.id); await user.send({ embeds: [new EmbedBuilder().setTitle('🎴 دورك الآن!').setDescription('دورك في روليت البطاقات! روح القناة واسحب بطاقتك 🃏').setColor(0xFFD700)] }); } catch (e) { } }
}

async function skipToNextPlayer() {
    if (!gameState.active || !gameState.gameChannel) return;
    try { const sp = gameState.players[gameState.currentPlayerIndex]; await gameState.gameChannel.send({ embeds: [new EmbedBuilder().setDescription(`تم تخطي <@${sp.id}> — انتهى الوقت!`).setColor(0x95A5A6)] }); } catch (e) { }
    gameState.currentPlayerDrew = false;
    clearExecutionTimer();
    gameState.currentPlayerIndex++;
    if (gameState.currentPlayerIndex >= gameState.players.length) gameState.currentPlayerIndex = 0;

    if (gameState.availableCards.length === 0 || gameState.players.length === 0) { await endGame(); return; }

    if (gameState.gameChannel) await playPlayerRouletteAnimation(gameState.gameChannel, gameState.players, gameState.currentPlayerIndex);
    const turnData = buildPlayerTurnEmbed();
    if (turnData && gameState.gameMessage) { try { await gameState.gameMessage.edit(turnData); } catch (e) { if (gameState.gameChannel) gameState.gameMessage = await gameState.gameChannel.send(turnData); } }
    startExecutionTimer();
    if (config.gameSettings.dmReminder) { const cp = gameState.players[gameState.currentPlayerIndex]; try { const user = await client.users.fetch(cp.id); await user.send({ embeds: [new EmbedBuilder().setTitle('🎴 دورك الآن!').setDescription('دورك في روليت البطاقات! روح القناة واسحب بطاقتك 🃏').setColor(0xFFD700)] }); } catch (e) { } }
}

async function endGame() {
    clearExecutionTimer(); gameState.active = false; gameState.phase = 'ended';
    if (gameState.gameChannel) { try { await gameState.gameChannel.send(buildSummaryEmbed()); } catch (e) { } }
}

// ═══════════════════════════════════════════════════════════════
// 🆕 نظام التحدي — لما يسحب اللاعب تحدي يظهر للأدمن زرين
// ═══════════════════════════════════════════════════════════════

async function handleChallengeResult(channel, player, card) {
    // نحفظ بيانات التحدي الحالي
    gameState.pendingChallengePlayer = player;
    gameState.pendingChallengeCard = card;

    const cardTitle = card.emoji ? `${card.emoji} ${card.name}` : card.name;

    const embed = new EmbedBuilder()
        .setTitle('⚔️ تحدي — انتظار حكم الأدمن')
        .setDescription(`**اللاعب:** <@${player.id}>\n**التحدي:** ${cardTitle}\n\n${card.description}\n\n━━━━━━━━━━━━━━━━━━\nهل نجح اللاعب في التحدي؟`)
        .setColor(0x3498DB)
        .setFooter({ text: 'هذه الرسالة للأدمن فقط' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('challenge_success').setLabel('✅ نجح — ينتقل للعيديات').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('challenge_fail').setLabel('❌ فشل — اقصاء').setStyle(ButtonStyle.Danger)
    );

    // نرسل للأدمن بشكل سري (ephemeral مو ممكن هنا لأنه مو رد interaction)
    // نرسل في قناة الأدمن
    try {
        const adminChannel = await client.channels.fetch(config.adminChannelId);
        if (adminChannel) {
            gameState.challengeAdminMessage = await adminChannel.send({ embeds: [embed], components: [row] });
        }
    } catch (e) {
        console.error('❌ خطأ في إرسال رسالة التحدي للأدمن:', e.message);
    }
}

async function giveEidiyaToPlayer(channel, player) {
    const eidiyaCards = gameState.availableCards.filter(c => c.type === 'eidiya');

    // لو ما في عيديات
    if (eidiyaCards.length === 0) {
        await channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('🎉 نجحت في التحدي!')
                .setDescription(`<@${player.id}> نجح في التحدي! 🏆\n\nللأسف العيديات نفذت — شكراً على مشاركتك وحياك في فعالية قادمة! 🌟`)
                .setColor(0x2ECC71)
                .setFooter({ text: 'روليت البطاقات' })
                .setTimestamp()]
        });
        return;
    }

    // نسحب عيدية عشوائية
    const randomIndex = Math.floor(Math.random() * eidiyaCards.length);
    const eidiyaCard = eidiyaCards[randomIndex];

    // نشغّل أنيميشن العجلة للعيدية
    await playDrawAnimation(channel, player.displayName || player.username, 'eidiya');

    // نحذف العيدية من availableCards وmن cards.json
    gameState.availableCards = gameState.availableCards.filter(c => c.id !== eidiyaCard.id);
    const oi = cardsData.cards.findIndex(c => c.id === eidiyaCard.id);
    if (oi !== -1) { cardsData.cards.splice(oi, 1); saveCards(); }

    // نضيفها لسجل السحبات
    gameState.drawnCards.push({ playerId: player.id, playerName: player.displayName || player.username, card: eidiyaCard, timestamp: Date.now() });

    // رسالة آخر عيدية لو خلصت
    const remainingAfter = gameState.availableCards.filter(c => c.type === 'eidiya').length;
    if (remainingAfter === 0 && gameState.initialEidiyaCount > 0) {
        try {
            await channel.send({ embeds: [new EmbedBuilder().setTitle('🔥 آخر عيدية تم سحبها!').setDescription(`<@${player.id}> حصل على **آخر عيدية** متبقية!\nما فيه عيديات بعد كذا 😱`).setColor(0xFF6B6B).setFooter({ text: 'روليت البطاقات' })] });
        } catch (e) { }
    }

    // نعرض بطاقة العيدية
    await channel.send({ embeds: [buildCardEmbed(eidiyaCard, player.displayName || player.username)] });
}

async function playPlayerRouletteAnimation(channel, players, resultIndex) {
    const resultPlayer = players[resultIndex];
    function buildRow(highlightIdx) {
        const visible = players.slice(0, Math.min(players.length, 6));
        return visible.map((p, i) => { const name = (p.displayName || p.username).substring(0, 10); return i === highlightIdx % visible.length ? `**[ ${name} ]**` : name; }).join('  •  ');
    }
    const animMsg = await channel.send({ embeds: [new EmbedBuilder().setTitle('عجلة الاختيار تدور...').setDescription(`من سيكون اللاعب التالي؟\n\n${buildRow(0)}\n\n▲  ▲  ▲`).setColor(0x2F3136).setFooter({ text: 'روليت البطاقات' })] });
    for (let i = 0; i < 10; i++) { await delay(200); try { await animMsg.edit({ embeds: [new EmbedBuilder().setTitle('عجلة الاختيار تدور...').setDescription(`من سيكون اللاعب التالي؟\n\n${buildRow(i)}\n\n▲  ▲  ▲`).setColor(0x2F3136).setFooter({ text: 'روليت البطاقات' })] }); } catch(e) {} }
    const slowSpeeds = [350, 500, 700, 900, 1100];
    for (let s = 0; s < slowSpeeds.length; s++) { await delay(slowSpeeds[s]); try { await animMsg.edit({ embeds: [new EmbedBuilder().setTitle('العجلة تتباطأ...').setDescription(`من سيكون اللاعب التالي؟\n\n${buildRow(10 + s)}\n\n▲  ▲  ▲`).setColor(0x2F3136).setFooter({ text: 'روليت البطاقات' })] }); } catch(e) {} }
    await delay(600);
    try { await animMsg.edit({ embeds: [new EmbedBuilder().setTitle('تم الاختيار!').setDescription(`**${resultPlayer.displayName || resultPlayer.username}**\n\nهذا دوره الآن — دوّر عجلة البطاقة!`).setColor(0xFFD700).setFooter({ text: 'روليت البطاقات' })] }); } catch(e) {}
    await delay(800); return animMsg;
}

async function playDrawAnimation(channel, playerName, resultType) {
    const allTypes = ['eidiya', 'challenge', 'punishment'];
    const segColors = { eidiya: '🟡', challenge: '🔵', punishment: '🔴' };
    const segLabels = { eidiya: 'عيدية', challenge: 'تحدي', punishment: 'عقوبة' };
    function buildCardRow(ht) { return allTypes.map(t => t === ht ? `**[ ${segColors[t]} ${segLabels[t]} ]**` : `${segColors[t]} ${segLabels[t]}`).join('  •  '); }
    const animMsg = await channel.send({ embeds: [new EmbedBuilder().setTitle('عجلة البطاقة تدور...').setDescription(`${playerName} يدور العجلة\n\n${buildCardRow('eidiya')}\n\n▲  ▲  ▲`).setColor(0x2F3136).setFooter({ text: 'روليت البطاقات' })] });
    const fastSeq = ['eidiya','challenge','punishment','eidiya','challenge','punishment','eidiya','challenge'];
    for (const pos of fastSeq) { await delay(300); try { await animMsg.edit({ embeds: [new EmbedBuilder().setTitle('عجلة البطاقة تدور...').setDescription(`${playerName} يدور العجلة\n\n${buildCardRow(pos)}\n\n▲  ▲  ▲`).setColor(0x2F3136).setFooter({ text: 'روليت البطاقات' })] }); } catch(e) {} }
    const resultIdx = allTypes.indexOf(resultType) !== -1 ? allTypes.indexOf(resultType) : 0;
    const slowPath = [allTypes[(resultIdx+1)%3], allTypes[(resultIdx+2)%3], allTypes[resultIdx]];
    const slowSpeeds = [600, 900, 1200];
    for (let i = 0; i < slowPath.length; i++) { await delay(slowSpeeds[i]); try { await animMsg.edit({ embeds: [new EmbedBuilder().setTitle('العجلة تتباطأ...').setDescription(`${playerName} يدور العجلة\n\n${buildCardRow(slowPath[i])}\n\n▲  ▲  ▲`).setColor(0x5865F2).setFooter({ text: 'روليت البطاقات' })] }); } catch(e) {} }
    const resultInfo = CARD_TYPES[resultType] || CARD_TYPES.punishment;
    await delay(600);
    try { await animMsg.edit({ embeds: [new EmbedBuilder().setTitle('توقفت العجلة!').setDescription(`${playerName}\n\n**${segColors[resultType] || '⚪'} ${segLabels[resultType] || resultType}**`).setColor(resultInfo.color).setFooter({ text: 'روليت البطاقات' })] }); } catch(e) {}
    await delay(800); return animMsg;
}

async function registerCommands() {
    const commands = [
        new SlashCommandBuilder().setName('بدء').setDescription('🎴 بدء فعالية روليت البطاقات'),
        new SlashCommandBuilder().setName('لوحة').setDescription('🎛️ فتح لوحة تحكم الأدمن'),
        new SlashCommandBuilder().setName('مساعدة').setDescription('❓ عرض معلومات البوت والأوامر'),
        new SlashCommandBuilder().setName('إعادة').setDescription('🔄 إعادة تعيين حالة اللعبة'),
        new SlashCommandBuilder().setName('ايموجي').setDescription('🎨 تعيين إيموجي لبطاقة معينة').addStringOption(o => o.setName('بطاقة').setDescription('اختر البطاقة').setRequired(true).setAutocomplete(true))
    ];
    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    try { console.log('📝 جاري تسجيل الأوامر...'); await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands.map(c => c.toJSON()) }); console.log('✅ تم تسجيل الأوامر!'); } catch (error) { console.error('❌ خطأ:', error); }
}

client.once('ready', async () => {
    console.log(`✅ البوت شغال: ${client.user.tag}`);
    client.user.setActivity(config.botStatus || '🎴 روليت البطاقات', { type: ActivityType.Playing });
    await registerCommands();
    try {
        const adminChannel = await client.channels.fetch(config.adminChannelId);
        if (adminChannel) {
            const messages = await adminChannel.messages.fetch({ limit: 10 });
            const botMessages = messages.filter(m => m.author.id === client.user.id);
            for (const [, msg] of botMessages) { try { await msg.delete(); } catch (e) { } }
            gameState.adminPanelMessage = await adminChannel.send(buildAdminPanel());
            console.log('📋 تم إرسال لوحة الأدمن');
        }
    } catch (e) { console.error('❌ خطأ في لوحة الأدمن:', e.message); }
});

client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isAutocomplete()) await handleAutocomplete(interaction);
        else if (interaction.isChatInputCommand()) await handleSlashCommand(interaction);
        else if (interaction.isButton()) await handleButton(interaction);
        else if (interaction.isStringSelectMenu()) await handleSelectMenu(interaction);
        else if (interaction.isModalSubmit()) await handleModal(interaction);
    } catch (error) {
        console.error('❌ خطأ:', error);
        try { const r = { content: '❌ حدث خطأ، حاول مرة ثانية.', ephemeral: true }; if (interaction.replied || interaction.deferred) await interaction.followUp(r); else await interaction.reply(r); } catch (e) { }
    }
});

async function handleAutocomplete(interaction) {
    if (interaction.commandName === 'ايموجي') {
        const fv = interaction.options.getFocused().toLowerCase();
        await interaction.respond(cardsData.cards.filter(c => c.name.toLowerCase().includes(fv)).slice(0, 25).map(c => ({ name: `${c.emoji ? c.emoji + ' ' : ''}${c.name} (${CARD_TYPES[c.type]?.label || c.type})`.substring(0, 100), value: c.id })));
    }
}

async function handleSlashCommand(interaction) {
    const { commandName } = interaction;
    if (commandName === 'بدء') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        if (gameState.active) return interaction.reply({ content: '❌ فيه لعبة شغالة!', ephemeral: true });
        if (cardsData.cards.length === 0) return interaction.reply({ content: '❌ لا توجد بطاقات!', ephemeral: true });
        gameState = { ...gameState, active: true, paused: false, phase: 'registration', players: [], currentPlayerIndex: 0, availableCards: [], drawnCards: [], doubleMode: false, gameChannel: interaction.channel, gameMessage: null, registrationMessage: null, timerInterval: null, currentPlayerDrew: false, initialEidiyaCount: 0, challengeAdminMessage: null, pendingChallengePlayer: null, pendingChallengeCard: null };
        await interaction.reply(buildRegistrationEmbed(interaction.guild));
        gameState.registrationMessage = await interaction.fetchReply();
    } else if (commandName === 'لوحة') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        await interaction.reply({ ...buildAdminPanel(), ephemeral: true });
    } else if (commandName === 'مساعدة') {
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('❓ مساعدة Card Roulette').setDescription('بوت فعاليات البطاقات العشوائية').setColor(0x3498DB).addFields({ name: '🎴 `/بدء`', value: 'بدء فعالية جديدة', inline: true }, { name: '🎛️ `/لوحة`', value: 'لوحة التحكم', inline: true }, { name: '🎨 `/ايموجي`', value: 'تعيين إيموجي لبطاقة', inline: true }, { name: '❓ `/مساعدة`', value: 'هذه الرسالة', inline: true }, { name: '🎴 أنواع البطاقات', value: Object.values(CARD_TYPES).map(t => `**${t.label}**`).join('\n'), inline: false }).setFooter({ text: config.botBio || 'Card Roulette Bot' })], ephemeral: true });
    } else if (commandName === 'إعادة') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        clearExecutionTimer(); gameState.active = false; gameState.phase = 'idle'; gameState.players = []; gameState.gameMessage = null; gameState.registrationMessage = null; gameState.timerInterval = null; gameState.currentPlayerDrew = false; gameState.challengeAdminMessage = null; gameState.pendingChallengePlayer = null; gameState.pendingChallengeCard = null;
        await interaction.reply({ content: '✅ تم إعادة تعيين اللعبة!', ephemeral: true });
    } else if (commandName === 'ايموجي') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        const card = cardsData.cards.find(c => c.id === interaction.options.getString('بطاقة'));
        if (!card) return interaction.reply({ content: '❌ بطاقة غير موجودة!', ephemeral: true });
        await interaction.reply({ content: `🎨 أرسل الإيموجي للبطاقة **${card.name}**${card.emoji ? ` (الحالي: ${card.emoji})` : ''}\n\n⏱️ **30 ثانية**...`, ephemeral: true });
        try {
            const collected = await interaction.channel.awaitMessages({ filter: m => m.author.id === interaction.user.id, max: 1, time: 30000, errors: ['time'] });
            const msg = collected.first(); const emoji = extractEmoji(msg.content); try { await msg.delete(); } catch (e) { }
            if (!emoji) return interaction.followUp({ content: '❌ لم يتم العثور على إيموجي!', ephemeral: true });
            card.emoji = emoji; saveCards();
            await interaction.followUp({ content: `✅ تم تحديث إيموجي **${card.name}** إلى ${emoji}`, ephemeral: true });
        } catch (err) { await interaction.followUp({ content: '⏱️ انتهى الوقت!', ephemeral: true }); }
    }
}

async function handleButton(interaction) {
    const id = interaction.customId;

    // ═══ جديد: زري التحدي (نجح / فشل) ═══
    if (id === 'challenge_success') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        if (!gameState.pendingChallengePlayer || !gameState.pendingChallengeCard) return interaction.reply({ content: '❌ ما في تحدي معلّق!', ephemeral: true });

        const player = gameState.pendingChallengePlayer;
        await interaction.update({ embeds: [new EmbedBuilder().setTitle('✅ نجح اللاعب!').setDescription(`<@${player.id}> نجح في التحدي — جاري سحب عيديته...`).setColor(0x2ECC71)], components: [] });

        // نعطيه عيدية عشوائية
        await giveEidiyaToPlayer(gameState.gameChannel, player);

        // ننهي دوره
        gameState.pendingChallengePlayer = null;
        gameState.pendingChallengeCard = null;
        gameState.currentPlayerDrew = true;
        await updateGameMessage();

    } else if (id === 'challenge_fail') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        if (!gameState.pendingChallengePlayer || !gameState.pendingChallengeCard) return interaction.reply({ content: '❌ ما في تحدي معلّق!', ephemeral: true });

        const player = gameState.pendingChallengePlayer;
        await interaction.update({ embeds: [new EmbedBuilder().setTitle('❌ فشل اللاعب').setDescription(`<@${player.id}> فشل في التحدي — تم اقصاؤه`).setColor(0xE74C3C)], components: [] });

        // رسالة في قناة اللعبة
        try {
            await gameState.gameChannel.send({ embeds: [new EmbedBuilder().setTitle('❌ فشل التحدي').setDescription(`<@${player.id}> فشل في التحدي وتم اقصاؤه من الجولة`).setColor(0xE74C3C).setFooter({ text: 'روليت البطاقات' })] });
        } catch (e) { }

        // رسالة خاصة للاعب بالخاص
        try {
            const failedUser = await client.users.fetch(player.id);
            await failedUser.send({ embeds: [new EmbedBuilder()
                .setTitle('شكراً على مشاركتك! 🌟')
                .setDescription('للأسف ما نجحت في التحدي هذه المرة، بس مشاركتك كانت رائعة — حظ أوفر في الفعالية القادمة! 🎴')
                .setColor(0x5865F2)
                .setFooter({ text: 'روليت البطاقات' })
                .setTimestamp()] });
        } catch (e) { }

        gameState.pendingChallengePlayer = null;
        gameState.pendingChallengeCard = null;
        gameState.currentPlayerDrew = true;
        await updateGameMessage();

    } else if (id === 'admin_add_card') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        await interaction.reply({ content: '🎴 اختر نوع البطاقة:', components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_card_type_for_add').setPlaceholder('اختر نوع البطاقة...').addOptions(Object.entries(CARD_TYPES).map(([k, t]) => ({ label: t.label, value: k, description: `إضافة بطاقة ${t.label}` }))))], ephemeral: true });
    } else if (id === 'admin_view_cards') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        if (cardsData.cards.length === 0) return interaction.reply({ content: '📦 لا توجد بطاقات!', ephemeral: true });
        const embeds = [];
        for (const [tk, ti] of Object.entries(CARD_TYPES)) { const tc = cardsData.cards.filter(c => c.type === tk); if (tc.length === 0) continue; embeds.push(new EmbedBuilder().setTitle(`بطاقات ${ti.label} (${tc.length})`).setColor(ti.color).setDescription(tc.map((c, i) => `\`${i+1}\` ${c.emoji ? c.emoji + ' ' : ''}**${c.name}**\n└ ${c.description}`).join('\n\n'))); }
        await interaction.reply({ embeds: embeds.slice(0, 10), ephemeral: true });
    } else if (id === 'admin_delete_card') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        if (cardsData.cards.length === 0) return interaction.reply({ content: '📦 لا توجد بطاقات!', ephemeral: true });
        await interaction.reply({ content: '🗑️ اختر البطاقات للحذف:', components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_card_delete').setPlaceholder('اختر...').setMinValues(1).setMaxValues(Math.min(cardsData.cards.length, 25)).addOptions(cardsData.cards.slice(0, 25).map(c => ({ label: c.name.substring(0, 100), value: c.id, description: c.description.substring(0, 100) }))))], ephemeral: true });
    } else if (id === 'admin_manage_admins') {
        if (interaction.user.id !== process.env.OWNER_ID) return interaction.reply({ content: '❌ فقط المالك!', ephemeral: true });
        await interaction.reply({ content: '👑 إدارة المسؤولين:', components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_admin_action').setPlaceholder('اختر...').addOptions([{ label: '➕ إضافة', value: 'add_admin', emoji: '👑' }, { label: '➖ حذف', value: 'remove_admin', emoji: '🚫' }, { label: '📋 عرض', value: 'list_admins', emoji: '📋' }]))], ephemeral: true });
    } else if (id === 'admin_bot_settings') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        await interaction.reply({ content: '⚙️ إعدادات البوت:', components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_bot_setting').setPlaceholder('اختر...').addOptions([{ label: '📝 اسم البوت', value: 'bot_name', emoji: '📝' }, { label: '🎮 الستاتس', value: 'bot_status', emoji: '🎮' }, { label: '📄 البايو', value: 'bot_bio', emoji: '📄' }, { label: '🖼️ الأفتار', value: 'bot_avatar', emoji: '🖼️' }, { label: '🎨 البنر', value: 'bot_banner', emoji: '🎨' }, { label: '📢 قناة الأدمن', value: 'admin_channel', emoji: '📢' }]))], ephemeral: true });
    } else if (id === 'admin_game_settings') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        await interaction.reply({ content: '🎮 إعدادات اللعبة:', components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_game_setting').setPlaceholder('اختر...').addOptions([{ label: `🎯 عدد البطاقات (${config.gameSettings.cardCount})`, value: 'card_count', emoji: '🎯' }, { label: `🔇 كتمان (${config.gameSettings.muteMode ? 'مفعّل' : 'معطّل'})`, value: 'mute_mode', emoji: '🔇' }, { label: `⏱️ تايمر (${config.gameSettings.executionTimer}ث)`, value: 'execution_timer', emoji: '⏱️' }, { label: `📬 DM (${config.gameSettings.dmReminder ? 'مفعّل' : 'معطّل'})`, value: 'dm_reminder', emoji: '📬' }, { label: `📊 إحصائيات (${config.gameSettings.showStats ? 'مفعّل' : 'معطّل'})`, value: 'show_stats', emoji: '📊' }, { label: '📝 شرح الفعالية', value: 'event_description', emoji: '📝' }]))], ephemeral: true });
    } else if (id === 'admin_broadcast') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        if (broadcastState.active) return interaction.reply({ content: '❌ فيه بودكاست شغال!', ephemeral: true });
        await interaction.reply({ content: '📢 **نظام البودكاست** — اختر نوع الرسالة:\n\n⚠️ سيتم إرسال رسالة خاصة لكل أعضاء السيرفر', components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_broadcast_type').setPlaceholder('اختر...').addOptions([{ label: '🎴 إشعار بدء الفعالية', value: 'event_start', emoji: '🎴', description: 'رسالة جاهزة' }, { label: '📝 رسالة مخصصة', value: 'custom_message', emoji: '📝', description: 'اكتب رسالتك' }]))], ephemeral: true });
    } else if (id === 'broadcast_stop') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        broadcastState.stopped = true; await interaction.reply({ content: '⏹️ جاري الإيقاف...', ephemeral: true });
    } else if (id === 'broadcast_retry') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        if (broadcastState.active) return interaction.reply({ content: '❌ فيه بودكاست شغال!', ephemeral: true });
        if (broadcastState.failedMembers.length === 0) return interaction.reply({ content: '✅ ما فيه فاشلين!', ephemeral: true });
        await interaction.reply({ content: `🔄 إعادة المحاولة لـ **${broadcastState.failedMembers.length}** عضو...`, ephemeral: true });
        await retryBroadcast(interaction.channel);
    } else if (id === 'broadcast_dismiss') {
        try { await interaction.message.delete(); } catch (e) { } try { await interaction.deferUpdate(); } catch (e) { }
    } else if (id === 'broadcast_confirm_event') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        await interaction.update({ content: '📢 جاري الإرسال...', components: [] });
        const guild = interaction.guild; await guild.members.fetch();
        const members = guild.members.cache.filter(m => !m.user.bot).map(m => m.user);
        const eventEmbed = new EmbedBuilder().setTitle('🎴 فعالية روليت البطاقات!').setDescription(config.gameSettings.eventDescription || 'فعالية روليت البطاقات بدأت! تعال شارك 🎉').setColor(0xFFD700)
            .addFields({ name: '🎯 عدد البطاقات', value: `**${config.gameSettings.cardCount}**`, inline: true }, { name: '📦 المتوفرة', value: `**${cardsData.cards.length}**`, inline: true })
            .setFooter({ text: `من سيرفر: ${guild.name}` }).setTimestamp();
        if (guild.iconURL()) eventEmbed.setThumbnail(guild.iconURL({ size: 256 }));
        await sendBroadcast(interaction.channel, members, eventEmbed);
    } else if (id === 'broadcast_cancel') {
        await interaction.update({ content: '❌ تم إلغاء البودكاست.', components: [] });
    } else if (id === 'admin_refresh_panel') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        try { await interaction.update(buildAdminPanel()); } catch (e) { await interaction.reply({ ...buildAdminPanel(), ephemeral: true }); }
    } else if (id === 'admin_reset_all') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين فقط!', ephemeral: true });
        await interaction.reply({ content: '⚠️ **متأكد من إعادة تعيين البطاقات؟**', components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('confirm_reset_yes').setLabel('✅ نعم').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('confirm_reset_no').setLabel('❌ إلغاء').setStyle(ButtonStyle.Secondary))], ephemeral: true });
    } else if (id === 'confirm_reset_yes') {
        cardsData.cards = []; saveCards(); await interaction.update({ content: '✅ تم إعادة التعيين!', components: [] }); await refreshAdminPanel();
    } else if (id === 'confirm_reset_no') {
        await interaction.update({ content: '❌ تم الإلغاء.', components: [] });
    } else if (id === 'game_join') {
        if (gameState.phase !== 'registration') return interaction.reply({ content: '❌ التسجيل مغلق!', ephemeral: true });
        if (gameState.players.find(p => p.id === interaction.user.id)) return interaction.reply({ content: '❌ مسجل بالفعل!', ephemeral: true });
        gameState.players.push({ id: interaction.user.id, username: interaction.user.username, displayName: interaction.member?.displayName || interaction.user.username });
        await interaction.update(buildRegistrationEmbed(interaction.guild));
    } else if (id === 'game_leave') {
        if (gameState.phase !== 'registration') return interaction.reply({ content: '❌ لا يمكن الانسحاب!', ephemeral: true });
        const idx = gameState.players.findIndex(p => p.id === interaction.user.id);
        if (idx === -1) return interaction.reply({ content: '❌ غير مسجل!', ephemeral: true });
        gameState.players.splice(idx, 1); await interaction.update(buildRegistrationEmbed(interaction.guild));
    } else if (id === 'game_start') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤول فقط!', ephemeral: true });
        if (gameState.phase !== 'registration') return interaction.reply({ content: '❌ مو مرحلة التسجيل!', ephemeral: true });
        if (gameState.players.length < 2) return interaction.reply({ content: '❌ يحتاج 2 لاعبين!', ephemeral: true });
        const cc = Math.min(config.gameSettings.cardCount, cardsData.cards.length);
        if (cc === 0) return interaction.reply({ content: '❌ لا بطاقات!', ephemeral: true });
        gameState.availableCards = shuffleArray([...cardsData.cards]).slice(0, cc);
        gameState.initialEidiyaCount = gameState.availableCards.filter(c => c.type === 'eidiya').length;
        gameState.players = shuffleArray(gameState.players);
        gameState.currentPlayerIndex = 0; gameState.phase = 'playing'; gameState.drawnCards = [];
        gameState.currentPlayerDrew = false;
        await interaction.update({ embeds: [new EmbedBuilder().setTitle('اللعبة بدأت!').setDescription(`لاعبين: **${gameState.players.length}**\nبطاقات: **${gameState.availableCards.length}**\nعيديات: **${gameState.initialEidiyaCount}**`).setColor(0x2ECC71)], components: [] });
        await playPlayerRouletteAnimation(interaction.channel, gameState.players, gameState.currentPlayerIndex);
        gameState.gameMessage = await interaction.channel.send(buildPlayerTurnEmbed()); startExecutionTimer();
    } else if (id === 'game_draw') {
        if (gameState.phase !== 'playing' || gameState.paused) return interaction.reply({ content: '❌ غير متاحة!', ephemeral: true });
        const cp = gameState.players[gameState.currentPlayerIndex];
        if (interaction.user.id !== cp.id) { if (!gameState.players.find(p => p.id === interaction.user.id)) return interaction.reply({ content: '❌ غير مسجل!', ephemeral: true }); return interaction.reply({ content: '❌ مو دورك!', ephemeral: true }); }
        if (gameState.currentPlayerDrew) return interaction.reply({ content: '❌ سحبت بطاقتك بالفعل! انتظر الأدمن يضغط "التالي"', ephemeral: true });
        if (gameState.availableCards.length === 0) { await endGame(); return interaction.reply({ content: '❌ خلصت البطاقات!', ephemeral: true }); }
        await interaction.deferUpdate(); clearExecutionTimer();
        const dc = gameState.availableCards.pop();

        if (dc.type === 'eidiya') {
            const remainingEidiyaAfter = gameState.availableCards.filter(c => c.type === 'eidiya').length;
            if (remainingEidiyaAfter === 0 && getRemainingEidiyaCount() <= 1) {
                try { await gameState.gameChannel.send({ embeds: [new EmbedBuilder().setTitle('🔥 آخر عيدية تم سحبها!').setDescription(`<@${cp.id}> حصل على **آخر عيدية** متبقية!\nما فيه عيديات بعد كذا 😱`).setColor(0xFF6B6B).setFooter({ text: 'روليت البطاقات' })] }); } catch (e) { }
            }
            // العيدية تُحذف نهائياً
            const oi = cardsData.cards.findIndex(c => c.id === dc.id);
            if (oi !== -1) { cardsData.cards.splice(oi, 1); saveCards(); }
            gameState.drawnCards.push({ playerId: cp.id, playerName: cp.displayName || cp.username, card: dc, timestamp: Date.now() });
            const am = await playDrawAnimation(interaction.channel, cp.displayName || cp.username, dc.type);
            try { await am.edit({ embeds: [buildCardEmbed(dc, cp.displayName || cp.username)], components: [] }); } catch (e) { }
            gameState.currentPlayerDrew = true;
            await updateGameMessage();

        } else if (dc.type === 'punishment') {
            // العقوبة ترجع للقائمة
            gameState.availableCards.unshift(dc);
            gameState.availableCards = shuffleArray(gameState.availableCards);
            gameState.drawnCards.push({ playerId: cp.id, playerName: cp.displayName || cp.username, card: dc, timestamp: Date.now() });
            const am = await playDrawAnimation(interaction.channel, cp.displayName || cp.username, dc.type);
            try { await am.edit({ embeds: [buildCardEmbed(dc, cp.displayName || cp.username)], components: [] }); } catch (e) { }
            gameState.currentPlayerDrew = true;
            await updateGameMessage();

        } else if (dc.type === 'challenge') {
            // ═══ جديد: التحدي — يعرض البطاقة في الشات ويرسل زري الحكم للأدمن ═══
            gameState.availableCards.unshift(dc);
            gameState.availableCards = shuffleArray(gameState.availableCards);
            gameState.drawnCards.push({ playerId: cp.id, playerName: cp.displayName || cp.username, card: dc, timestamp: Date.now() });
            const am = await playDrawAnimation(interaction.channel, cp.displayName || cp.username, dc.type);
            try { await am.edit({ embeds: [buildCardEmbed(dc, cp.displayName || cp.username)], components: [] }); } catch (e) { }
            // نرسل زري الحكم لقناة الأدمن
            await handleChallengeResult(gameState.gameChannel, cp, dc);
            // ما نعلّم currentPlayerDrew هنا — الأدمن هو اللي يقرر
        }

    } else if (id === 'game_next') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين!', ephemeral: true });
        if (gameState.phase !== 'playing') return interaction.reply({ content: '❌ غير شغالة!', ephemeral: true });
        await interaction.deferUpdate(); await moveToNextPlayer();
    } else if (id === 'game_skip') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين!', ephemeral: true });
        if (gameState.phase !== 'playing') return interaction.reply({ content: '❌ غير شغالة!', ephemeral: true });
        await interaction.deferUpdate();
        gameState.currentPlayerDrew = false;
        await skipToNextPlayer();
    } else if (id === 'game_pause') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين!', ephemeral: true });
        if (gameState.phase !== 'playing') return interaction.reply({ content: '❌ غير شغالة!', ephemeral: true });
        gameState.paused = !gameState.paused;
        if (gameState.paused) { clearExecutionTimer(); await interaction.channel.send({ embeds: [new EmbedBuilder().setTitle('اللعبة متوقفة مؤقتاً').setColor(0xF39C12)] }); }
        else { startExecutionTimer(); await interaction.channel.send({ embeds: [new EmbedBuilder().setTitle('اللعبة مستمرة!').setColor(0x2ECC71)] }); }
        await updateGameMessage(); try { await interaction.deferUpdate(); } catch (e) { }
    } else if (id === 'game_end') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين!', ephemeral: true });
        await interaction.deferUpdate(); await endGame();
    } else if (id === 'game_new_round') {
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ للمسؤولين!', ephemeral: true });
        gameState = { ...gameState, active: true, paused: false, phase: 'registration', players: [], currentPlayerIndex: 0, availableCards: [], drawnCards: [], doubleMode: false, gameChannel: interaction.channel, timerInterval: null, currentPlayerDrew: false, initialEidiyaCount: 0, challengeAdminMessage: null, pendingChallengePlayer: null, pendingChallengeCard: null };
        await interaction.update(buildRegistrationEmbed(interaction.guild)); gameState.registrationMessage = await interaction.fetchReply();
    }
}

async function handleSelectMenu(interaction) {
    const id = interaction.customId;
    if (id === 'select_broadcast_type') {
        const type = interaction.values[0];
        if (type === 'event_start') {
            const guild = interaction.guild; await guild.members.fetch();
            const mc = guild.members.cache.filter(m => !m.user.bot).size;
            await interaction.update({ content: `📢 **إشعار بدء الفعالية**\n\nسيتم إرسال لـ **${mc}** عضو\n⏱️ تقريباً **${Math.ceil(mc * 1.2 / 60)}** دقيقة`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('broadcast_confirm_event').setLabel(`📢 إرسال لـ ${mc} عضو`).setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('broadcast_cancel').setLabel('❌ إلغاء').setStyle(ButtonStyle.Secondary))] });
        } else if (type === 'custom_message') {
            const modal = new ModalBuilder().setCustomId('modal_broadcast_custom').setTitle('📢 بودكاست — رسالة مخصصة');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('broadcast_title').setLabel('عنوان الرسالة').setStyle(TextInputStyle.Short).setPlaceholder('مثال: 🎴 فعالية جديدة!').setRequired(true).setMaxLength(100)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('broadcast_body').setLabel('نص الرسالة').setStyle(TextInputStyle.Paragraph).setPlaceholder('اكتب الرسالة...').setRequired(true).setMaxLength(2000)));
            await interaction.showModal(modal);
        }
    } else if (id === 'select_card_type_for_add') {
        const st = interaction.values[0];
        const modal = new ModalBuilder().setCustomId(`modal_add_card_${st}`).setTitle(`إضافة بطاقة — ${CARD_TYPES[st].label}`);
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('card_name').setLabel('اسم البطاقة').setStyle(TextInputStyle.Short).setPlaceholder('مثال: عيدية 100 ريال').setRequired(true).setMaxLength(100)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('card_description').setLabel('وصف البطاقة').setStyle(TextInputStyle.Paragraph).setPlaceholder('مثال: مبروك! 🎉').setRequired(true).setMaxLength(500)));
        await interaction.showModal(modal);
    } else if (id === 'select_card_delete') {
        let d = 0; for (const v of interaction.values) { const i = cardsData.cards.findIndex(c => c.id === v); if (i !== -1) { cardsData.cards.splice(i, 1); d++; } } saveCards();
        await interaction.update({ content: `✅ تم حذف **${d}** بطاقة!`, components: [] }); await refreshAdminPanel();
    } else if (id === 'select_admin_action') {
        const a = interaction.values[0];
        if (a === 'add_admin') { const modal = new ModalBuilder().setCustomId('modal_add_admin').setTitle('إضافة مسؤول'); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('admin_id').setLabel('ID المسؤول').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true))); await interaction.showModal(modal); }
        else if (a === 'remove_admin') { if (config.admins.length === 0) return interaction.update({ content: '📋 لا يوجد مسؤولين!', components: [] }); const opts = []; for (const ai of config.admins) { try { const u = await client.users.fetch(ai); opts.push({ label: u.username, value: ai, description: `ID: ${ai}` }); } catch (e) { opts.push({ label: `مسؤول (${ai})`, value: ai }); } } await interaction.update({ content: '🚫 اختر المسؤول:', components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_admin_remove').setPlaceholder('اختر...').addOptions(opts))] }); }
        else if (a === 'list_admins') { let l = `👑 **المالك:** <@${process.env.OWNER_ID}>\n\n`; if (config.admins.length > 0) { l += '👥 **المسؤولين:**\n'; for (const ai of config.admins) l += `• <@${ai}>\n`; } else l += '*لا يوجد مسؤولين*'; await interaction.update({ content: l, components: [] }); }
    } else if (id === 'select_admin_remove') {
        const ai = interaction.values[0]; const idx = config.admins.indexOf(ai); if (idx !== -1) { config.admins.splice(idx, 1); saveConfig(); await interaction.update({ content: `✅ تم حذف <@${ai}>!`, components: [] }); } await refreshAdminPanel();
    } else if (id === 'select_bot_setting') {
        const s = interaction.values[0];
        if (['bot_avatar', 'bot_banner', 'admin_channel'].includes(s)) {
            const modal = new ModalBuilder().setCustomId(`modal_bot_setting_${s}`).setTitle(s === 'bot_avatar' ? 'تغيير الأفتار' : s === 'bot_banner' ? 'تغيير البنر' : 'تغيير قناة الأدمن');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('setting_value').setLabel(s === 'bot_avatar' ? 'رابط الأفتار' : s === 'bot_banner' ? 'رابط البنر' : 'ID القناة').setStyle(TextInputStyle.Short).setPlaceholder(s === 'bot_avatar' ? 'https://example.com/avatar.png' : s === 'bot_banner' ? 'https://example.com/banner.png' : '123456789012345678').setRequired(true)));
            await interaction.showModal(modal); return;
        }
        const modal = new ModalBuilder().setCustomId(`modal_bot_setting_${s}`).setTitle(s === 'bot_name' ? 'تغيير الاسم' : s === 'bot_status' ? 'تغيير الستاتس' : 'تغيير البايو');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('setting_value').setLabel(s === 'bot_name' ? 'الاسم الجديد' : s === 'bot_status' ? 'الستاتس الجديد' : 'البايو الجديد').setStyle(s === 'bot_bio' ? TextInputStyle.Paragraph : TextInputStyle.Short).setPlaceholder(s === 'bot_name' ? config.botName : s === 'bot_status' ? config.botStatus : config.botBio).setRequired(true)));
        await interaction.showModal(modal);
    } else if (id === 'select_game_setting') {
        const s = interaction.values[0];
        if (s === 'mute_mode') { config.gameSettings.muteMode = !config.gameSettings.muteMode; saveConfig(); await interaction.update({ content: `✅ كتمان: **${config.gameSettings.muteMode ? '✅' : '❌'}**`, components: [] }); await refreshAdminPanel(); }
        else if (s === 'dm_reminder') { config.gameSettings.dmReminder = !config.gameSettings.dmReminder; saveConfig(); await interaction.update({ content: `✅ DM: **${config.gameSettings.dmReminder ? '✅' : '❌'}**`, components: [] }); await refreshAdminPanel(); }
        else if (s === 'show_stats') { config.gameSettings.showStats = !config.gameSettings.showStats; saveConfig(); await interaction.update({ content: `✅ إحصائيات: **${config.gameSettings.showStats ? '✅' : '❌'}**`, components: [] }); await refreshAdminPanel(); }
        else { const modal = new ModalBuilder().setCustomId(`modal_game_setting_${s}`).setTitle(s === 'card_count' ? 'عدد البطاقات' : s === 'execution_timer' ? 'التايمر' : 'شرح الفعالية'); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('setting_value').setLabel(s === 'card_count' ? 'العدد' : s === 'execution_timer' ? 'الثواني' : 'الشرح').setStyle(s === 'event_description' ? TextInputStyle.Paragraph : TextInputStyle.Short).setPlaceholder(s === 'card_count' ? String(config.gameSettings.cardCount) : s === 'execution_timer' ? String(config.gameSettings.executionTimer) : config.gameSettings.eventDescription || '...').setRequired(true))); await interaction.showModal(modal); }
    }
}

async function handleModal(interaction) {
    const id = interaction.customId;
    if (id === 'modal_broadcast_custom') {
        const title = interaction.fields.getTextInputValue('broadcast_title');
        const body = interaction.fields.getTextInputValue('broadcast_body');
        const guild = interaction.guild; await guild.members.fetch();
        const members = guild.members.cache.filter(m => !m.user.bot).map(m => m.user);
        await interaction.reply({ content: `📢 جاري الإرسال لـ **${members.length}** عضو...`, ephemeral: true });
        const customEmbed = new EmbedBuilder().setTitle(title).setDescription(body).setColor(0x5865F2).setFooter({ text: `من سيرفر: ${guild.name}` }).setTimestamp();
        if (guild.iconURL()) customEmbed.setThumbnail(guild.iconURL({ size: 256 }));
        await sendBroadcast(interaction.channel, members, customEmbed);
    } else if (id.startsWith('modal_add_card_')) {
        const ct = id.replace('modal_add_card_', '');
        cardsData.cards.push({ id: generateId(), name: interaction.fields.getTextInputValue('card_name'), type: ct, description: interaction.fields.getTextInputValue('card_description') }); saveCards();
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ تم إضافة البطاقة!').setColor(CARD_TYPES[ct].color).addFields({ name: '📝 الاسم', value: interaction.fields.getTextInputValue('card_name'), inline: true }, { name: '🎴 النوع', value: CARD_TYPES[ct].label, inline: true }, { name: '📄 الوصف', value: interaction.fields.getTextInputValue('card_description'), inline: false })], ephemeral: true }); await refreshAdminPanel();
    } else if (id === 'modal_add_admin') {
        const ai = interaction.fields.getTextInputValue('admin_id').trim();
        if (!/^\d{17,20}$/.test(ai)) return interaction.reply({ content: '❌ ID غير صحيح!', ephemeral: true });
        if (config.admins.includes(ai)) return interaction.reply({ content: '❌ موجود بالفعل!', ephemeral: true });
        if (ai === process.env.OWNER_ID) return interaction.reply({ content: '❌ هذا المالك!', ephemeral: true });
        try { const u = await client.users.fetch(ai); config.admins.push(ai); saveConfig(); await interaction.reply({ content: `✅ تم إضافة **${u.username}**!`, ephemeral: true }); } catch (e) { return interaction.reply({ content: '❌ مستخدم غير موجود!', ephemeral: true }); }
        await refreshAdminPanel();
    } else if (id.startsWith('modal_bot_setting_')) {
        const s = id.replace('modal_bot_setting_', ''); const v = interaction.fields.getTextInputValue('setting_value').trim();
        if (s === 'bot_name') { config.botName = v; try { await client.user.setUsername(v); } catch (e) { } saveConfig(); await interaction.reply({ content: `✅ الاسم: **${v}**`, ephemeral: true }); }
        else if (s === 'bot_status') { config.botStatus = v; client.user.setActivity(v, { type: ActivityType.Playing }); saveConfig(); await interaction.reply({ content: `✅ الستاتس: **${v}**`, ephemeral: true }); }
        else if (s === 'bot_bio') { config.botBio = v; saveConfig(); await interaction.reply({ content: `✅ البايو: **${v}**`, ephemeral: true }); }
        else if (s === 'bot_avatar') { try { await client.user.setAvatar(v); await interaction.reply({ content: '✅ تم تغيير الأفتار!', ephemeral: true }); } catch (e) { await interaction.reply({ content: `❌ فشل: ${e.message}\n⏱️ مرتين كل ساعة`, ephemeral: true }); } }
        else if (s === 'bot_banner') { try { await client.user.setBanner(v); await interaction.reply({ content: '✅ تم تغيير البنر!', ephemeral: true }); } catch (e) { await interaction.reply({ content: `❌ فشل: ${e.message}`, ephemeral: true }); } }
        else if (s === 'admin_channel') {
            if (!/^\d{17,20}$/.test(v)) return interaction.reply({ content: '❌ ID غير صحيح!', ephemeral: true });
            try { const nc = await client.channels.fetch(v); if (!nc || !nc.isTextBased()) return interaction.reply({ content: '❌ قناة غير صالحة!', ephemeral: true }); if (gameState.adminPanelMessage) { try { await gameState.adminPanelMessage.delete(); } catch (e) { } } const old = config.adminChannelId; config.adminChannelId = v; saveConfig(); gameState.adminPanelMessage = await nc.send(buildAdminPanel()); await interaction.reply({ content: `✅ تم النقل!\n📢 قديمة: <#${old}>\n📢 جديدة: <#${v}>`, ephemeral: true }); }
            catch (e) { await interaction.reply({ content: `❌ فشل: ${e.message}`, ephemeral: true }); }
        }
        await refreshAdminPanel();
    } else if (id.startsWith('modal_game_setting_')) {
        const s = id.replace('modal_game_setting_', ''); const v = interaction.fields.getTextInputValue('setting_value');
        if (s === 'card_count') { const n = parseInt(v); if (isNaN(n) || n < 1 || n > 100) return interaction.reply({ content: '❌ رقم 1-100!', ephemeral: true }); config.gameSettings.cardCount = n; }
        else if (s === 'execution_timer') { const n = parseInt(v); if (isNaN(n) || n < 10 || n > 300) return interaction.reply({ content: '❌ رقم 10-300!', ephemeral: true }); config.gameSettings.executionTimer = n; }
        else if (s === 'event_description') { config.gameSettings.eventDescription = v; }
        saveConfig(); await interaction.reply({ content: '✅ تم التحديث!', ephemeral: true }); await refreshAdminPanel();
    }
}

async function refreshAdminPanel() {
    if (!gameState.adminPanelMessage) return;
    try { await gameState.adminPanelMessage.edit(buildAdminPanel()); }
    catch (e) { try { const ch = await client.channels.fetch(config.adminChannelId); if (ch) gameState.adminPanelMessage = await ch.send(buildAdminPanel()); } catch (err) { console.error('❌', err.message); } }
}

async function updateGameMessage() {
    if (!gameState.gameMessage || !gameState.gameChannel) return;
    const td = buildPlayerTurnEmbed(); if (!td) return;
    try { await gameState.gameMessage.edit(td); } catch (e) { try { gameState.gameMessage = await gameState.gameChannel.send(td); } catch (err) { } }
}

client.on('guildMemberRemove', async (member) => {
    const ai = config.admins.indexOf(member.id);
    if (ai !== -1) { config.admins.splice(ai, 1); saveConfig(); console.log(`👋 ${member.user.tag} طلع`); try { const ch = await client.channels.fetch(config.adminChannelId); if (ch) { const na = config.admins.length > 0 ? config.admins[0] : process.env.OWNER_ID; await ch.send({ embeds: [new EmbedBuilder().setTitle('⚠️ مسؤول طلع').setDescription(`**${member.user.tag}** طلع — الصلاحيات لـ <@${na}>`).setColor(0xE74C3C)] }); } } catch (e) { } await refreshAdminPanel(); }
    if (gameState.active) { const pi = gameState.players.findIndex(p => p.id === member.id); if (pi !== -1) { gameState.players.splice(pi, 1); if (gameState.currentPlayerIndex >= gameState.players.length) gameState.currentPlayerIndex = 0; if (gameState.players.length < 2 && gameState.phase === 'playing') await endGame(); else await updateGameMessage(); } }
});

console.log('🎴 جاري تشغيل Card Roulette...');
client.login(process.env.BOT_TOKEN).catch(err => { console.error('❌ فشل:', err.message); console.log('📝 تأكد من BOT_TOKEN'); });
