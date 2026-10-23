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
import { charades } from './charades.js';
import { werewolf } from './werewolf.js';
import { bunutan } from './bunutan.js';
import { secret } from './secret.js';

// To add a game: create a module exporting { id, name, emoji, init(env, opts), reduce(state, action, env), render(el, state, ui) }
// and optionally: view(state) public copy, priv(state) -> { playerId: secret }, deadline(state) -> ms timestamp.
export const GAMES = Object.fromEntries([tictactoe, trivia, bingo, rps, memory, drawing, impostor, connect4, hangman, wordrace, charades, werewolf, bunutan, secret].map(g => [g.id, g]));
