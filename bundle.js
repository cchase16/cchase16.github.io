// js/engine.js
var PLAYER_ONE = 0;
var PLAYER_TWO = 1;
function createInitialState() {
  return {
    board: [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0],
    currentPlayer: PLAYER_ONE,
    gameOver: false,
    winner: null,
    moveNumber: 0,
    lastMove: null
  };
}
function cloneState(state) {
  return {
    ...state,
    board: [...state.board],
    lastMove: state.lastMove ? { ...state.lastMove } : null
  };
}
function getStoreIndex(player) {
  return player === PLAYER_ONE ? 6 : 13;
}
function getPitRange(player) {
  return player === PLAYER_ONE ? [0, 5] : [7, 12];
}
function isPlayersPit(index, player) {
  const [start, end] = getPitRange(player);
  return index >= start && index <= end;
}
function getOppositePitIndex(index) {
  return 12 - index;
}
function getLegalMoves(state, player = state.currentPlayer) {
  if (state.gameOver) return [];
  const [start, end] = getPitRange(player);
  const moves = [];
  for (let i = start; i <= end; i += 1) {
    if (state.board[i] > 0) moves.push(i);
  }
  return moves;
}
function isMoveLegal(state, pitIndex, player = state.currentPlayer) {
  return getLegalMoves(state, player).includes(pitIndex);
}
function getSowingSequence(state, pitIndex) {
  if (!isMoveLegal(state, pitIndex)) {
    throw new Error(`Illegal move: ${pitIndex}`);
  }
  const player = state.currentPlayer;
  const opponentStore = getStoreIndex(player === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE);
  let stones = state.board[pitIndex];
  let index = pitIndex;
  const drops = [];
  while (stones > 0) {
    index = (index + 1) % state.board.length;
    if (index === opponentStore) continue;
    drops.push(index);
    stones -= 1;
  }
  return drops;
}
function sideIsEmpty(board, player) {
  const [start, end] = getPitRange(player);
  for (let i = start; i <= end; i += 1) {
    if (board[i] > 0) return false;
  }
  return true;
}
function collectRemainingStones(board) {
  const p1Store = getStoreIndex(PLAYER_ONE);
  const p2Store = getStoreIndex(PLAYER_TWO);
  for (let i = 0; i < 6; i += 1) {
    board[p1Store] += board[i];
    board[i] = 0;
  }
  for (let i = 7; i < 13; i += 1) {
    board[p2Store] += board[i];
    board[i] = 0;
  }
}
function computeWinner(board) {
  const p1 = board[getStoreIndex(PLAYER_ONE)];
  const p2 = board[getStoreIndex(PLAYER_TWO)];
  if (p1 > p2) return PLAYER_ONE;
  if (p2 > p1) return PLAYER_TWO;
  return "tie";
}
function applyMove(state, pitIndex) {
  if (state.gameOver) {
    throw new Error("Cannot apply a move after game over.");
  }
  if (!isMoveLegal(state, pitIndex)) {
    throw new Error(`Illegal move: ${pitIndex}`);
  }
  const nextState = cloneState(state);
  const board = nextState.board;
  const player = nextState.currentPlayer;
  const ownStore = getStoreIndex(player);
  const opponentStore = getStoreIndex(player === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE);
  let stones = board[pitIndex];
  board[pitIndex] = 0;
  let index = pitIndex;
  while (stones > 0) {
    index = (index + 1) % board.length;
    if (index === opponentStore) continue;
    board[index] += 1;
    stones -= 1;
  }
  let captured = 0;
  let extraTurn = false;
  if (index === ownStore) {
    extraTurn = true;
  } else if (isPlayersPit(index, player) && board[index] === 1) {
    const opposite = getOppositePitIndex(index);
    if (board[opposite] > 0) {
      captured = board[opposite] + board[index];
      board[ownStore] += captured;
      board[index] = 0;
      board[opposite] = 0;
    }
  }
  const p1Empty = sideIsEmpty(board, PLAYER_ONE);
  const p2Empty = sideIsEmpty(board, PLAYER_TWO);
  if (p1Empty || p2Empty) {
    collectRemainingStones(board);
    nextState.gameOver = true;
    nextState.winner = computeWinner(board);
  } else {
    nextState.currentPlayer = extraTurn ? player : player === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
  }
  nextState.moveNumber += 1;
  nextState.lastMove = {
    player,
    pitIndex,
    endedIndex: index,
    captured,
    extraTurn
  };
  return nextState;
}
function getPlayerLabel(player) {
  return player === PLAYER_ONE ? "Player 1" : "Player 2";
}

// js/bots/randomBot.js
var RandomBot = class {
  constructor(name = "Random Bot") {
    this.id = "random";
    this.name = name;
  }
  chooseMove(state, player) {
    const moves = getLegalMoves(state, player);
    if (moves.length === 0) return null;
    const choice = Math.floor(Math.random() * moves.length);
    return moves[choice];
  }
};

// js/bots/greedyBot.js
function sumSide(board, player) {
  const [start, end] = getPitRange(player);
  let total = 0;
  for (let i = start; i <= end; i += 1) {
    total += board[i];
  }
  return total;
}
function evaluateState(state, player) {
  const myStore = getStoreIndex(player);
  const oppStore = getStoreIndex(player === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE);
  const storeLead = state.board[myStore] - state.board[oppStore];
  const sideLead = sumSide(state.board, player) - sumSide(state.board, player === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE);
  let score = 0;
  score += storeLead * 10;
  score += sideLead * 2;
  if (state.gameOver) {
    if (state.winner === player) score += 1e3;
    else if (state.winner && state.winner !== "tie") score -= 1e3;
  }
  return score;
}
var GreedyBot = class {
  constructor(name = "Greedy Bot") {
    this.name = name;
  }
  chooseMove(state, player) {
    const legalMoves = getLegalMoves(state, player);
    if (legalMoves.length === 0) return null;
    let bestMove = legalMoves[0];
    let bestScore = -Infinity;
    for (const move of legalMoves) {
      const nextState = applyMove(state, move);
      const lastMove = nextState.lastMove ?? { captured: 0, extraTurn: false };
      let score = evaluateState(nextState, player);
      score += lastMove.captured * 15;
      score += lastMove.extraTurn ? 100 : 0;
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
    return bestMove;
  }
};

// js/controller.js
var GameController = class {
  constructor({ onStateChange, onLog, onAnimateMove }) {
    this.onStateChange = onStateChange;
    this.onLog = onLog;
    this.onAnimateMove = onAnimateMove;
    this.botFactories = {
      random: () => new RandomBot(),
      greedy: () => new GreedyBot()
    };
    this.state = createInitialState();
    this.mode = "human-vs-human";
    this.isPaused = false;
    this.isAnimating = false;
    this.botSpeed = 500;
    this.botTimer = null;
    this.history = [];
    this.logEntries = [];
    this.playerNames = {
      [PLAYER_ONE]: "Player 1",
      [PLAYER_TWO]: "Player 2"
    };
    this.botSelections = {
      [PLAYER_ONE]: "random",
      [PLAYER_TWO]: "greedy"
    };
    this.playerConfigs = this.buildPlayerConfigs(this.mode);
    this.captureSnapshot();
  }
  getAvailableBots() {
    return Object.entries(this.botFactories).map(([id, factory]) => {
      const bot = factory();
      return { id, name: bot.name };
    });
  }
  createBot(botId) {
    const factory = this.botFactories[botId] ?? this.botFactories.random;
    return factory();
  }
  getPlayerDisplayName(player) {
    const rawName = this.playerNames[player] ?? getPlayerLabel(player);
    const trimmed = String(rawName).trim();
    return trimmed || getPlayerLabel(player);
  }
  buildPlayerConfigs(mode) {
    const p1Bot = this.createBot(this.botSelections[PLAYER_ONE]);
    const p2Bot = this.createBot(this.botSelections[PLAYER_TWO]);
    const p1Name = this.getPlayerDisplayName(PLAYER_ONE);
    const p2Name = this.getPlayerDisplayName(PLAYER_TWO);
    switch (mode) {
      case "human-vs-bot":
        return {
          [PLAYER_ONE]: { type: "human", label: p1Name },
          [PLAYER_TWO]: { type: "bot", label: p2Name, bot: p2Bot, botId: this.botSelections[PLAYER_TWO] }
        };
      case "bot-vs-bot":
        return {
          [PLAYER_ONE]: { type: "bot", label: p1Name, bot: p1Bot, botId: this.botSelections[PLAYER_ONE] },
          [PLAYER_TWO]: { type: "bot", label: p2Name, bot: p2Bot, botId: this.botSelections[PLAYER_TWO] }
        };
      case "human-vs-human":
      default:
        return {
          [PLAYER_ONE]: { type: "human", label: p1Name },
          [PLAYER_TWO]: { type: "human", label: p2Name }
        };
    }
  }
  captureSnapshot() {
    this.history.push({
      state: cloneState(this.state),
      logEntries: this.logEntries.map((entry) => ({ ...entry }))
    });
  }
  restoreSnapshot(snapshot) {
    this.state = cloneState(snapshot.state);
    this.logEntries = snapshot.logEntries.map((entry) => ({ ...entry }));
  }
  setMode(mode) {
    this.mode = mode;
    this.playerConfigs = this.buildPlayerConfigs(mode);
    this.restart();
  }
  setBotSelection(player, botId) {
    this.botSelections[player] = botId;
    this.playerConfigs = this.buildPlayerConfigs(this.mode);
    this.restart();
  }
  setPlayerName(player, name) {
    this.playerNames[player] = String(name ?? "").trim().slice(0, 32);
    this.playerConfigs = this.buildPlayerConfigs(this.mode);
    this.emitState();
  }
  setBotSpeed(speed) {
    this.botSpeed = speed;
    if (!this.isPaused) {
      this.scheduleBotTurn();
    }
    this.emitState();
  }
  restart() {
    this.clearTimer();
    this.state = createInitialState();
    this.isPaused = false;
    this.isAnimating = false;
    this.logEntries = [];
    this.history = [];
    this.captureSnapshot();
    this.emitState();
    this.scheduleBotTurn();
  }
  emitState() {
    this.onStateChange({
      state: this.state,
      mode: this.mode,
      playerConfigs: this.playerConfigs,
      isPaused: this.isPaused,
      isAnimating: this.isAnimating,
      botSpeed: this.botSpeed,
      availableBots: this.getAvailableBots(),
      botSelections: { ...this.botSelections },
      playerNames: { ...this.playerNames },
      canUndo: this.history.length > 1,
      moveLog: this.logEntries
    });
  }
  clearTimer() {
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
  }
  isCurrentPlayerBot() {
    return this.playerConfigs[this.state.currentPlayer]?.type === "bot";
  }
  async handleHumanMove(pitIndex) {
    if (this.state.gameOver || this.isAnimating) return;
    if (this.isCurrentPlayerBot()) return;
    await this.performMove(pitIndex);
  }
  async performMove(pitIndex) {
    if (this.isAnimating || this.state.gameOver) return;
    const player = this.state.currentPlayer;
    const playerConfig = this.playerConfigs[player];
    const beforeState = cloneState(this.state);
    this.isAnimating = true;
    this.emitState();
    if (this.onAnimateMove) {
      await this.onAnimateMove({
        state: cloneState(this.state),
        pitIndex,
        player,
        playerConfig
      });
    }
    this.state = applyMove(this.state, pitIndex);
    this.isAnimating = false;
    const last = this.state.lastMove;
    const sourcePit = player === PLAYER_ONE ? pitIndex + 1 : pitIndex - 6;
    let line = `${playerConfig.label} played pit ${sourcePit}.`;
    if (last.captured > 0) {
      line += ` Capture for ${last.captured} stones.`;
    }
    if (last.extraTurn && !this.state.gameOver) {
      line += " Extra turn.";
    }
    if (this.state.gameOver) {
      if (this.state.winner === "tie") {
        line += " Game over: tie.";
      } else {
        const winnerLabel = this.playerConfigs[this.state.winner]?.label ?? getPlayerLabel(this.state.winner);
        line += ` Game over: ${winnerLabel} wins.`;
      }
    }
    const logEntry = { text: line, moveNumber: this.state.moveNumber, beforeState, afterState: cloneState(this.state) };
    this.logEntries.unshift(logEntry);
    this.captureSnapshot();
    this.onLog(logEntry);
    this.emitState();
    this.scheduleBotTurn();
  }
  scheduleBotTurn() {
    this.clearTimer();
    if (this.state.gameOver || this.isPaused || this.isAnimating || !this.isCurrentPlayerBot()) {
      return;
    }
    this.botTimer = setTimeout(async () => {
      this.botTimer = null;
      await this.runBotTurn();
    }, this.botSpeed);
  }
  async runBotTurn() {
    if (this.state.gameOver || this.isPaused || this.isAnimating || !this.isCurrentPlayerBot()) return;
    const player = this.state.currentPlayer;
    const bot = this.playerConfigs[player]?.bot;
    const move = bot?.chooseMove(cloneState(this.state), player);
    const legalMoves = getLegalMoves(this.state, player);
    if (move == null || !legalMoves.includes(move)) return;
    await this.performMove(move);
  }
  togglePause() {
    if (this.isAnimating) return;
    this.isPaused = !this.isPaused;
    this.emitState();
    this.scheduleBotTurn();
  }
  async step() {
    if (this.state.gameOver || this.isAnimating) return;
    this.clearTimer();
    if (this.isCurrentPlayerBot()) {
      await this.runBotTurn();
    }
  }
  undo() {
    if (this.history.length <= 1 || this.isAnimating) return;
    this.clearTimer();
    this.history.pop();
    const snapshot = this.history[this.history.length - 1];
    this.restoreSnapshot(snapshot);
    this.isPaused = false;
    this.isAnimating = false;
    this.emitState();
    this.scheduleBotTurn();
  }
  replay() {
    if (this.isAnimating) return;
    this.clearTimer();
    const initialSnapshot = this.history[0];
    this.restoreSnapshot(initialSnapshot);
    this.isPaused = false;
    this.isAnimating = false;
    this.emitState();
    this.scheduleBotTurn();
  }
};

// js/renderer.js
var topRowIndices = [12, 11, 10, 9, 8, 7];
var bottomRowIndices = [0, 1, 2, 3, 4, 5];
function renderBoard({
  boardElement,
  state,
  playerConfigs,
  onPitClick,
  highlightedPit = null,
  pickedPit = null,
  animating = false
}) {
  boardElement.innerHTML = "";
  const leftStore = createStore({
    label: playerConfigs[PLAYER_TWO]?.label ?? getPlayerLabel(PLAYER_TWO),
    count: state.board[13],
    className: "left-store",
    isHighlighted: highlightedPit === 13
  });
  boardElement.appendChild(leftStore);
  topRowIndices.forEach((index, position) => {
    boardElement.appendChild(createPit({
      index,
      position,
      row: "top",
      state,
      onPitClick,
      highlightedPit,
      pickedPit,
      animating
    }));
  });
  bottomRowIndices.forEach((index, position) => {
    boardElement.appendChild(createPit({
      index,
      position,
      row: "bottom",
      state,
      onPitClick,
      highlightedPit,
      pickedPit,
      animating
    }));
  });
  const rightStore = createStore({
    label: playerConfigs[PLAYER_ONE]?.label ?? getPlayerLabel(PLAYER_ONE),
    count: state.board[6],
    className: "right-store",
    isHighlighted: highlightedPit === 6
  });
  boardElement.appendChild(rightStore);
}
function createStore({ label, count, className, isHighlighted }) {
  const el = document.createElement("div");
  el.className = `store ${className} ${isHighlighted ? "seed-highlight" : ""}`.trim();
  el.innerHTML = `
    <div class="store-grain"></div>
    <div class="store-label">${escapeHtml(label)}</div>
    <div class="store-count">${count}</div>
  `;
  return el;
}
function createPit({ index, position, row, state, onPitClick, highlightedPit, pickedPit, animating }) {
  const legalMoves = getLegalMoves(state, state.currentPlayer);
  const isLegal = legalMoves.includes(index);
  const isDisabled = animating || !isLegal || state.gameOver;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = [
    "pit",
    isLegal ? "legal active-turn" : "",
    highlightedPit === index ? "seed-highlight" : "",
    pickedPit === index ? "pit-picked" : ""
  ].filter(Boolean).join(" ");
  btn.disabled = isDisabled;
  btn.dataset.pitIndex = String(index);
  btn.style.gridColumn = String(position + 2);
  btn.style.gridRow = row === "top" ? "1" : "2";
  const displayNumber = row === "bottom" ? index + 1 : index - 6;
  const stones = state.board[index];
  btn.innerHTML = `
    <div class="pit-rim"></div>
    <div class="pit-label">Pit ${displayNumber}</div>
    <div class="pit-count">${stones}</div>
    <div class="stone-dots">${renderDots(stones)}</div>
  `;
  btn.addEventListener("click", () => onPitClick(index));
  return btn;
}
function renderDots(count) {
  const limit = Math.min(count, 16);
  let html = "";
  for (let i = 0; i < limit; i += 1) {
    html += '<span class="stone-dot"></span>';
  }
  if (count > limit) {
    html += `<span class="pit-label extra-count">+${count - limit}</span>`;
  }
  return html;
}
function escapeHtml(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// js/app.js
var elements = {
  board: document.getElementById("board"),
  statusText: document.getElementById("statusText"),
  turnText: document.getElementById("turnText"),
  modeBadge: document.getElementById("modeBadge"),
  moveLog: document.getElementById("moveLog"),
  gameMode: document.getElementById("gameMode"),
  botControls: document.getElementById("botControls"),
  botSpeed: document.getElementById("botSpeed"),
  botSpeedLabel: document.getElementById("botSpeedLabel"),
  pauseResumeBtn: document.getElementById("pauseResumeBtn"),
  stepBtn: document.getElementById("stepBtn"),
  newGameBtn: document.getElementById("newGameBtn"),
  clearLogBtn: document.getElementById("clearLogBtn"),
  p1StoreScore: document.getElementById("p1StoreScore"),
  p2StoreScore: document.getElementById("p2StoreScore"),
  playerOneName: document.getElementById("playerOneName"),
  playerTwoName: document.getElementById("playerTwoName"),
  playerOneBot: document.getElementById("playerOneBot"),
  playerTwoBot: document.getElementById("playerTwoBot"),
  undoBtn: document.getElementById("undoBtn"),
  replayBtn: document.getElementById("replayBtn")
};
var modeLabels = {
  "human-vs-human": "Human vs Human",
  "human-vs-bot": "Human vs Bot",
  "bot-vs-bot": "Bot vs Bot"
};
var uiEffects = {
  highlightedPit: null,
  pickedPit: null
};
var latestViewModel = null;
var audioContext = null;
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function ensureAudioContext() {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioContext = new AudioCtx();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {
    });
  }
  return audioContext;
}
function playTone({ frequency = 440, duration = 0.08, type = "sine", gain = 0.04, attack = 2e-3, release = 0.06 }) {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1800, now);
  filter.Q.value = 0.7;
  gainNode.gain.setValueAtTime(1e-4, now);
  gainNode.gain.linearRampToValueAtTime(gain, now + attack);
  gainNode.gain.exponentialRampToValueAtTime(1e-4, now + duration + release);
  oscillator.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + release + 0.02);
}
function playPickupSound() {
  playTone({ frequency: 210, duration: 0.06, type: "triangle", gain: 0.05, attack: 3e-3, release: 0.1 });
  setTimeout(() => playTone({ frequency: 285, duration: 0.05, type: "triangle", gain: 0.035, attack: 3e-3, release: 0.08 }), 28);
}
function playTickSound(stepIndex) {
  playTone({
    frequency: 740 + stepIndex % 3 * 55,
    duration: 0.028,
    type: "square",
    gain: 0.02,
    attack: 1e-3,
    release: 0.03
  });
}
var controller = new GameController({
  onStateChange: render,
  onLog: appendLog,
  onAnimateMove: animateMove
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
  const currentMarkup = availableBots.map((bot) => `<option value="${bot.id}">${bot.name}</option>`).join("");
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
    animating: isAnimating
  });
  renderBotSelect(elements.playerOneBot, availableBots, botSelections[PLAYER_ONE]);
  renderBotSelect(elements.playerTwoBot, availableBots, botSelections[PLAYER_TWO]);
  syncTextInput(elements.playerOneName, playerNames[PLAYER_ONE] ?? "");
  syncTextInput(elements.playerTwoName, playerNames[PLAYER_TWO] ?? "");
  elements.modeBadge.textContent = modeLabels[mode] ?? mode;
  elements.p1StoreScore.textContent = String(state.board[6]);
  elements.p2StoreScore.textContent = String(state.board[13]);
  elements.botSpeedLabel.textContent = `${botSpeed} ms per move`;
  elements.pauseResumeBtn.textContent = isPaused ? "Resume" : "Pause";
  elements.gameMode.value = mode;
  elements.undoBtn.disabled = !canUndo || isAnimating;
  elements.replayBtn.disabled = moveLog.length === 0 || isAnimating;
  elements.newGameBtn.disabled = isAnimating;
  const showBotControls = mode !== "human-vs-human";
  elements.botControls.classList.toggle("hidden", !showBotControls);
  elements.playerOneBot.disabled = mode !== "bot-vs-bot" || isAnimating;
  elements.playerTwoBot.disabled = mode === "human-vs-human" || isAnimating;
  elements.playerOneName.disabled = isAnimating;
  elements.playerTwoName.disabled = isAnimating;
  elements.gameMode.disabled = isAnimating;
  elements.botSpeed.disabled = isAnimating;
  elements.stepBtn.disabled = mode === "human-vs-human" || isAnimating || !controller.isCurrentPlayerBot() && !state.gameOver;
  elements.pauseResumeBtn.disabled = mode === "human-vs-human" || state.gameOver || isAnimating;
  if (state.gameOver) {
    if (state.winner === "tie") {
      elements.statusText.textContent = "Game over \u2014 it's a tie.";
    } else {
      const winnerLabel = playerConfigs[state.winner]?.label ?? getPlayerLabel(state.winner);
      elements.statusText.textContent = `Game over \u2014 ${winnerLabel} wins.`;
    }
    elements.turnText.textContent = `Final score: ${playerConfigs[PLAYER_ONE]?.label ?? "Player 1"} ${state.board[6]} \u2022 ${playerConfigs[PLAYER_TWO]?.label ?? "Player 2"} ${state.board[13]}`;
  } else if (isAnimating) {
    const currentLabel = playerConfigs[state.currentPlayer]?.label ?? getPlayerLabel(state.currentPlayer);
    elements.statusText.textContent = `${currentLabel} is sowing seeds\u2026`;
    elements.turnText.textContent = "Wooden pit highlights and tick sounds play as each seed lands.";
  } else {
    const currentLabel = playerConfigs[state.currentPlayer]?.label ?? getPlayerLabel(state.currentPlayer);
    const currentType = playerConfigs[state.currentPlayer]?.type ?? "human";
    elements.statusText.textContent = `${currentLabel}'s turn`;
    elements.turnText.textContent = currentType === "bot" ? "Bot is thinking\u2026" : "Choose one of the highlighted pits.";
  }
}
function appendLog() {
  renderLog(controller.logEntries);
}
function renderLog(entries) {
  elements.moveLog.innerHTML = "";
  for (const entry of entries) {
    const item = document.createElement("li");
    item.textContent = `${entry.moveNumber}. ${entry.text}`;
    elements.moveLog.appendChild(item);
  }
}
["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
  window.addEventListener(eventName, () => {
    ensureAudioContext();
  }, { once: true });
});
elements.gameMode.addEventListener("change", (event) => {
  controller.setMode(event.target.value);
});
elements.playerOneName.addEventListener("input", (event) => {
  controller.setPlayerName(PLAYER_ONE, event.target.value);
});
elements.playerTwoName.addEventListener("input", (event) => {
  controller.setPlayerName(PLAYER_TWO, event.target.value);
});
elements.playerOneBot.addEventListener("change", (event) => {
  controller.setBotSelection(PLAYER_ONE, event.target.value);
});
elements.playerTwoBot.addEventListener("change", (event) => {
  controller.setBotSelection(PLAYER_TWO, event.target.value);
});
elements.botSpeed.addEventListener("input", (event) => {
  controller.setBotSpeed(Number(event.target.value));
});
elements.pauseResumeBtn.addEventListener("click", () => controller.togglePause());
elements.stepBtn.addEventListener("click", () => controller.step());
elements.undoBtn.addEventListener("click", () => controller.undo());
elements.replayBtn.addEventListener("click", () => controller.replay());
elements.newGameBtn.addEventListener("click", () => {
  controller.restart();
});
elements.clearLogBtn.addEventListener("click", () => {
  if (controller.isAnimating) return;
  controller.logEntries = [];
  renderLog([]);
  controller.emitState();
});
controller.restart();
