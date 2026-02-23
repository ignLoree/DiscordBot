const fs = require("fs");
const path = require("path");
const IDs = require("../../Utils/Config/ids");

const SECURITY_PROFILES_PATH = path.resolve(
  __dirname,
  "../../Utils/Config/securityProfiles.json",
);

const DEFAULT_STATE = {
  version: 1,
  guilds: {},
};
const DEFAULT_MAIN_ROLE_IDS = [
  IDs?.roles?.Member,
  IDs?.roles?.separatore6,
  IDs?.roles?.separatore8,
  IDs?.roles?.separatore5,
  IDs?.roles?.separatore7,
]
  .map((id) => normalizeEntityId(id))
  .filter(Boolean);

const ADMINS_PROFILE = Object.freeze({
  key: "admins",
  roleId: String(IDs?.roles?.HighStaff || ""),
  owner: false,
  fullImmunity: true,
  automodImmunity: true,
  dashboardAccess: false,
  reportImmunity: true,
  lockServerChannels: true,
  lockStaffRoles: false,
  lockServerJoins: true,
  makeLockdownUpdates: true,
  kickBanWhitelist: false,
  channelCreationsWhitelist: false,
  channelDeletionsWhitelist: false,
  roleCreationsWhitelist: false,
  roleDeletionsWhitelist: false,
  webhookCreationsWhitelist: false,
  profanityWhitelist: true,
  linkWhitelist: false,
  verifyCommand: true,
});

const MODERATORS_PROFILE = Object.freeze({
  key: "moderators",
  roleId: String(IDs?.roles?.Staff || ""),
  owner: false,
  fullImmunity: false,
  automodImmunity: true,
  dashboardAccess: false,
  reportImmunity: true,
  lockServerChannels: false,
  lockStaffRoles: false,
  lockServerJoins: false,
  makeLockdownUpdates: false,
  kickBanWhitelist: false,
  channelCreationsWhitelist: false,
  channelDeletionsWhitelist: false,
  roleCreationsWhitelist: false,
  roleDeletionsWhitelist: false,
  webhookCreationsWhitelist: false,
  profanityWhitelist: true,
  linkWhitelist: false,
  verifyCommand: false,
});

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonSafe(filePath, payload) {
  try {
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

function normalizeUserId(input) {
  const id = String(input || "").trim();
  if (!/^\d{16,20}$/.test(id)) return "";
  return id;
}

function normalizeGuildId(input) {
  const id = String(input || "").trim();
  if (!/^\d{16,20}$/.test(id)) return "";
  return id;
}

function normalizeEntityId(input) {
  const id = String(input || "").trim();
  if (!/^\d{16,20}$/.test(id)) return "";
  return id;
}

function normalizeUserArray(raw, max = 100) {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((x) => normalizeUserId(x))
        .filter(Boolean),
    ),
  ).slice(0, max);
}

function normalizeEntityArray(raw, max = 100) {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((x) => normalizeEntityId(x))
        .filter(Boolean),
    ),
  ).slice(0, max);
}

function normalizeState(raw) {
  const src = raw && typeof raw === "object" ? raw : DEFAULT_STATE;
  const guilds = {};
  if (src.guilds && typeof src.guilds === "object") {
    for (const [guildId, row] of Object.entries(src.guilds)) {
      const gid = normalizeGuildId(guildId);
      if (!gid) continue;
      guilds[gid] = {
        trustedAdmins: normalizeUserArray(row?.trustedAdmins, 100),
        extraOwners: normalizeUserArray(row?.extraOwners, 100),
        quarantineRoleId:
          normalizeEntityId(row?.quarantineRoleId) ||
          normalizeEntityId(IDs?.roles?.Muted),
        mainRoleIds: normalizeEntityArray(row?.mainRoleIds, 30),
        loggingChannelId:
          normalizeEntityId(row?.loggingChannelId) ||
          normalizeEntityId(IDs?.channels?.modLogs),
        modLoggingChannelId:
          normalizeEntityId(row?.modLoggingChannelId) ||
          normalizeEntityId(IDs?.channels?.modLogs),
        partneringChannelIds: normalizeEntityArray(
          row?.partneringChannelIds,
          30,
        ),
        mainChannelId:
          normalizeEntityId(row?.mainChannelId) ||
          normalizeEntityId(IDs?.channels?.chat),
        verificationChannelId:
          normalizeEntityId(row?.verificationChannelId) ||
          normalizeEntityId(IDs?.channels?.verify),
      };
      if (!guilds[gid].mainRoleIds.length) {
        guilds[gid].mainRoleIds = [...DEFAULT_MAIN_ROLE_IDS];
      }
      if (!guilds[gid].partneringChannelIds.length) {
        const fallbackPartner = normalizeEntityId(IDs?.channels?.partnerships);
        guilds[gid].partneringChannelIds = fallbackPartner
          ? [fallbackPartner]
          : [];
      }
    }
  }
  return { version: 1, guilds };
}

let state = normalizeState(readJsonSafe(SECURITY_PROFILES_PATH, DEFAULT_STATE));
writeJsonSafe(SECURITY_PROFILES_PATH, state);

function saveState() {
  return writeJsonSafe(SECURITY_PROFILES_PATH, state);
}

function getGuildBucket(guildId, create = false) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return null;
  if (!state.guilds[gid] && create) {
    const fallbackPartner = normalizeEntityId(IDs?.channels?.partnerships);
    state.guilds[gid] = {
      trustedAdmins: [],
      extraOwners: [],
      quarantineRoleId: normalizeEntityId(IDs?.roles?.Muted),
      mainRoleIds: [...DEFAULT_MAIN_ROLE_IDS],
      loggingChannelId: normalizeEntityId(IDs?.channels?.modLogs),
      modLoggingChannelId: normalizeEntityId(IDs?.channels?.modLogs),
      partneringChannelIds: fallbackPartner ? [fallbackPartner] : [],
      mainChannelId: normalizeEntityId(IDs?.channels?.chat),
      verificationChannelId: normalizeEntityId(IDs?.channels?.verify),
    };
  }
  return state.guilds[gid] || null;
}

function getSecurityProfilesSnapshot(guildId) {
  const bucket = getGuildBucket(guildId, false) || {
    trustedAdmins: [],
    extraOwners: [],
    quarantineRoleId: normalizeEntityId(IDs?.roles?.Muted),
    mainRoleIds: [...DEFAULT_MAIN_ROLE_IDS],
    loggingChannelId: normalizeEntityId(IDs?.channels?.modLogs),
    modLoggingChannelId: normalizeEntityId(IDs?.channels?.modLogs),
    partneringChannelIds: normalizeEntityId(IDs?.channels?.partnerships)
      ? [normalizeEntityId(IDs?.channels?.partnerships)]
      : [],
    mainChannelId: normalizeEntityId(IDs?.channels?.chat),
    verificationChannelId: normalizeEntityId(IDs?.channels?.verify),
  };
  return JSON.parse(JSON.stringify(bucket));
}

function getSecurityStaticsSnapshot(guildId) {
  const snap = getSecurityProfilesSnapshot(guildId);
  return {
    quarantineRoleId: String(snap?.quarantineRoleId || ""),
    mainRoleIds: normalizeEntityArray(snap?.mainRoleIds, 30),
    loggingChannelId: String(snap?.loggingChannelId || ""),
    modLoggingChannelId: String(snap?.modLoggingChannelId || ""),
    partneringChannelIds: normalizeEntityArray(snap?.partneringChannelIds, 30),
    mainChannelId: String(snap?.mainChannelId || ""),
    verificationChannelId: String(snap?.verificationChannelId || ""),
  };
}

function addTrustedAdmin(guildId, userId) {
  const gid = normalizeGuildId(guildId);
  const uid = normalizeUserId(userId);
  if (!gid || !uid) return { ok: false, reason: "invalid_ids" };
  const bucket = getGuildBucket(gid, true);
  if (!bucket.trustedAdmins.includes(uid)) bucket.trustedAdmins.push(uid);
  bucket.trustedAdmins = normalizeUserArray(bucket.trustedAdmins, 100);
  return saveState()
    ? { ok: true, trustedAdmins: [...bucket.trustedAdmins] }
    : { ok: false, reason: "save_failed" };
}

function removeTrustedAdmin(guildId, userId) {
  const gid = normalizeGuildId(guildId);
  const uid = normalizeUserId(userId);
  if (!gid || !uid) return { ok: false, reason: "invalid_ids" };
  const bucket = getGuildBucket(gid, false);
  if (!bucket) return { ok: true, removed: false };
  const before = bucket.trustedAdmins.length;
  bucket.trustedAdmins = bucket.trustedAdmins.filter((x) => x !== uid);
  const removed = bucket.trustedAdmins.length !== before;
  return saveState()
    ? { ok: true, removed, trustedAdmins: [...bucket.trustedAdmins] }
    : { ok: false, reason: "save_failed" };
}

function addExtraOwner(guildId, userId) {
  const gid = normalizeGuildId(guildId);
  const uid = normalizeUserId(userId);
  if (!gid || !uid) return { ok: false, reason: "invalid_ids" };
  const bucket = getGuildBucket(gid, true);
  if (!bucket.extraOwners.includes(uid)) bucket.extraOwners.push(uid);
  bucket.extraOwners = normalizeUserArray(bucket.extraOwners, 100);
  return saveState()
    ? { ok: true, extraOwners: [...bucket.extraOwners] }
    : { ok: false, reason: "save_failed" };
}

function removeExtraOwner(guildId, userId) {
  const gid = normalizeGuildId(guildId);
  const uid = normalizeUserId(userId);
  if (!gid || !uid) return { ok: false, reason: "invalid_ids" };
  const bucket = getGuildBucket(gid, false);
  if (!bucket) return { ok: true, removed: false };
  const before = bucket.extraOwners.length;
  bucket.extraOwners = bucket.extraOwners.filter((x) => x !== uid);
  const removed = bucket.extraOwners.length !== before;
  return saveState()
    ? { ok: true, removed, extraOwners: [...bucket.extraOwners] }
    : { ok: false, reason: "save_failed" };
}

function setQuarantineRole(guildId, roleId) {
  const gid = normalizeGuildId(guildId);
  const rid = normalizeEntityId(roleId);
  if (!gid || !rid) return { ok: false, reason: "invalid_ids" };
  const bucket = getGuildBucket(gid, true);
  bucket.quarantineRoleId = rid;
  return saveState()
    ? { ok: true, quarantineRoleId: rid }
    : { ok: false, reason: "save_failed" };
}

function addMainRole(guildId, roleId) {
  const gid = normalizeGuildId(guildId);
  const rid = normalizeEntityId(roleId);
  if (!gid || !rid) return { ok: false, reason: "invalid_ids" };
  const bucket = getGuildBucket(gid, true);
  if (!Array.isArray(bucket.mainRoleIds)) bucket.mainRoleIds = [];
  if (!bucket.mainRoleIds.includes(rid)) bucket.mainRoleIds.push(rid);
  bucket.mainRoleIds = normalizeEntityArray(bucket.mainRoleIds, 30);
  return saveState()
    ? { ok: true, mainRoleIds: [...bucket.mainRoleIds] }
    : { ok: false, reason: "save_failed" };
}

function removeMainRole(guildId, roleId) {
  const gid = normalizeGuildId(guildId);
  const rid = normalizeEntityId(roleId);
  if (!gid || !rid) return { ok: false, reason: "invalid_ids" };
  const bucket = getGuildBucket(gid, false);
  if (!bucket) return { ok: true, removed: false, mainRoleIds: [] };
  const before = Array.isArray(bucket.mainRoleIds) ? bucket.mainRoleIds.length : 0;
  bucket.mainRoleIds = normalizeEntityArray(bucket.mainRoleIds, 30).filter(
    (x) => x !== rid,
  );
  const removed = bucket.mainRoleIds.length !== before;
  return saveState()
    ? { ok: true, removed, mainRoleIds: [...bucket.mainRoleIds] }
    : { ok: false, reason: "save_failed" };
}

function setLoggingChannel(guildId, channelId) {
  const gid = normalizeGuildId(guildId);
  const cid = normalizeEntityId(channelId);
  if (!gid || !cid) return { ok: false, reason: "invalid_ids" };
  const bucket = getGuildBucket(gid, true);
  bucket.loggingChannelId = cid;
  return saveState()
    ? { ok: true, loggingChannelId: cid }
    : { ok: false, reason: "save_failed" };
}

function setModLoggingChannel(guildId, channelId) {
  const gid = normalizeGuildId(guildId);
  const cid = normalizeEntityId(channelId);
  if (!gid || !cid) return { ok: false, reason: "invalid_ids" };
  const bucket = getGuildBucket(gid, true);
  bucket.modLoggingChannelId = cid;
  return saveState()
    ? { ok: true, modLoggingChannelId: cid }
    : { ok: false, reason: "save_failed" };
}

function setMainChannel(guildId, channelId) {
  const gid = normalizeGuildId(guildId);
  const cid = normalizeEntityId(channelId);
  if (!gid || !cid) return { ok: false, reason: "invalid_ids" };
  const bucket = getGuildBucket(gid, true);
  bucket.mainChannelId = cid;
  return saveState()
    ? { ok: true, mainChannelId: cid }
    : { ok: false, reason: "save_failed" };
}

function setVerificationChannel(guildId, channelId) {
  const gid = normalizeGuildId(guildId);
  const cid = normalizeEntityId(channelId);
  if (!gid || !cid) return { ok: false, reason: "invalid_ids" };
  const bucket = getGuildBucket(gid, true);
  bucket.verificationChannelId = cid;
  return saveState()
    ? { ok: true, verificationChannelId: cid }
    : { ok: false, reason: "save_failed" };
}

function addPartneringChannel(guildId, channelId) {
  const gid = normalizeGuildId(guildId);
  const cid = normalizeEntityId(channelId);
  if (!gid || !cid) return { ok: false, reason: "invalid_ids" };
  const bucket = getGuildBucket(gid, true);
  if (!Array.isArray(bucket.partneringChannelIds)) bucket.partneringChannelIds = [];
  if (!bucket.partneringChannelIds.includes(cid)) bucket.partneringChannelIds.push(cid);
  bucket.partneringChannelIds = normalizeEntityArray(bucket.partneringChannelIds, 30);
  return saveState()
    ? { ok: true, partneringChannelIds: [...bucket.partneringChannelIds] }
    : { ok: false, reason: "save_failed" };
}

function removePartneringChannel(guildId, channelId) {
  const gid = normalizeGuildId(guildId);
  const cid = normalizeEntityId(channelId);
  if (!gid || !cid) return { ok: false, reason: "invalid_ids" };
  const bucket = getGuildBucket(gid, false);
  if (!bucket) return { ok: true, removed: false, partneringChannelIds: [] };
  const before = Array.isArray(bucket.partneringChannelIds)
    ? bucket.partneringChannelIds.length
    : 0;
  bucket.partneringChannelIds = normalizeEntityArray(
    bucket.partneringChannelIds,
    30,
  ).filter((x) => x !== cid);
  const removed = bucket.partneringChannelIds.length !== before;
  return saveState()
    ? { ok: true, removed, partneringChannelIds: [...bucket.partneringChannelIds] }
    : { ok: false, reason: "save_failed" };
}

function isTrustedAdmin(guildId, userId) {
  const gid = normalizeGuildId(guildId);
  const uid = normalizeUserId(userId);
  if (!gid || !uid) return false;
  const bucket = getGuildBucket(gid, false);
  return Boolean(bucket?.trustedAdmins?.includes(uid));
}

function isExtraOwner(guildId, userId) {
  const gid = normalizeGuildId(guildId);
  const uid = normalizeUserId(userId);
  if (!gid || !uid) return false;
  const bucket = getGuildBucket(gid, false);
  return Boolean(bucket?.extraOwners?.includes(uid));
}

function isSecurityProfileImmune(guildId, userId) {
  return isTrustedAdmin(guildId, userId) || isExtraOwner(guildId, userId);
}

function isAdminsProfileMember(member) {
  const roleId = String(ADMINS_PROFILE.roleId || "");
  if (!member || !roleId) return false;
  return Boolean(member?.roles?.cache?.has?.(roleId));
}

function isModeratorsProfileMember(member) {
  const roleId = String(MODERATORS_PROFILE.roleId || "");
  if (!member || !roleId) return false;
  return Boolean(member?.roles?.cache?.has?.(roleId));
}

function hasAdminsProfileCapability(member, capability) {
  if (!isAdminsProfileMember(member)) return false;
  return Boolean(ADMINS_PROFILE?.[String(capability || "").trim()]);
}

function hasModeratorsProfileCapability(member, capability) {
  if (!isModeratorsProfileMember(member)) return false;
  return Boolean(MODERATORS_PROFILE?.[String(capability || "").trim()]);
}

function getAdminsProfileSnapshot() {
  return JSON.parse(JSON.stringify(ADMINS_PROFILE));
}

function getModeratorsProfileSnapshot() {
  return JSON.parse(JSON.stringify(MODERATORS_PROFILE));
}

module.exports = {
  getSecurityProfilesSnapshot,
  getAdminsProfileSnapshot,
  getModeratorsProfileSnapshot,
  addTrustedAdmin,
  removeTrustedAdmin,
  addExtraOwner,
  removeExtraOwner,
  getSecurityStaticsSnapshot,
  setQuarantineRole,
  addMainRole,
  removeMainRole,
  setLoggingChannel,
  setModLoggingChannel,
  setMainChannel,
  setVerificationChannel,
  addPartneringChannel,
  removePartneringChannel,
  isTrustedAdmin,
  isExtraOwner,
  isSecurityProfileImmune,
  isAdminsProfileMember,
  isModeratorsProfileMember,
  hasAdminsProfileCapability,
  hasModeratorsProfileCapability,
};
