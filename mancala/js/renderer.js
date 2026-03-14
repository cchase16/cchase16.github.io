import { getLegalMoves, getPlayerLabel, PLAYER_ONE, PLAYER_TWO } from './engine.js';

const topRowIndices = [12, 11, 10, 9, 8, 7];
const bottomRowIndices = [0, 1, 2, 3, 4, 5];

export function renderBoard({
  boardElement,
  state,
  playerConfigs,
  onPitClick,
}) {
  boardElement.innerHTML = '';

  const leftStore = createStore({
    label: playerConfigs[PLAYER_TWO]?.label ?? getPlayerLabel(PLAYER_TWO),
    count: state.board[13],
    className: 'left-store',
  });
  boardElement.appendChild(leftStore);

  topRowIndices.forEach((index, position) => {
    boardElement.appendChild(createPit({
      index,
      position,
      row: 'top',
      state,
      onPitClick,
    }));
  });

  bottomRowIndices.forEach((index, position) => {
    boardElement.appendChild(createPit({
      index,
      position,
      row: 'bottom',
      state,
      onPitClick,
    }));
  });

  const rightStore = createStore({
    label: playerConfigs[PLAYER_ONE]?.label ?? getPlayerLabel(PLAYER_ONE),
    count: state.board[6],
    className: 'right-store',
  });
  boardElement.appendChild(rightStore);
}

function createStore({ label, count, className }) {
  const el = document.createElement('div');
  el.className = `store ${className}`;
  el.innerHTML = `
    <div class="store-label">${escapeHtml(label)}</div>
    <div class="store-count">${count}</div>
  `;
  return el;
}

function createPit({ index, position, row, state, onPitClick }) {
  const legalMoves = getLegalMoves(state, state.currentPlayer);
  const isLegal = legalMoves.includes(index);
  const isDisabled = !isLegal || state.gameOver;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `pit ${isLegal ? 'legal active-turn' : ''}`.trim();
  btn.disabled = isDisabled;
  btn.style.gridColumn = String(position + 2);
  btn.style.gridRow = row === 'top' ? '1' : '2';

  const displayNumber = row === 'bottom' ? index + 1 : index - 6;
  const stones = state.board[index];

  btn.innerHTML = `
    <div class="pit-label">Pit ${displayNumber}</div>
    <div class="pit-count">${stones}</div>
    <div class="stone-dots">${renderDots(stones)}</div>
  `;

  btn.addEventListener('click', () => onPitClick(index));
  return btn;
}

function renderDots(count) {
  const limit = Math.min(count, 16);
  let html = '';
  for (let i = 0; i < limit; i += 1) {
    html += '<span class="stone-dot"></span>';
  }
  if (count > limit) {
    html += `<span class="pit-label">+${count - limit}</span>`;
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
