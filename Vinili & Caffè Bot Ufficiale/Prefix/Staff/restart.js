const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const fs = require("fs");
const path = require("path");
const child_process = require("child_process");
const IDs = require("../../Utils/Config/ids");

const RESTART_FLAG = "restart.json";
const RESTART_CLEANUP_DELAY_MS = 2000;
const PROCESS_EXIT_DELAY_MS = 1200;
const VALID_SCOPES = new Set([
  "full",
  "handlers",
  "commands",
  "prefix",
  "events",
  "triggers",
  "services",
  "utils",
  "schemas",
  "all",
]);

function pullLatest() {
  try {
    const repoRoot = path.resolve(process.cwd(), "..");
    if (!fs.existsSync(path.join(repoRoot, ".git"))) return;
    const branch = process.env.GIT_BRANCH || "main";
    child_process.spawnSync("git", ["pull", "origin", branch, "--ff-only"], {
      cwd: repoRoot,
      stdio: "inherit",
    });
    child_process.spawnSync(
      "git",
      ["submodule", "update", "--init", "--recursive"],
      { cwd: repoRoot, stdio: "inherit" },
    );
  } catch {}
}

function buildUsageEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Comando restart")
    .setDescription(
      [
        "`+restart full` — riavvia solo il bot Ufficiale",
        "`+restart full both` — riavvia entrambi i bot (Ufficiale + Test)",
        "`+restart handlers`",
        "`+restart commands`",
        "`+restart prefix`",
        "`+restart events`",
        "`+restart triggers`",
        "`+restart services`",
        "`+restart utils`",
        "`+restart schemas`",
        "`+restart all`",
        "",
        "Alias: `+rs`, `+reload`",
        "Se non specifichi la scope, usa `full`.",
      ].join("\n"),
    );
}

module.exports = {
  name: "restart",
  folder: "Dev",
  aliases: ["rs", "reload"],
  subcommands: [
    "full",
    "handlers",
    "commands",
    "prefix",
    "events",
    "triggers",
    "services",
    "utils",
    "schemas",
    "all",
  ],

  async execute(message, args = [], client) {
    const mainGuildId = IDs.guilds?.main || null;
    if (!message.guild || (mainGuildId && message.guild.id !== mainGuildId)) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Il comando `+restart` è utilizzabile solo nel **server principale**.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    await message.channel.sendTyping().catch(() => {});

    const rawScope = String(args[0] || "full").toLowerCase();
    const rawSecond = String(args[1] || "").toLowerCase();
    const scope = rawScope === "help" || rawScope === "uso" ? "help" : rawScope;
    const isFullBoth = scope === "full" && rawSecond === "both";

    if (scope === "help") {
      await safeMessageReply(message, {
        embeds: [buildUsageEmbed()],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (!VALID_SCOPES.has(scope)) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Scope non valida. Usa `+restart help`.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    try {
      const requestedAt = new Date().toISOString();
      const channelId = message.channelId || message.channel?.id || null;

      if (scope === "full") {
        const notifyMessage = await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("#6f4e37")
              .setDescription(
                isFullBoth
                  ? "<:attentionfromvega:1443651874032062505> Riavvio **entrambi i bot** richiesto. Ti avviso qui quando è completato."
                  : "<:attentionfromvega:1443651874032062505> Riavvio richiesto. Ti avviso qui quando è completato.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });

        const notifyPath = path.resolve(
          process.cwd(),
          "..",
          "restart_notify.json",
        );
        const flagPath = path.resolve(process.cwd(), "..", RESTART_FLAG);
        try {
          fs.writeFileSync(
            notifyPath,
            JSON.stringify(
              {
                channelId,
                guildId: message.guild?.id || null,
                by: message.author.id,
                at: requestedAt,
                scope: "full",
                commandMessageId: message.id || null,
                notifyMessageId: notifyMessage?.id || null,
              },
              null,
              2,
            ),
            "utf8",
          );
          fs.writeFileSync(
            flagPath,
            JSON.stringify(
              {
                at: requestedAt,
                by: message.author.id,
                bot: isFullBoth ? "all" : "official",
                respectDelay: isFullBoth,
              },
              null,
              2,
            ),
            "utf8",
          );
        } catch (writeErr) {
          global.logger.error(
            "[restart] Scrittura flag/notify fallita:",
            writeErr?.message || writeErr,
          );
          await safeMessageReply(message, {
            embeds: [
              new EmbedBuilder()
                .setColor("Red")
                .setDescription(
                  "<:vegax:1443934876440068179> Errore durante la scrittura del file di restart.",
                ),
            ],
            allowedMentions: { repliedUser: false },
          }).catch(() => {});
          return;
        }
        setTimeout(() => process.exit(0), PROCESS_EXIT_DELAY_MS);
        return;
      }

      const start = Date.now();
      pullLatest();
      await client.reloadScope(scope);
      const elapsed = Math.max(1, Math.round((Date.now() - start) / 1000));

      const doneMsg = await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setDescription(
              `<:vegacheckmark:1443666279058772028> Reload \`${scope}\` completato in **${elapsed}s**.`,
            ),
        ],
        allowedMentions: { repliedUser: false },
      });

      setTimeout(() => {
        message.delete().catch(() => {});
        doneMsg?.delete?.().catch(() => {});
      }, RESTART_CLEANUP_DELAY_MS);
    } catch (error) {
      global.logger.error(error);
      const failMsg = await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Errore durante restart/reload.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });

      setTimeout(() => {
        message.delete().catch(() => {});
        failMsg?.delete?.().catch(() => {});
      }, RESTART_CLEANUP_DELAY_MS);
    }
  },
};
