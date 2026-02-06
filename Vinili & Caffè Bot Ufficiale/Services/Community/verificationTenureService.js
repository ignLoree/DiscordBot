const VerificationTenure = require('../../Schemas/Community/verificationTenureSchema');

const ROLE_STAGE_1 = '1469041461294268489';
const ROLE_STAGE_2 = '1469073503025103113';
const ROLE_STAGE_3 = '1469041493401534644';

function addMonths(date, months) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // handle month overflow
  if (d.getDate() < day) {
    d.setDate(0);
  }
  return d;
}

async function upsertVerifiedMember(guildId, userId, verifiedAt = new Date()) {
  return VerificationTenure.findOneAndUpdate(
    { guildId, userId },
    { $set: { verifiedAt }, $setOnInsert: { stage: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function applyTenureForMember(member, record) {
  if (!member || !record) return;
  const now = new Date();
  const stage1At = addMonths(record.verifiedAt, 1);
  const stage2At = addMonths(record.verifiedAt, 12);

  const has1 = member.roles.cache.has(ROLE_STAGE_1);
  const has2 = member.roles.cache.has(ROLE_STAGE_2);
  const has3 = member.roles.cache.has(ROLE_STAGE_3);

  if (now >= stage2At) {
    if (!has3 || has1 || has2) {
      await member.roles.remove([ROLE_STAGE_1, ROLE_STAGE_2]).catch(() => {});
      await member.roles.add(ROLE_STAGE_3).catch(() => {});
    }
    if (record.stage !== 3) {
      await VerificationTenure.updateOne(
        { guildId: record.guildId, userId: record.userId },
        { $set: { stage: 3 } }
      );
    }
    return;
  }

  if (now >= stage1At) {
    if (!has2 || has1) {
      await member.roles.remove([ROLE_STAGE_1]).catch(() => {});
      await member.roles.add(ROLE_STAGE_2).catch(() => {});
    }
    if (record.stage !== 2) {
      await VerificationTenure.updateOne(
        { guildId: record.guildId, userId: record.userId },
        { $set: { stage: 2 } }
      );
    }
    return;
  }

  if (!has1) {
    await member.roles.add(ROLE_STAGE_1).catch(() => {});
  }
}

async function runTenureSweep(client) {
  const docs = await VerificationTenure.find({}).lean().catch(() => []);
  if (!docs.length) return;
  for (const doc of docs) {
    const guild = client.guilds.cache.get(doc.guildId)
      || await client.guilds.fetch(doc.guildId).catch(() => null);
    if (!guild) continue;
    const member = guild.members.cache.get(doc.userId)
      || await guild.members.fetch(doc.userId).catch(() => null);
    if (!member) continue;
    await applyTenureForMember(member, doc);
  }
}

function startVerificationTenureLoop(client) {
  setInterval(() => {
    runTenureSweep(client).catch((error) => {
      global.logger.error('[VERIFY TENURE] Sweep failed:', error);
    });
  }, 60 * 60 * 1000);
}

module.exports = {
  upsertVerifiedMember,
  applyTenureForMember,
  startVerificationTenureLoop
};
