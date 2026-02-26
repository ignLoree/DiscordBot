const axios = require("axios");
const { AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage } = require("canvas");
const IDs = require("../../Utils/Config/ids");

const POKETWO_BOT_ID = String(IDs?.bots?.Poketwo || "716390085896962058");
const MONITORED_CHANNEL_IDS = new Set(
  [IDs?.channels?.poketwo].filter(Boolean).map((id) => String(id)),
);
const PENDING_BY_CHANNEL = new Map();
const PENDING_TTL_MS = 90_000;
const NAME_CACHE_TTL_MS = 24 * 60 * 60_000;

const nameCache = {
  names: null,
  fetchedAt: 0,
  pending: null,
};
const pokemonMetaCache = new Map();

function flattenEmbedText(embed) {
  if (!embed) return "";
  const parts = [];
  const push = (v) => {
    if (typeof v === "string" && v.trim()) parts.push(v);
  };
  push(embed.title);
  push(embed.description);
  if (Array.isArray(embed.fields)) {
    for (const f of embed.fields) {
      push(f?.name);
      push(f?.value);
    }
  }
  const data = embed.data || embed._data;
  if (data) {
    push(data.title);
    push(data.description);
    if (Array.isArray(data.fields)) {
      for (const f of data.fields) {
        push(f?.name);
        push(f?.value);
      }
    }
  }
  return parts.join("\n");
}

function normalizeName(raw) {
  return String(raw || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\-.' ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function displayName(raw) {
  return String(raw || "")
    .split("-")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join("-");
}

function escapeRegexChar(ch) {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRegexFromHint(hintPattern) {
  const p = normalizeName(hintPattern).replace(/\.$/, "");
  const parts = [];
  for (const ch of p) {
    if (ch === "_") {
      parts.push("[a-z0-9]");
      continue;
    }
    if (ch === " ") {
      parts.push("[\\s-]");
      continue;
    }
    if (ch === "-") {
      parts.push("[-\\s]");
      continue;
    }
    if (ch === "'") {
      parts.push("['’]?");
      continue;
    }
    parts.push(escapeRegexChar(ch));
  }
  return new RegExp(`^${parts.join("")}$`, "i");
}

async function fetchPokemonNames() {
  const now = Date.now();
  if (Array.isArray(nameCache.names) && now - nameCache.fetchedAt < NAME_CACHE_TTL_MS) {
    return nameCache.names;
  }
  if (nameCache.pending) return nameCache.pending;

  nameCache.pending = axios
    .get("https://pokeapi.co/api/v2/pokemon?limit=2000", { timeout: 12_000 })
    .then((res) => {
      const list = Array.isArray(res?.data?.results)
        ? res.data.results.map((x) => normalizeName(x?.name || "")).filter(Boolean)
        : [];
      const unique = Array.from(new Set(list));
      nameCache.names = unique;
      nameCache.fetchedAt = Date.now();
      nameCache.pending = null;
      return unique;
    })
    .catch(() => {
      nameCache.pending = null;
      return Array.isArray(nameCache.names) ? nameCache.names : [];
    });

  return nameCache.pending;
}

async function getPokemonMetaByName(name) {
  const key = normalizeName(name);
  if (!key) return null;
  if (pokemonMetaCache.has(key)) return pokemonMetaCache.get(key);

  const payload = await axios
    .get(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(key)}`, { timeout: 12_000 })
    .then((res) => res?.data || null)
    .catch(() => null);
  if (!payload?.id) return null;

  const meta = {
    id: Number(payload.id),
    name: key,
    display: displayName(key),
    spriteUrl: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${Number(payload.id)}.png`,
  };
  pokemonMetaCache.set(key, meta);
  return meta;
}

function shouldTrackChannel(channelId) {
  if (!channelId) return false;
  if (!MONITORED_CHANNEL_IDS.size) return true;
  return MONITORED_CHANNEL_IDS.has(String(channelId));
}

function isSpawnMessage(text) {
  return /new wild pok[eé]mon has appeared/i.test(text);
}

function extractHintPattern(text) {
  const m =
    text.match(/the pok[eé]mon is\s+`?([a-z0-9_\-.' ]+)`?/i) ||
    text.match(/pok[eé]mon is\s+`?([a-z0-9_\-.' ]+)`?/i);
  if (!m) return "";
  return String(m[1] || "").trim();
}

function cleanupPending() {
  const now = Date.now();
  for (const [channelId, row] of PENDING_BY_CHANNEL.entries()) {
    if (now - Number(row?.createdAt || 0) > PENDING_TTL_MS) {
      PENDING_BY_CHANNEL.delete(channelId);
    }
  }
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function buildPokemonCardBuffer({ title, subtitle = "", mainName = "", candidates = [], spriteUrl = "" }) {
  const width = 900;
  const height = 300;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#E7F7D9");
  bg.addColorStop(1, "#C8E8B9");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  drawRoundedRect(ctx, 14, 14, width - 28, height - 28, 22);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fill();

  ctx.fillStyle = "#0E1116";
  ctx.font = "700 40px Sans";
  ctx.fillText(String(title || "POKEMON"), 42, 82);

  if (subtitle) {
    ctx.fillStyle = "#2D3A2F";
    ctx.font = "600 22px Sans";
    ctx.fillText(subtitle, 44, 122);
  }

  if (mainName) {
    ctx.fillStyle = "#0E1116";
    ctx.font = "800 58px Sans";
    ctx.fillText(mainName, 42, 206);
  } else if (Array.isArray(candidates) && candidates.length) {
    ctx.fillStyle = "#0E1116";
    ctx.font = "700 34px Sans";
    const listText = candidates.slice(0, 6).map((x) => displayName(x)).join("  |  ");
    ctx.fillText(listText.slice(0, 48), 42, 200);
  }

  if (spriteUrl) {
    const sprite = await loadImage(spriteUrl).catch(() => null);
    if (sprite) {
      const box = 220;
      const sx = width - box - 44;
      const sy = 40;
      drawRoundedRect(ctx, sx - 8, sy - 8, box + 16, box + 16, 18);
      ctx.fillStyle = "rgba(14,17,22,0.08)";
      ctx.fill();
      ctx.drawImage(sprite, sx, sy, box, box);
    }
  }

  return canvas.toBuffer("image/png");
}

async function sendPokemonCard(message, matches) {
  const one = matches.length === 1;
  const firstName = normalizeName(matches[0] || "");
  const meta = firstName ? await getPokemonMetaByName(firstName) : null;

  const buffer = await buildPokemonCardBuffer({
    title: one ? "Pokemon Found" : "Possible Pokemon",
    subtitle: one ? `Use: <@${POKETWO_BOT_ID}> catch ${firstName}` : `Candidates: ${matches.length}`,
    mainName: one ? displayName(firstName) : "",
    candidates: one ? [] : matches,
    spriteUrl: meta?.spriteUrl || "",
  });

  const file = new AttachmentBuilder(buffer, { name: "poketwo-card.png" });
  const caption = one
    ? `\`<@${POKETWO_BOT_ID}> catch ${firstName}\``
    : `Possibili: ${matches.map((x) => `\`${x}\``).join(", ")}`;
  await message.channel.send({ content: caption, files: [file] }).catch(() => null);
}

async function handlePoketwoHelperMessage(message) {
  if (!message?.guild || !message?.channel) return;
  if (String(message.author?.id || "") !== POKETWO_BOT_ID) return;
  if (!shouldTrackChannel(message.channelId)) return;

  cleanupPending();
  const embedText = flattenEmbedText(message.embeds?.[0]);
  const fullText = `${String(message.content || "")}\n${embedText}`.trim();
  if (!fullText) return;

  const channelKey = String(message.channelId || "");

  if (isSpawnMessage(fullText)) {
    PENDING_BY_CHANNEL.set(channelKey, { createdAt: Date.now(), spawnMessageId: message.id });
    await message.channel.send(`<@${POKETWO_BOT_ID}> hint`).catch(() => null);
    return;
  }

  const hintPattern = extractHintPattern(fullText);
  if (!hintPattern) return;

  const pending = PENDING_BY_CHANNEL.get(channelKey);
  if (!pending) return;
  if (Date.now() - Number(pending.createdAt || 0) > PENDING_TTL_MS) {
    PENDING_BY_CHANNEL.delete(channelKey);
    return;
  }

  const names = await fetchPokemonNames();
  const re = buildRegexFromHint(hintPattern);
  const matches = names.filter((name) => re.test(normalizeName(name))).slice(0, 8);
  PENDING_BY_CHANNEL.delete(channelKey);

  if (!matches.length) {
    await message.channel.send("No match found from hint. Try another `hint`.").catch(() => null);
    return;
  }

  await sendPokemonCard(message, matches);
}

module.exports = {
  handlePoketwoHelperMessage,
};

