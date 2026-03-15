import { GameController } from './controller.js';
import { getPlayerLabel, getSowingSequence, PLAYER_ONE, PLAYER_TWO } from './engine.js';
import { renderBoard } from './renderer.js';

const elements = {
  board: document.getElementById('board'),
  statusText: document.getElementById('statusText'),
  turnText: document.getElementById('turnText'),
  modeBadge: document.getElementById('modeBadge'),
  moveLog: document.getElementById('moveLog'),
  gameMode: document.getElementById('gameMode'),
  botControls: document.getElementById('botControls'),
  botSpeed: document.getElementById('botSpeed'),
  botSpeedLabel: document.getElementById('botSpeedLabel'),
  pauseResumeBtn: document.getElementById('pauseResumeBtn'),
  stepBtn: document.getElementById('stepBtn'),
  newGameBtn: document.getElementById('newGameBtn'),
  clearLogBtn: document.getElementById('clearLogBtn'),
  p1StoreScore: document.getElementById('p1StoreScore'),
  p2StoreScore: document.getElementById('p2StoreScore'),
  playerOneName: document.getElementById('playerOneName'),
  playerTwoName: document.getElementById('playerTwoName'),
  playerOneBot: document.getElementById('playerOneBot'),
  playerTwoBot: document.getElementById('playerTwoBot'),
  undoBtn: document.getElementById('undoBtn'),
  replayBtn: document.getElementById('replayBtn'),
  configToggleBtn: document.getElementById('configToggleBtn'),
  closeDrawerBtn: document.getElementById('closeDrawerBtn'),
  configDrawer: document.getElementById('configDrawer'),
  drawerBackdrop: document.getElementById('drawerBackdrop'),
};

const modeLabels = {
  'human-vs-human': 'Human vs Human',
  'human-vs-bot': 'Human vs Bot',
  'bot-vs-bot': 'Bot vs Bot',
};

const uiEffects = {
  highlightedPit: null,
  pickedPit: null,
  drawerOpen: false,
};

let latestViewModel = null;
let audioContext = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function ensureAudioContext() {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioContext = new AudioCtx();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function playTone({ frequency = 440, duration = 0.08, type = 'sine', gain = 0.04, attack = 0.002, release = 0.06, detune = 0 }) {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.detune.setValueAtTime(detune, now);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1500, now);
  filter.Q.value = 0.75;

  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.linearRampToValueAtTime(gain, now + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);

  oscillator.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(now);
  oscillator.stop(now + duration + release + 0.02);
}

function playPickupSound() {
  playTone({ frequency: 210, duration: 0.04, type: 'triangle', gain: 0.03, attack: 0.003, release: 0.08, detune: -6 });
  setTimeout(() => playTone({ frequency: 252, duration: 0.04, type: 'triangle', gain: 0.022, attack: 0.003, release: 0.08, detune: 6 }), 26);
}

function playTickSound(stepIndex) {
  playTone({
    frequency: 720 + (stepIndex % 4) * 28,
    duration: 0.016,
    type: 'square',
    gain: 0.011,
    attack: 0.001,
    release: 0.018,
    detune: stepIndex % 2 === 0 ? -3 : 3,
  });
}

function getHoleCenter(index) {
  const target = elements.board.querySelector(`[data-hole-index="${index}"]`);
  if (!target) return null;

  const boardRect = elements.board.getBoundingClientRect();
  const rect = target.getBoundingClientRect();

  return {
    x: rect.left - boardRect.left + rect.width / 2,
    y: rect.top - boardRect.top + rect.height / 2,
  };
}

function pulseLandingTarget(index) {
  const hole = elements.board.querySelector(`[data-hole-index="${index}"]`);
  if (!hole) return;
  hole.classList.remove('landing-bounce');
  void hole.offsetWidth;
  hole.classList.add('landing-bounce');
  setTimeout(() => hole.classList.remove('landing-bounce'), 260);
}

async function animateSeedTravel(fromIndex, toIndex, seedClassName) {
  const from = getHoleCenter(fromIndex);
  const to = getHoleCenter(toIndex);
  if (!from || !to) {
    await wait(110);
    return;
  }

  const travelSeed = document.createElement('div');
  travelSeed.className = `travel-seed ${seedClassName}`;
  travelSeed.style.left = `${from.x}px`;
  travelSeed.style.top = `${from.y}px`;
  elements.board.appendChild(travelSeed);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const arcHeight = Math.max(16, Math.min(40, Math.abs(dx) * 0.16 + 18));

  const animation = travelSeed.animate([
    { transform: 'translate(-50%, -50%) scale(1.05)', offset: 0 },
    { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - arcHeight}px)) scale(1.16)`, offset: 0.56 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.96)`, offset: 1 },
  ], {
    duration: 160,
    easing: 'cubic-bezier(0.22, 0.84, 0.3, 1)',
    fill: 'forwards',
  });

  await animation.finished.catch(() => {});
  travelSeed.remove();
  pulseLandingTarget(toIndex);
}

const controller = new GameController({
  onStateChange: render,
  onLog: appendLog,
  onAnimateMove: animateMove,
});

async function animateMove({ state, pitIndex }) {
  const sowingSequence = getSowingSequence(state, pitIndex);
  const movingSeedClass = state.currentPlayer === PLAYER_ONE ? 'player-one-seed' : 'player-two-seed';

  uiEffects.pickedPit = pitIndex;
  uiEffects.highlightedPit = pitIndex;
  renderLatest();
  playPickupSound();
  await wait(125);

  let fromIndex = pitIndex;
  for (let i = 0; i < sowingSequence.length; i += 1) {
    const targetIndex = sowingSequence[i];
    uiEffects.highlightedPit = targetIndex;
    renderLatest();
    await nextFrame();
    await animateSeedTravel(fromIndex, targetIndex, movingSeedClass);
    playTickSound(i);
    await wait(20);
    fromIndex = targetIndex;
  }

  await wait(60);
  uiEffects.highlightedPit = null;
  uiEffects.pickedPit = null;
  renderLatest();
}

function renderBotSelect(selectElement, availableBots, selectedBot) {
  const currentMarkup = availableBots.map((bot) => `<option value="${bot.id}">${bot.name}</option>`).join('');
  if (selectElement.innerHTML !== currentMarkup) selectElement.innerHTML = currentMarkup;
  selectElement.value = selectedBot;
}

function syncTextInput(input, value) {
  if (document.activeElement !== input) input.value = value;
}

function setDrawerOpen(open) {
  uiEffects.drawerOpen = open;
  elements.configDrawer.classList.toggle('open', open);
  elements.drawerBackdrop.classList.toggle('hidden', !open);
  elements.configDrawer.setAttribute('aria-hidden', String(!open));
  elements.configToggleBtn.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
}

function render(viewModel) {
  latestViewModel = viewModel;
  renderLatest();
}

function renderLatest() {
  if (!latestViewModel) return;

  const { state, mode, playerConfigs, isPaused, isAnimating, botSpeed, availableBots, botSelections, playerNames, canUndo, moveLog } = latestViewModel;

  renderBoard({
    boardElement: elements.board,
    state,
    playerConfigs,
    onPitClick: (index) => controller.handleHumanMove(index),
    highlightedPit: uiEffects.highlightedPit,
    pickedPit: uiEffects.pickedPit,
    animating: isAnimating,
  });

  renderBotSelect(elements.playerOneBot, availableBots, botSelections[PLAYER_ONE]);
  renderBotSelect(elements.playerTwoBot, availableBots, botSelections[PLAYER_TWO]);
  syncTextInput(elements.playerOneName, playerNames[PLAYER_ONE] ?? '');
  syncTextInput(elements.playerTwoName, playerNames[PLAYER_TWO] ?? '');

  elements.modeBadge.textContent = modeLabels[mode] ?? mode;
  elements.p1StoreScore.textContent = String(state.board[6]);
  elements.p2StoreScore.textContent = String(state.board[13]);
  elements.botSpeedLabel.textContent = `${botSpeed} ms per move`;
  elements.pauseResumeBtn.textContent = isPaused ? 'Resume' : 'Pause';
  elements.gameMode.value = mode;
  elements.undoBtn.disabled = !canUndo || isAnimating;
  elements.replayBtn.disabled = moveLog.length === 0 || isAnimating;
  elements.newGameBtn.disabled = isAnimating;

  const showBotControls = mode !== 'human-vs-human';
  elements.botControls.classList.toggle('hidden', !showBotControls);
  elements.playerOneBot.disabled = mode !== 'bot-vs-bot' || isAnimating;
  elements.playerTwoBot.disabled = mode === 'human-vs-human' || isAnimating;
  elements.playerOneName.disabled = isAnimating;
  elements.playerTwoName.disabled = isAnimating;
  elements.gameMode.disabled = isAnimating;
  elements.botSpeed.disabled = isAnimating;
  elements.stepBtn.disabled = mode === 'human-vs-human' || isAnimating || (!controller.isCurrentPlayerBot() && !state.gameOver);
  elements.pauseResumeBtn.disabled = mode === 'human-vs-human' || state.gameOver || isAnimating;

  if (state.gameOver) {
    if (state.winner === 'tie') {
      elements.statusText.textContent = 'Game over — it\'s a tie.';
    } else {
      const winnerLabel = playerConfigs[state.winner]?.label ?? getPlayerLabel(state.winner);
      elements.statusText.textContent = `Game over — ${winnerLabel} wins.`;
    }
    elements.turnText.textContent = `Final score: ${playerConfigs[PLAYER_ONE]?.label ?? 'Player 1'} ${state.board[6]} • ${playerConfigs[PLAYER_TWO]?.label ?? 'Player 2'} ${state.board[13]}`;
  } else if (isAnimating) {
    const currentLabel = playerConfigs[state.currentPlayer]?.label ?? getPlayerLabel(state.currentPlayer);
    elements.statusText.textContent = `${currentLabel} is sowing seeds…`;
    elements.turnText.textContent = 'Graphite wells pulse softly as each seed lands.';
  } else {
    const currentLabel = playerConfigs[state.currentPlayer]?.label ?? getPlayerLabel(state.currentPlayer);
    const currentType = playerConfigs[state.currentPlayer]?.type ?? 'human';
    elements.statusText.textContent = `${currentLabel}'s turn`;
    elements.turnText.textContent = currentType === 'bot' ? 'Bot is thinking…' : 'Choose one of the highlighted pits.';
  }
}

function appendLog() {
  renderLog(controller.logEntries);
}

function renderLog(entries) {
  elements.moveLog.innerHTML = '';
  for (const entry of entries) {
    const item = document.createElement('li');
    item.textContent = `${entry.moveNumber}. ${entry.text}`;
    elements.moveLog.appendChild(item);
  }
}

['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
  window.addEventListener(eventName, () => { ensureAudioContext(); }, { once: true });
});

elements.gameMode.addEventListener('change', (event) => controller.setMode(event.target.value));
elements.playerOneName.addEventListener('input', (event) => controller.setPlayerName(PLAYER_ONE, event.target.value));
elements.playerTwoName.addEventListener('input', (event) => controller.setPlayerName(PLAYER_TWO, event.target.value));
elements.playerOneBot.addEventListener('change', (event) => controller.setBotSelection(PLAYER_ONE, event.target.value));
elements.playerTwoBot.addEventListener('change', (event) => controller.setBotSelection(PLAYER_TWO, event.target.value));
elements.botSpeed.addEventListener('input', (event) => controller.setBotSpeed(Number(event.target.value)));
elements.pauseResumeBtn.addEventListener('click', () => controller.togglePause());
elements.stepBtn.addEventListener('click', () => controller.step());
elements.undoBtn.addEventListener('click', () => controller.undo());
elements.replayBtn.addEventListener('click', () => controller.replay());
elements.newGameBtn.addEventListener('click', () => controller.restart());
elements.clearLogBtn.addEventListener('click', () => {
  if (controller.isAnimating) return;
  controller.logEntries = [];
  renderLog([]);
  controller.emitState();
});

elements.configToggleBtn.addEventListener('click', () => setDrawerOpen(true));
elements.closeDrawerBtn.addEventListener('click', () => setDrawerOpen(false));
elements.drawerBackdrop.addEventListener('click', () => setDrawerOpen(false));
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && uiEffects.drawerOpen) setDrawerOpen(false);
});

controller.restart();
