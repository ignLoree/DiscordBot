function startOfToday () {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
}
function isSameDay (a, b) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

module.exports = { startOfToday,isSameDay };