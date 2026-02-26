const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const GUIDE_COLOR = "#3498DB";
const GUIDE_LIFETIME_MS = 10 * 60 * 1000;
const PERMISSIONS_CANDIDATES = [
  path.join(process.cwd(), "permissions.json"),
  path.resolve(__dirname, "../../permissions.json"),
];
let permissionsCache = { filePath: null, mtimeMs: 0, data: {} };

function loadPrefixPermissions() {
  try {
    const permissionsPath =
      PERMISSIONS_CANDIDATES.find((p) => fs.existsSync(p)) || null;
    if (!permissionsPath) return {};
    const stat = fs.statSync(permissionsPath);
    if (
      permissionsCache.filePath === permissionsPath &&
      permissionsCache.mtimeMs === stat.mtimeMs
    ) {
      return permissionsCache.data || {};
    }
    const raw = fs.readFileSync(permissionsPath, "utf8");
    const parsed = JSON.parse(raw) || {};
    const prefix = parsed.prefix && typeof parsed.prefix === "object"
      ? parsed.prefix
      : {};
    permissionsCache = {
      filePath: permissionsPath,
      mtimeMs: stat.mtimeMs,
      data: prefix,
    };
    return prefix;
  } catch {
    return {};
  }
}

function getPermissionSubcommands(commandName) {
  const safeName = String(commandName || "").trim().toLowerCase();
  if (!safeName) return [];
  const prefixPerms = loadPrefixPermissions();
  const cfg = prefixPerms?.[safeName];
  const subMap =
    cfg?.subcommands && typeof cfg.subcommands === "object"
      ? cfg.subcommands
      : null;
  if (!subMap) return [];
  return Object.keys(subMap)
    .map((s) => String(s || "").trim().toLowerCase())
    .filter(Boolean);
}

function normalizeSubcommands(command) {
  const direct = Array.isArray(command?.subcommands)
    ? command.subcommands
    : [];
  const aliases = command?.subcommandAliases || {};
  const mapped = Object.values(aliases || {});
  const fromPermissions = getPermissionSubcommands(command?.name);
  return Array.from(
    new Set(
      [...direct, ...mapped, ...fromPermissions]
        .map((v) => String(v || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function getSubDescription(command, sub) {
  const meta =
    command?.subcommandDescriptions ||
    command?.subcommandsDescriptions ||
    command?.subcommandHelp ||
    command?.subcommandsHelp ||
    {};
  const value = meta?.[sub];
  if (String(value || "").trim()) return String(value).trim();
  return `Mostra come usare il sotto-comando \`${sub}\`.`;
}

function getSubUsage(command, prefix, sub) {
  const usageMap =
    command?.subcommandUsages ||
    command?.subcommandsUsages ||
    command?.subcommandUsage ||
    command?.subcommandsUsage ||
    {};
  if (String(usageMap?.[sub] || "").trim()) return String(usageMap[sub]).trim();
  return `${prefix}${command.name} ${sub} ...`;
}

function buildDefaultGuideEmbed(command, prefix) {
  const aliases = Array.isArray(command?.aliases)
    ? command.aliases.map((a) => `${prefix}${a}`).join(", ")
    : `${prefix}undefined`;
  const description = String(command?.description || "").trim() || "Nessuna descrizione disponibile.";
  const usage = String(command?.usage || "").trim() || `${prefix}${command?.name} ...`;
  return new EmbedBuilder()
    .setColor(GUIDE_COLOR)
    .setDescription(
      [
        `**Comando: ${prefix}${command?.name}**`,
        "",
        `**Alias:** ${aliases || `${prefix}undefined`}`,
        `**Descrizione:** ${description}`,
        "**Uso:**",
        usage,
      ].join("\n"),
    );
}

function buildSubGuideEmbed(command, prefix, sub) {
  const description = getSubDescription(command, sub);
  const usage = getSubUsage(command, prefix, sub);
  return new EmbedBuilder()
    .setColor(GUIDE_COLOR)
    .setDescription(
      [
        `**Comando: ${prefix}${command?.name} ${sub}**`,
        "",
        `**Descrizione:** ${description}`,
        "**Uso:**",
        usage,
      ].join("\n"),
    );
}

function buildSubcommandRow(command, ownerId, currentValue = "__default") {
  const subs = normalizeSubcommands(command);
  if (!subs.length) return null;
  const hidden = String(currentValue || "__default").toLowerCase();
  const filteredSubs =
    hidden === "__default"
      ? subs
      : subs.filter((sub) => String(sub).toLowerCase() !== hidden);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`usage_guide:${command.name}:${ownerId}`)
    .setPlaceholder("Vedi sotto-comandi")
    .addOptions(
      ...filteredSubs.slice(0, 24).map((sub) => ({
        label: sub,
        description: getSubDescription(command, sub).slice(0, 100),
        value: sub,
      })),
      {
        label: "default",
        description: "Torna alla guida principale del comando",
        value: "__default",
      },
    );
  return new ActionRowBuilder().addComponents(menu);
}

async function showPrefixUsageGuide({ message, command, prefix = "+", deleteCommandMessage = null }) {
  if (!message || !command) return false;
  const defaultEmbed = buildDefaultGuideEmbed(command, prefix);
  let currentValue = "__default";
  let row = buildSubcommandRow(command, message.author.id, currentValue);

  if (typeof deleteCommandMessage === "function") {
    await deleteCommandMessage().catch(() => {});
  }

  const sent = await message.channel
    .send({
      embeds: [defaultEmbed],
      ...(row ? { components: [row] } : {}),
    })
    .catch(() => null);
  if (!sent) return false;
  if (!row) return true;

  const collector = sent.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: GUIDE_LIFETIME_MS,
  });

  collector.on("collect", async (interaction) => {
    if (interaction.user.id !== message.author.id) {
      await interaction
        .reply({ content: "Questo menu non è tuo.", ephemeral: true })
        .catch(() => {});
      return;
    }

    const picked = String(interaction.values?.[0] || "__default");
    currentValue = picked;
    row = buildSubcommandRow(command, message.author.id, currentValue);

    const nextEmbed =
      picked === "__default"
        ? defaultEmbed
        : buildSubGuideEmbed(command, prefix, picked);

    await interaction
      .update({
        embeds: [nextEmbed],
        components: [row],
      })
      .catch(() => {});
  });

  return true;
}

module.exports = { showPrefixUsageGuide };