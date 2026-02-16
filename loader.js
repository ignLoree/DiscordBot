const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const baseDir = __dirname;

const BOTS = [
    { key: 'official', label: 'Ufficiale', start: './Vinili & Caffè Bot Ufficiale/index.js', startupDelayMs: 0 },
    { key: 'test', label: 'Bot Test', start: './Vinili & Caffè Bot Test/index.js', startupDelayMs: 6500 }
];

const RESTART_FLAG = path.resolve(baseDir, 'restart.json');
const POLL_INTERVAL_MS = 5000;

const processRefs = {};
const restarting = {};

function pidFile(botKey) {
    return path.resolve(baseDir, `.shard_${botKey}.pid`);
}

console.log('[Loader] Loading', BOTS.length, 'bot(s)');

function killPidTree(pid) {
    if (!pid || Number.isNaN(pid)) return;
    try {
        if (process.platform === 'win32') {
            child_process.spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
            process.kill(pid, 'SIGTERM');
        }
    } catch { }
}

function cleanupStalePid(botKey) {
    const file = pidFile(botKey);
    if (!fs.existsSync(file)) return;
    let pid = null;
    try {
        pid = Number(fs.readFileSync(file, 'utf8').trim());
    } catch {
        pid = null;
    }
    if (processRefs[botKey] && pid && processRefs[botKey].pid === pid) return;
    if (pid && !Number.isNaN(pid)) killPidTree(pid);
    try { fs.unlinkSync(file); } catch { }
}

function writePid(botKey, pid) {
    try {
        fs.writeFileSync(pidFile(botKey), String(pid), 'utf8');
    } catch (err) {
        console.log('[Loader] Could not write PID file:', err?.message || err);
    }
}

function needNpmInstall(workingDir) {
    const nodeModules = path.join(workingDir, 'node_modules');
    const packageJson = path.join(workingDir, 'package.json');
    if (!fs.existsSync(nodeModules)) return true;
    if (!fs.existsSync(packageJson)) return false;
    try {
        const pkgMtime = fs.statSync(packageJson).mtimeMs;
        const nmMtime = fs.statSync(nodeModules).mtimeMs;
        return pkgMtime > nmMtime;
    } catch {
        return true;
    }
}

function runfile(bot, options = {}) {
    return new Promise((resolve) => {
        const workingDir = path.resolve(baseDir, bot.start.split('/').slice(0, -1).join('/'));
        const file = bot.start.split('/').at(-1);
        const skipGitPull = Boolean(options.skipGitPull);
        const bypassDelay = Boolean(options.bypassDelay);
        const botKey = bot.key;

        const start = () => {
            cleanupStalePid(botKey);

            const repoRoot = fs.existsSync(path.join(baseDir, '.git')) ? baseDir : workingDir;
            if (!skipGitPull && fs.existsSync(path.join(repoRoot, '.git'))) {
                try {
                    console.log(`[Loader] Pulling latest changes in ${repoRoot}`);
                    const branch = process.env.GIT_BRANCH || 'main';
                    child_process.spawnSync('git', ['pull', 'origin', branch, '--ff-only'], { cwd: repoRoot, stdio: 'inherit' });
                    child_process.spawnSync('git', ['submodule', 'update', '--init', '--recursive'], { cwd: repoRoot, stdio: 'inherit' });
                } catch (err) {
                    console.log(`[Loader] Git pull failed: ${err?.message || err}`);
                }
            }

            const doSpawn = () => {
                console.log(`[Loader] Avvio ${bot.label}: ${bot.start}`);
                const proc = child_process.spawn(process.execPath, [file], {
                    cwd: workingDir,
                    stdio: 'inherit'
                });
                processRefs[botKey] = proc;
                writePid(botKey, proc.pid);
                proc.on('exit', (code) => {
                    try { fs.unlinkSync(pidFile(botKey)); } catch { }
                    processRefs[botKey] = null;
                    console.log(`[Loader] ${bot.label} fermato (code ${code})`);
                    resolve();
                });
            };

            if (!needNpmInstall(workingDir)) {
                doSpawn();
                return;
            }

            console.log(`[Loader] npm install in ${workingDir}`);
            const npm = child_process.spawn('npm', [
                'install',
                '--no-bin-links',
                '--prefer-offline',
                '--cache', path.join(os.tmpdir(), '.npm-global'),
                '--update-notifier', 'false',
                '--prefix', workingDir
            ], { cwd: workingDir, stdio: 'inherit' });

            npm.on('exit', (code) => {
                if (code !== 0) {
                    console.log(`[Loader] npm install fallito (code ${code}), avvio bot comunque.`);
                }
                doSpawn();
            });
        };

        const delay = bypassDelay ? 0 : Number(bot.startupDelayMs || 0);
        if (delay > 0) {
            console.log(`[Loader] Ritardo avvio ${bot.label}: ${delay}ms`);
            setTimeout(start, delay);
            return;
        }
        start();
    });
}

function restartBot(botKey, options = {}) {
    const bot = BOTS.find(b => b.key === botKey);
    if (!bot) return;
    const respectDelay = Boolean(options.respectDelay);
    if (restarting[botKey]) return;
    restarting[botKey] = true;

    const proc = processRefs[botKey];
    if (proc && !proc.killed) {
        console.log(`[Loader] Restart ${bot.label}...`);
        const forceTimer = setTimeout(() => {
            try { killPidTree(proc.pid); } catch { }
        }, 8000);

        proc.once('exit', () => {
            clearTimeout(forceTimer);
            restarting[botKey] = false;
            runfile(bot, { bypassDelay: !respectDelay, skipGitPull: false });
        });

        try {
            proc.kill();
        } catch {
            restarting[botKey] = false;
            runfile(bot, { bypassDelay: !respectDelay, skipGitPull: false });
        }
        return;
    }

    restarting[botKey] = false;
    runfile(bot, { bypassDelay: !respectDelay, skipGitPull: false });
}

// Avvio tutti i bot (il delay è gestito dentro runfile per ogni bot)
BOTS.forEach(bot => runfile(bot, { skipGitPull: true }));

setInterval(() => {
    if (!fs.existsSync(RESTART_FLAG)) return;
    let payload = null;
    try {
        payload = JSON.parse(fs.readFileSync(RESTART_FLAG, 'utf8'));
    } catch (err) {
        console.error('[Loader] restart.json read/parse failed:', err?.message || err);
        try { fs.unlinkSync(RESTART_FLAG); } catch { }
        return;
    }
    try { fs.unlinkSync(RESTART_FLAG); } catch { }
    const targetBot = payload?.bot || 'official';
    const respectDelay = Boolean(payload?.respectDelay);
    if (targetBot === 'all') {
      BOTS.forEach(bot => restartBot(bot.key, { respectDelay }));
    } else {
      restartBot(targetBot, { respectDelay });
    }
}, POLL_INTERVAL_MS);
