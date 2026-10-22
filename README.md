# Family Game Hub

Multiplayer party games for family and friends. The host creates a room and shares a link; guests join with a name.
Games: Tic-Tac-Toe, Connect 4, Trivia (4 question packs + your own), Bingo, Rock Paper Scissors, Memory Match, Draw & Guess, Impostor, Hangman, Word Race, Charades.

Bingo: players shuffle their own cards (always unique) until the host starts. The host can give players extra cards (everyone sees the card counts), pick a preset win pattern or draw a custom one square by square, and choose how numbers are drawn: instant (everyone sees it) or private roll (only the host sees it until they reveal it). Wins are detected automatically and the winning cells light up gold; every revealed number plays an animated ball draw. The host can end a game early or start a new one, and every finished game goes into a history (winners, pattern, numbers called, games played, wins per player) that lasts for the whole room session.

Names: if two players pick the same name, the later joiner is shown as "Name 2" (and told why), so scores and winners are never ambiguous.

Phones: built for phones first. Big tap targets, no sideways scrolling, no iPhone zoom on inputs, safe-area padding, and touch drawing. The screen is kept awake while you are in a room (the host's phone runs the game, so if it sleeps the game would freeze), the invite button opens the phone's share sheet, and the room re-syncs when a phone wakes up.

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
