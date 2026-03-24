import { applyMove, getLegalMoves, getPitRange, getStoreIndex, PLAYER_ONE, PLAYER_TWO } from '../engine.js';

function sumSide(board, player) {
  const [start, end] = getPitRange(player);
  let total = 0;
  for (let i = start; i <= end; i += 1) {
    total += board[i];
  }
  return total;
}

function evaluateState(state, player) {
  const myStore = getStoreIndex(player);
  const oppStore = getStoreIndex(player === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE);
  const storeLead = state.board[myStore] - state.board[oppStore];
  const sideLead = sumSide(state.board, player) - sumSide(state.board, player === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE);

  let score = 0;
  score += storeLead * 10;
  score += sideLead * 2;

  if (state.gameOver) {
    if (state.winner === player) score += 1000;
    else if (state.winner && state.winner !== 'tie') score -= 1000;
  }

  return score;
}

export class GreedyBot {
  constructor(name = 'Greedy Bot') {
    this.name = name;
  }

  chooseMove(state, player) {
    const legalMoves = getLegalMoves(state, player);
    if (legalMoves.length === 0) return null;

    let bestMove = legalMoves[0];
    let bestScore = -Infinity;

    for (const move of legalMoves) {
      const nextState = applyMove(state, move);
      const lastMove = nextState.lastMove ?? { captured: 0, extraTurn: false };
      let score = evaluateState(nextState, player);
      score += lastMove.captured * 15;
      score += lastMove.extraTurn ? 100 : 0;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }
}
