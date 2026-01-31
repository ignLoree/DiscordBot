const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { GameState } = require('../../Schemas/Pass/gameState');
const CONFIG = require('../../config');
let cachedLocal = null;

function loadLocalQuizzes() {
  if (cachedLocal) return cachedLocal;
  const filePath = path.join(__dirname, '..', 'Data', 'quizzes.json');
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

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function decodeEntities(text) {
  if (!text) return text;
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&uuml;/g, 'u')
    .replace(/&ouml;/g, 'o')
    .replace(/&auml;/g, 'a')
    .replace(/&eacute;/g, 'e')
    .replace(/&egrave;/g, 'e');
}

function hashQuestion(q) {
  return Buffer.from(q).toString('base64');
}

async function getGameState(guildId, seasonId) {
  return GameState.findOneAndUpdate(
    { guildId, seasonId },
    { $setOnInsert: { guildId, seasonId } },
    { upsert: true, new: true }
  );
}

async function pickLocalQuestion({ guildId, seasonId, difficulty }) {
  const questions = loadLocalQuizzes().filter(q => q.difficulty === difficulty);
  if (!questions.length) return null;
  const state = await getGameState(guildId, seasonId);
  const used = new Set(state.usedQuizIds || []);
  let available = questions.filter(q => !used.has(q.id));
  if (available.length === 0) {
    state.usedQuizIds = [];
    await state.save();
    available = questions;
  }
  const selected = available[Math.floor(Math.random() * available.length)];
  state.usedQuizIds.push(selected.id);
  await state.save();
  return {
    id: selected.id,
    difficulty: selected.difficulty,
    question: selected.question,
    options: selected.options,
    answerIndex: selected.answerIndex,
    source: 'local'
  };
}

async function fetchExternalQuestion({ guildId, seasonId, difficulty }) {
  const ext = CONFIG.pass.quizExternal || {};
  if (!ext.enabled) return null;
  const params = new URLSearchParams();
  params.set('amount', '1');
  params.set('type', 'multiple');
  params.set('difficulty', difficulty);
  if (ext.category) params.set('category', String(ext.category));
  const url = `${ext.endpoint}?${params.toString()}`;
  const state = await getGameState(guildId, seasonId);
  const used = new Set(state.usedExternalQuizHashes || []);
  for (let i = 0; i < 5; i++) {
    const res = await fetch(url);
    const data = await res.json();
    const item = data?.results?.[0];
    if (!item) return null;
    const question = decodeEntities(item.question);
    const correct = decodeEntities(item.correct_answer);
    const incorrect = item.incorrect_answers.map(a => decodeEntities(a));
    const options = shuffle([correct, ...incorrect]);
    const answerIndex = options.indexOf(correct);
    const hash = hashQuestion(`${question}|${options.join('|')}`);
    if (used.has(hash)) continue;
    state.usedExternalQuizHashes.push(hash);
    await state.save();
    return {
      id: hash,
      difficulty,
      question,
      options,
      answerIndex,
      source: 'external'
    };
  }
  return null;
}

async function getQuizQuestion({ guildId, seasonId, difficulty, source }) {
  const diff = normalizeDifficulty(difficulty);
  const preferExternal = source === 'external';
  const preferLocal = source === 'local';
  const externalEnabled = CONFIG.pass?.quizExternal?.enabled;
  if (preferExternal || (!preferLocal && externalEnabled && source === 'auto')) {
    const ext = await fetchExternalQuestion({ guildId, seasonId, difficulty: diff });
    if (ext) return ext;
  }
  if (!preferExternal) {
    const local = await pickLocalQuestion({ guildId, seasonId, difficulty: diff });
    if (local) return local;
  }
  const fallback = await fetchExternalQuestion({ guildId, seasonId, difficulty: diff });
  return fallback;
}

module.exports = { getQuizQuestion };