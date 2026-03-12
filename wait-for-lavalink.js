const net = require("net");
const { spawn } = require("child_process");
const path = require("path");

const host = process.env.LAVALINK_HOST || "127.0.0.1:2333";
const [h, portStr] = host.split(":");
const port = parseInt(portStr || "2333", 10);
const maxWaitMs = 120000;
const intervalMs = 2000;
const start = Date.now();

function check() {
  return new Promise((resolve) => {
    const s = net.connect(port, h, () => {
      s.destroy();
      resolve(true);
    });
    s.on("error", () => resolve(false));
    s.setTimeout(5000, () => {
      s.destroy();
      resolve(false);
    });
  });
}

function wait() {
  if (Date.now() - start > maxWaitMs) {
    console.error("[wait-for-lavalink] Timeout: Lavalink non raggiungibile su " + host);
    process.exit(1);
  }
  check().then((ok) => {
    if (ok) {
      const node = process.execPath || "node";
      const loader = path.join(__dirname, "loader.js");
      const child = spawn(node, ["--disable-warning=ExperimentalWarning", loader], {
        cwd: __dirname,
        stdio: "inherit",
        env: process.env,
      });
      child.on("exit", (code) => process.exit(code != null ? code : 0));
      return;
    }
    setTimeout(wait, intervalMs);
  });
}

console.log("[wait-for-lavalink] Attendo Lavalink su " + host + " ...");
wait();
