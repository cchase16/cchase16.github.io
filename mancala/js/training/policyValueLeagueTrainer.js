import { applyMove, cloneState, createInitialState, getLegalMoves, getStoreIndex, PLAYER_ONE, PLAYER_TWO } from '../engine.js';
import { createBuiltinBot } from '../bots/catalog.js';
import { MinimaxBot } from '../bots/minimaxBot.js';
import { PolicyValueSearchBot } from '../bots/policyValueSearchBot.js';
import { cloneModelBundle, createModelBundle, normalizeModelBundle } from '../ml/modelBundle.js';
import { encodeStateForPlayer, getLocalPitIndex } from '../ml/stateEncoding.js';
import { runEvaluation } from '../simulation/matchRunner.js';
import { trainPolicyValueModel } from './policyValueTrainer.js';
import { createSeededRng } from '../utils/rng.js';

const DEFAULT_OPPONENT_SCHEDULE = ['random', 'greedy', 'minimax', 'self'];
const DEFAULT_PHASE5_OPTIONS = {
  iterations: 4,
  gamesPerIteration: 24,
  evalGames: 40,
  searchDepth: 2,
  minimaxDepth: 4,
  replayBufferSize: 400,
  previousBestPoolSize: 2,
  trainingOptions: {
    epochs: 3,
    batchSize: 32,
    learningRate: 0.02,
    policyLossWeight: 1,
    valueLossWeight: 0.5,
    l2Regularization: 0.0001,
  },
};

export function trainPolicyValueLeague({
  modelBundle = createModelBundle(),
  options = {},
  seed = 1,
} = {}) {
  const config = normalizeLeagueOptions(options);
  let championBundle = cloneModelBundle(normalizeModelBundle(modelBundle));
  let championEvaluation = evaluatePolicyValueSearchModel({
    modelBundle: championBundle,
    games: config.evalGames,
    seed,
    searchDepth: config.searchDepth,
    minimaxDepth: config.minimaxDepth,
  });
  const rootRng = createSeededRng(seed);
  const history = [];
  let replayBuffer = [];
  const previousBestPool = [];

  for (let iteration = 0; iteration < config.iterations; iteration += 1) {
    const iterationSeed = Math.floor(rootRng() * 0xffffffff);
    const leagueDataset = generateLeagueTrainingDataset({
      modelBundle: championBundle,
      games: config.gamesPerIteration,
      seed: iterationSeed,
      searchDepth: config.searchDepth,
      minimaxDepth: config.minimaxDepth,
      opponentSchedule: config.opponentSchedule,
      previousBestPool,
    });

    replayBuffer = mergeReplaySamples(replayBuffer, leagueDataset.replaySamples, config.replayBufferSize);
    const combinedDataset = appendReplaySamples(leagueDataset.dataset, replayBuffer);
    const candidateTraining = trainPolicyValueModel({
      modelBundle: championBundle,
      dataset: combinedDataset,
      options: {
        ...config.trainingOptions,
        shuffleSeed: Math.floor(rootRng() * 0xffffffff),
      },
    });
    const candidateBundle = candidateTraining.modelBundle;
    const candidateEvaluation = evaluatePolicyValueSearchModel({
      modelBundle: candidateBundle,
      games: config.evalGames,
      seed: Math.floor(rootRng() * 0xffffffff),
      searchDepth: config.searchDepth,
      minimaxDepth: config.minimaxDepth,
    });

    const championScore = scoreEvaluation(championEvaluation);
    const candidateScore = scoreEvaluation(candidateEvaluation);
    const accepted = candidateScore > championScore;

    if (accepted) {
      previousBestPool.unshift(cloneModelBundle(championBundle));
      while (previousBestPool.length > config.previousBestPoolSize) previousBestPool.pop();
      championBundle = candidateBundle;
      championEvaluation = candidateEvaluation;
    }

    history.push({
      iteration: iteration + 1,
      datasetSamples: combinedDataset.samples.length,
      replaySamples: replayBuffer.length,
      leagueSamples: leagueDataset.dataset.samples.length,
      leagueStats: leagueDataset.metadata,
      trainingMetrics: candidateTraining.finalMetrics,
      candidateEvaluation,
      championEvaluation,
      accepted,
      candidateScore,
      championScore: accepted ? candidateScore : championScore,
    });
  }

  championBundle.updatedAt = new Date().toISOString();
  championBundle.trainingMetadata = {
    ...championBundle.trainingMetadata,
    notes: buildLeagueTrainingNotes(history.at(-1)),
    lastLeagueTrainingRun: {
      iterations: config.iterations,
      gamesPerIteration: config.gamesPerIteration,
      evalGames: config.evalGames,
      searchDepth: config.searchDepth,
      minimaxDepth: config.minimaxDepth,
      replayBufferSize: config.replayBufferSize,
      opponentSchedule: [...config.opponentSchedule],
      completedAt: championBundle.updatedAt,
    },
  };

  return {
    championBundle,
    championEvaluation,
    history,
    replayBufferSize: replayBuffer.length,
  };
}

export function generateLeagueTrainingDataset({
  modelBundle,
  games = DEFAULT_PHASE5_OPTIONS.gamesPerIteration,
  seed = 1,
  searchDepth = DEFAULT_PHASE5_OPTIONS.searchDepth,
  minimaxDepth = DEFAULT_PHASE5_OPTIONS.minimaxDepth,
  opponentSchedule = DEFAULT_OPPONENT_SCHEDULE,
  previousBestPool = [],
} = {}) {
  const normalizedModel = cloneModelBundle(normalizeModelBundle(modelBundle));
  const totalGames = Math.max(1, Math.floor(Number(games) || 1));
  const rootRng = createSeededRng(seed);
  const schedule = normalizeOpponentSchedule(opponentSchedule);
  const samples = [];
  const replaySamples = [];
  const matchupCounts = Object.create(null);

  for (let gameIndex = 0; gameIndex < totalGames; gameIndex += 1) {
    const opponentSpec = schedule[gameIndex % schedule.length];
    const matchupKey = String(opponentSpec);
    matchupCounts[matchupKey] = (matchupCounts[matchupKey] ?? 0) + 1;

    const traineeSeat = gameIndex % 2 === 0 ? PLAYER_ONE : PLAYER_TWO;
    const gameSeed = Math.floor(rootRng() * 0xffffffff);
    const gameResult = playLeagueGame({
      modelBundle: normalizedModel,
      opponentSpec,
      previousBestPool,
      traineeSeat,
      seed: gameSeed,
      searchDepth,
      minimaxDepth,
    });

    samples.push(...gameResult.samples);
    if (gameResult.replayEligible) {
      replaySamples.push(...gameResult.samples.map((sample) => ({ ...sample })));
    }
  }

  return {
    metadata: {
      format: 'mancala-league-dataset-v1',
      games: totalGames,
      searchDepth,
      minimaxDepth,
      opponentSchedule: [...schedule],
      matchupCounts,
    },
    dataset: {
      metadata: {
        format: 'mancala-league-dataset-v1',
        games: totalGames,
      },
      samples,
    },
    replaySamples,
  };
}

export function evaluatePolicyValueSearchModel({
  modelBundle,
  games = DEFAULT_PHASE5_OPTIONS.evalGames,
  seed = 1,
  searchDepth = DEFAULT_PHASE5_OPTIONS.searchDepth,
  minimaxDepth = DEFAULT_PHASE5_OPTIONS.minimaxDepth,
} = {}) {
  return runEvaluation({
    botA: () => new PolicyValueSearchBot(modelBundle, { depth: searchDepth }),
    botB: () => new MinimaxBot({ depth: minimaxDepth }),
    games,
    alternateStarts: true,
    seed,
  });
}

function playLeagueGame({
  modelBundle,
  opponentSpec,
  previousBestPool,
  traineeSeat,
  seed,
  searchDepth,
  minimaxDepth,
}) {
  const rng = createSeededRng(seed);
  const traineeBotA = new PolicyValueSearchBot(modelBundle, { depth: searchDepth });
  const traineeBotB = new PolicyValueSearchBot(modelBundle, { depth: searchDepth });
  const opponentBot = createLeagueOpponent(opponentSpec, {
    rng,
    currentModel: modelBundle,
    previousBestPool,
    searchDepth,
    minimaxDepth,
  });
  const playerBots = {
    [traineeSeat]: traineeBotA,
    [getOpponent(traineeSeat)]: opponentSpec === 'self' ? traineeBotB : opponentBot,
  };
  const trainingPlayers = opponentSpec === 'self'
    ? new Set([PLAYER_ONE, PLAYER_TWO])
    : new Set([traineeSeat]);
  const samples = [];
  let currentState = createInitialState();
  let safetyCounter = 0;

  while (!currentState.gameOver && safetyCounter < 500) {
    safetyCounter += 1;
    const currentPlayer = currentState.currentPlayer;
    const legalMoves = getLegalMoves(currentState, currentPlayer);
    if (!legalMoves.length) break;

    const actingBot = playerBots[currentPlayer];
    const move = actingBot.chooseMove(cloneState(currentState), currentPlayer);
    if (!legalMoves.includes(move)) {
      throw new Error(`League bot chose illegal move ${move} for player ${currentPlayer}.`);
    }

    if (trainingPlayers.has(currentPlayer)) {
      const encoding = encodeStateForPlayer(currentState, currentPlayer);
      samples.push({
        inputVector: encoding.inputVector,
        legalMask: encoding.legalMask,
        teacherMoveLocalIndex: getLocalPitIndex(move, currentPlayer),
        outcomeForCurrentPlayer: 0,
        source: String(opponentSpec),
        player: currentPlayer,
      });
    }

    currentState = applyMove(currentState, move);
  }

  if (!currentState.gameOver) {
    throw new Error(`League training game vs ${opponentSpec} did not finish within 500 moves.`);
  }

  for (const sample of samples) {
    sample.outcomeForCurrentPlayer = currentState.winner === 'tie'
      ? 0
      : currentState.winner === sample.player
        ? 1
        : -1;
    sample.finalStoreMarginForCurrentPlayer = getStoreMargin(currentState, sample.player);
  }

  const replayEligible = opponentSpec === 'minimax'
    && currentState.winner !== 'tie'
    && currentState.winner !== traineeSeat;

  return {
    samples,
    replayEligible,
  };
}

function createLeagueOpponent(opponentSpec, { rng, currentModel, previousBestPool, searchDepth, minimaxDepth }) {
  switch (opponentSpec) {
    case 'self':
      return new PolicyValueSearchBot(currentModel, { depth: searchDepth });
    case 'previous-best': {
      const snapshot = previousBestPool[0] ?? currentModel;
      return new PolicyValueSearchBot(snapshot, { depth: searchDepth });
    }
    case 'minimax':
      return new MinimaxBot({ depth: minimaxDepth });
    case 'random':
    case 'greedy':
      return createBuiltinBot(opponentSpec, { rng });
    default:
      return createBuiltinBot('greedy', { rng });
  }
}

function normalizeLeagueOptions(options) {
  return {
    iterations: Math.max(1, Math.floor(Number(options.iterations) || DEFAULT_PHASE5_OPTIONS.iterations)),
    gamesPerIteration: Math.max(2, Math.floor(Number(options.gamesPerIteration) || DEFAULT_PHASE5_OPTIONS.gamesPerIteration)),
    evalGames: Math.max(2, Math.floor(Number(options.evalGames) || DEFAULT_PHASE5_OPTIONS.evalGames)),
    searchDepth: Math.max(1, Math.floor(Number(options.searchDepth) || DEFAULT_PHASE5_OPTIONS.searchDepth)),
    minimaxDepth: Math.max(1, Math.floor(Number(options.minimaxDepth) || DEFAULT_PHASE5_OPTIONS.minimaxDepth)),
    replayBufferSize: Math.max(0, Math.floor(Number(options.replayBufferSize) || DEFAULT_PHASE5_OPTIONS.replayBufferSize)),
    previousBestPoolSize: Math.max(0, Math.floor(Number(options.previousBestPoolSize) || DEFAULT_PHASE5_OPTIONS.previousBestPoolSize)),
    opponentSchedule: normalizeOpponentSchedule(options.opponentSchedule ?? DEFAULT_OPPONENT_SCHEDULE),
    trainingOptions: {
      ...DEFAULT_PHASE5_OPTIONS.trainingOptions,
      ...(options.trainingOptions ?? {}),
    },
  };
}

function normalizeOpponentSchedule(schedule) {
  const normalized = Array.isArray(schedule)
    ? schedule.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    : [];
  return normalized.length ? normalized : [...DEFAULT_OPPONENT_SCHEDULE];
}

function appendReplaySamples(dataset, replaySamples) {
  return {
    metadata: {
      ...(dataset.metadata ?? {}),
      replaySamples: replaySamples.length,
    },
    samples: [...dataset.samples, ...replaySamples],
  };
}

function mergeReplaySamples(currentReplayBuffer, additions, replayBufferSize) {
  if (replayBufferSize <= 0) return [];
  const merged = [...currentReplayBuffer, ...additions.map((sample) => ({ ...sample }))];
  if (merged.length <= replayBufferSize) return merged;
  return merged.slice(merged.length - replayBufferSize);
}

function getStoreMargin(state, player) {
  const opponent = getOpponent(player);
  return state.board[getStoreIndex(player)] - state.board[getStoreIndex(opponent)];
}

function getOpponent(player) {
  return player === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
}

function scoreEvaluation(evaluation) {
  return (evaluation.winRateA ?? 0) + (evaluation.averageMarginA ?? 0) / 48;
}

function buildLeagueTrainingNotes(lastEntry) {
  if (!lastEntry) return 'League training completed.';
  return [
    `League training completed after ${lastEntry.iteration} iteration(s).`,
    `Champion win rate vs minimax: ${(lastEntry.championEvaluation.winRateA * 100).toFixed(1)}%.`,
    `Average margin: ${lastEntry.championEvaluation.averageMarginA.toFixed(2)}.`,
    `Last candidate ${lastEntry.accepted ? 'was accepted' : 'was rejected'}.`,
  ].join(' ');
}
