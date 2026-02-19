const config = require("../config.json");
const mongoose = require("mongoose");
const cron = require("node-cron");
const {
  restorePendingVoteReminders,
  restorePendingDiscadiaReminders,
  restorePendingReminders,
} = require("../Services/Bump/bumpService");
const { bootstrapSupporter } = require("./presenceUpdate");
const { restoreTtsConnections } = require("../Services/TTS/ttsService");
const {
  runDueOneTimeReminders,
} = require("../Services/Reminders/oneTimeReminderService");
const {
  startMinigameLoop,
  restoreActiveGames,
} = require("../Services/Minigames/minigameService");
const {
  startHourlyReminderLoop,
} = require("../Services/Community/chatReminderService");
const {
  startVerificationTenureLoop,
  backfillVerificationTenure,
  startVoteRoleCleanupLoop,
  runAllGuilds: renumberAllCategories,
  startCategoryNumberingLoop,
} = require("../Services/Community/communityOpsService");
const {
  startWeeklyActivityWinnersLoop,
} = require("../Services/Community/weeklyActivityWinnersService");
const { restoreTempBans } = require("../Services/Moderation/joinRaidService");
const {
  syncLiveVoiceSessionsFromGateway,
  startLiveVoiceExpLoop,
} = require("../Services/Community/activityService");
const {
  removeExpiredTemporaryRoles,
  startTemporaryRoleCleanupLoop,
} = require("../Services/Community/temporaryRoleService");
const {
  runExpiredCustomRolesSweep,
  startCustomRoleExpiryLoop,
} = require("../Services/Community/customRoleExpiryService");
const {
  startDailyPartnerAuditLoop,
} = require("../Services/Partner/partnerAuditService");
const {
  startTicketAutoClosePromptLoop,
  startTranscriptCleanupLoop,
} = require("../Services/Ticket/ticketMaintenanceService");
const { retroSyncGuildLevels } = require("../Services/Community/expService");
const IDs = require("../Utils/Config/ids");
const startupPanelsTrigger = require("../Triggers/embeds");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const {
  scheduleMemberCounterRefresh,
} = require("../Utils/Community/memberCounterUtils");

const STARTUP_PANELS_RETRY_MS = 15000;
const ENGAGEMENT_INTERVAL_MS = 60 * 1000;

function logError(client, ...args) {
  if (client?.logs?.error) {
    client.logs.error(...args);
    return;
  }
  global.logger?.error?.(...args);
}

function logInfo(client, ...args) {
  if (client?.logs?.success) {
    client.logs.success(...args);
    return;
  }
  global.logger?.info?.(...args);
}

function logLaunch(client, ...args) {
  if (client?.logs?.logging) {
    client.logs.logging(...args);
    return;
  }
  global.logger?.info?.(...args);
}

function resolveMaxListeners(client) {
  const raw = Number(client?.config?.eventListeners ?? config?.eventListeners ?? 50);
  if (!Number.isFinite(raw) || raw <= 0) return 50;
  return Math.max(10, Math.floor(raw));
}

const getChannelSafe = async (client, channelId) => {
  if (!channelId) return null;
  return (
    client.channels.cache.get(channelId) ||
    (await client.channels.fetch(channelId).catch(() => null))
  );
};

function buildMongoUrl(client) {
  return (
    process.env.MONGO_URL || process.env.MONGODB_URI || client.config.mongoURL
  );
}

async function connectMongo(client) {
  const mongoUrl = buildMongoUrl(client);
  if (!mongoUrl) {
    logError(
      client,
      "[DATABASE] No MongoDB URL has been provided. Set MONGO_URL (or MONGODB_URI) or fallback config.mongoURL.",
    );
    return false;
  }

  try {
    mongoose.set("strictQuery", false);
    mongoose.set("bufferCommands", false);

    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(mongoUrl, {
        serverSelectionTimeoutMS: 3000,
        connectTimeoutMS: 3000,
        socketTimeoutMS: 15000,
        maxPoolSize: 20,
        minPoolSize: 1,
      });
    }

    logInfo(client, "[DATABASE] Connected to MongoDB successfully.");
    return true;
  } catch (err) {
    logError(
      client,
      `[DATABASE] Error connecting to the database (continuo comunque il bootstrap): ${err}`,
    );
    return false;
  }
}

function isPrimaryScheduler(client) {
  return !client.shard || client.shard.ids?.[0] === 0;
}

async function primeInviteCache(client) {
  client.inviteCache = new Map();
  for (const guild of client.guilds.cache.values()) {
    const invites = await guild.invites.fetch().catch(() => null);
    if (!invites) continue;

    const inviteMap = new Map();
    for (const invite of invites.values()) {
      inviteMap.set(invite.code, {
        uses: invite.uses || 0,
        inviterId: invite.inviter?.id || null,
      });
    }
    client.inviteCache.set(guild.id, inviteMap);
  }
}

async function restoreBumpReminders(client) {
  const [reminders, discadia, voteReminders] = await Promise.allSettled([
    restorePendingReminders(client),
    restorePendingDiscadiaReminders(client),
    restorePendingVoteReminders(client),
  ]);

  if (reminders.status === "rejected")
    global.logger?.error?.("[DISBOARD REMINDER ERROR]", reminders.reason);
  if (discadia.status === "rejected")
    global.logger?.error?.("[DISCADIA REMINDER ERROR]", discadia.reason);
  if (voteReminders.status === "rejected")
    global.logger?.error?.("[DISCADIA VOTE REMINDER ERROR]", voteReminders.reason);
}

async function restoreCoreStartupState(client) {
  const [bootstrap, inviteCache, tts, liveVoiceSync, joinRaidRestore] = await Promise.allSettled([
    bootstrapSupporter(client),
    primeInviteCache(client),
    restoreTtsConnections(client),
    syncLiveVoiceSessionsFromGateway(client),
    Promise.allSettled(
      [...client.guilds.cache.values()].map((guild) =>
        restoreTempBans(guild, { force: true }),
      ),
    ),
  ]);

  if (bootstrap.status === "rejected")
    global.logger?.error?.("[PRESENCE BOOTSTRAP ERROR]", bootstrap.reason);
  if (inviteCache.status === "rejected")
    global.logger?.error?.("[INVITE CACHE] Failed to prime:", inviteCache.reason);
  if (tts.status === "rejected")
    global.logger?.error?.("[TTS RESTORE ERROR]", tts.reason);
  if (liveVoiceSync.status === "rejected")
    global.logger?.error?.("[VOICE LIVE SYNC ERROR]", liveVoiceSync.reason);
  if (joinRaidRestore.status === "rejected")
    global.logger?.error?.("[JOIN RAID RESTORE ERROR]", joinRaidRestore.reason);
}

async function runStartupPanels(client, label = "immediate") {
  if (client._startupPanelsRefreshRunning) return;

  client._startupPanelsRefreshRunning = true;
  try {
    if (typeof startupPanelsTrigger?.execute === "function") {
      await startupPanelsTrigger.execute(client);
    }
  } catch (err) {
    global.logger?.error?.(
      `[CLIENT READY] Startup panels refresh failed (${label}):`,
      err,
    );
  } finally {
    client._startupPanelsRefreshRunning = false;
  }
}

async function runPrimaryHeavyTasks(client, engagementTick) {
  const mainGuildId = IDs.guilds.main || null;
  const mainGuild = mainGuildId
    ? client.guilds.cache.get(mainGuildId) ||
      (await client.guilds.fetch(mainGuildId).catch(() => null))
    : client.guilds.cache.first() || null;

  const heavyTasks = [
    mainGuild
      ? retroSyncGuildLevels(mainGuild, { syncRoles: true })
      : Promise.resolve(),
    engagementTick(),
    restoreActiveGames(client),
    backfillVerificationTenure(client),
    renumberAllCategories(client),
    removeExpiredTemporaryRoles(client),
    runExpiredCustomRolesSweep(client),
    runStartupPanels(client, "startup"),
  ];

  const results = await Promise.allSettled(heavyTasks);
  const errLabels = [
    "[LEVEL RETRO]",
    "[ENGAGEMENT TICK]",
    "[MINIGAMES RESTORE]",
    "[VERIFY TENURE]",
    "[CATEGORY NUMBERING]",
    "[TEMP ROLE]",
    "[CUSTOM ROLE EXPIRY]",
    "[STARTUP PANELS]",
  ];
  results.forEach((result, index) => {
    if (result.status === "rejected" && errLabels[index]) {
      global.logger?.error?.(errLabels[index], result.reason);
    }
  });
}

function startPrimaryLoops(client, engagementTick) {
  if (client._primaryLoopsStarted) return;
  client._primaryLoopsStarted = true;

  const interval = setInterval(engagementTick, ENGAGEMENT_INTERVAL_MS);
  client._primaryEngagementInterval = interval;

  const startLoopSafely = (label, starter) => {
    try {
      starter();
    } catch (err) {
      global.logger?.error?.(label, err);
    }
  };

  const loopStarters = [
    ["[LIVE VOICE EXP] Failed to start loop", () => startLiveVoiceExpLoop(client)],
    ["[MINIGAMES] Failed to start loop", () => startMinigameLoop(client)],
    [
      "[VOTE ROLE] Failed to start cleanup loop",
      () => startVoteRoleCleanupLoop(client),
    ],
    [
      "[CHAT REMINDER] Failed to start hourly loop",
      () => startHourlyReminderLoop(client),
    ],
    [
      "[VERIFY TENURE] Failed to start loop",
      () => startVerificationTenureLoop(client),
    ],
    [
      "[CATEGORY NUMBERING] Failed to start loop",
      () => startCategoryNumberingLoop(client),
    ],
    [
      "[WEEKLY ACTIVITY] Failed to start loop",
      () => startWeeklyActivityWinnersLoop(client),
    ],
    [
      "[TEMP ROLE] Failed to start cleanup loop",
      () => startTemporaryRoleCleanupLoop(client),
    ],
    [
      "[CUSTOM ROLE EXPIRY] Failed to start cleanup loop",
      () => startCustomRoleExpiryLoop(client),
    ],
    [
      "[TICKET AUTO CLOSE PROMPT] Failed to start loop",
      () => startTicketAutoClosePromptLoop(client),
    ],
    [
      "[TRANSCRIPT CLEANUP] Failed to start loop",
      () => startTranscriptCleanupLoop(),
    ],
  ];

  for (const [label, starter] of loopStarters) {
    startLoopSafely(label, starter);
  }
}

async function queueStartupSync(client) {
  try {
    const mainGuildId = IDs.guilds.main || client.guilds.cache.first()?.id;
    if (!mainGuildId) return;

    queueIdsCatalogSync(client, mainGuildId, "startup", { delayMs: 5000 });

    const guild =
      client.guilds.cache.get(mainGuildId) ||
      (await client.guilds.fetch(mainGuildId).catch(() => null));
    if (guild) {
      scheduleMemberCounterRefresh(guild, { delayMs: 800, secondPassMs: 2400 });
    }
  } catch (err) {
    global.logger?.error?.("[IDS AUTO SYNC] Startup queue failed", err);
  }
}

function scheduleMonthlyGif(client) {
  try {
    if (client._monthlyGifTask) return;
    client._monthlyGifTask = cron.schedule(
      "0 0 1 * *",
      async () => {
        const channelId = IDs.channels.joinLeaveLogs;
        const channel = await getChannelSafe(client, channelId);
        if (!channel?.isTextBased?.()) return;

        await channel.send({
          content: "@everyone",
          files: [
            {
              attachment:
                "https://media.tenor.com/crZirRXKLuQAAAAC/manhdz2k9.gif",
              name: "monthly.gif",
            },
          ],
        });
      },
      { timezone: "Europe/Rome" },
    );
  } catch (err) {
    global.logger?.error?.("[MONTHLY GIF] Failed to schedule", err);
  }
}

function setClientPresence(client) {
  try {
    client.user?.setPresence?.({
      status: client.config?.status || "idle",
      activities: [
        {
          type: 4,
          name: "irrelevant",
          state: "discord.gg/viniliecaffe",
        },
      ],
    });
  } catch (err) {
    logError(
      client,
      "[STATUS] Errore impostazione presence:",
      err?.message || err,
    );
  }
}

module.exports = {
  name: "clientReady",
  once: true,
  async execute(client) {
    const maxListeners = resolveMaxListeners(client);
    client.setMaxListeners(maxListeners);
    require("events").EventEmitter.defaultMaxListeners = maxListeners;

    await connectMongo(client);

    const primaryScheduler = isPrimaryScheduler(client);
    if (primaryScheduler) {
      await restoreBumpReminders(client);
      try {
        startDailyPartnerAuditLoop(client);
      } catch (err) {
        global.logger?.error?.("[DAILY PARTNER AUDIT ERROR]", err);
      }
    }

    await restoreCoreStartupState(client);

    if (primaryScheduler) {
      let engagementTickRunning = false;
      const engagementTick = async () => {
        if (engagementTickRunning) return;
        engagementTickRunning = true;
        try {
          await runDueOneTimeReminders(client);
        } catch (err) {
          global.logger?.error?.(err);
        } finally {
          engagementTickRunning = false;
        }
      };

      await runPrimaryHeavyTasks(client, engagementTick);
      startPrimaryLoops(client, engagementTick);
    }

    if (client._startupPanelsRetryTimer) {
      clearTimeout(client._startupPanelsRetryTimer);
    }
    client._startupPanelsRetryTimer = setTimeout(() => {
      runStartupPanels(client, "retry+15s").catch((err) => {
        global.logger?.error?.("[STARTUP PANELS] retry failed", err);
      });
    }, STARTUP_PANELS_RETRY_MS);

    await queueStartupSync(client);
    if (primaryScheduler) scheduleMonthlyGif(client);
    setClientPresence(client);

    logLaunch(client, `[BOT] ${client.user?.username || "Bot"} has been launched!`);
  },
};

