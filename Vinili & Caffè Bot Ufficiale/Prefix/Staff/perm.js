const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { parseDuration, formatDuration, } = require("../../Utils/Moderation/moderation");
const { parseCommandTokenList, parseRevokeTokenList, grantTemporaryCommandPermissions, revokeTemporaryCommandPermissions, clearTemporaryCommandPermissionsForUser, listTemporaryCommandPermissionsForUser, } = require("../../Utils/Moderation/temporaryCommandPermissions");
const IDs = require("../../Utils/Config/ids");

const PERMISSIONS_PATH = path.join(__dirname, "..", "..", "permissions.json");

function buildUsageEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Permessi")
    .setDescription(
      [
        "Permessi temporanei:",
        "`+perm grant <@utente|id> <durata> <comando1,comando2,...>`",
        "`+perm revoke <@utente|id> <comando1,comando2,...>`",
        "`+perm list <@utente|id>`",
        "`+perm clear <@utente|id>`",
        "",
        "Whitelist canali per comando:",
        "`+perm channel-set <comando> <#canale|id|channels.key,...>`",
        "`+perm channel-add <comando> <#canale|id|channels.key,...>`",
        "`+perm channel-remove <comando> <#canale|id|channels.key,...>`",
        "`+perm channel-clear <comando>`",
        "`+perm channel-list [comando]`",
        "",
        "Durate supportate: `30m`, `2h`, `3d`",
        "Formato comando supportato: `partnership`, `slash:partnership`, `prefix:level.add`",
      ].join("\n"),
    );
}

function readPermissionsConfig() {
  try {
    if (!fs.existsSync(PERMISSIONS_PATH)) {
      return { slash: {}, prefix: {}, channels: {}, buttons: {}, selectMenus: {}, modals: {} };
    }
    const raw = fs.readFileSync(PERMISSIONS_PATH, "utf8");
    const parsed = JSON.parse(raw) || {};
    if (!parsed.channels || typeof parsed.channels !== "object") parsed.channels = {};
    return parsed;
  } catch {
    return { slash: {}, prefix: {}, channels: {}, buttons: {}, selectMenus: {}, modals: {} };
  }
}

function writePermissionsConfig(config) {
  const next = config && typeof config === "object" ? config : {};
  if (!next.channels || typeof next.channels !== "object") next.channels = {};
  fs.writeFileSync(PERMISSIONS_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

function resolveChannelToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const mention = raw.replace(/[<#>]/g, "");
  if (/^\d{16,20}$/.test(mention)) return mention;

  let key = raw;
  if (key.startsWith("ids.channels.")) key = key.slice("ids.channels.".length);
  else if (key.startsWith("channels.")) key = key.slice("channels.".length);

  const entries = Object.entries(IDs?.channels || {});
  const found = entries.find(([k]) => String(k).toLowerCase() === String(key).toLowerCase());
  return found?.[1] ? String(found[1]) : null;
}

function parseCommandKey(rawCommand) {
  const tokens = parseCommandTokenList(rawCommand);
  return tokens[0] || null;
}

function parseChannelIdList(message, rawText) {
  const ids = new Set();

  const mentioned = message?.mentions?.channels;
  if (mentioned && typeof mentioned.forEach === "function") {
    mentioned.forEach((channel) => {
      if (channel?.id) ids.add(String(channel.id));
    });
  }

  const chunks = String(rawText || "")
    .split(/[\s,]+/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const resolved = resolveChannelToken(chunk);
    if (resolved) ids.add(resolved);
  }

  return Array.from(ids);
}

async function resolveTargetUser(message, raw) {
  const fromMention = message.mentions?.users?.first();
  if (fromMention) return fromMention;
  const id = String(raw || "").replace(/[<@!>]/g, "");
  if (!/^\d{16,20}$/.test(id)) return null;
  return message.client.users.fetch(id).catch(() => null);
}

function formatRemaining(expiresAt) {
  const expires = new Date(expiresAt).getTime();
  const remaining = Math.max(0, expires - Date.now());
  return formatDuration(remaining);
}

function formatChannelMentions(channelIds) {
  if (!Array.isArray(channelIds) || channelIds.length === 0) return "Nessun canale.";
  return channelIds.map((id) => `<#${id}>`).join(", ");
}

module.exports = {
  name: "perm",
  aliases: [
    "tempperm",
    "permgrant",
    "permrevoke",
    "permlist",
    "permclear",
    "permchannel",
    "permchannels",
  ],
  subcommands: [
    "grant",
    "revoke",
    "list",
    "clear",
    "channel-set",
    "channel-add",
    "channel-remove",
    "channel-clear",
    "channel-list",
  ],
  subcommandAliases: {
    permgrant: "grant",
    permrevoke: "revoke",
    permlist: "list",
    permclear: "clear",
  },

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});

    let sub = String(args[0] || "")
      .trim()
      .toLowerCase();

    if (sub === "channel" || sub === "channels") {
      const nested = String(args[1] || "")
        .trim()
        .toLowerCase();
      if (nested) {
        sub = `channel-${nested}`;
        args = [sub, ...args.slice(2)];
      }
    }

    const valid = new Set([
      "grant",
      "revoke",
      "list",
      "clear",
      "channel-set",
      "channel-add",
      "channel-remove",
      "channel-clear",
      "channel-list",
    ]);

    if (!sub || !valid.has(sub)) {
      return safeMessageReply(message, {
        embeds: [buildUsageEmbed()],
        allowedMentions: { repliedUser: false },
      });
    }

    if (sub.startsWith("channel-")) {
      const commandTokenRaw = args[1] || "";
      const commandKey = parseCommandKey(commandTokenRaw);

      if (sub !== "channel-list" && (!commandKey || !commandKey.includes(":"))) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Comando non valido. Esempio: `prefix:top` oppure `slash:partnership`.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      const data = readPermissionsConfig();
      if (!data.channels || typeof data.channels !== "object") data.channels = {};

      if (sub === "channel-set") {
        const channelIds = parseChannelIdList(message, args.slice(2).join(" "));
        if (!channelIds.length) {
          return safeMessageReply(message, {
            embeds: [
              new EmbedBuilder()
                .setColor("Red")
                .setDescription("<:vegax:1443934876440068179> Devi specificare almeno un canale."),
            ],
            allowedMentions: { repliedUser: false },
          });
        }
        data.channels[commandKey] = channelIds;
        writePermissionsConfig(data);
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("#6f4e37")
              .setTitle("Whitelist canali aggiornata")
              .setDescription([`Comando: \`${commandKey}\``, `Canali: ${formatChannelMentions(channelIds)}`].join("\n")),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      if (sub === "channel-add") {
        const channelIds = parseChannelIdList(message, args.slice(2).join(" "));
        if (!channelIds.length) {
          return safeMessageReply(message, {
            embeds: [
              new EmbedBuilder()
                .setColor("Red")
                .setDescription("<:vegax:1443934876440068179> Devi specificare almeno un canale."),
            ],
            allowedMentions: { repliedUser: false },
          });
        }
        const current = Array.isArray(data.channels[commandKey]) ? data.channels[commandKey].map(String) : [];
        data.channels[commandKey] = Array.from(new Set([...current, ...channelIds]));
        writePermissionsConfig(data);
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("#6f4e37")
              .setTitle("Canali aggiunti")
              .setDescription([`Comando: \`${commandKey}\``, `Canali: ${formatChannelMentions(data.channels[commandKey])}`].join("\n")),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      if (sub === "channel-remove") {
        const channelIds = parseChannelIdList(message, args.slice(2).join(" "));
        if (!channelIds.length) {
          return safeMessageReply(message, {
            embeds: [
              new EmbedBuilder()
                .setColor("Red")
                .setDescription("<:vegax:1443934876440068179> Devi specificare almeno un canale."),
            ],
            allowedMentions: { repliedUser: false },
          });
        }
        const current = Array.isArray(data.channels[commandKey]) ? data.channels[commandKey].map(String) : [];
        const remove = new Set(channelIds.map(String));
        const next = current.filter((id) => !remove.has(String(id)));
        if (next.length) data.channels[commandKey] = next;
        else delete data.channels[commandKey];
        writePermissionsConfig(data);
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("#6f4e37")
              .setTitle("Canali rimossi")
              .setDescription([
                `Comando: \`${commandKey}\``,
                next.length ? `Canali rimanenti: ${formatChannelMentions(next)}` : "Nessuna restrizione canale attiva.",
              ].join("\n")),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      if (sub === "channel-clear") {
        delete data.channels[commandKey];
        writePermissionsConfig(data);
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("#6f4e37")
              .setTitle("Restrizione canali rimossa")
              .setDescription(`Comando: \`${commandKey}\``),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      if (sub === "channel-list") {
        if (commandKey) {
          const list = Array.isArray(data.channels[commandKey]) ? data.channels[commandKey] : [];
          return safeMessageReply(message, {
            embeds: [
              new EmbedBuilder()
                .setColor("#6f4e37")
                .setTitle("Whitelist canali comando")
                .setDescription([
                  `Comando: \`${commandKey}\``,
                  list.length ? `Canali: ${formatChannelMentions(list)}` : "Nessuna restrizione canale configurata.",
                ].join("\n")),
            ],
            allowedMentions: { repliedUser: false },
          });
        }

        const entries = Object.entries(data.channels || {});
        const lines = entries.length
          ? entries
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([key, ids]) => `. \`${key}\` -> ${formatChannelMentions(Array.isArray(ids) ? ids : [])}`)
          : ["Nessuna whitelist canali configurata."];
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("#6f4e37")
              .setTitle("Whitelist canali")
              .setDescription(lines.join("\n").slice(0, 3900)),
          ],
          allowedMentions: { repliedUser: false },
        });
      }
    }

    const target = await resolveTargetUser(message, args[1]);
    if (!target || target.bot) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Utente non valido. Usa un mention o ID valido.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    if (sub === "grant") {
      const durationMs = parseDuration(args[2]);
      if (!durationMs) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Durata non valida. Usa ad esempio `30m`, `2h`, `3d`.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      const commandInput = args.slice(3).join(" ");
      const commandKeys = parseCommandTokenList(commandInput);
      if (!commandKeys.length) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Devi specificare almeno un comando.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      const result = await grantTemporaryCommandPermissions({
        guildId: message.guild.id,
        userId: target.id,
        grantedBy: message.author.id,
        commandKeys,
        durationMs,
      });

      const expiresText = result.expiresAt
        ? `<t:${Math.floor(new Date(result.expiresAt).getTime() / 1000)}:F>`
        : "N/A";

      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("Permessi temporanei assegnati")
            .setDescription(
              [
                `Utente: ${target}`,
                `Durata: **${formatDuration(durationMs)}**`,
                `Scadenza: ${expiresText}`,
                `Comandi: ${commandKeys.map((k) => `\`${k}\``).join(", ")}`,
              ].join("\n"),
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    if (sub === "revoke") {
      const commandInput = args.slice(2).join(" ");
      const commandKeys = parseRevokeTokenList(commandInput);
      if (!commandKeys.length) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Devi specificare almeno un comando da revocare.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      const removed = await revokeTemporaryCommandPermissions({
        guildId: message.guild.id,
        userId: target.id,
        commandKeys,
      });

      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("Permessi temporanei revocati")
            .setDescription(`Revoche effettuate per ${target}: **${removed}**`),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    if (sub === "clear") {
      const removed = await clearTemporaryCommandPermissionsForUser({
        guildId: message.guild.id,
        userId: target.id,
      });

      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("Permessi temporanei azzerati")
            .setDescription(`Permessi rimossi per ${target}: **${removed}**`),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const rows = await listTemporaryCommandPermissionsForUser({
      guildId: message.guild.id,
      userId: target.id,
    });

    const lines = rows.length
      ? rows.map(
          (row) =>
            `. \`${row.commandKey}\` -> scade tra **${formatRemaining(row.expiresAt)}**`,
        )
      : ["Nessun permesso temporaneo attivo."];

    return safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle(`Permessi temporanei di ${target.username}`)
          .setDescription(lines.join("\n")),
      ],
      allowedMentions: { repliedUser: false },
    });
  },
};
