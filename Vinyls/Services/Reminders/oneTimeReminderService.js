const OneTimeReminder = require("../../Schemas/Reminders/oneTimeReminderSchema");

async function ensureOneTimeReminder({ key, userId, message, sendAt }) {
  if (!key || !userId || !message || !sendAt) return null;
  const pending = await OneTimeReminder.findOneAndUpdate(
    { key, sentAt: null },
    { $set: { userId, message, sendAt } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  if (pending) return pending;
  return OneTimeReminder.findOneAndUpdate(
    { key },
    { $setOnInsert: { key, userId, message, sendAt } },
    { upsert: true, new: true },
  ).catch(() => null);
}

async function runDueOneTimeReminders(client) {
  const now = new Date();
  const due = await OneTimeReminder.find({ sentAt: null, sendAt: { $lte: now } })
    .sort({ sendAt: 1 })
    .limit(100)
    .lean();
  if (!due.length) return;
  for (const row of due) {
    const claimed = await OneTimeReminder.findOneAndUpdate(
      { _id: row._id, sentAt: null },
      { $set: { sentAt: now } },
      { new: true },
    ).catch(() => null);
    if (!claimed) continue;
    try {
      const user =
        client.users.cache.get(claimed.userId) ||
        (await client.users.fetch(claimed.userId).catch(() => null));
      if (!user) {
        await OneTimeReminder.updateOne(
          { _id: claimed._id },
          { $set: { sentAt: null } },
        ).catch(() => {});
        continue;
      }
      await user.send(claimed.message);
    } catch (error) {
      global.logger?.error?.("[REMINDER] Failed to send reminder", error);
      await OneTimeReminder.updateOne(
        { _id: claimed._id },
        { $set: { sentAt: null } },
      ).catch(() => {});
    }
  }
}

module.exports = { ensureOneTimeReminder, runDueOneTimeReminders };