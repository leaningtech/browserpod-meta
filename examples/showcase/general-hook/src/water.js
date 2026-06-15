/*
  2D water simulation — adapted from 2D-Water-Javascript-Demo-master
  Original: Michael Hoffman's XNA demo (gamedevelopment.tutsplus.com)
*/
(function () {
  const canvas = document.getElementById('water-canvas');
  const context = canvas.getContext('2d');
  const boat = document.querySelector('.boat-img');

  // Wave column every N pixels
  const WAVE_FREQ = 5;
  const WAV_PASS  = 6;

  // Physics constants
  const SPREAD  = 0.2;
  const DAMP    = 0.008;
  const TENSION = 0.01;

  let springs = [];
  let WAVE_COUNT, END_Y, HEIGHT;
  let boatBob = 0;
  let boatTilt = 0;
  let ambientPhase = 0;
  let irregularSwell = 0;
  let irregularTarget = 0;
  let irregularRetargetAt = 0;

  // Work out where the boat's waterline sits in viewport coordinates.
  // Boat: width/height = min(600px, 95vw), translateY(20%), bottom:0.
  // Waterline in SVG is 86px from bottom of 320px viewBox.
  function getSurfaceY() {
    const boatSize          = Math.min(600, window.innerWidth * 0.95);
    const waterlineFromBot  = (86 / 320) * boatSize - boatSize * 0.2;
    return canvas.height - Math.max(waterlineFromBot, 20);
  }

  function initSprings() {
    WAVE_COUNT = Math.floor(canvas.width / WAVE_FREQ) + 1;
    END_Y      = canvas.height;
    HEIGHT     = getSurfaceY();

    springs = [];
    for (let i = 0; i < WAVE_COUNT; i++) {
      springs.push({
        x:      i * WAVE_FREQ,
        speed:  0,
        height: HEIGHT,
        update() {
          const x  = HEIGHT - this.height;
          this.speed  += TENSION * x - this.speed * DAMP;
          this.height += this.speed;
        }
      });
    }
  }

  function updateBoatMotion(time) {
    if (!boat) return;

    const idleBob  = Math.sin(time / 2600) * 1.2;
    const idleTilt = Math.sin(time / 3400) * 0.42;

    boatBob  += (idleBob  - boatBob)  * 0.05;
    boatTilt += (idleTilt - boatTilt) * 0.05;

    boatBob = Math.max(-4, Math.min(4, boatBob));
    boatTilt = Math.max(-0.7, Math.min(0.7, boatTilt));

    const snappedBob = Math.round(boatBob);
    const snappedTilt = Math.round(boatTilt * 10) / 10;

    boat.style.setProperty('--boat-bob', `${snappedBob}px`);
    boat.style.setProperty('--boat-tilt', `${snappedTilt}deg`);
    document.documentElement.style.setProperty('--scene-drift-x', `${Math.round(-snappedTilt * 2)}px`);
    document.documentElement.style.setProperty('--scene-drift-y', `${Math.round(-snappedBob * 0.5)}px`);
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  function updateWater() {
    ambientPhase += 0.026;

    if (ambientPhase >= irregularRetargetAt) {
      irregularRetargetAt = ambientPhase + 0.9 + Math.random() * 1.6;
      irregularTarget = (Math.random() - 0.5) * 0.006;
    }

    irregularSwell += (irregularTarget - irregularSwell) * 0.025;

    for (let i = 0; i < springs.length; i++) {
      const travel = Math.sin(ambientPhase + i * 0.055) * 0.018;
      const longRoll = Math.sin(ambientPhase * 0.42 + i * 0.018) * 0.009;
      const irregular = Math.sin(ambientPhase * 0.7 + i * 0.043) * irregularSwell;
      springs[i].speed += travel + longRoll + irregular;
      springs[i].update();
    }

    const leftDeltas  = new Array(springs.length);
    const rightDeltas = new Array(springs.length);

    for (let j = 0; j < WAV_PASS; j++) {
      for (let i = 0; i < springs.length; i++) {
        if (i > 0) {
          leftDeltas[i] = SPREAD * (springs[i].height - springs[i - 1].height);
          springs[i - 1].speed += leftDeltas[i];
        }
        if (i < springs.length - 1) {
          rightDeltas[i] = SPREAD * (springs[i].height - springs[i + 1].height);
          springs[i + 1].speed += rightDeltas[i];
        }
      }
      for (let i = 0; i < springs.length; i++) {
        if (i > 0)                    springs[i - 1].height += leftDeltas[i];
        if (i < springs.length - 1)   springs[i + 1].height += rightDeltas[i];
      }
    }
  }

  // ── Draw ─────────────────────────────────────────────────────────────────────

  function connectSprings(vOne, vTwo) {
    const topY = Math.min(vOne.height, vTwo.height);
    const isLight = document.body.classList.contains('light');
    const grd  = context.createLinearGradient(0, topY, 0, END_Y);
    if (isLight) {
      grd.addColorStop(0,    'rgba(35, 118, 200, 0.90)');
      grd.addColorStop(0.25, 'rgba(25,  90, 165, 0.94)');
      grd.addColorStop(0.6,  'rgba(15,  62, 128, 0.97)');
      grd.addColorStop(1,    'rgba( 8,  40,  90, 0.99)');
    } else {
      grd.addColorStop(0,    'rgba(10, 42, 80, 0.88)');
      grd.addColorStop(0.25, 'rgba(7,  28, 55, 0.93)');
      grd.addColorStop(0.6,  'rgba(4,  16, 32, 0.97)');
      grd.addColorStop(1,    'rgba(2,   8, 16, 0.99)');
    }

    context.fillStyle = grd;
    context.beginPath();
    context.moveTo(vOne.x, vOne.height);
    context.lineTo(vTwo.x, vTwo.height);
    context.lineTo(vTwo.x, END_Y);
    context.lineTo(vOne.x, END_Y);
    context.closePath();
    context.fill();
  }

  function drawWater() {
    for (let i = 0; i < springs.length - 1; i++) {
      connectSprings(springs[i], springs[i + 1]);
    }

    // Soft cap so the water body reads as moving, not just the line.
    const isLightMode = document.body.classList.contains('light');
    context.save();
    context.fillStyle = isLightMode ? 'rgba(80, 170, 240, 0.32)' : 'rgba(22, 96, 138, 0.28)';
    context.beginPath();
    for (let i = 0; i < springs.length; i++) {
      const y = springs[i].height;
      if (i === 0) context.moveTo(springs[i].x, y);
      else context.lineTo(springs[i].x, y);
    }
    for (let i = springs.length - 1; i >= 0; i--) {
      context.lineTo(springs[i].x, springs[i].height + 18);
    }
    context.closePath();
    context.fill();
    context.restore();

    context.save();
    context.fillStyle = 'rgba(41, 162, 198, 0.12)';
    context.beginPath();
    for (let i = 0; i < springs.length; i++) {
      const y = springs[i].height + 6;
      if (i === 0) context.moveTo(springs[i].x, y);
      else context.lineTo(springs[i].x, y);
    }
    for (let i = springs.length - 1; i >= 0; i--) {
      context.lineTo(springs[i].x, springs[i].height + 26);
    }
    context.closePath();
    context.fill();
    context.restore();

    // Surface shimmer
    context.save();
    context.strokeStyle = document.body.classList.contains('light')
      ? 'rgba(120, 210, 255, 0.55)'
      : 'rgba(36, 227, 239, 0.32)';
    context.lineWidth   = 1.8;
    context.beginPath();
    for (let i = 0; i < springs.length; i++) {
      if (i === 0) context.moveTo(springs[i].x, springs[i].height);
      else         context.lineTo(springs[i].x, springs[i].height);
    }
    context.stroke();
    context.restore();
  }

  // ── Splash ───────────────────────────────────────────────────────────────────

  function splash(index, speed) {
    if (index >= 0 && index < springs.length) {
      springs[index].speed = speed;
    }
  }

  canvas.addEventListener('mousedown', function (e) {
    const y = e.clientY;
    if (y >= HEIGHT - 80) {
      const idx = Math.floor(e.clientX / WAVE_FREQ);
      splash(idx, -18);
    }
  });

  // ── Animation loop ───────────────────────────────────────────────────────────

  function animate(time) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    updateWater();
    drawWater();
    updateBoatMotion(time);
    requestAnimationFrame(animate);
  }

  // ── Init / resize ────────────────────────────────────────────────────────────

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    initSprings();
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(animate);
})();
