import { Chessground } from '/assets/chessground.min.js';

const plasmaEl = document.getElementById('plasma');

const plasmaVertex = `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const plasmaFragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec3 uCustomColor;
uniform float uUseCustomColor;
uniform float uSpeed;
uniform float uDirection;
uniform float uScale;
uniform float uOpacity;
uniform vec2 uMouse;
uniform float uMouseInteractive;
out vec4 fragColor;

void mainImage(out vec4 o, vec2 C) {
  vec2 center = iResolution.xy * 0.5;
  C = (C - center) / uScale + center;
  vec2 mouseOffset = (uMouse - center) * 0.0002;
  C += mouseOffset * length(C - center) * step(0.5, uMouseInteractive);
  float i, d, z, T = iTime * uSpeed * uDirection;
  vec3 O, p, S;
  for (vec2 r = iResolution.xy, Q; ++i < 24.; O += o.w / d * o.xyz) {
    p = z * normalize(vec3(C - .5 * r, r.y));
    p.z -= 4.;
    S = p;
    d = p.y - T;
    p.x += .4 * (1. + p.y) * sin(d + p.x * 0.1) * cos(.34 * d + p.x * 0.05);
    Q = p.xz *= mat2(cos(p.y + vec4(0, 11, 33, 0) - T));
    z += d = abs(sqrt(length(Q * Q)) - .25 * (5. + S.y)) / 3. + 8e-4;
    o = 1. + sin(S.y + p.z * .5 + S.z - length(S - p) + vec4(2, 1, 0, 8));
  }
  o.xyz = tanh(O / 1e4);
}

bool finite1(float x) { return !(isnan(x) || isinf(x)); }
vec3 sanitize(vec3 c) {
  return vec3(
    finite1(c.r) ? c.r : 0.0,
    finite1(c.g) ? c.g : 0.0,
    finite1(c.b) ? c.b : 0.0
  );
}

void main() {
  vec4 o = vec4(0.0);
  mainImage(o, gl_FragCoord.xy);
  vec3 rgb = sanitize(o.rgb);
  float intensity = (rgb.r + rgb.g + rgb.b) / 3.0;
  vec3 customColor = intensity * uCustomColor;
  vec3 finalColor = mix(rgb, customColor, step(0.5, uUseCustomColor));
  float alpha = length(rgb) * uOpacity;
  fragColor = vec4(finalColor, alpha);
}`;

function getPlasmaQuality() {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (reducedMotion) {
    return { fps: 0, resolutionScale: 0.22 };
  }
  if (window.innerWidth < 720) {
    return { fps: 18, resolutionScale: 0.26 };
  }
  if (window.innerWidth < 1200) {
    return { fps: 22, resolutionScale: 0.36 };
  }
  return { fps: 24, resolutionScale: 0.44 };
}

function initPlasma() {
  if (!plasmaEl) return;
  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.pointerEvents = 'none';
  canvas.style.filter = 'blur(16px) saturate(108%)';
  canvas.style.transform = 'scale(1.04)';
  canvas.style.transformOrigin = 'center';
  plasmaEl.appendChild(canvas);

  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    desynchronized: true,
    powerPreference: 'low-power',
  });
  if (!gl) return;
  const quality = getPlasmaQuality();
  let disposed = false;
  let rafId = 0;
  let lastFrameTime = 0;
  const frameInterval = quality.fps > 0 ? 1000 / quality.fps : Infinity;

  const vertices = new Float32Array([
    -1, -1,
    3, -1,
    -1, 3,
  ]);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const compileShader = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  };

  const vertexShader = compileShader(gl.VERTEX_SHADER, plasmaVertex);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, plasmaFragment);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.useProgram(program);

  const posLoc = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    iResolution: gl.getUniformLocation(program, 'iResolution'),
    iTime: gl.getUniformLocation(program, 'iTime'),
    uCustomColor: gl.getUniformLocation(program, 'uCustomColor'),
    uUseCustomColor: gl.getUniformLocation(program, 'uUseCustomColor'),
    uSpeed: gl.getUniformLocation(program, 'uSpeed'),
    uDirection: gl.getUniformLocation(program, 'uDirection'),
    uScale: gl.getUniformLocation(program, 'uScale'),
    uOpacity: gl.getUniformLocation(program, 'uOpacity'),
    uMouse: gl.getUniformLocation(program, 'uMouse'),
    uMouseInteractive: gl.getUniformLocation(program, 'uMouseInteractive'),
  };

  gl.uniform3f(uniforms.uCustomColor, 0.96, 0.83, 0.42);
  gl.uniform1f(uniforms.uUseCustomColor, 1.0);
  gl.uniform1f(uniforms.uSpeed, 0.32);
  gl.uniform1f(uniforms.uDirection, 1.0);
  gl.uniform1f(uniforms.uScale, 1.0);
  gl.uniform1f(uniforms.uOpacity, 0.8);
  gl.uniform1f(uniforms.uMouseInteractive, 0.0);
  gl.uniform2f(uniforms.uMouse, 0, 0);

  const resize = () => {
    const width = Math.max(1, Math.floor(window.innerWidth * quality.resolutionScale));
    const height = Math.max(1, Math.floor(window.innerHeight * quality.resolutionScale));
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.uniform2f(uniforms.iResolution, width, height);
  };
  window.addEventListener('resize', resize);
  resize();

  const start = performance.now();
  const loop = (time) => {
    if (disposed) return;
    if (quality.fps > 0) {
      rafId = requestAnimationFrame(loop);
    }
    if (document.hidden) return;
    if (lastFrameTime && time - lastFrameTime < frameInterval) return;
    lastFrameTime = time;
    gl.uniform1f(uniforms.iTime, (time - start) * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  if (quality.fps > 0) {
    rafId = requestAnimationFrame(loop);
  } else {
    loop(start);
  }

  const handleVisibilityChange = () => {
    lastFrameTime = 0;
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    disposed = true;
    cancelAnimationFrame(rafId);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('resize', resize);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    canvas.remove();
  };
}

const disposePlasma = initPlasma();
if (typeof disposePlasma === 'function') {
  window.addEventListener('pagehide', disposePlasma, { once: true });
}

const boardEl = document.getElementById('board');
const roleCardLabel = document.getElementById('roleCardLabel');
const roleLabel = document.getElementById('roleLabel');
const roleSub = document.getElementById('roleSub');
const statusPill = document.getElementById('connectionStatus');
const whiteStatus = document.getElementById('whiteStatus');
const blackStatus = document.getElementById('blackStatus');
const whiteClock = document.getElementById('whiteClock');
const blackClock = document.getElementById('blackClock');
const gameStatus = document.getElementById('gameStatus');
const turnStatus = document.getElementById('turnStatus');
const shareLink = document.getElementById('shareLink');
const errorStatus = document.getElementById('errorStatus');
const scoreWhite = document.getElementById('scoreWhite');
const scoreBlack = document.getElementById('scoreBlack');
const scoreDraws = document.getElementById('scoreDraws');
const materialWhite = document.getElementById('materialWhite');
const materialBlack = document.getElementById('materialBlack');
const materialDiff = document.getElementById('materialDiff');
const overlay = document.getElementById('gameOverlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlaySub = document.getElementById('overlaySub');
const overlayClose = document.getElementById('closeOverlay');
const returnToMenuBtn = document.getElementById('returnToMenu');

// Fix: Declare overlaySuppressed at top level
let overlaySuppressed = false;

const newGameBtn = document.getElementById('newGame');
const resignBtn = document.getElementById('resign');
const copyLinkBtn = document.getElementById('copyLink');
const invitePanel = document.getElementById('invitePanel');
const shareLabel = document.getElementById('shareLabel');
const shareHelper = document.getElementById('shareHelper');

shareLink.value = window.location.href;
function getCopyButtonDefaultLabel() {
  return latestState?.settings?.mode === 'multiplayer' ? 'Copy Invite Link' : 'Copy';
}

copyLinkBtn.addEventListener('click', async () => {
  const url = window.location.href;
  let copied = false;
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      copied = false;
    }
  }
  if (!copied) {
    try {
      shareLink.focus();
      shareLink.select();
      shareLink.setSelectionRange(0, shareLink.value.length);
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
  }
  copyLinkBtn.textContent = copied ? 'Invite Link Copied' : getCopyButtonDefaultLabel();
  if (copied) {
    setTimeout(() => (copyLinkBtn.textContent = getCopyButtonDefaultLabel()), 1200);
  }
});

overlayClose.addEventListener('click', () => {
  overlay.classList.add('hidden');
  if (latestState && ["checkmate", "timeout", "resigned", "draw"].includes(latestState.status)) {
    overlaySuppressed = true;
  }
});

let role = 'spectator';
let latestState = null;

const ground = Chessground(boardEl, {
  coordinates: true,
  highlight: { lastMove: true, check: true },
  draggable: { enabled: true, showGhost: true },
  movable: {
    free: false,
    color: 'both',
    showDests: true,
    events: {
      after: (from, to) => handleMove(from, to),
    },
  },
});

const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const wsUrl = `${wsProtocol}://${window.location.host}/ws`;
const socket = new WebSocket(wsUrl);
let lastPingAt = 0;
let lastMessageAt = 0;
let pingTimer = null;

function updateConnectionPill() {
  if (socket.readyState !== WebSocket.OPEN) {
    statusPill.textContent = 'Disconnected';
    return;
  }
  if (!lastMessageAt) {
    statusPill.textContent = 'Connecting...';
    return;
  }
  const age = Date.now() - lastMessageAt;
  if (age > 8000) {
    statusPill.textContent = 'Server unresponsive';
    return;
  }
  statusPill.textContent = 'Connected';
}

socket.addEventListener('open', () => {
  lastPingAt = 0;
  lastMessageAt = Date.now();
  updateConnectionPill();
  if (!pingTimer) {
    pingTimer = setInterval(() => {
      safeSend({ type: 'ping-client', ts: Date.now() });
    }, 3000);
  }
});

socket.addEventListener('close', () => {
  lastPingAt = 0;
  updateConnectionPill();
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  overlayTitle.textContent = 'Connection Lost';
  overlaySub.textContent = 'The host has closed the game or your connection was interrupted.';
  overlay.classList.remove('hidden');
  overlaySuppressed = false;
});

socket.addEventListener('error', () => {
  statusPill.textContent = 'Connection error';
});

socket.addEventListener('message', (event) => {
  lastMessageAt = Date.now();
  let msg;
  try {
    msg = JSON.parse(event.data);
  } catch {
    return;
  }
  if (msg.type === 'assign') {
    role = msg.role;
    roleLabel.textContent = role === 'spectator' ? 'Spectator' : role.toUpperCase();
    roleSub.textContent = msg.roleNote || 'Ready to play.';
    return;
  }

  if (msg.type === 'ping') {
    lastPingAt = Date.now();
    lastMessageAt = lastPingAt;
    updateConnectionPill();
    safeSend({ type: 'pong', ts: msg.ts || Date.now() });
    return;
  }

  if (msg.type === 'pong') {
    lastPingAt = Date.now();
    lastMessageAt = lastPingAt;
    updateConnectionPill();
    return;
  }

  if (msg.type === 'state') {
    latestState = msg;
    renderState(msg);
    return;
  }

  if (msg.type === 'error') {
    showError(msg.message || 'Server error');
  }
});

newGameBtn.addEventListener('click', () => {
  safeSend({ type: 'reset' });
});

resignBtn.addEventListener('click', () => {
  safeSend({ type: 'resign' });
});

returnToMenuBtn?.addEventListener('click', () => {
  window.parent.postMessage({ type: 'return-to-menu' }, '*');
});

function describeSeatStatus(color, seatType, mode) {
  if (role === color) return 'You';
  if (seatType === 'ai') return 'AI opponent';
  if (seatType === 'human') return mode === 'multiplayer' ? 'Opponent connected' : 'Player connected';
  return mode === 'multiplayer' ? 'Waiting for opponent' : 'Waiting to start';
}

function renderState(state) {
  if (state.status === 'active' || state.status === 'waiting') {
    overlaySuppressed = false;
  }
  const mode = state.settings?.mode === 'single' ? 'single' : 'multiplayer';
  const timerMinutes = state.settings?.timerMinutes ?? 10;
  const whiteKind = state.players ? state.players.white : null;
  const blackKind = state.players ? state.players.black : null;

  if (roleCardLabel) {
    roleCardLabel.textContent = mode === 'single' ? 'Single Player' : 'Online Multiplayer';
  }
  if (role !== 'spectator') {
    roleLabel.textContent = role.toUpperCase();
  } else {
    roleLabel.textContent = mode === 'single' ? 'Observer' : 'Spectator';
  }
  if (mode === 'single') {
    roleSub.textContent = role === 'spectator'
      ? `Watching a single-player game · ${timerMinutes} minutes per side`
      : `Playing against the AI · ${timerMinutes} minutes per side`;
  } else {
    const waitingFor = role === 'white' ? 'Black' : 'White';
    roleSub.textContent = role === 'spectator'
      ? `Watching an online game · ${timerMinutes} minutes per side`
      : (role === 'white' || role === 'black') && !state.players[role === 'white' ? 'black' : 'white']
        ? `Share the invite link so ${waitingFor} can join.`
        : `Online match live · ${timerMinutes} minutes per side`;
  }

  whiteStatus.textContent = describeSeatStatus('white', whiteKind, mode);
  blackStatus.textContent = describeSeatStatus('black', blackKind, mode);

  whiteClock.textContent = formatClock(state.clocks.white);
  blackClock.textContent = formatClock(state.clocks.black);

  invitePanel?.classList.toggle('is-hidden', mode !== 'multiplayer');
  newGameBtn.textContent = 'New Online Game';
  if (shareLabel) {
    shareLabel.textContent = 'Invite a Friend';
  }
  if (shareHelper) {
    shareHelper.textContent = mode === 'multiplayer'
      ? (whiteKind && blackKind
        ? 'Both players are in. Share the link again only if you want someone else to spectate.'
        : `Copy this link and send it to your opponent so they can join the match.`)
      : '';
  }
  if (copyLinkBtn && copyLinkBtn.textContent !== 'Invite Link Copied') {
    copyLinkBtn.textContent = getCopyButtonDefaultLabel();
  }

  gameStatus.textContent = state.statusLabel;
  turnStatus.textContent = state.turnLabel;

  if (state.score) {
    scoreWhite.textContent = state.score.white ?? 0;
    scoreBlack.textContent = state.score.black ?? 0;
    scoreDraws.textContent = state.score.draws ?? 0;
  }

  if (state.material) {
    materialWhite.textContent = state.material.white.points;
    materialBlack.textContent = state.material.black.points;
    const diff = state.material.diff;
    if (diff === 0) {
      materialDiff.textContent = 'Equal material';
    } else if (diff > 0) {
      materialDiff.textContent = `White +${diff}`;
    } else {
      materialDiff.textContent = `Black +${Math.abs(diff)}`;
    }
  }

  const dests = new Map(
    Object.entries(state.dests || {}).map(([from, tos]) => [from, tos])
  );

  const canMove =
    role !== 'spectator' &&
    state.status === 'active' &&
    state.turn === role;

  ground.set({
    fen: state.fen,
    lastMove: state.lastMove || undefined,
    check: state.check,
    turnColor: state.turn,
    viewOnly: role === 'spectator',
    movable: {
      color: role === 'spectator' ? 'both' : role,
      dests: canMove ? dests : new Map(),
      showDests: true,
    },
  });

  if (["checkmate", "timeout", "resigned", "draw"].includes(state.status) && !overlaySuppressed) {
    overlayTitle.textContent = state.statusLabel || 'Game Over';
    overlaySub.textContent = state.turnLabel || '';
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

function handleMove(from, to) {
  // Reset overlay suppression on new game or active state
  if (latestState && latestState.status === 'active') {
    overlaySuppressed = false;
  }
  if (!latestState) return;
  if (role === 'spectator') return;
  if (latestState.status !== 'active') return;
  if (latestState.turn !== role) return;

  let promotion;
  const targetRank = to[1];
  if (targetRank === '1' || targetRank === '8') {
    promotion = 'q';
  }

  try {
    safeSend({ type: 'move', from, to, promotion });
  } catch (err) {
    console.error('Move UI error:', err);
    showError('Move UI error');
  }
}

function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function safeSend(payload) {
  if (socket.readyState !== WebSocket.OPEN) {
    showError('Connection lost. Refresh to reconnect.');
    return;
  }
  socket.send(JSON.stringify(payload));
}

function showError(message) {
  if (!message) return;
  errorStatus.textContent = message;
  errorStatus.style.display = 'block';
  roleSub.textContent = message;
}

window.addEventListener('error', () => {
  showError('Client error');
});

window.addEventListener('unhandledrejection', () => {
  showError('Unhandled rejection');
});

setInterval(updateConnectionPill, 1000);
