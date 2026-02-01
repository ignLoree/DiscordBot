const axios = require('axios');
const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const ArtCard = require('../../Schemas/Art/artCardSchema');
const ArtSpawn = require('../../Schemas/Art/artSpawnSchema');

function pickRarity(weights) {
  const entries = Object.entries(weights || {});
  const total = entries.reduce((sum, [, w]) => sum + (Number(w) || 0), 0);
  if (total <= 0) return 'common';
  let roll = Math.random() * total;
  for (const [key, weight] of entries) {
    roll -= Number(weight) || 0;
    if (roll <= 0) return key;
  }
  return entries[0]?.[0] || 'common';
}

function hashId(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 12);
}

function normalizeWaifuImImage(image) {
  if (!image) return null;
  const url = image.url || image.image_url || image.source || null;
  if (!url) return null;
  const artist = image.artist?.name || image.artist || '';
  const tags = Array.isArray(image.tags)
    ? image.tags.map((t) => (typeof t === 'string' ? t : t?.name)).filter(Boolean)
    : [];
  const source = image.source || image.origin || '';
  const id = image.id || image.signature || hashId(url);
  return { id, url, artist, tags, source };
}

async function fetchArtImage(config) {
  const provider = config?.source?.provider || 'waifu-im';
  const tags = Array.isArray(config?.source?.tags) ? config.source.tags : [];
  const nsfw = Boolean(config?.source?.nsfw);
  let lastError = null;

  if (provider === 'waifu-im') {
    try {
      const params = new URLSearchParams();
      if (tags.length) params.set('included_tags', tags.join(','));
      params.set('is_nsfw', nsfw ? 'true' : 'false');
      const url = `https://api.waifu.im/search?${params.toString()}`;
      const res = await axios.get(url, { timeout: 12000 });
      const image = res.data?.images?.[0] || res.data?.image || res.data?.items?.[0];
      const normalized = normalizeWaifuImImage(image);
      if (normalized) return normalized;
    } catch (err) {
      lastError = err;
    }
  }

  try {
    const res = await axios.get('https://api.waifu.pics/sfw/waifu', { timeout: 12000 });
    const url = res.data?.url;
    if (url) {
      return { id: hashId(url), url, artist: '', tags: [], source: 'waifu.pics' };
    }
  } catch (err) {
    lastError = err;
  }

  throw lastError || new Error('Art API failed');
}

function getRarityColor(rarity) {
  const map = {
    common: '#6f4e37',
    rare: '#2f80ed',
    epic: '#9b51e0',
    legendary: '#f2994a'
  };
  return map[rarity] || '#6f4e37';
}

async function spawnArtIfPossible(channel, client, options = {}) {
  try {
    const config = client?.config2?.artRift;
    if (!config?.enabled) return { ok: false, reason: 'disabled' };
    if (!channel?.id) return { ok: false, reason: 'channel' };
    if (String(config.channelId) !== String(channel.id)) return { ok: false, reason: 'not_target' };

    const now = Date.now();
    if (!client._artRiftLastSpawn) client._artRiftLastSpawn = new Map();
    const lastAt = client._artRiftLastSpawn.get(channel.id) || 0;
    if (!options.force && config.spawnCooldownMs && now - lastAt < config.spawnCooldownMs) {
      return { ok: false, reason: 'cooldown' };
    }

    const active = await ArtSpawn.findOne({
      channelId: channel.id,
      claimedBy: null,
      expiresAt: { $gt: new Date() }
    });
    if (active) return { ok: false, reason: 'active' };

    let card = null;
    let rarity = null;
    let art = null;
    let alreadyClaimed = false;
    let lastError = null;
    const attempts = options.force ? 3 : 6;
    const baseWeights = config.rarityWeights || {};
    const boostedWeights = options.force
      ? baseWeights
      : {
          common: Math.max(0, (baseWeights.common ?? 70) - 15),
          rare: (baseWeights.rare ?? 20) + 8,
          epic: (baseWeights.epic ?? 8) + 5,
          legendary: (baseWeights.legendary ?? 2) + 2
        };
    for (let i = 0; i < attempts; i += 1) {
      rarity = pickRarity(boostedWeights);
      try {
        art = await fetchArtImage(config);
      } catch (err) {
        lastError = err;
        continue;
      }
      const cardId = art.id || hashId(art.url);
      const existing = await ArtCard.findOne({ cardId });
      alreadyClaimed = Boolean(existing?.catchCount);
      if (!options.force && alreadyClaimed) continue;
      card = existing || await ArtCard.findOneAndUpdate(
        { cardId },
        {
          $setOnInsert: {
            cardId,
            url: art.url,
            source: art.source || '',
            artist: art.artist || '',
            tags: art.tags || [],
            rarity
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      break;
    }
    if (!card) {
      if (lastError) {
        global.logger?.error?.('[ART] Failed to fetch art image:', lastError);
        return { ok: false, reason: 'api_error' };
      }
      return { ok: false, reason: 'no_card' };
    }

    const originText = card.source || card.artist || 'Unknown origin';
    let description = `**${originText}**\nReact with any emoji to claim!`;
    if (alreadyClaimed) {
      description = `**${originText}**\nAlready claimed.\nReact with any emoji to claim!`;
    }

    const embed = new EmbedBuilder()
      .setColor(getRarityColor(card.rarity))
      .setDescription(description)
      .setImage(card.url);

    const msg = await channel.send({ embeds: [embed] });

    const expiresAt = new Date(Date.now() + (config.spawnExpireMinutes || 20) * 60 * 1000);
    await ArtSpawn.create({
      guildId: channel.guild?.id || 'dm',
      channelId: channel.id,
      messageId: msg.id,
      cardId: card.cardId,
      rarity: card.rarity,
      source: card.source || '',
      spawnedBy: options.requestedBy || null,
      expiresAt
    });

    client._artRiftLastSpawn.set(channel.id, Date.now());
    return { ok: true, message: msg, card };
  } catch (err) {
    global.logger?.error?.('[ART] spawnArtIfPossible failed:', err);
    return { ok: false, reason: 'error' };
  }
}

module.exports = { spawnArtIfPossible };
