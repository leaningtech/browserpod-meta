import { Chess } from 'chess.js';
import { Chessground } from '@lichess-org/chessground';

const CHESS_API_URL = 'https://chess-api.com/v1';
const params = new URLSearchParams(window.location.search);

const aiRole = params.get('aiRole') === 'white' ? 'white' : 'black';
const playerRole = aiRole === 'white' ? 'black' : 'white';
const timerMinutes = clampInteger(params.get('timer'), 10, 1, 120);
const aiDepth = clampInteger(params.get('depth'), 12, 1, 18);
const aiThinkingTime = clampInteger(params.get('think'), 50, 1, 100);
const initialClockMs = timerMinutes * 60 * 1000;

const boardEl = document.getElementById('board');
const roleLabel = document.getElementById('roleLabel');
const roleSub = document.getElementById('roleSub');
const gameStatus = document.getElementById('gameStatus');
const turnStatus = document.getElementById('turnStatus');
const errorStatus = document.getElementById('errorStatus');
const whiteStatus = document.getElementById('whiteStatus');
const blackStatus = document.getElementById('blackStatus');
const whiteClock = document.getElementById('whiteClock');
const blackClock = document.getElementById('blackClock');
const scoreWhite = document.getElementById('scoreWhite');
const scoreBlack = document.getElementById('scoreBlack');
const scoreDraws = document.getElementById('scoreDraws');
const materialWhite = document.getElementById('materialWhite');
const materialBlack = document.getElementById('materialBlack');
const materialDiff = document.getElementById('materialDiff');
const newGameBtn = document.getElementById('newGame');
const resignBtn = document.getElementById('resign');
const returnToMenuBtn = document.getElementById('returnToMenu');
const overlay = document.getElementById('gameOverlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlaySub = document.getElementById('overlaySub');
const overlayClose = document.getElementById('closeOverlay');

const game = new Chess();
const clocks = { white: initialClockMs, black: initialClockMs };
const matchScore = { player: 0, ai: 0, draws: 0 };
let lastTickAt = Date.now();
let lastMove = null;
let status = 'active';
let winner = null;
let aiThinking = false;
let overlaySuppressed = false;

const ground = Chessground(boardEl, {
  orientation: playerRole,
  coordinates: true,
  highlight: { lastMove: true, check: true },
  draggable: { enabled: true, showGhost: true },
  movable: {
    free: false,
    color: playerRole,
    showDests: true,
    events: {
      after: (from, to) => handleMove(from, to),
    },
  },
});

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function activeColor() {
  return game.turn() === 'w' ? 'white' : 'black';
}

function opponent(color) {
  return color === 'white' ? 'black' : 'white';
}

function buildDests() {
  const dests = {};
  const moves = game.moves({ verbose: true });
  for (const move of moves) {
    if (!dests[move.from]) dests[move.from] = [];
    dests[move.from].push(move.to);
  }
  return new Map(Object.entries(dests));
}

function buildMaterial() {
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const tally = {
    white: { points: 0 },
    black: { points: 0 },
  };
  const board = game.board();
  for (const row of board) {
    for (const piece of row) {
      if (!piece) continue;
      const color = piece.color === 'w' ? 'white' : 'black';
      tally[color].points += values[piece.type] ?? 0;
    }
  }
  return {
    white: tally.white.points,
    black: tally.black.points,
    diff: tally.white.points - tally.black.points,
  };
}

function updateStatus() {
  if (status === 'resigned') {
    return;
  }
  if (game.isCheckmate()) {
    status = 'checkmate';
    winner = opponent(activeColor());
    recordWin(winner);
    return;
  }
  if (game.isDraw() || game.isStalemate() || game.isInsufficientMaterial()) {
    status = 'draw';
    winner = null;
    matchScore.draws += 1;
    return;
  }
  status = 'active';
  winner = null;
}

function recordWin(color) {
  if (color === playerRole) {
    matchScore.player += 1;
  } else if (color === aiRole) {
    matchScore.ai += 1;
  }
}

function updateClocks() {
  if (status !== 'active') {
    lastTickAt = Date.now();
    return;
  }
  const now = Date.now();
  const elapsed = now - lastTickAt;
  if (elapsed <= 0) return;
  clocks[activeColor()] = Math.max(0, clocks[activeColor()] - elapsed);
  lastTickAt = now;
  if (clocks[activeColor()] === 0) {
    status = 'timeout';
    winner = opponent(activeColor());
    recordWin(winner);
  }
}

function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function showError(message) {
  if (!message) return;
  errorStatus.textContent = message;
  errorStatus.style.display = 'block';
}

function clearError() {
  errorStatus.textContent = '';
  errorStatus.style.display = 'none';
}

function render() {
  updateClocks();
  updateStatus();

  roleLabel.textContent = `Player: ${playerRole.toUpperCase()}`;
  roleSub.textContent = `${timerMinutes} minutes per side · Playing against AI`;
  whiteStatus.textContent = playerRole === 'white' ? 'You' : 'AI opponent';
  blackStatus.textContent = playerRole === 'black' ? 'You' : 'AI opponent';
  whiteClock.textContent = formatClock(clocks.white);
  blackClock.textContent = formatClock(clocks.black);
  scoreWhite.textContent = String(matchScore.player);
  scoreBlack.textContent = String(matchScore.ai);
  scoreDraws.textContent = String(matchScore.draws);

  const material = buildMaterial();
  materialWhite.textContent = String(material.white);
  materialBlack.textContent = String(material.black);
  materialDiff.textContent =
    material.diff === 0 ? 'Equal material' : material.diff > 0 ? `White +${material.diff}` : `Black +${Math.abs(material.diff)}`;

  if (status === 'active') {
    gameStatus.textContent = 'Game in progress';
    turnStatus.textContent = `${activeColor().toUpperCase()} to move`;
  } else if (status === 'checkmate') {
    gameStatus.textContent = `Checkmate - ${winner?.toUpperCase()} wins`;
    turnStatus.textContent = 'Game over';
  } else if (status === 'timeout') {
    gameStatus.textContent = `Timeout - ${winner?.toUpperCase()} wins`;
    turnStatus.textContent = 'Game over';
  } else if (status === 'resigned') {
    gameStatus.textContent = `${winner?.toUpperCase()} wins by resignation`;
    turnStatus.textContent = 'Game over';
  } else if (status === 'draw') {
    gameStatus.textContent = 'Draw';
    turnStatus.textContent = 'Game over';
  }

  roleSub.textContent =
    status === 'active'
      ? `Playing as ${playerRole.toUpperCase()} against AI (${aiRole.toUpperCase()}) · ${timerMinutes} minutes per side · Depth ${aiDepth} · ${aiThinkingTime}ms`
      : `Playing as ${playerRole.toUpperCase()} against AI (${aiRole.toUpperCase()}) · ${timerMinutes} minutes per side`;

  ground.set({
    fen: game.fen(),
    lastMove: lastMove || undefined,
    check: game.isCheck(),
    turnColor: activeColor(),
    viewOnly: status !== 'active',
    movable: {
      color: activeColor() === playerRole && status === 'active' ? playerRole : undefined,
      dests: activeColor() === playerRole && status === 'active' ? buildDests() : new Map(),
      showDests: true,
    },
  });

  if (['checkmate', 'timeout', 'resigned', 'draw'].includes(status) && !overlaySuppressed) {
    overlayTitle.textContent = gameStatus.textContent;
    overlaySub.textContent = turnStatus.textContent;
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

function normalizeMoveCandidate(move) {
  if (!move) return null;
  const testGame = new Chess(game.fen());
  let normalized = null;
  try {
    normalized = typeof move === 'string' ? testGame.move(move, { sloppy: true }) : testGame.move(move);
  } catch {
    return null;
  }
  if (!normalized) return null;
  return {
    from: normalized.from,
    to: normalized.to,
    promotion: normalized.promotion,
  };
}

function normalizeApiMove(data) {
  if (!data) return null;
  if (typeof data.move === 'string') {
    const match = data.move.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
    if (match) {
      return {
        from: match[1].toLowerCase(),
        to: match[2].toLowerCase(),
        promotion: match[3] ? match[3].toLowerCase() : undefined,
      };
    }
  }
  if (typeof data.from === 'string' && typeof data.to === 'string') {
    return {
      from: data.from.toLowerCase(),
      to: data.to.toLowerCase(),
      promotion: typeof data.promotion === 'string' ? data.promotion.toLowerCase() : undefined,
    };
  }
  return null;
}

async function requestAiMove() {
  const response = await fetch(CHESS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fen: game.fen(),
      depth: aiDepth,
      maxThinkingTime: aiThinkingTime,
      variants: 1,
    }),
  });
  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`AI request failed (${response.status}).`);
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error('AI response was not valid JSON.');
  }

  const apiMove = normalizeApiMove(data);
  return normalizeMoveCandidate(apiMove);
}

async function maybeStartAiMove() {
  if (status !== 'active') return;
  if (activeColor() !== aiRole) return;
  if (aiThinking) return;

  aiThinking = true;
  clearError();
  render();

  try {
    const move = await requestAiMove();
    if (!move) throw new Error('AI did not return a valid move.');
    updateClocks();
    const applied = game.move(move);
    if (!applied) throw new Error('AI returned an illegal move.');
    lastMove = [applied.from, applied.to];
    lastTickAt = Date.now();
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  } finally {
    aiThinking = false;
    render();
  }
}

function handleMove(from, to) {
  if (status !== 'active') return;
  if (activeColor() !== playerRole) return;
  const promotion = to[1] === '1' || to[1] === '8' ? 'q' : undefined;
  updateClocks();
  const applied = game.move({ from, to, promotion });
  if (!applied) {
    showError('Illegal move.');
    render();
    return;
  }
  clearError();
  lastMove = [applied.from, applied.to];
  lastTickAt = Date.now();
  overlaySuppressed = false;
  render();
  maybeStartAiMove();
}

function resetGame() {
  game.reset();
  clocks.white = initialClockMs;
  clocks.black = initialClockMs;
  lastTickAt = Date.now();
  lastMove = null;
  status = 'active';
  winner = null;
  overlaySuppressed = false;
  clearError();
  render();
  maybeStartAiMove();
}

newGameBtn.addEventListener('click', resetGame);
resignBtn.addEventListener('click', () => {
  if (status !== 'active') return;
  status = 'resigned';
  winner = aiRole;
  recordWin(aiRole);
  render();
});
returnToMenuBtn?.addEventListener('click', () => {
  window.parent.postMessage({ type: 'return-to-menu' }, '*');
});
overlayClose.addEventListener('click', () => {
  overlay.classList.add('hidden');
  overlaySuppressed = true;
});

setInterval(render, 1000);
render();
maybeStartAiMove();
