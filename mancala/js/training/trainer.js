import { applyMove, cloneState, createInitialState, getLegalMoves, getStoreIndex, PLAYER_ONE, PLAYER_TWO } from '../engine.js';
import { createBotFromSelection } from '../bots/catalog.js';
import { FEATURE_KEYS, cloneProfile, getProfileIdFromBotId, isCustomBotId, normalizeCustomBot, normalizeProfile, touchProfile } from '../bots/botProfiles.js';
import { buildMovePolicy } from '../bots/weightedPreferenceBot.js';
import { createSeededRng } from '../utils/rng.js';
import { runEvaluation } from '../simulation/matchRunner.js';

const L2_REGULARIZATION = 0.001;

export function trainWeightedProfile({ profile, games, opponentBotId = 'greedy', seed = 1, customProfiles = [] }) {
  const workingProfile = cloneProfile(profile);
  const normalizedProfile = normalizeProfile(workingProfile);
  const trainingProfiles = buildTrainingProfilePool(normalizedProfile, customProfiles);
  const requestedGames = Math.max(1, Math.floor(Number(games) || normalizedProfile.training.batchSize));
  const totalGames = requestedGames % 2 === 0 ? requestedGames : requestedGames + 1;
  const rootRng = createSeededRng(seed);
  const trainingLog = [];
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let consumedGames = 0;

  const bootstrapBudget = Math.max(0, totalGames - Math.max(normalizedProfile.training.batchSize, Math.floor(totalGames * 0.2)));
  const bootstrapResult = bootstrapProfileWithEvolution({
    profile: normalizedProfile,
    gamesBudget: bootstrapBudget,
    opponentBotId,
    customProfiles: trainingProfiles,
    rng: rootRng,
  });

  Object.assign(normalizedProfile.weights, bootstrapResult.profile.weights);
  consumedGames += bootstrapResult.gamesUsed;
  trainingLog.push(...bootstrapResult.trainingLog);

  const policyBudget = Math.max(0, totalGames - consumedGames);
  const policyResult = runPolicyGradientPass({
    profile: normalizedProfile,
    games: policyBudget,
    opponentBotId,
    customProfiles: trainingProfiles,
    rng: rootRng,
  });

  wins += policyResult.wins;
  losses += policyResult.losses;
  ties += policyResult.ties;
  consumedGames += policyResult.gamesUsed;
  trainingLog.push(...policyResult.trainingLog);

  const trainedProfile = touchProfile(normalizedProfile);
  const evaluation = runEvaluation({
    botA: ({ rng }) => ({
      chooseMove: (state, player) => buildMovePolicy(state, player, trainedProfile, { rng }).selectedMove,
    }),
    botB: ({ rng }) => createTrainingOpponentBot(opponentBotId, trainingProfiles, rng),
    games: trainedProfile.training.evalGames,
    alternateStarts: true,
    seed: Math.floor(rootRng() * 0xffffffff),
  });

  return {
    profile: trainedProfile,
    metrics: {
      games: consumedGames,
      bootstrapGames: bootstrapResult.gamesUsed,
      policyGradientGames: policyResult.gamesUsed,
      wins,
      losses,
      ties,
      winRate: policyResult.gamesUsed ? wins / policyResult.gamesUsed : 0,
      evaluation,
    },
    trainingLog,
  };
}

function bootstrapProfileWithEvolution({ profile, gamesBudget, opponentBotId, customProfiles, rng }) {
  if (gamesBudget < 40) {
    return {
      profile: cloneProfile(profile),
      gamesUsed: 0,
      trainingLog: [],
    };
  }

  const candidateGames = ensureEven(Math.max(20, Math.min(60, Math.floor(gamesBudget / 60))));
  const populationSize = 12;
  const eliteCount = 3;
  const maxRounds = Math.max(1, Math.floor(gamesBudget / (populationSize * candidateGames)));
  let sigma = 3.2;
  let gamesUsed = 0;
  let meanProfile = cloneProfile(profile);
  let bestProfile = cloneProfile(profile);
  let bestScore = -Infinity;
  const trainingLog = [];

  for (let round = 0; round < maxRounds; round += 1) {
    const candidates = [cloneProfile(meanProfile)];
    while (candidates.length < populationSize) {
      candidates.push(samplePerturbedProfile(meanProfile, sigma, rng));
    }

    const scored = [];
    for (const candidate of candidates) {
      const evaluation = runEvaluation({
        botA: ({ rng: evalRng }) => ({
          chooseMove: (state, player) => buildMovePolicy(state, player, candidate, { rng: evalRng }).selectedMove,
        }),
        botB: ({ rng: evalRng }) => createTrainingOpponentBot(opponentBotId, customProfiles, evalRng),
        games: candidateGames,
        alternateStarts: true,
        seed: Math.floor(rng() * 0xffffffff),
      });

      gamesUsed += evaluation.games;
      const score = evaluation.winRateA + evaluation.averageMarginA / 48;
      scored.push({ candidate, evaluation, score });

      if (score > bestScore) {
        bestScore = score;
        bestProfile = cloneProfile(candidate);
      }
    }

    scored.sort((a, b) => b.score - a.score);
    meanProfile = averageEliteProfiles(scored.slice(0, eliteCount));
    sigma = Math.max(0.35, sigma * 0.82);
    trainingLog.push({
      phase: 'bootstrap',
      round: round + 1,
      games: candidateGames * populationSize,
      score: scored[0].score,
      winRate: scored[0].evaluation.winRateA,
      averageMargin: scored[0].evaluation.averageMarginA,
      weights: { ...bestProfile.weights },
    });
  }

  return {
    profile: bestProfile,
    gamesUsed,
    trainingLog,
  };
}

function runPolicyGradientPass({ profile, games, opponentBotId, customProfiles, rng }) {
  const totalGames = Math.max(0, ensureEven(games));
  if (!totalGames) {
    return {
      wins: 0,
      losses: 0,
      ties: 0,
      gamesUsed: 0,
      trainingLog: [],
    };
  }

  const batchSize = profile.training.batchSize;
  const gamma = profile.training.gamma;
  const learningRate = profile.training.learningRate;
  const weightUpdates = createZeroWeights();
  const trainingLog = [];
  let batchGames = 0;
  let wins = 0;
  let losses = 0;
  let ties = 0;

  for (let gameIndex = 0; gameIndex < totalGames; gameIndex += 1) {
    const traineePlayer = gameIndex % 2 === 0 ? PLAYER_ONE : PLAYER_TWO;
    const gameSeed = Math.floor(rng() * 0xffffffff);
    const trajectoryResult = playTrainingGame({
      profile,
      traineePlayer,
      opponentBotId,
      customProfiles,
      seed: gameSeed,
    });

    batchGames += 1;
    if (trajectoryResult.outcome > 0) wins += 1;
    else if (trajectoryResult.outcome < 0) losses += 1;
    else ties += 1;

    for (let stepIndex = 0; stepIndex < trajectoryResult.trajectory.length; stepIndex += 1) {
      const step = trajectoryResult.trajectory[stepIndex];
      const movesRemaining = trajectoryResult.trajectory.length - 1 - stepIndex;
      const credit = trajectoryResult.reward * Math.pow(gamma, movesRemaining);

      for (const key of FEATURE_KEYS) {
        weightUpdates[key] += credit * ((step.selectedFeatures[key] ?? 0) - (step.expectedFeatures[key] ?? 0));
      }
    }

    if (batchGames >= batchSize || gameIndex === totalGames - 1) {
      applyBatchUpdate(profile, weightUpdates, learningRate, batchGames);
      trainingLog.push({
        phase: 'policy-gradient',
        batch: trainingLog.length + 1,
        games: batchGames,
        weights: { ...profile.weights },
      });
      resetWeights(weightUpdates);
      batchGames = 0;
    }
  }

  return {
    wins,
    losses,
    ties,
    gamesUsed: totalGames,
    trainingLog,
  };
}

function playTrainingGame({ profile, traineePlayer, opponentBotId, customProfiles, seed }) {
  const rng = createSeededRng(seed);
  const opponent = createTrainingOpponentBot(opponentBotId, customProfiles, rng);
  const trajectory = [];
  let currentState = createInitialState();

  while (!currentState.gameOver) {
    const currentPlayer = currentState.currentPlayer;
    if (currentPlayer === traineePlayer) {
      const policy = buildMovePolicy(cloneState(currentState), traineePlayer, profile, { rng });
      const move = policy.selectedMove;
      const legalMoves = getLegalMoves(currentState, traineePlayer);
      if (move == null || !legalMoves.includes(move)) {
        throw new Error(`Weighted bot chose illegal move ${move}.`);
      }

      trajectory.push({
        selectedFeatures: policy.selectedFeatures,
        expectedFeatures: policy.expectedFeatures,
      });
      currentState = applyMove(currentState, move);
    } else {
      const move = opponent.chooseMove(cloneState(currentState), currentPlayer);
      const legalMoves = getLegalMoves(currentState, currentPlayer);
      if (move == null || !legalMoves.includes(move)) {
        throw new Error(`Opponent bot chose illegal move ${move}.`);
      }
      currentState = applyMove(currentState, move);
    }
  }

  const opponentPlayer = traineePlayer === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
  const myStore = currentState.board[getStoreIndex(traineePlayer)];
  const oppStore = currentState.board[getStoreIndex(opponentPlayer)];
  const margin = myStore - oppStore;
  const outcome = currentState.winner === 'tie' ? 0 : currentState.winner === traineePlayer ? 1 : -1;
  const reward = clampReward(outcome + margin * 0.03);

  return {
    trajectory,
    outcome,
    reward,
    margin,
    finalState: currentState,
  };
}

function applyBatchUpdate(profile, weightUpdates, learningRate, batchGames) {
  for (const key of FEATURE_KEYS) {
    const gradient = weightUpdates[key] / batchGames;
    const currentWeight = profile.weights[key] ?? 0;
    profile.weights[key] = currentWeight + learningRate * gradient - learningRate * L2_REGULARIZATION * currentWeight;
  }
}

function clampReward(value) {
  return Math.max(-2, Math.min(2, value));
}

function createZeroWeights() {
  return FEATURE_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function resetWeights(weights) {
  for (const key of FEATURE_KEYS) {
    weights[key] = 0;
  }
}

function samplePerturbedProfile(profile, sigma, rng) {
  const candidate = cloneProfile(profile);
  for (const key of FEATURE_KEYS) {
    candidate.weights[key] += gaussian(rng) * sigma;
  }
  return normalizeProfile(candidate);
}

function averageEliteProfiles(entries) {
  const base = cloneProfile(entries[0].candidate);
  for (const key of FEATURE_KEYS) {
    let sum = 0;
    for (const entry of entries) {
      sum += entry.candidate.weights[key] ?? 0;
    }
    base.weights[key] = sum / entries.length;
  }
  return normalizeProfile(base);
}

function gaussian(rng) {
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = Math.max(rng(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function ensureEven(value) {
  const rounded = Math.max(0, Math.floor(Number(value) || 0));
  if (rounded === 0) return 0;
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function buildTrainingProfilePool(profile, customProfiles) {
  const pool = [profile, ...customProfiles.map((item) => normalizeCustomBot(item))];
  if (profile.training.opponentProfile) {
    pool.push(normalizeCustomBot(profile.training.opponentProfile));
  }

  const deduped = [];
  const seenIds = new Set();
  for (const candidate of pool) {
    if (!candidate?.id || seenIds.has(candidate.id)) continue;
    seenIds.add(candidate.id);
    deduped.push(candidate);
  }

  return deduped;
}

function createTrainingOpponentBot(opponentBotId, customProfiles, rng) {
  if (isCustomBotId(opponentBotId)) {
    const profileId = getProfileIdFromBotId(opponentBotId);
    const hasProfile = customProfiles.some((profile) => profile.id === profileId);
    if (!hasProfile) {
      throw new Error(`Training opponent ${opponentBotId} is not available in the training context.`);
    }
  }

  return createBotFromSelection(opponentBotId, customProfiles, { rng });
}
