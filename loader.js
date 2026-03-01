const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const baseDir = __dirname;

const ENABLE_LOADER_GIT_PULL = false;
const ENABLE_LOADER_NPM_INSTALL = false;

const BOTS = [
    { key: 'official', label: 'Ufficiale', folderSuffix: 'Bot Ufficiale', startupDelayMs: 0 },
    { key: 'test', label: 'Bot Test', folderSuffix: 'Bot Test', startupDelayMs: 7000 }
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

function normalizeComparableName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}\s&-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function resolveBotWorkingDir(bot) {
    const suffix = normalizeComparableName(bot?.folderSuffix || '');
    const exactCandidates = [
        `Vinili & CaffÃƒÂ¨ ${bot.folderSuffix}`,
        `Vinili & Caffe ${bot.folderSuffix}`,
        `Vinili & CaffÃƒÆ’Ã‚Â¨ ${bot.folderSuffix}`,
        `Vinili & CaffÃ¯Â¿Â½ ${bot.folderSuffix}`
    ];

    for (const folderName of exactCandidates) {
        const fullPath = path.join(baseDir, folderName);
        if (fs.existsSync(path.join(fullPath, 'index.js'))) {
            return fullPath;
        }
    }

    const entries = fs.readdirSync(baseDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    const match = entries.find((name) => {
        const normalized = normalizeComparableName(name);
        return normalized.includes('vinili') && normalized.includes('caff') && normalized.includes(suffix);
    });
    if (!match) {
        throw new Error(`Bot directory not found for ${bot.label}`);
    }
    return path.join(baseDir, match);
}

function splitStartPath(bot) {
    const workingDir = resolveBotWorkingDir(bot);
    const useSharded =
        bot.key === 'official' &&
        process.env.ENABLE_SHARDING === '1' &&
        fs.existsSync(path.join(workingDir, 'run-sharded.js'));
    return {
        workingDir,
        file: useSharded ? 'run-sharded.js' : 'index.js'
    };
}
function resolveNodeExecutable() {
    const fromEnv = String(process.env.NODE_BINARY || '').trim();
    if (fromEnv && fs.existsSync(fromEnv)) {
        return fromEnv;
    }

    const fromExecPath = String(process.execPath || '').trim();
    if (fromExecPath && fs.existsSync(fromExecPath)) {
        return fromExecPath;
    }

    const tmpDir = path.join(os.tmpdir(), '');
    try {
        const entries = fs.readdirSync(tmpDir, { withFileTypes: true });
        const candidates = entries
            .filter((entry) => entry.isDirectory() && /^node-v\d+\.\d+\.\d+/.test(entry.name))
            .map((entry) => ({
                name: entry.name,
                fullPath: path.join(tmpDir, entry.name, 'bin', 'node')
            }))
            .filter((entry) => fs.existsSync(entry.fullPath))
            .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
        if (candidates.length > 0) {
            return candidates[0].fullPath;
        }
    } catch {
    }

    return 'node';
}


function pidFile(botKey) {
    return path.resolve(baseDir, `.shard_${botKey}.pid`);
}

function readPidFile(botKey) {
    const file = pidFile(botKey);
    if (!fs.existsSync(file)) return null;

    try {
        const pid = Number(fs.readFileSync(file, 'utf8').trim());
        return Number.isNaN(pid) ? null : pid;
    } catch {
        return null;
    }
}

function isPidRunning(pid) {
    if (!pid || Number.isNaN(pid)) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
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

    const pid = readPidFile(botKey);

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
        console.log('[Loader] npm install giÃƒÆ’Ã‚Â  in corso, attendo completamento...');
    }

    return npmInstallInProgress;
}

function spawnBotProcess(bot, workingDir, file, resolve) {
    console.log(`[Loader] Avvio ${bot.label}: ${bot.folderSuffix} (${file})`);

    const nodeBin = resolveNodeExecutable();
    const scriptPath = path.resolve(workingDir, file);
    const shardEnv = file === 'run-sharded.js' ? { ENABLE_SHARDING: '1' } : {};
    console.log(`[Loader] Runtime ${bot.label}: ${nodeBin} (loader execPath: ${process.execPath})`);
    const nodeArgs = process.env.SHOW_NODE_WARNINGS === '1' ? [scriptPath] : ['--disable-warning=ExperimentalWarning', scriptPath];
    const proc = child_process.spawn(nodeBin, nodeArgs, {
        cwd: workingDir,
        stdio: 'inherit',
        env: { ...silencedEnv, RUN_UNDER_LOADER: '1', ...shardEnv },
        shell: false
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
        const { workingDir, file } = splitStartPath(bot);
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
    const pidFromFile = readPidFile(botKey);

    const startReplacement = () => {
        if (!restarting[botKey]) return;
        restarting[botKey] = false;
        runfile(bot, { bypassDelay: !respectDelay, skipGitPull: true });
    };

    if (proc && !proc.killed) {
        console.log(`[Loader] Restart ${bot.label}...`);

        const forceTimer = setTimeout(() => {
            try { killPidTree(proc.pid); } catch { }
        }, FORCE_KILL_DELAY_MS);

        proc.once('exit', () => {
            clearTimeout(forceTimer);
            startReplacement();
        });

        try {
            proc.kill();
        } catch {
            startReplacement();
        }
        return;
    }

    if (pidFromFile && isPidRunning(pidFromFile)) {
        console.log(`[Loader] Restart ${bot.label}: killing stale PID ${pidFromFile}...`);
        try { killPidTree(pidFromFile); } catch { }

        const startedAt = Date.now();
        const waitForExit = () => {
            if (!isPidRunning(pidFromFile)) {
                try { fs.unlinkSync(pidFile(botKey)); } catch { }
                startReplacement();
                return;
            }

            if (Date.now() - startedAt >= FORCE_KILL_DELAY_MS) {
                console.log(`[Loader] ${bot.label}: PID ${pidFromFile} still alive after timeout, starting replacement anyway.`);
                startReplacement();
                return;
            }

            setTimeout(waitForExit, 250);
        };

        waitForExit();
        return;
    }

    startReplacement();
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



