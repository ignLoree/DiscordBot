const child_process = require("child_process");
const fs = require("fs");
const path = require("path");

const baseDir = __dirname;

const bots = [
    {
        key: "dev",
        label: "Dev",
        start: "./Vinili & Caffè Dev Bot/shard.js",
        startupDelayMs: 0
    },
    {
        key: "official",
        label: "Ufficiale",
        start: "./Vinili & Caffè Bot Ufficiale/shard.js",
        startupDelayMs: 4000
    }
];

const processes = new Map();
const restarting = new Map();

console.log(`[Loader] Loading ${bots.length} files`);

function killPidTree(pid) {
    if (!pid || Number.isNaN(pid)) return;
    try {
        if (process.platform === "win32") {
            child_process.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
        } else {
            process.kill(pid, "SIGTERM");
        }
    } catch {}
}

function cleanupStalePid(bot) {
    const lockPath = path.resolve(baseDir, `.shard_${bot.key}.pid`);
    if (!fs.existsSync(lockPath)) return;
    let pid = null;
    try {
        pid = Number(fs.readFileSync(lockPath, "utf8").trim());
    } catch {
        pid = null;
    }
    const proc = processes.get(bot.key);
    if (proc && pid && proc.pid === pid) return;
    if (pid && !Number.isNaN(pid)) {
        killPidTree(pid);
    }
    try { fs.unlinkSync(lockPath); } catch {}
}

function runfile(bot, options = {}) {
    return new Promise((resolve) => {
        const working_dir = path.resolve(baseDir, bot.start.split("/").slice(0, -1).join("/"));
        const file = bot.start.split("/")[bot.start.split("/").length - 1];

        const start = () => {
        cleanupStalePid(bot);
        // Best-effort git pull to fetch updated files before restarting.
        const repoRoot = fs.existsSync(path.join(baseDir, ".git")) ? baseDir : working_dir;
        if (fs.existsSync(path.join(repoRoot, ".git"))) {
            try {
                console.log(`[Loader] Pulling latest changes in ${repoRoot}`);
                const branch = process.env.GIT_BRANCH || "main";
                child_process.spawnSync("git", ["pull", "origin", branch, "--ff-only"], { cwd: repoRoot, stdio: "inherit" });
                child_process.spawnSync("git", ["submodule", "update", "--init", "--recursive"], { cwd: repoRoot, stdio: "inherit" });
            } catch (err) {
                console.log(`[Loader] Git pull failed: ${err?.message || err}`);
            }
        }

        console.log(`[Loader] Installing dependencies in directory ${working_dir}`);

        child_process
            .spawn("npm", [
                "install",
                "--build-from-resource",
                "--no-bin-links",
                "--cache",
                "/tmp/.npm-global",
                "--update-notifier",
                "false",
                "--prefix",
                working_dir
            ], {
                cwd: working_dir
            })
            .on("exit", () => {
                console.log(`[Loader] Opening file ${bot.start}`);
                const proc = child_process.spawn(process.execPath, [file], {
                    cwd: working_dir,
                    stdio: "inherit"
                });
                processes.set(bot.key, proc);
                proc.on("exit", (code) => {
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

function restartBot(bot, options = {}) {
    const respectDelay = Boolean(options.respectDelay);
    if (restarting.get(bot.key)) return;
    restarting.set(bot.key, true);
    const proc = processes.get(bot.key);
    if (proc && !proc.killed) {
        console.log(`[Loader] Restarting ${bot.label}...`);
        const forceTimer = setTimeout(() => {
            try { killPidTree(proc.pid); } catch {}
        }, 8000);
        proc.once("exit", () => {
            clearTimeout(forceTimer);
            restarting.set(bot.key, false);
            runfile(bot, { bypassDelay: !respectDelay });
        });
        try {
            proc.kill();
        } catch {
            restarting.set(bot.key, false);
            runfile(bot, { bypassDelay: !respectDelay });
        }
        return;
    }
    restarting.set(bot.key, false);
    runfile(bot, { bypassDelay: !respectDelay });
}

for (const bot of bots) {
    runfile(bot);
}

setInterval(() => {
    const flagPath = path.resolve(baseDir, "restart.json");
    if (!fs.existsSync(flagPath)) return;
    let payload = null;
    try {
        const raw = fs.readFileSync(flagPath, "utf8");
        payload = JSON.parse(raw);
    } catch {
        payload = null;
    }
    try {
        fs.unlinkSync(flagPath);
    } catch {}
    const targets = Array.isArray(payload?.targets)
        ? payload.targets
        : payload?.target
            ? [payload.target]
            : [];
    const respectDelay = Boolean(payload?.respectDelay);
    for (const bot of bots) {
        if (targets.length === 0 || targets.includes(bot.key)) {
            restartBot(bot, { respectDelay });
        }
    }
}, 5000);
