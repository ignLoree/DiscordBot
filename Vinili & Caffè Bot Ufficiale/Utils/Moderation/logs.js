const { inspect } = require("node:util");

const color = {
  red: "\x1b[31m",
  orange: "\x1b[38;5;202m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  pink: "\x1b[38;5;213m",
  torquise: "\x1b[38;5;45m",
  purple: "\x1b[38;5;57m",
  reset: "\x1b[0m",
};
const ERROR_BUFFER_MAX = 300;
const errorBuffer = [];
const CONSOLE_BUFFER_MAX = 1200;
const consoleBuffer = [];

function normalizeToText(message) {
  if (typeof message === "string") return message;
  try {
    return inspect(message, { depth: 3, colors: false });
  } catch {
    return String(message);
  }
}

function pushConsole(level, message) {
  try {
    consoleBuffer.unshift({
      at: Date.now(),
      level: String(level || "info"),
      message: normalizeToText(message),
    });
    if (consoleBuffer.length > CONSOLE_BUFFER_MAX) {
      consoleBuffer.length = CONSOLE_BUFFER_MAX;
    }
  } catch {}
}

function getTimestamp() {
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function write(message = "", prefix = "", colors = true) {
  if (typeof message === "string") {
    const lines = message.split("\n");
    const isMultiline = lines.length > 1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!isMultiline && i === 0) {
        console.log(prefix + line);
      } else {
        console.log(line);
      }
    }
    return;
  }
  const properties = inspect(message, {
    depth: 3,
    colors: Boolean(colors && typeof message !== "string"),
  });
  const regex = /^\s*["'`](.*)["'`]\s*\+?$/gm;
  const lines = properties.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(regex, "$1");
    if (i === 0) {
      console.log(prefix + line);
    } else {
      console.log(line);
    }
  }
}
function info(message) {
  pushConsole("info", message);
  return write(message, `${color.yellow}[${getTimestamp()}]${color.reset} `);
}
function warn(message) {
  pushConsole("warn", message);
  return write(message, `${color.orange}[${getTimestamp()}]${color.reset} `);
}
function error(message) {
  pushConsole("error", message);
  try {
    errorBuffer.unshift({
      at: Date.now(),
      message: typeof message === "string" ? message : inspect(message, { depth: 3, colors: false }),
    });
    if (errorBuffer.length > ERROR_BUFFER_MAX) errorBuffer.length = ERROR_BUFFER_MAX;
  } catch {}
  return write(message, `${color.red}[${getTimestamp()}] `, false);
}
function success(message) {
  pushConsole("success", message);
  return write(message, `${color.green}[${getTimestamp()}]${color.reset} `);
}
function debug(message) {
  pushConsole("debug", message);
  return write(message, `${color.blue}[${getTimestamp()}]${color.reset} `);
}
function logging(message) {
  pushConsole("logging", message);
  return write(message, `${color.pink}[${getTimestamp()}]${color.reset} `);
}
function torquise(message) {
  pushConsole("torquise", message);
  return write(message, `${color.torquise}[${getTimestamp()}]${color.reset} `);
}
function purple(message) {
  pushConsole("purple", message);
  return write(message, `${color.purple}[${getTimestamp()}]${color.reset} `);
}

function getRecentErrors(limit = 80) {
  const safe = Math.max(1, Math.min(300, Number(limit || 80)));
  return errorBuffer.slice(0, safe);
}

function getRecentConsole(limit = 250) {
  const safe = Math.max(1, Math.min(CONSOLE_BUFFER_MAX, Number(limit || 250)));
  return consoleBuffer.slice(0, safe);
}

module.exports = {
  getTimestamp,
  write,
  info,
  warn,
  error,
  success,
  debug,
  logging,
  torquise,
  purple,
  getRecentErrors,
  getRecentConsole,
  color,
};