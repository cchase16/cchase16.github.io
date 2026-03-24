import { GameController } from './controller.js';
import { getPlayerLabel, getSowingSequence, PLAYER_ONE, PLAYER_TWO } from './engine.js';
import { renderBoard } from './renderer.js';
import { createBotFromSelection, getAvailableBotDefinitions, getBotDisplayName } from './bots/catalog.js';
import {
  FEATURE_KEYS,
  createBotProfile,
  createEmptyWeights,
  createStarterProfile,
  getCustomBotId,
  isPolicyValueSearchBot,
  isWeightedPreferenceBot,
  normalizeCustomBot,
  normalizeProfile,
  parseCustomBotJson,
  serializeCustomBot,
  touchCustomBot,
} from './bots/botProfiles.js';
import { createDuplicateProfile, loadStoredProfiles, mergeImportedProfiles, saveStoredProfiles } from './bots/profileStore.js';
import { runEvaluation } from './simulation/matchRunner.js';

const elements = {
  board: document.getElementById('board'),
  statusText: document.getElementById('statusText'),
  turnText: document.getElementById('turnText'),
  hintBtn: document.getElementById('hintBtn'),
  modeBadge: document.getElementById('modeBadge'),
  workspaceTabs: Array.from(document.querySelectorAll('[data-tab-target]')),
  workspacePanels: Array.from(document.querySelectorAll('[data-tab-panel]')),
  leaderboardStatusText: document.getElementById('leaderboardStatusText'),
  leaderboardBody: document.getElementById('leaderboardBody'),
  leaderboardMatchesCount: document.getElementById('leaderboardMatchesCount'),
  leaderboardTrackedBots: document.getElementById('leaderboardTrackedBots'),
  leaderboardPromotedCount: document.getElementById('leaderboardPromotedCount'),
  leaderboardCurrentLeader: document.getElementById('leaderboardCurrentLeader'),
  leaderboardSnapshot: document.getElementById('leaderboardSnapshot'),
  moveLog: document.getElementById('moveLog'),
  gameMode: document.getElementById('gameMode'),
  botControls: document.getElementById('botControls'),
  botSpeed: document.getElementById('botSpeed'),
  botSpeedLabel: document.getElementById('botSpeedLabel'),
  pauseResumeBtn: document.getElementById('pauseResumeBtn'),
  stepBtn: document.getElementById('stepBtn'),
  newGameBtn: document.getElementById('newGameBtn'),
  matchBeginBtn: document.getElementById('matchBeginBtn'),
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
  labProfileSelect: document.getElementById('labProfileSelect'),
  labCreateProfileBtn: document.getElementById('labCreateProfileBtn'),
  labDuplicateProfileBtn: document.getElementById('labDuplicateProfileBtn'),
  labDeleteProfileBtn: document.getElementById('labDeleteProfileBtn'),
  labExportProfileBtn: document.getElementById('labExportProfileBtn'),
  labImportProfileBtn: document.getElementById('labImportProfileBtn'),
  labImportInput: document.getElementById('labImportInput'),
  labProfileName: document.getElementById('labProfileName'),
  labProfileMeta: document.getElementById('labProfileMeta'),
  labWeightedControls: document.getElementById('labWeightedControls'),
  labTemperature: document.getElementById('labTemperature'),
  labEpsilon: document.getElementById('labEpsilon'),
  labLearningRate: document.getElementById('labLearningRate'),
  labGamma: document.getElementById('labGamma'),
  labBatchSize: document.getElementById('labBatchSize'),
  labEvalGames: document.getElementById('labEvalGames'),
  labTrainingOpponent: document.getElementById('labTrainingOpponent'),
  labModelSection: document.getElementById('labModelSection'),
  labModelSummary: document.getElementById('labModelSummary'),
  labWeightsSection: document.getElementById('labWeightsSection'),
  labWeights: document.getElementById('labWeights'),
  labResetWeightsBtn: document.getElementById('labResetWeightsBtn'),
  labEvalPlayerOne: document.getElementById('labEvalPlayerOne'),
  labEvalPlayerTwo: document.getElementById('labEvalPlayerTwo'),
  labEvalGamesCount: document.getElementById('labEvalGamesCount'),
  labRunEvaluationBtn: document.getElementById('labRunEvaluationBtn'),
  labEvaluationStatus: document.getElementById('labEvaluationStatus'),
  labEvaluationSummary: document.getElementById('labEvaluationSummary'),
  labEvaluationBadge: document.getElementById('labEvaluationBadge'),
};

const modeLabels = {
  'human-vs-human': 'Human vs Human',
  'human-vs-bot': 'Human vs Bot',
  'bot-vs-bot': 'Bot vs Bot',
};

const featureLabels = {
  bias: 'Bias',
  extraTurn: 'Extra Turn',
  capturedStonesNorm: 'Captured Stones',
  myStoreGainNorm: 'My Store Gain',
  oppStoreGainNorm: 'Opponent Store Gain',
  mySideAfterNorm: 'My Side After',
  oppSideAfterNorm: 'Opponent Side After',
  movePitNorm: 'Pit Bias',
  winningMove: 'Winning Move',
  opponentReplyThreatNorm: 'Reply Threat',
};

const featureTooltips = {
  bias: 'A constant baseline term added to every move score. It is mostly an intercept and usually changes little by itself because every legal move receives the same base value.',
  extraTurn: 'Rewards moves that end in your store and let you play again. Higher values make the bot strongly favor keeping the turn when possible.',
  capturedStonesNorm: 'Rewards moves that capture stones from the opposite pit. Higher values make the bot chase captures more aggressively.',
  myStoreGainNorm: 'Rewards immediate increases to your own store after the move. Higher values push the bot toward moves that score right away.',
  oppStoreGainNorm: 'Measures how much the opponent store increases after this move. Negative values discourage moves that help the opponent score soon.',
  mySideAfterNorm: 'Tracks how many stones remain on your side after the move. It can encourage preserving future options instead of emptying your side too quickly.',
  oppSideAfterNorm: 'Tracks how many stones remain on the opponent side after the move. Negative values usually prefer positions that leave the opponent with fewer strong replies.',
  movePitNorm: 'A learned preference for pit position itself. It lets the bot discover that some pits tend to be stronger or weaker in repeated play.',
  winningMove: 'Rewards moves that immediately end the game in your favor. Higher values make the bot strongly prioritize direct wins.',
  opponentReplyThreatNorm: 'Estimates how dangerous the opponent best reply looks after this move. Negative values make the bot avoid moves that set up strong counters.',
};

const uiEffects = {
  highlightedPit: null,
  pickedPit: null,
  hintPit: null,
  hintMessage: '',
  hintSignature: '',
  drawerOpen: false,
  activeTab: 'game',
};

const labState = {
  profiles: loadStoredProfiles(),
  selectedProfileId: null,
  evaluation: {
    running: false,
    progress: 0,
    totalGames: 0,
    playerOneBotId: null,
    playerTwoBotId: null,
    status: 'Ready to evaluate any two bots from the roster.',
    summary: null,
  },
};

labState.selectedProfileId = (labState.profiles[0] ?? createStarterProfile()).id;
Object.assign(labState.evaluation, getDefaultEvaluationSelections(labState.profiles, labState.selectedProfileId));

let latestViewModel = null;
let audioContext = null;
const weightInputs = new Map();

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
  clearHint();
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
  const currentMarkup = availableBots.map((bot) => `<option value="${bot.id}">${escapeHtml(bot.name)}</option>`).join('');
  if (selectElement.innerHTML !== currentMarkup) selectElement.innerHTML = currentMarkup;
  if (availableBots.some((bot) => bot.id === selectedBot)) {
    selectElement.value = selectedBot;
  }
}

function syncTextInput(input, value) {
  if (document.activeElement !== input) input.value = value;
}

function syncNumberInput(input, value, fractionDigits = 2) {
  if (document.activeElement === input) return;
  input.value = typeof value === 'number' ? String(Number(value.toFixed(fractionDigits))) : '';
}

function setDrawerOpen(open) {
  uiEffects.drawerOpen = open;
  elements.configDrawer.classList.toggle('open', open);
  elements.drawerBackdrop.classList.toggle('hidden', !open);
  elements.configDrawer.setAttribute('aria-hidden', String(!open));
  elements.configToggleBtn.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
}

function setActiveTab(tabId) {
  uiEffects.activeTab = tabId;
  renderWorkspaceTabs();
}

function renderWorkspaceTabs() {
  for (const button of elements.workspaceTabs) {
    const isActive = button.dataset.tabTarget === uiEffects.activeTab;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
    button.setAttribute('tabindex', isActive ? '0' : '-1');
  }

  for (const panel of elements.workspacePanels) {
    const isActive = panel.dataset.tabPanel === uiEffects.activeTab;
    panel.classList.toggle('active', isActive);
  }
}

function render(viewModel) {
  latestViewModel = viewModel;
  renderLatest();
}

function getHintSignature({ state, mode }) {
  return `${mode}|${state.currentPlayer}|${state.moveNumber}|${state.board.join(',')}`;
}

function clearHint() {
  uiEffects.hintPit = null;
  uiEffects.hintMessage = '';
  uiEffects.hintSignature = '';
}

function revealHint() {
  const hint = controller.getHintMove();
  if (!hint) {
    clearHint();
    renderLatest();
    return;
  }

  const pitLabel = hint.player === PLAYER_ONE ? hint.pitIndex + 1 : hint.pitIndex - 6;
  const advisorLabel = botLabel(hint.botId);
  uiEffects.hintPit = hint.pitIndex;
  uiEffects.hintMessage = `Hint: ${advisorLabel} would play Pit ${pitLabel} from your side.`;
  uiEffects.hintSignature = getHintSignature({
    state: latestViewModel?.state ?? controller.state,
    mode: latestViewModel?.mode ?? controller.mode,
  });
  renderLatest();
}

function renderLatest() {
  if (!latestViewModel) return;

  const { state, mode, playerConfigs, isPaused, isAnimating, botSpeed, availableBots, botSelections, playerNames, awaitingBotMatchStart, canBeginMatch, canUndo, moveLog } = latestViewModel;
  const currentHintSignature = getHintSignature({ state, mode });
  if (uiEffects.hintPit !== null && uiEffects.hintSignature !== currentHintSignature) {
    clearHint();
  }
  const showHintButton = mode === 'human-vs-bot';
  const canUseHint = showHintButton
    && !state.gameOver
    && !isAnimating
    && !awaitingBotMatchStart
    && playerConfigs[state.currentPlayer]?.type === 'human';

  renderBoard({
    boardElement: elements.board,
    state,
    playerConfigs,
    onPitClick: (index) => controller.handleHumanMove(index),
    highlightedPit: uiEffects.highlightedPit ?? uiEffects.hintPit,
    pickedPit: uiEffects.pickedPit,
    animating: isAnimating,
  });

  renderBotSelect(elements.playerOneBot, availableBots, botSelections[PLAYER_ONE]);
  renderBotSelect(elements.playerTwoBot, availableBots, botSelections[PLAYER_TWO]);
  syncTextInput(elements.playerOneName, playerNames[PLAYER_ONE] ?? '');
  syncTextInput(elements.playerTwoName, playerNames[PLAYER_TWO] ?? '');

  renderWorkspaceTabs();
  renderLeaderboard(latestViewModel);
  renderBotLab();

  elements.modeBadge.textContent = modeLabels[mode] ?? mode;
  elements.hintBtn.classList.toggle('hidden', !showHintButton);
  elements.hintBtn.disabled = !canUseHint;
  elements.p1StoreScore.textContent = String(state.board[6]);
  elements.p2StoreScore.textContent = String(state.board[13]);
  elements.botSpeedLabel.textContent = `${botSpeed} ms per move`;
  elements.pauseResumeBtn.textContent = isPaused ? 'Resume' : 'Pause';
  elements.gameMode.value = mode;
  elements.undoBtn.disabled = !canUndo || isAnimating;
  elements.replayBtn.disabled = moveLog.length === 0 || isAnimating;
  elements.newGameBtn.disabled = isAnimating;
  elements.matchBeginBtn.disabled = !canBeginMatch;

  const showBotControls = mode !== 'human-vs-human';
  elements.botControls.classList.toggle('hidden', !showBotControls);
  elements.playerOneBot.disabled = mode !== 'bot-vs-bot' || isAnimating;
  elements.playerTwoBot.disabled = mode === 'human-vs-human' || isAnimating;
  elements.playerOneName.disabled = isAnimating;
  elements.playerTwoName.disabled = isAnimating;
  elements.gameMode.disabled = isAnimating;
  elements.botSpeed.disabled = isAnimating;
  elements.stepBtn.disabled = mode === 'human-vs-human' || isAnimating || awaitingBotMatchStart || (!controller.isCurrentPlayerBot() && !state.gameOver);
  elements.pauseResumeBtn.disabled = mode === 'human-vs-human' || state.gameOver || isAnimating || awaitingBotMatchStart;

  if (state.gameOver) {
    if (state.winner === 'tie') {
      elements.statusText.textContent = 'Game over - it\'s a tie.';
    } else {
      const winnerLabel = playerConfigs[state.winner]?.label ?? getPlayerLabel(state.winner);
      elements.statusText.textContent = `Game over - ${winnerLabel} wins.`;
    }
    elements.turnText.textContent = `Final score: ${playerConfigs[PLAYER_ONE]?.label ?? 'Player 1'} ${state.board[6]} • ${playerConfigs[PLAYER_TWO]?.label ?? 'Player 2'} ${state.board[13]}`;
  } else if (isAnimating) {
    const currentLabel = playerConfigs[state.currentPlayer]?.label ?? getPlayerLabel(state.currentPlayer);
    elements.statusText.textContent = `${currentLabel} is sowing seeds...`;
    elements.turnText.textContent = 'Graphite wells pulse softly as each seed lands.';
  } else if (awaitingBotMatchStart) {
    elements.statusText.textContent = 'Bot match ready to begin.';
    elements.turnText.textContent = 'Review the setup, then click Match Begin to start the bots.';
  } else {
    const currentLabel = playerConfigs[state.currentPlayer]?.label ?? getPlayerLabel(state.currentPlayer);
    const currentType = playerConfigs[state.currentPlayer]?.type ?? 'human';
    elements.statusText.textContent = `${currentLabel}'s turn`;
    elements.turnText.textContent = currentType === 'bot'
      ? 'Bot is thinking...'
      : (uiEffects.hintMessage || 'Choose one of the highlighted pits.');
  }

  window.render_game_to_text = () => JSON.stringify({
    currentPlayer: state.currentPlayer,
    gameOver: state.gameOver,
    winner: state.winner,
    board: state.board,
    moveNumber: state.moveNumber,
    mode,
    hint: {
      visible: showHintButton,
      enabled: canUseHint,
      pitIndex: uiEffects.hintPit,
      message: uiEffects.hintMessage || null,
    },
    activeTab: uiEffects.activeTab,
    selectedProfile: getSelectedProfile()?.name ?? null,
    evaluation: {
      running: labState.evaluation.running,
      progress: labState.evaluation.progress,
      totalGames: labState.evaluation.totalGames,
    },
  });
}

function renderLeaderboard(viewModel) {
  const { state, availableBots, botSelections, playerConfigs } = viewModel;
  const selectedProfile = getSelectedProfile();
  const selectedProfileBotId = selectedProfile ? getCustomBotId(selectedProfile.id) : null;
  const summary = labState.evaluation.summary;
  const promotedCount = availableBots.filter((bot) => bot.kind === 'promoted').length;
  const featuredMatches = Number(state.moveNumber > 0) + Number(Boolean(summary));

  elements.leaderboardMatchesCount.textContent = String(featuredMatches);
  elements.leaderboardTrackedBots.textContent = String(availableBots.length);
  elements.leaderboardPromotedCount.textContent = String(promotedCount);
  elements.leaderboardCurrentLeader.textContent = getCurrentLeaderLabel(state, playerConfigs);
  elements.leaderboardStatusText.textContent = buildLeaderboardStatusText(state, playerConfigs, summary);
  elements.leaderboardBody.innerHTML = buildLeaderboardRows({
    availableBots,
    botSelections,
    selectedProfileBotId,
    summary,
  });
  elements.leaderboardSnapshot.innerHTML = [
    snapshotCard('Current Table', buildCurrentTableSummary(state, playerConfigs)),
    snapshotCard('Promotion Gate', buildPromotionGateSummary(selectedProfile, summary)),
    snapshotCard('Access Boundary', 'The game, leaderboard, and Bot Lab now live in separate modules, so the lab can be restricted later without reworking the public surface.'),
  ].join('');
}

function renderBotLab() {
  const profile = getSelectedProfile();
  const profiles = labState.profiles;
  if (!profile) return;
  const isWeighted = isWeightedPreferenceBot(profile);
  const isSearchModel = isPolicyValueSearchBot(profile);

  const selectMarkup = profiles.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  if (elements.labProfileSelect.innerHTML !== selectMarkup) {
    elements.labProfileSelect.innerHTML = selectMarkup;
  }
  elements.labProfileSelect.value = profile.id;

  syncTextInput(elements.labProfileName, profile.name);
  elements.labWeightedControls.classList.toggle('hidden', !isWeighted);
  elements.labWeightsSection.classList.toggle('hidden', !isWeighted);
  elements.labModelSection.classList.toggle('hidden', !isSearchModel);

  if (isWeighted) {
    syncNumberInput(elements.labTemperature, profile.play.temperature, 2);
    syncNumberInput(elements.labEpsilon, profile.play.epsilon, 2);
    syncNumberInput(elements.labLearningRate, profile.training.learningRate, 4);
    syncNumberInput(elements.labGamma, profile.training.gamma, 2);
    syncNumberInput(elements.labBatchSize, profile.training.batchSize, 0);
    syncNumberInput(elements.labEvalGames, profile.training.evalGames, 0);
    renderTrainingOpponentSelect(profile.training.opponentBotId);
  } else if (isSearchModel) {
    elements.labModelSummary.innerHTML = renderSearchModelSummary(profile);
  }
  const evaluationSelections = syncEvaluationSelections(labState.profiles, labState.selectedProfileId);
  labState.evaluation.playerOneBotId = evaluationSelections.playerOneBotId;
  labState.evaluation.playerTwoBotId = evaluationSelections.playerTwoBotId;
  renderEvaluationBotSelect(elements.labEvalPlayerOne, labState.evaluation.playerOneBotId, evaluationSelections.playerOneBotId);
  renderEvaluationBotSelect(elements.labEvalPlayerTwo, labState.evaluation.playerTwoBotId, evaluationSelections.playerTwoBotId);
  elements.labDeleteProfileBtn.disabled = profiles.length <= 1 || labState.evaluation.running;
  elements.labRunEvaluationBtn.disabled = labState.evaluation.running;
  elements.labResetWeightsBtn.disabled = !isWeighted;
  elements.labTemperature.disabled = !isWeighted;
  elements.labEpsilon.disabled = !isWeighted;
  elements.labLearningRate.disabled = !isWeighted;
  elements.labGamma.disabled = !isWeighted;
  elements.labBatchSize.disabled = !isWeighted;
  elements.labEvalGames.disabled = !isWeighted;
  elements.labTrainingOpponent.disabled = !isWeighted;
  elements.labEvalPlayerOne.disabled = labState.evaluation.running;
  elements.labEvalPlayerTwo.disabled = labState.evaluation.running;
  elements.labEvalGamesCount.disabled = labState.evaluation.running;

  for (const key of FEATURE_KEYS) {
    const input = weightInputs.get(key);
    if (input) {
      input.disabled = !isWeighted;
      if (isWeighted) {
        syncNumberInput(input, profile.weights[key] ?? 0, 3);
      } else if (document.activeElement !== input) {
        input.value = '';
      }
    }
  }

  elements.labProfileMeta.textContent = `Type: ${isWeighted ? 'Weighted Preference Bot' : 'Policy Value Search Model'} • ID: ${profile.id} • Updated ${formatTimestamp(profile.updatedAt)}`;
  elements.labEvaluationStatus.textContent = labState.evaluation.status;
  renderEvaluationSummary(labState.evaluation.summary);
  renderEvaluationBadge(labState.evaluation.summary);
}

function renderEvaluationSummary(summary) {
  if (!summary) {
    elements.labEvaluationSummary.innerHTML = '';
    return;
  }

  const playerOneLabel = summary.meta?.playerOneName ?? 'Player 1';
  const playerTwoLabel = summary.meta?.playerTwoName ?? 'Player 2';
  elements.labEvaluationSummary.innerHTML = [
    summaryChip('Player 1', playerOneLabel),
    summaryChip('Player 2', playerTwoLabel),
    summaryChip('P1 Win Rate', `${formatPercent(summary.winRateA)}`),
    summaryChip('Record', `${summary.winsA}-${summary.winsB}-${summary.ties}`),
    summaryChip('Avg Margin', `${formatSigned(summary.averageMarginA)}`),
    summaryChip('Avg Stores', `${summary.averageStoreA.toFixed(1)} - ${summary.averageStoreB.toFixed(1)}`),
  ].join('');
}

function renderSearchModelSummary(modelBundle) {
  const hiddenLayers = modelBundle.architecture?.hiddenLayerSizes?.join(' -> ') ?? 'Unknown';
  const lastLeagueRun = modelBundle.trainingMetadata?.lastLeagueTrainingRun;
  const lastSupervisedRun = modelBundle.trainingMetadata?.lastSupervisedTrainingRun;
  const searchDepth = lastLeagueRun?.searchDepth ?? modelBundle.trainingMetadata?.searchDepth ?? 2;

  return [
    summaryChip('Model Type', 'Policy Value Search'),
    summaryChip('Search Depth', `${searchDepth}`),
    summaryChip('Input Size', `${modelBundle.architecture?.inputLength ?? '-'}`),
    summaryChip('Hidden Layers', hiddenLayers),
    summaryChip('Games Seen', `${modelBundle.trainingMetadata?.gamesSeen ?? 0}`),
    summaryChip('Last Train', lastLeagueRun?.completedAt
      ? formatTimestamp(lastLeagueRun.completedAt)
      : lastSupervisedRun?.completedAt
        ? formatTimestamp(lastSupervisedRun.completedAt)
        : 'Imported'),
  ].join('');
}

function renderEvaluationBadge(summary) {
  if (labState.evaluation.running) {
    elements.labEvaluationBadge.textContent = `Evaluating ${labState.evaluation.progress}/${labState.evaluation.totalGames}`;
    return;
  }

  if (!summary) {
    elements.labEvaluationBadge.textContent = 'Idle';
    return;
  }

  if (summary.winsA > summary.winsB) {
    elements.labEvaluationBadge.textContent = 'P1 Edge';
  } else if (summary.winsB > summary.winsA) {
    elements.labEvaluationBadge.textContent = 'P2 Edge';
  } else {
    elements.labEvaluationBadge.textContent = 'Even';
  }
}

function buildLeaderboardStatusText(state, playerConfigs, summary) {
  if (summary?.meta) {
    return `${summary.meta.playerOneName} posted ${formatPercent(summary.winRateA)} against ${summary.meta.playerTwoName} with an average margin of ${formatSigned(summary.averageMarginA)}.`;
  }

  if (state.gameOver) {
    return `${getCurrentLeaderLabel(state, playerConfigs)} closed out the featured match.`;
  }

  if (state.moveNumber > 0) {
    return `${getCurrentLeaderLabel(state, playerConfigs)} currently leads the live board match.`;
  }

  return 'Finish a match or run an evaluation to start building the board.';
}

function buildLeaderboardRows({ availableBots, botSelections, selectedProfileBotId, summary }) {
  const builtinPriority = {
    'elite-rules': 40,
    minimax: 30,
    greedy: 20,
    random: 10,
  };

  const rows = availableBots.map((bot) => {
    const inCurrentSetup = bot.id === botSelections[PLAYER_ONE] || bot.id === botSelections[PLAYER_TWO];
    let track = 'Bot Lab';
    let status = 'Waiting';
    let statusClassName = 'waiting';
    let record = '--';
    let signal = 'Awaiting evaluation.';
    let rankWeight = 100;
    let note = 'Custom contender';

    if (bot.kind === 'promoted') {
      track = 'Public Game';
      status = bot.isChampion ? 'Champion' : 'Promoted';
      statusClassName = 'pass';
      record = 'Live';
      signal = bot.isChampion ? 'Featured arena bot.' : 'Ready for anyone to play.';
      note = 'Promoted contender';
      rankWeight = 300 + (bot.isChampion ? 50 : 0);
    } else if (bot.kind === 'builtin') {
      track = 'Core Roster';
      status = inCurrentSetup ? 'In Match' : 'Ready';
      statusClassName = inCurrentSetup ? 'pass' : 'waiting';
      record = inCurrentSetup ? 'Live' : '--';
      signal = inCurrentSetup ? 'Selected in the current match setup.' : 'Available as a benchmark or opponent.';
      note = 'Built-in rival';
      rankWeight = 200 + (builtinPriority[bot.id] ?? 0);
    }

    if (summary?.meta?.playerOneBotId === bot.id) {
      track = 'Bot Lab';
      status = summary.winsA >= summary.winsB ? 'Latest P1' : 'Reviewed';
      statusClassName = summary.winsA >= summary.winsB ? 'pass' : 'waiting';
      record = `${summary.winsA}-${summary.winsB}-${summary.ties}`;
      signal = `${formatPercent(summary.winRateA)} vs ${summary.meta.playerTwoName} | ${formatSigned(summary.averageMarginA)} margin.`;
      note = 'Latest lab player 1';
      rankWeight = 400 + summary.winRateA * 100 + summary.averageMarginA;
    } else if (summary?.meta?.playerTwoBotId === bot.id) {
      track = 'Bot Lab';
      status = summary.winsB >= summary.winsA ? 'Latest P2' : 'Reviewed';
      statusClassName = summary.winsB >= summary.winsA ? 'pass' : 'waiting';
      record = `${summary.winsB}-${summary.winsA}-${summary.ties}`;
      signal = `Faced ${summary.meta.playerOneName} | ${formatSigned(-summary.averageMarginA)} margin.`;
      note = 'Latest lab player 2';
      rankWeight = 390 + summary.winsB * 10 - summary.averageMarginA;
    } else if (bot.id === selectedProfileBotId) {
      status = 'Selected';
      statusClassName = 'waiting';
      signal = 'Current lab focus. Run an evaluation to post a benchmark.';
      note = 'Selected lab profile';
      rankWeight = 180;
    }

    return {
      name: bot.name,
      note,
      track,
      status,
      statusClassName,
      record,
      signal,
      rankWeight,
    };
  });

  rows.sort((left, right) => right.rankWeight - left.rankWeight || left.name.localeCompare(right.name));

  return rows.map((row, index) => `
    <tr>
      <td><span class="leaderboard-rank">${index + 1}</span></td>
      <td>
        <div class="table-name">
          <strong>${escapeHtml(row.name)}</strong>
          <span>${escapeHtml(row.note)}</span>
        </div>
      </td>
      <td><span class="track-badge">${escapeHtml(row.track)}</span></td>
      <td><span class="status-pill ${row.statusClassName}">${escapeHtml(row.status)}</span></td>
      <td>${escapeHtml(row.record)}</td>
      <td class="table-signal">${escapeHtml(row.signal)}</td>
    </tr>
  `).join('');
}

function buildCurrentTableSummary(state, playerConfigs) {
  const playerOneLabel = playerConfigs[PLAYER_ONE]?.label ?? 'Player 1';
  const playerTwoLabel = playerConfigs[PLAYER_TWO]?.label ?? 'Player 2';
  return `${playerOneLabel} ${state.board[6]} - ${state.board[13]} ${playerTwoLabel}. ${getCurrentLeaderLabel(state, playerConfigs)}.`;
}

function buildPromotionGateSummary(selectedProfile, summary) {
  if (!selectedProfile) {
    return 'Select a lab profile to start collecting promotion signals.';
  }

  if (!summary) {
    return `${selectedProfile.name} has not posted a benchmark yet. Run an evaluation to place it on the board.`;
  }

  if (summary.meta?.playerOneBotId !== getCustomBotId(selectedProfile.id)) {
    return `${summary.meta?.playerOneName ?? 'The latest Player 1 bot'} and ${summary.meta?.playerTwoName ?? 'Player 2'} are the current lab benchmark matchup.`;
  }

  const clearsGate = summary.winRateA > 0.5 && summary.averageMarginA > 0;
  return clearsGate
    ? `${selectedProfile.name} currently clears the promotion gate with a positive margin and winning record.`
    : `${selectedProfile.name} is playable, but it still needs stronger results before promotion.`;
}

function getCurrentLeaderLabel(state, playerConfigs) {
  if (state.board[6] === state.board[13]) {
    if (state.gameOver && state.winner === 'tie') {
      return 'Tie game';
    }
    return 'Even board';
  }

  const leader = state.board[6] > state.board[13] ? PLAYER_ONE : PLAYER_TWO;
  return `${playerConfigs[leader]?.label ?? getPlayerLabel(leader)} leads`;
}

function snapshotCard(title, body) {
  return `<div class="snapshot-card"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span></div>`;
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

function initWeightInputs() {
  elements.labWeights.innerHTML = '';

  for (const key of FEATURE_KEYS) {
    const field = document.createElement('div');
    field.className = 'weight-field';

    const label = document.createElement('label');
    label.htmlFor = `weight-${key}`;
    label.textContent = featureLabels[key] ?? key;
    const tooltip = featureTooltips[key] ?? '';
    label.title = tooltip;

    const input = document.createElement('input');
    input.id = `weight-${key}`;
    input.type = 'number';
    input.step = '0.05';
    input.min = '-10';
    input.max = '10';
    input.title = tooltip;
    input.addEventListener('input', () => {
      if (!isWeightedPreferenceBot(getSelectedProfile())) return;
      updateSelectedProfile((profile) => ({
        ...profile,
        weights: {
          ...profile.weights,
          [key]: sanitizeNumber(input.value, profile.weights[key] ?? 0),
        },
      }));
    });

    field.append(label, input);
    elements.labWeights.appendChild(field);
    weightInputs.set(key, input);
  }
}

function getSelectedProfile() {
  return labState.profiles.find((profile) => profile.id === labState.selectedProfileId) ?? labState.profiles[0] ?? null;
}

function setProfiles(profiles, { selectedProfileId = null, statusMessage = null } = {}) {
  const normalizedProfiles = profiles.length ? profiles.map((profile) => normalizeCustomBot(profile)) : [createStarterProfile()];
  const nextProfiles = syncTrainingOpponentSelections(normalizedProfiles);
  labState.profiles = nextProfiles;
  const resolvedSelectedProfileId = selectedProfileId && nextProfiles.some((profile) => profile.id === selectedProfileId)
    ? selectedProfileId
    : nextProfiles[0].id;
  labState.selectedProfileId = resolvedSelectedProfileId;
  Object.assign(labState.evaluation, syncEvaluationSelections(nextProfiles, resolvedSelectedProfileId));
  saveStoredProfiles(nextProfiles);
  controller.setCustomProfiles(nextProfiles);
  if (statusMessage) {
    labState.evaluation.status = statusMessage;
  }
  renderLatest();
}

function updateSelectedProfile(mutator) {
  const current = getSelectedProfile();
  if (!current) return;

  const nextProfiles = labState.profiles.map((profile) => {
    if (profile.id !== current.id) return profile;
    const updated = mutator(normalizeCustomBot(profile));
    return touchCustomBot(updated);
  });

  setProfiles(nextProfiles, { selectedProfileId: current.id });
}

async function runLabEvaluation() {
  if (labState.evaluation.running) return;

  const playerOneBotId = labState.evaluation.playerOneBotId;
  const playerTwoBotId = labState.evaluation.playerTwoBotId;
  if (!playerOneBotId || !playerTwoBotId) return;

  const playerOneName = botLabel(playerOneBotId);
  const playerTwoName = botLabel(playerTwoBotId);
  const totalGames = Math.max(1, Math.round(Number(elements.labEvalGamesCount.value) || 100));
  const chunkSize = 10;
  const seedBase = `${playerOneBotId}:${playerTwoBotId}:${Date.now()}`;

  labState.evaluation = {
    ...labState.evaluation,
    running: true,
    progress: 0,
    totalGames,
    status: `Evaluating ${playerOneName} as Player 1 against ${playerTwoName} as Player 2...`,
    summary: null,
  };
  renderLatest();

  try {
    const aggregate = createEvaluationAccumulator();

    for (let offset = 0; offset < totalGames; offset += chunkSize) {
      const part = runEvaluation({
        botA: ({ rng }) => createBotFromSelection(playerOneBotId, labState.profiles, { rng }),
        botB: ({ rng }) => createBotFromSelection(playerTwoBotId, labState.profiles, { rng }),
        games: Math.min(chunkSize, totalGames - offset),
        alternateStarts: false,
        seed: `${seedBase}:${offset}`,
      });

      accumulateEvaluation(aggregate, part.results);
      labState.evaluation.progress = Math.min(totalGames, offset + part.results.length);
      labState.evaluation.status = `Evaluated ${labState.evaluation.progress}/${totalGames} games: ${playerOneName} vs ${playerTwoName}.`;
      labState.evaluation.summary = finalizeEvaluationAccumulator(aggregate, {
        playerOneBotId,
        playerTwoBotId,
        playerOneName,
        playerTwoName,
      });
      renderLatest();
      await wait(0);
    }

    const summary = finalizeEvaluationAccumulator(aggregate, {
      playerOneBotId,
      playerTwoBotId,
      playerOneName,
      playerTwoName,
    });
    const matchupText = summary.winsA > summary.winsB
      ? `${playerOneName} has the edge over ${playerTwoName}.`
      : summary.winsB > summary.winsA
        ? `${playerTwoName} has the edge over ${playerOneName}.`
        : `${playerOneName} and ${playerTwoName} are currently even.`;

    labState.evaluation = {
      ...labState.evaluation,
      running: false,
      progress: totalGames,
      totalGames,
      status: `${matchupText} Final result: ${formatPercent(summary.winRateA)} win rate for Player 1 and ${formatSigned(summary.averageMarginA)} average margin.`,
      summary,
    };
  } catch (error) {
    labState.evaluation = {
      ...labState.evaluation,
      running: false,
      progress: 0,
      totalGames: 0,
      status: `Evaluation failed: ${error.message}`,
      summary: null,
    };
  }

  renderLatest();
}

function createEvaluationAccumulator() {
  return {
    games: 0,
    winsA: 0,
    winsB: 0,
    ties: 0,
    marginSumA: 0,
    storeSumA: 0,
    storeSumB: 0,
    bySeat: {
      asPlayerOne: { games: 0, wins: 0, losses: 0, ties: 0, marginSum: 0 },
      asPlayerTwo: { games: 0, wins: 0, losses: 0, ties: 0, marginSum: 0 },
    },
  };
}

function accumulateEvaluation(accumulator, results) {
  for (const result of results) {
    accumulator.games += 1;
    accumulator.marginSumA += result.marginA;
    accumulator.storeSumA += result.storesA;
    accumulator.storeSumB += result.storesB;

    const seat = result.botAPlayer === PLAYER_ONE ? accumulator.bySeat.asPlayerOne : accumulator.bySeat.asPlayerTwo;
    seat.games += 1;
    seat.marginSum += result.marginA;

    if (result.winner === 'tie') {
      accumulator.ties += 1;
      seat.ties += 1;
    } else if (result.winner === 'A') {
      accumulator.winsA += 1;
      seat.wins += 1;
    } else {
      accumulator.winsB += 1;
      seat.losses += 1;
    }
  }
}

function finalizeEvaluationAccumulator(accumulator, meta = null) {
  const games = Math.max(1, accumulator.games);
  return {
    games: accumulator.games,
    winsA: accumulator.winsA,
    winsB: accumulator.winsB,
    ties: accumulator.ties,
    averageMarginA: accumulator.marginSumA / games,
    averageStoreA: accumulator.storeSumA / games,
    averageStoreB: accumulator.storeSumB / games,
    winRateA: accumulator.winsA / games,
    bySeat: {
      asPlayerOne: finalizeSeatStats(accumulator.bySeat.asPlayerOne),
      asPlayerTwo: finalizeSeatStats(accumulator.bySeat.asPlayerTwo),
    },
    meta,
  };
}

function finalizeSeatStats(stats) {
  return {
    games: stats.games,
    wins: stats.wins,
    losses: stats.losses,
    ties: stats.ties,
    averageMargin: stats.games ? stats.marginSum / stats.games : 0,
  };
}

function ensureEven(value) {
  const rounded = Math.max(2, Math.round(value || 2));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function sanitizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function botLabel(botId) {
  return getBotDisplayName(botId, labState.profiles);
}

function summaryChip(label, value) {
  return `<div class="summary-chip"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSigned(value) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function formatTimestamp(value) {
  return new Date(value).toLocaleString();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderTrainingOpponentSelect(selectedBotId) {
  const options = getAvailableBotDefinitions(labState.profiles);
  const currentMarkup = options.map((bot) => `<option value="${bot.id}">${escapeHtml(bot.name)}</option>`).join('');
  if (elements.labTrainingOpponent.innerHTML !== currentMarkup) {
    elements.labTrainingOpponent.innerHTML = currentMarkup;
  }

  if (options.some((bot) => bot.id === selectedBotId)) {
    elements.labTrainingOpponent.value = selectedBotId;
  }
}

function renderEvaluationBotSelect(selectElement, selectedBotId, fallbackId) {
  const options = getAvailableBotDefinitions(labState.profiles);
  const currentMarkup = options.map((bot) => `<option value="${bot.id}">${escapeHtml(bot.name)}</option>`).join('');
  if (selectElement.innerHTML !== currentMarkup) {
    selectElement.innerHTML = currentMarkup;
  }

  const resolvedFallbackId = options.some((bot) => bot.id === fallbackId)
    ? fallbackId
    : options.some((bot) => bot.id === 'greedy')
      ? 'greedy'
      : options[0]?.id ?? '';
  selectElement.value = options.some((bot) => bot.id === selectedBotId)
    ? selectedBotId
    : resolvedFallbackId;
}

function getDefaultEvaluationSelections(profiles, selectedProfileId = null) {
  const options = getAvailableBotDefinitions(profiles);
  const ids = new Set(options.map((bot) => bot.id));
  const preferredPlayerOneId = selectedProfileId ? getCustomBotId(selectedProfileId) : null;
  const playerOneBotId = ids.has(preferredPlayerOneId)
    ? preferredPlayerOneId
    : ids.has('greedy')
      ? 'greedy'
      : options[0]?.id ?? '';

  let playerTwoBotId = ids.has('greedy')
    ? 'greedy'
    : options.find((bot) => bot.id !== playerOneBotId)?.id ?? options[0]?.id ?? '';

  if (playerTwoBotId === playerOneBotId) {
    playerTwoBotId = options.find((bot) => bot.id !== playerOneBotId)?.id ?? playerOneBotId;
  }

  return { playerOneBotId, playerTwoBotId };
}

function syncEvaluationSelections(profiles, selectedProfileId = null) {
  const options = getAvailableBotDefinitions(profiles);
  const ids = new Set(options.map((bot) => bot.id));
  const defaults = getDefaultEvaluationSelections(profiles, selectedProfileId);

  let playerOneBotId = ids.has(labState.evaluation.playerOneBotId) ? labState.evaluation.playerOneBotId : defaults.playerOneBotId;
  let playerTwoBotId = ids.has(labState.evaluation.playerTwoBotId) ? labState.evaluation.playerTwoBotId : defaults.playerTwoBotId;

  if (!playerOneBotId) playerOneBotId = defaults.playerOneBotId;
  if (!playerTwoBotId) playerTwoBotId = defaults.playerTwoBotId;

  return { playerOneBotId, playerTwoBotId };
}

function syncTrainingOpponentSelections(profiles) {
  const availableBots = getAvailableBotDefinitions(profiles);
  const validBotIds = new Set(availableBots.map((bot) => bot.id));

  return profiles.map((profile) => {
    if (!isWeightedPreferenceBot(profile)) {
      return normalizeCustomBot(profile);
    }

    const opponentBotId = validBotIds.has(profile.training.opponentBotId) ? profile.training.opponentBotId : 'greedy';
    const opponentProfile = buildTrainingOpponentSnapshot(opponentBotId, profiles);

    return normalizeProfile({
      ...profile,
      training: {
        ...profile.training,
        opponentBotId,
        opponentProfile,
      },
    });
  });
}

function buildTrainingOpponentSnapshot(opponentBotId, profiles) {
  if (!opponentBotId.startsWith('custom:')) return null;

  const profileId = opponentBotId.slice('custom:'.length);
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) return null;

  if (isPolicyValueSearchBot(profile)) {
    return normalizeCustomBot(profile);
  }

  return normalizeProfile({
    ...profile,
    training: {
      ...profile.training,
      opponentProfile: null,
    },
  });
}

['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
  window.addEventListener(eventName, () => { ensureAudioContext(); }, { once: true });
});

for (const button of elements.workspaceTabs) {
  button.addEventListener('click', () => setActiveTab(button.dataset.tabTarget));
}

elements.gameMode.addEventListener('change', (event) => {
  clearHint();
  controller.setMode(event.target.value);
});
elements.playerOneName.addEventListener('input', (event) => controller.setPlayerName(PLAYER_ONE, event.target.value));
elements.playerTwoName.addEventListener('input', (event) => controller.setPlayerName(PLAYER_TWO, event.target.value));
elements.playerOneBot.addEventListener('change', (event) => {
  clearHint();
  controller.setBotSelection(PLAYER_ONE, event.target.value);
});
elements.playerTwoBot.addEventListener('change', (event) => {
  clearHint();
  controller.setBotSelection(PLAYER_TWO, event.target.value);
});
elements.botSpeed.addEventListener('input', (event) => controller.setBotSpeed(Number(event.target.value)));
elements.hintBtn.addEventListener('click', () => revealHint());
elements.pauseResumeBtn.addEventListener('click', () => controller.togglePause());
elements.stepBtn.addEventListener('click', () => controller.step());
elements.undoBtn.addEventListener('click', () => {
  clearHint();
  controller.undo();
});
elements.replayBtn.addEventListener('click', () => {
  clearHint();
  controller.replay();
});
elements.newGameBtn.addEventListener('click', () => {
  clearHint();
  controller.restart();
});
elements.matchBeginBtn.addEventListener('click', () => controller.beginBotMatch());
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

elements.labProfileSelect.addEventListener('change', (event) => {
  labState.selectedProfileId = event.target.value;
  renderLatest();
});

elements.labCreateProfileBtn.addEventListener('click', () => {
  const profileNumber = labState.profiles.length + 1;
  const newProfile = createBotProfile({ name: `Weighted Bot ${profileNumber}` });
  setProfiles([...labState.profiles, newProfile], {
    selectedProfileId: newProfile.id,
    statusMessage: `Created profile ${newProfile.name}.`,
  });
});

elements.labDuplicateProfileBtn.addEventListener('click', () => {
  const selected = getSelectedProfile();
  if (!selected) return;
  const duplicate = createDuplicateProfile(selected);
  setProfiles([...labState.profiles, duplicate], {
    selectedProfileId: duplicate.id,
    statusMessage: `Duplicated ${selected.name}.`,
  });
});

elements.labDeleteProfileBtn.addEventListener('click', () => {
  const selected = getSelectedProfile();
  if (!selected || labState.profiles.length <= 1) return;

  const remaining = labState.profiles.filter((profile) => profile.id !== selected.id);
  setProfiles(remaining, {
    selectedProfileId: remaining[0]?.id ?? null,
    statusMessage: `Deleted ${selected.name}.`,
  });
});

elements.labExportProfileBtn.addEventListener('click', () => {
  const selected = getSelectedProfile();
  if (!selected) return;

  const blob = new Blob([serializeCustomBot(selected)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${selected.name.replaceAll(/\s+/g, '-').toLowerCase()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  labState.evaluation.status = `Exported ${selected.name} as JSON.`;
  renderLatest();
});

elements.labImportProfileBtn.addEventListener('click', () => elements.labImportInput.click());
elements.labImportInput.addEventListener('change', async (event) => {
  const [file] = Array.from(event.target.files ?? []);
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = parseCustomBotJson(text);
    const importedProfiles = Array.isArray(parsed) ? parsed : [parsed];
    const merged = mergeImportedProfiles(labState.profiles, importedProfiles);
    const selectedProfileId = importedProfiles[importedProfiles.length - 1]?.id ?? labState.selectedProfileId;
    setProfiles(merged, {
      selectedProfileId,
      statusMessage: `Imported ${importedProfiles.length} profile${importedProfiles.length === 1 ? '' : 's'}.`,
    });
  } catch (error) {
    labState.evaluation.status = `Import failed: ${error.message}`;
    renderLatest();
  } finally {
    event.target.value = '';
  }
});

elements.labProfileName.addEventListener('input', (event) => {
  updateSelectedProfile((profile) => ({
    ...profile,
    name: event.target.value,
  }));
});

elements.labTemperature.addEventListener('input', (event) => {
  if (!isWeightedPreferenceBot(getSelectedProfile())) return;
  updateSelectedProfile((profile) => ({
    ...profile,
    play: {
      ...profile.play,
      temperature: sanitizeNumber(event.target.value, profile.play.temperature),
    },
  }));
});

elements.labEpsilon.addEventListener('input', (event) => {
  if (!isWeightedPreferenceBot(getSelectedProfile())) return;
  updateSelectedProfile((profile) => ({
    ...profile,
    play: {
      ...profile.play,
      epsilon: sanitizeNumber(event.target.value, profile.play.epsilon),
    },
  }));
});

elements.labLearningRate.addEventListener('input', (event) => {
  if (!isWeightedPreferenceBot(getSelectedProfile())) return;
  updateSelectedProfile((profile) => ({
    ...profile,
    training: {
      ...profile.training,
      learningRate: sanitizeNumber(event.target.value, profile.training.learningRate),
    },
  }));
});

elements.labGamma.addEventListener('input', (event) => {
  if (!isWeightedPreferenceBot(getSelectedProfile())) return;
  updateSelectedProfile((profile) => ({
    ...profile,
    training: {
      ...profile.training,
      gamma: sanitizeNumber(event.target.value, profile.training.gamma),
    },
  }));
});

elements.labBatchSize.addEventListener('input', (event) => {
  if (!isWeightedPreferenceBot(getSelectedProfile())) return;
  updateSelectedProfile((profile) => ({
    ...profile,
    training: {
      ...profile.training,
      batchSize: sanitizeNumber(event.target.value, profile.training.batchSize),
    },
  }));
});

elements.labEvalGames.addEventListener('input', (event) => {
  if (!isWeightedPreferenceBot(getSelectedProfile())) return;
  updateSelectedProfile((profile) => ({
    ...profile,
    training: {
      ...profile.training,
      evalGames: ensureEven(sanitizeNumber(event.target.value, profile.training.evalGames)),
    },
  }));
});

elements.labTrainingOpponent.addEventListener('change', (event) => {
  if (!isWeightedPreferenceBot(getSelectedProfile())) return;
  updateSelectedProfile((profile) => ({
    ...profile,
    training: {
      ...profile.training,
      opponentBotId: event.target.value,
      opponentProfile: buildTrainingOpponentSnapshot(event.target.value, labState.profiles),
    },
  }));
});

elements.labEvalPlayerOne.addEventListener('change', (event) => {
  labState.evaluation.playerOneBotId = event.target.value;
  labState.evaluation.summary = null;
  labState.evaluation.status = `Player 1 set to ${botLabel(event.target.value)}. Ready to evaluate the matchup.`;
  renderLatest();
});

elements.labEvalPlayerTwo.addEventListener('change', (event) => {
  labState.evaluation.playerTwoBotId = event.target.value;
  labState.evaluation.summary = null;
  labState.evaluation.status = `Player 2 set to ${botLabel(event.target.value)}. Ready to evaluate the matchup.`;
  renderLatest();
});

elements.labResetWeightsBtn.addEventListener('click', () => {
  if (!isWeightedPreferenceBot(getSelectedProfile())) return;
  updateSelectedProfile((profile) => ({
    ...profile,
    weights: createEmptyWeights(),
  }));
});

elements.labRunEvaluationBtn.addEventListener('click', () => {
  runLabEvaluation().catch((error) => {
    labState.evaluation = {
      ...labState.evaluation,
      running: false,
      progress: 0,
      totalGames: 0,
      status: `Evaluation failed: ${error.message}`,
      summary: null,
    };
    renderLatest();
  });
});

window.advanceTime = async (ms) => {
  await wait(ms);
};

initWeightInputs();
renderWorkspaceTabs();
controller.setCustomProfiles(labState.profiles);
controller.restart();
