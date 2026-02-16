const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { ActivityType } = require('discord.js');
const IDs = require('../Utils/Config/ids');
const { checkAndInstallPackages } = require('../Utils/Moderation/checkPackages');
const { getChannelSafe } = require('../Utils/Logging/commandUsageLogger');

const POLL_REMINDER_ROLE_ID = IDs.roles.HighStaff;
const POLL_REMINDER_CHANNEL_ID = '1442569285909217301';
const RESTART_CLEANUP_DELAY_MS = 2000;

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    try {
      client.user.setStatus(client.config.status);
      client.logs.success(`[STATUS] Bot status loaded as ${client.config.status}.`);
      client.user.setActivity({
        type: ActivityType.Custom,
        name: 'irrelevant',
        state: '☕📀 discord.gg/viniliecaffe'
      });

      if (typeof checkAndInstallPackages === 'function' && process.env.CHECK_PACKAGES_ON_READY === '1') {
        Promise.resolve(checkAndInstallPackages(client)).catch((err) => {
          global.logger.error('[PACKAGES] Check failed:', err);
        });
      }

      cron.schedule('0 19 * * *', async () => {
        const guild = client.guilds.cache.get(IDs.guilds.main) || await client.guilds.fetch(IDs.guilds.main).catch(() => null);
        if (!guild) return;
        const channel = guild.channels.cache.get(POLL_REMINDER_CHANNEL_ID)
          || await guild.channels.fetch(POLL_REMINDER_CHANNEL_ID).catch(() => null);
        if (!channel) return;
        await channel.send({
          content: `<:attentionfromvega:1443651874032062505> <@&${POLL_REMINDER_ROLE_ID}> ricordatevi di mettere il poll usando il comando dedicato! </poll create:1467597234387419478>`
        });
      }, { timezone: 'Europe/Rome' });

      const restartNotifyPath = path.resolve(process.cwd(), '..', 'restart_notify.json');
      if (fs.existsSync(restartNotifyPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(restartNotifyPath, 'utf8'));
          const channel = await getChannelSafe(client, data?.channelId);
          if (channel) {
            const elapsedMs = data?.at ? Date.now() - Date.parse(data.at) : null;
            const elapsed = Number.isFinite(elapsedMs) ? ` in ${Math.max(1, Math.round(elapsedMs / 1000))}s` : '';
            const restartMsg = await channel.send(`<:vegacheckmark:1443666279058772028> Bot riavviato con successo${elapsed}.`).catch(() => null);
            if (restartMsg) {
              setTimeout(() => {
                restartMsg.delete().catch(() => { });
              }, RESTART_CLEANUP_DELAY_MS);
            }
            if (data?.notifyMessageId) {
              const notifyMsg = await channel.messages.fetch(data.notifyMessageId).catch(() => null);
              if (notifyMsg) {
                setTimeout(() => {
                  notifyMsg.delete().catch(() => {});
                }, RESTART_CLEANUP_DELAY_MS);
              }
            }
            if (data?.commandMessageId) {
              const cmdMsg = await channel.messages.fetch(data.commandMessageId).catch(() => null);
              if (cmdMsg) {
                setTimeout(() => {
                  cmdMsg.delete().catch(() => {});
                }, RESTART_CLEANUP_DELAY_MS);
              }
            }
          }
          fs.unlinkSync(restartNotifyPath);
        } catch (err) {
          global.logger.error('Errore durante il post-restart:', err);
        }
      } else if (fs.existsSync('./restart.json')) {
        try {
          const data = JSON.parse(fs.readFileSync('./restart.json', 'utf8'));
          const channel = await getChannelSafe(client, data?.channelID);
          if (channel) {
            const restartMsg = await channel.send('<:vegacheckmark:1443666279058772028> Il bot è stato riavviato con successo!').catch(() => null);
            if (restartMsg) {
              setTimeout(() => {
                restartMsg.delete().catch(() => { });
              }, RESTART_CLEANUP_DELAY_MS);
            }
          }
          fs.unlinkSync('./restart.json');
        } catch (err) {
          global.logger.error('Errore durante il post-restart:', err);
        }
      }
    } catch (error) {
      const detail = error?.stack || error?.message || error;
      client.logs.error('[STATUS] Error while loading bot status.', detail);
      global.logger.error('[STATUS] Error while loading bot status.', detail);
    }
  }
};
