const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const baseDir = __dirname;

const ENABLE_LOADER_GIT_PULL = false;
const ENABLE_LOADER_NPM_INSTALL = false;

const BOTS = [
    { key: 'official', label: 'Ufficiale', start: './Vinili & Caffè Bot Ufficiale/index.js', startupDelayMs: 0 },
    { key: 'test', label: 'Bot Test', start: './Vinili & Caffè Bot Test/index.js', startupDelayMs: 7000 }
];

const RESTART_FLAG = path.resolve(baseDir, 'restart.json');
const POLL_INTERVAL_MS = 5000;
const FORCE_KILL_DELAY_MS = 8000;
const NPM_CACHE_DIR = path.join(os.tmpdir(), '.npm-global');

const processRefs = {};
const restarting = {};
let npmInstallInProgress = null;

const silencedEnv = process.env.SHOW_NODE_WARNINGS === '1'
    ? { ...process.env }
    : { ...process.env, NODE_NO_WARNINGS: '1' };

const WORKSPACES_ENABLED = hasWorkspacesConfig();

function resolveNodeExecutable() {
    const fromExecPath = String(process.execPath || '').trim();
    if (fromExecPath && fs.existsSync(fromExecPath)) {
        return fromExecPath;
    }
    return process.env.NODE_BINARY || 'node';
}

function splitStartPath(startPath) {
    const normalized = String(startPath).replace(/\\/g, '/');
    const parts = normalized.split('/');
    return {
        workingDir: path.resolve(baseDir, parts.slice(0, -1).join('/')),
        file: parts.at(-1)
    };
}

function pidFile(botKey) {
    return path.resolve(baseDir, `.shard_${botKey}.pid`);
}

function runNpmInstall(installDir, extraArgs = []) {
    return new Promise((resolveInstall) => {
        const args = [
            'install',
            '--legacy-peer-deps',
            '--loglevel', 'error',
            '--no-audit',
            '--no-fund',
            '--no-bin-links',
            '--prefer-offline',
            '--cache', NPM_CACHE_DIR,
            '--update-notifier', 'false',
            ...extraArgs
        ];

        const npm = child_process.spawn('npm', args, {
            cwd: installDir,
            stdio: 'inherit',
            env: silencedEnv
        });

        npm.on('exit', (code) => resolveInstall(code || 0));
    });
}

function killPidTree(pid) {
    if (!pid || Number.isNaN(pid)) return;
    try {
        if (process.platform === 'win32') {
            child_process.spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
            return;
        }
        process.kill(pid, 'SIGTERM');
    } catch {
    }
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

function hasWorkspacesConfig() {
    const rootPackageJson = path.join(baseDir, 'package.json');
    if (!fs.existsSync(rootPackageJson)) return false;

    try {
        const pkg = JSON.parse(fs.readFileSync(rootPackageJson, 'utf8'));
        return Array.isArray(pkg?.workspaces) && pkg.workspaces.length > 0;
    } catch {
        return false;
    }
}

function needNpmInstall(workingDir, useWorkspaces = false) {
    const installDir = useWorkspaces ? baseDir : workingDir;
    const nodeModules = path.join(installDir, 'node_modules');
    const packageJson = path.join(installDir, 'package.json');
    const packageLock = path.join(installDir, 'package-lock.json');

    try {
        if (!fs.existsSync(nodeModules)) return true;
        if (!fs.existsSync(packageJson)) return false;

        const pkgMtime = fs.statSync(packageJson).mtimeMs;
        const lockMtime = fs.existsSync(packageLock) ? fs.statSync(packageLock).mtimeMs : 0;
        const nmMtime = fs.statSync(nodeModules).mtimeMs;
        return Math.max(pkgMtime, lockMtime) > nmMtime;
    } catch {
        return true;
    }
}

function updateRepo(repoRoot) {
    if (!fs.existsSync(path.join(repoRoot, '.git'))) return;

    try {
        console.log(`[Loader] Pulling latest changes in ${repoRoot}`);
        const branch = process.env.GIT_BRANCH || 'main';
        child_process.spawnSync('git', ['pull', 'origin', branch, '--ff-only'], { cwd: repoRoot, stdio: 'inherit' });
        child_process.spawnSync('git', ['submodule', 'update', '--init', '--recursive'], { cwd: repoRoot, stdio: 'inherit' });
    } catch (err) {
        console.log(`[Loader] Git pull failed: ${err?.message || err}`);
    }
}

function ensureDependencies(workingDir, useWorkspaces) {
    if (!needNpmInstall(workingDir, useWorkspaces)) return Promise.resolve();

    const installDir = useWorkspaces ? baseDir : workingDir;
    if (!npmInstallInProgress) {
        npmInstallInProgress = new Promise((resolveInstall) => {
            console.log(`[Loader] npm install in ${installDir}`);
            runNpmInstall(installDir).then((code) => {
                if (code === 0) {
                    resolveInstall();
                    return;
                }

                console.log(`[Loader] npm install fallito (code ${code}), retry con --force...`);
                runNpmInstall(installDir, ['--force']).then((retryCode) => {
                    if (retryCode !== 0) {
                        console.log(`[Loader] npm install fallito anche con --force (code ${retryCode}), avvio bot comunque.`);
                    }
                    resolveInstall();
                });
            });
        }).finally(() => {
            npmInstallInProgress = null;
        });
    } else {
        console.log('[Loader] npm install già in corso, attendo completamento...');
    }

    return npmInstallInProgress;
}

function spawnBotProcess(bot, workingDir, file, resolve) {
    console.log(`[Loader] Avvio ${bot.label}: ${bot.start}`);

    const nodeBin = resolveNodeExecutable();
    const proc = child_process.spawn(nodeBin, [file], {
        cwd: workingDir,
        stdio: 'inherit',
        env: silencedEnv
    });

    processRefs[bot.key] = proc;
    writePid(bot.key, proc.pid);

    proc.on('error', (err) => {
        try { fs.unlinkSync(pidFile(bot.key)); } catch { }
        processRefs[bot.key] = null;
        console.log(`[Loader] Errore avvio ${bot.label}: ${err?.message || err}`);
        resolve();
    });

    proc.on('exit', (code) => {
        try { fs.unlinkSync(pidFile(bot.key)); } catch { }
        processRefs[bot.key] = null;
        console.log(`[Loader] ${bot.label} fermato (code ${code})`);
        resolve();
    });
}

function runfile(bot, options = {}) {
    return new Promise((resolve) => {
        const { workingDir, file } = splitStartPath(bot.start);
        // Force-disable git pull on runtime to avoid merge conflicts on hosted panels.
        const skipGitPull = true;
        const bypassDelay = Boolean(options.bypassDelay);
        const useWorkspaces = WORKSPACES_ENABLED;

        const start = () => {
            cleanupStalePid(bot.key);

            const repoRoot = fs.existsSync(path.join(baseDir, '.git')) ? baseDir : workingDir;
            if (!skipGitPull && ENABLE_LOADER_GIT_PULL) {
                updateRepo(repoRoot);
            }

            const depTask = ENABLE_LOADER_NPM_INSTALL
                ? ensureDependencies(workingDir, useWorkspaces)
                : Promise.resolve();

            depTask
                .finally(() => spawnBotProcess(bot, workingDir, file, resolve));
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
    const bot = BOTS.find((entry) => entry.key === botKey);
    if (!bot) return;

    const respectDelay = Boolean(options.respectDelay);
    if (restarting[botKey]) return;
    restarting[botKey] = true;

    const proc = processRefs[botKey];
    if (proc && !proc.killed) {
        console.log(`[Loader] Restart ${bot.label}...`);

        const forceTimer = setTimeout(() => {
            try { killPidTree(proc.pid); } catch { }
        }, FORCE_KILL_DELAY_MS);

        proc.once('exit', () => {
            clearTimeout(forceTimer);
            restarting[botKey] = false;
            runfile(bot, { bypassDelay: !respectDelay, skipGitPull: true });
        });

        try {
            proc.kill();
        } catch {
            restarting[botKey] = false;
            runfile(bot, { bypassDelay: !respectDelay, skipGitPull: true });
        }
        return;
    }

    restarting[botKey] = false;
    runfile(bot, { bypassDelay: !respectDelay, skipGitPull: true });
}

function readRestartPayload() {
    if (!fs.existsSync(RESTART_FLAG)) return null;

    try {
        return JSON.parse(fs.readFileSync(RESTART_FLAG, 'utf8'));
    } catch (err) {
        console.error('[Loader] restart.json read/parse failed:', err?.message || err);
        return null;
    } finally {
        try { fs.unlinkSync(RESTART_FLAG); } catch { }
    }
}

BOTS.forEach((bot) => runfile(bot, { skipGitPull: true }));

setInterval(() => {
    const payload = readRestartPayload();
    if (!payload) return;

    const targetBot = payload?.bot || 'official';
    const respectDelay = Boolean(payload?.respectDelay);

    if (targetBot === 'all') {
        BOTS.forEach((bot) => restartBot(bot.key, { respectDelay }));
    } else {
        restartBot(targetBot, { respectDelay });
    }
}, POLL_INTERVAL_MS);
