import { tictactoe } from './tictactoe.js';
import { trivia } from './trivia.js';
import { bingo } from './bingo.js';

// To add a game: create a module exporting { id, name, emoji, init, reduce, render, view? } and list it here.
export const GAMES = Object.fromEntries([tictactoe, trivia, bingo].map(g => [g.id, g]));
