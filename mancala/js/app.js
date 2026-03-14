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
};

const modeLabels = {
  'human-vs-human': 'Human vs Human',
  'human-vs-bot': 'Human vs Bot',
  'bot-vs-bot': 'Bot vs Bot',
};

const uiEffects = {
  highlightedPit: null,
  pickedPit: null,
};

let latestViewModel = null;
let audioContext = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function playTone({ frequency = 440, duration = 0.08, type = 'sine', gain = 0.04, attack = 0.002, release = 0.06 }) {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1800, now);
  filter.Q.value = 0.7;

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
  playTone({ frequency: 210, duration: 0.06, type: 'triangle', gain: 0.05, attack: 0.003, release: 0.1 });
  setTimeout(() => playTone({ frequency: 285, duration: 0.05, type: 'triangle', gain: 0.035, attack: 0.003, release: 0.08 }), 28);
}

function playTickSound(stepIndex) {
  playTone({
    frequency: 740 + (stepIndex % 3) * 55,
    duration: 0.028,
    type: 'square',
    gain: 0.02,
    attack: 0.001,
    release: 0.03,
  });
}

const controller = new GameController({
  onStateChange: render,
  onLog: appendLog,
  onAnimateMove: animateMove,
});

async function animateMove({ state, pitIndex }) {
  const sowingSequence = getSowingSequence(state, pitIndex);

  uiEffects.pickedPit = pitIndex;
  uiEffects.highlightedPit = pitIndex;
  renderLatest();
  playPickupSound();
  await wait(160);

  for (let i = 0; i < sowingSequence.length; i += 1) {
    uiEffects.highlightedPit = sowingSequence[i];
    uiEffects.pickedPit = pitIndex;
    renderLatest();
    playTickSound(i);
    await wait(120);
  }

  uiEffects.highlightedPit = null;
  uiEffects.pickedPit = null;
  renderLatest();
}

function renderBotSelect(selectElement, availableBots, selectedBot) {
  const currentMarkup = availableBots
    .map((bot) => `<option value="${bot.id}">${bot.name}</option>`)
    .join('');

  if (selectElement.innerHTML !== currentMarkup) {
    selectElement.innerHTML = currentMarkup;
  }

  selectElement.value = selectedBot;
}

function syncTextInput(input, value) {
  if (document.activeElement !== input) {
    input.value = value;
  }
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
    elements.turnText.textContent = 'Wooden pit highlights and tick sounds play as each seed lands.';
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
  window.addEventListener(eventName, () => {
    ensureAudioContext();
  }, { once: true });
});

elements.gameMode.addEventListener('change', (event) => {
  controller.setMode(event.target.value);
});

elements.playerOneName.addEventListener('input', (event) => {
  controller.setPlayerName(PLAYER_ONE, event.target.value);
});

elements.playerTwoName.addEventListener('input', (event) => {
  controller.setPlayerName(PLAYER_TWO, event.target.value);
});

elements.playerOneBot.addEventListener('change', (event) => {
  controller.setBotSelection(PLAYER_ONE, event.target.value);
});

elements.playerTwoBot.addEventListener('change', (event) => {
  controller.setBotSelection(PLAYER_TWO, event.target.value);
});

elements.botSpeed.addEventListener('input', (event) => {
  controller.setBotSpeed(Number(event.target.value));
});

elements.pauseResumeBtn.addEventListener('click', () => controller.togglePause());
elements.stepBtn.addEventListener('click', () => controller.step());
elements.undoBtn.addEventListener('click', () => controller.undo());
elements.replayBtn.addEventListener('click', () => controller.replay());
elements.newGameBtn.addEventListener('click', () => {
  controller.restart();
});
elements.clearLogBtn.addEventListener('click', () => {
  if (controller.isAnimating) return;
  controller.logEntries = [];
  renderLog([]);
  controller.emitState();
});

controller.restart();
