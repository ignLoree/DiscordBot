const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");

const CACHE_DIR = path.join(__dirname, "..", "..", "UI", "RoleIcons");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function generateIconHash(url) {
  return crypto.createHash("md5").update(url).digest("hex");
}

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;

    client
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      })
      .on("error", reject);
  });
}

async function cacheRoleIcon(iconUrl) {
  if (!iconUrl) return null;

  try {
    const hash = generateIconHash(iconUrl);
    const ext = path.extname(new URL(iconUrl).pathname) || ".png";
    const filename = `${hash}${ext}`;
    const filepath = path.join(CACHE_DIR, filename);

    if (fs.existsSync(filepath)) {
      return filepath;
    }

    const imageBuffer = await downloadImage(iconUrl);
    fs.writeFileSync(filepath, imageBuffer);

    return filepath;
  } catch (error) {
    global.logger?.error?.("[ROLE_ICON_CACHE] Failed to cache icon:", error);
    return iconUrl;
  }
}

function cleanOldIcons(maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    const now = Date.now();

    for (const file of files) {
      const filepath = path.join(CACHE_DIR, file);
      const stats = fs.statSync(filepath);

      if (now - stats.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filepath);
      }
    }
  } catch (error) {
    global.logger?.error?.(
      "[ROLE_ICON_CACHE] Failed to clean old icons:",
      error,
    );
  }
}

setInterval(() => cleanOldIcons(), 24 * 60 * 60 * 1000);

module.exports = {
  cacheRoleIcon,
  cleanOldIcons,
};
