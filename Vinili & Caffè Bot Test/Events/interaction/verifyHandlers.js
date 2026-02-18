const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const PImage = require("pureimage");
const { PassThrough } = require("stream");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const IDs = require("../../Utils/Config/ids");

const VERIFY_CODE_TTL_MS = 5 * 60 * 1000;
const VERIFY_MAX_ATTEMPTS = 3;
const VERIFY_LOG_CHANNEL_ID = IDs.channels?.verifyLog || null;
const VERIFY_PING_CHANNEL_ID = IDs.channels?.verifyPing || null;
const VERIFY_CAPTCHA = {
  width: 300,
  height: 100,
  fontSize: 40,
  fontColor: "#33d17a",
  codeLength: 6,
  charset: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  decoys: {
    trace: true,
    mixedUnderEach: true,
    spreadAround: true,
  },
};

const SPONSOR_VERIFY_NICKNAME = ".gg/viniliecaffe";

const {
  upsertVerifiedMember,
  applyTenureForMember,
} = require("../../Services/Community/communityOpsService");
const {
  VerificationTenure,
} = require("../../Schemas/Community/communitySchemas");

const verifyState = new Map();

const fontPathLocal = path.join(
  __dirname,
  "..",
  "..",
  "UI",
  "Fonts",
  "Mojangles.ttf",
);
const fontPathUfficiale = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "Vinili & Caffè Bot Ufficiale",
  "UI",
  "Fonts",
  "Mojangles.ttf",
);
let captchaFontFamily = "captcha";

try {
  const fontPath = fs.existsSync(fontPathLocal)
    ? fontPathLocal
    : fontPathUfficiale;
  PImage.registerFont(fontPath, "captcha").loadSync();
} catch (err) {
  captchaFontFamily = "Arial";
  global.logger?.warn?.("[Bot Test VERIFY] Font fallback Arial:", err?.message);
}

function isSponsorGuild(guildId) {
  const list = IDs.guilds?.sponsorGuildIds || [];
  return guildId && list.includes(guildId);
}

function makeExpiredEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:cancel:1472990340557312041> Unsuccessful Operation!")
    .setDescription(
      "<:space:1472990350795866265> <:rightSort:1472990348086087791> Your verification has expired, you need to press Verify again.",
    );
}

function makeWrongAnswerEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:cancel:1472990340557312041> Unsuccessful Operation!")
    .setDescription(
      "<:space:1472990350795866265> <:rightSort:1472990348086087791> Wrong answer, try again before it's too late.",
    );
}

function makeVerifyStartRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("verify_start")
      .setLabel("Verify")
      .setStyle(ButtonStyle.Success),
  );
}

function makeVerifiedEmbed(serverName) {
  return new EmbedBuilder()
    .setColor("#57f287")
    .setTitle("**You have been verified!**")
    .setDescription(
      `<:success:1472990339223781456> You passed the verification successfully. You can now access \`${serverName}\``,
    );
}

function makeAlreadyVerifiedEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:alarm:1472990352968253511> **You are verified already!**");
}

function makeOwnerEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:cancel:1472990340557312041> Unsuccessful Operation!")
    .setDescription(
      "<:space:1472990350795866265> <:rightSort:1472990348086087791> You are the owner, why would an owner try to verify?",
    );
}

function isUnknownInteraction(error) {
  return error?.code === 10062;
}

function isAlreadyAcknowledged(error) {
  const code = error?.code || error?.rawError?.code;
  return code === 40060 || code === "InteractionAlreadyReplied";
}

function sanitizeEmbedText(value) {
  return String(value || "")
    .replace(/[\\`*_~|>]/g, "\\$&")
    .replace(/\n/g, " ")
    .trim();
}

async function safeReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied)
      await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch (error) {
    if (isUnknownInteraction(error)) return false;
    if (isAlreadyAcknowledged(error)) {
      try {
        if (interaction.deferred && !interaction.replied)
          await interaction.editReply(payload);
        else await interaction.followUp(payload);
      } catch (nestedError) {
        if (isUnknownInteraction(nestedError) || isAlreadyAcknowledged(nestedError))
          return false;
        throw nestedError;
      }
      return true;
    }
    throw error;
  }
  return true;
}

async function safeDeferReply(interaction, payload) {
  try {
    if (!interaction.deferred && !interaction.replied)
      await interaction.deferReply(payload);
  } catch (error) {
    if (isUnknownInteraction(error)) return false;
    if (isAlreadyAcknowledged(error)) return true;
    throw error;
  }
  return true;
}

async function safeEditReply(interaction, payload) {
  try {
    if (interaction.deferred)
      await interaction.editReply(payload);
    else if (interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch (error) {
    if (isUnknownInteraction(error)) return false;
    if (isAlreadyAcknowledged(error)) {
      try {
        if (interaction.deferred && !interaction.replied)
          await interaction.editReply(payload);
        else await interaction.followUp(payload);
      } catch (nestedError) {
        if (isUnknownInteraction(nestedError) || isAlreadyAcknowledged(nestedError))
          return false;
        throw nestedError;
      }
      return true;
    }
    throw error;
  }
  return true;
}

function randomChar(set) {
  const chars = set || VERIFY_CAPTCHA.charset;
  return chars[Math.floor(Math.random() * chars.length)];
}

function makeCode(len = VERIFY_CAPTCHA.codeLength) {
  const targetLen = Math.max(1, Number(len || VERIFY_CAPTCHA.codeLength));
  const code = [];
  while (code.length < targetLen) code.push(randomChar(VERIFY_CAPTCHA.charset));
  return code.join("");
}

async function makeCaptchaPng(code) {
  const width = VERIFY_CAPTCHA.width;
  const height = VERIFY_CAPTCHA.height;
  const img = PImage.make(width, height);
  const ctx = img.getContext("2d");

  ctx.fillStyle = "#1d1f26";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(45,47,58,0.6)";
  for (let i = 0; i < 12; i += 1) {
    const x = Math.floor(Math.random() * width);
    const y = Math.floor(Math.random() * height);
    const w = Math.floor(12 + Math.random() * 40);
    const h = Math.floor(3 + Math.random() * 8);
    ctx.fillRect(x, y, w, h);
  }

  if (VERIFY_CAPTCHA.decoys.spreadAround) {
    ctx.fillStyle = "rgba(140,145,156,0.5)";
    ctx.font = `14pt ${captchaFontFamily}`;
    for (let i = 0; i < 16; i += 1) {
      const x = Math.floor(10 + Math.random() * (width - 20));
      const y = Math.floor(18 + Math.random() * (height - 20));
      const rot = (Math.random() * 50 - 25) * (Math.PI / 180);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillText(randomChar("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"), 0, 0);
      ctx.restore();
    }
  }

  ctx.fillStyle = VERIFY_CAPTCHA.fontColor;
  ctx.font = `${VERIFY_CAPTCHA.fontSize}pt ${captchaFontFamily}`;

  const chars = code.split("");
  const points = [];
  const step = Math.floor((width - 40) / Math.max(chars.length, 1));
  chars.forEach((ch, i) => {
    const x = 20 + i * step + Math.floor(Math.random() * 4);
    const y = 68 + Math.floor(Math.random() * 6);
    const rot = (Math.random() * 12 - 6) * (Math.PI / 180);
    points.push({ x: x + 5, y: y - 14 });
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillText(ch, 0, 0);
    ctx.restore();

    if (VERIFY_CAPTCHA.decoys.mixedUnderEach) {
      ctx.fillStyle = "rgba(180,190,210,0.6)";
      ctx.font = `14pt ${captchaFontFamily}`;
      ctx.fillText(
        randomChar("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"),
        x + 2,
        y + 18,
      );
      ctx.fillStyle = VERIFY_CAPTCHA.fontColor;
      ctx.font = `${VERIFY_CAPTCHA.fontSize}pt ${captchaFontFamily}`;
    }
  });

  if (VERIFY_CAPTCHA.decoys.trace) {
    ctx.strokeStyle = "rgba(46,204,113,0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    points.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 80; i += 1) {
    const x = Math.floor(Math.random() * width);
    const y = Math.floor(Math.random() * height);
    ctx.fillRect(x, y, 2, 2);
  }

  const stream = new PassThrough();
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk));
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
    const role =
      guild.roles.cache.get(roleId) ||
      (await guild.roles.fetch(roleId).catch(() => null));
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
          .setColor("Red")
          .setDescription(
            "<:vegax:1472992044140990526> Ruoli verifica non configurati correttamente.",
          ),
      ],
      flags: 1 << 6,
    });
    return true;
  }

  const rolesToAdd = validRoleIds.filter((id) => !member.roles.cache.has(id));
  await safeDeferReply(interaction, { flags: 1 << 6 });

  if (rolesToAdd.length > 0) {
    await member.roles.add(rolesToAdd).catch((err) => {
      global.logger?.error?.("[Bot Test VERIFY] Failed to add roles:", err);
    });
  }

  try {
    const record = await upsertVerifiedMember(guildId, member.id, new Date());
    await applyTenureForMember(member, record);
  } catch (err) {
    global.logger?.warn?.(
      "[Bot Test VERIFY] upsertVerifiedMember/applyTenure:",
      err?.message || err,
    );
  }

  try {
    if (
      (member.nickname || "") !== SPONSOR_VERIFY_NICKNAME &&
      member.manageable !== false
    ) {
      await member.setNickname(SPONSOR_VERIFY_NICKNAME).catch((err) => {
        global.logger?.warn?.(
          "[Bot Test VERIFY] setNickname:",
          err?.message || err,
        );
      });
    }
  } catch (_) {}

  const logChannel = VERIFY_LOG_CHANNEL_ID
    ? guild?.channels?.cache?.get(VERIFY_LOG_CHANNEL_ID)
    : null;
  if (logChannel) {
    const createdAtUnix = Math.floor(interaction.user.createdTimestamp / 1000);
    const createdAtText = `<t:${createdAtUnix}:F>`;
    const safeUsername = sanitizeEmbedText(interaction.user.username);
    const logEmbed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`**${safeUsername}'s Verification Result:**`)
      .setDescription(
        `<:profile:1472990335297912907> **Member**: ${safeUsername} **[${interaction.user.id}]**\n` +
          `<:creation:1472990337361379428> Creation: ${createdAtText}\n\n` +
          "Status:\n" +
          `<:space:1472990350795866265><:success:1472990339223781456> \`${safeUsername}\` has passed verification successfully.`,
      )
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }));
    await logChannel.send({ embeds: [logEmbed] }).catch((err) => {
      global.logger?.warn?.(
        "[Bot Test VERIFY] logChannel.send",
        err?.message || err,
      );
    });
  }

  const pingChannel = VERIFY_PING_CHANNEL_ID
    ? guild?.channels?.cache?.get(VERIFY_PING_CHANNEL_ID)
    : null;
  if (pingChannel) {
    const pingMsg = await pingChannel
      .send({ content: `<@${interaction.user.id}>` })
      .catch(() => null);
    if (pingMsg) setTimeout(() => pingMsg.delete().catch(() => {}), 1);
  }

  const serverName = guild?.name || "this server";
  await safeEditReply(interaction, {
    content: "<:vegacheckmark:1472992042203349084> Verification done.",
    embeds: [makeVerifiedEmbed(serverName)],
  });

  return true;
}

async function handleVerifyInteraction(interaction) {
  if (!interaction.guild) {
    await safeReply(interaction, {
      content: "Usa questo comando in un server.",
      flags: 1 << 6,
    }).catch(() => {});
    return true;
  }
  if (mongoose.connection.readyState !== 1) {
    await safeReply(interaction, {
      content: "Database non ancora connesso. Riprova tra qualche secondo.",
      flags: 1 << 6,
    }).catch(() => {});
    return true;
  }
  if (interaction.isButton()) {
    if (interaction.customId === "verify_start") {
      const guildId = interaction.guild?.id;

      if (interaction.guild?.ownerId === interaction.user.id) {
        await safeReply(interaction, {
          embeds: [makeOwnerEmbed()],
          flags: 1 << 6,
        });
        return true;
      }

      if (isAlreadyVerifiedInThisGuild(interaction.member, guildId)) {
        await safeReply(interaction, {
          embeds: [makeAlreadyVerifiedEmbed()],
          flags: 1 << 6,
        });
        return true;
      }

      const existing = verifyState.get(interaction.user.id);
      if (existing?.timeoutId) clearTimeout(existing.timeoutId);

      const deferred = await safeDeferReply(interaction, { flags: 1 << 6 });
      if (!deferred) return true;

      const code = makeCode(VERIFY_CAPTCHA.codeLength);
      const captchaPng = await makeCaptchaPng(code);
      const captchaFile = new AttachmentBuilder(captchaPng, {
        name: "captcha.png",
      });

      verifyState.set(interaction.user.id, {
        code,
        expiresAt: Date.now() + VERIFY_CODE_TTL_MS,
        attemptsLeft: VERIFY_MAX_ATTEMPTS,
      });

      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setDescription(
          `<:verification:1472989484059459758> Hello! Are you human? Let's find out!\n` +
            "`Please type the captcha below to be able to access this server!`\n\n" +
            "**Additional Notes:**\n" +
            "<:tracedColored:1472990341916266561> Type out the traced colored characters from left to right.\n" +
            "<:decoy:1472990344093110334> Ignore the decoy characters spread-around.\n" +
            "<:nocases:1472990346429468784> You do not have to respect characters cases (upper/lower case)!\n\n",
        )
        .setFooter({ text: "Verification Period: 5 minutes" })
        .setImage("attachment://captcha.png");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("verify_enter")
          .setLabel("Answer")
          .setStyle(ButtonStyle.Primary),
      );

      await safeEditReply(interaction, {
        embeds: [embed],
        components: [row],
        files: [captchaFile],
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

    if (interaction.customId === "verify_enter") {
      const state = verifyState.get(interaction.user.id);
      if (!state || Date.now() > state.expiresAt) {
        verifyState.delete(interaction.user.id);
        try {
          await interaction.deferUpdate();
          const retryRow = makeVerifyStartRow();
          await interaction.message
            .edit({
              embeds: [makeExpiredEmbed()],
              components: [retryRow],
              files: [],
            })
            .catch(() => {});
        } catch {
          if (!interaction.replied && !interaction.deferred) {
            await safeReply(interaction, {
              embeds: [makeExpiredEmbed()],
              components: [makeVerifyStartRow()],
              flags: 1 << 6,
            });
          }
        }
        return true;
      }

      state.promptMessage = interaction.message;
      verifyState.set(interaction.user.id, state);

      const modal = new ModalBuilder()
        .setCustomId(`verify_code:${interaction.user.id}`)
        .setTitle("Captcha Answer");
      const input = new TextInputBuilder()
        .setCustomId("verify_input")
        .setLabel("Answer")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("Type the captcha text here")
        .setMaxLength(VERIFY_CAPTCHA.codeLength);

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

  if (
    interaction.isModalSubmit() &&
    String(interaction.customId || "").startsWith("verify_code:")
  ) {
    const state = verifyState.get(interaction.user.id);
    if (!state || Date.now() > state.expiresAt) {
      verifyState.delete(interaction.user.id);
      const retryRow = makeVerifyStartRow();
      if (state?.promptMessage) {
        await state.promptMessage
          .edit({
            embeds: [makeExpiredEmbed()],
            components: [retryRow],
            files: [],
          })
          .catch(() => {});
      }
      await safeReply(interaction, {
        embeds: [makeExpiredEmbed()],
        components: [makeVerifyStartRow()],
        flags: 1 << 6,
      });
      return true;
    }

    const inputCode = interaction.fields
      .getTextInputValue("verify_input")
      .trim();
    if (inputCode.toLowerCase() !== state.code.toLowerCase()) {
      state.attemptsLeft -= 1;
      if (state.attemptsLeft <= 0) {
        verifyState.delete(interaction.user.id);
        const retryRow = makeVerifyStartRow();
        if (state?.promptMessage) {
          await state.promptMessage
            .edit({
              embeds: [makeExpiredEmbed()],
              components: [retryRow],
              files: [],
            })
            .catch(() => {});
        }
        await safeReply(interaction, {
          embeds: [makeExpiredEmbed()],
          components: [makeVerifyStartRow()],
          flags: 1 << 6,
        });
        return true;
      }
      verifyState.set(interaction.user.id, state);
      await safeReply(interaction, {
        embeds: [makeWrongAnswerEmbed()],
        flags: 1 << 6,
      });
      return true;
    }

    verifyState.delete(interaction.user.id);

    const member = interaction.member;
    if (!member || !member.roles) {
      await safeReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1472992044140990526> Errore interno: membro non trovato.",
            ),
        ],
        flags: 1 << 6,
      });
      return true;
    }

    if (state.promptMessage) {
      await state.promptMessage
        .edit({
          content: "<:vegacheckmark:1472992042203349084> Verification done.",
          embeds: [],
          components: [],
        })
        .catch(() => {});
    }

    return await finalizeVerification(interaction, member);
  }

  return false;
}

module.exports = { handleVerifyInteraction };
