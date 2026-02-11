const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

const RESTART_FLAG = 'restart.json';
const VALID_SCOPES = new Set([
  'full',
  'handlers',
  'commands',
  'prefix',
  'events',
  'triggers',
  'services',
  'utils',
  'schemas',
  'all'
]);

function pullLatest() {
  try {
    const repoRoot = path.resolve(process.cwd(), '..');
    if (!fs.existsSync(path.join(repoRoot, '.git'))) return;
    const branch = process.env.GIT_BRANCH || 'main';
    child_process.spawnSync('git', ['pull', 'origin', branch, '--ff-only'], { cwd: repoRoot, stdio: 'inherit' });
    child_process.spawnSync('git', ['submodule', 'update', '--init', '--recursive'], { cwd: repoRoot, stdio: 'inherit' });
  } catch {}
}

function buildUsageEmbed() {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Comando restart')
    .setDescription([
      '`+restart full`',
      '`+restart handlers`',
      '`+restart commands`',
      '`+restart prefix`',
      '`+restart events`',
      '`+restart triggers`',
      '`+restart services`',
      '`+restart utils`',
      '`+restart schemas`',
      '`+restart all`',
      '',
      'Alias: `+rs`, `+reload`',
      'Se non specifichi la scope, usa `full`.'
    ].join('\n'));
}

module.exports = {
  name: 'restart',
  aliases: ['rs', 'reload'],
  subcommands: ['full', 'handlers', 'commands', 'prefix', 'events', 'triggers', 'services', 'utils', 'schemas', 'all'],

  async execute(message, args = [], client) {
    await message.channel.sendTyping().catch(() => {});

    const rawScope = String(args[0] || 'full').toLowerCase();
    const scope = rawScope === 'help' || rawScope === 'uso' ? 'help' : rawScope;

    if (scope === 'help') {
      await safeMessageReply(message, {
        embeds: [buildUsageEmbed()],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    if (!VALID_SCOPES.has(scope)) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Scope non valida. Usa `+restart help`.')
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    try {
      const requestedAt = new Date().toISOString();
      const channelId = message.channelId || message.channel?.id || null;

      if (scope === 'full') {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor('#6f4e37')
              .setDescription('<:attentionfromvega:1443651874032062505> Riavvio richiesto. Ti avviso qui quando è completato.')
          ],
          allowedMentions: { repliedUser: false }
        });

        const notifyPath = path.resolve(process.cwd(), '..', 'restart_notify.json');
        fs.writeFileSync(
          notifyPath,
          JSON.stringify({ channelId, by: message.author.id, at: requestedAt, scope: 'full' }, null, 2),
          'utf8'
        );

        const flagPath = path.resolve(process.cwd(), '..', RESTART_FLAG);
        fs.writeFileSync(flagPath, JSON.stringify({ at: requestedAt, by: message.author.id }, null, 2), 'utf8');
        return;
      }

      const start = Date.now();
      pullLatest();
      await client.reloadScope(scope);
      const elapsed = Math.max(1, Math.round((Date.now() - start) / 1000));

      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('#6f4e37')
            .setDescription(`<:vegacheckmark:1443666279058772028> Reload \`${scope}\` completato in **${elapsed}s**.`)
        ],
        allowedMentions: { repliedUser: false }
      });
    } catch (error) {
      global.logger.error(error);
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Errore durante restart/reload.')
        ],
        allowedMentions: { repliedUser: false }
      });
    }
  }
};

