import { tictactoe } from './tictactoe.js';
import { trivia } from './trivia.js';
import { bingo } from './bingo.js';
import { rps } from './rps.js';
import { memory } from './memory.js';
import { drawing } from './drawing.js';
import { impostor } from './impostor.js';
import { connect4 } from './connect4.js';
import { hangman } from './hangman.js';
import { wordrace } from './wordrace.js';

// To add a game: create a module exporting { id, name, emoji, init(env, opts), reduce(state, action, env), render(el, state, ui) }
// and optionally: view(state) public copy, priv(state) -> { playerId: secret }, deadline(state) -> ms timestamp.
export const GAMES = Object.fromEntries([tictactoe, trivia, bingo, rps, memory, drawing, impostor, connect4, hangman, wordrace].map(g => [g.id, g]));
