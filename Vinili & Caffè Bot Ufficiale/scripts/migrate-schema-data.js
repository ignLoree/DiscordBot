const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const configPath = path.join(__dirname, '..', 'config.json');
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
  : {};

const mongoUrl = process.env.MONGO_URL || process.env.MONGODB_URI || config.mongoURL;
const fallbackGuildId = String(config.guildid || '').trim() || 'unknown_guild';

function log(msg, extra = '') {
  process.stdout.write(`${msg}${extra ? ` ${extra}` : ''}\n`);
}

async function ensureCollection(name) {
  const collections = await mongoose.connection.db.listCollections({ name }).toArray();
  return collections.length > 0;
}

async function migrateAfk() {
  const col = mongoose.connection.collection('afks');
  const resultA = await col.updateMany(
    { $or: [{ guildId: { $exists: false } }, { guildId: null }, { guildId: '' }] },
    { $set: { guildId: fallbackGuildId } }
  );
  await col.createIndex({ guildId: 1, userId: 1 }, { unique: true, background: true });
  return { updated: Number(resultA.modifiedCount || 0) };
}

async function normalizeTicketDefaults(col) {
  const counters = {
    guildId: 0,
    userId: 0,
    channelId: 0,
    ticketType: 0,
    open: 0,
    claimedBy: 0,
    transcript: 0,
    messageId: 0,
    descriptionPromptMessageId: 0,
    descriptionText: 0,
    descriptionSubmitted: 0,
    closeReason: 0,
    closedAt: 0,
    autoClosePromptSentAt: 0,
    descriptionSubmittedAt: 0
  };

  counters.guildId = Number((await col.updateMany(
    { $or: [{ guildId: { $exists: false } }, { guildId: null }, { guildId: '' }] },
    { $set: { guildId: fallbackGuildId } }
  )).modifiedCount || 0);

  counters.userId = Number((await col.updateMany(
    { $or: [{ userId: { $exists: false } }, { userId: null }] },
    { $set: { userId: '' } }
  )).modifiedCount || 0);

  counters.ticketType = Number((await col.updateMany(
    { $or: [{ ticketType: { $exists: false } }, { ticketType: null }, { ticketType: '' }] },
    { $set: { ticketType: 'supporto' } }
  )).modifiedCount || 0);

  counters.open = Number((await col.updateMany(
    { open: { $exists: false } },
    { $set: { open: true } }
  )).modifiedCount || 0);

  counters.claimedBy = Number((await col.updateMany(
    { claimedBy: { $exists: false } },
    { $set: { claimedBy: null } }
  )).modifiedCount || 0);

  counters.transcript = Number((await col.updateMany(
    { transcript: { $exists: false } },
    { $set: { transcript: '' } }
  )).modifiedCount || 0);

  counters.messageId = Number((await col.updateMany(
    { messageId: { $exists: false } },
    { $set: { messageId: null } }
  )).modifiedCount || 0);

  counters.descriptionPromptMessageId = Number((await col.updateMany(
    { descriptionPromptMessageId: { $exists: false } },
    { $set: { descriptionPromptMessageId: null } }
  )).modifiedCount || 0);

  counters.descriptionText = Number((await col.updateMany(
    { descriptionText: { $exists: false } },
    { $set: { descriptionText: '' } }
  )).modifiedCount || 0);

  counters.descriptionSubmitted = Number((await col.updateMany(
    { descriptionSubmitted: { $exists: false } },
    { $set: { descriptionSubmitted: false } }
  )).modifiedCount || 0);

  counters.closeReason = Number((await col.updateMany(
    { closeReason: { $exists: false } },
    { $set: { closeReason: null } }
  )).modifiedCount || 0);

  counters.closedAt = Number((await col.updateMany(
    { closedAt: { $exists: false } },
    { $set: { closedAt: null } }
  )).modifiedCount || 0);

  counters.autoClosePromptSentAt = Number((await col.updateMany(
    { autoClosePromptSentAt: { $exists: false } },
    { $set: { autoClosePromptSentAt: null } }
  )).modifiedCount || 0);

  counters.descriptionSubmittedAt = Number((await col.updateMany(
    { descriptionSubmittedAt: { $exists: false } },
    { $set: { descriptionSubmittedAt: null } }
  )).modifiedCount || 0);

  const missingChannelDocs = await col
    .find({ $or: [{ channelId: { $exists: false } }, { channelId: null }, { channelId: '' }] }, { projection: { _id: 1 } })
    .toArray();
  if (missingChannelDocs.length) {
    const bulk = missingChannelDocs.map((doc) => ({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { channelId: `legacy_ticket_${String(doc._id)}` } }
      }
    }));
    const res = await col.bulkWrite(bulk, { ordered: false });
    counters.channelId = Number(res.modifiedCount || 0);
  }

  return counters;
}

async function dedupeTicketsByChannel(col) {
  const duplicates = await col.aggregate([
    { $match: { channelId: { $type: 'string', $ne: '' } } },
    { $sort: { open: -1, updatedAt: -1, createdAt: -1, _id: -1 } },
    { $group: { _id: '$channelId', ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();

  let renamed = 0;
  for (const group of duplicates) {
    const keepId = group.ids[0];
    const extraIds = group.ids.slice(1);
    if (!extraIds.length) continue;

    const bulk = extraIds.map((id) => ({
      updateOne: {
        filter: { _id: id },
        update: {
          $set: {
            channelId: `legacy_dup_${group._id}_${String(id)}`,
            open: false
          }
        }
      }
    }));
    const res = await col.bulkWrite(bulk, { ordered: false });
    renamed += Number(res.modifiedCount || 0);
    await col.updateOne({ _id: keepId }, { $set: { channelId: String(group._id) } });
  }
  return renamed;
}

async function migrateTicket() {
  const col = mongoose.connection.collection('tickets');
  const defaults = await normalizeTicketDefaults(col);
  const deduped = await dedupeTicketsByChannel(col);
  await col.createIndex({ channelId: 1 }, { unique: true, background: true });
  await col.createIndex({ guildId: 1, userId: 1, open: 1 }, { background: true });
  await col.createIndex({ userId: 1, open: 1 }, { background: true });
  return { defaults, deduped };
}

async function migrateSuggestion() {
  const col = mongoose.connection.collection('suggestions');

  const defaults = {};
  defaults.upmembers = Number((await col.updateMany(
    { $or: [{ Upmembers: { $exists: false } }, { Upmembers: null }] },
    { $set: { Upmembers: [] } }
  )).modifiedCount || 0);
  defaults.downmembers = Number((await col.updateMany(
    { $or: [{ Downmembers: { $exists: false } }, { Downmembers: null }] },
    { $set: { Downmembers: [] } }
  )).modifiedCount || 0);
  defaults.upvotes = Number((await col.updateMany(
    { $or: [{ upvotes: { $exists: false } }, { upvotes: null }] },
    { $set: { upvotes: 0 } }
  )).modifiedCount || 0);
  defaults.downvotes = Number((await col.updateMany(
    { $or: [{ downvotes: { $exists: false } }, { downvotes: null }] },
    { $set: { downvotes: 0 } }
  )).modifiedCount || 0);
  defaults.count = Number((await col.updateMany(
    { count: { $exists: false } },
    { $set: { count: 0 } }
  )).modifiedCount || 0);

  defaults.guild = Number((await col.updateMany(
    { $or: [{ GuildID: { $exists: false } }, { GuildID: null }, { GuildID: '' }] },
    { $set: { GuildID: fallbackGuildId } }
  )).modifiedCount || 0);
  defaults.channel = Number((await col.updateMany(
    { $or: [{ ChannelID: { $exists: false } }, { ChannelID: null }, { ChannelID: '' }] },
    { $set: { ChannelID: '__legacy__' } }
  )).modifiedCount || 0);
  defaults.author = Number((await col.updateMany(
    { $or: [{ AuthorID: { $exists: false } }, { AuthorID: null }] },
    { $set: { AuthorID: 'unknown' } }
  )).modifiedCount || 0);
  defaults.msg = Number((await col.updateMany(
    { $or: [{ Msg: { $exists: false } }, { Msg: null }] },
    { $set: { Msg: '__legacy__' } }
  )).modifiedCount || 0);

  const missingSid = await col.find(
    { $or: [{ sID: { $exists: false } }, { sID: null }, { sID: '' }] },
    { projection: { _id: 1 } }
  ).toArray();
  if (missingSid.length) {
    const bulk = missingSid.map((doc) => ({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { sID: `legacy_${String(doc._id)}` } }
      }
    }));
    const res = await col.bulkWrite(bulk, { ordered: false });
    defaults.sid = Number(res.modifiedCount || 0);
  } else {
    defaults.sid = 0;
  }

  const duplicates = await col.aggregate([
    { $sort: { updatedAt: -1, createdAt: -1, _id: -1 } },
    { $group: { _id: { GuildID: '$GuildID', ChannelID: '$ChannelID', sID: '$sID' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();
  let deduped = 0;
  for (const group of duplicates) {
    const removeIds = group.ids.slice(1);
    if (!removeIds.length) continue;
    const res = await col.deleteMany({ _id: { $in: removeIds } });
    deduped += Number(res.deletedCount || 0);
  }

  await col.createIndex({ GuildID: 1, ChannelID: 1, sID: 1 }, { unique: true, background: true });
  return { defaults, deduped };
}

async function migrateReactionRole() {
  const col = mongoose.connection.collection('rrs');
  const defaults = {};
  defaults.guild = Number((await col.updateMany(
    { $or: [{ Guild: { $exists: false } }, { Guild: null }, { Guild: '' }] },
    { $set: { Guild: fallbackGuildId } }
  )).modifiedCount || 0);
  defaults.message = Number((await col.updateMany(
    { $or: [{ Message: { $exists: false } }, { Message: null }, { Message: '' }] },
    { $set: { Message: '__legacy__' } }
  )).modifiedCount || 0);
  defaults.emoji = Number((await col.updateMany(
    { $or: [{ Emoji: { $exists: false } }, { Emoji: null }, { Emoji: '' }] },
    { $set: { Emoji: 'legacy_emoji' } }
  )).modifiedCount || 0);
  defaults.role = Number((await col.updateMany(
    { $or: [{ Role: { $exists: false } }, { Role: null }, { Role: '' }] },
    { $set: { Role: 'legacy_role' } }
  )).modifiedCount || 0);

  const duplicates = await col.aggregate([
    { $sort: { _id: -1 } },
    { $group: { _id: { Guild: '$Guild', Message: '$Message', Emoji: '$Emoji' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();
  let deduped = 0;
  for (const group of duplicates) {
    const removeIds = group.ids.slice(1);
    if (!removeIds.length) continue;
    const res = await col.deleteMany({ _id: { $in: removeIds } });
    deduped += Number(res.deletedCount || 0);
  }

  await col.createIndex({ Guild: 1, Message: 1, Emoji: 1 }, { unique: true, background: true });
  return { defaults, deduped };
}

async function migratePoll() {
  const col = mongoose.connection.collection('pollschemas');
  const defaults = {};
  defaults.guildId = Number((await col.updateMany(
    { $or: [{ guildId: { $exists: false } }, { guildId: null }, { guildId: '' }] },
    { $set: { guildId: fallbackGuildId } }
  )).modifiedCount || 0);
  defaults.domanda = Number((await col.updateMany(
    { domanda: { $exists: false } },
    { $set: { domanda: null } }
  )).modifiedCount || 0);
  await col.createIndex({ guildId: 1, domanda: 1 }, { background: true });
  await col.createIndex({ guildId: 1, pollcount: 1 }, { background: true });
  return { defaults };
}

async function main() {
  if (!mongoUrl) {
    throw new Error('Mongo URL mancante (MONGO_URL/MONGODB_URI/config.mongoURL).');
  }

  log('[MIGRATION] Connecting to MongoDB...');
  await mongoose.connect(mongoUrl);
  log('[MIGRATION] Connected.');

  const results = {};

  if (await ensureCollection('afks')) results.afk = await migrateAfk();
  if (await ensureCollection('tickets')) results.ticket = await migrateTicket();
  if (await ensureCollection('suggestions')) results.suggestion = await migrateSuggestion();
  if (await ensureCollection('rrs')) results.reactionRole = await migrateReactionRole();
  if (await ensureCollection('pollschemas')) results.poll = await migratePoll();

  log('[MIGRATION] Done.');
  log('[MIGRATION] Summary:', JSON.stringify(results, null, 2));
}

main()
  .catch((err) => {
    console.error('[MIGRATION] Failed:', err?.stack || err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
