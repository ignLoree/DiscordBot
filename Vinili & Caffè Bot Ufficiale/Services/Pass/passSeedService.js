const fs = require('fs');
const path = require('path');
const { NodeModel } = require('../../Schemas/Pass/node');
const { Mission } = require('../../Schemas/Pass/mission');

function loadSeedData() {
  const nodesPath = path.join(__dirname, '..', '..', 'Data', 'nodes.json');
  const missionsPath = path.join(__dirname, '..', '..', 'Data', 'missions.json');
  const nodes = JSON.parse(fs.readFileSync(nodesPath, 'utf8'));
  const missions = JSON.parse(fs.readFileSync(missionsPath, 'utf8'));
  return { nodes, missions };
}

function buildMissionWindow(mission) {
  const now = new Date();
  let activeFrom = now;
  let activeTo = new Date(now);
  if (typeof mission.activeFrom === 'number') {
    activeFrom = new Date(now.getTime() + mission.activeFrom);
  } else if (mission.activeFrom) {
    activeFrom = new Date(mission.activeFrom);
  }
  if (typeof mission.activeTo === 'number') {
    activeTo = new Date(now.getTime() + mission.activeTo);
  } else if (mission.activeTo) {
    activeTo = new Date(mission.activeTo);
  }
  if (mission.kind === 'daily' && activeTo <= activeFrom) {
    activeTo = new Date(activeFrom);
    activeTo.setDate(activeTo.getDate() + 1);
  }
  if (mission.kind === 'weekly' && activeTo <= activeFrom) {
    activeTo = new Date(activeFrom);
    activeTo.setDate(activeTo.getDate() + 7);
  }
  return { activeFrom, activeTo };
}

async function seedPassData({ guildId, seasonId }) {
  const { nodes, missions } = loadSeedData();
  for (const n of nodes) {
    await NodeModel.findOneAndUpdate(
      { guildId, seasonId, id: n.id },
      {
        $set: {
          ...n,
          guildId,
          seasonId
        }
      },
      { upsert: true }
    );
  }
  for (const m of missions) {
    const { activeFrom, activeTo } = buildMissionWindow(m);
    await Mission.findOneAndUpdate(
      { guildId, seasonId, id: m.id },
      {
        $set: {
          ...m,
          guildId,
          seasonId,
          activeFrom,
          activeTo
        }
      },
      { upsert: true }
    );
  }
  return { nodesCount: nodes.length, missionsCount: missions.length };
}

module.exports = { seedPassData, loadSeedData, buildMissionWindow };