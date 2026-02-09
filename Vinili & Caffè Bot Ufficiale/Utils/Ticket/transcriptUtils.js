const fs = require('fs');
const path = require('path');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(timestamp) {
  try {
    return new Date(timestamp).toLocaleString('it-IT');
  } catch {
    return String(timestamp || '');
  }
}

function messageContentToHtml(message) {
  let body = '';
  if (message.content) {
    body += `<div class="content">${escapeHtml(message.content).replace(/\n/g, '<br>')}</div>`;
  }

  if (Array.isArray(message.embeds) && message.embeds.length > 0) {
    for (const embed of message.embeds) {
      const fieldsHtml = Array.isArray(embed.fields) && embed.fields.length > 0
        ? `<div class="embed-fields">${embed.fields.map((field) => `<div class="embed-field"><div class="embed-field-name">${escapeHtml(field.name)}</div><div class="embed-field-value">${escapeHtml(field.value)}</div></div>`).join('')}</div>`
        : '';

      body += `
        <div class="embed">
          ${embed.title ? `<div class="embed-title">${escapeHtml(embed.title)}</div>` : ''}
          ${embed.description ? `<div class="embed-description">${escapeHtml(embed.description).replace(/\n/g, '<br>')}</div>` : ''}
          ${fieldsHtml}
        </div>
      `;
    }
  }

  if (message.attachments?.size > 0) {
    const attachmentItems = Array.from(message.attachments.values())
      .map((attachment) => `<li><a href="${escapeHtml(attachment.url)}" target="_blank" rel="noreferrer">${escapeHtml(attachment.name || attachment.url)}</a></li>`)
      .join('');
    body += `<ul class="attachments">${attachmentItems}</ul>`;
  }

  if (!body) {
    body = '<div class="content muted">*No message content*</div>';
  }

  return body;
}

async function fetchAllMessages(channel, maxMessages = 2000) {
  const results = [];
  let beforeId = null;

  while (results.length < maxMessages) {
    const chunk = await channel.messages.fetch({ limit: 100, ...(beforeId ? { before: beforeId } : {}) }).catch(() => null);
    if (!chunk || chunk.size === 0) break;

    const list = Array.from(chunk.values());
    results.push(...list);

    if (chunk.size < 100) break;
    beforeId = list[list.length - 1]?.id;
    if (!beforeId) break;
  }

  return results.sort((a, b) => a.createdTimestamp - b.createdTimestamp).slice(0, maxMessages);
}

async function createTranscript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  let txt = `Transcript of: ${channel.name}\n\n`;
  sorted.forEach((msg) => {
    let content = msg.content || '';
    if (msg.embeds.length > 0) {
      msg.embeds.forEach((embed, i) => {
        content += `\n[Embed ${i + 1}]\n`;
        if (embed.title) content += `Title: ${embed.title}\n`;
        if (embed.description) content += `Description: ${embed.description}\n`;
        if (embed.fields) {
          embed.fields.forEach((f) => {
            content += `${f.name}: ${f.value}\n`;
          });
        }
      });
    }
    if (msg.attachments.size > 0) {
      msg.attachments.forEach((att) => {
        content += `\n[Attachment] ${att.url}`;
      });
    }
    if (!content) content = '*No message content*';
    txt += `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author.tag}: ${content}\n\n`;
  });
  return txt;
}

async function createTranscriptHtml(channel) {
  const messages = await fetchAllMessages(channel);
  const guildName = escapeHtml(channel.guild?.name || 'Server');
  const channelName = escapeHtml(channel.name || 'ticket');

  const rows = messages.map((message) => {
    const avatar = message.author?.displayAvatarURL?.({ extension: 'png', size: 64 }) || '';
    const author = escapeHtml(message.author?.tag || 'Unknown User');
    const time = escapeHtml(formatDate(message.createdTimestamp));
    const messageBody = messageContentToHtml(message);

    return `
      <article class="msg">
        <img class="avatar" src="${escapeHtml(avatar)}" alt="avatar">
        <div class="right">
          <div class="meta"><span class="author">${author}</span><span class="time">${time}</span></div>
          ${messageBody}
        </div>
      </article>
    `;
  }).join('');

  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Transcript #${channelName}</title>
  <style>
    :root {
      --bg: #313338;
      --surface: #2b2d31;
      --surface-soft: #232428;
      --text: #dbdee1;
      --muted: #949ba4;
      --accent: #5865f2;
      --embed-border: #00a8fc;
      --line: #1e1f22;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "gg sans", "Noto Sans", "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    .wrap {
      max-width: 1100px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 14px;
    }
    .title { font-size: 20px; font-weight: 700; margin: 0 0 6px; }
    .sub { color: var(--muted); font-size: 13px; }
    .timeline {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
    }
    .msg {
      display: grid;
      grid-template-columns: 44px 1fr;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
    }
    .msg:last-child { border-bottom: 0; }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #1a1b1e;
      object-fit: cover;
    }
    .meta { display: flex; gap: 10px; align-items: baseline; margin-bottom: 4px; }
    .author { font-weight: 600; color: #f2f3f5; }
    .time { color: var(--muted); font-size: 12px; }
    .content { white-space: normal; line-height: 1.45; }
    .muted { color: var(--muted); }
    .embed {
      margin-top: 8px;
      border-left: 4px solid var(--embed-border);
      background: var(--surface-soft);
      border-radius: 6px;
      padding: 10px 12px;
    }
    .embed-title { font-weight: 700; margin-bottom: 4px; }
    .embed-description { color: #e3e5e8; }
    .embed-fields { margin-top: 8px; display: grid; gap: 8px; }
    .embed-field-name { font-weight: 700; font-size: 12px; color: #f2f3f5; }
    .embed-field-value { color: #dbdee1; font-size: 13px; }
    .attachments { margin: 8px 0 0; padding-left: 16px; }
    .attachments a { color: #9ecbff; text-decoration: none; }
    .attachments a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="header">
      <h1 class="title">#${channelName}</h1>
      <div class="sub">Server: ${guildName} • Transcript esportato</div>
    </section>
    <section class="timeline">
      ${rows || '<article class="msg"><div></div><div class="muted">Nessun messaggio nel ticket.</div></article>'}
    </section>
  </main>
</body>
</html>`;
}

async function saveTranscriptHtml(channel, html) {
  const basePath = path.join(process.cwd(), 'local_transcripts', String(channel.guild?.id || 'global'));
  fs.mkdirSync(basePath, { recursive: true });
  const filename = `transcript_${channel.id}_${Date.now()}.html`;
  const filepath = path.join(basePath, filename);
  fs.writeFileSync(filepath, html, 'utf8');
  return filepath;
}

module.exports = {
  createTranscript,
  createTranscriptHtml,
  saveTranscriptHtml
};
