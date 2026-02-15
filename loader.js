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
    const lockPath = path.resolve(baseDir, `.shard_${bot.key}.pid`);
    if (!fs.existsSync(lockPath)) return;

    let pid = null;
    try {
        pid = Number(fs.readFileSync(lockPath, 'utf8').trim());
    } catch {
        pid = null;
    }

    if (processRef && pid && processRef.pid === pid) return;
    if (pid && !Number.isNaN(pid)) killPidTree(pid);
    try { fs.unlinkSync(lockPath); } catch {}
}

function runfile(options = {}) {
    return new Promise((resolve) => {
        const workingDir = path.resolve(baseDir, bot.start.split('/').slice(0, -1).join('/'));
        const file = bot.start.split('/').at(-1);

        const start = () => {
            cleanupStalePid();

            const repoRoot = fs.existsSync(path.join(baseDir, '.git')) ? baseDir : workingDir;
            if (fs.existsSync(path.join(repoRoot, '.git'))) {
                try {
                    console.log(`[Loader] Pulling latest changes in ${repoRoot}`);
                    const branch = process.env.GIT_BRANCH || 'main';
                    child_process.spawnSync('git', ['pull', 'origin', branch, '--ff-only'], { cwd: repoRoot, stdio: 'inherit' });
                    child_process.spawnSync('git', ['submodule', 'update', '--init', '--recursive'], { cwd: repoRoot, stdio: 'inherit' });
                } catch (err) {
                    console.log(`[Loader] Git pull failed: ${err?.message || err}`);
                }
            }

            console.log(`[Loader] Installing dependencies in directory ${workingDir}`);
            child_process
                .spawn('npm', [
                    'install',
                    '--build-from-resource',
                    '--no-bin-links',
                    '--cache',
                    path.join(os.tmpdir(), '.npm-global'),
                    '--update-notifier',
                    'false',
                    '--prefix',
                    workingDir
                ], { cwd: workingDir })
                .on('exit', () => {
                    console.log(`[Loader] Opening file ${bot.start}`);
                    processRef = child_process.spawn(process.execPath, [file], {
                        cwd: workingDir,
                        stdio: 'inherit'
                    });
                    processRef.on('exit', (code) => {
                        console.log(`[Loader] File ${bot.start} stopped (code ${code})`);
                        resolve();
                    });
                });
        };

        const delay = options.bypassDelay ? 0 : Number(bot.startupDelayMs || 0);
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
            runfile({ bypassDelay: !respectDelay });
        });

        try {
            processRef.kill();
        } catch {
            restarting = false;
            runfile({ bypassDelay: !respectDelay });
        }
        return;
    }

    restarting = false;
    runfile({ bypassDelay: !respectDelay });
}

runfile();

setInterval(() => {
    const flagPath = path.resolve(baseDir, 'restart.json');
    if (!fs.existsSync(flagPath)) return;

    let payload = null;
    try {
        payload = JSON.parse(fs.readFileSync(flagPath, 'utf8'));
    } catch {
        payload = null;
    }

    try { fs.unlinkSync(flagPath); } catch {}
    restartBot({ respectDelay: Boolean(payload?.respectDelay) });
}, 5000);
