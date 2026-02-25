const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { safeEditReply } = require("../../Utils/Moderation/reply");

const PRIVATE_FLAG = 1 << 6;

async function runMassRoleUpdate(interaction, { targets, role, action, total, skipped, progressEmbed }) {
  let success = 0;
  let failed = 0;
  let processed = 0;

  for (const member of targets.values()) {
    try {
      if (action === "add") {
        await member.roles.add(role, `Mass role add by ${interaction.user.tag}`);
      } else {
        await member.roles.remove(
          role,
          `Mass role remove by ${interaction.user.tag}`,
        );
      }
      success += 1;
    } catch {
      failed += 1;
    }
    processed += 1;

    if (processed % 20 === 0 || processed === total) {
      await safeEditReply(interaction, {
        embeds: [
          progressEmbed({
            title: "Aggiornamento ruoli in corso...",
            processed,
            total,
            success,
            failed,
            skipped,
          }),
        ],
        flags: PRIVATE_FLAG,
      }).catch(() => {});
    }
  }

  await safeEditReply(interaction, {
    embeds: [
      progressEmbed({
        title:
          action === "add"
            ? "Aggiunta ruolo completata"
            : "Rimozione ruolo completata",
        processed: total,
        total,
        success,
        failed,
        skipped,
      }),
    ],
    flags: PRIVATE_FLAG,
  }).catch(() => {});
}

module.exports = {
  helpDescription:
    "Gestisce ruoli in massa su tutti gli utenti non bot: aggiunta o rimozione.",
  data: new SlashCommandBuilder()
    .setName("role")
    .setDescription("Gestione ruoli in massa")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("all")
        .setDescription("Aggiunge o rimuove un ruolo a tutti gli utenti (no bot)")
        .addRoleOption((option) =>
          option
            .setName("ruolo")
            .setDescription("Ruolo da aggiungere o rimuovere")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("azione")
            .setDescription("Azione da eseguire")
            .setRequired(true)
            .addChoices(
              { name: "add", value: "add" },
              { name: "remove", value: "remove" },
            ),
        ),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: PRIVATE_FLAG }).catch(() => {});

    const subcommand = interaction.options.getSubcommand(false);
    if (subcommand !== "all") {
      return safeEditReply(interaction, {
        content: "<:vegax:1443934876440068179> Subcommand non supportato.",
        flags: PRIVATE_FLAG,
      });
    }

    const role = interaction.options.getRole("ruolo", true);
    const action = interaction.options.getString("azione", true);
    const guild = interaction.guild;

    if (!guild) {
      return safeEditReply(interaction, {
        content: "<:vegax:1443934876440068179> Questo comando funziona solo in un server.",
        flags: PRIVATE_FLAG,
      });
    }

    if (role.id === guild.id) {
      return safeEditReply(interaction, {
        content: "<:vegax:1443934876440068179> Non puoi usare `@everyone`.",
        flags: PRIVATE_FLAG,
      });
    }

    if (role.managed || !role.editable) {
      return safeEditReply(interaction, {
        content:
          "<:vegax:1443934876440068179> Non posso gestire questo ruolo (gerarchia o ruolo gestito).",
        flags: PRIVATE_FLAG,
      });
    }

    await guild.members.fetch().catch(() => null);

    const members = guild.members.cache.filter((member) => !member.user.bot);
    const targets = members.filter((member) =>
      action === "add"
        ? !member.roles.cache.has(role.id)
        : member.roles.cache.has(role.id),
    );

    const progressEmbed = ({ title, processed, total, success, failed, skipped }) =>
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle(title)
        .setDescription(
          [
            `Ruolo: ${role}`,
            `Azione: \`${action}\``,
            "",
            `Processati: **${processed}/${total}**`,
            `Aggiornati: **${success}**`,
            `Saltati: **${skipped}**`,
            `Falliti: **${failed}**`,
          ].join("\n"),
        )
        .setTimestamp();

    const total = targets.size;
    const skipped = members.size - total;

    await safeEditReply(interaction, {
      embeds: [
        progressEmbed({
          title: "Aggiornamento ruoli in corso...",
          processed: 0,
          total,
          success: 0,
          failed: 0,
          skipped,
        }),
      ],
      flags: PRIVATE_FLAG,
    });

    setImmediate(() => {
      runMassRoleUpdate(interaction, {
        targets,
        role,
        action,
        total,
        skipped,
        progressEmbed,
      }).catch(async (error) => {
        global.logger?.error?.("[role all] mass update failed:", error);
        await safeEditReply(interaction, {
          content:
            "<:vegax:1443934876440068179> Errore durante l'aggiornamento massivo dei ruoli.",
          flags: PRIVATE_FLAG,
        }).catch(() => {});
      });
    });

    return;
  },
};
