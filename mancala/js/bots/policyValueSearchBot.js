import { applyMove, getLegalMoves, getStoreIndex, PLAYER_ONE, PLAYER_TWO } from '../engine.js';
import { createModelRuntime } from '../ml/modelRuntime.js';
import { getGlobalPitIndex as getGlobalPitIndexForPlayer } from '../ml/stateEncoding.js';

const TERMINAL_SCORE = 1_000_000;
const VALUE_SCORE_SCALE = 1000;
const STORE_MARGIN_SCALE = 8;

export class PolicyValueSearchBot {
  constructor(modelBundle, { depth = 4, name = null } = {}) {
    this.runtime = createModelRuntime(modelBundle);
    this.depth = Math.max(1, Math.floor(Number(depth) || 4));
    this.name = name ?? `Policy Value Search Bot (Depth ${this.depth})`;
    this.lastSearchSummary = null;
  }

  chooseMove(state, player) {
    const legalMoves = getLegalMoves(state, player);
    if (!legalMoves.length) return null;

    const orderedMoves = orderMovesByPolicy(this.runtime, state, player, legalMoves);
    let bestMove = orderedMoves[0] ?? legalMoves[0];
    let bestScore = -Infinity;
    let alpha = -Infinity;
    const stats = { nodes: 0, leafEvals: 0 };

    for (const move of orderedMoves) {
      const nextState = applyMove(state, move);
      const nextDepth = nextState.currentPlayer === player && !nextState.gameOver ? this.depth : this.depth - 1;
      const score = searchState({
        runtime: this.runtime,
        state: nextState,
        depth: nextDepth,
        alpha,
        beta: Infinity,
        rootPlayer: player,
        stats,
      });

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      alpha = Math.max(alpha, bestScore);
    }

    this.lastSearchSummary = {
      depth: this.depth,
      nodes: stats.nodes,
      leafEvals: stats.leafEvals,
      bestScore,
      bestMove,
    };

    return bestMove;
  }
}

export function searchState({ runtime, state, depth, alpha, beta, rootPlayer, stats }) {
  stats.nodes += 1;

  if (state.gameOver) {
    return evaluateTerminalState(state, rootPlayer);
  }

  if (depth <= 0) {
    stats.leafEvals += 1;
    return evaluateLeafState(runtime, state, rootPlayer);
  }

  const currentPlayer = state.currentPlayer;
  const legalMoves = getLegalMoves(state, currentPlayer);
  if (!legalMoves.length) {
    stats.leafEvals += 1;
    return evaluateLeafState(runtime, state, rootPlayer);
  }

  const orderedMoves = orderMovesByPolicy(runtime, state, currentPlayer, legalMoves);
  const maximizing = currentPlayer === rootPlayer;

  if (maximizing) {
    let bestScore = -Infinity;
    let localAlpha = alpha;
    for (const move of orderedMoves) {
      const nextState = applyMove(state, move);
      const nextDepth = nextState.currentPlayer === currentPlayer && !nextState.gameOver ? depth : depth - 1;
      const score = searchState({
        runtime,
        state: nextState,
        depth: nextDepth,
        alpha: localAlpha,
        beta,
        rootPlayer,
        stats,
      });

      bestScore = Math.max(bestScore, score);
      localAlpha = Math.max(localAlpha, bestScore);
      if (beta <= localAlpha) break;
    }
    return bestScore;
  }

  let bestScore = Infinity;
  let localBeta = beta;
  for (const move of orderedMoves) {
    const nextState = applyMove(state, move);
    const nextDepth = nextState.currentPlayer === currentPlayer && !nextState.gameOver ? depth : depth - 1;
    const score = searchState({
      runtime,
      state: nextState,
      depth: nextDepth,
      alpha,
      beta: localBeta,
      rootPlayer,
      stats,
    });

    bestScore = Math.min(bestScore, score);
    localBeta = Math.min(localBeta, bestScore);
    if (localBeta <= alpha) break;
  }
  return bestScore;
}

export function orderMovesByPolicy(runtime, state, player, legalMoves = getLegalMoves(state, player)) {
  const inference = runtime.inferState(state, player);
  const ranking = new Map();
  inference.rankedMoves.forEach((entry, index) => {
    const move = getGlobalPitIndexForPlayer(entry.localPitIndex, player);
    ranking.set(move, {
      rank: index,
      probability: entry.probability,
    });
  });

  return [...legalMoves].sort((left, right) => {
    const leftRank = ranking.get(left)?.rank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = ranking.get(right)?.rank ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;

    const leftProbability = ranking.get(left)?.probability ?? 0;
    const rightProbability = ranking.get(right)?.probability ?? 0;
    return rightProbability - leftProbability || left - right;
  });
}

export function evaluateLeafState(runtime, state, rootPlayer) {
  if (state.gameOver) {
    return evaluateTerminalState(state, rootPlayer);
  }

  const inference = runtime.inferState(state, state.currentPlayer);
  const modelValue = state.currentPlayer === rootPlayer ? inference.value : -inference.value;
  return modelValue * VALUE_SCORE_SCALE + evaluateStoreMargin(state, rootPlayer);
}

function evaluateTerminalState(state, rootPlayer) {
  if (state.winner === 'tie') return 0;
  return state.winner === rootPlayer ? TERMINAL_SCORE : -TERMINAL_SCORE;
}

function evaluateStoreMargin(state, rootPlayer) {
  const opponent = rootPlayer === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
  const rootStore = state.board[getStoreIndex(rootPlayer)];
  const opponentStore = state.board[getStoreIndex(opponent)];
  return (rootStore - opponentStore) * STORE_MARGIN_SCALE;
}
