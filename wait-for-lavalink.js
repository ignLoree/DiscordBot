const http = require("http");
const { spawn } = require("child_process");
const path = require("path");

const raw = (process.env.LAVALINK_HOST || "127.0.0.1:2333").trim().replace(/^https?:\/\//i, "");
const lastColon = raw.lastIndexOf(":");
const host = lastColon > 0 ? raw.slice(0, lastColon) : raw;
const port = parseInt(lastColon > 0 ? raw.slice(lastColon + 1) : "2333", 10) || 2333;
const maxWaitMs = 120000;
const intervalMs = 2000;
const settleMs = 4000;
const start = Date.now();
let attempts = 0;

function check() {
  return new Promise((resolve) => {
    const req = http.get(
      { host, port, path: "/", timeout: 5000 },
      (res) => {
        res.destroy();
        resolve(true);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function runLoader() {
  const node = process.execPath || "node";
  const loader = path.join(__dirname, "loader.js");
  console.log("[wait-for-lavalink] Esecuzione: " + node + " loader.js");
  const child = spawn(node, ["--disable-warning=ExperimentalWarning", loader], {
    cwd: __dirname,
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  child.on("exit", (code) => process.exit(code != null ? code : 0));
}

function wait() {
  attempts += 1;
  const elapsed = Date.now() - start;
  if (elapsed > maxWaitMs) {
    console.error("[wait-for-lavalink] Timeout dopo " + (maxWaitMs / 1000) + "s. Avvio bot senza Lavalink (musica non funzionera).");
    runLoader();
    return;
  }
  if (attempts % 5 === 1 && attempts > 1) {
    console.log("[wait-for-lavalink] Ancora in attesa su " + host + ":" + port + " (tentativo " + attempts + ")");
  }
  check().then((ok) => {
    if (!ok) {
      setTimeout(wait, intervalMs);
      return;
    }
    console.log("[wait-for-lavalink] Lavalink raggiungibile, attendo " + settleMs / 1000 + "s (avvio JVM)...");
    setTimeout(() => {
      check().then((stillOk) => {
        if (!stillOk) {
          console.warn("[wait-for-lavalink] Lavalink non piu raggiungibile, continuo ad attendere.");
          setTimeout(wait, intervalMs);
          return;
        }
        console.log("[wait-for-lavalink] Avvio bot.");
        runLoader();
      });
    }, settleMs);
  });
}

console.log("[wait-for-lavalink] Attendo Lavalink su " + host + ":" + port + " ...");
wait();