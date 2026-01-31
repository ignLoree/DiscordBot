const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

const DEFAULT_MODEL = 'skshmjn/Pokemon-classifier-gen9-1025';
const lastGuessByImage = new Map();
const inFlightByImage = new Map();
const cacheKeyVersion = 'v9';
const cacheTtlMs = 1000 * 60 * 10; // 10 min
const rateLimitMs = 1000 * 6; // 1 request every 6s per channel
const lockTtlMs = 1000 * 60 * 10;
const spriteCache = new Map();
const flagImageCache = new Map();
const altNameCache = new Map();
const altNameTtlMs = 1000 * 60 * 60 * 12; // 12h
let fontRegistered = false;

function isPoketwoSpawn(message, botId) {
    if (!message?.author || message.author.id !== botId) return false;
    const embed = message.embeds?.[0];
    if (!embed) return false;
    const text = `${embed.title || ''}\n${embed.description || ''}`.toLowerCase();
    if (!text.includes('wild') || !text.includes('appeared')) return false;
    const imageUrl = embed.image?.url || embed.thumbnail?.url || message.attachments?.first()?.url;
    return Boolean(imageUrl);
}

function getImageUrl(message) {
    const embed = message.embeds?.[0];
    return embed?.image?.url || embed?.thumbnail?.url || message.attachments?.first()?.url || null;
}

function pickBestLabel(result) {
    const root = result?.data ?? result;
    const candidates = [];

    const pushCandidate = (label, score) => {
        if (!label) return;
        const value = String(label).trim();
        if (!value) return;
        candidates.push({ label: value, score: typeof score === 'number' ? score : null });
    };

    const walk = (node) => {
        if (node == null) return;
        if (typeof node === 'string') {
            pushCandidate(node, null);
            return;
        }
        if (typeof node === 'number') return;
        if (Array.isArray(node)) {
            for (const item of node) walk(item);
            return;
        }
        if (typeof node === 'object') {
            if (node.label) {
                const score = node.score ?? node.confidence ?? node.probability ?? null;
                pushCandidate(node.label, typeof score === 'number' ? score : null);
            }
            if (node.prediction) pushCandidate(node.prediction, node.score ?? null);
            if (node.class) pushCandidate(node.class, node.score ?? null);
            for (const value of Object.values(node)) walk(value);
        }
    };

    walk(root);

    if (!candidates.length) return null;
    const withScores = candidates.filter((c) => typeof c.score === 'number');
    if (withScores.length) {
        return withScores.sort((a, b) => b.score - a.score)[0];
    }
    return candidates[0];
}

async function fetchImageBuffer(url) {
    const res = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(res.data);
}

function getHfConfig(client) {
    const cfg = client?.config2?.poketwo || {};
    const model = cfg.model || DEFAULT_MODEL;
    let endpoint = cfg.dedicatedEndpointUrl || cfg.endpoint || `https://router.huggingface.co/hf-inference/models/${model}`;
    let fallbackEndpoint = cfg.endpoint || `https://router.huggingface.co/hf-inference/models/${model}`;
    if (endpoint.includes('api-inference.huggingface.co')) {
        endpoint = endpoint.replace('api-inference.huggingface.co', 'router.huggingface.co/hf-inference');
    }
    if (fallbackEndpoint.includes('api-inference.huggingface.co')) {
        fallbackEndpoint = fallbackEndpoint.replace('api-inference.huggingface.co', 'router.huggingface.co/hf-inference');
    }
    const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || cfg.hfToken || cfg.token || null;
    const extraFallbacks = Array.isArray(cfg.fallbackEndpoints) ? cfg.fallbackEndpoints.filter(Boolean) : [];
    return { model, endpoint, fallbackEndpoint, token, extraFallbacks };
}

function getSpaceConfig(client) {
    const cfg = client?.config2?.poketwo || {};
    const spaceIds = Array.isArray(cfg.spaceIds) && cfg.spaceIds.length
        ? cfg.spaceIds
        : ['gbryan/pokemon-classifier'];
    const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || cfg.hfToken || cfg.token || null;
    return { spaceIds, token };
}

async function classifyImage(buffer, client, overrideEndpoint) {
    const { endpoint, token } = getHfConfig(client);
    const target = overrideEndpoint || endpoint;
    if (!token) {
        throw new Error('Missing Hugging Face token (set HF_TOKEN in env or poketwo.hfToken in config).');
    }
    const payload = { inputs: buffer.toString('base64') };
    const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
    };
    const base = String(target || '').replace(/\/+$/, '');
    const candidates = [base];
    if (base.includes('endpoints.huggingface.cloud')) {
        candidates.push(`${base}/predict`, `${base}/invocations`);
    }
    let lastErr = null;
    for (const url of candidates) {
        try {
            const res = await axios.post(url, payload, { headers, timeout: 20000 });
            return res.data;
        } catch (err) {
            lastErr = err;
            const status = err?.response?.status;
            if (status !== 404) throw err;
        }
    }
    throw lastErr || new Error('Inference request failed');
}

async function classifyWithRetry(buffer, client) {
    const { fallbackEndpoint, extraFallbacks } = getHfConfig(client);
    const tried = new Set();
    const endpoints = [fallbackEndpoint, ...(extraFallbacks || [])].filter(Boolean);

    // First try primary
    try {
        return await classifyImage(buffer, client);
    } catch (err) {
        const netCode = err?.code;
        const status = err?.response?.status;
        if (netCode !== 'ENOTFOUND' && netCode !== 'EAI_AGAIN' && ![503, 429, 500].includes(status)) {
            throw err;
        }
    }

    // Backoff + fallbacks
    const backoffs = [800, 1500, 3000];
    for (const delay of backoffs) {
        for (const ep of endpoints) {
            if (tried.has(ep)) continue;
            tried.add(ep);
            try {
                return await classifyImage(buffer, client, ep);
            } catch (err) {
                const netCode = err?.code;
                const status = err?.response?.status;
                if (netCode !== 'ENOTFOUND' && netCode !== 'EAI_AGAIN' && ![503, 429, 500].includes(status)) {
                    throw err;
                }
            }
        }
        await new Promise((r) => setTimeout(r, delay));
        try {
            return await classifyImage(buffer, client);
        } catch (err) {
            const netCode = err?.code;
            const status = err?.response?.status;
            if (netCode !== 'ENOTFOUND' && netCode !== 'EAI_AGAIN' && ![503, 429, 500].includes(status)) {
                throw err;
            }
        }
    }

    throw new Error('Inference unavailable after retries');
}

async function classifyWithSpace(imageUrl, client) {
    const { spaceIds, token } = getSpaceConfig(client);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const payloads = [
        { data: [imageUrl] },
        { data: [{ path: imageUrl }] },
        { data: [{ url: imageUrl }] }
    ];
    const endpoints = ['run/predict', 'call/predict'];
    let lastError = null;
    for (const spaceId of spaceIds) {
        const base = `https://${spaceId.replace('/', '-')}.hf.space`;
        for (const endpoint of endpoints) {
            const url = `${base}/${endpoint}`;
            for (const payload of payloads) {
                try {
                    const res = await axios.post(url, payload, { headers, timeout: 25000 });
                    const data = res.data;
                    if (data?.event_id && endpoint === 'call/predict') {
                        const pollUrl = `${base}/call/predict/${data.event_id}`;
                        for (let i = 0; i < 6; i++) {
                            await new Promise((r) => setTimeout(r, 500));
                            const poll = await axios.get(pollUrl, { headers, timeout: 25000 });
                            if (poll?.data?.data) return poll.data;
                        }
                    }
                    return data;
                } catch (err) {
                    lastError = err;
                    const status = err?.response?.status;
                    const data = err?.response?.data;
                    if (status === 404) continue;
                    if (status === 503 && typeof data === 'string' && data.includes('space is in error')) {
                        break;
                    }
                }
            }
        }
    }
    throw lastError || new Error('Space request failed');
}

function formatName(label) {
    const raw = String(label || '').replace(/_/g, ' ').trim();
    return raw || 'Sconosciuto';
}

function ensureFont() {
    if (fontRegistered) return;
    const fontPath = path.join(process.cwd(), 'UI', 'Fonts', 'Mojangles.ttf');
    try {
        registerFont(fontPath, { family: 'Mojangles' });
        fontRegistered = true;
    } catch {
        fontRegistered = false;
    }
}

async function fetchSpriteUrlByName(name) {
    const key = name.toLowerCase();
    if (spriteCache.has(key)) return spriteCache.get(key);
    try {
        const res = await axios.get(`https://pokeapi.co/api/v2/pokemon/${key}`, { timeout: 8000 });
        const id = res?.data?.id;
        if (!id) return null;
        const url = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
        spriteCache.set(key, url);
        return url;
    } catch {
        spriteCache.set(key, null);
        return null;
    }
}

async function fetchAltNamesByName(name) {
    const key = name.toLowerCase();
    const cached = altNameCache.get(key);
    const now = Date.now();
    if (cached && now - cached.at < altNameTtlMs) return cached.names;
    try {
        const res = await axios.get(`https://pokeapi.co/api/v2/pokemon/${key}`, { timeout: 8000 });
        const speciesUrl = res?.data?.species?.url;
        if (!speciesUrl) return [];
        const sRes = await axios.get(speciesUrl, { timeout: 8000 });
        const names = Array.isArray(sRes?.data?.names)
            ? sRes.data.names
                .map((n) => ({ name: n?.name, lang: n?.language?.name }))
                .filter((n) => n?.name && n?.lang)
            : [];
        altNameCache.set(key, { at: now, names });
        return names;
    } catch {
        return [];
    }
}

function pickRandomAltName(names, baseName) {
    if (!Array.isArray(names) || !names.length) return null;
    const base = String(baseName || '').toLowerCase();
    const allowedLangs = new Set(['it', 'en', 'fr', 'de', 'es']);
    const filtered = names.filter((n) => {
        const lang = String(n?.lang || '').toLowerCase();
        if (!allowedLangs.has(lang)) return false;
        return String(n?.name).toLowerCase() !== base;
    });
    if (!filtered.length) return null;
    return filtered[Math.floor(Math.random() * filtered.length)];
}

function getLangFlag(code) {
    const normalized = String(code || '').toLowerCase();
    const map = {
        it: '1f1ee-1f1f9',
        en: '1f1ec-1f1e7',
        de: '1f1e9-1f1ea',
        fr: '1f1eb-1f1f7',
        es: '1f1ea-1f1f8'
    };
    return map[normalized] || null;
}

async function loadFlagImage(flagCode) {
    if (!flagCode) return null;
    if (flagImageCache.has(flagCode)) return flagImageCache.get(flagCode);
    const url = `https://twemoji.maxcdn.com/v/latest/72x72/${flagCode}.png`;
    try {
        const img = await loadImage(url);
        flagImageCache.set(flagCode, img);
        return img;
    } catch {
        flagImageCache.set(flagCode, null);
        return null;
    }
}

async function buildNameCard(name, altNameObj) {
    ensureFont();
    const height = 94;
    const paddingLeft = 18;
    const paddingRight = 12;
    const gap = 10;
    const label = name.toUpperCase();
    const altLabel = altNameObj?.name ? String(altNameObj.name).trim() : null;
    const altLang = altNameObj?.lang || null;
    const flagCode = altLang ? getLangFlag(altLang) : null;
    const flagImg = await loadFlagImage(flagCode);

    // Load sprite first to compute size
    let sprite = null;
    let sw = 0;
    let sh = 0;
    const spriteUrl = await fetchSpriteUrlByName(name);
    if (spriteUrl) {
        try {
            sprite = await loadImage(spriteUrl);
            const maxH = 80;
            const maxW = 90;
            const scale = Math.min(maxW / sprite.width, maxH / sprite.height, 1);
            sw = sprite.width * scale;
            sh = sprite.height * scale;
        } catch {
            sprite = null;
        }
    }

    const fontSize = 30;
    const altFontSize = 14;
    const tmpCanvas = createCanvas(10, 10);
    const tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.textBaseline = 'top';
    tmpCtx.font = `900 ${fontSize}px Mojangles, sans-serif`;
    const textWidth = tmpCtx.measureText(label).width;

    let altTextWidth = 0;
    if (altLabel) {
        tmpCtx.font = `700 ${altFontSize}px Mojangles, sans-serif`;
        altTextWidth = tmpCtx.measureText(altLabel).width;
    }
    const flagSize = flagImg ? altFontSize : 0;
    const flagGap = flagImg ? 6 : 0;
    const altTotalWidth = altTextWidth + flagSize + flagGap;

    const maxTextWidth = Math.max(textWidth, altTotalWidth);
    const contentWidth = maxTextWidth + (sprite ? gap + sw : 0);
    const width = Math.ceil(paddingLeft + contentWidth + paddingRight);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#e8ffd8';
    ctx.fillRect(0, 0, width, height);

    // Text
    ctx.fillStyle = '#111111';
    ctx.textBaseline = 'top';
    ctx.font = `900 ${fontSize}px Mojangles, sans-serif`;
    const contentStartX = Math.round((width - contentWidth) / 2);
    const blockHeight = altLabel ? (fontSize + 2 + altFontSize) : fontSize;
    const textY = Math.round((height - blockHeight) / 2) + 5;
    ctx.fillText(label, contentStartX, textY);
    ctx.fillText(label, contentStartX + 0.5, textY);

    if (altLabel) {
        ctx.font = `700 ${altFontSize}px Mojangles, sans-serif`;
        const altY = textY + fontSize + 2;
        const altX = contentStartX + Math.max(0, (textWidth - altTotalWidth) / 2);
        if (flagImg) {
            ctx.drawImage(flagImg, altX, altY, flagSize, flagSize);
            ctx.fillText(altLabel, altX + flagSize + flagGap, altY);
        } else {
            ctx.fillText(altLabel, altX, altY);
        }
    }

    // Sprite next to text
    if (sprite) {
        const sx = contentStartX + maxTextWidth + gap;
        const sy = height / 2 - sh / 2;
        ctx.drawImage(sprite, sx, sy, sw, sh);
    }

    return canvas.toBuffer('image/png');
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {
        try {
            const botId = client?.config2?.poketwo?.botId || '716390085896962058';
            if (!isPoketwoSpawn(message, botId)) return;

            const imageUrl = getImageUrl(message);
            if (!imageUrl) return;

            // Cross-process dedupe (same machine)
            const lockDir = path.join(process.cwd(), '..', '.poketwo_locks');
            try {
                if (!fs.existsSync(lockDir)) fs.mkdirSync(lockDir, { recursive: true });
            } catch {}
            const lockKey = `${message.guildId || 'dm'}_${message.id}`;
            const lockPath = path.join(lockDir, `${lockKey}.lock`);
            try {
                if (fs.existsSync(lockPath)) {
                    const stats = fs.statSync(lockPath);
                    if (Date.now() - stats.mtimeMs < lockTtlMs) return;
                    fs.unlinkSync(lockPath);
                }
                fs.writeFileSync(lockPath, `${Date.now()}`, { flag: 'wx' });
                setTimeout(() => {
                    try { fs.unlinkSync(lockPath); } catch {}
                }, lockTtlMs);
            } catch {
                return;
            }

            const now = Date.now();
            if (!client._poketwoLastByChannel) client._poketwoLastByChannel = new Map();
            const lastAt = client._poketwoLastByChannel.get(message.channelId) || 0;
            if (now - lastAt < rateLimitMs) return;
            client._poketwoLastByChannel.set(message.channelId, now);

            const cacheKey = `${imageUrl}|${cacheKeyVersion}`;
            const cached = lastGuessByImage.get(cacheKey);
            if (cached && now - cached.at < cacheTtlMs) {
                return message.reply(cached.payload);
            }
            if (inFlightByImage.has(cacheKey)) {
                const payload = await inFlightByImage.get(cacheKey).catch(() => null);
                if (payload) return message.reply(payload);
                return;
            }

            const provider = client?.config2?.poketwo?.provider || 'auto';
            const task = (async () => {
                let result;
                if (provider === 'hf-inference') {
                    const buffer = await fetchImageBuffer(imageUrl);
                    result = await classifyWithRetry(buffer, client);
                } else if (provider === 'space') {
                    result = await classifyWithSpace(imageUrl, client);
                } else {
                    const buffer = await fetchImageBuffer(imageUrl);
                    try {
                        result = await classifyWithRetry(buffer, client);
                    } catch {
                        result = await classifyWithSpace(imageUrl, client);
                    }
                }

                const best = pickBestLabel(result);
                if (!best) return null;

                const displayName = formatName(best.label);
                const altNames = await fetchAltNamesByName(displayName);
                const altName = pickRandomAltName(altNames, displayName);
                const cardBuffer = await buildNameCard(displayName, altName);
                const cardAttachment = new AttachmentBuilder(cardBuffer, { name: 'poke-name.png' });

                const embed = new EmbedBuilder()
                    .setColor('#6f4e37')
                    .setImage('attachment://poke-name.png')

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`poketwo_info:${displayName.slice(0, 60)}`)
                        .setLabel('Info')
                        .setEmoji({ id: '1467091572632850474' })
                        .setStyle(ButtonStyle.Secondary)
                );

                return { embeds: [embed], components: [row], files: [cardAttachment] };
            })();

            inFlightByImage.set(cacheKey, task);
            const payload = await task;
            inFlightByImage.delete(cacheKey);
            if (!payload) return;
            lastGuessByImage.set(cacheKey, { at: Date.now(), payload });
            await message.reply(payload);
        } catch (error) {
            const status = error?.response?.status;
            const data = error?.response?.data;
            const message = error?.message || String(error);
            const payload = {
                message,
                status: status ?? null,
                data: data ?? null
            };
            const text = `[POKETWO GUESS] ${JSON.stringify(payload)}`;
            if (client?.logs?.error) {
                client.logs.error(text);
            } else if (global.logger?.error) {
                global.logger.error(text);
            } else {
                console.error(text);
            }
        }
    }
};




