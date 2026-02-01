const { ClusterManager } = require('discord-hybrid-sharding');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const config = require('./config.json');
const logger = require('./Utils/Moderation/logger');

const singleProcess = process.env.SINGLE_PROCESS !== "0";
if (singleProcess) {
  require('./index.js');
  return;
}

const manager = new ClusterManager(
  path.join(__dirname, 'index.js'),
  {
    totalShards: 'auto',
    shardsPerClusters: 2,
    totalClusters: 'auto',
    mode: 'process',
    token: process.env.DISCORD_TOKEN_DEV || process.env.DISCORD_TOKEN_OFFICIAL || config.token
  }
);
manager.on('clusterCreate', cluster => {
  logger.info(`Cluster ${cluster.id} created`);
});
manager.spawn({ timeout: -1 });

