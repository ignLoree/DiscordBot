const { Schema, model, models } = require('mongoose');

const inviteTrackSchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    inviterId: { type: String, required: true, index: true },
    active: { type: Boolean, default: true, index: true },
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date, default: null }
  },
  { timestamps: true }
);

inviteTrackSchema.index({ guildId: 1, userId: 1 }, { unique: true });
inviteTrackSchema.index({ guildId: 1, inviterId: 1 });

module.exports = models.InviteTrack || model('InviteTrack', inviteTrackSchema);

