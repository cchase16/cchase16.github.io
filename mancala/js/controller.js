import { applyMove, cloneState, createInitialState, getLegalMoves, getPlayerLabel, PLAYER_ONE, PLAYER_TWO } from './engine.js';
import { createBotFromSelection, ensureValidBotSelection, getAvailableBotDefinitions } from './bots/catalog.js';

export class GameController {
  constructor({ onStateChange, onLog, onAnimateMove = null }) {
    this.onStateChange = onStateChange;
    this.onLog = onLog;
    this.onAnimateMove = onAnimateMove;
    this.customProfiles = [];
    this.state = createInitialState();
    this.mode = 'human-vs-bot';
    this.isPaused = false;
    this.isAnimating = false;
    this.awaitingBotMatchStart = false;
    this.botSpeed = 500;
    this.botTimer = null;
    this.history = [];
    this.logEntries = [];
    this.playerNames = {
      [PLAYER_ONE]: 'Player 1',
      [PLAYER_TWO]: 'Player 2',
    };
    this.botSelections = {
      [PLAYER_ONE]: 'random',
      [PLAYER_TWO]: 'greedy',
    };
    this.playerConfigs = this.buildPlayerConfigs(this.mode);
    this.captureSnapshot();
  }

  getAvailableBots() {
    return getAvailableBotDefinitions(this.customProfiles);
  }

  createBot(botId) {
    return createBotFromSelection(botId, this.customProfiles);
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
      case 'human-vs-bot':
        return {
          [PLAYER_ONE]: { type: 'human', label: p1Name },
          [PLAYER_TWO]: { type: 'bot', label: p2Name, bot: p2Bot, botId: this.botSelections[PLAYER_TWO] },
        };
      case 'bot-vs-bot':
        return {
          [PLAYER_ONE]: { type: 'bot', label: p1Name, bot: p1Bot, botId: this.botSelections[PLAYER_ONE] },
          [PLAYER_TWO]: { type: 'bot', label: p2Name, bot: p2Bot, botId: this.botSelections[PLAYER_TWO] },
        };
      case 'human-vs-human':
      default:
        return {
          [PLAYER_ONE]: { type: 'human', label: p1Name },
          [PLAYER_TWO]: { type: 'human', label: p2Name },
        };
    }
  }

  captureSnapshot() {
    this.history.push({
      state: cloneState(this.state),
      logEntries: this.logEntries.map((entry) => ({ ...entry })),
    });
  }

  restoreSnapshot(snapshot) {
    this.state = cloneState(snapshot.state);
    this.logEntries = snapshot.logEntries.map((entry) => ({ ...entry }));
  }

  setMode(mode) {
    if (this.isAnimating) return;
    this.mode = mode;
    this.playerConfigs = this.buildPlayerConfigs(mode);
    this.restart();
  }

  setBotSelection(player, botId) {
    if (this.isAnimating) return;
    this.botSelections[player] = ensureValidBotSelection(botId, this.getDefaultBotSelection(player), this.customProfiles);
    this.playerConfigs = this.buildPlayerConfigs(this.mode);
    this.restart();
  }

  setCustomProfiles(profiles) {
    this.customProfiles = Array.isArray(profiles) ? profiles : [];
    this.botSelections[PLAYER_ONE] = ensureValidBotSelection(this.botSelections[PLAYER_ONE], this.getDefaultBotSelection(PLAYER_ONE), this.customProfiles);
    this.botSelections[PLAYER_TWO] = ensureValidBotSelection(this.botSelections[PLAYER_TWO], this.getDefaultBotSelection(PLAYER_TWO), this.customProfiles);
    this.playerConfigs = this.buildPlayerConfigs(this.mode);
    this.emitState();
    this.scheduleBotTurn();
  }

  setPlayerName(player, name) {
    this.playerNames[player] = String(name ?? '').trim().slice(0, 32);
    this.playerConfigs = this.buildPlayerConfigs(this.mode);
    this.emitState();
  }

  setBotSpeed(speed) {
    this.botSpeed = speed;
    if (!this.isPaused) this.scheduleBotTurn();
    this.emitState();
  }

  restart() {
    this.clearTimer();
    this.isAnimating = false;
    this.state = createInitialState();
    this.isPaused = false;
    this.awaitingBotMatchStart = this.mode === 'bot-vs-bot';
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
      awaitingBotMatchStart: this.awaitingBotMatchStart,
      canBeginMatch: this.mode === 'bot-vs-bot' && this.awaitingBotMatchStart && !this.state.gameOver && !this.isAnimating,
      canUndo: this.history.length > 1,
      moveLog: this.logEntries,
    });
  }

  clearTimer() {
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
  }

  isCurrentPlayerBot() {
    return this.playerConfigs[this.state.currentPlayer]?.type === 'bot';
  }

  getHintMove() {
    if (this.mode !== 'human-vs-bot' || this.state.gameOver || this.isAnimating || this.awaitingBotMatchStart) return null;

    const player = this.state.currentPlayer;
    const playerConfig = this.playerConfigs[player];
    if (playerConfig?.type !== 'human') return null;

    const hintBotId = this.botSelections[PLAYER_TWO];
    const hintBot = this.createBot(hintBotId);
    if (!hintBot || typeof hintBot.chooseMove !== 'function') return null;

    const legalMoves = getLegalMoves(this.state, player);
    const move = hintBot.chooseMove(cloneState(this.state), player);
    if (move == null || !legalMoves.includes(move)) return null;

    return {
      pitIndex: move,
      player,
      botId: hintBotId,
    };
  }

  handleHumanMove(pitIndex) {
    if (this.state.gameOver || this.isAnimating || this.isCurrentPlayerBot()) return;
    this.performMove(pitIndex);
  }

  async performMove(pitIndex) {
    if (this.isAnimating) return;

    const player = this.state.currentPlayer;
    const playerConfig = this.playerConfigs[player];
    const beforeState = cloneState(this.state);

    if (this.onAnimateMove) {
      this.isAnimating = true;
      this.emitState();
      try {
        await this.onAnimateMove({ state: beforeState, pitIndex, player, playerConfig });
      } catch {
        // keep move going even if animation fails
      }
    }

    this.state = applyMove(this.state, pitIndex);
    this.isAnimating = false;

    const last = this.state.lastMove;
    const sourcePit = player === PLAYER_ONE ? pitIndex + 1 : pitIndex - 6;
    let line = `${playerConfig.label} played pit ${sourcePit}.`;

    if (last.captured > 0) line += ` Capture for ${last.captured} stones.`;
    if (last.extraTurn && !this.state.gameOver) line += ' Extra turn.';
    if (this.state.gameOver) {
      if (this.state.winner === 'tie') line += ' Game over: tie.';
      else {
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
    if (this.state.gameOver || this.isPaused || this.isAnimating || this.awaitingBotMatchStart || !this.isCurrentPlayerBot()) return;

    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      this.runBotTurn();
    }, this.botSpeed);
  }

  runBotTurn() {
    if (this.state.gameOver || this.isPaused || this.isAnimating || this.awaitingBotMatchStart || !this.isCurrentPlayerBot()) return;
    const player = this.state.currentPlayer;
    const bot = this.playerConfigs[player]?.bot;
    const move = bot?.chooseMove(cloneState(this.state), player);
    const legalMoves = getLegalMoves(this.state, player);
    if (move == null || !legalMoves.includes(move)) return;
    this.performMove(move);
  }

  togglePause() {
    if (this.isAnimating) return;
    this.isPaused = !this.isPaused;
    this.emitState();
    this.scheduleBotTurn();
  }

  beginBotMatch() {
    if (this.mode !== 'bot-vs-bot' || this.isAnimating || this.state.gameOver || !this.awaitingBotMatchStart) return;
    this.awaitingBotMatchStart = false;
    this.emitState();
    this.scheduleBotTurn();
  }

  step() {
    if (this.state.gameOver || this.isAnimating || this.awaitingBotMatchStart) return;
    this.clearTimer();
    if (this.isCurrentPlayerBot()) this.runBotTurn();
  }

  undo() {
    if (this.history.length <= 1 || this.isAnimating) return;
    this.clearTimer();
    this.history.pop();
    this.restoreSnapshot(this.history[this.history.length - 1]);
    this.isPaused = false;
    this.emitState();
    this.scheduleBotTurn();
  }

  replay() {
    if (this.isAnimating) return;
    this.clearTimer();
    this.restoreSnapshot(this.history[0]);
    this.isPaused = false;
    this.emitState();
    this.scheduleBotTurn();
  }

  getDefaultBotSelection(player) {
    return player === PLAYER_ONE ? 'random' : 'greedy';
  }
}
