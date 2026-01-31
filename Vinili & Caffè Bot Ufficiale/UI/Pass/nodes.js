const { EmbedBuilder } = require('discord.js');
const { NodeModel } = require('../../Schemas/Pass/node');
const { progressBar } = require('../../Utils/Pass/progressBar');

async function buildNodesEmbed(season, u, guildId) {
  const nodes = await NodeModel.find({
    guildId,
    seasonId: season.seasonId
  });
  const lines = nodes.map(n => {
    const { id, legacyId } = getDocIds(n);
    const done = isCompleted(u.completedNodes, id, legacyId);
    const progress = getProgressValue(u.progress, id, legacyId);
    const title = n.title || n.id;
    const desc = n.description ? `\n${n.description}` : '';
    let bar = '';
    if (typeof n.objective?.target === 'number') {
      bar = `\n${progressBar(progress, n.objective.target)}`;
    } else if (done) {
      bar = `\n\u2705 Completato`;
    } else {
      bar = `\n\u23F3 In attesa`;
    }
    const status = done ? '\u2705' : '\u{1F9E9}';
    return `${status} **${title}**${desc}${bar}`;
  });
  return new EmbedBuilder()
    .setTitle('\u{1F9E9} Nodi')
    .setDescription(lines.join('\n\n') || '-');
}

function getDocIds(doc) {
  if (!doc) return { id: undefined, legacyId: undefined };
  let id;
  if (typeof doc.get === 'function') {
    id = doc.get('id');
  }
  if (!id) id = doc.id;
  let legacyId;
  if (doc._id && typeof doc._id.toString === 'function') {
    legacyId = doc._id.toString();
  }
  if (legacyId === id) legacyId = undefined;
  return { id, legacyId };
}
function getProgressValue(progressMap, id, legacyId) {
  if (!progressMap || !id) return 0;
  const val = progressMap.get(id);
  if (typeof val === 'number') return val;
  if (legacyId) {
    const legacyVal = progressMap.get(legacyId);
    if (typeof legacyVal === 'number') return legacyVal;
  }
  return 0;
}
function isCompleted(list, id, legacyId) {
  if (!Array.isArray(list) || !id) return false;
  if (list.includes(id)) return true;
  if (legacyId && list.includes(legacyId)) return true;
  return false;
}

module.exports = { buildNodesEmbed };