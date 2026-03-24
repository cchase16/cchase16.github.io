const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const TAU = Math.PI * 2;
const FIXED_DT = 1 / 60;
const THEME = {
  fonts: {
    display: "'Arial Black', 'Segoe UI Black', 'Trebuchet MS', sans-serif",
    body: "'Trebuchet MS', 'Avenir Next', sans-serif"
  },
  hud: { height: 72, radius: 26, marginX: 18, marginTop: 16 },
  bg: {
    top: "#120727",
    mid: "#27115a",
    bottom: "#16062d",
    ribbonA: "rgba(112, 240, 255, 0.20)",
    ribbonB: "rgba(255, 96, 236, 0.14)"
  },
  cannon: { core: "#ffffff", cyan: "#7ef5ff", blue: "#61a8ff" },
  trajectory: { core: "#dffcff", glow: "#62deff", outer: "rgba(118, 233, 255, 0.28)" },
  loseLine: "rgba(255, 176, 134, 0.34)",
  brickRadius: 18
};

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
    if (this.muted) return false;
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
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
    if (!this.ensure() || this.unlocked) return;
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
    if (!this.ensure()) return;
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

  launch(pan) { this.tone({ type: "triangle", frequency: 660, frequencyEnd: 420, duration: 0.08, gain: 0.11, pan }); }
  hit(pan) { this.tone({ type: "square", frequency: 250, frequencyEnd: 180, duration: 0.07, gain: 0.12, pan }); }
  break(pan) {
    this.tone({ type: "sawtooth", frequency: 320, frequencyEnd: 120, duration: 0.18, gain: 0.14, pan });
    this.tone({ type: "triangle", frequency: 700, frequencyEnd: 220, duration: 0.16, gain: 0.09, pan: pan * 0.7 });
    this.tone({ type: "square", frequency: 180, frequencyEnd: 70, duration: 0.11, gain: 0.12, pan: pan * 0.35 });
    this.tone({ type: "triangle", frequency: 110, frequencyEnd: 60, duration: 0.16, gain: 0.08, pan: pan * 0.18 });
  }
  pickup(pan) { this.tone({ type: "triangle", frequency: 580, frequencyEnd: 900, duration: 0.14, gain: 0.1, pan }); }
  sweep() { this.tone({ type: "triangle", frequency: 180, frequencyEnd: 360, duration: 0.25, gain: 0.12, pan: 0 }); }
  lose() { this.tone({ type: "sawtooth", frequency: 180, frequencyEnd: 70, duration: 0.4, gain: 0.18, pan: 0 }); }
}

const audio = new AudioEngine();

const state = {
  width: 0,
  height: 0,
  dpr: Math.max(1, window.devicePixelRatio || 1),
  wallPadding: 16,
  topPadding: 100,
  boardWidth: 0,
  boardLeft: 0,
  boardRight: 0,
  cannonX: 0,
  cannonY: 0,
  loseLineY: 0,
  brickSize: 0,
  brickGap: 12,
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
  pendingCannonX: null,
  balls: [],
  bricks: [],
  pickups: [],
  particles: [],
  sparks: [],
  popups: [],
  screenShake: 0,
  backgroundOrbs: [],
  stars: [],
  deterministicMode: false,
  firstInteraction: false,
  gameOverTimer: 0,
  ribbonPhase: 0,
  trajectoryJitter: 0,
  cannonPulse: 0
};

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(min, max) { return Math.random() * (max - min) + min; }

function toRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const size = value.length === 3 ? 1 : 2;
  const expand = (chunk) => size === 1 ? chunk + chunk : chunk;
  const r = parseInt(expand(value.slice(0, size)), 16);
  const g = parseInt(expand(value.slice(size, size * 2)), 16);
  const b = parseInt(expand(value.slice(size * 2, size * 3)), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function brickPalette(hue) {
  const palettes = [
    { base: "#ff8b42", dark: "#ff5f4b", light: "#ffd07d" },
    { base: "#ffe85a", dark: "#ffca3c", light: "#fff6af" },
    { base: "#92ff3d", dark: "#43ea5e", light: "#d9ff8f" },
    { base: "#3effa5", dark: "#29d9d1", light: "#abffea" },
    { base: "#61c5ff", dark: "#497bff", light: "#b8f0ff" },
    { base: "#ff68cf", dark: "#ff4a8a", light: "#ffb1fb" }
  ];
  return palettes[Math.abs(Math.floor(hue / 60)) % palettes.length];
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

function drawSpacedText(text, x, y, spacing) {
  let offset = 0;
  for (const char of String(text)) {
    ctx.fillText(char, x + offset, y);
    offset += ctx.measureText(char).width + spacing;
  }
}

function measureSpacedText(text, spacing) {
  let width = 0;
  const chars = String(text).split("");
  for (let i = 0; i < chars.length; i += 1) {
    width += ctx.measureText(chars[i]).width;
    if (i < chars.length - 1) {
      width += spacing;
    }
  }
  return width;
}

function drawGlassPanel(x, y, w, h, radius) {
  const fill = ctx.createLinearGradient(x, y, x, y + h);
  fill.addColorStop(0, "rgba(111, 62, 166, 0.34)");
  fill.addColorStop(1, "rgba(45, 18, 77, 0.45)");
  ctx.shadowColor = "rgba(53, 208, 255, 0.18)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = fill;
  drawRoundedRect(x, y, w, h, radius);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(135, 240, 255, 0.42)";
  ctx.lineWidth = 1.8;
  drawRoundedRect(x, y, w, h, radius);
  ctx.stroke();
}

function drawRadiantBurst(x, y, radius, colorA, colorB, spikeAlpha = 0.45) {
  const gradient = ctx.createRadialGradient(x, y, radius * 0.12, x, y, radius);
  gradient.addColorStop(0, colorA);
  gradient.addColorStop(0.45, colorB);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  for (let i = 0; i < 12; i += 1) {
    ctx.rotate(TAU / 12);
    ctx.strokeStyle = `rgba(255,255,255,${spikeAlpha - i * 0.02})`;
    ctx.lineWidth = i % 3 === 0 ? 1.8 : 1;
    ctx.beginPath();
    ctx.moveTo(radius * 0.32, 0);
    ctx.lineTo(radius * (0.86 + (i % 3) * 0.22), 0);
    ctx.stroke();
  }
  ctx.restore();
}

function addSpark(x, y, hue, speedScale = 1, lifeScale = 1) {
  state.sparks.push({
    x, y,
    vx: rand(-60, 60) * speedScale,
    vy: rand(-60, 60) * speedScale,
    life: rand(0.16, 0.42) * lifeScale,
    maxLife: 0.42 * lifeScale,
    size: rand(1.8, 4.8),
    hue
  });
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
  state.boardWidth = Math.min(state.width - horizontalPadding * 2, 500);
  state.boardLeft = (state.width - state.boardWidth) / 2;
  state.boardRight = state.boardLeft + state.boardWidth;
  state.brickSize = (state.boardWidth - totalGap) / state.cols;
  state.rowStep = state.brickSize + state.brickGap;
  state.cannonY = state.height - Math.max(88, state.height * 0.115);
  state.loseLineY = state.cannonY - state.rowStep * 0.42;
  state.topPadding = Math.max(96, THEME.hud.marginTop + THEME.hud.height + 22);

  if (!state.cannonX) {
    state.cannonX = state.width / 2;
  } else {
    const ratio = state.width / previousWidth;
    state.cannonX = clamp(state.cannonX * ratio, state.boardLeft + 24, state.boardRight - 24);
  }

  const scaleX = state.width / previousWidth;
  const scaleY = state.height / previousHeight;
  for (const group of [state.balls, state.bricks, state.pickups, state.particles, state.sparks]) {
    for (const item of group) {
      item.x *= scaleX;
      item.y *= scaleY;
      if ("w" in item) item.w = state.brickSize;
      if ("h" in item) item.h = state.brickSize;
    }
  }

  if (!state.backgroundOrbs.length) {
    state.backgroundOrbs = Array.from({ length: 16 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: rand(70, 190),
      hue: rand(190, 330),
      alpha: rand(0.04, 0.13)
    }));
  }
  if (!state.stars.length) {
    state.stars = Array.from({ length: 90 }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: rand(0.8, 3.4),
      hue: rand(180, 340),
      alpha: rand(0.14, 0.8),
      twinkle: rand(0, TAU)
    }));
  }
}

function createBrick(col, rowIndex, hp) {
  return {
    x: state.boardLeft + col * (state.brickSize + state.brickGap),
    y: state.topPadding + rowIndex * state.rowStep,
    w: state.brickSize,
    h: state.brickSize,
    hp,
    maxHp: hp,
    hue: rand(0, 360),
    flash: 0,
    crackSeed: rand(0, TAU)
  };
}

function spawnRowAtY(rowY) {
  const occupied = new Set();
  const bricksInRow = Math.floor(rand(3, 6.8));
  const baseHp = Math.max(1, Math.floor(state.turn * 0.8));
  for (let i = 0; i < bricksInRow; i += 1) {
    let col = Math.floor(rand(0, state.cols));
    while (occupied.has(col)) col = Math.floor(rand(0, state.cols));
    occupied.add(col);
    const hp = baseHp + Math.floor(rand(0, 3));
    const brick = createBrick(col, 0, hp);
    brick.y = rowY;
    brick.hue = ((col * 55) + rowY * 0.08 + state.turn * 22) % 360;
    state.bricks.push(brick);
  }
  if (Math.random() < 0.7) {
    const available = [];
    for (let col = 0; col < state.cols; col += 1) if (!occupied.has(col)) available.push(col);
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

function spawnRow(atTop = true) { spawnRowAtY(state.topPadding + (atTop ? 0 : 3) * state.rowStep); }
function seedBoard() {
  state.bricks = [];
  state.pickups = [];
  for (let row = 0; row < 3; row += 1) spawnRowAtY(state.topPadding + row * state.rowStep);
}

function restartGame() {
  state.ballCount = 12;
  state.turn = 1;
  state.score = 0;
  state.mode = "ready";
  state.aimDir = { x: 0, y: -1 };
  state.aiming = false;
  state.hintAlpha = 1;
  state.launchQueue = 0;
  state.launchTimer = 0;
  state.pendingCannonX = null;
  state.balls = [];
  state.particles = [];
  state.sparks = [];
  state.popups = [];
  state.screenShake = 0;
  state.gameOverTimer = 0;
  state.ribbonPhase = 0;
  state.trajectoryJitter = rand(0, TAU);
  state.cannonPulse = rand(0, TAU);
  state.cannonX = state.width / 2;
  seedBoard();
}

function launchBall() {
  const jitter = rand(-0.015, 0.015);
  const angle = Math.atan2(state.aimDir.y, state.aimDir.x) + jitter;
  state.balls.push({
    x: state.cannonX,
    y: state.cannonY - 18,
    vx: Math.cos(angle) * state.ballSpeed,
    vy: Math.sin(angle) * state.ballSpeed,
    r: state.ballRadius,
    glow: rand(0.85, 1.25)
  });
  for (let i = 0; i < 3; i += 1) addSpark(state.cannonX, state.cannonY - 10, rand(180, 330), 1.8, 0.8);
  state.launchQueue -= 1;
  audio.launch((state.cannonX / state.width) * 1.4 - 0.7);
}

function startVolley() {
  if (state.mode !== "ready") return;
  state.mode = "firing";
  state.launchQueue = state.ballCount;
  state.launchTimer = 0;
  state.pendingCannonX = null;
  state.hintAlpha = 0;
}

function addBurst(x, y, hue, strength = 1, count = 10) {
  for (let i = 0; i < count; i += 1) {
    const angle = rand(0, TAU);
    const speed = rand(40, 180) * strength;
    state.particles.push({
      kind: "burst",
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.18, 0.42),
      maxLife: 0.42,
      size: rand(2, 5) * strength,
      hue: hue + rand(-14, 14)
    });
  }
  for (let i = 0; i < Math.ceil(count * 0.7); i += 1) addSpark(x, y, hue + rand(-18, 18), 2 * strength, 0.85);
}

function addDebrisBurst(x, y, hue, brickSize, count = 10) {
  for (let i = 0; i < count; i += 1) {
    const angle = rand(-Math.PI, 0);
    const speed = rand(80, 240);
    const spin = rand(-7, 7);
    state.particles.push({
      kind: "debris",
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - rand(20, 70),
      life: rand(0.55, 0.95),
      maxLife: 0.95,
      size: rand(brickSize * 0.07, brickSize * 0.14),
      width: rand(brickSize * 0.09, brickSize * 0.2),
      height: rand(brickSize * 0.07, brickSize * 0.15),
      rotation: rand(0, TAU),
      spin,
      gravity: rand(340, 520),
      hue: hue + rand(-10, 10)
    });
  }
}

function addNumberPopup(x, y, value, hue) {
  state.popups.push({
    x,
    y,
    value: String(value),
    hue,
    life: 1.05,
    maxLife: 1.05,
    vy: rand(-42, -28),
    drift: rand(-18, 18)
  });
}

function addScreenShake(amount) { state.screenShake = Math.max(state.screenShake, amount); }

function collectPickup(index) {
  const pickup = state.pickups[index];
  state.ballCount += 1;
  state.score += 25;
  addBurst(pickup.x, pickup.y, 48, 1.35, 18);
  addScreenShake(4);
  audio.pickup((pickup.x / state.width) * 1.4 - 0.7);
  if (navigator.vibrate) navigator.vibrate(10);
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
    const centerX = brick.x + brick.w / 2;
    const centerY = brick.y + brick.h / 2;
    const brokeValue = brick.maxHp;
    state.score += 30;
    addBurst(centerX, centerY, brick.hue, 1.8, 28);
    addDebrisBurst(centerX, centerY, brick.hue, brick.w, 12);
    addNumberPopup(centerX, centerY - brick.h * 0.08, brokeValue, brick.hue);
    addScreenShake(7);
    audio.break((brick.x / state.width) * 1.4 - 0.7);
    if (navigator.vibrate) navigator.vibrate(8);
    state.bricks.splice(index, 1);
  }
}

function reflectBallFromBrick(ball, brick, previousX, previousY) {
  const left = brick.x;
  const right = brick.x + brick.w;
  const top = brick.y;
  const bottom = brick.y + brick.h;
  if (previousY + ball.r <= top) { ball.y = top - ball.r - 0.5; ball.vy = -Math.abs(ball.vy); return; }
  if (previousY - ball.r >= bottom) { ball.y = bottom + ball.r + 0.5; ball.vy = Math.abs(ball.vy); return; }
  if (previousX + ball.r <= left) { ball.x = left - ball.r - 0.5; ball.vx = -Math.abs(ball.vx); return; }
  if (previousX - ball.r >= right) { ball.x = right + ball.r + 0.5; ball.vx = Math.abs(ball.vx); return; }
  const centerX = brick.x + brick.w / 2;
  const centerY = brick.y + brick.h / 2;
  if (Math.abs(ball.x - centerX) > Math.abs(ball.y - centerY)) ball.vx *= -1;
  else ball.vy *= -1;
}

function updateBall(ball, dt) {
  const previousX = ball.x;
  const previousY = ball.y;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.x - ball.r <= state.wallPadding) {
    ball.x = state.wallPadding + ball.r;
    ball.vx = Math.abs(ball.vx);
    addSpark(ball.x, ball.y, 205, 0.8, 0.6);
    audio.hit(-0.75);
  } else if (ball.x + ball.r >= state.width - state.wallPadding) {
    ball.x = state.width - state.wallPadding - ball.r;
    ball.vx = -Math.abs(ball.vx);
    addSpark(ball.x, ball.y, 205, 0.8, 0.6);
    audio.hit(0.75);
  }
  if (ball.y - ball.r <= state.topPadding - 32) {
    ball.y = state.topPadding - 32 + ball.r;
    ball.vy = Math.abs(ball.vy);
    addSpark(ball.x, ball.y, 205, 0.8, 0.6);
    audio.hit(0);
  }

  for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
    const pickup = state.pickups[i];
    const dx = ball.x - pickup.x;
    const dy = ball.y - pickup.y;
    const radius = ball.r + pickup.radius;
    if (dx * dx + dy * dy <= radius * radius) {
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
    addBurst(ball.x, state.cannonY, 205, 0.45, 5);
    return false;
  }
  return true;
}

function advanceBoard(incrementTurn = true) {
  for (const brick of state.bricks) brick.y += state.rowStep;
  for (const pickup of state.pickups) pickup.y += state.rowStep;
  if (incrementTurn) {
    state.turn += 1;
    spawnRow(true);
    audio.sweep();
  }
  if (state.bricks.some((brick) => brick.y + brick.h >= state.loseLineY)) {
    state.mode = "gameover";
    state.gameOverTimer = 0;
    audio.lose();
  }
}

function finishTurn() {
  if (state.pendingCannonX !== null) state.cannonX = state.pendingCannonX;
  advanceBoard(true);
  if (state.mode !== "gameover") state.mode = "ready";
  state.pendingCannonX = null;
}

function clampAim(dx, dy) {
  let angle = Math.atan2(dy, dx);
  angle = clamp(angle, -Math.PI + 0.22, -0.22);
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function pointerToCanvas(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function updateAimFromPoint(point) {
  const dx = point.x - state.cannonX;
  const dy = point.y - state.cannonY;
  if (dy > -18) return;
  state.aimDir = clampAim(dx, dy);
}

function buildPreviewPoints() {
  if (!state.aiming && state.mode !== "ready") return [];
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
    if (hitBrick) break;
  }
  return points;
}

function drawBackground(time) {
  const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
  gradient.addColorStop(0, THEME.bg.top);
  gradient.addColorStop(0.38, THEME.bg.mid);
  gradient.addColorStop(1, THEME.bg.bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, state.width, state.height);

  for (const orb of state.backgroundOrbs) {
    const x = orb.x * state.width;
    const y = orb.y * state.height;
    const radial = ctx.createRadialGradient(x, y, 0, x, y, orb.r);
    radial.addColorStop(0, `hsla(${orb.hue}, 95%, 68%, ${orb.alpha})`);
    radial.addColorStop(1, `hsla(${orb.hue}, 95%, 68%, 0)`);
    ctx.fillStyle = radial;
    ctx.beginPath();
    ctx.arc(x, y, orb.r, 0, TAU);
    ctx.fill();
  }

  for (let i = 0; i < 5; i += 1) {
    const ribbonY = state.height * (0.58 + i * 0.065);
    const amp = 10 + i * 3;
    const line = ctx.createLinearGradient(0, ribbonY, state.width, ribbonY);
    line.addColorStop(0, i % 2 === 0 ? THEME.bg.ribbonA : THEME.bg.ribbonB);
    line.addColorStop(0.5, "rgba(255,255,255,0.06)");
    line.addColorStop(1, i % 2 === 0 ? THEME.bg.ribbonB : THEME.bg.ribbonA);
    ctx.strokeStyle = line;
    ctx.lineWidth = 2 + i * 0.4;
    ctx.beginPath();
    for (let x = 0; x <= state.width; x += 22) {
      const y = ribbonY + Math.sin(x * 0.012 + state.ribbonPhase * (1.2 + i * 0.08) + i) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  for (const star of state.stars) {
    const alpha = star.alpha * (0.55 + 0.45 * Math.sin(time * 0.0012 + star.twinkle));
    ctx.shadowColor = `hsla(${star.hue}, 100%, 74%, ${alpha})`;
    ctx.shadowBlur = star.size * 6;
    ctx.fillStyle = `hsla(${star.hue}, 100%, 82%, ${alpha})`;
    ctx.beginPath();
    ctx.arc(star.x * state.width, star.y * state.height, star.size, 0, TAU);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  ctx.save();
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 12; i += 1) {
    const x = i * state.width / 11;
    ctx.strokeStyle = i % 2 === 0 ? "rgba(98, 246, 255, 0.30)" : "rgba(255, 104, 229, 0.24)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 80, state.height);
    ctx.lineTo(x + 120, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHud() {
  const x = THEME.hud.marginX;
  const y = THEME.hud.marginTop;
  const w = state.width - THEME.hud.marginX * 2;
  const h = THEME.hud.height;
  drawGlassPanel(x, y, w, h, THEME.hud.radius);

  const leftX = x + 22;
  const centerX = x + w / 2;
  const rightX = x + w - 22;
  const topY = y + 26;
  const bottomY = y + 51;

  ctx.textBaseline = "middle";
  ctx.shadowBlur = 8;
  ctx.shadowColor = "rgba(255,255,255,0.15)";
  ctx.fillStyle = "#f7fbff";
  ctx.font = `900 17px ${THEME.fonts.display}`;
  drawSpacedText(`Turn ${state.turn}`, leftX, topY, 0.4);

  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.font = `800 13px ${THEME.fonts.display}`;
  drawSpacedText(`${state.ballCount} balls`, leftX, bottomY, 0.2);

  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(77, 228, 255, 0.55)";
  ctx.shadowBlur = 14;
  ctx.fillStyle = "#7cefff";
  ctx.font = `900 20px ${THEME.fonts.display}`;
  const score = `${state.score}`;
  drawSpacedText(score, centerX - measureSpacedText(score, 0.7) * 0.5, y + 36, 0.7);

  const help = state.mode === "gameover" ? "Tap to restart" : "Drag, aim, release";
  ctx.textAlign = "right";
  ctx.shadowBlur = 7;
  ctx.shadowColor = "rgba(255,255,255,0.16)";
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.font = `800 13px ${THEME.fonts.display}`;
  ctx.fillText(help, rightX, y + 35);
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawCracks(brick, damageRatio) {
  if (damageRatio <= 0.01) return;
  const centerX = brick.x + brick.w * (0.38 + Math.sin(brick.crackSeed) * 0.08);
  const centerY = brick.y + brick.h * (0.42 + Math.cos(brick.crackSeed) * 0.08);
  const branches = 3 + Math.round(damageRatio * 4);

  ctx.save();
  drawRoundedRect(brick.x + 1, brick.y + 1, brick.w - 2, brick.h - 2, THEME.brickRadius - 2);
  ctx.clip();
  for (let i = 0; i < branches; i += 1) {
    const angle = brick.crackSeed + i * (TAU / branches) + Math.sin(brick.crackSeed * 2 + i) * 0.35;
    const len = brick.w * (0.15 + damageRatio * 0.32) * (0.8 + i / branches * 0.35);
    const x2 = centerX + Math.cos(angle) * len;
    const y2 = centerY + Math.sin(angle) * len;
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + damageRatio * 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const kinkX = lerp(centerX, x2, 0.55) + Math.sin(angle * 3) * 3;
    const kinkY = lerp(centerY, y2, 0.55) + Math.cos(angle * 2) * 3;
    ctx.strokeStyle = `rgba(29,0,15,${0.14 + damageRatio * 0.35})`;
    ctx.beginPath();
    ctx.moveTo(centerX + 0.5, centerY + 0.5);
    ctx.lineTo(kinkX, kinkY);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGemBrick(brick) {
  const palette = brickPalette(brick.hue);
  const damageRatio = clamp(1 - brick.hp / brick.maxHp, 0, 1);
  ctx.shadowColor = toRgba(palette.base, 0.55 + brick.flash * 0.35);
  ctx.shadowBlur = 26 + brick.flash * 12;
  const gradient = ctx.createLinearGradient(brick.x, brick.y, brick.x + brick.w, brick.y + brick.h);
  gradient.addColorStop(0, toRgba(palette.light, 0.98));
  gradient.addColorStop(0.35, toRgba(palette.base, 0.98));
  gradient.addColorStop(1, toRgba(palette.dark, 0.98));
  ctx.fillStyle = gradient;
  drawRoundedRect(brick.x, brick.y, brick.w, brick.h, THEME.brickRadius);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2.2;
  drawRoundedRect(brick.x + 1.5, brick.y + 1.5, brick.w - 3, brick.h - 3, THEME.brickRadius - 2);
  ctx.stroke();

  ctx.save();
  drawRoundedRect(brick.x + 2, brick.y + 2, brick.w - 4, brick.h - 4, THEME.brickRadius - 3);
  ctx.clip();
  const highlight = ctx.createLinearGradient(brick.x, brick.y, brick.x + brick.w, brick.y + brick.h);
  highlight.addColorStop(0, "rgba(255,255,255,0.35)");
  highlight.addColorStop(0.35, "rgba(255,255,255,0.15)");
  highlight.addColorStop(0.55, "rgba(255,255,255,0)");
  ctx.fillStyle = highlight;
  ctx.beginPath();
  ctx.moveTo(brick.x + brick.w * 0.08, brick.y + brick.h * 0.08);
  ctx.lineTo(brick.x + brick.w * 0.62, brick.y + brick.h * 0.08);
  ctx.lineTo(brick.x + brick.w * 0.35, brick.y + brick.h * 0.55);
  ctx.lineTo(brick.x + brick.w * 0.08, brick.y + brick.h * 0.52);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  drawCracks(brick, damageRatio);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255,255,255,0.48)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${Math.round(brick.w * 0.34)}px ${THEME.fonts.display}`;
  ctx.fillText(`${brick.hp}`, brick.x + brick.w / 2, brick.y + brick.h / 2 + 1);
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawBricks() { for (const brick of state.bricks) drawGemBrick(brick); }

function drawPickups(time) {
  for (const pickup of state.pickups) {
    const pulse = 0.76 + Math.sin(time * 0.005 + pickup.pulse) * 0.12;
    const haloRadius = pickup.radius * (1.9 + pulse * 0.2);
    const radial = ctx.createRadialGradient(pickup.x, pickup.y, pickup.radius * 0.2, pickup.x, pickup.y, haloRadius);
    radial.addColorStop(0, "rgba(255,255,255,0.4)");
    radial.addColorStop(0.25, "rgba(255,236,136,0.4)");
    radial.addColorStop(1, "rgba(255,236,136,0)");
    ctx.fillStyle = radial;
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y, haloRadius, 0, TAU);
    ctx.fill();

    ctx.shadowColor = "rgba(255, 226, 98, 0.62)";
    ctx.shadowBlur = 24;
    const fill = ctx.createRadialGradient(pickup.x - 2, pickup.y - 2, 2, pickup.x, pickup.y, pickup.radius * 1.25);
    fill.addColorStop(0, "#fffce2");
    fill.addColorStop(0.35, "#ffe27b");
    fill.addColorStop(1, "#f7bc41");
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y, pickup.radius * (1 + pulse * 0.05), 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y, pickup.radius * 0.97, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = "#ffffff";
    ctx.lineCap = "round";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(pickup.x - pickup.radius * 0.46, pickup.y);
    ctx.lineTo(pickup.x + pickup.radius * 0.46, pickup.y);
    ctx.moveTo(pickup.x, pickup.y - pickup.radius * 0.46);
    ctx.lineTo(pickup.x, pickup.y + pickup.radius * 0.46);
    ctx.stroke();
  }
}

function drawArrowMarker(x, y, angle, size, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = `rgba(181, 246, 255, ${alpha})`;
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.7, -size * 0.52);
  ctx.lineTo(-size * 0.34, 0);
  ctx.lineTo(-size * 0.7, size * 0.52);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawElectricPath(points) {
  if (points.length < 2) return;
  const phase = state.trajectoryJitter;
  const jittered = points.map((point, index) => {
    const t = index / Math.max(1, points.length - 1);
    const amp = 5 * (1 - t * 0.65);
    return {
      x: point.x + Math.sin(phase * 1.1 + index * 1.6) * amp * 0.35,
      y: point.y + Math.sin(phase * 2.4 + index * 0.9) * amp
    };
  });

  ctx.strokeStyle = THEME.trajectory.outer;
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(state.cannonX, state.cannonY - 12);
  for (const point of jittered) ctx.lineTo(point.x, point.y);
  ctx.stroke();

  ctx.shadowColor = "rgba(105, 238, 255, 0.85)";
  ctx.shadowBlur = 18;
  ctx.strokeStyle = THEME.trajectory.glow;
  ctx.lineWidth = 4.6;
  ctx.beginPath();
  ctx.moveTo(state.cannonX, state.cannonY - 12);
  for (const point of jittered) ctx.lineTo(point.x, point.y);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = THEME.trajectory.core;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(state.cannonX, state.cannonY - 12);
  for (const point of jittered) ctx.lineTo(point.x, point.y);
  ctx.stroke();

  for (let i = 6; i < points.length; i += 10) {
    const prev = jittered[i - 1];
    const next = jittered[i];
    drawArrowMarker(next.x, next.y, Math.atan2(next.y - prev.y, next.x - prev.x), 7.5, 0.78 - i / points.length * 0.2);
  }
}

function drawTrajectory() {
  if (state.mode !== "ready") return;
  const points = buildPreviewPoints();
  if (!points.length) return;
  drawElectricPath(points);
}

function drawCannon() {
  const flare = 1 + Math.sin(state.cannonPulse) * 0.06;
  drawRadiantBurst(state.cannonX, state.cannonY, 58 * flare, "rgba(255,255,255,0.36)", "rgba(87,192,255,0.20)", 0.32);
  const outer = ctx.createRadialGradient(state.cannonX, state.cannonY, 10, state.cannonX, state.cannonY, 34);
  outer.addColorStop(0, "#ffffff");
  outer.addColorStop(0.35, THEME.cannon.cyan);
  outer.addColorStop(0.68, THEME.cannon.blue);
  outer.addColorStop(1, "rgba(110, 162, 255, 0.18)");
  ctx.shadowColor = "rgba(117, 246, 255, 0.42)";
  ctx.shadowBlur = 28;
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(state.cannonX, state.cannonY, 26 * flare, 0, TAU);
  ctx.fill();
  const inner = ctx.createRadialGradient(state.cannonX - 3, state.cannonY - 4, 2, state.cannonX, state.cannonY, 14);
  inner.addColorStop(0, "#ffffff");
  inner.addColorStop(0.6, "#e6ffff");
  inner.addColorStop(1, "rgba(230,255,255,0.1)");
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(state.cannonX, state.cannonY, 13 * flare, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawBalls() {
  for (const ball of state.balls) {
    drawRadiantBurst(ball.x, ball.y, 18 * ball.glow, "rgba(255,255,255,0.2)", "rgba(72,191,255,0.12)", 0.12);
    ctx.shadowColor = "rgba(104, 234, 255, 0.8)";
    ctx.shadowBlur = 20;
    const gradient = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, ball.r * 2.3);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.52, "#b6f7ff");
    gradient.addColorStop(1, "#61bfff");
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
    if (particle.kind === "debris") {
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      const fill = ctx.createLinearGradient(-particle.width / 2, -particle.height / 2, particle.width / 2, particle.height / 2);
      fill.addColorStop(0, `hsla(${particle.hue}, 100%, 78%, ${alpha})`);
      fill.addColorStop(1, `hsla(${particle.hue - 10}, 90%, 48%, ${alpha})`);
      ctx.fillStyle = fill;
      ctx.shadowColor = `hsla(${particle.hue}, 100%, 70%, ${alpha * 0.6})`;
      ctx.shadowBlur = 8;
      drawRoundedRect(-particle.width / 2, -particle.height / 2, particle.width, particle.height, Math.min(4, particle.height * 0.35));
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
      continue;
    }

    ctx.fillStyle = `hsla(${particle.hue}, 100%, 72%, ${alpha})`;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
    ctx.fill();
  }
  for (const spark of state.sparks) {
    const alpha = clamp(spark.life / spark.maxLife, 0, 1);
    ctx.shadowColor = `hsla(${spark.hue}, 100%, 70%, ${alpha})`;
    ctx.shadowBlur = 10;
    ctx.fillStyle = `hsla(${spark.hue}, 100%, 78%, ${alpha})`;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, spark.size, 0, TAU);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawPopups() {
  for (const popup of state.popups) {
    const alpha = clamp(popup.life / popup.maxLife, 0, 1);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = `hsla(${popup.hue}, 100%, 70%, ${alpha * 0.7})`;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.55})`;
    ctx.lineWidth = 3.5;
    ctx.font = `900 28px ${THEME.fonts.display}`;
    ctx.strokeText(popup.value, popup.x, popup.y);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillText(popup.value, popup.x, popup.y);
  }
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawLoseLine() {
  ctx.strokeStyle = THEME.loseLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([11, 12]);
  ctx.beginPath();
  ctx.moveTo(22, state.loseLineY);
  ctx.lineTo(state.width - 22, state.loseLineY);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawHint() {
  if (state.hintAlpha <= 0.01 || state.mode !== "ready") return;
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(122, 238, 255, 0.28)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = `rgba(230,255,255,${state.hintAlpha * 0.72})`;
  ctx.font = `800 15px ${THEME.fonts.display}`;
  const text = "DRAG TO AIM";
  drawSpacedText(text, state.width / 2 - measureSpacedText(text, 0.3) * 0.5, state.height - 32, 0.3);
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";
}

function drawGameOver() {
  if (state.mode !== "gameover") return;
  const alpha = clamp(state.gameOverTimer / 0.6, 0, 1);
  ctx.fillStyle = `rgba(8, 4, 20, ${0.34 + alpha * 0.28})`;
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(127, 239, 255, 0.35)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.font = `900 34px ${THEME.fonts.display}`;
  ctx.fillText("Wave Crashed In", state.width / 2, state.height * 0.42);
  ctx.shadowBlur = 0;
  ctx.font = `800 17px ${THEME.fonts.display}`;
  ctx.fillText("Tap anywhere to restart", state.width / 2, state.height * 0.42 + 34);
  ctx.fillText(`Final score ${state.score}`, state.width / 2, state.height * 0.42 + 62);
  ctx.textAlign = "left";
}

function update(dt) {
  if (state.mode === "gameover") state.gameOverTimer += dt;
  state.screenShake = Math.max(0, state.screenShake - dt * 16);
  state.hintAlpha = Math.max(0, state.hintAlpha - dt * 0.06);
  state.ribbonPhase += dt * 0.75;
  state.trajectoryJitter += dt * 5.4;
  state.cannonPulse += dt * 3.3;

  if (state.mode === "firing") {
    state.launchTimer -= dt;
    while (state.launchQueue > 0 && state.launchTimer <= 0) {
      launchBall();
      state.launchTimer += state.launchSpacing;
    }
  }

  for (let i = state.balls.length - 1; i >= 0; i -= 1) {
    if (!updateBall(state.balls[i], dt)) state.balls.splice(i, 1);
  }
  if (state.mode === "firing" && state.launchQueue <= 0 && state.balls.length === 0) finishTurn();
  for (const brick of state.bricks) brick.flash = Math.max(0, brick.flash - dt * 8);
  for (const pickup of state.pickups) pickup.pulse += dt * 3;

  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const particle = state.particles[i];
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= particle.kind === "debris" ? 0.985 : 0.96;
    if (particle.kind === "debris") {
      particle.vy += particle.gravity * dt;
      particle.rotation += particle.spin * dt;
    } else {
      particle.vy *= 0.96;
      particle.size *= 0.992;
    }
    if (particle.life <= 0) state.particles.splice(i, 1);
  }

  for (let i = state.popups.length - 1; i >= 0; i -= 1) {
    const popup = state.popups[i];
    popup.life -= dt;
    popup.x += popup.drift * dt;
    popup.y += popup.vy * dt;
    popup.vy *= 0.985;
    popup.drift *= 0.97;
    if (popup.life <= 0) state.popups.splice(i, 1);
  }

  if (state.mode === "ready" && Math.random() < 0.16) {
    addSpark(state.cannonX + rand(-24, 24), state.cannonY + rand(-16, 10), rand(180, 320), 0.35, 0.65);
  }
  for (let i = state.sparks.length - 1; i >= 0; i -= 1) {
    const spark = state.sparks[i];
    spark.life -= dt;
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.vx *= 0.96;
    spark.vy *= 0.96;
    if (spark.life <= 0) state.sparks.splice(i, 1);
  }
}

function render(time = performance.now()) {
  ctx.clearRect(0, 0, state.width, state.height);
  const shakeX = rand(-state.screenShake, state.screenShake);
  const shakeY = rand(-state.screenShake, state.screenShake);
  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawBackground(time);
  drawHud();
  drawBricks();
  drawPickups(time);
  drawTrajectory();
  drawLoseLine();
  drawParticles();
  drawPopups();
  drawBalls();
  drawCannon();
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
    cannon: { x: Number(state.cannonX.toFixed(1)), y: Number(state.cannonY.toFixed(1)) },
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
  for (let i = 0; i < steps; i += 1) update(FIXED_DT);
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
  if (state.mode !== "ready") return;
  state.aiming = true;
  updateAimFromPoint(pointerToCanvas(event));
}

function onPointerMove(event) {
  if (!state.aiming) return;
  event.preventDefault();
  updateAimFromPoint(pointerToCanvas(event));
}

function onPointerUp(event) {
  if (!state.aiming) return;
  event.preventDefault();
  updateAimFromPoint(pointerToCanvas(event));
  state.aiming = false;
  startVolley();
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
  else await document.exitFullscreen?.();
}

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "f") toggleFullscreen();
  if (event.key.toLowerCase() === "r") restartGame();
  if (event.key.toLowerCase() === "m") audio.muted = !audio.muted;
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
