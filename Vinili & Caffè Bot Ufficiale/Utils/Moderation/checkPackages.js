const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const { execSync } = require("child_process");

async function getFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const res = path.resolve(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules") {
        return getFiles(res);
      } else if (entry.isFile() && res.endsWith(".js")) {
        return res;
      }
      return [];
    }),
  );
  return files.flat();
}
async function extractRequiredPackages(file) {
  const content = await fs.readFile(file, "utf8");
  const requireRegex = /require\(['"`]([^'"`{}$\/\\]+)['"`]\)/g;
  return new Set(
    [...content.matchAll(requireRegex)]
      .map((match) => match[1])
      .filter((pkg) => !pkg.startsWith(".") && !pkg.startsWith("node:")),
  );
}
async function checkForOutdatedPackages(client) {
  try {
    client.logs.debug("Checking for outdated packages...");
    const outdated = execSync("npm outdated --json").toString();
    const outdatedPackages = JSON.parse(outdated);
    if (Object.keys(outdatedPackages).length > 0) {
      client.logs.warn("Some packages are outdated:");
      for (const [pkg, info] of Object.entries(outdatedPackages)) {
        client.logs.warn(
          `${pkg}: current: ${info.current}, latest: ${info.latest}`,
        );
      }
      client.logs.warn("Consider updating these packages.");
    } else {
      client.logs.success("All packages are up-to-date.");
    }
  } catch (err) {
    if (err.status === 1) {
      client.logs.success("All packages are up-to-date.");
    } else {
      client.logs.error(`Error checking outdated packages: ${err.message}`);
    }
  }
}
async function checkNodeVersion(client) {
  try {
    const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
    const requiredNodeVersion = String(packageJson.engines?.node || "").trim();
    const currentVersion = String(process.version || "").trim();
    if (!requiredNodeVersion) {
      client.logs.success("Node.js version is compatible.");
      return;
    }

    const normalize = (value) =>
      String(value || "")
        .trim()
        .replace(/^v/i, "");
    const parse = (value) =>
      normalize(value)
        .split(".")
        .map((part) => Number(part || 0));
    const compare = (a, b) => {
      for (let i = 0; i < 3; i += 1) {
        const diff = (a[i] || 0) - (b[i] || 0);
        if (diff !== 0) return diff;
      }
      return 0;
    };

    const currentParts = parse(currentVersion);
    let isCompatible = true;

    const rangeMatch = requiredNodeVersion.match(
      /^(>=|<=|>|<|=)?\s*v?(\d+(?:\.\d+){0,2})$/,
    );
    if (rangeMatch) {
      const op = rangeMatch[1] || "=";
      const requiredParts = parse(rangeMatch[2]);
      const cmp = compare(currentParts, requiredParts);
      if (op === ">=") isCompatible = cmp >= 0;
      else if (op === "<=") isCompatible = cmp <= 0;
      else if (op === ">") isCompatible = cmp > 0;
      else if (op === "<") isCompatible = cmp < 0;
      else isCompatible = cmp === 0;
    } else {
      isCompatible =
        normalize(currentVersion) === normalize(requiredNodeVersion);
    }

    if (!isCompatible) {
      client.logs.warn(
        `Warning: Node.js version mismatch. Required: ${requiredNodeVersion}, Current: ${currentVersion}`,
      );
      return;
    }
    client.logs.success("Node.js version is compatible.");
  } catch (err) {
    client.logs.error(`Error checking Node.js version: ${err.message}`);
  }
}
async function checkAndInstallPackages(
  client,
  ignorePackages = ["@discordjs/builders"],
) {
  try {
    const files = await getFiles(process.cwd());
    const requiredPackages = new Set();
    for (const file of files) {
      const packages = await extractRequiredPackages(file);
      packages.forEach((pkg) => requiredPackages.add(pkg));
    }
    const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
    const installedPackages = new Set([
      ...Object.keys(packageJson.dependencies || {}),
      ...Object.keys(packageJson.devDependencies || {}),
    ]);
    const missingPackages = [...requiredPackages].filter((pkg) => {
      if (ignorePackages.includes(pkg)) return false;
      if (installedPackages.has(pkg)) return false;
      const modulePath = path.join("node_modules", ...pkg.split("/"));
      return !fsSync.existsSync(modulePath);
    });
    if (missingPackages.length > 0) {
      client.logs.error(
        `Missing packages detected: ${missingPackages.join(", ")}`,
      );
      const allowAutoInstall = false;
      if (!allowAutoInstall) {
        client.logs.warn(
          "Auto install disabled (set AUTO_INSTALL_MISSING_PACKAGES=1 to enable).",
        );
      } else {
        for (const pkg of missingPackages) {
          try {
            client.logs.debug(`Installing ${pkg}...`);
            execSync(`npm install ${pkg}`, { stdio: "inherit" });
            client.logs.success(`${pkg} installed successfully.`);
          } catch (err) {
            client.logs.error(`Failed to install ${pkg}: ${err.message}`);
          }
        }
      }
    } else {
      client.logs.success("All required packages are installed.");
    }
    await checkForOutdatedPackages(client);
    await checkNodeVersion(client);
  } catch (err) {
    client.logs.error(`Error during package check: ${err.message}`);
  }
}

module.exports = { checkAndInstallPackages };
