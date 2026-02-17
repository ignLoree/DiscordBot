function parseFlexibleDuration(input) {
  const raw = String(input || "")
    .trim()
    .toLowerCase();
  if (!raw) return null;

  const compact = raw.replace(/\s+/g, "");
  const compactMatch = compact.match(/^(\d+)([a-z]+)$/i);
  if (compactMatch) {
    const value = Number(compactMatch[1]);
    const unit = normalizeUnit(compactMatch[2]);
    if (!Number.isFinite(value) || value <= 0 || !unit) return null;
    return value * unit;
  }

  const match = raw.match(/^(\d+)\s*([a-zàèéìòù.]+)$/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = normalizeUnit(match[2]);
  if (!Number.isFinite(value) || value <= 0 || !unit) return null;
  return value * unit;
}

function normalizeUnit(unitRaw) {
  const unit = String(unitRaw || "")
    .trim()
    .toLowerCase()
    .replace(/\./g, "");

  const secondAliases = new Set([
    "s",
    "sec",
    "secs",
    "second",
    "seconds",
    "secondo",
    "secondi",
  ]);
  const minuteAliases = new Set([
    "m",
    "min",
    "mins",
    "minute",
    "minutes",
    "minuto",
    "minuti",
  ]);
  const hourAliases = new Set([
    "h",
    "hr",
    "hrs",
    "hour",
    "hours",
    "ora",
    "ore",
  ]);
  const dayAliases = new Set(["d", "day", "days", "giorno", "giorni"]);
  const weekAliases = new Set([
    "w",
    "wk",
    "wks",
    "week",
    "weeks",
    "settimana",
    "settimane",
    "sett",
  ]);

  if (secondAliases.has(unit)) return 1000;
  if (minuteAliases.has(unit)) return 60 * 1000;
  if (hourAliases.has(unit)) return 60 * 60 * 1000;
  if (dayAliases.has(unit)) return 24 * 60 * 60 * 1000;
  if (weekAliases.has(unit)) return 7 * 24 * 60 * 60 * 1000;
  return null;
}

module.exports = {
  parseFlexibleDuration,
};
