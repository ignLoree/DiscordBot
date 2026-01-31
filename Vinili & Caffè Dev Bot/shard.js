const { ClusterManager } = require('discord-hybrid-sharding');
const path = require('path');
const config = require('./config.json');
const logger = require('./Utils/Moderation/logger');
const manager = new ClusterManager(
  path.join(__dirname, 'index.js'),
  {
    totalShards: 'auto',
    shardsPerClusters: 2,
    totalClusters: 'auto',
    mode: 'process',
    token: config.token
  }
);
manager.on('clusterCreate', cluster => {
  logger.info(`Cluster ${cluster.id} created`);
});
manager.spawn({ timeout: -1 });


