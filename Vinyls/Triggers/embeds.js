const Embeds = require("../Embeds");

const LOG_PANELS = String(process.env.LOG_PANELS || "0") === "1";
const WARMUP_SPONSOR_DELAY_MS = 500;
const WARMUP_SPONSOR_BETWEEN_MS = 100;
const WARMUP_BATCH_SIZE = 6;

async function runPanelTask(section, label, runner, client) {
  const startedAt = Date.now();
  try {
    await runner(client);
    if (LOG_PANELS) {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= 1000) global.logger?.info?.(`[PANELS:${section}] ${label} completed in ${elapsed}ms.`);
    }
  } catch (err) {
    global.logger.error(`[CLIENT READY:${section}] ${label} failed:`, err);
  }
}

async function runMenuAndSelectSections(client) {
  const startedAt = Date.now();
  for (const panel of Embeds.getPanelsBySection(Embeds.SECTION_MENU)) {
    await runPanelTask("runMenuAndSelectSections", panel.name, panel.run, client);
  }
  if (LOG_PANELS) global.logger?.info?.(`[PANELS] runMenuAndSelectSections finished in ${Date.now() - startedAt}ms.`);
}

async function runEmbedWithButtonsSections(client) {
  const startedAt = Date.now();
  for (const panel of Embeds.getPanelsBySection(Embeds.SECTION_EMBED_WITH_BUTTONS)) {
    await runPanelTask("runEmbedWithButtonsSections", panel.name, panel.run, client);
  }
  if (LOG_PANELS) global.logger?.info?.(`[PANELS] runEmbedWithButtonsSections finished in ${Date.now() - startedAt}ms.`);
}

async function runEmbedOnlySections(client) {
  const startedAt = Date.now();
  for (const panel of Embeds.getPanelsBySection(Embeds.SECTION_EMBED_ONLY)) {
    await runPanelTask("runEmbedOnlySections", panel.name, panel.run, client);
  }
  if (LOG_PANELS) global.logger?.info?.(`[PANELS] runEmbedOnlySections finished in ${Date.now() - startedAt}ms.`);
}

async function warmupSponsorGuilds(client) {
  const startedAt = Date.now();
  const sponsorIds = Array.isArray(client.config?.sponsorGuildIds) ? client.config.sponsorGuildIds : Object.keys(client.config?.sponsorVerifyChannelIds || {});
  if (sponsorIds.length === 0) return;

  await new Promise((r) => {
    const timer = setTimeout(r, WARMUP_SPONSOR_DELAY_MS);
    timer.unref?.();
  });
  for (let i = 0; i < sponsorIds.length; i += WARMUP_BATCH_SIZE) {
    const batch = sponsorIds.slice(i, i + WARMUP_BATCH_SIZE);
    await Promise.all(
      batch.map((guildId) =>
        client.guilds.fetch(guildId).catch((err) => {
          if (LOG_PANELS) global.logger.warn("[SPONSOR] Warmup guild " + guildId + ":", err?.message || err);
          return null;
        }),
      ),
    );
    if (i + WARMUP_BATCH_SIZE < sponsorIds.length) {
      await new Promise((r) => {
        const t = setTimeout(r, WARMUP_SPONSOR_BETWEEN_MS);
        t.unref?.();
      });
    }
  }
  if (LOG_PANELS) global.logger?.info?.(`[PANELS] warmupSponsorGuilds finished in ${Date.now() - startedAt}ms for ${sponsorIds.length} guild(s).`);
}

async function runAllClientReadyPanels(client) {
  const startedAt = Date.now();
  await warmupSponsorGuilds(client);
  await runMenuAndSelectSections(client);
  await runEmbedWithButtonsSections(client);
  await runEmbedOnlySections(client);
  if (LOG_PANELS) global.logger?.info?.(`[PANELS] runAllClientReadyPanels finished in ${Date.now() - startedAt}ms.`);
}

module.exports = {
  name: "startupPanelsInternal",
  once: false,
  async execute(client) {
    await runAllClientReadyPanels(client);
  },
};