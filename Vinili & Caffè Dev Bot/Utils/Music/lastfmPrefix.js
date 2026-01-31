function extractTargetUser(message, args) {
  const mention = message.mentions.users.first();
  const filtered = args.filter(arg => !/^<@!?\\d+>$/.test(arg));
  return {
    target: mention || message.author,
    args: filtered
  };
}
function extractTargetUserWithLastfm(message, args) {
  const mention = message.mentions.users.first();
  let lastfm = null;
  const filtered = [];
  for (const arg of args) {
    if (/^<@!?\d+>$/.test(arg)) continue;
    if (arg.toLowerCase().startsWith("lfm:")) {
      const value = arg.slice(4).trim();
      if (value) lastfm = value;
      continue;
    }
    filtered.push(arg);
  }
  return {
    target: mention || message.author,
    args: filtered,
    lastfm
  };
}
function splitArtistTitle(query) {
  if (!query) return { artist: null, title: null };
  const pipeIndex = query.indexOf("|");
  if (pipeIndex !== -1) {
    return {
      artist: query.slice(0, pipeIndex).trim() || null,
      title: query.slice(pipeIndex + 1).trim() || null
    };
  }
  const dashIndex = query.indexOf(" - ");
  if (dashIndex !== -1) {
    return {
      artist: query.slice(0, dashIndex).trim() || null,
      title: query.slice(dashIndex + 3).trim() || null
    };
  }
  return { artist: null, title: query.trim() || null };
}
function extractPeriod(arg) {
  const mapping = {
    "7day": "7day",
    "1month": "1month",
    "3month": "3month",
    "6month": "6month",
    "12month": "12month",
    "overall": "overall",
    "week": "7day",
    "month": "1month",
    "quarter": "3month",
    "half": "6month",
    "year": "12month",
    "all": "overall"
  };
  if (!arg) return "7day";
  const key = arg.toLowerCase();
  return mapping[key] || "7day";
}
function extractPagination(args, options = {}) {
  const defaultLimit = Number(options.defaultLimit || 10);
  const maxLimit = Number(options.maxLimit || 50);
  let limit = defaultLimit;
  let page = 1;
  const filtered = [];
  for (const arg of args) {
    const token = arg.toLowerCase();
    const pageMatch = token.match(/^(page|p)[:=](\d+)$/i);
    if (pageMatch) {
      page = Math.max(1, Number(pageMatch[2]));
      continue;
    }
    const limitMatch = token.match(/^(limit|l)[:=](\d+)$/i);
    if (limitMatch) {
      limit = Math.max(1, Math.min(maxLimit, Number(limitMatch[2])));
      continue;
    }
    filtered.push(arg);
  }
  return { limit, page, args: filtered };
}

module.exports = { extractTargetUser, extractTargetUserWithLastfm, splitArtistTitle, extractPeriod, extractPagination };