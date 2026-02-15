const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const baseDir = __dirname;

const bot = {
    key: 'official',
    label: 'Ufficiale',
    start: './Vinili & Caffè/index.js',
    startupDelayMs: 0
};

const PID_FILE = path.resolve(baseDir, `.shard_${bot.key}.pid`);
const RESTART_FLAG = path.resolve(baseDir, 'restart.json');
const POLL_INTERVAL_MS = 5000;

let processRef = null;
let restarting = false;

console.log('[Loader] Loading 1 file');

function killPidTree(pid) {
    if (!pid || Number.isNaN(pid)) return;
    try {
        if (process.platform === 'win32') {
            child_process.spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
            process.kill(pid, 'SIGTERM');
        }
    } catch {}
}

function cleanupStalePid() {
    if (!fs.existsSync(PID_FILE)) return;
    let pid = null;
    try {
        pid = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
    } catch {
        pid = null;
    }
    if (processRef && pid && processRef.pid === pid) return;
    if (pid && !Number.isNaN(pid)) killPidTree(pid);
    try { fs.unlinkSync(PID_FILE); } catch {}
}

function writePid(pid) {
    try {
        fs.writeFileSync(PID_FILE, String(pid), 'utf8');
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

function runfile(options = {}) {
    return new Promise((resolve) => {
        const workingDir = path.resolve(baseDir, bot.start.split('/').slice(0, -1).join('/'));
        const file = bot.start.split('/').at(-1);
        const skipGitPull = Boolean(options.skipGitPull);
        const bypassDelay = Boolean(options.bypassDelay);

        const start = () => {
            cleanupStalePid();

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
                console.log(`[Loader] Opening file ${bot.start}`);
                processRef = child_process.spawn(process.execPath, [file], {
                    cwd: workingDir,
                    stdio: 'inherit'
                });
                writePid(processRef.pid);
                processRef.on('exit', (code) => {
                    try { fs.unlinkSync(PID_FILE); } catch {}
                    console.log(`[Loader] File ${bot.start} stopped (code ${code})`);
                    resolve();
                });
            };

            if (!needNpmInstall(workingDir)) {
                doSpawn();
                return;
            }

            console.log(`[Loader] Installing dependencies in ${workingDir}`);
            const npm = child_process.spawn('npm', [
                'install',
                '--build-from-resource',
                '--no-bin-links',
                '--prefer-offline',
                '--cache', path.join(os.tmpdir(), '.npm-global'),
                '--update-notifier', 'false',
                '--prefix', workingDir
            ], { cwd: workingDir, stdio: 'inherit' });

            npm.on('exit', (code) => {
                if (code !== 0) {
                    console.log(`[Loader] npm install failed (code ${code}), starting bot anyway.`);
                }
                doSpawn();
            });
        };

        const delay = bypassDelay ? 0 : Number(bot.startupDelayMs || 0);
        if (delay > 0) {
            console.log(`[Loader] Delaying ${bot.label} startup by ${delay}ms`);
            setTimeout(start, delay);
            return;
        }
        start();
    });
}

function restartBot(options = {}) {
    const respectDelay = Boolean(options.respectDelay);
    if (restarting) return;
    restarting = true;

    if (processRef && !processRef.killed) {
        console.log(`[Loader] Restarting ${bot.label}...`);
        const forceTimer = setTimeout(() => {
            try { killPidTree(processRef.pid); } catch {}
        }, 8000);

        processRef.once('exit', () => {
            clearTimeout(forceTimer);
            restarting = false;
            runfile({ bypassDelay: !respectDelay, skipGitPull: false });
        });

        try {
            processRef.kill();
        } catch {
            restarting = false;
            runfile({ bypassDelay: !respectDelay, skipGitPull: false });
        }
        return;
    }

    restarting = false;
    runfile({ bypassDelay: !respectDelay, skipGitPull: false });
}

runfile({ skipGitPull: true });

setInterval(() => {
    if (!fs.existsSync(RESTART_FLAG)) return;
    let payload = null;
    try {
        payload = JSON.parse(fs.readFileSync(RESTART_FLAG, 'utf8'));
    } catch {
        payload = null;
    }
    try { fs.unlinkSync(RESTART_FLAG); } catch {}
    restartBot({ respectDelay: Boolean(payload?.respectDelay) });
}, POLL_INTERVAL_MS);
