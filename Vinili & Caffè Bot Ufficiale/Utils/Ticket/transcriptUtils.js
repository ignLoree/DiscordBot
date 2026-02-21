const fs = require("fs");
const path = require("path");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(timestamp) {
  try {
    const value = new Date(timestamp);
    if (Number.isNaN(value.getTime())) return String(timestamp || "");
    return value.toLocaleString("it-IT");
  } catch {
    return String(timestamp || "");
  }
}

const RICH_TOKEN_REGEX =
  /<a?:([a-zA-Z0-9_]+):(\d{17,20})>|<@!?(\d{17,20})>|<@&(\d{17,20})>|<#(\d{17,20})>/g;

function getUserMentionLabel(message, userId) {
  const member =
    message.guild?.members?.cache?.get(userId) ||
    message.mentions?.members?.get?.(userId);
  if (member?.displayName) return `@${member.displayName}`;

  const user =
    message.client?.users?.cache?.get(userId) ||
    message.mentions?.users?.get?.(userId);
  if (user?.username) return `@${user.username}`;

  return `@user-${userId}`;
}

function getRoleMentionLabel(message, roleId) {
  const role =
    message.guild?.roles?.cache?.get(roleId) ||
    message.mentions?.roles?.get?.(roleId);
  if (role?.name) return `@${role.name}`;
  return `@role-${roleId}`;
}

function getChannelMentionLabel(message, channelId) {
  const channel =
    message.guild?.channels?.cache?.get(channelId) ||
    message.mentions?.channels?.get?.(channelId);
  if (channel?.name) return `#${channel.name}`;
  return `#channel-${channelId}`;
}

function renderRichTextHtml(message, text) {
  const input = String(text || "");
  let out = "";
  let last = 0;
  const regex = new RegExp(RICH_TOKEN_REGEX.source, "g");
  let match;

  while ((match = regex.exec(input)) !== null) {
    out += escapeHtml(input.slice(last, match.index));

    const full = match[0];
    const emojiName = match[1];
    const emojiId = match[2];
    const userId = match[3];
    const roleId = match[4];
    const channelId = match[5];

    if (emojiId) {
      const animated = full.startsWith("<a:");
      const ext = animated ? "gif" : "png";
      const url = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=64&quality=lossless`;
      out += `<img class="custom-emoji" src="${escapeHtml(url)}" alt="${escapeHtml(`:${emojiName}:`)}" title="${escapeHtml(`:${emojiName}:`)}" loading="lazy">`;
    } else if (userId) {
      out += `<span class="mention mention-user">${escapeHtml(getUserMentionLabel(message, userId))}</span>`;
    } else if (roleId) {
      out += `<span class="mention mention-role">${escapeHtml(getRoleMentionLabel(message, roleId))}</span>`;
    } else if (channelId) {
      out += `<span class="mention mention-channel">${escapeHtml(getChannelMentionLabel(message, channelId))}</span>`;
    } else {
      out += escapeHtml(full);
    }

    last = regex.lastIndex;
  }

  out += escapeHtml(input.slice(last));
  return out.replace(/\n/g, "<br>");
}

function renderRichTextPlain(message, text) {
  return String(text || "").replace(
    RICH_TOKEN_REGEX,
    (full, emojiName, emojiId, userId, roleId, channelId) => {
      if (emojiId) return `:${emojiName}:`;
      if (userId) return getUserMentionLabel(message, userId);
      if (roleId) return getRoleMentionLabel(message, roleId);
      if (channelId) return getChannelMentionLabel(message, channelId);
      return full;
    },
  );
}

function messageContentToHtml(message) {
  let body = "";
  if (message.content) {
    body += `<div class="content">${renderRichTextHtml(message, message.content)}</div>`;
  }

  if (Array.isArray(message.embeds) && message.embeds.length > 0) {
    for (const embed of message.embeds) {
      const fieldsHtml =
        Array.isArray(embed.fields) && embed.fields.length > 0
          ? `<div class="embed-fields">${embed.fields.map((field) => `<div class="embed-field"><div class="embed-field-name">${renderRichTextHtml(message, field.name)}</div><div class="embed-field-value">${renderRichTextHtml(message, field.value)}</div></div>`).join("")}</div>`
          : "";

      body += `
        <div class="embed">
          ${embed.title ? `<div class="embed-title">${renderRichTextHtml(message, embed.title)}</div>` : ""}
          ${embed.description ? `<div class="embed-description">${renderRichTextHtml(message, embed.description)}</div>` : ""}
          ${fieldsHtml}
        </div>
      `;
    }
  }

  if (message.attachments?.size > 0) {
    const attachmentItems = Array.from(message.attachments.values())
      .map(
        (attachment) =>
          `<li><a href="${escapeHtml(attachment.url)}" target="_blank" rel="noreferrer">${escapeHtml(attachment.name || attachment.url)}</a></li>`,
      )
      .join("");
    body += `<ul class="attachments">${attachmentItems}</ul>`;
  }

  if (!body) {
    body = '<div class="content muted">*Nessun contenuto messaggio*</div>';
  }

  return body;
}

async function fetchAllMessages(channel, maxMessages = 2000) {
  const results = [];
  let beforeId = null;

  while (results.length < maxMessages) {
    const chunk = await channel.messages
      .fetch({ limit: 100, ...(beforeId ? { before: beforeId } : {}) })
      .catch(() => null);
    if (!chunk || chunk.size === 0) break;

    const list = Array.from(chunk.values());
    results.push(...list);

    if (chunk.size < 100) break;
    beforeId = list[list.length - 1]?.id;
    if (!beforeId) break;
  }

  return results
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .slice(0, maxMessages);
}

async function createTranscript(channel) {
  const sorted = await fetchAllMessages(channel);
  let txt = `Transcript del canale: ${channel.name}\n\n`;
  sorted.forEach((msg) => {
    let content = renderRichTextPlain(msg, msg.content || "");
    if (msg.embeds.length > 0) {
      msg.embeds.forEach((embed, i) => {
        content += `\n[Embed ${i + 1}]\n`;
        if (embed.title)
          content += `Titolo: ${renderRichTextPlain(msg, embed.title)}\n`;
        if (embed.description)
          content += `Descrizione: ${renderRichTextPlain(msg, embed.description)}\n`;
        if (embed.fields) {
          embed.fields.forEach((f) => {
            content += `${renderRichTextPlain(msg, f.name)}: ${renderRichTextPlain(msg, f.value)}\n`;
          });
        }
      });
    }
    if (msg.attachments.size > 0) {
      msg.attachments.forEach((att) => {
        content += `\n[Attachment] ${att.url}`;
      });
    }
    if (!content) content = "*Nessun contenuto messaggio*";
    txt += `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author.tag}: ${content}\n\n`;
  });
  return txt;
}

async function createTranscriptHtml(channel) {
  const messages = await fetchAllMessages(channel);
  const guildName = escapeHtml(channel.guild?.name || "Server");
  const channelName = escapeHtml(channel.name || "ticket");

  const rows = messages
    .map((message) => {
      const avatar =
        message.author?.displayAvatarURL?.({ extension: "png", size: 64 }) ||
        "";
      const author = escapeHtml(message.author?.tag || "Utente sconosciuto");
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
    })
    .join("");

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
    .custom-emoji {
      width: 22px;
      height: 22px;
      object-fit: contain;
      vertical-align: text-bottom;
    }
    .mention {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 0.95em;
    }
    .mention-user,
    .mention-role,
    .mention-channel {
      background: rgba(88, 101, 242, 0.25);
      color: #c9cdfb;
    }
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
  const basePath = path.join(
    process.cwd(),
    "local_transcripts",
    String(channel.guild?.id || "global"),
  );
  fs.mkdirSync(basePath, { recursive: true });
  const filename = `transcript_${channel.id}_${Date.now()}.html`;
  const filepath = path.join(basePath, filename);
  fs.writeFileSync(filepath, html, "utf8");
  return filepath;
}

module.exports = {
  createTranscript,
  createTranscriptHtml,
  saveTranscriptHtml,
};
