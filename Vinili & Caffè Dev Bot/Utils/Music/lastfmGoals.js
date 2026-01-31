const MILESTONES = [1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2000000];

function parseGoalAmount(input) {
  if (!input) return null;
  const raw = String(input).toLowerCase().trim();
  const match = raw.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  if (match[2] === "k") return Math.round(value * 1000);
  if (match[2] === "m") return Math.round(value * 1000000);
  return Math.round(value);
}
function getNextMilestone(total) {
  for (const milestone of MILESTONES) {
    if (total < milestone) return milestone;
  }
  return total + 1000000;
}

module.exports = { parseGoalAmount, getNextMilestone, MILESTONES };