import { getLegalMoves } from '../engine.js';

export class RandomBot {
  constructor(name = 'Random Bot', { rng = Math.random } = {}) {
    this.id = 'random';
    this.name = name;
    this.rng = rng;
  }

  chooseMove(state, player) {
    const moves = getLegalMoves(state, player);
    if (moves.length === 0) return null;
    const choice = Math.floor(this.rng() * moves.length);
    return moves[choice];
  }
}
