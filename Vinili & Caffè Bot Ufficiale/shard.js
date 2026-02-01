const { ClusterManager } = require('discord-hybrid-sharding');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const config = require('./config.json');
const logger = require('./Utils/Moderation/logger');

const botKey = __dirname.toLowerCase().includes('dev bot') ? 'dev' : 'official';
const lockPath = path.join(__dirname, '..', `.shard_${botKey}.pid`);
try {
  if (fs.existsSync(lockPath)) {
    const existingPid = Number(fs.readFileSync(lockPath, 'utf8').trim());
    if (existingPid && !Number.isNaN(existingPid)) {
      try {
        process.kill(existingPid, 0);
        logger.error(`[SHARD LOCK] Another ${botKey} instance is already running (pid ${existingPid}).`);
        process.exit(1);
      } catch {
      }
    }
  }
  fs.writeFileSync(lockPath, String(process.pid), 'utf8');
} catch (err) {
  logger.error('[SHARD LOCK] Failed to create PID lock:', err);
}

const cleanupLock = () => {
  try {
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
  } catch {}
};
process.on('exit', cleanupLock);
process.on('SIGINT', () => {
  cleanupLock();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanupLock();
  process.exit(0);
});
process.on('uncaughtException', (err) => {
  logger.error('[SHARD LOCK] Uncaught exception:', err);
  cleanupLock();
  process.exit(1);
});

const manager = new ClusterManager(
  path.join(__dirname, 'index.js'),
  {
    totalShards: 'auto',
    shardsPerClusters: 2,
    totalClusters: 'auto',
    mode: 'process',
    token: process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN_DEV || config.token
  }
);
manager.on('clusterCreate', cluster => {
  logger.info(`Cluster ${cluster.id} created`);
});
manager.spawn({ timeout: -1 });



