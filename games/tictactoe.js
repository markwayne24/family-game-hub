import { memo, confetti } from './fx.js';

const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

function winnerOf(b) {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every(Boolean) ? 'draw' : null;
}

export const tictactoe = {
  id: 'tictactoe',
  name: 'Tic-Tac-Toe',
  emoji: '❌⭕',

  init({ players }) {
    return { board: Array(9).fill(''), x: players[0]?.id ?? null, o: players[1]?.id ?? null, turn: 'X', winner: null };
  },

  reduce(s, a, env) {
    if (a.type === 'reset' && a.from === env.hostId) return this.init(env);
    if (a.type !== 'move' || s.winner) return s;
    let { x, o } = s;
    if (a.from !== x && a.from !== o) {
      if (!x) x = a.from; else if (!o) o = a.from; else return s;
    }
    const mark = a.from === x ? 'X' : 'O';
    const i = a.data?.i;
    if (mark !== s.turn || !(i >= 0 && i < 9) || s.board[i]) return s;
    const board = s.board.slice();
    board[i] = mark;
    const winner = winnerOf(board);
    return { board, x, o, turn: mark === 'X' ? 'O' : 'X', winner };
  },

  render(el, s, ui) {
    const name = m => ui.nameOf(m === 'X' ? s.x : s.o);
    const prevBoard = memo(el, 'board', s.board);
    const prevWinner = memo(el, 'winner', s.winner);
    const line = LINES.find(([a, b, c]) => s.board[a] && s.board[a] === s.board[b] && s.board[a] === s.board[c]);
    if (s.winner && s.winner !== 'draw' && !prevWinner) confetti();
    const status = s.winner === 'draw' ? "It's a draw!"
      : s.winner ? `${name(s.winner)} wins! 🎉`
      : `Turn: ${name(s.turn)} (${s.turn})`;
    el.innerHTML = `
      <h2>Tic-Tac-Toe</h2>
      <p class="muted">❌ ${ui.esc(name('X'))} vs ⭕ ${ui.esc(name('O'))}. Everyone else is watching.</p>
      <p><b class="status-pop">${ui.esc(status)}</b></p>
      <div class="ttt">${s.board.map((c, i) => `<button data-i="${i}" class="${prevBoard && !prevBoard[i] && c ? 'pop' : ''} ${line?.includes(i) ? 'win' : ''}">${c === 'X' ? '❌' : c === 'O' ? '⭕' : ''}</button>`).join('')}</div>
      ${ui.isHost ? '<button class="ghost" id="reset">New round</button>' : ''}`;
    el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => ui.act('move', { i: +b.dataset.i }));
    el.querySelector('#reset')?.addEventListener('click', () => ui.act('reset'));
  },
};
