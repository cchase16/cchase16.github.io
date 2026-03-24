import { applyMove, cloneState, createInitialState, getLegalMoves, getStoreIndex, PLAYER_ONE, PLAYER_TWO } from '../engine.js';
import { createSeededRng } from '../utils/rng.js';

export function runEvaluation({ botA, botB, games, alternateStarts = true, seed = 1 }) {
  const requestedGames = Math.max(1, Math.floor(Number(games) || 1));
  const totalGames = alternateStarts && requestedGames % 2 !== 0 ? requestedGames + 1 : requestedGames;
  const rootRng = createSeededRng(seed);
  const results = [];

  const stats = {
    games: totalGames,
    winsA: 0,
    winsB: 0,
    ties: 0,
    averageMarginA: 0,
    averageStoreA: 0,
    averageStoreB: 0,
    bySeat: {
      asPlayerOne: { games: 0, wins: 0, losses: 0, ties: 0, averageMargin: 0 },
      asPlayerTwo: { games: 0, wins: 0, losses: 0, ties: 0, averageMargin: 0 },
    },
  };

  for (let gameIndex = 0; gameIndex < totalGames; gameIndex += 1) {
    const botAPlayer = alternateStarts ? (gameIndex % 2 === 0 ? PLAYER_ONE : PLAYER_TWO) : PLAYER_ONE;
    const gameSeed = Math.floor(rootRng() * 0xffffffff);
    const result = runSingleMatch({ botA, botB, botAPlayer, seed: gameSeed });
    results.push(result);

    stats.averageMarginA += result.marginA;
    stats.averageStoreA += result.storesA;
    stats.averageStoreB += result.storesB;

    const seatStats = botAPlayer === PLAYER_ONE ? stats.bySeat.asPlayerOne : stats.bySeat.asPlayerTwo;
    seatStats.games += 1;
    seatStats.averageMargin += result.marginA;

    if (result.winner === 'tie') {
      stats.ties += 1;
      seatStats.ties += 1;
    } else if (result.winner === 'A') {
      stats.winsA += 1;
      seatStats.wins += 1;
    } else {
      stats.winsB += 1;
      seatStats.losses += 1;
    }
  }

  stats.averageMarginA /= totalGames;
  stats.averageStoreA /= totalGames;
  stats.averageStoreB /= totalGames;
  stats.winRateA = stats.winsA / totalGames;

  for (const seatStats of Object.values(stats.bySeat)) {
    if (!seatStats.games) continue;
    seatStats.averageMargin /= seatStats.games;
  }

  return { ...stats, results };
}

export function runSingleMatch({ botA, botB, botAPlayer = PLAYER_ONE, seed = 1, maxMoves = 500 }) {
  const rng = createSeededRng(seed);
  const state = createInitialState();
  const playerBots = {
    [botAPlayer]: instantiateBot(botA, rng, PLAYER_ONE),
    [botAPlayer === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE]: instantiateBot(botB, rng, PLAYER_TWO),
  };

  let currentState = cloneState(state);
  let safeguard = 0;

  while (!currentState.gameOver && safeguard < maxMoves) {
    safeguard += 1;
    const currentPlayer = currentState.currentPlayer;
    const bot = playerBots[currentPlayer];
    const move = bot?.chooseMove(cloneState(currentState), currentPlayer);
    const legalMoves = getLegalMoves(currentState, currentPlayer);

    if (move == null || !legalMoves.includes(move)) {
      throw new Error(`Bot selected illegal move ${move} for player ${currentPlayer}.`);
    }

    currentState = applyMove(currentState, move);
  }

  if (!currentState.gameOver) {
    throw new Error(`Match did not finish within ${maxMoves} moves.`);
  }

  const botBPlayer = botAPlayer === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
  const storesA = currentState.board[getStoreIndex(botAPlayer)];
  const storesB = currentState.board[getStoreIndex(botBPlayer)];

  return {
    winner:
      currentState.winner === 'tie'
        ? 'tie'
        : currentState.winner === botAPlayer
          ? 'A'
          : 'B',
    botAPlayer,
    storesA,
    storesB,
    marginA: storesA - storesB,
    moveCount: currentState.moveNumber,
    finalState: currentState,
  };
}

function instantiateBot(botSpec, rng, fallbackPlayer) {
  if (typeof botSpec === 'function') return botSpec({ rng, player: fallbackPlayer });
  if (botSpec && typeof botSpec.chooseMove === 'function') return botSpec;
  throw new Error('Bot spec must be a bot instance or a factory function.');
}
