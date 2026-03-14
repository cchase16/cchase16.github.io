import { getLegalMoves, getPlayerLabel, PLAYER_ONE, PLAYER_TWO } from './engine.js';

const topRowIndices = [12, 11, 10, 9, 8, 7];
const bottomRowIndices = [0, 1, 2, 3, 4, 5];

export function renderBoard({
  boardElement,
  state,
  playerConfigs,
  onPitClick,
  highlightedPit = null,
  pickedPit = null,
  animating = false,
}) {
  boardElement.innerHTML = '';

  const leftStore = createStore({
    label: playerConfigs[PLAYER_TWO]?.label ?? getPlayerLabel(PLAYER_TWO),
    count: state.board[13],
    className: 'left-store',
    isHighlighted: highlightedPit === 13,
    seedClass: 'player-two-seed',
    holeIndex: 13,
  });
  boardElement.appendChild(leftStore);

  topRowIndices.forEach((index, position) => {
    boardElement.appendChild(createPit({
      index,
      position,
      row: 'top',
      state,
      onPitClick,
      highlightedPit,
      pickedPit,
      animating,
    }));
  });

  bottomRowIndices.forEach((index, position) => {
    boardElement.appendChild(createPit({
      index,
      position,
      row: 'bottom',
      state,
      onPitClick,
      highlightedPit,
      pickedPit,
      animating,
    }));
  });

  const rightStore = createStore({
    label: playerConfigs[PLAYER_ONE]?.label ?? getPlayerLabel(PLAYER_ONE),
    count: state.board[6],
    className: 'right-store',
    isHighlighted: highlightedPit === 6,
    seedClass: 'player-one-seed',
    holeIndex: 6,
  });
  boardElement.appendChild(rightStore);
}

function createStore({ label, count, className, isHighlighted, seedClass, holeIndex }) {
  const el = document.createElement('div');
  el.className = `store ${className} ${isHighlighted ? 'seed-highlight' : ''}`.trim();
  el.dataset.holeIndex = String(holeIndex);
  el.innerHTML = `
    <div class="store-grain"></div>
    <div class="store-label">${escapeHtml(label)}</div>
    <div class="store-count">${count}</div>
    <div class="stone-dots store-dots">${renderDots(Math.min(count, 12), seedClass)}</div>
  `;
  return el;
}

function createPit({ index, position, row, state, onPitClick, highlightedPit, pickedPit, animating }) {
  const legalMoves = getLegalMoves(state, state.currentPlayer);
  const isLegal = legalMoves.includes(index);
  const isDisabled = animating || !isLegal || state.gameOver;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = [
    'pit',
    isLegal ? 'legal active-turn' : '',
    highlightedPit === index ? 'seed-highlight' : '',
    pickedPit === index ? 'pit-picked' : '',
  ].filter(Boolean).join(' ');
  btn.disabled = isDisabled;
  btn.dataset.pitIndex = String(index);
  btn.dataset.holeIndex = String(index);
  btn.style.gridColumn = String(position + 2);
  btn.style.gridRow = row === 'top' ? '1' : '2';

  const displayNumber = row === 'bottom' ? index + 1 : index - 6;
  const stones = state.board[index];

  const seedClass = row === 'bottom' ? 'player-one-seed' : 'player-two-seed';

  btn.innerHTML = `
    <div class="pit-rim"></div>
    <div class="pit-shine"></div>
    <div class="pit-label">Pit ${displayNumber}</div>
    <div class="pit-count">${stones}</div>
    <div class="stone-dots">${renderDots(stones, seedClass)}</div>
  `;

  btn.addEventListener('click', () => onPitClick(index));
  return btn;
}

function renderDots(count, seedClass) {
  const limit = Math.min(count, 16);
  let html = '';
  for (let i = 0; i < limit; i += 1) {
    html += `<span class="stone-dot ${seedClass}"></span>`;
  }
  if (count > limit) {
    html += `<span class="pit-label extra-count">+${count - limit}</span>`;
  }
  return html;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
