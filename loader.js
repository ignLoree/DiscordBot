const child_process = require("child_process");
const fs = require("fs");
const path = require("path");

const baseDir = __dirname;

const bots = [
    {
        key: "official",
        label: "Ufficiale",
        start: "./Vinili & Caffè Bot Ufficiale/shard.js",
        restartFlag: "./restart_official"
    },
    {
        key: "dev",
        label: "Dev",
        start: "./Vinili & Caffè Dev Bot/shard.js",
        restartFlag: "./restart_dev",
        startupDelayMs: 20000
    }
];

const processes = new Map();
const restarting = new Map();

console.log(`[Loader] Loading ${bots.length} files`);

function runfile(bot) {
    return new Promise((resolve) => {
        const working_dir = path.resolve(baseDir, bot.start.split("/").slice(0, -1).join("/"));
        const file = bot.start.split("/")[bot.start.split("/").length - 1];

        const start = () => {
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

        const delay = Number(bot.startupDelayMs || 0);
        if (delay > 0) {
            console.log(`[Loader] Delaying ${bot.label} startup by ${delay}ms`);
            setTimeout(start, delay);
            return;
        }
        start();
    });
}

function restartBot(bot) {
    if (restarting.get(bot.key)) return;
    restarting.set(bot.key, true);
    const proc = processes.get(bot.key);
    if (proc && !proc.killed) {
        console.log(`[Loader] Restarting ${bot.label}...`);
        proc.once("exit", () => {
            restarting.set(bot.key, false);
            runfile(bot);
        });
        try {
            proc.kill();
        } catch {
            restarting.set(bot.key, false);
            runfile(bot);
        }
        return;
    }
    restarting.set(bot.key, false);
    runfile(bot);
}

for (const bot of bots) {
    runfile(bot);
}

setInterval(() => {
    for (const bot of bots) {
        const flagPath = path.resolve(baseDir, bot.restartFlag);
        if (fs.existsSync(flagPath)) {
            try {
                fs.unlinkSync(flagPath);
            } catch {}
            restartBot(bot);
        }
    }
}, 5000);



