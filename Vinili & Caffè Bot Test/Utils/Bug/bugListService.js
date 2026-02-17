
const fs = require('fs');
const path = require('path');

const BUG_FILE = path.join(__dirname, '..', '..', 'bug-list.json');
const BUG_CHANNEL_ID = '1472009888417845330';

const STATUS_EMOJI = {
  online: '<:VC_OnlineStatus:1472011187569950751>',
  inattivo: '<:VC_InactiveStatus:1472011031709745307>',
  pausa: '<:VC_PausedStatus:1472011236613816353>',
  offline: '<:VC_OfflineStatus:1472011150081130751>'
};

const STATUS_ORDER = ['online', 'inattivo', 'pausa', 'offline'];
let mutationQueue = Promise.resolve();

function load() {
  try {
    const raw = fs.readFileSync(BUG_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.items) ? data : { items: [], messageId: data.messageId || null };
  } catch {
    return { items: [], messageId: null };
  }
}

function save(data) {
  const dir = path.dirname(BUG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${BUG_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ items: data.items, messageId: data.messageId }, null, 2), 'utf8');
  fs.renameSync(tmp, BUG_FILE);
}

function enqueueMutation(task) {
  mutationQueue = mutationQueue.then(task, task);
  return mutationQueue;
}

function normalizeStatus(s) {
  const t = String(s || '').toLowerCase().trim();
  return STATUS_ORDER.includes(t) ? t : null;
}

function sortByImportance(items) {
  return [...items].sort((a, b) => {
    const i = STATUS_ORDER.indexOf(a.status);
    const j = STATUS_ORDER.indexOf(b.status);
    if (i !== j) return i - j;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

async function addItem(text, status) {
  return enqueueMutation(async () => {
    const data = load();
    const normalized = normalizeStatus(status);
    if (!normalized) return { ok: false, error: 'status_invalid' };
    const trimmed = String(text || '').trim();
    if (!trimmed) return { ok: false, error: 'task_empty' };
    data.items.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      text: trimmed,
      status: normalized,
      test: false,
      createdAt: Date.now()
    });
    save(data);
    return { ok: true, data };
  });
}

async function removeItem(taskText) {
  return enqueueMutation(async () => {
    const data = load();
    const query = String(taskText || '').trim().toLowerCase();
    if (!query) return { ok: false, error: 'task_empty' };
    const idx = data.items.findIndex((item) => item.text.toLowerCase().includes(query) || query.includes(item.text.toLowerCase()));
    if (idx === -1) return { ok: false, error: 'not_found' };
    data.items.splice(idx, 1);
    save(data);
    return { ok: true, data };
  });
}

async function setItemTest(taskText, test) {
  return enqueueMutation(async () => {
    const data = load();
    const query = String(taskText || '').trim().toLowerCase();
    if (!query) return { ok: false, error: 'task_empty' };
    const item = data.items.find((item) => item.text.toLowerCase().includes(query) || query.includes(item.text.toLowerCase()));
    if (!item) return { ok: false, error: 'not_found' };
    item.test = Boolean(test);
    item.status = 'online';
    save(data);
    return { ok: true, data };
  });
}

async function setItemStatus(taskText, status) {
  return enqueueMutation(async () => {
    const data = load();
    const normalized = normalizeStatus(status);
    if (!normalized) return { ok: false, error: 'status_invalid' };
    const query = String(taskText || '').trim().toLowerCase();
    if (!query) return { ok: false, error: 'task_empty' };
    const item = data.items.find((item) => item.text.toLowerCase().includes(query) || query.includes(item.text.toLowerCase()));
    if (!item) return { ok: false, error: 'not_found' };
    item.status = normalized;
    save(data);
    return { ok: true, data };
  });
}

function buildListContent(data) {
  const sorted = sortByImportance(data.items);
  if (sorted.length === 0) return '*(nessun bug segnalato)*';
  const lines = sorted.map((item) => {
    const emoji = STATUS_EMOJI[item.status] || STATUS_EMOJI.offline;
    const label = item.test ? `**[TEST]** ${item.text}` : item.text;
    return `${emoji} ${label}`;
  });
  return lines.join('\n');
}

async function refreshBugMessage(client) {
  const data = load();
  const channel = client.channels?.cache?.get(BUG_CHANNEL_ID) || await client.channels?.fetch(BUG_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) return null;
  const content = buildListContent(data);
  const title = '**🐛 Lista Bug** (ordine per gravità)';
  const fullContent = `${title}\n\n${content}`;
  let msg = null;
  if (data.messageId) {
    try {
      msg = await channel.messages.fetch(data.messageId);
      await msg.edit(fullContent);
      return msg;
    } catch {
      data.messageId = null;
      save(data);
    }
  }
  msg = await channel.send(fullContent).catch(() => null);
  if (msg) {
    data.messageId = msg.id;
    save(data);
  }
  return msg;
}

module.exports = {
  BUG_CHANNEL_ID,
  load,
  addItem,
  removeItem,
  setItemTest,
  setItemStatus,
  buildListContent,
  refreshBugMessage,
  STATUS_EMOJI,
  STATUS_ORDER,
  normalizeStatus
};
