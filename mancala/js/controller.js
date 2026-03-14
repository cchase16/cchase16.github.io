import { applyMove, cloneState, createInitialState, getLegalMoves, getPlayerLabel, PLAYER_ONE, PLAYER_TWO } from './engine.js';
import { RandomBot } from './bots/randomBot.js';
import { GreedyBot } from './bots/greedyBot.js';

export class GameController {
  constructor({ onStateChange, onLog, onAnimateMove }) {
    this.onStateChange = onStateChange;
    this.onLog = onLog;
    this.onAnimateMove = onAnimateMove;
    this.botFactories = {
      random: () => new RandomBot(),
      greedy: () => new GreedyBot(),
    };
    this.state = createInitialState();
    this.mode = 'human-vs-human';
    this.isPaused = false;
    this.isAnimating = false;
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
    this.playerNames[player] = String(name ?? '').trim().slice(0, 32);
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
        playerConfig,
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
      line += ' Extra turn.';
    }
    if (this.state.gameOver) {
      if (this.state.winner === 'tie') {
        line += ' Game over: tie.';
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
}
