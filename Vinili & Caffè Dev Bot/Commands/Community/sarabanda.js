const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { spawn } = require('child_process');
const axios = require('axios');
const { addPoints, getLeaderboard } = require('../../Services/Sarabanda/sarabandaStatsService');

const ACTIVE_GAMES = new Map();
const MAX_CLIP_SECONDS = 10;
const GUESS_WINDOW_MS = 60000;
const SEARCH_TERMS = [
  'love', 'night', 'baby', 'dance', 'heart', 'dream', 'fire', 'summer', 'moon', 'rain', 'star', 'day'
];

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

async function fetchRandomTrack() {
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

function trimAudioToSeconds(inputBuffer, seconds) {
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
      '-c:a',
      'copy',
      '-f',
      'mp3',
      'pipe:1'
    ];
    const ff = spawn('ffmpeg', args);
    const chunks = [];
    const errChunks = [];
    ff.stdout.on('data', (chunk) => chunks.push(chunk));
    ff.stderr.on('data', (chunk) => errChunks.push(chunk));
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
    try {
      track = await fetchRandomTrack();
      clipBuffer = await buildClip(track.previewUrl);
    } catch (err) {
      global.logger?.error?.('[SARABANDA] Failed to build clip:', err);
      return interaction.editReply({
        content: '<:vegax:1443934876440068179> Errore nel generare il frammento audio. Riprova.'
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('Sarabanda')
      .setDescription('Indovina la canzone! Hai 60 secondi per rispondere.')
      .setColor('#6f4e37');

    const reply = await interaction.editReply({
      embeds: [embed],
      files: [{ attachment: clipBuffer, name: 'sarabanda.mp3' }]
    });

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
      if (reason === 'guessed') return;
      const answerText = `**${track.trackName}** — ${track.artistName}`;
      await interaction.channel.send(
        `<:vegax:1443934876440068179> Tempo scaduto! La risposta era: ${answerText}`
      );
    });
  }
};
