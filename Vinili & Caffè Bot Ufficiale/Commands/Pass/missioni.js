const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { requireActiveSeason } = require('../../Services/Pass/seasonService');
const { getOrCreatePassUser } = require('../../Services/Pass/passService');
const { Mission } = require('../../Schemas/Pass/mission');
const { resetMissionsIfNeeded, refreshMissionWindows } = require('../../Services/Pass/missionService');
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('missioni')
    .setDescription('Mostra missioni giornaliere e settimanali'),
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const season = await requireActiveSeason(guildId);
    const u = await getOrCreatePassUser({
      guildId,
      seasonId: season.seasonId,
      userId: interaction.user.id
    });
    await refreshMissionWindows({ guildId, seasonId: season.seasonId });
    await resetMissionsIfNeeded(u);
    const now = new Date();
    const missions = (await Mission.find({ guildId, seasonId: season.seasonId }))
      .filter(m => m.activeFrom <= now && m.activeTo >= now);
    const formatLine = (m) => {
      const { id, legacyId } = getDocIds(m);
      const progress = getProgressValue(u.missionsProgress, id, legacyId);
      const done = isCompleted(u.completedMissions, id, legacyId);
      const desc = m.description ? `\n${m.description}` : '';
      let prog = '';
      if (typeof m.objective?.target === 'number') {
        prog = `\n${progress}/${m.objective.target}`;
      } else if (done) {
        prog = `\n\u2705 Completata`;
      } else {
        prog = `\n\u23F3 In attesa`;
      }
      const status = done ? '\u2705' : '\u{1F9E9}';
      return `${status} **${m.title}**${desc}${prog}`;
    };
    const daily = missions.filter(m => m.kind === 'daily').map(formatLine);
    const weekly = missions.filter(m => m.kind === 'weekly').map(formatLine);
    const embed = new EmbedBuilder()
      .setTitle('\u{1F9E9} Missioni')
      .addFields(
        {
          name: 'Giornaliere',
          value: daily.join('\n\n') || '-'
        },
        {
          name: 'Settimanali',
          value: weekly.join('\n\n') || '-'
        }
      );
    await interaction.reply({ embeds: [embed] });
  }
};
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
