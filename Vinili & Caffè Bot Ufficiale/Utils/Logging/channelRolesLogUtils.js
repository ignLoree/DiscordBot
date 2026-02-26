const { PermissionsBitField } = require("discord.js");
const IDs = require("../Config/ids");

const ARROW = "<:VC_right_arrow:1473441155055096081>";

function toDiscordTimestamp(value = new Date(), style = "F") {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "<t:0:F>";
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

function channelDisplay(channel) {
  if (!channel) return "#sconosciuto";
  if (typeof channel.toString === "function") return `${channel}`;
  return `#${String(channel.name || "sconosciuto")}`;
}

function channelTypeLabel(channelOrType) {
  const value =
    typeof channelOrType === "number"
      ? channelOrType
      : Number(channelOrType?.type || 0);
  if (value === 0) return "Text";
  if (value === 2) return "Voice";
  if (value === 4) return "Category";
  if (value === 5) return "Announcement";
  if (value === 10) return "Thread annuncio";
  if (value === 11) return "Thread pubblico";
  if (value === 12) return "Thread privato";
  if (value === 13) return "Stage";
  if (value === 15) return "Forum";
  if (value === 16) return "Media";
  return `Sconosciuto (${value})`;
}

function formatAuditActor(actor, fallback = "sconosciuto") {
  if (!actor) return fallback;
  const flags = [];
  if (actor?.bot) flags.push("BOT");
  const suffix = flags.length ? ` [${flags.join("/")}]` : "";
  const id = String(actor?.id || "").trim();
  if (!id) return `${actor}${suffix}`;
  return `${actor}${suffix} \`${id}\``;
}

function permissionList(bitfield) {
  const bits = new PermissionsBitField(bitfield ?? 0n);
  const names = bits.toArray();
  if (!names.length) return "Nessuno";
  return names.join(", ");
}

function permissionDiff(oldBitfield, newBitfield) {
  const oldBits = new PermissionsBitField(oldBitfield ?? 0n);
  const newBits = new PermissionsBitField(newBitfield ?? 0n);
  const oldSet = new Set(oldBits.toArray());
  const newSet = new Set(newBits.toArray());

  const additions = [];
  const removals = [];

  for (const name of newSet) {
    if (!oldSet.has(name)) additions.push(name);
  }
  for (const name of oldSet) {
    if (!newSet.has(name)) removals.push(name);
  }

  additions.sort((a, b) => a.localeCompare(b));
  removals.sort((a, b) => a.localeCompare(b));

  return {
    additions: additions.length ? additions.join(", ") : "Nessuno",
    removals: removals.length ? removals.join(", ") : "Nessuno",
  };
}

function toLabel(key) {
  return String(key || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function serializeAuditValue(value) {
  if (value === null || value === undefined) return "<:cancel:1461730653677551691>";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "string") return value || "<:cancel:1461730653677551691>";
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return value.map((v) => serializeAuditValue(v)).join(", ");
  }
  if (typeof value === "object") {
    if (value.id && value.name) return `${value.name} (\`${value.id}\`)`;
    if (value.id && value.tag) return `${value.tag} (\`${value.id}\`)`;
    if (value.id) return `\`${value.id}\``;
    if (value.name) return String(value.name);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function buildAuditExtraLines(entry, knownChangeKeys = []) {
  const lines = [];
  if (!entry) return lines;

  const known = new Set((knownChangeKeys || []).map((k) => String(k).toLowerCase()));
  const changes = Array.isArray(entry?.changes) ? entry.changes : [];
  const extra = entry?.extra && typeof entry.extra === "object" ? entry.extra : null;

  const changeLines = [];
  for (const change of changes) {
    const key = String(change?.key || "");
    if (!key) continue;
    if (known.has(key.toLowerCase())) continue;
    const oldVal = serializeAuditValue(change?.old);
    const newVal = serializeAuditValue(change?.new);
    if (oldVal === newVal) continue;
    changeLines.push(`${ARROW} **${toLabel(key)}**`);
    changeLines.push(`  ${oldVal} ${ARROW} ${newVal}`);
  }

  const extraLines = [];
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value === undefined || value === null) continue;
      extraLines.push(`${ARROW} **${toLabel(key)}:** ${serializeAuditValue(value)}`);
    }
  }

  if (!changeLines.length && !extraLines.length) return lines;

  lines.push("", "**Additional Information**");
  lines.push(...changeLines);
  lines.push(...extraLines);
  return lines;
}

async function resolveChannelRolesLogChannel(guild) {
  const channelId =
    IDs.channels?.channelRolesLogs || IDs.channels?.logCanaliRuoli || null;
  if (!guild || !channelId) return null;
  const channel =
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return null;
  return channel;
}

async function resolveResponsible(guild, actionType, matcher) {
  if (
    !guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)
  ) {
    return { executor: null, reason: null, entry: null };
  }

  const logs = await guild
    .fetchAuditLogs({ type: actionType, limit: 20 })
    .catch(() => null);
  if (!logs?.entries?.size) {
    return { executor: null, reason: null, entry: null };
  }

  const now = Date.now();
  const candidates = [];
  logs.entries.forEach((item) => {
    const created = Number(item?.createdTimestamp || 0);
    if (!created || now - created > 120 * 1000) return;

    let score = 1;
    if (typeof matcher === "function") {
      const result = matcher(item);
      if (!result) return;
      if (typeof result === "number" && Number.isFinite(result)) {
        score += result;
      } else {
        score += 3;
      }
    }

    // Prefer newest entry when score ties.
    score += Math.max(0, 120000 - (now - created)) / 120000;
    candidates.push({ item, score, created });
  });

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.created - a.created;
  });

  const entry = candidates[0]?.item || null;

  return {
    executor: entry?.executor || null,
    reason: entry?.reason || null,
    entry,
  };
}

module.exports = {
  ARROW,
  toDiscordTimestamp,
  yesNo,
  channelDisplay,
  channelTypeLabel,
  formatAuditActor,
  permissionList,
  permissionDiff,
  buildAuditExtraLines,
  resolveChannelRolesLogChannel,
  resolveResponsible,
};