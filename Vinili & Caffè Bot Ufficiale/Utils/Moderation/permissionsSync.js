const fs = require('fs');
const path = require('path');
const { ApplicationCommandType } = require('discord.js');

const PERMISSIONS_PATH = path.join(process.cwd(), 'permissions.json');

function readPermissions() {
  try {
    if (!fs.existsSync(PERMISSIONS_PATH)) {
      return { slash: {}, prefix: {} };
    }
    const raw = fs.readFileSync(PERMISSIONS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      slash: parsed?.slash && typeof parsed.slash === 'object' ? parsed.slash : {},
      prefix: parsed?.prefix && typeof parsed.prefix === 'object' ? parsed.prefix : {}
    };
  } catch {
    return { slash: {}, prefix: {} };
  }
}

function writePermissions(data) {
  const normalized = {
    slash: sortObjectKeys(data?.slash || {}),
    prefix: sortObjectKeys(data?.prefix || {})
  };
  fs.writeFileSync(PERMISSIONS_PATH, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
}

function sortObjectKeys(obj) {
  return Object.keys(obj || {})
    .sort((a, b) => a.localeCompare(b, 'it'))
    .reduce((acc, key) => {
      const value = obj[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        acc[key] = sortNested(value);
      } else {
        acc[key] = value;
      }
      return acc;
    }, {});
}

function sortNested(obj) {
  const out = {};
  for (const key of Object.keys(obj).sort((a, b) => a.localeCompare(b, 'it'))) {
    const value = obj[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = sortNested(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function ensurePrefixEntries(prefixPerms, pcommands) {
  let changed = false;
  for (const command of pcommands.values()) {
    const name = String(command?.name || '').trim();
    if (!name) continue;
    if (!(name in prefixPerms)) {
      prefixPerms[name] = null;
      changed = true;
    }
  }
  return changed;
}

function ensureSlashEntries(slashPerms, commands) {
  let changed = false;
  const seen = new Set();

  for (const command of commands.values()) {
    const dataJson = command?.data?.toJSON?.();
    if (!dataJson?.name) continue;

    const commandType = dataJson.type || ApplicationCommandType.ChatInput;
    const uniqueKey = `${dataJson.name}:${commandType}`;
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);

    if (!(dataJson.name in slashPerms)) {
      slashPerms[dataJson.name] = null;
      changed = true;
    }

    if (commandType !== ApplicationCommandType.ChatInput) continue;
    const options = Array.isArray(dataJson.options) ? dataJson.options : [];
    const hasSubs = options.some((opt) => opt?.type === 1 || opt?.type === 2);
    if (!hasSubs) continue;

    const current = slashPerms[dataJson.name];
    if (!current || Array.isArray(current)) {
      slashPerms[dataJson.name] = {
        roles: Array.isArray(current) ? current : null,
        subcommands: {}
      };
      changed = true;
    } else {
      if (!Object.prototype.hasOwnProperty.call(current, 'roles')) {
        current.roles = null;
        changed = true;
      }
      if (!current.subcommands || typeof current.subcommands !== 'object') {
        current.subcommands = {};
        changed = true;
      }
    }

    const subcommands = slashPerms[dataJson.name].subcommands;
    for (const opt of options) {
      if (opt?.type === 1 && opt?.name) {
        if (!(opt.name in subcommands)) {
          subcommands[opt.name] = null;
          changed = true;
        }
      }
      if (opt?.type === 2 && opt?.name && Array.isArray(opt.options)) {
        for (const sub of opt.options) {
          if (sub?.type !== 1 || !sub?.name) continue;
          const key = `${opt.name}.${sub.name}`;
          if (!(key in subcommands)) {
            subcommands[key] = null;
            changed = true;
          }
        }
      }
    }
  }

  return changed;
}

function syncPermissionsFile({ pcommands, commands } = {}) {
  const data = readPermissions();
  let changed = false;

  if (pcommands?.size) {
    changed = ensurePrefixEntries(data.prefix, pcommands) || changed;
  }
  if (commands?.size) {
    changed = ensureSlashEntries(data.slash, commands) || changed;
  }

  if (changed) {
    writePermissions(data);
  }
  return changed;
}

module.exports = { syncPermissionsFile };
