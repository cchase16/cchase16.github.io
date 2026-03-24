import { applyMove, getLegalMoves, getPitRange, getStoreIndex, PLAYER_ONE, PLAYER_TWO, STARTING_STONES, PITS_PER_SIDE } from '../engine.js';
import { FEATURE_KEYS, normalizeProfile } from './botProfiles.js';
import { randomChoice, sampleWeightedIndex } from '../utils/rng.js';

const TOTAL_STONES = STARTING_STONES * PITS_PER_SIDE * 2;
const SIDE_STONE_DIVISOR = TOTAL_STONES / 2;
const STORE_GAIN_DIVISOR = 12;
const CAPTURE_DIVISOR = 12;
const REPLY_THREAT_DIVISOR = 14;

export class WeightedPreferenceBot {
  constructor(profile, { rng = Math.random } = {}) {
    this.profile = normalizeProfile(profile);
    this.id = `weighted:${this.profile.id}`;
    this.name = this.profile.name;
    this.rng = rng;
  }

  chooseMove(state, player) {
    const policy = buildMovePolicy(state, player, this.profile, { rng: this.rng });
    return policy.selectedMove;
  }
}

export function buildMovePolicy(state, player, profile, { rng = Math.random } = {}) {
  const normalizedProfile = normalizeProfile(profile);
  const legalMoves = getLegalMoves(state, player);
  if (!legalMoves.length) {
    return {
      moves: [],
      selectedMove: null,
      probabilities: [],
      scores: [],
      featureVectors: [],
      expectedFeatures: createZeroFeatureVector(),
      selectedFeatures: createZeroFeatureVector(),
    };
  }

  if (normalizedProfile.play.epsilon > 0 && rng() < normalizedProfile.play.epsilon) {
    const selectedMove = randomChoice(legalMoves, rng);
    const index = legalMoves.indexOf(selectedMove);
    const featureVectors = legalMoves.map((move) => extractMoveFeatures(state, player, move));
    return {
      moves: legalMoves,
      selectedMove,
      probabilities: legalMoves.map(() => 1 / legalMoves.length),
      scores: legalMoves.map(() => 0),
      featureVectors,
      expectedFeatures: averageFeatureVectors(featureVectors),
      selectedFeatures: featureVectors[index] ?? createZeroFeatureVector(),
    };
  }

  const featureVectors = legalMoves.map((move) => extractMoveFeatures(state, player, move));
  const scores = featureVectors.map((features) => scoreFeatureVector(features, normalizedProfile.weights));
  const probabilities = softmax(scores, normalizedProfile.play.temperature);
  const selectedIndex = sampleWeightedIndex(probabilities, rng);

  return {
    moves: legalMoves,
    selectedMove: legalMoves[selectedIndex] ?? legalMoves[0],
    probabilities,
    scores,
    featureVectors,
    expectedFeatures: expectationFromPolicy(featureVectors, probabilities),
    selectedFeatures: featureVectors[selectedIndex] ?? featureVectors[0],
  };
}

export function extractMoveFeatures(state, player, move) {
  const nextState = applyMove(state, move);
  const opponent = getOpponent(player);
  const myStore = getStoreIndex(player);
  const oppStore = getStoreIndex(opponent);
  const lastMove = nextState.lastMove ?? { captured: 0, extraTurn: false };
  const myPitRange = getPitRange(player);

  return {
    bias: 1,
    extraTurn: lastMove.extraTurn ? 1 : 0,
    capturedStonesNorm: normalizeSigned(lastMove.captured / CAPTURE_DIVISOR),
    myStoreGainNorm: normalizeSigned((nextState.board[myStore] - state.board[myStore]) / STORE_GAIN_DIVISOR),
    oppStoreGainNorm: normalizeSigned((nextState.board[oppStore] - state.board[oppStore]) / STORE_GAIN_DIVISOR),
    mySideAfterNorm: normalizeSigned(sumSide(nextState.board, player) / SIDE_STONE_DIVISOR),
    oppSideAfterNorm: normalizeSigned(sumSide(nextState.board, opponent) / SIDE_STONE_DIVISOR),
    movePitNorm: normalizePitIndex(move, myPitRange[0]),
    winningMove: nextState.gameOver && nextState.winner === player ? 1 : 0,
    opponentReplyThreatNorm: normalizeSigned(computeOpponentReplyThreat(nextState, player, opponent) / REPLY_THREAT_DIVISOR),
  };
}

export function scoreFeatureVector(features, weights) {
  let score = 0;
  for (const key of FEATURE_KEYS) {
    score += (weights[key] ?? 0) * (features[key] ?? 0);
  }
  return score;
}

export function softmax(scores, temperature = 1) {
  if (!scores.length) return [];
  const safeTemperature = Math.max(0.05, Number(temperature) || 1);
  const scaled = scores.map((score) => score / safeTemperature);
  const max = Math.max(...scaled);
  const expScores = scaled.map((value) => Math.exp(value - max));
  const total = expScores.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return scores.map(() => 1 / scores.length);
  return expScores.map((value) => value / total);
}

export function expectationFromPolicy(featureVectors, probabilities) {
  const total = createZeroFeatureVector();
  for (let i = 0; i < featureVectors.length; i += 1) {
    const probability = probabilities[i] ?? 0;
    for (const key of FEATURE_KEYS) {
      total[key] += (featureVectors[i][key] ?? 0) * probability;
    }
  }
  return total;
}

export function averageFeatureVectors(featureVectors) {
  if (!featureVectors.length) return createZeroFeatureVector();
  return expectationFromPolicy(featureVectors, featureVectors.map(() => 1 / featureVectors.length));
}

export function createZeroFeatureVector() {
  return FEATURE_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function computeOpponentReplyThreat(nextState, player, opponent) {
  if (nextState.gameOver || nextState.currentPlayer === player) return 0;

  const replies = getLegalMoves(nextState, opponent);
  if (!replies.length) return 0;

  let bestThreat = 0;
  for (const reply of replies) {
    const replyState = applyMove(nextState, reply);
    const lastMove = replyState.lastMove ?? { captured: 0, extraTurn: false };
    const oppStore = getStoreIndex(opponent);
    const storeGain = replyState.board[oppStore] - nextState.board[oppStore];
    const threatScore = lastMove.captured + storeGain + (lastMove.extraTurn ? 4 : 0);
    if (threatScore > bestThreat) bestThreat = threatScore;
  }

  return bestThreat;
}

function getOpponent(player) {
  return player === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
}

function sumSide(board, player) {
  const [start, end] = getPitRange(player);
  let total = 0;
  for (let i = start; i <= end; i += 1) {
    total += board[i];
  }
  return total;
}

function normalizePitIndex(move, sideStart) {
  const localIndex = move - sideStart;
  return normalizeSigned(localIndex / (PITS_PER_SIDE - 1) * 2 - 1);
}

function normalizeSigned(value) {
  return Math.max(-1, Math.min(1, value));
}
