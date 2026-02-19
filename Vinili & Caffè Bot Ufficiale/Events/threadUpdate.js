const {
  AuditLogEvent,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  ARROW,
  toDiscordTimestamp,
  yesNo,
  formatAuditActor,
  buildAuditExtraLines,
  resolveChannelRolesLogChannel,
  resolveResponsible,
} = require("../Utils/Logging/channelRolesLogUtils");

const THREAD_UPDATE_ACTION = AuditLogEvent?.ThreadUpdate ? 111;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTagList(value) {
  const list = Array.isArray(value) ? value.map((id) => String(id)) : [];
  list.sort((a, b) => a.localeCompare(b));
  return list;
}

function isHttpUrl(value) {
  return /^https?:\/\/\S+$/i.test(String(value || "").trim());
}

async function resolveResponsibleWithRetry(guild, threadId, retries = 3, delayMs = 700) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const audit = await resolveResponsible(
      guild,
      THREAD_UPDATE_ACTION,
      (entry) => String(entry?.target?.id || "") === String(threadId || ""),
    );
    if (audit?.executor || audit?.entry) return audit;
    if (attempt < retries - 1) await sleep(delayMs);
  }
  return { executor: null, reason: null, entry: null };
}

module.exports = {
  name: "threadUpdate",
  async execute(oldThread, newThread) {
    try {
      const guild = newThread?.guild || oldThread?.guild;
      const threadId = String(newThread?.id || oldThread?.id || "");
      if (!guild || !threadId) return;

      const nameChanged = oldThread?.name !== newThread?.name;
      const archivedChanged = Boolean(oldThread?.archived) !== Boolean(newThread?.archived);
      const lockedChanged = Boolean(oldThread?.locked) !== Boolean(newThread?.locked);
      const oldTags = normalizeTagList(oldThread?.appliedTags);
      const newTags = normalizeTagList(newThread?.appliedTags);
      const tagsChanged =
        String(oldTags.join(",")) !==
        String(newTags.join(","));
      if (!nameChanged && !archivedChanged && !lockedChanged && !tagsChanged) return;

      const logChannel = await resolveChannelRolesLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const audit = await resolveResponsibleWithRetry(guild, threadId);
      const responsible = formatAuditActor(audit.executor);

      const lines = [
        `${ARROW} **Responsible:** ${responsible}`,
        `${ARROW} **Target:** ${newThread || oldThread || "thread"} \`${threadId}\``,
        `${ARROW} ${toDiscordTimestamp(new Date(), "F")}`,
        "",
        "**Changes**",
      ];

      if (nameChanged) {
        lines.push(`${ARROW} **Name:** ${oldThread.name || "sconosciuto"} ${ARROW} ${newThread.name || "sconosciuto"}`);
      }
      if (archivedChanged) {
        lines.push(
          `${ARROW} **Archived:** ${yesNo(Boolean(oldThread.archived))} ${ARROW} ${yesNo(Boolean(newThread.archived))}`,
        );
      }
      if (lockedChanged) {
        lines.push(
          `${ARROW} **Locked:** ${yesNo(Boolean(oldThread.locked))} ${ARROW} ${yesNo(Boolean(newThread.locked))}`,
        );
      }
      if (tagsChanged) {
        lines.push(
          `${ARROW} **Applied Tags:** \`${oldTags.join(",") || "none"}\` ${ARROW} \`${newTags.join(",") || "none"}\``,
        );
      }
      lines.push(...buildAuditExtraLines(audit.entry, ["name", "archived", "locked", "applied_tags"]));

      const embed = new EmbedBuilder()
        .setColor("#F59E0B")
        .setTitle("Thread Update")
        .setDescription(lines.join("\n"));

      const payload = { embeds: [embed] };
      if (isHttpUrl(newThread?.url)) {
        payload.components = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel("Go to Thread")
              .setURL(newThread.url),
          ),
        ];
      }

      await logChannel.send(payload);
    } catch (error) {
      global.logger?.error?.("[threadUpdate] failed:", error);
    }
  },
};
