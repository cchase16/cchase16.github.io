import { getLegalMoves, getPitRange, getStoreIndex, PITS_PER_SIDE, PLAYER_ONE, PLAYER_TWO, STARTING_STONES } from '../engine.js';

const TOTAL_STONES = STARTING_STONES * PITS_PER_SIDE * 2;
const MAX_MOVE_PROGRESS = 100;

export const POLICY_VALUE_ENCODING_VERSION = 'policy-value-v1';
export const POLICY_INPUT_LENGTH = 24;

export function encodeStateForPlayer(state, player = state.currentPlayer) {
  const opponent = getOpponent(player);
  const ownPitIndices = getPitIndices(player);
  const opponentPitIndices = getPitIndices(opponent);
  const ownStoreIndex = getStoreIndex(player);
  const opponentStoreIndex = getStoreIndex(opponent);
  const canonicalBoard = [
    ...ownPitIndices.map((index) => normalizeBoardValue(state.board[index])),
    normalizeBoardValue(state.board[ownStoreIndex]),
    ...opponentPitIndices.map((index) => normalizeBoardValue(state.board[index])),
    normalizeBoardValue(state.board[opponentStoreIndex]),
  ];
  const legalMask = createLegalMoveMask(state, player);
  const ownSideTotal = ownPitIndices.reduce((sum, index) => sum + state.board[index], 0);
  const opponentSideTotal = opponentPitIndices.reduce((sum, index) => sum + state.board[index], 0);
  const scalarFeatures = [
    normalizeSigned((state.board[ownStoreIndex] - state.board[opponentStoreIndex]) / TOTAL_STONES),
    normalizeSigned((ownSideTotal - opponentSideTotal) / TOTAL_STONES),
    normalizeSigned((getLegalMoves(state, player).length / PITS_PER_SIDE) * 2 - 1),
    normalizeSigned((Math.min(state.moveNumber, MAX_MOVE_PROGRESS) / MAX_MOVE_PROGRESS) * 2 - 1),
  ];

  return {
    version: POLICY_VALUE_ENCODING_VERSION,
    canonicalBoard,
    legalMask,
    scalarFeatures,
    inputVector: [...canonicalBoard, ...legalMask, ...scalarFeatures],
  };
}

export function createLegalMoveMask(state, player = state.currentPlayer) {
  const mask = Array.from({ length: PITS_PER_SIDE }, () => 0);
  for (const move of getLegalMoves(state, player)) {
    const localIndex = getLocalPitIndex(move, player);
    if (localIndex >= 0) mask[localIndex] = 1;
  }
  return mask;
}

export function getLocalPitIndex(globalPitIndex, player) {
  const [start, end] = getPitRange(player);
  if (globalPitIndex < start || globalPitIndex > end) return -1;
  return globalPitIndex - start;
}

export function getGlobalPitIndex(localPitIndex, player) {
  const localIndex = Math.max(0, Math.min(PITS_PER_SIDE - 1, Math.floor(Number(localPitIndex) || 0)));
  const [start] = getPitRange(player);
  return start + localIndex;
}

function getPitIndices(player) {
  const [start, end] = getPitRange(player);
  const indices = [];
  for (let index = start; index <= end; index += 1) {
    indices.push(index);
  }
  return indices;
}

function getOpponent(player) {
  return player === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
}

function normalizeBoardValue(value) {
  return value / TOTAL_STONES;
}

function normalizeSigned(value) {
  return Math.max(-1, Math.min(1, value));
}
