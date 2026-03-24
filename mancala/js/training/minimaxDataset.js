import { applyMove, cloneState, createInitialState, getLegalMoves, getStoreIndex, PLAYER_ONE, PLAYER_TWO } from '../engine.js';
import { createBotFromSelection } from '../bots/catalog.js';
import { MinimaxBot } from '../bots/minimaxBot.js';
import { POLICY_INPUT_LENGTH, POLICY_VALUE_ENCODING_VERSION, createLegalMoveMask, encodeStateForPlayer, getLocalPitIndex } from '../ml/stateEncoding.js';
import { createSeededRng } from '../utils/rng.js';

const DEFAULT_SOURCE_MATCHUPS = [
  ['random', 'random'],
  ['random', 'greedy'],
  ['greedy', 'greedy'],
  ['greedy', 'minimax'],
  ['minimax', 'minimax'],
];

export function generateMinimaxDataset({
  games = 200,
  seed = 1,
  teacherDepth = 4,
  sampleRate = 1,
  matchups = DEFAULT_SOURCE_MATCHUPS,
} = {}) {
  const totalGames = Math.max(1, Math.floor(Number(games) || 1));
  const clampedSampleRate = Math.max(0, Math.min(1, Number(sampleRate) || 0));
  const teacher = new MinimaxBot({ depth: Math.max(1, Math.floor(Number(teacherDepth) || 4)) });
  const rootRng = createSeededRng(seed);
  const samples = [];
  const sourceStats = Object.create(null);

  for (let gameIndex = 0; gameIndex < totalGames; gameIndex += 1) {
    const matchup = matchups[gameIndex % matchups.length] ?? DEFAULT_SOURCE_MATCHUPS[0];
    const matchupKey = `${matchup[0]}-vs-${matchup[1]}`;
    sourceStats[matchupKey] = (sourceStats[matchupKey] ?? 0) + 1;

    const gameSeed = Math.floor(rootRng() * 0xffffffff);
    const gameSamples = playAndLabelGame({
      matchup,
      teacher,
      seed: gameSeed,
      sampleRate: clampedSampleRate,
      gameIndex,
    });
    samples.push(...gameSamples);
  }

  return {
    metadata: {
      version: 1,
      format: 'mancala-minimax-dataset-v1',
      encodingVersion: POLICY_VALUE_ENCODING_VERSION,
      inputLength: POLICY_INPUT_LENGTH,
      games: totalGames,
      teacherBot: teacher.name,
      teacherDepth: teacher.depth,
      sampleRate: clampedSampleRate,
      generatedAt: new Date().toISOString(),
      sourceMatchups: matchups.map(([botA, botB]) => ({ botA, botB })),
      sourceStats,
    },
    samples,
  };
}

function playAndLabelGame({ matchup, teacher, seed, sampleRate, gameIndex }) {
  const rng = createSeededRng(seed);
  const stateSamples = [];
  const playerBots = {
    [PLAYER_ONE]: createBotFromSelection(matchup[0], [], { rng }),
    [PLAYER_TWO]: createBotFromSelection(matchup[1], [], { rng }),
  };
  let currentState = createInitialState();
  let safetyCounter = 0;

  while (!currentState.gameOver && safetyCounter < 500) {
    safetyCounter += 1;
    const player = currentState.currentPlayer;
    const legalMoves = getLegalMoves(currentState, player);
    if (!legalMoves.length) break;

    if (sampleRate >= 1 || rng() <= sampleRate) {
      const teacherMove = teacher.chooseMove(cloneState(currentState), player);
      const teacherMoveLocalIndex = getLocalPitIndex(teacherMove, player);
      const encoding = encodeStateForPlayer(currentState, player);
      stateSamples.push({
        version: 1,
        gameIndex,
        plyIndex: currentState.moveNumber,
        sourceMatchup: `${matchup[0]}-vs-${matchup[1]}`,
        player,
        teacherMoveGlobalPit: teacherMove,
        teacherMoveLocalIndex,
        legalMask: createLegalMoveMask(currentState, player),
        inputVector: encoding.inputVector,
      });
    }

    const actingBot = playerBots[player];
    const move = actingBot.chooseMove(cloneState(currentState), player);
    if (!legalMoves.includes(move)) {
      throw new Error(`Source bot chose illegal move ${move} for player ${player}.`);
    }

    currentState = applyMove(currentState, move);
  }

  if (!currentState.gameOver) {
    throw new Error(`Dataset source match ${matchup[0]} vs ${matchup[1]} did not finish within 500 moves.`);
  }

  for (const sample of stateSamples) {
    sample.finalWinner = currentState.winner;
    sample.outcomeForCurrentPlayer = currentState.winner === 'tie'
      ? 0
      : currentState.winner === sample.player
        ? 1
        : -1;
    sample.finalStoreMarginForCurrentPlayer = getFinalStoreMargin(currentState, sample.player);
  }

  return stateSamples;
}

function getFinalStoreMargin(state, player) {
  const opponent = player === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
  const myStore = state.board[getStoreIndex(player)];
  const opponentStore = state.board[getStoreIndex(opponent)];
  return myStore - opponentStore;
}
