const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const PImage = require('pureimage');
const { PassThrough } = require('stream');
const path = require('path');

const VERIFY_ROLE_IDS = [
    '1442568949605597264',
    '1442568938457399299',
    '1442568992459067423',
    '1468674171213971568',
    '1442568928667631738',
    '1442568938457399299'
];
const VERIFY_CODE_TTL_MS = 5 * 60 * 1000;
const VERIFY_MAX_ATTEMPTS = 3;
const VERIFY_LOG_CHANNEL_ID = '1442569294796820541';
const VERIFY_PING_CHANNEL_ID = '1442569115972669541';
const { upsertVerifiedMember, applyTenureForMember } = require('../../Services/Community/verificationTenureService');
const verifyState = new Map();
const fontPath = path.join(__dirname, '..', '..', 'UI', 'Fonts', 'Mojangles.ttf');
let captchaFontFamily = 'captcha';

try {
    PImage.registerFont(fontPath, 'captcha').loadSync();
} catch (err) {
    captchaFontFamily = 'Arial';
    global.logger?.warn?.('[VERIFY] Failed to load captcha font, text may not render:', err);
}
function makeExpiredEmbed() {
    return new EmbedBuilder()
        .setColor('Red')
        .setTitle('<:cancel:1461730653677551691> Unsuccessful Operation!')
        .setDescription('<:space:1461733157840621608> <:rightSort:1461726104422453298> Your verification has expired, you need to press Verify again.');
}
function makeWrongAnswerEmbed() {
    return new EmbedBuilder()
        .setColor('Red')
        .setTitle('<:cancel:1461730653677551691> Unsuccessful Operation!')
        .setDescription("<:space:1461733157840621608> <:rightSort:1461726104422453298> Wrong answer, try again before it's too late.");
}
function makeVerifiedEmbed(serverName) {
    return new EmbedBuilder()
        .setColor('#57f287')
        .setTitle('**You have been verified!**')
        .setDescription(
            `<:success:1461731530333229226> You passed the verification successfully. You can now access \`${serverName}\``
        );
}
function makeAlreadyVerifiedEmbed() {
    return new EmbedBuilder()
        .setColor('Red')
        .setTitle('<:alarm:1461725841451909183> **You are verified already!**');
}
function makeOwnerEmbed() {
    return new EmbedBuilder()
        .setColor('Red')
        .setTitle('<:cancel:1461730653677551691> Unsuccessful Operation!')
        .setDescription('<:space:1461733157840621608> <:rightSort:1461726104422453298> You are the owner, why would an owner try to verify?');
}
function isUnknownInteraction(error) {
    return error?.code === 10062;
}
function sanitizeEmbedText(value) {
    return String(value || "")
        .replace(/[\\`*_~|>]/g, '\\$&')
        .replace(/\n/g, ' ')
        .trim();
}
async function safeReply(interaction, payload) {
    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(payload);
        } else {
            await interaction.reply(payload);
        }
    } catch (error) {
        if (isUnknownInteraction(error)) return false;
        throw error;
    }
    return true;
}
async function safeDeferReply(interaction, payload) {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply(payload);
        }
    } catch (error) {
        if (isUnknownInteraction(error)) return false;
        throw error;
    }
    return true;
}
async function safeEditReply(interaction, payload) {
    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(payload);
        } else {
            await interaction.reply(payload);
        }
    } catch (error) {
        if (isUnknownInteraction(error)) return false;
        throw error;
    }
    return true;
}
function randomChar(set) {
    const chars = set || 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
    return chars[Math.floor(Math.random() * chars.length)];
}
function makeCode(len = 6) {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const combined = upper + lower;
    const minLen = Math.max(len, 2);
    const code = [];
    code.push(randomChar(upper));
    code.push(randomChar(lower));
    while (code.length < minLen) {
        code.push(randomChar(combined));
    }
    for (let i = code.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [code[i], code[j]] = [code[j], code[i]];
    }
    return code.slice(0, len).join('');
}
async function makeCaptchaPng(code) {
    const width = 560;
    const height = 180;
    const img = PImage.make(width, height);
    const ctx = img.getContext('2d');
    ctx.fillStyle = '#1d1f26';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(45,47,58,0.6)';
    for (let i = 0; i < 24; i += 1) {
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        const w = Math.floor(20 + Math.random() * 60);
        const h = Math.floor(4 + Math.random() * 10);
        ctx.fillRect(x, y, w, h);
    }
    ctx.fillStyle = 'rgba(140,145,156,0.5)';
    ctx.font = `26pt ${captchaFontFamily}`;
    for (let i = 0; i < 10; i += 1) {
        const x = Math.floor(20 + Math.random() * (width - 40));
        const y = Math.floor(45 + Math.random() * 90);
        const rot = (Math.random() * 40 - 20) * (Math.PI / 180);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.fillText(randomChar(), 0, 0);
        ctx.restore();
    }
    ctx.fillStyle = '#33d17a';
    ctx.font = `56pt ${captchaFontFamily}`;
    const chars = code.split('');
    const points = [];
    chars.forEach((ch, i) => {
        const x = 70 + i * 72 + Math.floor(Math.random() * 10);
        const y = 120 + Math.floor(Math.random() * 12);
        const rot = (Math.random() * 10 - 5) * (Math.PI / 180);
        points.push({ x: x + 8, y: y - 18 });
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
    });
    ctx.strokeStyle = 'rgba(46,204,113,0.6)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    points.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 120; i += 1) {
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        ctx.fillRect(x, y, 2, 2);
    }
    const stream = new PassThrough();
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    await PImage.encodePNGToStream(img, stream);
    return Buffer.concat(chunks);
}
function isAlreadyVerified(member) {
    if (!member?.roles?.cache) return false;
    return VERIFY_ROLE_IDS.every(id => member.roles.cache.has(id));
}
async function handleVerifyInteraction(interaction) {
    if (interaction.isButton()) {
        if (interaction.customId === 'verify_start') {
            if (interaction.guild?.ownerId === interaction.user.id) {
                await safeReply(interaction, { embeds: [makeOwnerEmbed()], flags: 1 << 6 });
                return true;
            }
            if (isAlreadyVerified(interaction.member)) {
                await safeReply(interaction, { embeds: [makeAlreadyVerifiedEmbed()], flags: 1 << 6 });
                return true;
            }
            const existing = verifyState.get(interaction.user.id);
            if (existing?.timeoutId) clearTimeout(existing.timeoutId);
            const code = makeCode();
            const captchaPng = await makeCaptchaPng(code);
            const captchaFile = new AttachmentBuilder(captchaPng, { name: 'captcha.png' });
            verifyState.set(interaction.user.id, {
                code,
                expiresAt: Date.now() + VERIFY_CODE_TTL_MS,
                attemptsLeft: VERIFY_MAX_ATTEMPTS
            });
            const embed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:verification:1461725843125571758> Hello! Are you human? Let's find out!\n` +
                    '\`Please type the captcha below to be able to access this server!\`\n\n' +
                    '**Additional Notes:**\n' +
                    '<:tracedColored:1461728858955976805> Type out the traced colored characters from left to right.\n' +
                    '<:decoy:1461728857114546421> Ignore the decoy characters spread-around.\n' +
                    '<:nocases:1461728855642341509> You do not have to respect characters cases (upper/lower case)!\n\n'
                )
                .setFooter({ text: `Verification Period: 5 minutes` })
                .setImage('attachment://captcha.png');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_enter')
                    .setLabel('Answer')
                    .setStyle(ButtonStyle.Primary)
            );
            await safeReply(interaction, {
                embeds: [embed],
                components: [row],
                files: [captchaFile],
                flags: 1 << 6
            });
            try {
                const replyMsg = await interaction.fetchReply();
                if (replyMsg) {
                    const state = verifyState.get(interaction.user.id);
                    if (state) {
                        state.promptMessage = replyMsg;
                        verifyState.set(interaction.user.id, state);
                    }
                }
            } catch { }
            return true;
        }
        if (interaction.customId === 'verify_enter') {
            const state = verifyState.get(interaction.user.id);
            if (!state || Date.now() > state.expiresAt) {
                verifyState.delete(interaction.user.id);
                await safeReply(interaction, {
                    embeds: [makeExpiredEmbed()],
                    flags: 1 << 6
                });
                return true;
            }
            state.promptMessage = interaction.message;
            verifyState.set(interaction.user.id, state);
            const modal = new ModalBuilder()
                .setCustomId('verify_code')
                .setTitle('Captcha Answer');
            const input = new TextInputBuilder()
                .setCustomId('verify_input')
                .setLabel('Answer')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder('Type the captcha text here')
                .setMaxLength(6);
            const row = new ActionRowBuilder().addComponents(input);
            modal.addComponents(row);
            await interaction.showModal(modal);
            return true;
        }
    }
    if (interaction.isModalSubmit() && interaction.customId === 'verify_code') {
        const state = verifyState.get(interaction.user.id);
        if (!state || Date.now() > state.expiresAt) {
            verifyState.delete(interaction.user.id);
            await safeReply(interaction, {
                embeds: [makeExpiredEmbed()],
                flags: 1 << 6
            });
            return true;
        }
        const inputCode = interaction.fields.getTextInputValue('verify_input').trim();
        if (inputCode.toLowerCase() !== state.code.toLowerCase()) {
            state.attemptsLeft -= 1;
            if (state.attemptsLeft <= 0) {
                verifyState.delete(interaction.user.id);
                await safeReply(interaction, {
                    embeds: [makeExpiredEmbed()],
                    flags: 1 << 6
                });
                return true;
            }
            verifyState.set(interaction.user.id, state);
            await safeReply(interaction, {
                embeds: [makeWrongAnswerEmbed()],
                flags: 1 << 6
            });
            return true;
        }
        verifyState.delete(interaction.user.id);
        const member = interaction.member;
        if (!member || !member.roles) {
            await safeReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setColor('Red')
                        .setDescription('<:vegax:1443934876440068179> Errore interno: membro non trovato.')
                ],
                flags: 1 << 6
            });
            return true;
        }
        const validRoleIds = VERIFY_ROLE_IDS.filter(id => interaction.guild?.roles?.cache?.has(id));
        const rolesToAdd = validRoleIds.filter(id => !member.roles.cache.has(id));
        const deferred = await safeDeferReply(interaction, { flags: 1 << 6 });
        try {
            if (rolesToAdd.length > 0) {
                await member.roles.add(rolesToAdd);
            }
            try {
                const record = await upsertVerifiedMember(interaction.guild.id, member.id, new Date());
                await applyTenureForMember(member, record);
            } catch {}
            const logChannel = interaction.guild?.channels?.cache?.get(VERIFY_LOG_CHANNEL_ID);
            if (logChannel) {
                const createdAtUnix = Math.floor(interaction.user.createdTimestamp / 1000);
                const createdAtText = `<t:${createdAtUnix}:F>`;
                const safeUsername = sanitizeEmbedText(interaction.user.username);
                const logEmbed = new EmbedBuilder()
                    .setColor('#6f4e37')
                    .setTitle(`**${safeUsername}'s Verification Result:**`)
                    .setDescription(
                        `<:profile:1461732907508039834> **Member**: ${safeUsername} **[${interaction.user.id}]**\n` +
                        `<:creation:1461732905016492220> Creation: ${createdAtText}\n\n` +
                        'Status:\n' +
                        `<:space:1461733157840621608><:success:1461731530333229226> \`${safeUsername}\` has passed verification successfully.\n` +
                        '<:space:1461733157840621608><:space:1461733157840621608><:rightSort:1461726104422453298> Auto roles have been assigned as well.'
                    )
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }));
                await logChannel.send({ embeds: [logEmbed] });
            }
            const pingChannel = interaction.guild?.channels?.cache?.get(VERIFY_PING_CHANNEL_ID);
            if (pingChannel) {
                const pingMsg = await pingChannel.send({ content: `<@${interaction.user.id}>` }).catch(() => null);
                if (pingMsg) {
                    setTimeout(() => pingMsg.delete().catch(() => {}), 1);
                }
            }
            if (state.promptMessage) {
                await state.promptMessage.edit({
                    content: '<:vegacheckmark:1443666279058772028> Verification done.',
                    embeds: [],
                    components: []
                }).catch(() => { });
            }
            const serverName = interaction.guild?.name || 'this server';
            if (deferred) {
                await safeEditReply(interaction, {
                    content: '<:vegacheckmark:1443666279058772028> Verification done.'
                });
                await safeReply(interaction, {
                    embeds: [makeVerifiedEmbed(serverName)],
                    flags: 1 << 6
                });
            }
        } catch (err) {
            global.logger.error(err);
            await safeReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setColor('Red')
                        .setDescription('<:vegax:1443934876440068179> Errore durante assegnazione ruoli.')
                ],
                flags: 1 << 6
            });
        }
        return true;
    }
    return false;
}

module.exports = { handleVerifyInteraction };
