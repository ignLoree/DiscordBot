function sanitizeTicketChannelTail(rawValue, fallback = "utente", maxLength = 32) {
  const safe = String(rawValue || fallback)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[\/\\#@:`*?"<>|]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .replace(/[^\p{L}\p{N}._-]/gu, "")
    .slice(0, maxLength);
  return safe || fallback;
}

function buildTicketChannelName(panelConfig, rawValue, fallbackValue = "utente") {
  const safeTail = sanitizeTicketChannelTail(rawValue, fallbackValue);
  return `༄${String(panelConfig?.emoji || "")}︲${String(panelConfig?.name || "supporto")}᲼${safeTail}`.slice(0, 100);
}

function resolveTicketRenamePrefix(currentName, ticketDoc, fallbackPanelConfig = null) {
  const current = String(currentName || "");
  const unicodeSeparatorIndex = current.lastIndexOf("᲼");
  if (unicodeSeparatorIndex !== -1) return current.slice(0, unicodeSeparatorIndex + 1);

  const hyphenIndex = current.lastIndexOf("-");
  if (hyphenIndex !== -1) return current.slice(0, hyphenIndex + 1);

  const panelConfig = fallbackPanelConfig || ticketDoc;
  if (panelConfig) {
    return `༄${String(panelConfig.emoji || "")}︲${String(panelConfig.name || "supporto")}᲼`;
  }
  return null;
}

module.exports = {
  buildTicketChannelName,
  resolveTicketRenamePrefix,
  sanitizeTicketChannelTail,
};