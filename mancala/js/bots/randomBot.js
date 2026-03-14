import { getLegalMoves } from '../engine.js';

export class RandomBot {
  constructor(name = 'Random Bot') {
    this.id = 'random';
    this.name = name;
  }

  chooseMove(state, player) {
    const moves = getLegalMoves(state, player);
    if (moves.length === 0) return null;
    const choice = Math.floor(Math.random() * moves.length);
    return moves[choice];
  }
}
