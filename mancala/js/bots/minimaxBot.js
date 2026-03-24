import { applyMove, getLegalMoves, getPitRange, getStoreIndex, PLAYER_ONE, PLAYER_TWO } from '../engine.js';

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

function evaluateState(state, rootPlayer) {
  const opponent = getOpponent(rootPlayer);
  const myStore = getStoreIndex(rootPlayer);
  const oppStore = getStoreIndex(opponent);

  const storeLead = state.board[myStore] - state.board[oppStore];
  const sideLead = sumSide(state.board, rootPlayer) - sumSide(state.board, opponent);
  const mobilityLead = getLegalMoves(state, rootPlayer).length - getLegalMoves(state, opponent).length;

  let score = 0;
  score += storeLead * 12;
  score += sideLead * 2;
  score += mobilityLead * 1.5;

  const lastMove = state.lastMove;
  if (lastMove) {
    if (lastMove.player === rootPlayer) {
      score += lastMove.captured * 18;
      score += lastMove.extraTurn ? 90 : 0;
    } else {
      score -= lastMove.captured * 18;
      score -= lastMove.extraTurn ? 90 : 0;
    }
  }

  if (state.gameOver) {
    if (state.winner === rootPlayer) score += 10000;
    else if (state.winner === opponent) score -= 10000;
  }

  return score;
}

function minimax(state, depth, alpha, beta, rootPlayer) {
  if (depth === 0 || state.gameOver) {
    return evaluateState(state, rootPlayer);
  }

  const currentPlayer = state.currentPlayer;
  const legalMoves = getLegalMoves(state, currentPlayer);
  if (legalMoves.length === 0) {
    return evaluateState(state, rootPlayer);
  }

  const isMaximizing = currentPlayer === rootPlayer;

  if (isMaximizing) {
    let bestScore = -Infinity;
    for (const move of legalMoves) {
      const nextState = applyMove(state, move);
      const nextDepth = nextState.currentPlayer === currentPlayer && !nextState.gameOver ? depth : depth - 1;
      const score = minimax(nextState, nextDepth, alpha, beta, rootPlayer);
      bestScore = Math.max(bestScore, score);
      alpha = Math.max(alpha, bestScore);
      if (beta <= alpha) break;
    }
    return bestScore;
  }

  let bestScore = Infinity;
  for (const move of legalMoves) {
    const nextState = applyMove(state, move);
    const nextDepth = nextState.currentPlayer === currentPlayer && !nextState.gameOver ? depth : depth - 1;
    const score = minimax(nextState, nextDepth, alpha, beta, rootPlayer);
    bestScore = Math.min(bestScore, score);
    beta = Math.min(beta, bestScore);
    if (beta <= alpha) break;
  }
  return bestScore;
}

export class MinimaxBot {
  constructor({ depth = 4 } = {}) {
    this.depth = depth;
    this.name = `Minimax Bot (Depth ${depth})`;
  }

  chooseMove(state, player) {
    const legalMoves = getLegalMoves(state, player);
    if (legalMoves.length === 0) return null;

    let bestMove = legalMoves[0];
    let bestScore = -Infinity;

    for (const move of legalMoves) {
      const nextState = applyMove(state, move);
      const nextDepth = nextState.currentPlayer === player && !nextState.gameOver ? this.depth : this.depth - 1;
      const score = minimax(nextState, nextDepth, -Infinity, Infinity, player);

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }
}
