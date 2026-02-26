const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const activityUserSchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    messages: {
      total: { type: Number, default: 0 },
      daily: { type: Number, default: 0 },
      weekly: { type: Number, default: 0 },
      dailyKey: { type: String, default: "" },
      weeklyKey: { type: String, default: "" },
    },
    voice: {
      totalSeconds: { type: Number, default: 0 },
      dailySeconds: { type: Number, default: 0 },
      weeklySeconds: { type: Number, default: 0 },
      dailyKey: { type: String, default: "" },
      weeklyKey: { type: String, default: "" },
      sessionStartedAt: { type: Date, default: null },
      sessionChannelId: { type: String, default: null },
      expAwardedSeconds: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);
activityUserSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const expUserSchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    totalExp: { type: Number, default: 0 },
    weeklyExp: { type: Number, default: 0 },
    level: { type: Number, default: 0 },
    weeklyKey: { type: String, default: "" },
    perkNearReminderLevels: { type: [Number], default: [] },
  },
  { timestamps: true },
);
expUserSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const activityDailySchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    dateKey: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    textCount: { type: Number, default: 0 },
    voiceSeconds: { type: Number, default: 0 },
    textChannels: { type: Map, of: Number, default: {} },
    voiceChannels: { type: Map, of: Number, default: {} },
  },
  { timestamps: true },
);
activityDailySchema.index(
  { guildId: 1, dateKey: 1, userId: 1 },
  { unique: true },
);

const activityHourlySchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    hourKey: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    textCount: { type: Number, default: 0 },
    voiceSeconds: { type: Number, default: 0 },
    textChannels: { type: Map, of: Number, default: {} },
    voiceChannels: { type: Map, of: Number, default: {} },
  },
  { timestamps: true },
);
activityHourlySchema.index(
  { guildId: 1, hourKey: 1, userId: 1 },
  { unique: true },
);

const levelHistorySchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    actorId: { type: String, default: null, index: true },
    action: { type: String, required: true, index: true },
    beforeExp: { type: Number, default: 0 },
    afterExp: { type: Number, default: 0 },
    beforeLevel: { type: Number, default: 0 },
    afterLevel: { type: Number, default: 0 },
    deltaExp: { type: Number, default: 0 },
    note: { type: String, default: null },
  },
  { timestamps: true },
);
levelHistorySchema.index({ guildId: 1, userId: 1, createdAt: -1 });

const globalSettingsSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    expMultiplier: { type: Number, default: 2 },
    expEventMultiplier: { type: Number, default: 1 },
    expEventMultiplierExpiresAt: { type: Date, default: null },
    expLockedChannelIds: { type: [String], default: [] },
    expIgnoredRoleIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

const voteRoleSchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
voteRoleSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const verificationTenureSchema = new Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  verifiedAt: { type: Date, required: true },
  stage: { type: Number, default: 1 },
});
verificationTenureSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const skullboardPostSchema = new Schema({
  guildId: { type: String, required: true },
  messageId: { type: String, required: true, index: true },
  postMessageId: { type: String, default: null },
});
skullboardPostSchema.index({ guildId: 1, messageId: 1 }, { unique: true });

const reviewRewardSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    rewardedBy: { type: String, default: null },
    rewardedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
reviewRewardSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const personalityPanelSchema = new Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  personalityMessageId: { type: String, default: null },
  mentionsMessageId: { type: String, default: null },
  colorsMessageId: { type: String, default: null },
  plusColorsMessageId: { type: String, default: null },
  infoMessageId1: { type: String, default: null },
  infoMessageId2: { type: String, default: null },
  verifyInfoMessageId: { type: String, default: null },
  verifyPanelMessageId: { type: String, default: null },
  ticketInfoMessageId: { type: String, default: null },
  ticketPanelMessageId: { type: String, default: null },
  sponsorTicketPanelMessageId: { type: String, default: null },
});
personalityPanelSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

const inviteTrackSchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    inviterId: { type: String, required: true, index: true },
    active: { type: Boolean, default: true, index: true },
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date, default: null },
  },
  { timestamps: true },
);
inviteTrackSchema.index({ guildId: 1, userId: 1 }, { unique: true });
inviteTrackSchema.index({ guildId: 1, inviterId: 1 });

const inviteReminderStateSchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    inviteNearTargets: { type: [Number], default: [] },
  },
  { timestamps: true },
);
inviteReminderStateSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const customRoleSchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    roleId: { type: String, required: true },
    customVocEmoji: { type: String, default: null },
    customVocChannelId: { type: String, default: null, index: true },
    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);
customRoleSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const chatReminderScheduleSchema = new Schema(
  {
    guildId: { type: String, required: true },
    fireAt: { type: Date, required: true },
    kind: { type: String, default: "first" },
  },
  { timestamps: true },
);
chatReminderScheduleSchema.index({ guildId: 1, fireAt: 1 });

const chatReminderRotationSchema = new Schema(
  {
    guildId: { type: String, required: true },
    dateKey: { type: String, required: true },
    queue: { type: [Number], default: [] },
    lastSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);
chatReminderRotationSchema.index({ guildId: 1 }, { unique: true });

const avatarPrivacySchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    blocked: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
  },
  { timestamps: true },
);
avatarPrivacySchema.index({ guildId: 1, userId: 1 }, { unique: true });

const bannerPrivacySchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    blocked: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
  },
  { timestamps: true },
);
bannerPrivacySchema.index({ guildId: 1, userId: 1 }, { unique: true });

const quotePrivacySchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    blocked: { type: Boolean, default: false },
  },
  { timestamps: true },
);
quotePrivacySchema.index({ guildId: 1, userId: 1 }, { unique: true });

const channelSnapshotSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, index: true },
    name: { type: String, default: "" },
    type: { type: Number, default: null },
    parentId: { type: String, default: null },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);
channelSnapshotSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

const ActivityUser =
  models.ActivityUser || model("ActivityUser", activityUserSchema);
const ExpUser = models.ExpUser || model("ExpUser", expUserSchema);
const ActivityDaily =
  models.ActivityDaily || model("ActivityDaily", activityDailySchema);
const ActivityHourly =
  models.ActivityHourly || model("ActivityHourly", activityHourlySchema);
const LevelHistory =
  models.LevelHistory || model("LevelHistory", levelHistorySchema);
const GlobalSettings =
  models.GlobalSettings || model("GlobalSettings", globalSettingsSchema);
const VoteRole = models.VoteRole || model("VoteRole", voteRoleSchema);
const VerificationTenure =
  models.VerificationTenure ||
  model("VerificationTenure", verificationTenureSchema);
const SkullboardPost =
  models.SkullboardPost || model("SkullboardPost", skullboardPostSchema);
const ReviewReward =
  models.ReviewReward || model("ReviewReward", reviewRewardSchema);
const PersonalityPanel =
  models.PersonalityPanel || model("PersonalityPanel", personalityPanelSchema);
const InviteTrack =
  models.InviteTrack || model("InviteTrack", inviteTrackSchema);
const InviteReminderState =
  models.InviteReminderState ||
  model("InviteReminderState", inviteReminderStateSchema);
const CustomRole = models.CustomRole || model("CustomRole", customRoleSchema);
const ChatReminderSchedule =
  models.ChatReminderSchedule ||
  model("ChatReminderSchedule", chatReminderScheduleSchema);
const ChatReminderRotation =
  models.ChatReminderRotation ||
  model("ChatReminderRotation", chatReminderRotationSchema);
const AvatarPrivacy =
  models.AvatarPrivacy || model("AvatarPrivacy", avatarPrivacySchema);
const BannerPrivacy =
  models.BannerPrivacy || model("BannerPrivacy", bannerPrivacySchema);
const QuotePrivacy =
  models.QuotePrivacy || model("QuotePrivacy", quotePrivacySchema);
const ChannelSnapshot =
  models.ChannelSnapshot || model("ChannelSnapshot", channelSnapshotSchema);

module.exports = {
  ActivityUser,
  ExpUser,
  ActivityDaily,
  ActivityHourly,
  LevelHistory,
  GlobalSettings,
  VoteRole,
  VerificationTenure,
  SkullboardPost,
  ReviewReward,
  PersonalityPanel,
  InviteTrack,
  InviteReminderState,
  CustomRole,
  ChatReminderSchedule,
  ChatReminderRotation,
  AvatarPrivacy,
  BannerPrivacy,
  QuotePrivacy,
  ChannelSnapshot,
};