const {
  VerificationTenure,
} = require("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids");

const SPONSOR_VERIFY_NICKNAME = ".gg/viniliecaffe";

async function upsertVerifiedMember(guildId, userId, verifiedAt = new Date()) {
  return VerificationTenure.findOneAndUpdate(
    { guildId, userId },
    { $set: { verifiedAt }, $setOnInsert: { stage: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function applyTenureForMember(member, record) {
  if (!member || !record) return;
  const guildId = member.guild?.id;
  const roleId = IDs.verificatoRoleIds?.[guildId];
  if (roleId) {
    await member.roles.add(roleId).catch(() => {});
  }
  try {
    await member.setNickname(SPONSOR_VERIFY_NICKNAME).catch(() => {});
  } catch (_) {}
}

module.exports = {
  upsertVerifiedMember,
  applyTenureForMember,
};
