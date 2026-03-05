function splitMessage(text, max = 1900) {
  const chunks = [];
  let current = "";
  for (const line of String(text || "").split("\n")) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > max) {
      if (current) chunks.push(current);
      if (line.length > max) {
        for (let i = 0; i < line.length; i += max) {
          chunks.push(line.slice(i, i + max));
        }
        current = "";
      } else {
        current = line;
      }
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [""];
}

function chunkLines(lines, maxLen = 1800) {
  const chunks = [];
  let current = "";
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLen) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [""];
}

module.exports = { splitMessage, chunkLines };
