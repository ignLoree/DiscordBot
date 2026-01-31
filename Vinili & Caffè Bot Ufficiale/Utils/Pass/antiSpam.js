async function isGoodMessage (content, minLen = 20) {
  if (!content) return false;
  const t = content.trim();
  if (t.length < minLen) return false;
  const uniqueChars = new Set(t.toLowerCase().replace(/\s+/g,'').split(''));
  if (uniqueChars.size <= 3) return false;
  return true;
}

module.exports = { isGoodMessage };