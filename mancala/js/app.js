import { GameController } from './controller.js';
import { getPlayerLabel, PLAYER_ONE, PLAYER_TWO } from './engine.js';
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
  playerOneBotGroup: document.getElementById('playerOneBotGroup'),
  playerTwoBotGroup: document.getElementById('playerTwoBotGroup'),
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

const controller = new GameController({
  onStateChange: render,
  onLog: appendLog,
});

let botOptionsRendered = false;

function renderBotSelect(selectElement, availableBots, selectedBot) {
  if (!botOptionsRendered) {
    selectElement.innerHTML = availableBots
      .map((bot) => `<option value="${bot.id}">${bot.name}</option>`)
      .join('');
  }
  selectElement.value = selectedBot;
}

function render({ state, mode, playerConfigs, isPaused, botSpeed, availableBots, botSelections, canUndo, moveLog }) {
  renderBoard({
    boardElement: elements.board,
    state,
    playerConfigs,
    onPitClick: (index) => controller.handleHumanMove(index),
  });

  renderBotSelect(elements.playerOneBot, availableBots, botSelections[PLAYER_ONE]);
  renderBotSelect(elements.playerTwoBot, availableBots, botSelections[PLAYER_TWO]);
  botOptionsRendered = true;

  elements.modeBadge.textContent = modeLabels[mode] ?? mode;
  elements.p1StoreScore.textContent = String(state.board[6]);
  elements.p2StoreScore.textContent = String(state.board[13]);
  elements.botSpeedLabel.textContent = `${botSpeed} ms per move`;
  elements.pauseResumeBtn.textContent = isPaused ? 'Resume' : 'Pause';
  elements.gameMode.value = mode;
  elements.undoBtn.disabled = !canUndo;
  elements.replayBtn.disabled = moveLog.length === 0;

  const showBotControls = mode !== 'human-vs-human';
  elements.botControls.classList.toggle('hidden', !showBotControls);
  elements.playerOneBotGroup.classList.toggle('hidden', mode !== 'bot-vs-bot');
  elements.playerTwoBotGroup.classList.toggle('hidden', mode === 'human-vs-human');

  elements.stepBtn.disabled = mode === 'human-vs-human' || (!controller.isCurrentPlayerBot() && !state.gameOver);
  elements.pauseResumeBtn.disabled = mode === 'human-vs-human' || state.gameOver;

  if (state.gameOver) {
    if (state.winner === 'tie') {
      elements.statusText.textContent = 'Game over — it\'s a tie.';
    } else {
      const winnerLabel = playerConfigs[state.winner]?.label ?? getPlayerLabel(state.winner);
      elements.statusText.textContent = `Game over — ${winnerLabel} wins.`;
    }
    elements.turnText.textContent = `Final score: ${playerConfigs[PLAYER_ONE]?.label ?? 'Player 1'} ${state.board[6]} • ${playerConfigs[PLAYER_TWO]?.label ?? 'Player 2'} ${state.board[13]}`;
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

elements.gameMode.addEventListener('change', (event) => {
  botOptionsRendered = false;
  controller.setMode(event.target.value);
});

elements.playerOneBot.addEventListener('change', (event) => {
  botOptionsRendered = false;
  controller.setBotSelection(PLAYER_ONE, event.target.value);
});

elements.playerTwoBot.addEventListener('change', (event) => {
  botOptionsRendered = false;
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
  controller.logEntries = [];
  renderLog([]);
  controller.emitState();
});

controller.restart();
