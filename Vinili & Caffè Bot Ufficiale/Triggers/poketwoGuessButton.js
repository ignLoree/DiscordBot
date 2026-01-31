const { Events, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const SPAWN_RATE_CSV_URL = 'https://gist.githubusercontent.com/WitherredAway/1bc525b05f4cd52555a2a18c331e0cf9/raw/pokemon_chances.csv';
let spawnRateCache = null;
let spawnRateFetchedAt = 0;
const spawnRateTtlMs = 1000 * 60 * 60 * 12; // 12h

function normalizePokeName(name) {
    return String(name || '')
        .toLowerCase()
        .trim()
        .replace(/â™€/g, '-f')
        .replace(/â™‚/g, '-m')
        .replace(/[^a-z0-9.\- ]/g, '')
        .replace(/\s+/g, '-')
        .replace(/\.+/g, '')
        .replace(/-+/g, '-');
}

function formatTypes(types) {
    if (!Array.isArray(types) || types.length === 0) return 'Sconosciuto';
    return types
        .map((t) => t?.type?.name)
        .filter(Boolean)
        .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
        .join(', ');
}

function pickFlavorText(entries, lang = 'en') {
    if (!Array.isArray(entries)) return null;
    const match = entries.find(e => e?.language?.name === lang && e?.flavor_text);
    if (!match) return null;
    return String(match.flavor_text).replace(/\s+/g, ' ').trim();
}

function formatRegionFromGeneration(generationName) {
    const map = new Map([
        ['generation-i', 'Kanto'],
        ['generation-ii', 'Johto'],
        ['generation-iii', 'Hoenn'],
        ['generation-iv', 'Sinnoh'],
        ['generation-v', 'Unova'],
        ['generation-vi', 'Kalos'],
        ['generation-vii', 'Alola'],
        ['generation-viii', 'Galar'],
        ['generation-ix', 'Paldea']
    ]);
    if (!generationName) return 'Sconosciuto';
    return map.get(generationName) || 'Sconosciuto';
}

function formatNames(names) {
    if (!Array.isArray(names)) return 'Sconosciuto';
    const wanted = ['ja', 'it', 'en', 'de', 'fr'];
    const flags = {
        ja: '🇯🇵',
        it: '🇮🇹',
        en: '🇬🇧',
        de: '🇩🇪',
        fr: '🇫🇷'
    };
    const picked = [];
    for (const code of wanted) {
        const entry = names.find(n => n?.language?.name === code);
        if (entry?.name) {
            const flag = flags[code];
            picked.push(flag ? `${flag} ${entry.name}` : entry.name);
        }
    }
    return picked.length ? picked.join('\n') : 'Sconosciuto';
}

function formatStats(stats) {
    if (!Array.isArray(stats)) return 'Sconosciuto';
    const map = new Map();
    for (const s of stats) {
        if (!s?.stat?.name) continue;
        map.set(s.stat.name, s.base_stat);
    }
    const order = [
        ['hp', 'HP'],
        ['attack', 'Attack'],
        ['defense', 'Defense'],
        ['special-attack', 'Sp. Atk'],
        ['special-defense', 'Sp. Def'],
        ['speed', 'Speed']
    ];
    return order
        .map(([key, label]) => `**${label}:** ${map.get(key) ?? '—'}`)
        .join('\n');
}

function formatSpawnrate(raw) {
    if (!raw || raw === 'N/A') return 'N/A';
    const text = String(raw);
    const match = text.match(/1\/(\d+)/);
    if (match) return `1 in ${match[1]} spawns`;
    const inMatch = text.match(/1 in (\d+)/i);
    if (inMatch) return `1 in ${inMatch[1]} spawns`;
    return text;
}

function pickEnglishName(names, fallback) {
    if (!Array.isArray(names)) return fallback;
    const en = names.find(n => n?.language?.name === 'en');
    return en?.name || fallback;
}

function parseSpawnRateCsv(csvText) {
    const lines = String(csvText || '').split(/\r?\n/);
    const map = new Map();
    for (const line of lines) {
        if (!line || line.startsWith('Dex ')) continue;
        const parts = line.split(',');
        const raw = parts.length >= 4 ? parts : line.trim().split(/\s+/);
        if (raw.length < 4) continue;
        const name = raw[1];
        const chance = raw[2];
        const percent = raw[3];
        if (!name || !chance) continue;
        const key = normalizePokeName(name);
        map.set(key, `${chance} (${percent})`);
    }
    return map;
}

async function getSpawnRateMap() {
    const now = Date.now();
    if (spawnRateCache && now - spawnRateFetchedAt < spawnRateTtlMs) return spawnRateCache;
    const res = await axios.get(SPAWN_RATE_CSV_URL, { timeout: 8000 });
    const map = parseSpawnRateCsv(res.data);
    spawnRateCache = map;
    spawnRateFetchedAt = now;
    return map;
}

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (!interaction?.isButton()) return;
        if (!interaction.customId?.startsWith('poketwo_info:')) return;

        const embed = interaction.message?.embeds?.[0];
        const name = embed?.title || interaction.customId.split(':').slice(1).join(':') || 'Pokémon';
        const imageUrl = embed?.image?.url || embed?.thumbnail?.url || null;

        async function safeDefer(i) {
            if (i.deferred || i.replied) return true;
            try {
                await i.deferReply({ flags: 1 << 6 });
                return true;
            } catch (err) {
                if (err?.code === 10062 || err?.code === 40060) return false;
                return false;
            }
        }

        const ok = await safeDefer(interaction);
        if (!ok) return;

        const infoEmbed = new EmbedBuilder()
            .setColor('#6f4e37')
            .setFooter({ text: ' ' });

        try {
            const normalized = normalizePokeName(name);
            if (normalized) {
                const res = await axios.get(`https://pokeapi.co/api/v2/pokemon/${normalized}`, { timeout: 8000 });
                const data = res.data || {};
                const speciesUrl = data?.species?.url;
                let species = null;
                if (speciesUrl) {
                    try {
                        const sRes = await axios.get(speciesUrl, { timeout: 8000 });
                        species = sRes.data || null;
                    } catch {
                        species = null;
                    }
                }

                const types = formatTypes(data.types);
                const height = typeof data.height === 'number' ? `${(data.height / 10).toFixed(1)} m` : 'Sconosciuto';
                const weight = typeof data.weight === 'number' ? `${(data.weight / 10).toFixed(1)} kg` : 'Sconosciuto';
                const id = data.id ? `#${data.id}` : 'Sconosciuto';
                const region = species ? formatRegionFromGeneration(species?.generation?.name) : 'Sconosciuto';
                const desc = species ? pickFlavorText(species.flavor_text_entries, 'en') : null;
                const names = species ? formatNames(species.names) : 'Sconosciuto';
                const stats = formatStats(data.stats);
                let spawnrate = 'N/A';
                try {
                    const map = await getSpawnRateMap();
                    const key = normalizePokeName(name);
                    spawnrate = formatSpawnrate(map.get(key)) || 'N/A';
                } catch {
                    spawnrate = 'N/A';
                }

                if (desc) infoEmbed.setDescription(desc);
                const displayName = species ? pickEnglishName(species.names, name) : name;
                infoEmbed.setTitle(`${id} - ${displayName}`);
                const sprite =
                    data?.sprites?.other?.['official-artwork']?.front_default
                    || data?.sprites?.other?.dream_world?.front_default
                    || data?.sprites?.front_default
                    || null;
                if (sprite) {
                    infoEmbed.setThumbnail(sprite);
                } else if (imageUrl) {
                    infoEmbed.setThumbnail(imageUrl);
                }
                infoEmbed.addFields(
                    { name: 'Types', value: types, inline: true },
                    { name: 'Region', value: region, inline: true },
                    { name: 'Spawnrate', value: spawnrate, inline: true },
                    { name: 'Base Stats', value: stats, inline: true },
                    { name: 'Names', value: names, inline: true },
                    { name: 'Appearance', value: `**Height:** ${height}\n**Weight:** ${weight}`, inline: true }
                );
            }
        } catch {
        }

        if (!interaction.deferred && !interaction.replied) return;
        await interaction.editReply({ embeds: [infoEmbed] });
    }
};

