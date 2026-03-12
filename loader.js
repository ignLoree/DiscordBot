const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const baseDir = __dirname;
const ENABLE_LOADER_GIT_PULL = false;
const ENABLE_LOADER_NPM_INSTALL = true;
const BOTS=[{key:'vinyls',label:'Vinyls',folderSuffix:'Vinyls',startupDelayMs:0},{key:'Coffee',label:'Coffee',folderSuffix:'Coffee',startupDelayMs:7000}];
const NPM_CACHE_DIR = path.join(os.tmpdir(), '.npm-global');
const processRefs = {};
const npmInstallInProgressByDir = {};
const silencedEnv=process.env.SHOW_NODE_WARNINGS==='1'?{...process.env}:{...process.env,NODE_NO_WARNINGS:'1'};
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
    const suffix = String(bot?.folderSuffix || '').trim();
    const suffixNorm = normalizeComparableName(suffix);

    const directPath = path.join(baseDir, suffix);
    if (fs.existsSync(path.join(directPath, 'index.js'))) {
        return directPath;
    }
    const exactCandidates=[`Vinili & CaffÃƒÂ¨ ${bot.folderSuffix}`,`Vinili & Caffe ${bot.folderSuffix}`,`Vinili & CaffÃƒÆ’Ã‚Â¨ ${bot.folderSuffix}`,`Vinili & CaffÃ¯Â¿Â½ ${bot.folderSuffix}`];

    for (const folderName of exactCandidates) {
        const fullPath = path.join(baseDir, folderName);
        if (fs.existsSync(path.join(fullPath, 'index.js'))) {
            return fullPath;
        }
    }

    const entries=fs.readdirSync(baseDir,{withFileTypes:true}).filter((entry)=>entry.isDirectory()).map((entry)=>entry.name);
    const match=entries.find((name)=>{const normalized=normalizeComparableName(name);return normalized===suffixNorm||(normalized.includes('vinili')&&normalized.includes('caff')&&normalized.includes(suffixNorm));});
    if (!match) {
        throw new Error(`Bot directory not found for ${bot.label} (expected folder like "${suffix}")`);
    }
    return path.join(baseDir, match);
}

function splitStartPath(bot) {
    const workingDir = resolveBotWorkingDir(bot);
    const shardingFlag = String(process.env.ENABLE_SHARDING || process.env.SHARDING || '').trim().toLowerCase();
    const useSharded=bot.key==='vinyls'&&shardingFlag!=='0'&&shardingFlag!=='false'&&fs.existsSync(path.join(workingDir,'run-sharded.js'));
    console.log(
        `[Loader] ${bot.label} ENABLE_SHARDING=${String(process.env.ENABLE_SHARDING || process.env.SHARDING || '')} -> ${useSharded ? 'run-sharded.js' : 'index.js'}`
    );
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
        const candidates=entries.filter((entry)=>entry.isDirectory()&&/^node-v\d+\.\d+\.\d+/.test(entry.name)).map((entry)=>({name:entry.name,fullPath:path.join(tmpDir,entry.name,'bin','node')})).filter((entry)=>fs.existsSync(entry.fullPath)).sort((a,b)=>b.name.localeCompare(a.name,undefined,{numeric:true}));
        if (candidates.length > 0) {
            return candidates[0].fullPath;
        }
    } catch (err) {
      console.warn("[Loader]", err?.message || err);
    }

    return 'node';
}


function runSyncFromServerIfConfigured() {
    const syncServer = process.env.SYNC_SERVER || '';
    if (!syncServer.trim()) return;
    const scriptPath = path.join(baseDir, 'scripts', 'sync-from-server.js');
    if (!fs.existsSync(scriptPath)) return;
    try {
        console.log('[Loader] Sync da server...');
        child_process.spawnSync(process.execPath, [scriptPath], { cwd: baseDir, stdio: 'inherit', env: process.env });
    } catch (err) {
        console.warn('[Loader] Sync da server fallito:', err?.message || err);
    }
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
        const args=['install','--legacy-peer-deps','--loglevel','error','--no-audit','--no-fund','--no-bin-links','--prefer-offline','--cache',NPM_CACHE_DIR,'--update-notifier','false',...extraArgs];

        const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const npm=child_process.spawn(npmCmd,args,{cwd:installDir,stdio:'inherit',env:silencedEnv});

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
    } catch (err) {
      console.warn("[Loader]", err?.message || err);
    }
}

function cleanupStalePid(botKey) {
    const file = pidFile(botKey);
    if (!fs.existsSync(file)) return;

    const pid = readPidFile(botKey);

    if (processRefs[botKey] && pid && processRefs[botKey].pid === pid) return;
    if (pid && !Number.isNaN(pid)) killPidTree(pid);
    try { fs.unlinkSync(file); } catch (err) {
      console.warn("[Loader]", err?.message || err);
    }
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
    const key = path.resolve(installDir);
    if (!npmInstallInProgressByDir[key]) {
        npmInstallInProgressByDir[key] = new Promise((resolveInstall) => {
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
            delete npmInstallInProgressByDir[key];
        });
    }
    return npmInstallInProgressByDir[key];
}

function buildNodePath(workingDir) {
    const parts = [
        path.join(workingDir, 'node_modules'),
        path.join(baseDir, 'node_modules'),
    ].filter((dir) => fs.existsSync(dir));
    const existing = String(process.env.NODE_PATH || '').trim();
    if (existing) parts.push(existing);
    return parts.join(path.delimiter);
}

function spawnBotProcess(bot, workingDir, file, resolve) {
    console.log(`[Loader] Avvio ${bot.label}: ${bot.folderSuffix} (${file})`);

    const nodeBin = resolveNodeExecutable();
    const scriptPath = path.resolve(workingDir, file);
    const shardEnv = file === 'run-sharded.js' ? { ENABLE_SHARDING: '1' } : {};
    const nodePath = buildNodePath(workingDir);
    if (nodePath) {
        console.log(`[Loader] ${bot.label} NODE_PATH=${nodePath}`);
    }
    console.log(`[Loader] Runtime ${bot.label}: ${nodeBin} (loader execPath: ${process.execPath})`);
    const nodeArgs = process.env.SHOW_NODE_WARNINGS === '1' ? [scriptPath] : ['--disable-warning=ExperimentalWarning', scriptPath];
    const spawnEnv = { ...silencedEnv, RUN_UNDER_LOADER: '1', ...shardEnv };
    if (nodePath) spawnEnv.NODE_PATH = nodePath;
    const proc=child_process.spawn(nodeBin,nodeArgs,{cwd:workingDir,stdio:'inherit',env:spawnEnv,shell:false});

    processRefs[bot.key] = proc;
    writePid(bot.key, proc.pid);

    proc.on('error', (err) => {
        try { fs.unlinkSync(pidFile(bot.key)); } catch (e) {
          console.warn("[Loader]", e?.message || e);
        }
        processRefs[bot.key] = null;
        console.log(`[Loader] Errore avvio ${bot.label}: ${err?.message || err}`);
        resolve();
    });

    proc.on('exit', (code) => {
        try { fs.unlinkSync(pidFile(bot.key)); } catch (e) {
          console.warn("[Loader]", e?.message || e);
        }
        processRefs[bot.key] = null;
        console.log(`[Loader] ${bot.label} fermato (code ${code})`);
        resolve();
    });
}

function runfile(bot, options = {}) {
    return new Promise((resolve) => {
        const { workingDir, file } = splitStartPath(bot);
        const skipGitPull = true;
        const bypassDelay = Boolean(options.bypassDelay);
        const useWorkspaces = WORKSPACES_ENABLED;

        const start=()=>{cleanupStalePid(bot.key);runSyncFromServerIfConfigured();const repoRoot=fs.existsSync(path.join(baseDir,'.git'))?baseDir:workingDir;if(!skipGitPull&&ENABLE_LOADER_GIT_PULL){updateRepo(repoRoot);} const depTask=ENABLE_LOADER_NPM_INSTALL?ensureDependencies(workingDir,false):Promise.resolve();depTask.finally(()=>spawnBotProcess(bot,workingDir,file,resolve));};const delay=bypassDelay?0 : Number(bot.startupDelayMs || 0);
        if (delay > 0) {
            console.log(`[Loader] Ritardo avvio ${bot.label}: ${delay}ms`);
            setTimeout(start, delay);
            return;
        }

        start();
    });
}

BOTS.forEach((bot) => runfile(bot, { skipGitPull: true }));