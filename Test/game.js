const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const TAU = Math.PI * 2;
const FIXED_DT = 1 / 60;

class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.muted = false;
    this.unlocked = false;
    this.lastError = "";
  }

  ensure() {
    if (this.muted) {
      return false;
    }

    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        return false;
      }
      this.context = new AudioContext();
      this.compressor = this.context.createDynamicsCompressor();
      this.master = this.context.createGain();
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 3;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.2;
      this.master.gain.value = 0.24;
      this.compressor.connect(this.master);
      this.master.connect(this.context.destination);
    }

    if (this.context.state === "suspended") {
      this.context.resume();
    }

    return true;
  }

  unlock() {
    if (!this.ensure() || this.unlocked) {
      return;
    }

    try {
      const now = this.context.currentTime;
      const osc = this.context.createOscillator();
      const amp = this.context.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, now);
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.linearRampToValueAtTime(0.0015, now + 0.01);
      amp.gain.linearRampToValueAtTime(0.0001, now + 0.03);
      osc.connect(amp);
      amp.connect(this.compressor);
      osc.start(now);
      osc.stop(now + 0.04);
      this.unlocked = true;
      this.lastError = "";
    } catch (error) {
      this.lastError = String(error);
    }
  }

  connectWithPan(source, pan) {
    if (typeof this.context.createStereoPanner === "function") {
      const panner = this.context.createStereoPanner();
      panner.pan.value = pan;
      source.connect(panner);
      panner.connect(this.compressor);
      return;
    }

    source.connect(this.compressor);
  }

  tone({ type = "sine", frequency = 440, frequencyEnd = frequency, duration = 0.12, gain = 0.1, pan = 0 }) {
    if (!this.ensure()) {
      return;
    }

    try {
      const now = this.context.currentTime;
      const osc = this.context.createOscillator();
      const amp = this.context.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequencyEnd), now + duration);

      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(gain, now + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(amp);
      this.connectWithPan(amp, pan);

      osc.start(now);
      osc.stop(now + duration + 0.02);
      this.lastError = "";
    } catch (error) {
      this.lastError = String(error);
    }
  }

  launch(pan) {
    this.tone({ type: "triangle", frequency: 660, frequencyEnd: 420, duration: 0.08, gain: 0.11, pan });
  }

  hit(pan) {
    this.tone({ type: "square", frequency: 250, frequencyEnd: 180, duration: 0.07, gain: 0.12, pan });
  }

  break(pan) {
    this.tone({ type: "sawtooth", frequency: 320, frequencyEnd: 120, duration: 0.18, gain: 0.14, pan });
    this.tone({ type: "triangle", frequency: 700, frequencyEnd: 220, duration: 0.16, gain: 0.09, pan: pan * 0.7 });
  }

  pickup(pan) {
    this.tone({ type: "triangle", frequency: 580, frequencyEnd: 900, duration: 0.14, gain: 0.1, pan });
  }

  sweep() {
    this.tone({ type: "triangle", frequency: 180, frequencyEnd: 360, duration: 0.25, gain: 0.12, pan: 0 });
  }

  lose() {
    this.tone({ type: "sawtooth", frequency: 180, frequencyEnd: 70, duration: 0.4, gain: 0.18, pan: 0 });
  }
}

const audio = new AudioEngine();

const state = {
  width: 0,
  height: 0,
  dpr: Math.max(1, window.devicePixelRatio || 1),
  wallPadding: 16,
  topPadding: 92,
  safeBottom: 32,
  boardWidth: 0,
  boardLeft: 0,
  boardRight: 0,
  cannonX: 0,
  cannonY: 0,
  loseLineY: 0,
  brickSize: 0,
  brickGap: 10,
  rowStep: 0,
  cols: 6,
  ballRadius: 6,
  ballSpeed: 660,
  ballCount: 12,
  turn: 1,
  score: 0,
  mode: "ready",
  aimDir: { x: 0, y: -1 },
  aiming: false,
  hintAlpha: 1,
  launchQueue: 0,
  launchTimer: 0,
  launchSpacing: 0.055,
  launchedBalls: 0,
  pendingCannonX: null,
  balls: [],
  bricks: [],
  pickups: [],
  particles: [],
  screenShake: 0,
  backgroundOrbs: [],
  deterministicMode: false,
  firstInteraction: false,
  gameOverTimer: 0
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function updateCanvasSize() {
  const previousWidth = state.width || window.innerWidth;
  const previousHeight = state.height || window.innerHeight;
  const rect = canvas.getBoundingClientRect();

  state.width = Math.max(360, rect.width || window.innerWidth);
  state.height = Math.max(640, rect.height || window.innerHeight);
  state.dpr = Math.max(1, window.devicePixelRatio || 1);

  canvas.width = Math.round(state.width * state.dpr);
  canvas.height = Math.round(state.height * state.dpr);

  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

  const horizontalPadding = Math.min(24, state.width * 0.05);
  const totalGap = state.brickGap * (state.cols - 1);
  state.boardWidth = Math.min(state.width - horizontalPadding * 2, 480);
  state.boardLeft = (state.width - state.boardWidth) / 2;
  state.boardRight = state.boardLeft + state.boardWidth;
  state.brickSize = (state.boardWidth - totalGap) / state.cols;
  state.rowStep = state.brickSize + state.brickGap;
  state.cannonY = state.height - Math.max(88, state.height * 0.11);
  state.loseLineY = state.cannonY - state.rowStep * 0.45;

  if (!state.cannonX) {
    state.cannonX = state.width / 2;
  } else {
    const ratio = state.width / previousWidth;
    state.cannonX = clamp(state.cannonX * ratio, state.boardLeft + 24, state.boardRight - 24);
  }

  const scaleX = state.width / previousWidth;
  const scaleY = state.height / previousHeight;

  for (const ball of state.balls) {
    ball.x *= scaleX;
    ball.y *= scaleY;
  }

  for (const brick of state.bricks) {
    brick.x *= scaleX;
    brick.y *= scaleY;
    brick.w = state.brickSize;
    brick.h = state.brickSize;
  }

  for (const pickup of state.pickups) {
    pickup.x *= scaleX;
    pickup.y *= scaleY;
  }

  if (!state.backgroundOrbs.length) {
    state.backgroundOrbs = Array.from({ length: 12 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: rand(40, 120),
      hue: rand(180, 340),
      alpha: rand(0.08, 0.18)
    }));
  }
}

function createBrick(col, rowIndex, hp) {
  const x = state.boardLeft + col * (state.brickSize + state.brickGap);
  const y = state.topPadding + rowIndex * state.rowStep;
  const hue = (col * 36 + state.turn * 18 + rand(-10, 10)) % 360;

  return {
    x,
    y,
    w: state.brickSize,
    h: state.brickSize,
    hp,
    maxHp: hp,
    hue,
    flash: 0
  };
}

function spawnRowAtY(rowY) {
  const occupied = new Set();
  const bricksInRow = Math.floor(rand(3, 6.8));
  const baseHp = Math.max(1, Math.floor(state.turn * 0.8));

  for (let i = 0; i < bricksInRow; i += 1) {
    let col = Math.floor(rand(0, state.cols));
    while (occupied.has(col)) {
      col = Math.floor(rand(0, state.cols));
    }
    occupied.add(col);
    const hp = baseHp + Math.floor(rand(0, 3));
    const brick = createBrick(col, 0, hp);
    brick.y = rowY;
    state.bricks.push(brick);
  }

  if (Math.random() < 0.7) {
    const available = [];
    for (let col = 0; col < state.cols; col += 1) {
      if (!occupied.has(col)) {
        available.push(col);
      }
    }
    if (available.length) {
      const pickupCol = available[Math.floor(rand(0, available.length))];
      state.pickups.push({
        x: state.boardLeft + pickupCol * (state.brickSize + state.brickGap) + state.brickSize / 2,
        y: rowY + state.brickSize / 2,
        radius: state.brickSize * 0.22,
        pulse: rand(0, TAU)
      });
    }
  }
}

function spawnRow(atTop = true) {
  spawnRowAtY(state.topPadding + (atTop ? 0 : 3) * state.rowStep);
}

function seedBoard() {
  state.bricks = [];
  state.pickups = [];
  for (let row = 0; row < 3; row += 1) {
    spawnRowAtY(state.topPadding + row * state.rowStep);
  }
}

function restartGame() {
  state.ballCount = 12;
  state.turn = 1;
  state.score = 0;
  state.mode = "ready";
  state.aimDir = { x: 0, y: -1 };
  state.aiming = false;
  state.launchQueue = 0;
  state.launchTimer = 0;
  state.launchedBalls = 0;
  state.pendingCannonX = null;
  state.balls = [];
  state.particles = [];
  state.screenShake = 0;
  state.hintAlpha = 1;
  state.gameOverTimer = 0;
  state.cannonX = state.width / 2;
  seedBoard();
}

function launchBall() {
  const jitter = rand(-0.015, 0.015);
  const angle = Math.atan2(state.aimDir.y, state.aimDir.x) + jitter;
  const vx = Math.cos(angle) * state.ballSpeed;
  const vy = Math.sin(angle) * state.ballSpeed;
  state.balls.push({
    x: state.cannonX,
    y: state.cannonY - 18,
    vx,
    vy,
    r: state.ballRadius,
    glow: rand(0.85, 1.25)
  });
  state.launchQueue -= 1;
  state.launchedBalls += 1;
  audio.launch((state.cannonX / state.width) * 1.4 - 0.7);
}

function startVolley() {
  if (state.mode !== "ready") {
    return;
  }

  state.mode = "firing";
  state.launchQueue = state.ballCount;
  state.launchTimer = 0;
  state.launchedBalls = 0;
  state.pendingCannonX = null;
  state.hintAlpha = 0;
}

function addBurst(x, y, hue, strength = 1, count = 10) {
  for (let i = 0; i < count; i += 1) {
    const angle = rand(0, TAU);
    const speed = rand(40, 180) * strength;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.18, 0.42),
      maxLife: 0.42,
      size: rand(2, 5) * strength,
      hue: hue + rand(-10, 10)
    });
  }
}

function addScreenShake(amount) {
  state.screenShake = Math.max(state.screenShake, amount);
}

function collectPickup(index) {
  const pickup = state.pickups[index];
  state.ballCount += 1;
  state.score += 25;
  addBurst(pickup.x, pickup.y, 55, 1.2, 16);
  addScreenShake(4);
  audio.pickup((pickup.x / state.width) * 1.4 - 0.7);
  if (navigator.vibrate) {
    navigator.vibrate(10);
  }
  state.pickups.splice(index, 1);
}

function damageBrick(index, ball) {
  const brick = state.bricks[index];
  brick.hp -= 1;
  brick.flash = 1;
  state.score += 10;
  addBurst(ball.x, ball.y, brick.hue, 0.65, 8);
  addScreenShake(2.5);
  audio.hit((brick.x / state.width) * 1.4 - 0.7);

  if (brick.hp <= 0) {
    state.score += 30;
    addBurst(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.hue, 1.4, 18);
    addScreenShake(7);
    audio.break((brick.x / state.width) * 1.4 - 0.7);
    if (navigator.vibrate) {
      navigator.vibrate(8);
    }
    state.bricks.splice(index, 1);
  }
}

function reflectBallFromBrick(ball, brick, previousX, previousY) {
  const left = brick.x;
  const right = brick.x + brick.w;
  const top = brick.y;
  const bottom = brick.y + brick.h;

  if (previousY + ball.r <= top) {
    ball.y = top - ball.r - 0.5;
    ball.vy = -Math.abs(ball.vy);
    return;
  }
  if (previousY - ball.r >= bottom) {
    ball.y = bottom + ball.r + 0.5;
    ball.vy = Math.abs(ball.vy);
    return;
  }
  if (previousX + ball.r <= left) {
    ball.x = left - ball.r - 0.5;
    ball.vx = -Math.abs(ball.vx);
    return;
  }
  if (previousX - ball.r >= right) {
    ball.x = right + ball.r + 0.5;
    ball.vx = Math.abs(ball.vx);
    return;
  }

  const centerX = brick.x + brick.w / 2;
  const centerY = brick.y + brick.h / 2;
  const dx = ball.x - centerX;
  const dy = ball.y - centerY;
  if (Math.abs(dx) > Math.abs(dy)) {
    ball.vx *= -1;
  } else {
    ball.vy *= -1;
  }
}

function updateBall(ball, dt) {
  const previousX = ball.x;
  const previousY = ball.y;

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.x - ball.r <= state.wallPadding) {
    ball.x = state.wallPadding + ball.r;
    ball.vx = Math.abs(ball.vx);
    audio.hit(-0.75);
  } else if (ball.x + ball.r >= state.width - state.wallPadding) {
    ball.x = state.width - state.wallPadding - ball.r;
    ball.vx = -Math.abs(ball.vx);
    audio.hit(0.75);
  }

  if (ball.y - ball.r <= state.topPadding - 32) {
    ball.y = state.topPadding - 32 + ball.r;
    ball.vy = Math.abs(ball.vy);
    audio.hit(0);
  }

  for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
    const pickup = state.pickups[i];
    const dx = ball.x - pickup.x;
    const dy = ball.y - pickup.y;
    const distSq = dx * dx + dy * dy;
    const radius = ball.r + pickup.radius;
    if (distSq <= radius * radius) {
      collectPickup(i);
      break;
    }
  }

  for (let i = state.bricks.length - 1; i >= 0; i -= 1) {
    const brick = state.bricks[i];
    const nearestX = clamp(ball.x, brick.x, brick.x + brick.w);
    const nearestY = clamp(ball.y, brick.y, brick.y + brick.h);
    const dx = ball.x - nearestX;
    const dy = ball.y - nearestY;
    if (dx * dx + dy * dy <= ball.r * ball.r) {
      reflectBallFromBrick(ball, brick, previousX, previousY);
      damageBrick(i, ball);
      break;
    }
  }

  if (ball.y >= state.cannonY && ball.vy > 0) {
    if (state.pendingCannonX === null) {
      state.pendingCannonX = clamp(ball.x, state.boardLeft + 24, state.boardRight - 24);
    }
    addBurst(ball.x, state.cannonY, 205, 0.4, 5);
    return false;
  }

  return true;
}

function advanceBoard(incrementTurn = true) {
  for (const brick of state.bricks) {
    brick.y += state.rowStep;
  }
  for (const pickup of state.pickups) {
    pickup.y += state.rowStep;
  }

  if (incrementTurn) {
    state.turn += 1;
    spawnRow(true);
    audio.sweep();
  }

  const brickReachedBottom = state.bricks.some((brick) => brick.y + brick.h >= state.loseLineY);
  if (brickReachedBottom) {
    state.mode = "gameover";
    state.gameOverTimer = 0;
    audio.lose();
  }
}

function finishTurn() {
  if (state.pendingCannonX !== null) {
    state.cannonX = state.pendingCannonX;
  }
  advanceBoard(true);
  if (state.mode !== "gameover") {
    state.mode = "ready";
  }
  state.pendingCannonX = null;
}

function clampAim(dx, dy) {
  let angle = Math.atan2(dy, dx);
  angle = clamp(angle, -Math.PI + 0.22, -0.22);
  return {
    x: Math.cos(angle),
    y: Math.sin(angle)
  };
}

function pointerToCanvas(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function updateAimFromPoint(point) {
  const dx = point.x - state.cannonX;
  const dy = point.y - state.cannonY;
  if (dy > -18) {
    return;
  }
  state.aimDir = clampAim(dx, dy);
}

function buildPreviewPoints() {
  if (!state.aiming && state.mode !== "ready") {
    return [];
  }

  const points = [];
  let x = state.cannonX;
  let y = state.cannonY - 18;
  let vx = state.aimDir.x * 18;
  let vy = state.aimDir.y * 18;

  for (let i = 0; i < 90; i += 1) {
    x += vx;
    y += vy;

    if (x <= state.wallPadding + 4 || x >= state.width - state.wallPadding - 4) {
      vx *= -1;
      x = clamp(x, state.wallPadding + 4, state.width - state.wallPadding - 4);
    }
    if (y <= state.topPadding - 28) {
      vy *= -1;
      y = state.topPadding - 28;
    }

    points.push({ x, y });

    const hitBrick = state.bricks.some((brick) => x >= brick.x && x <= brick.x + brick.w && y >= brick.y && y <= brick.y + brick.h);
    if (hitBrick) {
      break;
    }
  }

  return points;
}

function drawRoundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
  gradient.addColorStop(0, "#140d31");
  gradient.addColorStop(0.55, "#1b2457");
  gradient.addColorStop(1, "#0c1834");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, state.width, state.height);

  for (const orb of state.backgroundOrbs) {
    const x = orb.x * state.width;
    const y = orb.y * state.height;
    const radial = ctx.createRadialGradient(x, y, 0, x, y, orb.r);
    radial.addColorStop(0, `hsla(${orb.hue}, 90%, 70%, ${orb.alpha})`);
    radial.addColorStop(1, `hsla(${orb.hue}, 90%, 70%, 0)`);
    ctx.fillStyle = radial;
    ctx.beginPath();
    ctx.arc(x, y, orb.r, 0, TAU);
    ctx.fill();
  }

  for (let y = state.topPadding - 24; y < state.height; y += 28) {
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(state.width, y);
    ctx.stroke();
  }
}

function drawHud() {
  ctx.fillStyle = "rgba(8, 10, 26, 0.55)";
  drawRoundedRect(16, 16, state.width - 32, 58, 20);
  ctx.fill();

  ctx.fillStyle = "#f4f8ff";
  ctx.font = "700 16px Trebuchet MS";
  ctx.fillText(`Turn ${state.turn}`, 30, 39);
  ctx.font = "600 13px Trebuchet MS";
  ctx.fillStyle = "rgba(238, 245, 255, 0.86)";
  ctx.fillText(`${state.ballCount} balls`, 30, 57);

  ctx.textAlign = "center";
  ctx.font = "700 18px Trebuchet MS";
  ctx.fillStyle = "#fff6c4";
  ctx.fillText(`${state.score}`, state.width / 2, 50);

  ctx.textAlign = "right";
  ctx.font = "600 13px Trebuchet MS";
  ctx.fillStyle = "rgba(236, 245, 255, 0.86)";
  ctx.fillText(state.mode === "gameover" ? "Tap to restart" : "Drag, aim, release", state.width - 30, 48);
  ctx.textAlign = "left";
}

function drawBricks() {
  for (const brick of state.bricks) {
    const bright = brick.flash > 0 ? 72 : 58;
    const base = `hsl(${brick.hue}, 85%, ${bright}%)`;
    const shadow = `hsla(${brick.hue}, 95%, 70%, ${0.25 + brick.flash * 0.25})`;
    ctx.shadowColor = shadow;
    ctx.shadowBlur = 20 + brick.flash * 12;

    const gradient = ctx.createLinearGradient(brick.x, brick.y, brick.x + brick.w, brick.y + brick.h);
    gradient.addColorStop(0, `hsl(${brick.hue}, 88%, ${bright + 8}%)`);
    gradient.addColorStop(1, base);

    ctx.fillStyle = gradient;
    drawRoundedRect(brick.x, brick.y, brick.w, brick.h, 16);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 2;
    drawRoundedRect(brick.x, brick.y, brick.w, brick.h, 16);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 20px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${brick.hp}`, brick.x + brick.w / 2, brick.y + brick.h / 2 + 1);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawPickups(time) {
  for (const pickup of state.pickups) {
    const pulse = 0.5 + Math.sin(time * 0.006 + pickup.pulse) * 0.15;
    ctx.shadowColor = "rgba(255, 226, 98, 0.5)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = `rgba(255, 225, 86, ${0.82 + pulse * 0.18})`;
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y, pickup.radius * (1 + pulse * 0.16), 0, TAU);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y, pickup.radius * 0.96, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pickup.x - pickup.radius * 0.45, pickup.y);
    ctx.lineTo(pickup.x + pickup.radius * 0.45, pickup.y);
    ctx.moveTo(pickup.x, pickup.y - pickup.radius * 0.45);
    ctx.lineTo(pickup.x, pickup.y + pickup.radius * 0.45);
    ctx.stroke();
  }
}

function drawTrajectory() {
  if (state.mode !== "ready") {
    return;
  }
  const points = buildPreviewPoints();
  if (!points.length) {
    return;
  }

  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(state.cannonX, state.cannonY - 16);
  for (const point of points) {
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = 0; i < points.length; i += 6) {
    const point = points[i];
    const alpha = 1 - i / points.length;
    ctx.fillStyle = `rgba(255,255,255,${alpha * 0.75})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2 + alpha * 2.5, 0, TAU);
    ctx.fill();
  }
}

function drawCannon() {
  const angle = Math.atan2(state.aimDir.y, state.aimDir.x);

  ctx.save();
  ctx.translate(state.cannonX, state.cannonY);
  ctx.rotate(angle);

  const barrelGradient = ctx.createLinearGradient(-10, 0, 42, 0);
  barrelGradient.addColorStop(0, "#d3eeff");
  barrelGradient.addColorStop(1, "#53d3ff");
  ctx.fillStyle = barrelGradient;
  drawRoundedRect(-10, -10, 42, 20, 10);
  ctx.fill();

  ctx.restore();

  const baseGradient = ctx.createRadialGradient(state.cannonX, state.cannonY, 4, state.cannonX, state.cannonY, 28);
  baseGradient.addColorStop(0, "#ffffff");
  baseGradient.addColorStop(0.55, "#88e7ff");
  baseGradient.addColorStop(1, "#1ca4dd");
  ctx.fillStyle = baseGradient;
  ctx.beginPath();
  ctx.arc(state.cannonX, state.cannonY, 22, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath();
  ctx.arc(state.cannonX - 7, state.cannonY - 8, 7, 0, TAU);
  ctx.fill();
}

function drawBalls() {
  for (const ball of state.balls) {
    ctx.shadowColor = "rgba(104, 234, 255, 0.72)";
    ctx.shadowBlur = 16;
    const gradient = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, ball.r * 2.2);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.5, "#aef6ff");
    gradient.addColorStop(1, "#5cc6ff");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r * ball.glow, 0, TAU);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawParticles() {
  for (const particle of state.particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = `hsla(${particle.hue}, 95%, 70%, ${alpha})`;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
    ctx.fill();
  }
}

function drawLoseLine() {
  ctx.strokeStyle = "rgba(255, 120, 120, 0.35)";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(20, state.loseLineY);
  ctx.lineTo(state.width - 20, state.loseLineY);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawHint() {
  if (state.hintAlpha <= 0.01 || state.mode !== "ready") {
    return;
  }

  ctx.fillStyle = `rgba(255,255,255,${state.hintAlpha * 0.82})`;
  ctx.textAlign = "center";
  ctx.font = "700 18px Trebuchet MS";
  ctx.fillText("Drag from the cannon and release", state.width / 2, state.height - 36);
  ctx.textAlign = "left";
}

function drawGameOver() {
  if (state.mode !== "gameover") {
    return;
  }

  const alpha = clamp(state.gameOverTimer / 0.6, 0, 1);
  ctx.fillStyle = `rgba(7, 6, 20, ${0.28 + alpha * 0.28})`;
  ctx.fillRect(0, 0, state.width, state.height);

  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.textAlign = "center";
  ctx.font = "700 34px Trebuchet MS";
  ctx.fillText("Wave Crashed In", state.width / 2, state.height * 0.42);
  ctx.font = "600 18px Trebuchet MS";
  ctx.fillText("Tap anywhere to restart", state.width / 2, state.height * 0.42 + 34);
  ctx.fillText(`Final score ${state.score}`, state.width / 2, state.height * 0.42 + 64);
  ctx.textAlign = "left";
}

function update(dt) {
  if (state.mode === "gameover") {
    state.gameOverTimer += dt;
  }

  state.screenShake = Math.max(0, state.screenShake - dt * 16);
  state.hintAlpha = Math.max(0, state.hintAlpha - dt * 0.06);

  if (state.mode === "firing") {
    state.launchTimer -= dt;
    while (state.launchQueue > 0 && state.launchTimer <= 0) {
      launchBall();
      state.launchTimer += state.launchSpacing;
    }
  }

  for (let i = state.balls.length - 1; i >= 0; i -= 1) {
    const alive = updateBall(state.balls[i], dt);
    if (!alive) {
      state.balls.splice(i, 1);
    }
  }

  if (state.mode === "firing" && state.launchQueue <= 0 && state.balls.length === 0) {
    finishTurn();
  }

  for (const brick of state.bricks) {
    brick.flash = Math.max(0, brick.flash - dt * 8);
  }

  for (const pickup of state.pickups) {
    pickup.pulse += dt * 3;
  }

  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const particle = state.particles[i];
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.96;
    particle.vy *= 0.96;
    particle.size *= 0.992;
    if (particle.life <= 0) {
      state.particles.splice(i, 1);
    }
  }
}

function render(time = performance.now()) {
  ctx.clearRect(0, 0, state.width, state.height);

  const shakeX = rand(-state.screenShake, state.screenShake);
  const shakeY = rand(-state.screenShake, state.screenShake);

  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawBackground();
  drawHud();
  drawLoseLine();
  drawBricks();
  drawPickups(time);
  drawTrajectory();
  drawCannon();
  drawBalls();
  drawParticles();
  drawHint();
  drawGameOver();

  ctx.restore();
}

function gameToText() {
  return JSON.stringify({
    coordinateSystem: "origin top-left, +x right, +y down",
    mode: state.mode,
    turn: state.turn,
    score: state.score,
    ballCount: state.ballCount,
    activeBalls: state.balls.length,
    launchQueue: state.launchQueue,
    cannon: {
      x: Number(state.cannonX.toFixed(1)),
      y: Number(state.cannonY.toFixed(1))
    },
    loseLineY: Number(state.loseLineY.toFixed(1)),
    bricks: state.bricks.map((brick) => ({
      x: Number(brick.x.toFixed(1)),
      y: Number(brick.y.toFixed(1)),
      w: Number(brick.w.toFixed(1)),
      h: Number(brick.h.toFixed(1)),
      hp: brick.hp
    })),
    pickups: state.pickups.map((pickup) => ({
      x: Number(pickup.x.toFixed(1)),
      y: Number(pickup.y.toFixed(1)),
      radius: Number(pickup.radius.toFixed(1))
    })),
    audio: {
      muted: audio.muted,
      unlocked: audio.unlocked,
      contextState: audio.context ? audio.context.state : "missing",
      lastError: audio.lastError
    }
  });
}

window.render_game_to_text = gameToText;
window.advanceTime = (ms) => {
  state.deterministicMode = true;
  const steps = Math.max(1, Math.round(ms / (FIXED_DT * 1000)));
  for (let i = 0; i < steps; i += 1) {
    update(FIXED_DT);
  }
  render();
};

function onPointerDown(event) {
  event.preventDefault();
  audio.unlock();
  state.firstInteraction = true;

  if (state.mode === "gameover") {
    restartGame();
    return;
  }

  if (state.mode !== "ready") {
    return;
  }

  state.aiming = true;
  updateAimFromPoint(pointerToCanvas(event));
}

function onPointerMove(event) {
  if (!state.aiming) {
    return;
  }
  event.preventDefault();
  updateAimFromPoint(pointerToCanvas(event));
}

function onPointerUp(event) {
  if (!state.aiming) {
    return;
  }
  event.preventDefault();
  updateAimFromPoint(pointerToCanvas(event));
  state.aiming = false;
  startVolley();
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen?.();
  } else {
    await document.exitFullscreen?.();
  }
}

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "f") {
    toggleFullscreen();
  }
  if (event.key.toLowerCase() === "r") {
    restartGame();
  }
  if (event.key.toLowerCase() === "m") {
    audio.muted = !audio.muted;
  }
});

window.addEventListener("resize", () => {
  updateCanvasSize();
  render();
});

let lastTime = performance.now();
function frame(now) {
  if (!state.deterministicMode) {
    const dt = Math.min(0.033, (now - lastTime) / 1000 || FIXED_DT);
    update(dt);
    render(now);
  }
  lastTime = now;
  window.requestAnimationFrame(frame);
}

updateCanvasSize();
restartGame();
render();
window.requestAnimationFrame(frame);
