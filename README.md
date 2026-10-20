# Family Game Hub

Multiplayer party games for family and friends. The host creates a room and shares a link; guests join with a name.
Games: Tic-Tac-Toe, Connect 4, Trivia (4 question packs + your own), Bingo, Rock Paper Scissors, Memory Match, Draw & Guess, Impostor, Hangman, Word Race, Charades.

Host tools: pick a game and its options (question pack, word difficulty, prompt type), remove players, close the room. Refreshing a tab rejoins the same room (guests) or resumes the room and game (host). Sound effects have a mute button.

- **Frontend:** static files (no build step), hosted on any static host.
- **Backend:** Supabase (Auth, Postgres for rooms, Realtime for gameplay).
- **Schema:** `supabase/migration.sql`. Enable "Allow anonymous sign-ins" in Supabase Auth settings.
- **Add a game:** create `games/<name>.js` exporting `{ id, name, emoji, init(env, opts), reduce(state, action, env), render(el, state, ui) }` and list it in `games/index.js`.
  Optional hooks: `view(state)` (public copy that hides secrets), `priv(state)` (per-player secrets, e.g. roles), `deadline(state)` (timestamp; the host fires a `timeout` action then).
- **How it works:** the host's browser runs the game rules and broadcasts state over a Supabase Realtime channel. Guests send actions; the host applies them. Moves are trusted from each browser, which is fine for family play but not for competitive use.

Run locally: `npx serve .`

## Tests

`npm test` checks every game's rules, scoring, secret-info handling and timers (no browser needed).
