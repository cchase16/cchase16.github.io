import {
  applyMove,
  cloneState,
  getLegalMoves,
  getOppositePitIndex,
  getPitRange,
  getStoreIndex,
  PLAYER_ONE,
  PLAYER_TWO,
} from '../engine.js';

const BIG_CAPTURE_THRESHOLD = 4;
const LARGE_CAPTURE_THRESHOLD = 3;
const SAFE_REPLY_SWING_THRESHOLD = 5;
const THREAT_DENIAL_THRESHOLD = 90;
const ENDGAME_SIDE_STONES_THRESHOLD = 14;
const EXACT_ENDGAME_STONE_THRESHOLD = 14;
const GLOBAL_EXACT_ENDGAME_CACHE = new Map();

const OPENING_BOOK = new Map([
  ['0|0|4,4,4,4,4,4,0,4,4,4,4,4,4,0', 5],
  ['1|1|4,4,4,4,4,0,1,5,5,5,4,4,4,0', 11],
  ['2|1|0,5,1,6,6,5,1,4,4,4,4,4,4,0', 8],
]);

export class EliteRulesBot {
  constructor({ name = 'Elite Rules Bot' } = {}) {
    this.id = 'elite-rules';
    this.name = name;
    this.lastAnalysis = null;
  }

  chooseMove(state, player) {
    const turnState = ensureTurnState(state, player);
    const legalMoves = getLegalMoves(turnState, player);
    if (!legalMoves.length) return null;

    const bookMove = getOpeningBookMove(turnState, player);
    if (bookMove != null && legalMoves.includes(bookMove)) {
      this.lastAnalysis = {
        source: 'opening-book',
        bestMove: bookMove,
        candidates: [],
      };
      return bookMove;
    }

    const analysis = analyzeElitePosition(turnState, player);
    this.lastAnalysis = analysis;
    return analysis.bestMove;
  }
}

export function getOpeningBookMove(state, player) {
  const key = `${state.moveNumber}|${player}|${state.board.join(',')}`;
  return OPENING_BOOK.get(key) ?? null;
}

export function analyzeElitePosition(state, player) {
  const turnState = ensureTurnState(state, player);
  const legalMoves = getLegalMoves(turnState, player);
  const opponent = getOpponent(player);
  const simulationCache = new Map();
  const rootLead = getStoreLead(turnState, player);
  const phase = detectPhase(turnState);
  const baselineThreat = assessThreatIfOpponentMovedNow(turnState, player, simulationCache);
  const context = {
    player,
    opponent,
    rootLead,
    phase,
    baselineThreat,
    simulationCache,
  };

  if (countRemainingSideStones(turnState) <= EXACT_ENDGAME_STONE_THRESHOLD) {
    return analyzeExactEndgamePosition(turnState, player, context);
  }

  const candidates = legalMoves.map((move) => analyzeCandidate(turnState, player, move, context));
  candidates.sort((left, right) => compareCandidates(left, right, context));

  return {
    source: 'rules',
    phase,
    baselineThreat,
    bestMove: candidates[0]?.move ?? legalMoves[0],
    candidates,
  };
}

export function analyzeExactEndgamePosition(state, player, context = null) {
  const turnState = ensureTurnState(state, player);
  const legalMoves = getLegalMoves(turnState, player);
  const simulationCache = context?.simulationCache ?? new Map();
  const exactCache = context?.exactCache ?? GLOBAL_EXACT_ENDGAME_CACHE;
  const rootLead = getStoreLead(turnState, player);
  const phase = detectPhase(turnState);
  const baselineThreat = context?.baselineThreat ?? assessThreatIfOpponentMovedNow(turnState, player, simulationCache);
  const exactContext = context ?? {
    player,
    opponent: getOpponent(player),
    rootLead,
    phase,
    baselineThreat,
    simulationCache,
  };

  const candidates = legalMoves.map((move) => {
    const heuristicCandidate = analyzeCandidate(turnState, player, move, exactContext);
    const solved = solveExactEndgame(heuristicCandidate.immediateState, player, exactCache);
    return {
      ...heuristicCandidate,
      exactScore: solved.score,
      exactBestMove: solved.bestMove,
      exactOutcome: solved.outcome,
      exactSolvedNodes: solved.nodes,
      exactTerminalState: solved.terminalState,
    };
  });

  candidates.sort((left, right) => (
    compareNumber(left.exactScore, right.exactScore)
    || compareCandidates(left, right, exactContext)
  ));

  return {
    source: 'endgame-solver',
    phase,
    baselineThreat,
    bestMove: candidates[0]?.move ?? legalMoves[0] ?? null,
    exactScore: candidates[0]?.exactScore ?? getStoreLead(turnState, player),
    candidates,
  };
}

function analyzeCandidate(state, player, move, context) {
  const opponent = getOpponent(player);
  const immediateState = simulateMove(state, move, context.simulationCache);
  const immediateStoreGain = getStoreGain(state, immediateState, player);
  const immediateOpponentStoreGain = getStoreGain(state, immediateState, opponent);
  const captureSize = immediateState.lastMove?.captured ?? 0;
  const extraTurn = Boolean(immediateState.lastMove?.extraTurn);
  const immediateWin = immediateState.gameOver && immediateState.winner === player;
  const immediateLoss = immediateState.gameOver && immediateState.winner === opponent;

  let continuationState = immediateState;
  let bonusTurnMove = null;
  let bonusTurnSummary = null;

  if (extraTurn && !immediateState.gameOver && immediateState.currentPlayer === player) {
    bonusTurnSummary = chooseFollowUpMove(immediateState, player, context.simulationCache);
    if (bonusTurnSummary) {
      continuationState = bonusTurnSummary.state;
      bonusTurnMove = bonusTurnSummary.move;
    }
  }

  let opponentReply = null;
  if (!continuationState.gameOver && continuationState.currentPlayer === opponent) {
    opponentReply = chooseDangerReply(continuationState, opponent, context.simulationCache);
  }

  let tacticalFollowUp = null;
  if (opponentReply && !opponentReply.state.gameOver && opponentReply.state.currentPlayer === player) {
    tacticalFollowUp = chooseFollowUpMove(opponentReply.state, player, context.simulationCache);
  }

  const finalState = tacticalFollowUp?.state ?? opponentReply?.state ?? continuationState;
  const exactStoreLandingsAfter = countExactStoreLandings(finalState, player, context.simulationCache);
  const trapTargetsBefore = countControlledTrapTargets(state, player, context.simulationCache);
  const trapTargetsAfter = countControlledTrapTargets(finalState, player, context.simulationCache);
  const trapExposureBefore = countTrapExposure(state, player, context.simulationCache);
  const trapExposureAfter = countTrapExposure(finalState, player, context.simulationCache);
  const nearStoreHealthAfter = countNearStoreHealth(finalState, player);
  const opponentMobilityAfter = getLegalMoves(finalState, opponent).length;
  const myMobilityAfter = getLegalMoves(finalState, player).length;
  const threatAfter = assessThreatIfOpponentMovedNow(finalState, player, context.simulationCache);
  const threatReduction = Math.max(0, context.baselineThreat.dangerScore - threatAfter.dangerScore);
  const netSwing = getStoreLead(finalState, player) - getStoreLead(state, player);
  const continuationStoreGain = getStoreGain(state, continuationState, player);
  const bonusStoreGain = bonusTurnSummary ? getStoreGain(immediateState, bonusTurnSummary.state, player) : 0;
  const replyStoreLoss = opponentReply ? getStoreGain(continuationState, opponentReply.state, opponent) : 0;
  const followUpStoreGain = tacticalFollowUp && opponentReply ? getStoreGain(opponentReply.state, tacticalFollowUp.state, player) : 0;
  const replyCapture = opponentReply?.captureSize ?? 0;
  const replyExtraTurn = opponentReply?.extraTurn ? 1 : 0;
  const chainPotential = (extraTurn ? 1 : 0) + (bonusTurnSummary?.extraTurn ? 1 : 0);
  const safeExtraTurn = extraTurn
    && !opponentReply?.winsNow
    && replyCapture < BIG_CAPTURE_THRESHOLD
    && replyExtraTurn === 0
    && (opponentReply?.dangerScore ?? 0) < SAFE_REPLY_SWING_THRESHOLD * 16;
  const safeLargeCapture = captureSize >= LARGE_CAPTURE_THRESHOLD
    && !opponentReply?.winsNow
    && captureSize >= replyCapture
    && netSwing > 0;
  const controlledTrapGain = trapTargetsAfter - trapTargetsBefore;
  const opensOpponentTrap = trapExposureAfter > trapExposureBefore;
  const endgameClosureScore = computeEndgameClosureScore(finalState, player);
  const comebackPressure = computeComebackPressureScore(finalState, player);
  const midgamePressure = computeMidgamePressureScore(finalState, player);
  const geometryScore = computeGeometryScore(finalState, player, context.simulationCache);

  return {
    move,
    immediateState,
    continuationState,
    finalState,
    immediateWin,
    immediateLoss,
    finalMargin: getStoreLead(finalState, player),
    finalStoreGain: getStoreGain(state, finalState, player),
    immediateStoreGain,
    immediateOpponentStoreGain,
    continuationStoreGain,
    bonusStoreGain,
    followUpStoreGain,
    captureSize,
    extraTurn,
    safeExtraTurn,
    chainPotential,
    safeLargeCapture,
    opponentReply,
    tacticalFollowUp,
    allowsOpponentWin: Boolean(opponentReply?.winsNow),
    opponentReplyDanger: opponentReply?.dangerScore ?? 0,
    opponentReplyCapture: replyCapture,
    opponentReplyExtraTurn: replyExtraTurn,
    threatReduction,
    controlledTrapGain,
    opensOpponentTrap,
    exactStoreLandingsAfter,
    nearStoreHealthAfter,
    opponentMobilityAfter,
    myMobilityAfter,
    netSwing,
    endgameClosureScore,
    comebackPressure,
    midgamePressure,
    geometryScore,
    pitDistanceScore: -getDistanceToStore(move, player),
    detail: {
      bonusTurnMove,
      bonusTurnSummary,
      trapTargetsBefore,
      trapTargetsAfter,
      trapExposureBefore,
      trapExposureAfter,
      threatAfter,
      replyStoreLoss,
    },
  };
}

function compareCandidates(left, right, context) {
  let diff = compareBool(left.immediateWin, right.immediateWin);
  if (diff) return diff;
  if (left.immediateWin && right.immediateWin) {
    return (
      compareNumber(left.finalMargin, right.finalMargin)
      || compareNumber(left.finalStoreGain, right.finalStoreGain)
      || compareNumber(left.pitDistanceScore, right.pitDistanceScore)
    );
  }

  diff = compareBool(!left.allowsOpponentWin, !right.allowsOpponentWin);
  if (diff) return diff;

  diff = compareBool(left.safeExtraTurn, right.safeExtraTurn);
  if (diff) return diff;
  if (left.safeExtraTurn && right.safeExtraTurn) {
    return (
      compareNumber(left.chainPotential, right.chainPotential)
      || compareNumber(left.finalStoreGain, right.finalStoreGain)
      || compareNumber(-left.opponentReplyDanger, -right.opponentReplyDanger)
      || compareNumber(-left.opponentMobilityAfter, -right.opponentMobilityAfter)
      || compareNumber(left.exactStoreLandingsAfter, right.exactStoreLandingsAfter)
      || compareNumber(left.pitDistanceScore, right.pitDistanceScore)
    );
  }

  diff = compareBool(left.safeLargeCapture, right.safeLargeCapture);
  if (diff) return diff;
  if (left.safeLargeCapture && right.safeLargeCapture) {
    return (
      compareNumber(left.netSwing, right.netSwing)
      || compareNumber(left.captureSize, right.captureSize)
      || compareNumber(-left.opponentReplyDanger, -right.opponentReplyDanger)
      || compareNumber(left.finalStoreGain, right.finalStoreGain)
      || compareNumber(left.pitDistanceScore, right.pitDistanceScore)
    );
  }

  if (context.baselineThreat.dangerScore >= THREAT_DENIAL_THRESHOLD) {
    diff = compareNumber(left.threatReduction, right.threatReduction);
    if (diff) return diff;
  }

  const leftTrapBuild = left.controlledTrapGain > 0 && !left.opensOpponentTrap;
  const rightTrapBuild = right.controlledTrapGain > 0 && !right.opensOpponentTrap;
  diff = compareBool(leftTrapBuild, rightTrapBuild);
  if (diff) return diff;
  if (leftTrapBuild && rightTrapBuild) {
    return (
      compareNumber(left.controlledTrapGain, right.controlledTrapGain)
      || compareNumber(left.exactStoreLandingsAfter, right.exactStoreLandingsAfter)
      || compareNumber(-left.opponentReplyDanger, -right.opponentReplyDanger)
      || compareNumber(left.pitDistanceScore, right.pitDistanceScore)
    );
  }

  if (context.phase === 'endgame' && context.rootLead >= 4) {
    diff = compareNumber(left.endgameClosureScore, right.endgameClosureScore);
    if (diff) return diff;
  }

  if (context.phase === 'endgame' && context.rootLead <= -4) {
    diff = compareNumber(left.comebackPressure, right.comebackPressure);
    if (diff) return diff;
  }

  diff = compareNumber(left.midgamePressure, right.midgamePressure);
  if (diff) return diff;

  diff = compareNumber(left.geometryScore, right.geometryScore);
  if (diff) return diff;

  return (
    compareNumber(-left.opponentReplyDanger, -right.opponentReplyDanger)
    || compareNumber(left.netSwing, right.netSwing)
    || compareNumber(left.finalStoreGain, right.finalStoreGain)
    || compareNumber(left.chainPotential, right.chainPotential)
    || compareNumber(-left.opponentMobilityAfter, -right.opponentMobilityAfter)
    || compareNumber(left.nearStoreHealthAfter, right.nearStoreHealthAfter)
    || compareNumber(left.exactStoreLandingsAfter, right.exactStoreLandingsAfter)
    || compareNumber(left.pitDistanceScore, right.pitDistanceScore)
  );
}

function chooseDangerReply(state, player, simulationCache) {
  const turnState = ensureTurnState(state, player);
  const legalMoves = getLegalMoves(turnState, player);
  if (!legalMoves.length) return null;

  let best = null;
  for (const move of legalMoves) {
    const nextState = simulateMove(turnState, move, simulationCache);
    const victim = getOpponent(player);
    const captureSize = nextState.lastMove?.captured ?? 0;
    const extraTurn = Boolean(nextState.lastMove?.extraTurn);
    const winsNow = nextState.gameOver && nextState.winner === player;
    const storeGain = getStoreGain(turnState, nextState, player);
    const victimMobility = getLegalMoves(nextState, victim).length;
    const playerExactLandings = countExactStoreLandings(nextState, player, simulationCache);
    const endgameSwing = computeEndgameClosureScore(nextState, player);
    const dangerScore = (winsNow ? 10000 : 0)
      + (extraTurn ? 220 : 0)
      + captureSize * 28
      + storeGain * 18
      + Math.max(0, endgameSwing) * 7
      + Math.max(0, 6 - victimMobility) * 5
      + playerExactLandings * 12;

    const summary = {
      move,
      state: nextState,
      winsNow,
      extraTurn,
      captureSize,
      storeGain,
      victimMobility,
      playerExactLandings,
      endgameSwing,
      dangerScore,
      pitDistanceScore: -getDistanceToStore(move, player),
    };

    if (!best || compareDangerReplies(summary, best) < 0) {
      best = summary;
    }
  }

  return best;
}

function compareDangerReplies(left, right) {
  return (
    compareBool(left.winsNow, right.winsNow)
    || compareBool(left.extraTurn, right.extraTurn)
    || compareNumber(left.captureSize, right.captureSize)
    || compareNumber(left.storeGain, right.storeGain)
    || compareNumber(left.endgameSwing, right.endgameSwing)
    || compareNumber(-left.victimMobility, -right.victimMobility)
    || compareNumber(left.playerExactLandings, right.playerExactLandings)
    || compareNumber(left.dangerScore, right.dangerScore)
    || compareNumber(left.pitDistanceScore, right.pitDistanceScore)
  );
}

function chooseFollowUpMove(state, player, simulationCache) {
  const turnState = ensureTurnState(state, player);
  const legalMoves = getLegalMoves(turnState, player);
  if (!legalMoves.length) return null;

  let best = null;
  for (const move of legalMoves) {
    const nextState = simulateMove(turnState, move, simulationCache);
    const opponent = getOpponent(player);
    const captureSize = nextState.lastMove?.captured ?? 0;
    const extraTurn = Boolean(nextState.lastMove?.extraTurn);
    const winsNow = nextState.gameOver && nextState.winner === player;
    const storeGain = getStoreGain(turnState, nextState, player);
    const opponentDanger = assessThreatIfOpponentMovedNow(nextState, player, simulationCache).dangerScore;
    const exactLandings = countExactStoreLandings(nextState, player, simulationCache);
    const trapGain = countControlledTrapTargets(nextState, player, simulationCache) - countControlledTrapTargets(turnState, player, simulationCache);
    const summary = {
      move,
      state: nextState,
      winsNow,
      extraTurn,
      captureSize,
      storeGain,
      opponentDanger,
      exactLandings,
      trapGain,
      myMobility: getLegalMoves(nextState, player).length,
      opponentMobility: getLegalMoves(nextState, opponent).length,
      pitDistanceScore: -getDistanceToStore(move, player),
    };

    if (!best || compareFollowUps(summary, best) < 0) {
      best = summary;
    }
  }

  return best;
}

function compareFollowUps(left, right) {
  return (
    compareBool(left.winsNow, right.winsNow)
    || compareBool(left.extraTurn, right.extraTurn)
    || compareNumber(left.captureSize, right.captureSize)
    || compareNumber(left.storeGain, right.storeGain)
    || compareNumber(left.trapGain, right.trapGain)
    || compareNumber(left.exactLandings, right.exactLandings)
    || compareNumber(-left.opponentDanger, -right.opponentDanger)
    || compareNumber(-left.opponentMobility, -right.opponentMobility)
    || compareNumber(left.myMobility, right.myMobility)
    || compareNumber(left.pitDistanceScore, right.pitDistanceScore)
  );
}

function assessThreatIfOpponentMovedNow(state, player, simulationCache) {
  const opponent = getOpponent(player);
  const turnState = ensureTurnState(state, opponent);
  const reply = chooseDangerReply(turnState, opponent, simulationCache);
  return reply ?? { dangerScore: 0, captureSize: 0, extraTurn: false, winsNow: false };
}

function countExactStoreLandings(state, player, simulationCache) {
  const turnState = ensureTurnState(state, player);
  const legalMoves = getLegalMoves(turnState, player);
  let count = 0;
  for (const move of legalMoves) {
    const nextState = simulateMove(turnState, move, simulationCache);
    if (nextState.lastMove?.extraTurn) count += 1;
  }
  return count;
}

function countControlledTrapTargets(state, player, simulationCache) {
  const [start, end] = getPitRange(player);
  const opponent = getOpponent(player);
  const landingTargets = getLandingTargets(state, player, simulationCache);
  let count = 0;
  for (let pit = start; pit <= end; pit += 1) {
    if (state.board[pit] !== 0) continue;
    const opposite = getOppositePitIndex(pit);
    if (state.board[opposite] <= 0) continue;
    if (landingTargets.has(pit) && state.board[getStoreIndex(opponent)] >= 0) count += 1;
  }
  return count;
}

function countTrapExposure(state, player, simulationCache) {
  const opponent = getOpponent(player);
  const [oppStart, oppEnd] = getPitRange(opponent);
  const opponentLandingTargets = getLandingTargets(state, opponent, simulationCache);
  let count = 0;
  for (let pit = oppStart; pit <= oppEnd; pit += 1) {
    if (state.board[pit] !== 0) continue;
    const opposite = getOppositePitIndex(pit);
    if (state.board[opposite] <= 0) continue;
    if (opponentLandingTargets.has(pit)) count += 1;
  }
  return count;
}

function getLandingTargets(state, player, simulationCache) {
  const turnState = ensureTurnState(state, player);
  const targets = new Set();
  for (const move of getLegalMoves(turnState, player)) {
    const nextState = simulateMove(turnState, move, simulationCache);
    const landed = nextState.lastMove?.endedIndex;
    if (Number.isInteger(landed)) targets.add(landed);
  }
  return targets;
}

function computeEndgameClosureScore(state, player) {
  const opponent = getOpponent(player);
  const myLead = getStoreLead(state, player);
  const mySide = sumSide(state.board, player);
  const opponentSide = sumSide(state.board, opponent);
  return myLead * 6 + Math.max(0, 6 - getLegalMoves(state, opponent).length) * 10 - opponentSide * 2 + Math.max(0, mySide - opponentSide);
}

function computeComebackPressureScore(state, player) {
  const opponent = getOpponent(player);
  const mySide = sumSide(state.board, player);
  const opponentSide = sumSide(state.board, opponent);
  return mySide * 4 + countExactStoreLandings(state, player, new Map()) * 16 + countControlledTrapTargets(state, player, new Map()) * 20 - getStoreLead(state, opponent);
}

function computeMidgamePressureScore(state, player) {
  const opponent = getOpponent(player);
  return (6 - getLegalMoves(state, opponent).length) * 18
    + getLegalMoves(state, player).length * 8
    + countExactStoreLandings(state, player, new Map()) * 12
    + countControlledTrapTargets(state, player, new Map()) * 16
    - countTrapExposure(state, player, new Map()) * 18;
}

function computeGeometryScore(state, player, simulationCache) {
  const opponent = getOpponent(player);
  return countNearStoreHealth(state, player) * 10
    + countExactStoreLandings(state, player, simulationCache) * 12
    + countControlledTrapTargets(state, player, simulationCache) * 14
    - countTrapExposure(state, player, simulationCache) * 16
    - getLegalMoves(state, opponent).length * 6;
}

function detectPhase(state) {
  if (state.moveNumber < 6) return 'opening';
  const remainingSideStones = countRemainingSideStones(state);
  if (remainingSideStones <= ENDGAME_SIDE_STONES_THRESHOLD) return 'endgame';
  return 'midgame';
}

function solveExactEndgame(state, rootPlayer, cache) {
  const key = `${rootPlayer}|${state.currentPlayer}|${state.board.join(',')}`;
  const cached = cache.get(key);
  if (cached) return cached;

  if (state.gameOver) {
    const result = {
      score: getStoreLead(state, rootPlayer),
      bestMove: null,
      outcome: classifyOutcome(getStoreLead(state, rootPlayer)),
      nodes: 1,
      terminalState: state,
    };
    cache.set(key, result);
    return result;
  }

  const currentPlayer = state.currentPlayer;
  const legalMoves = getLegalMoves(state, currentPlayer);
  if (!legalMoves.length) {
    const result = {
      score: getStoreLead(state, rootPlayer),
      bestMove: null,
      outcome: classifyOutcome(getStoreLead(state, rootPlayer)),
      nodes: 1,
      terminalState: state,
    };
    cache.set(key, result);
    return result;
  }

  const maximizing = currentPlayer === rootPlayer;
  let best = null;
  let visitedNodes = 1;

  for (const move of legalMoves) {
    const nextState = applyMove(state, move);
    const solved = solveExactEndgame(nextState, rootPlayer, cache);
    visitedNodes += solved.nodes;

    const candidate = {
      score: solved.score,
      bestMove: move,
      outcome: classifyOutcome(solved.score),
      nodes: visitedNodes,
      terminalState: solved.terminalState,
    };

    if (!best) {
      best = candidate;
      continue;
    }

    const compareScore = maximizing
      ? compareNumber(candidate.score, best.score)
      : compareNumber(best.score, candidate.score);

    if (compareScore < 0) {
      best = candidate;
    } else if (compareScore === 0 && compareNumber(-getDistanceToStore(move, currentPlayer), -getDistanceToStore(best.bestMove, currentPlayer)) < 0) {
      best = candidate;
    }
  }

  const result = {
    ...best,
    nodes: visitedNodes,
  };
  cache.set(key, result);
  return result;
}

function countNearStoreHealth(state, player) {
  const nearStorePits = player === PLAYER_ONE ? [5, 4] : [7, 8];
  return nearStorePits.reduce((sum, pit) => sum + state.board[pit], 0);
}

function getDistanceToStore(pitIndex, player) {
  return player === PLAYER_ONE ? 5 - pitIndex : pitIndex - 7;
}

function getStoreLead(state, player) {
  const opponent = getOpponent(player);
  return state.board[getStoreIndex(player)] - state.board[getStoreIndex(opponent)];
}

function getStoreGain(beforeState, afterState, player) {
  return afterState.board[getStoreIndex(player)] - beforeState.board[getStoreIndex(player)];
}

function countRemainingSideStones(state) {
  return sumSide(state.board, PLAYER_ONE) + sumSide(state.board, PLAYER_TWO);
}

function getOpponent(player) {
  return player === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
}

function sumSide(board, player) {
  const [start, end] = getPitRange(player);
  let total = 0;
  for (let index = start; index <= end; index += 1) {
    total += board[index];
  }
  return total;
}

function ensureTurnState(state, player) {
  if (state.currentPlayer === player) return state;
  const next = cloneState(state);
  next.currentPlayer = player;
  return next;
}

function simulateMove(state, move, simulationCache) {
  const key = `${state.currentPlayer}|${state.moveNumber}|${move}|${state.board.join(',')}`;
  if (simulationCache.has(key)) return simulationCache.get(key);
  const nextState = applyMove(ensureTurnState(state, state.currentPlayer), move);
  simulationCache.set(key, nextState);
  return nextState;
}

function compareBool(left, right) {
  if (left === right) return 0;
  return left ? -1 : 1;
}

function compareNumber(left, right) {
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

function classifyOutcome(score) {
  if (score > 0) return 'win';
  if (score < 0) return 'loss';
  return 'tie';
}
