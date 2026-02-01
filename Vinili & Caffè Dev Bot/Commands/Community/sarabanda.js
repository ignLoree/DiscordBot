const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType
} = require('@discordjs/voice');
const axios = require('axios');
const { addPoints, getLeaderboard } = require('../../Services/Sarabanda/sarabandaStatsService');

const ACTIVE_GAMES = new Map();
const SARABANDA_AUDIO_CACHE = new Map();
const MAX_CLIP_SECONDS = 10;
const GUESS_WINDOW_MS = 60000;
const SEARCH_TERMS = [
  'love', 'night', 'baby', 'dance', 'heart', 'dream', 'fire', 'summer', 'moon', 'rain', 'star', 'day'
];
const CHART_CACHE = { items: [], expiresAt: 0 };
const CHART_CACHE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_CHART_COUNTRY = 'it';
const DEFAULT_CHART_LIMIT = 100;

function normalizeText(value) {
  if (!value) return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCorrectGuess(guess, title, artist) {
  const g = normalizeText(guess);
  const t = normalizeText(title);
  const a = normalizeText(artist);
  if (!g || !t) return false;
  if (g.includes(t)) return true;
  if (a && g.includes(a) && g.includes(t)) return true;
  return false;
}

function isSameSong(aTitle, aArtist, bTitle, bArtist) {
  const t1 = normalizeText(aTitle);
  const t2 = normalizeText(bTitle);
  const a1 = normalizeText(aArtist);
  const a2 = normalizeText(bArtist);
  if (!t1 || !t2) return false;
  if (t1 !== t2) return false;
  if (!a1 || !a2) return true;
  return a1 === a2;
}

async function fetchChartTracks(country = DEFAULT_CHART_COUNTRY, limit = DEFAULT_CHART_LIMIT) {
  const now = Date.now();
  if (CHART_CACHE.items.length && CHART_CACHE.expiresAt > now) {
    return CHART_CACHE.items;
  }
  const url = `https://rss.applemarketingtools.com/api/v2/${country}/music/most-played/${limit}/songs.json`;
  const res = await axios.get(url, { timeout: 12000 });
  const items = Array.isArray(res.data?.feed?.results) ? res.data.feed.results : [];
  CHART_CACHE.items = items;
  CHART_CACHE.expiresAt = now + CHART_CACHE_MS;
  return items;
}

async function fetchPopularTrack(config) {
  const country = config?.sarabanda?.chartCountry || DEFAULT_CHART_COUNTRY;
  const limit = config?.sarabanda?.chartLimit || DEFAULT_CHART_LIMIT;
  const items = await fetchChartTracks(country, limit);
  if (!items.length) throw new Error('No chart items');
  const pick = items[Math.floor(Math.random() * items.length)];
  const term = `${pick.name} ${pick.artistName}`;
  const res = await axios.get('https://itunes.apple.com/search', {
    params: {
      term,
      media: 'music',
      entity: 'song',
      limit: 5,
      country
    },
    timeout: 12000
  });
  const results = Array.isArray(res.data?.results) ? res.data.results : [];
  const usable = results.filter(r => r?.previewUrl && r?.trackName && r?.artistName);
  if (!usable.length) throw new Error('No preview for chart item');
  const exact = usable.find(r => isSameSong(r.trackName, r.artistName, pick.name, pick.artistName));
  return exact || usable[0];
}

async function fetchRandomTrack(config) {
  const popularOnly = config?.sarabanda?.popularOnly !== false;
  if (popularOnly) {
    try {
      return await fetchPopularTrack(config);
    } catch {
    }
  }
  const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
  const res = await axios.get('https://itunes.apple.com/search', {
    params: {
      term,
      media: 'music',
      entity: 'song',
      limit: 50
    },
    timeout: 12000
  });
  const results = Array.isArray(res.data?.results) ? res.data.results : [];
  const usable = results.filter(r => r?.previewUrl && r?.trackName && r?.artistName);
  if (!usable.length) {
    throw new Error('No tracks available');
  }
  return usable[Math.floor(Math.random() * usable.length)];
}

function trimAudioToSeconds(inputBuffer, seconds, format = 'mp3') {
  const isOgg = format === 'ogg';
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      '-t',
      String(seconds),
      '-vn',
      ...(isOgg
        ? ['-c:a', 'libopus', '-b:a', '96k', '-f', 'ogg', 'pipe:1']
        : ['-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3', 'pipe:1'])
    ];
    const ff = spawn('ffmpeg', args);
    const chunks = [];
    const errChunks = [];
    ff.stdout.on('data', (chunk) => chunks.push(chunk));
    ff.stderr.on('data', (chunk) => errChunks.push(chunk));
    ff.stdin.on('error', (err) => {
      if (err && err.code === 'EPIPE') return;
      reject(err);
    });
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(Buffer.concat(errChunks).toString('utf8') || 'ffmpeg failed'));
      }
      const out = Buffer.concat(chunks);
      if (!out.length) return reject(new Error('ffmpeg produced empty output'));
      return resolve(out);
    });
    ff.stdin.write(inputBuffer);
    ff.stdin.end();
  });
}

async function buildClip(previewUrl) {
  const res = await axios.get(previewUrl, { responseType: 'arraybuffer', timeout: 15000 });
  const inputBuffer = Buffer.from(res.data);
  return trimAudioToSeconds(inputBuffer, MAX_CLIP_SECONDS);
}

async function buildClipOgg(previewUrl) {
  const res = await axios.get(previewUrl, { responseType: 'arraybuffer', timeout: 15000 });
  const inputBuffer = Buffer.from(res.data);
  return trimAudioToSeconds(inputBuffer, MAX_CLIP_SECONDS, 'ogg');
}

function calcPoints(startAt) {
  const elapsed = Date.now() - startAt;
  const remaining = Math.max(0, GUESS_WINDOW_MS - elapsed);
  const ratio = remaining / GUESS_WINDOW_MS;
  return Math.max(1, Math.ceil(ratio * 10));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sarabanda')
    .setDescription('Gioco Sarabanda: indovina la canzone')
    .setDMPermission(false)
    .addSubcommand(sub =>
      sub
        .setName('start')
        .setDescription('Avvia una nuova partita di Sarabanda')
    )
    .addSubcommand(sub =>
      sub
        .setName('leaderboard')
        .setDescription('Mostra la classifica Sarabanda')
        .addStringOption(opt =>
          opt
            .setName('periodo')
            .setDescription('Periodo classifica')
            .setRequired(false)
            .addChoices(
              { name: 'settimanale', value: 'weekly' },
              { name: 'mensile', value: 'monthly' },
              { name: 'totale', value: 'total' }
            )
        )
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'leaderboard') {
      const period = interaction.options.getString('periodo') || 'weekly';
      const rows = await getLeaderboard(interaction.guild.id, period, 10);
      if (!rows.length) {
        return interaction.reply({ content: '<:vegax:1443934876440068179> Nessun dato disponibile.' });
      }
      const lines = [];
      let idx = 1;
      for (const row of rows) {
        const user = await client.users.fetch(row.userId).catch(() => null);
        const name = user ? user.username : row.userId;
        const points =
          period === 'weekly' ? row.weeklyPoints :
            period === 'monthly' ? row.monthlyPoints :
              row.totalPoints;
        lines.push(`**${idx}.** ${name} - ${points}`);
        idx += 1;
      }
      return interaction.reply({
        content: `<a:VC_Winner:1448687700235256009> Classifica Sarabanda (${period}):\n${lines.join('\n')}`
      });
    }

    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
    if (!isAdmin) {
      return interaction.reply({
        content: '<:vegax:1443934876440068179> Solo gli admin possono avviare Sarabanda.',
        flags: 1 << 6
      });
    }

    const channelId = interaction.channel?.id;
    if (!channelId) {
      return interaction.reply({ content: '<:vegax:1443934876440068179> Canale non valido.', flags: 1 << 6 });
    }

    const active = ACTIVE_GAMES.get(channelId);
    if (active && Date.now() < active.endsAt) {
      return interaction.reply({
        content: '<:vegax:1443934876440068179> C\'è già una partita in corso in questo canale.',
        flags: 1 << 6
      });
    }

    await interaction.deferReply();

    let track;
    let clipBuffer;
    let clipOgg;
    try {
      track = await fetchRandomTrack(client.config2);
      clipBuffer = await buildClip(track.previewUrl);
      clipOgg = await buildClipOgg(track.previewUrl);
    } catch (err) {
      global.logger?.error?.('[SARABANDA] Failed to build clip:', err);
      return interaction.editReply({
        content: '<:vegax:1443934876440068179> Errore nel generare il frammento audio. Riprova.'
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('▶ Sarabanda - Play')
      .setDescription('Indovina la canzone! Hai 60 secondi per rispondere.')
      .setColor('#6f4e37');

    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sarabanda_audio_${interaction.id}`)
        .setLabel('🎧 Ascolta')
        .setStyle(ButtonStyle.Secondary)
    );

    const voiceChannel = interaction.member?.voice?.channel;
    const listeners = voiceChannel?.members?.filter(m => !m.user.bot) || null;
    const canPlayInVoice = voiceChannel && listeners && listeners.size > 0;

    const response = await interaction.editReply({
      embeds: [embed],
      components: [buttonRow]
    });

    SARABANDA_AUDIO_CACHE.set(interaction.id, {
      buffer: clipBuffer,
      ogg: clipOgg,
      createdAt: Date.now()
    });

    if (canPlayInVoice) {
      try {
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: voiceChannel.guild.id,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator
        });
        connection.on('error', () => {});
        const player = createAudioPlayer();
        const resource = createAudioResource(Readable.from(clipOgg), { inputType: StreamType.OggOpus });
        player.play(resource);
        connection.subscribe(player);
        const cleanup = () => {
          try { connection.destroy(); } catch {}
        };
        player.on(AudioPlayerStatus.Idle, cleanup);
        player.on('error', cleanup);
      } catch (err) {
        global.logger?.error?.('[SARABANDA] Voice playback failed:', err);
        await interaction.followUp({
          content: '<:vegax:1443934876440068179> Non sono riuscito a riprodurre in vocale. Ecco il file audio.',
          files: [{ attachment: clipBuffer, name: 'sarabanda.mp3' }],
          flags: 1 << 6
        });
      }
    }

    const startAt = Date.now();
    const endsAt = startAt + GUESS_WINDOW_MS;
    const collector = interaction.channel.createMessageCollector({ time: GUESS_WINDOW_MS });

    ACTIVE_GAMES.set(channelId, {
      endsAt,
      answer: { title: track.trackName, artist: track.artistName },
      collector
    });

    let winner = null;
    collector.on('collect', async (msg) => {
      if (!msg.guild || msg.author?.bot) return;
      if (!isCorrectGuess(msg.content, track.trackName, track.artistName)) {
        try {
          await msg.react('❌');
        } catch {}
        return;
      }
      winner = msg.author;
      collector.stop('guessed');
      try {
        await msg.react('✅');
      } catch {}
      const points = calcPoints(startAt);
      await addPoints({
        guildId: msg.guild.id,
        userId: msg.author.id,
        points
      });
      await interaction.channel.send(
        `<a:VC_Winner:1448687700235256009> ${msg.author} ha vinto! Ha indovinato **${track.trackName}** — ${track.artistName} (+${points} punti)`
      );
    });

    collector.on('end', async (_collected, reason) => {
      ACTIVE_GAMES.delete(channelId);
      SARABANDA_AUDIO_CACHE.delete(interaction.id);
      if (reason === 'guessed') return;
      const answerText = `**${track.trackName}** — ${track.artistName}`;
      await interaction.channel.send(
        `<:vegax:1443934876440068179> Tempo scaduto! La risposta era: ${answerText}`
      );
    });

    const buttonCollector = response.createMessageComponentCollector({
      time: GUESS_WINDOW_MS,
      filter: (i) => i.customId === `sarabanda_audio_${interaction.id}`
    });
    buttonCollector.on('collect', async (btn) => {
      const cached = SARABANDA_AUDIO_CACHE.get(interaction.id);
      if (!cached?.ogg && !cached?.buffer) {
        return btn.reply({ content: '<:vegax:1443934876440068179> Audio non disponibile.', flags: 1 << 6 });
      }
      await btn.reply({
        content: '🎧 Ecco il frammento audio.',
        files: [{ attachment: cached.ogg || cached.buffer, name: cached.ogg ? 'sarabanda.ogg' : 'sarabanda.mp3' }],
        flags: 1 << 6
      });
    });
    buttonCollector.on('end', async () => {
      try {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`sarabanda_audio_${interaction.id}`)
            .setLabel('🎧 Ascolta')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );
        await response.edit({ components: [row] });
      } catch {}
    });
  }
};
