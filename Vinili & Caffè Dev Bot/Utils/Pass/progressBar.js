function progressBar(current, target, size = 10) {
  if (!Number.isFinite(target) || target <= 0) {
    return `${'-'.repeat(size)} ${current}/-`;
  }
  const ratio = Math.min(current / target, 1);
  const filled = Math.round(ratio * size);
  const empty = size - filled;
  return `${'#'.repeat(filled)}${'-'.repeat(empty)} ${current}/${target}`;
}

module.exports = { progressBar };