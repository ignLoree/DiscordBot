const fs = require('fs');
const path = require('path');
const { GameState } = require('../../Schemas/Pass/gameState');
let cachedLocal = null;

function loadLocalMinigames() {
  if (cachedLocal) return cachedLocal;
  const filePath = path.join(__dirname, '..', 'Data', 'minigames.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  cachedLocal = JSON.parse(raw);
  return cachedLocal;
}

function normalizeDifficulty(diff) {
  if (!diff) return 'easy';
  const v = diff.toLowerCase();
  if (['easy', 'medium', 'hard'].includes(v)) return v;
  return 'easy';
}

async function getGameState(guildId, seasonId) {
  return GameState.findOneAndUpdate(
    { guildId, seasonId },
    { $setOnInsert: { guildId, seasonId } },
    { upsert: true, new: true }
  );
}

async function getMinigame({ guildId, seasonId, difficulty, type }) {
  const diff = normalizeDifficulty(difficulty);
  const all = loadLocalMinigames().filter(m => m.difficulty === diff);
  const filtered = type ? all.filter(m => m.type === type) : all;
  if (!filtered.length) return null;
  const state = await getGameState(guildId, seasonId);
  const used = new Set(state.usedMinigameIds || []);
  let available = filtered.filter(m => !used.has(m.id));
  if (available.length === 0) {
    state.usedMinigameIds = state.usedMinigameIds.filter(id => !filtered.some(m => m.id === id));
    await state.save();
    available = filtered;
  }
  const selected = available[Math.floor(Math.random() * available.length)];
  state.usedMinigameIds.push(selected.id);
  await state.save();
  return {
    id: selected.id,
    type: selected.type,
    difficulty: selected.difficulty,
    title: selected.title,
    description: selected.description,
    prompt: selected.prompt,
    options: selected.options,
    answerIndex: selected.answerIndex
  };
}

module.exports = { getMinigame };