export const PITS_PER_SIDE = 6;
export const STARTING_STONES = 4;
export const PLAYER_ONE = 0;
export const PLAYER_TWO = 1;

export function createInitialState() {
  return {
    board: [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0],
    currentPlayer: PLAYER_ONE,
    gameOver: false,
    winner: null,
    moveNumber: 0,
    lastMove: null,
  };
}

export function cloneState(state) {
  return {
    ...state,
    board: [...state.board],
    lastMove: state.lastMove ? { ...state.lastMove } : null,
  };
}

export function getStoreIndex(player) {
  return player === PLAYER_ONE ? 6 : 13;
}

export function getPitRange(player) {
  return player === PLAYER_ONE ? [0, 5] : [7, 12];
}

export function isPlayersPit(index, player) {
  const [start, end] = getPitRange(player);
  return index >= start && index <= end;
}

export function getOppositePitIndex(index) {
  return 12 - index;
}

export function getLegalMoves(state, player = state.currentPlayer) {
  if (state.gameOver) return [];
  const [start, end] = getPitRange(player);
  const moves = [];
  for (let i = start; i <= end; i += 1) {
    if (state.board[i] > 0) moves.push(i);
  }
  return moves;
}

export function isMoveLegal(state, pitIndex, player = state.currentPlayer) {
  return getLegalMoves(state, player).includes(pitIndex);
}

function sideIsEmpty(board, player) {
  const [start, end] = getPitRange(player);
  for (let i = start; i <= end; i += 1) {
    if (board[i] > 0) return false;
  }
  return true;
}

function collectRemainingStones(board) {
  const p1Store = getStoreIndex(PLAYER_ONE);
  const p2Store = getStoreIndex(PLAYER_TWO);

  for (let i = 0; i < 6; i += 1) {
    board[p1Store] += board[i];
    board[i] = 0;
  }

  for (let i = 7; i < 13; i += 1) {
    board[p2Store] += board[i];
    board[i] = 0;
  }
}

function computeWinner(board) {
  const p1 = board[getStoreIndex(PLAYER_ONE)];
  const p2 = board[getStoreIndex(PLAYER_TWO)];
  if (p1 > p2) return PLAYER_ONE;
  if (p2 > p1) return PLAYER_TWO;
  return 'tie';
}

export function applyMove(state, pitIndex) {
  if (state.gameOver) {
    throw new Error('Cannot apply a move after game over.');
  }
  if (!isMoveLegal(state, pitIndex)) {
    throw new Error(`Illegal move: ${pitIndex}`);
  }

  const nextState = cloneState(state);
  const board = nextState.board;
  const player = nextState.currentPlayer;
  const ownStore = getStoreIndex(player);
  const opponentStore = getStoreIndex(player === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE);

  let stones = board[pitIndex];
  board[pitIndex] = 0;
  let index = pitIndex;

  while (stones > 0) {
    index = (index + 1) % board.length;
    if (index === opponentStore) continue;
    board[index] += 1;
    stones -= 1;
  }

  let captured = 0;
  let extraTurn = false;

  if (index === ownStore) {
    extraTurn = true;
  } else if (isPlayersPit(index, player) && board[index] === 1) {
    const opposite = getOppositePitIndex(index);
    if (board[opposite] > 0) {
      captured = board[opposite] + board[index];
      board[ownStore] += captured;
      board[index] = 0;
      board[opposite] = 0;
    }
  }

  const p1Empty = sideIsEmpty(board, PLAYER_ONE);
  const p2Empty = sideIsEmpty(board, PLAYER_TWO);

  if (p1Empty || p2Empty) {
    collectRemainingStones(board);
    nextState.gameOver = true;
    nextState.winner = computeWinner(board);
  } else {
    nextState.currentPlayer = extraTurn ? player : (player === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE);
  }

  nextState.moveNumber += 1;
  nextState.lastMove = {
    player,
    pitIndex,
    endedIndex: index,
    captured,
    extraTurn,
  };

  return nextState;
}

export function getPlayerLabel(player) {
  return player === PLAYER_ONE ? 'Player 1' : 'Player 2';
}
