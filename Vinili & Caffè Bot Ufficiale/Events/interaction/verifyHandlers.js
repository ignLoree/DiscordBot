const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, } = require("discord.js");
const PImage = require("pureimage");
const { PassThrough } = require("stream");
const path = require("path");
const IDs = require("../../Utils/Config/ids");

const VERIFY_CODE_TTL_MS = 5 * 60 * 1000;
const VERIFY_MAX_ATTEMPTS = 3;
const CENTRAL_VERIFY_LOG_CHANNEL_ID = IDs.channels.verifyLogs || IDs.channels.modLogs || "1442569294796820541";
const VERIFY_PING_CHANNEL_ID = IDs.channels.news;
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

const MAIN_GUILD_ID = IDs.guilds?.main || "1329080093599076474";

function isSponsorGuildVerify(guildId) {
  if (!guildId || guildId === MAIN_GUILD_ID) return false;
  return Boolean(IDs.verificatoRoleIds?.[guildId]);
}

const MAIN_VERIFIED_ROLE_ID = IDs.roles?.Member || null;

async function isUserInMainGuild(client, userId) {
  if (!client || !userId) return false;
  const guild = client.guilds.cache.get(MAIN_GUILD_ID) || (await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null));
  if (!guild) return false;
  const member = guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
  return Boolean(member);
}

/** Per avviare la verifica in uno server sponsor l'utente deve essere nel main E verificato (ruolo Member). */
async function isUserVerifiedInMainGuild(client, userId) {
  if (!client || !userId) return false;
  const guild = client.guilds.cache.get(MAIN_GUILD_ID) || (await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null));
  if (!guild) return false;
  const member = guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
  if (!member?.roles?.cache) return false;
  if (!MAIN_VERIFIED_ROLE_ID) return Boolean(member);
  return member.roles.cache.has(MAIN_VERIFIED_ROLE_ID);
}

const { upsertVerifiedMember, applyTenureForMember, } = require("../../Services/Community/communityOpsService");
const {
  VerificationTenure,
} = require("../../Schemas/Community/communitySchemas");

const verifyState = new Map();

const fontPath = path.join(
  __dirname,
  "..",
  "..",
  "UI",
  "Fonts",
  "Mojangles.ttf",
);
let captchaFontFamily = "captcha";

try {
  PImage.registerFont(fontPath, "captcha").loadSync();
} catch (err) {
  captchaFontFamily = "Arial";
  global.logger?.warn?.(
    "[VERIFY] Failed to load captcha font, text may not render:",
    err,
  );
}

function makeExpiredEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:cancel:1461730653677551691> Unsuccessful Operation!")
    .setDescription(
      "<:space:1461733157840621608> <:rightSort:1461726104422453298> Your verification has expired, you need to press Verify again.",
    );
}

function makeWrongAnswerEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:cancel:1461730653677551691> Unsuccessful Operation!")
    .setDescription(
      "<:space:1461733157840621608> <:rightSort:1461726104422453298> Wrong answer, try again before it's too late.",
    );
}

function makeTooManyAttemptsEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:cancel:1461730653677551691> Unsuccessful Operation!")
    .setDescription(
      "<:space:1461733157840621608> <:rightSort:1461726104422453298> Too many wrong attempts. Press **Verify** to start again.",
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
      `<:success:1461731530333229226> You passed the verification successfully. You can now access \`${serverName}\``,
    );
}

function makeAlreadyVerifiedEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:alarm:1461725841451909183> **You are verified already!**");
}

function makeOwnerEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:cancel:1461730653677551691> Unsuccessful Operation!")
    .setDescription(
      "<:space:1461733157840621608> <:rightSort:1461726104422453298> You are the owner, why would an owner try to verify?",
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

  let roleIds = [];
  if (gid === MAIN_GUILD_ID) {
    roleIds = [
      IDs.roles.Member,
      IDs.roles.separatore6,
      IDs.roles.separatore8,
      IDs.roles.separatore5,
      IDs.roles.separatore7,
    ].filter(Boolean);
  } else {
    const sponsorRoleId = IDs.verificatoRoleIds?.[gid];
    roleIds = sponsorRoleId ? [sponsorRoleId] : [];
  }

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

  if (guildId === MAIN_GUILD_ID) {
    const ids = [IDs.roles.Member].filter(Boolean);
    return ids.some((id) => member.roles.cache.has(id));
  }

  const sponsorRoleId = IDs.verificatoRoleIds?.[guildId];
  if (sponsorRoleId && member.roles.cache.has(sponsorRoleId)) return true;
  return false;
}

async function finalizeVerification(interaction, member) {
  const guild = interaction.guild;
  const guildId = guild?.id;

  if (!guild || !guildId) {
    await safeReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<:vegax:1443934876440068179> Verifica disponibile solo nei server.",
          ),
      ],
      flags: 1 << 6,
    }).catch(() => {});
    return true;
  }

  const freshMember =
    member?.id &&
    (await guild.members.fetch(member.id).catch(() => null));
  const targetMember = freshMember || member;
  if (!targetMember?.roles?.cache) {
    await safeReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<:vegax:1443934876440068179> Impossibile caricare il membro. Riprova.",
          ),
      ],
      flags: 1 << 6,
    }).catch(() => {});
    return true;
  }

  const validRoleIds = await resolveValidVerifyRoleIds(guild);
  if (!validRoleIds.length) {
    await safeReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<:vegax:1443934876440068179> Ruoli verifica non configurati correttamente.",
          ),
      ],
      flags: 1 << 6,
    });
    return true;
  }

  const rolesToAdd = validRoleIds.filter(
    (id) => !targetMember.roles.cache.has(id),
  );
  await safeDeferReply(interaction, { flags: 1 << 6 });

  if (rolesToAdd.length > 0) {
    await targetMember.roles.add(rolesToAdd).catch((err) => {
      global.logger?.error?.("[VERIFY] Failed to add roles:", err);
    });
  }

  try {
    const record = await upsertVerifiedMember(
      guildId,
      targetMember.id,
      new Date(),
    );
    await applyTenureForMember(targetMember, record);
  } catch (err) {
    global.logger?.warn?.("[VERIFY] upsertVerifiedMember/applyTenureForMember:", err);
  }

  const mainGuild =
    interaction.client.guilds.cache.get(MAIN_GUILD_ID) ||
    (await interaction.client.guilds.fetch(MAIN_GUILD_ID).catch(() => null));
  const logChannel =
    mainGuild?.channels?.cache?.get(CENTRAL_VERIFY_LOG_CHANNEL_ID) ||
    (mainGuild
      ? await mainGuild.channels.fetch(CENTRAL_VERIFY_LOG_CHANNEL_ID).catch(() => null)
      : null);
  if (logChannel?.isTextBased?.()) {
    const createdAtUnix = Math.floor(interaction.user.createdTimestamp / 1000);
    const createdAtText = `<t:${createdAtUnix}:F>`;
    const safeUsername = sanitizeEmbedText(interaction.user.username);
    const serverName = guild?.name || "Unknown";

    const logEmbed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`**${safeUsername}'s Verification Result**`)
      .setDescription(
        `<:profile:1461732907508039834> **Member**: ${safeUsername} **[${interaction.user.id}]**\n` +
          `<:creation:1461732905016492220> Creation: ${createdAtText}\n` +
          `**Server**: ${sanitizeEmbedText(serverName)}\n\n` +
          "Status:\n" +
          `<:space:1461733157840621608><:success:1461731530333229226> \`${safeUsername}\` has passed verification successfully.\n` +
          "<:space:1461733157840621608><:space:1461733157840621608><:rightSort:1461726104422453298> Auto roles have been assigned as well.",
      )
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }));

    await logChannel.send({ embeds: [logEmbed] }).catch((err) => {
      global.logger?.warn?.("[VERIFY] Failed to send verification log:", err);
    });
  } else if (CENTRAL_VERIFY_LOG_CHANNEL_ID) {
    global.logger?.warn?.("[VERIFY] Central verify log channel not found:", CENTRAL_VERIFY_LOG_CHANNEL_ID);
  }

  const pingChannel =
    guild?.channels?.cache?.get(VERIFY_PING_CHANNEL_ID) ||
    (VERIFY_PING_CHANNEL_ID
      ? await guild.channels.fetch(VERIFY_PING_CHANNEL_ID).catch(() => null)
      : null);
  if (pingChannel) {
    const pingMsg = await pingChannel
      .send({ content: `<@${interaction.user.id}>` })
      .catch(() => null);
    if (pingMsg) setTimeout(() => pingMsg.delete().catch(() => {}), 1);
  }

  const serverName = guild?.name || "this server";
  await safeEditReply(interaction, {
    content: "<:vegacheckmark:1443666279058772028> Verification done.",
    embeds: [makeVerifiedEmbed(serverName)],
  });

  return true;
}

async function handleVerifyInteraction(interaction) {
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

      if (isSponsorGuildVerify(guildId)) {
        const verifiedInMain = await isUserVerifiedInMainGuild(interaction.client, interaction.user.id);
        if (!verifiedInMain) {
          await safeReply(interaction, {
            embeds: [
              new EmbedBuilder()
                .setColor("Red")
                .setTitle("<:alarm:1461725841451909183> Server principale richiesto")
                .setDescription(
                  "Per verificarti in questo server devi essere nel **server principale Vinili & Caffè** e aver completato la **verifica** lì.\n\n" +
                    "<:rightSort:1461726104422453298> Unisciti qui: **https://discord.gg/viniliecaffe**\n" +
                    "<:rightSort:1461726104422453298> Completa la verifica nel server principale (pulsante Verify)\n" +
                    "Poi torna qui e clicca di nuovo **Verify**.",
                ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
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
          `<:verification:1461725843125571758> Hello! Are you human? Let's find out!\n` +
            "`Please type the captcha below to be able to access this server!`\n\n" +
            "**Additional Notes:**\n" +
            "<:tracedColored:1461728858955976805> Type out the traced colored characters from left to right.\n" +
            "<:decoy:1461728857114546421> Ignore the decoy characters spread-around.\n" +
            "<:nocases:1461728855642341509> You do not have to respect characters cases (upper/lower case)!\n\n",
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
      } catch {}

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

    let inputCode = "";
    try {
      inputCode = String(
        interaction.fields.getTextInputValue("verify_input") ?? "",
      ).trim();
    } catch {
      await safeReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Risposta non valida. Riprova con **Verify**.",
            ),
        ],
        flags: 1 << 6,
      }).catch(() => {});
      return true;
    }
    if (inputCode.toLowerCase() !== state.code.toLowerCase()) {
      state.attemptsLeft -= 1;
      if (state.attemptsLeft <= 0) {
        verifyState.delete(interaction.user.id);
        const retryRow = makeVerifyStartRow();
        if (state?.promptMessage) {
          await state.promptMessage
            .edit({
              embeds: [makeTooManyAttemptsEmbed()],
              components: [retryRow],
              files: [],
            })
            .catch(() => {});
        }
        await safeReply(interaction, {
          embeds: [makeTooManyAttemptsEmbed()],
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
              "<:vegax:1443934876440068179> Errore interno: membro non trovato.",
            ),
        ],
        flags: 1 << 6,
      });
      return true;
    }

    if (state.promptMessage) {
      await state.promptMessage
        .edit({
          content: "<:vegacheckmark:1443666279058772028> Verification done.",
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

module.exports.hasActiveVerifySession = function hasActiveVerifySession(userId) {
  if (!userId) return false;
  const state = verifyState.get(String(userId));
  if (!state) return false;
  if (Date.now() > Number(state.expiresAt || 0)) return false;
  return true;
};