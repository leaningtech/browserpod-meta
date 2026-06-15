/*
  Pixel-art cloud layer — slowly drifting clouds in the night sky.
  Rendered on its own canvas, z-index 1 (above stars, behind water + boat).
*/
(function () {
  const CELL        = 8;   // px per pixel-art cell
  const NUM_CLOUDS  = 6;
  const SEA_OFFSET  = 215; // matches the CSS waterline offset

  const canvas = document.createElement('canvas');
  canvas.id = 'cloud-canvas';
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;' +
    'pointer-events:none;z-index:1;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // ── Seeded LCG RNG ──────────────────────────────────────────────────────────
  function makeRng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  // ── Cloud shape generator ───────────────────────────────────────────────────
  // Produces a 2-D grid of 0/1 cells representing one pixel-art cloud.
  function generateShape(seed) {
    const rng   = makeRng(seed);
    const baseW = Math.floor(rng() * 8) + 6;  // 6–14 cells wide
    const baseH = 2;                            // 2-cell-tall base

    const numBumps = Math.floor(rng() * 3) + 2; // 2–4 bumps
    const bumps    = [];
    for (let i = 0; i < numBumps; i++) {
      const bw = Math.floor(rng() * 3) + 2;                        // 2–4 cells
      const bx = Math.floor(rng() * Math.max(1, baseW - bw));
      const bh = Math.floor(rng() * 2) + 1;                        // 1–2 cells
      bumps.push({ x: bx, w: bw, h: bh });
    }

    const topGap  = bumps.reduce((m, b) => Math.max(m, b.h), 0);
    const totalH  = baseH + topGap;
    const grid    = Array.from({ length: totalH }, () => new Uint8Array(baseW));

    // Fill base rows
    for (let y = topGap; y < totalH; y++) grid[y].fill(1);

    // Fill bumps
    for (const b of bumps) {
      for (let y = topGap - b.h; y < topGap; y++) {
        for (let x = b.x; x < Math.min(b.x + b.w, baseW); x++) {
          grid[y][x] = 1;
        }
      }
    }

    return { grid, w: baseW, h: totalH };
  }

  // ── Spawn / respawn ─────────────────────────────────────────────────────────
  function skyBottom() {
    return Math.max(60, window.innerHeight - SEA_OFFSET - 40);
  }

  function spawnCloud(startX) {
    const seed   = (Math.random() * 0xffffffff) >>> 0;
    const shape  = generateShape(seed);
    const maxY   = skyBottom();
    const y      = Math.floor(Math.random() * maxY * 0.72) + 20;
    // Vary speed slightly by "altitude": higher clouds slightly slower
    const depthT = y / maxY;                           // 0 = high, 1 = low
    const speed  = 0.08 + depthT * 0.14 + Math.random() * 0.06; // 0.08–0.28 px/frame
    const alpha  = 0.18 + depthT * 0.14;              // higher clouds = more translucent
    const x      = startX !== undefined ? startX : Math.random() * canvas.width;
    return { shape, x, y, speed, alpha };
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  let clouds = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function init() {
    resize();
    clouds = [];
    for (let i = 0; i < NUM_CLOUDS; i++) {
      clouds.push(spawnCloud(Math.random() * canvas.width));
    }
  }

  window.addEventListener('resize', resize);
  init();

  // ── Draw ────────────────────────────────────────────────────────────────────
  // Two shades: base body + a slightly lighter top-edge highlight
  function cloudColours() {
    return document.body.classList.contains('light')
      ? { body: '#d8e8f8', top: '#eef4fc' }
      : { body: '#1e3858', top: '#2a4d72' };
  }

  function drawCloud(cloud, colours) {
    const { grid, w, h } = cloud.shape;
    const cx = Math.round(cloud.x);
    const cy = Math.round(cloud.y);

    ctx.globalAlpha = cloud.alpha;
    for (let row = 0; row < h; row++) {
      // Top edge of the cloud gets a slightly lighter shade
      const isTopEdge = row === 0 || (row > 0 && grid[row - 1].every(v => !v));
      ctx.fillStyle = isTopEdge ? colours.top : colours.body;
      for (let col = 0; col < w; col++) {
        if (grid[row][col]) {
          ctx.fillRect(cx + col * CELL, cy + row * CELL, CELL, CELL);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── Animation loop ──────────────────────────────────────────────────────────
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const colours = cloudColours();

    for (const cloud of clouds) {
      cloud.x -= cloud.speed;

      // When fully off the left edge, respawn off the right
      if (cloud.x + cloud.shape.w * CELL < 0) {
        const fresh = spawnCloud(canvas.width + Math.random() * 120);
        cloud.shape = fresh.shape;
        cloud.x     = fresh.x;
        cloud.y     = fresh.y;
        cloud.speed = fresh.speed;
        cloud.alpha = fresh.alpha;
      }

      drawCloud(cloud, colours);
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
})();
