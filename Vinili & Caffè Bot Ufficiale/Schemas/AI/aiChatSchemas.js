const mongoose = require('mongoose');
const { Schema, model, models } = mongoose;

const aiExchangeSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    username: { type: String, default: '' },
    userMessage: { type: String, required: true },
    botReply: { type: String, required: true },
    tokens: { type: [String], default: [] }
  },
  { timestamps: true }
);
aiExchangeSchema.index({ guildId: 1, channelId: 1, createdAt: -1 });

const aiKnowledgeSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    key: { type: String, required: true },
    value: { type: String, required: true },
    sourceUserId: { type: String, default: '' },
    updates: { type: Number, default: 1 }
  },
  { timestamps: true }
);
aiKnowledgeSchema.index({ guildId: 1, key: 1 }, { unique: true });

const aiActionRequestSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    description: { type: String, required: true },
    status: { type: String, default: 'open' }
  },
  { timestamps: true }
);
aiActionRequestSchema.index({ guildId: 1, status: 1, createdAt: -1 });

const AiExchange = models.AiExchange || model('AiExchange', aiExchangeSchema);
const AiKnowledge = models.AiKnowledge || model('AiKnowledge', aiKnowledgeSchema);
const AiActionRequest = models.AiActionRequest || model('AiActionRequest', aiActionRequestSchema);

module.exports = {
  AiExchange,
  AiKnowledge,
  AiActionRequest
};

