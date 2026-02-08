const OneTimeReminder = require("../../Schemas/Reminders/oneTimeReminderSchema");

async function ensureOneTimeReminder({ key, userId, message, sendAt }) {
  if (!key || !userId || !message || !sendAt) return null;
  return OneTimeReminder.findOneAndUpdate(
    { key },
    { $setOnInsert: { key, userId, message, sendAt } },
    { upsert: true, new: true }
  );
}

async function runDueOneTimeReminders(client) {
  const now = new Date();
  const due = await OneTimeReminder.find({
    sentAt: null,
    sendAt: { $lte: now }
  });
  if (!due.length) return;
  for (const reminder of due) {
    try {
      const user = client.users.cache.get(reminder.userId)
        || await client.users.fetch(reminder.userId).catch(() => null);
      if (!user) continue;
      await user.send(reminder.message);
      reminder.sentAt = new Date();
      await reminder.save();
    } catch (error) {
      global.logger?.error?.("[REMINDER] Failed to send reminder", error);
    }
  }
}

module.exports = { ensureOneTimeReminder, runDueOneTimeReminders };
