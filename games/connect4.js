import { memo, confetti, sfx } from './fx.js';

const COLS = 7;
const ROWS = 6;

function findWin(b) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const m = b[r * COLS + c];
      if (!m) continue;
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const cells = [0, 1, 2, 3].map(k => [r + dr * k, c + dc * k]);
        if (cells.every(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && b[rr * COLS + cc] === m)) {
          return cells.map(([rr, cc]) => rr * COLS + cc);
        }
      }
    }
  }
  return null;
}

export const connect4 = {
  id: 'connect4',
  name: 'Connect 4',
  emoji: '🔴🟡',

  init({ players }) {
    return { board: Array(COLS * ROWS).fill(''), r: players[0]?.id ?? null, y: players[1]?.id ?? null, turn: 'R', winner: null, line: null };
  },

  reduce(s, a, env) {
    if (a.type === 'reset' && a.from === env.hostId) return this.init(env);
    if (a.type !== 'drop' || s.winner) return s;
    let { r, y } = s;
    if (a.from !== r && a.from !== y) {
      if (!r) r = a.from; else if (!y) y = a.from; else return s;
    }
    const mark = a.from === r ? 'R' : 'Y';
    const col = a.data?.col;
    if (mark !== s.turn || !Number.isInteger(col) || col < 0 || col >= COLS) return s;
    let row = -1;
    for (let i = ROWS - 1; i >= 0; i--) if (!s.board[i * COLS + col]) { row = i; break; }
    if (row < 0) return s;
    const board = s.board.slice();
    board[row * COLS + col] = mark;
    const line = findWin(board);
    const winner = line ? mark : board.every(Boolean) ? 'draw' : null;
    return { board, r, y, turn: mark === 'R' ? 'Y' : 'R', winner, line };
  },

  render(el, s, ui) {
    const prev = memo(el, 'board', s.board);
    const prevWinner = memo(el, 'winner', s.winner);
    if (s.winner && s.winner !== 'draw' && !prevWinner) { confetti(); sfx('win'); }
    else if (prev && s.board.some((c, i) => c && !prev[i])) sfx('pop');

    const name = m => ui.nameOf(m === 'R' ? s.r : s.y);
    const status = s.winner === 'draw' ? "It's a draw!"
      : s.winner ? `${name(s.winner)} wins! 🎉`
      : `Turn: ${name(s.turn)} (${s.turn === 'R' ? '🔴' : '🟡'})`;
    const cells = s.board.map((m, i) => {
      const row = Math.floor(i / COLS);
      const isNew = prev && m && !prev[i];
      const cls = ['piece', m === 'R' ? 'red' : m === 'Y' ? 'yellow' : 'empty', isNew ? 'drop' : '', s.line?.includes(i) ? 'win' : ''].join(' ');
      return `<button class="c4cell" data-c="${i % COLS}" ${s.winner ? 'disabled' : ''} aria-label="column ${(i % COLS) + 1}"><i class="${cls}" style="--from:${-(row + 1) * 110}%"></i></button>`;
    }).join('');
    el.innerHTML = `
      <h2>Connect 4</h2>
      <p class="muted">🔴 ${ui.esc(name('R'))} vs 🟡 ${ui.esc(name('Y'))}. Get four in a row. Everyone else is watching.</p>
      <p><b>${ui.esc(status)}</b></p>
      <div class="c4">${cells}</div>
      ${ui.isHost ? '<button class="ghost" id="reset">New round</button>' : ''}`;
    el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => ui.act('drop', { col: +b.dataset.c }));
    el.querySelector('#reset')?.addEventListener('click', () => ui.act('reset'));
  },
};
