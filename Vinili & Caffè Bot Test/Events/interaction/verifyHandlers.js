const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const PImage = require('pureimage');
const { PassThrough } = require('stream');
const path = require('path');
const fs = require('fs');
const IDs = require('../../Utils/Config/ids');

const VERIFY_CODE_TTL_MS = 5 * 60 * 1000;
const VERIFY_MAX_ATTEMPTS = 3;
const VERIFY_LOG_CHANNEL_ID = IDs.channels?.verifyLog || null;
const VERIFY_PING_CHANNEL_ID = IDs.channels?.verifyPing || null;

const SPONSOR_VERIFY_NICKNAME = '.gg/viniliecaffe';

const { upsertVerifiedMember, applyTenureForMember } = require('../../Services/Community/communityOpsService');
const { VerificationTenure } = require('../../Schemas/Community/communitySchemas');

const verifyState = new Map();

const fontPathLocal = path.join(__dirname, '..', '..', 'UI', 'Fonts', 'Mojangles.ttf');
const fontPathUfficiale = path.join(__dirname, '..', '..', '..', 'Vinili & Caffè Bot Ufficiale', 'UI', 'Fonts', 'Mojangles.ttf');
let captchaFontFamily = 'captcha';

try {
  const fontPath = fs.existsSync(fontPathLocal) ? fontPathLocal : fontPathUfficiale;
  PImage.registerFont(fontPath, 'captcha').loadSync();
} catch (err) {
  captchaFontFamily = 'Arial';
  global.logger?.warn?.('[Bot Test VERIFY] Font fallback Arial:', err?.message);
}

function isSponsorGuild(guildId) {
  const list = IDs.guilds?.sponsorGuildIds || [];
  return guildId && list.includes(guildId);
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
    .setDescription(`<:success:1461731530333229226> You passed the verification successfully. You can now access \`${serverName}\``);
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
  return String(value || '')
    .replace(/[\\`*_~|>]/g, '\\$&')
    .replace(/\n/g, ' ')
    .trim();
}

async function safeReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch (error) {
    if (isUnknownInteraction(error)) return false;
    throw error;
  }
  return true;
}

async function safeDeferReply(interaction, payload) {
  try {
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply(payload);
  } catch (error) {
    if (isUnknownInteraction(error)) return false;
    throw error;
  }
  return true;
}

async function safeEditReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
    else await interaction.reply(payload);
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
  while (code.length < minLen) code.push(randomChar(combined));
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
  stream.on('data', (chunk) => chunks.push(chunk));
  await PImage.encodePNGToStream(img, stream);
  return Buffer.concat(chunks);
}

async function resolveValidVerifyRoleIds(guild) {
  if (!guild) return [];
  const gid = guild.id;
  const sponsorRole = IDs.verificatoRoleIds?.[gid];
  const roleIds = sponsorRole ? [sponsorRole] : [];

  const valid = [];
  for (const roleId of roleIds) {
    const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
    if (role?.id) valid.push(role.id);
  }
  return Array.from(new Set(valid));
}

function isAlreadyVerifiedInThisGuild(member, guildId) {
  if (!member?.roles?.cache) return false;
  const rid = IDs.verificatoRoleIds?.[guildId];
  return rid ? member.roles.cache.has(rid) : false;
}

async function finalizeVerification(interaction, member) {
  const guild = interaction.guild;
  const guildId = guild?.id;

  const validRoleIds = await resolveValidVerifyRoleIds(guild);
  if (!validRoleIds.length) {
    await safeReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setDescription('<:vegax:1443934876440068179> Ruoli verifica non configurati correttamente.')
      ],
      flags: 1 << 6
    });
    return true;
  }

  const rolesToAdd = validRoleIds.filter((id) => !member.roles.cache.has(id));
  await safeDeferReply(interaction, { flags: 1 << 6 });

  if (rolesToAdd.length > 0) {
    await member.roles.add(rolesToAdd).catch((err) => {
      global.logger?.error?.('[Bot Test VERIFY] Failed to add roles:', err);
    });
  }

  try {
    const record = await upsertVerifiedMember(guildId, member.id, new Date());
    await applyTenureForMember(member, record);
  } catch (_) {}

  try {
    if ((member.nickname || '') !== SPONSOR_VERIFY_NICKNAME && member.manageable !== false) {
      await member.setNickname(SPONSOR_VERIFY_NICKNAME).catch(() => {});
    }
  } catch (_) {}

  const logChannel = VERIFY_LOG_CHANNEL_ID ? guild?.channels?.cache?.get(VERIFY_LOG_CHANNEL_ID) : null;
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
          `<:space:1461733157840621608><:success:1461731530333229226> \`${safeUsername}\` has passed verification successfully.`
      )
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }));
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  }

  const pingChannel = VERIFY_PING_CHANNEL_ID ? guild?.channels?.cache?.get(VERIFY_PING_CHANNEL_ID) : null;
  if (pingChannel) {
    const pingMsg = await pingChannel.send({ content: `<@${interaction.user.id}>` }).catch(() => null);
    if (pingMsg) setTimeout(() => pingMsg.delete().catch(() => {}), 1);
  }

  const serverName = guild?.name || 'this server';
  await safeEditReply(interaction, {
    content: '<:vegacheckmark:1443666279058772028> Verification done.',
    embeds: [makeVerifiedEmbed(serverName)]
  });

  return true;
}

async function handleVerifyInteraction(interaction) {
  if (interaction.isButton()) {
    if (interaction.customId === 'verify_start') {
      const guildId = interaction.guild?.id;

      if (interaction.guild?.ownerId === interaction.user.id) {
        await safeReply(interaction, { embeds: [makeOwnerEmbed()], flags: 1 << 6 });
        return true;
      }

      if (isAlreadyVerifiedInThisGuild(interaction.member, guildId)) {
        await safeReply(interaction, { embeds: [makeAlreadyVerifiedEmbed()], flags: 1 << 6 });
        return true;
      }

      const existing = verifyState.get(interaction.user.id);
      if (existing?.timeoutId) clearTimeout(existing.timeoutId);

      const deferred = await safeDeferReply(interaction, { flags: 1 << 6 });
      if (!deferred) return true;

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
        .setDescription(
          `<:verification:1461725843125571758> Hello! Are you human? Let's find out!\n` +
            '`Please type the captcha below to be able to access this server!`\n\n' +
            '**Additional Notes:**\n' +
            '<:tracedColored:1461728858955976805> Type out the traced colored characters from left to right.\n' +
            '<:decoy:1461728857114546421> Ignore the decoy characters spread-around.\n' +
            '<:nocases:1461728855642341509> You do not have to respect characters cases (upper/lower case)!\n\n'
        )
        .setFooter({ text: 'Verification Period: 5 minutes' })
        .setImage('attachment://captcha.png');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('verify_enter').setLabel('Answer').setStyle(ButtonStyle.Primary)
      );

      await safeEditReply(interaction, {
        embeds: [embed],
        components: [row],
        files: [captchaFile]
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
      } catch (_) {}

      return true;
    }

    if (interaction.customId === 'verify_enter') {
      const state = verifyState.get(interaction.user.id);
      if (!state || Date.now() > state.expiresAt) {
        verifyState.delete(interaction.user.id);
        try {
          await interaction.deferUpdate();
          const retryRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('verify_start').setLabel('Verify').setStyle(ButtonStyle.Success)
          );
          await interaction.message.edit({
            embeds: [makeExpiredEmbed()],
            components: [retryRow],
            files: []
          }).catch(() => {});
        } catch {
          if (!interaction.replied && !interaction.deferred) {
            await safeReply(interaction, { embeds: [makeExpiredEmbed()], flags: 1 << 6 });
          }
        }
        return true;
      }

      state.promptMessage = interaction.message;
      verifyState.set(interaction.user.id, state);

      const modal = new ModalBuilder().setCustomId(`verify_code:${interaction.user.id}`).setTitle('Captcha Answer');
      const input = new TextInputBuilder()
        .setCustomId('verify_input')
        .setLabel('Answer')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Type the captcha text here')
        .setMaxLength(6);

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);

      try {
        await interaction.showModal(modal);
      } catch (error) {
        if (!isUnknownInteraction(error)) throw error;
      }
      return true;
    }
  }

  if (interaction.isModalSubmit() && String(interaction.customId || '').startsWith('verify_code:')) {
    const state = verifyState.get(interaction.user.id);
    if (!state || Date.now() > state.expiresAt) {
      verifyState.delete(interaction.user.id);
      try {
        await interaction.deferUpdate();
        const retryRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('verify_start').setLabel('Verify').setStyle(ButtonStyle.Success)
        );
        await interaction.message.edit({
          embeds: [makeExpiredEmbed()],
          components: [retryRow],
          files: []
        }).catch(() => {});
      } catch {
        if (!interaction.replied && !interaction.deferred) {
          await safeReply(interaction, { embeds: [makeExpiredEmbed()], flags: 1 << 6 });
        }
      }
      return true;
    }

    const inputCode = interaction.fields.getTextInputValue('verify_input').trim();
    if (inputCode.toLowerCase() !== state.code.toLowerCase()) {
      state.attemptsLeft -= 1;
      if (state.attemptsLeft <= 0) {
        verifyState.delete(interaction.user.id);
        try {
          await interaction.deferUpdate();
          const retryRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('verify_start').setLabel('Verify').setStyle(ButtonStyle.Success)
          );
          await interaction.message.edit({
            embeds: [makeExpiredEmbed()],
            components: [retryRow],
            files: []
          }).catch(() => {});
        } catch {
          if (!interaction.replied && !interaction.deferred) {
            await safeReply(interaction, { embeds: [makeExpiredEmbed()], flags: 1 << 6 });
          }
        }
        return true;
      }
      verifyState.set(interaction.user.id, state);
      await safeReply(interaction, { embeds: [makeWrongAnswerEmbed()], flags: 1 << 6 });
      return true;
    }

    verifyState.delete(interaction.user.id);

    const member = interaction.member;
    if (!member || !member.roles) {
      await safeReply(interaction, {
        embeds: [new EmbedBuilder().setColor('Red').setDescription('<:vegax:1443934876440068179> Errore interno: membro non trovato.')],
        flags: 1 << 6
      });
      return true;
    }

    if (state.promptMessage) {
      await state.promptMessage
        .edit({
          content: '<:vegacheckmark:1443666279058772028> Verification done.',
          embeds: [],
          components: []
        })
        .catch(() => {});
    }

    return await finalizeVerification(interaction, member);
  }

  return false;
}

module.exports = { handleVerifyInteraction };
