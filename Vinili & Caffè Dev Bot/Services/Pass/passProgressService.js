const { NodeModel } = require('../../Schemas/Pass/node');
const { grantRewards } = require('./rewardService');

async function updateAutoNodes({ guildId, seasonId, passUser }) {
    const nodes = await NodeModel.find({
        guildId,
        seasonId,
        type: 'auto'
    });
    let changed = false;
    for (const node of nodes) {
        if (passUser.completedNodes.includes(node.id)) continue;
        const progress = passUser.stats[node.objective.stat] || 0;
        if (progress >= node.objective.target) {
            passUser.completedNodes.push(node.id);
            changed = true;
            if (node.rewards) {
                await grantRewards({
                    guildId,
                    seasonId,
                    userId: passUser.userId,
                    passUser,
                    rewards: node.rewards,
                    reason: `node_auto_complete:${node.id}`
                });
            }
        }
    }
    if (changed) await passUser.save();
}

module.exports = { updateAutoNodes };