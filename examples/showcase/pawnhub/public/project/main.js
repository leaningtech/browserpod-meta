function activeColor() {
  return game.turn() === 'w' ? 'white' : 'black';
}
function opponent(color) {
  return color === 'white' ? 'black' : 'white';
}
function updateStatusLabels() {
  if (status === 'waiting') {
    statusLabel = 'Waiting for players';
    turnLabel = '-';
    return;
  }
  if (status === 'active') {
    statusLabel = 'Game in progress';
    turnLabel = `${activeColor().toUpperCase()} to move`;
    return;
  }
  if (status === 'checkmate') {
    statusLabel = `Checkmate — ${winner ? winner.toUpperCase() : ''} wins`;
    turnLabel = 'Game over';
    return;
  }
  if (status === 'timeout') {
    statusLabel = `Timeout — ${winner ? winner.toUpperCase() : ''} wins`;
    turnLabel = 'Game over';
    return;
  }
  if (status === 'resigned') {
    statusLabel = `${winner ? winner.toUpperCase() : ''} wins by resignation`;
    turnLabel = 'Game over';
    return;
  }
  if (status === 'draw') {
    statusLabel = 'Draw';
    turnLabel = 'Game over';
    return;
  }
}
function refreshStatus() {
  if (status === 'timeout' || status === 'resigned') {
    if (!gameOverRecorded && winner) {
      matchScore[winner] += 1;
      gameOverRecorded = true;
    }
    updateStatusLabels();
    return;
  }

  if (game.isCheckmate()) {
    status = 'checkmate';
    winner = opponent(activeColor());
    if (!gameOverRecorded) {
      matchScore[winner] += 1;
      gameOverRecorded = true;
    }
  } else if (game.isDraw() || game.isStalemate() || game.isInsufficientMaterial()) {
    status = 'draw';
    winner = null;
    if (!gameOverRecorded) {
      matchScore.draws += 1;
      gameOverRecorded = true;
    }
  } else if (!isSeatFilled()) {
    status = 'waiting';
  } else {
    status = 'active';
  }

  updateStatusLabels();
}
function isSeatFilled() {
  return Boolean(seats.white && seats.black);
}

function seatKind(color) {
  const seat = seats[color];
  return seat ? seat.type : null;
}

function describeSeat(color) {
  const kind = seatKind(color);
  if (!kind) return 'open';
  return kind === 'ai' ? 'Stockfish' : 'Human';
}

function sanitizeUserText(text, maxLength = 2000) {
  if (!text) return '';
  const cleaned = String(text).replace(/\0/g, '').trim();
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

process.env.WS_NO_UTF8_VALIDATE = '1';
process.env.WS_NO_BUFFER_UTIL = '1';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ChessLib = require('chess.js');
const Chess = ChessLib.Chess || ChessLib.default || ChessLib;
const WebSocket = require('ws');

const port = process.env.PORT || 3000;
const rootDir = __dirname;
const assetsDir = path.join(rootDir, 'assets');

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err && err.stack ? err.stack : err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason && reason.stack ? reason.stack : reason);
});

const files = {
  '/': { file: path.join(rootDir, 'index.html'), type: 'text/html; charset=utf-8' },
  '/index.html': { file: path.join(rootDir, 'index.html'), type: 'text/html; charset=utf-8' },
  '/client.js': { file: path.join(rootDir, 'client.js'), type: 'application/javascript; charset=utf-8' },
  '/styles.css': { file: path.join(rootDir, 'styles.css'), type: 'text/css; charset=utf-8' },
};

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  if (files[req.url]) {
    const { file, type } = files[req.url];
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Server error');
        return;
      }
      res.writeHead(200, { 'Content-Type': type });
      res.end(data);
    });
    return;
  }

  if (req.url.startsWith('/assets/')) {
    let assetPath = '';
    try {
      assetPath = decodeURIComponent(req.url.slice('/assets/'.length));
    } catch {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }
    const filePath = path.resolve(assetsDir, assetPath);
    if (!filePath.startsWith(assetsDir + path.sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath);
      const type =
        ext === '.css'
          ? 'text/css; charset=utf-8'
          : ext === '.js'
            ? 'application/javascript; charset=utf-8'
            : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(data);
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocket.Server({
  server,
  path: '/ws',
  perMessageDeflate: false,
  skipUTF8Validation: true,
});

let adminToken = crypto.randomBytes(16).toString('hex');
let adminWs = null;

function isAdminCommand(ws, payload) {
  return Boolean(ws && ws.isAdmin && payload && payload.adminToken === adminToken);
}

const game = new Chess();
const seats = { white: null, black: null };
let lastMove = null;
let lastTickAt = null;
let status = 'waiting';
let winner = null;
let statusLabel = 'Waiting for players';
let turnLabel = '-';
let gameOverRecorded = false;
const gameMode = process.env.CHESS_MODE === 'single' ? 'single' : 'multiplayer';
const timerMinutes = clampInteger(process.env.CHESS_TIMER_MINUTES, 10, 1, 120);
const initialClockMs = timerMinutes * 60 * 1000;
const initialAiEnabled = gameMode === 'single' && process.env.CHESS_AI_ENABLED !== '0';
const initialAiRole = process.env.CHESS_AI_ROLE === 'white' ? 'white' : 'black';
const clocks = { white: initialClockMs, black: initialClockMs };
const incrementMs = 5000;
const matchScore = { white: 0, black: 0, draws: 0 };

const CHESS_API_URL = 'https://chess-api.com/v1';

const aiConfig = {
  enabled: initialAiEnabled,
  role: initialAiRole,
  depth: clampInteger(process.env.CHESS_AI_DEPTH, 12, 1, 18),
  maxThinkingTime: clampInteger(process.env.CHESS_AI_THINK_MS, 50, 1, 100),
  moveDelayMs: 180,
};
let aiThinking = false;
let aiLastError = '';

if (initialAiEnabled) {
  seats[initialAiRole] = { type: 'ai' };
}

function updateClocks() {
  if (status !== 'active') {
    lastTickAt = Date.now();
    return;
  }
  const now = Date.now();
  if (!lastTickAt) {
    lastTickAt = now;
    return;
  }
  const elapsed = now - lastTickAt;
  if (elapsed <= 0) return;

  // Only decrement the clock of the player whose turn it is
  const color = activeColor();
  clocks[color] = Math.max(0, clocks[color] - elapsed);
  lastTickAt = now;

  if (clocks[color] === 0) {
    status = 'timeout';
    winner = opponent(color);
    updateStatusLabels();
  }
}

function buildDests() {
  const dests = {};
  const moves = game.moves({ verbose: true });
  for (const move of moves) {
    if (!dests[move.from]) dests[move.from] = [];
    dests[move.from].push(move.to);
  }
  return dests;
}

function buildMaterial() {
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const tally = {
    white: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0, points: 0 },
    black: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0, points: 0 },
  };

  const board = game.board();
  for (const row of board) {
    for (const piece of row) {
      if (!piece) continue;
      const color = piece.color === 'w' ? 'white' : 'black';
      const key = piece.type;
      tally[color][key] += 1;
      tally[color].points += values[key];
    }
  }

  return {
    white: tally.white,
    black: tally.black,
    diff: tally.white.points - tally.black.points,
  };
}

function buildState() {
  refreshStatus();

  return {
    type: 'state',
    fen: game.fen(),
    turn: activeColor(),
    lastMove,
    check: game.isCheck(),
    dests: buildDests(),
    clocks: { ...clocks },
    players: { white: seatKind('white'), black: seatKind('black') },
    status,
    statusLabel,
    turnLabel,
    score: { ...matchScore },
    material: buildMaterial(),
    settings: {
      mode: gameMode,
      timerMinutes,
    },
    ai: {
      enabled: aiConfig.enabled,
      role: aiConfig.role,
      depth: aiConfig.depth,
      maxThinkingTime: aiConfig.maxThinkingTime,
      thinking: aiThinking,
      ready: Boolean(globalThis.fetch),
      lastError: aiLastError || null,
    },
  };
}

function normalizeMoveCandidate(candidate) {
  if (!candidate) return null;
  const testGame = new Chess(game.fen());
  const move = typeof candidate === 'string'
    ? testGame.move(candidate, { sloppy: true })
    : testGame.move(candidate);
  if (!move) return null;
  return { from: move.from, to: move.to, promotion: move.promotion };
}

function applyMoveFromEngine(moveObj) {
  if (!moveObj) return false;
  updateClocks();
  const move = game.move(moveObj);
  if (!move) return false;
  const mover = move.color === 'w' ? 'white' : 'black';
  clocks[mover] += incrementMs;
  lastMove = [move.from, move.to];
  lastTickAt = Date.now();
  refreshStatus();
  return true;
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

async function requestChessApiMove() {
  if (!globalThis.fetch) {
    throw new Error('Fetch is not available in this runtime.');
  }

  const timeoutMs = Math.max(aiConfig.maxThinkingTime + 4000, 5000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(CHESS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fen: game.fen(),
        depth: aiConfig.depth,
        maxThinkingTime: aiConfig.maxThinkingTime,
        variants: 1,
      }),
      signal: controller.signal,
    });

    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`Chess API request failed (${response.status}). ${rawText.slice(0, 160)}`);
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error('Chess API response was not valid JSON.');
    }

    const moveObj = normalizeApiMove(data);
    if (!moveObj) {
      throw new Error('Chess API did not return a valid move.');
    }
    return moveObj;
  } finally {
    clearTimeout(timeoutId);
  }
}

function broadcastState(options = {}) {
  const state = JSON.stringify(buildState());
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(state);
    }
  });
  if (!options.skipAi) {
    maybeStartAiMove();
  }
}

async function maybeStartAiMove() {
  if (!aiConfig.enabled) return;
  if (aiThinking) return;
  if (status !== 'active') return;
  if (activeColor() !== aiConfig.role) return;

  aiThinking = true;
  aiLastError = '';
  broadcastState({ skipAi: true });

  try {
    if (aiConfig.moveDelayMs > 0) {
      await sleep(aiConfig.moveDelayMs);
      if (!aiConfig.enabled || status !== 'active' || activeColor() !== aiConfig.role) {
        aiThinking = false;
        broadcastState({ skipAi: true });
        return;
      }
    }
    const moveObj = normalizeMoveCandidate(await requestChessApiMove());
    const applied = applyMoveFromEngine(moveObj);
    if (!applied) {
      aiLastError = 'Chess API returned no legal move.';
    }
  } catch (err) {
    aiLastError = err && err.message ? err.message : 'Chess API move failed.';
  } finally {
    aiThinking = false;
    broadcastState({ skipAi: true });
  }
}

function disableAi() {
  if (aiConfig.enabled && seats[aiConfig.role] && seats[aiConfig.role].type === 'ai') {
    seats[aiConfig.role] = null;
  }
  aiConfig.enabled = false;
  aiThinking = false;
  aiLastError = '';
}

function handleAiConfig(ws, payload) {
  if (!isAdminCommand(ws, payload)) {
    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Only the host can configure the AI.',
      })
    );
    return;
  }

  const enabled = Boolean(payload.enabled);
  if (!enabled) {
    disableAi();
    if (!isSeatFilled()) {
      status = 'waiting';
      updateStatusLabels();
    }
    broadcastState();
    return;
  }

  if (gameMode !== 'single') {
    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'AI setup is only available in single-player games.',
      })
    );
    return;
  }

  const role = payload.role === 'white' ? 'white' : 'black';
  const depth = Math.max(1, Math.min(18, Number.parseInt(payload.depth, 10) || 12));
  const maxThinkingTime = Math.max(1, Math.min(100, Number.parseInt(payload.maxThinkingTime, 10) || 50));
  const seat = seats[role];
  if (seat && seat.type === 'human') {
    ws.send(
      JSON.stringify({
        type: 'error',
        message: `${role.toUpperCase()} seat is already taken by a human.`,
      })
    );
    return;
  }

  if (aiConfig.enabled && aiConfig.role !== role && seats[aiConfig.role]?.type === 'ai') {
    seats[aiConfig.role] = null;
  }

  aiConfig.enabled = true;
  aiConfig.role = role;
  aiConfig.depth = depth;
  aiConfig.maxThinkingTime = maxThinkingTime;
  aiLastError = '';
  aiThinking = false;
  seats[role] = { type: 'ai' };

  if (status === 'waiting' && isSeatFilled()) {
    lastTickAt = Date.now();
    status = 'active';
    updateStatusLabels();
  }

  broadcastState();
}

function resetGame() {
  aiThinking = false;
  aiLastError = '';
  game.reset();
  clocks.white = initialClockMs;
  clocks.black = initialClockMs;
  lastMove = null;
  winner = null;
  lastTickAt = Date.now();
  status = isSeatFilled() ? 'active' : 'waiting';
  gameOverRecorded = false;
  updateStatusLabels();
}

function handleMove(ws, data) {
  if (!data.from || !data.to) return;
  if (status !== 'active') return;
  if (ws.role !== activeColor()) return;
  const seat = seats[ws.role];
  if (!seat || seat.type !== 'human' || seat.ws !== ws) return;

  try {
    updateClocks();

    const movePayload = { from: data.from, to: data.to };
    if (data.promotion) movePayload.promotion = data.promotion;

    const move = game.move(movePayload);

    if (!move) {
      ws.send(JSON.stringify({ type: 'error', message: 'Illegal move.' }));
      return;
    }

    const mover = move.color === 'w' ? 'white' : 'black';
    clocks[mover] += incrementMs;
    lastMove = [move.from, move.to];
    lastTickAt = Date.now();

    refreshStatus();
    broadcastState();
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Move failed.' }));
    console.error('Move error:', err);
  }
}

function handleResign(ws) {
  if (ws.role === 'spectator') return;
  const seat = seats[ws.role];
  if (!seat || seat.type !== 'human' || seat.ws !== ws) return;
  if (status !== 'active') return;
  status = 'resigned';
  winner = opponent(ws.role);
  if (!gameOverRecorded) {
    matchScore[winner] += 1;
    gameOverRecorded = true;
  }
  updateStatusLabels();
  broadcastState();
}

wss.on('connection', (ws) => {
  if (ws._receiver) {
    ws._receiver._skipUTF8Validation = true;
  }
  ws.isAdmin = false;
  if (!adminWs) {
    adminWs = ws;
    ws.isAdmin = true;
  }
  let role = 'spectator';
  if (!seats.white) {
    seats.white = { type: 'human', ws };
    role = 'white';
  } else if (!seats.black) {
    seats.black = { type: 'human', ws };
    role = 'black';
  }

  ws.role = role;
  const assignPayload = {
    type: 'assign',
    role,
    roleNote: role === 'spectator' ? 'Spectating the game.' : 'Seat locked.',
  };
  if (ws.isAdmin) {
    assignPayload.adminToken = adminToken;
  }
  ws.send(JSON.stringify(assignPayload));

  if (status === 'waiting' && isSeatFilled()) {
    lastTickAt = Date.now();
    status = 'active';
    updateStatusLabels();
  }

  ws.send(JSON.stringify(buildState()));

  ws.on('message', (message) => {
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch {
      return;
    }

    if (payload.type === 'move') {
      try {
        handleMove(ws, payload);
      } catch (err) {
        console.error('Move handler crash:', err && err.stack ? err.stack : err);
      }
      return;
    }

    if (payload.type === 'ai-config' || payload.type === 'llm-config') {
      try {
        handleAiConfig(ws, payload);
      } catch (err) {
        console.error('AI config crash:', err && err.stack ? err.stack : err);
      }
      return;
    }

    if (payload.type === 'reset') {
      if (status !== 'active') {
        resetGame();
        broadcastState();
      }
      return;
    }

    if (payload.type === 'resign') {
      try {
        handleResign(ws);
      } catch (err) {
        console.error('Resign handler crash:', err && err.stack ? err.stack : err);
      }
      return;
    }

    if (payload.type === 'ping-client') {
      try {
        ws.send(JSON.stringify({ type: 'pong', ts: payload.ts || Date.now() }));
      } catch (err) {
        console.error('Ping response failed:', err && err.stack ? err.stack : err);
      }
      return;
    }

    if (payload.type === 'client-error') {
      console.error('Client error:', payload.message, payload.detail || '');
    }
  });

  ws.on('error', (err) => {
    console.error('Socket error:', err);
  });

  ws.on('close', () => {
    if (seats.white && seats.white.type === 'human' && seats.white.ws === ws) {
      seats.white = null;
    }
    if (seats.black && seats.black.type === 'human' && seats.black.ws === ws) {
      seats.black = null;
    }
    if (ws.isAdmin) {
      adminWs = null;
      adminToken = crypto.randomBytes(16).toString('hex');
    }
    if (status === 'active' && !isSeatFilled()) {
      status = 'waiting';
      updateStatusLabels();
    }
    broadcastState();
  });
});

setInterval(() => {
  try {
    updateClocks();
    broadcastState();
  } catch (err) {
    console.error('Tick error:', err);
  }
}, 1000);

setInterval(() => {
  const ping = JSON.stringify({ type: 'ping', ts: Date.now() });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(ping);
    }
  });
}, 3000);

server.listen(port, () => {
  console.log(`PawnHub server listening on port ${port}`);
});
