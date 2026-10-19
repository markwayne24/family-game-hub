# Family Game Hub

Multiplayer party games for family and friends. The host creates a room and shares a link; guests join with a name.
Games: Tic-Tac-Toe, Trivia (with custom questions), Bingo, Rock Paper Scissors, Memory Match, Draw & Guess, Impostor (social deduction).

- **Frontend:** static files (no build step), hosted on any static host.
- **Backend:** Supabase (Auth, Postgres for rooms, Realtime for gameplay).
- **Schema:** `supabase/migration.sql`. Enable "Allow anonymous sign-ins" in Supabase Auth settings.
- **Add a game:** create `games/<name>.js` exporting `{ id, name, emoji, init(env, opts), reduce(state, action, env), render(el, state, ui) }` and list it in `games/index.js`.
  Optional hooks: `view(state)` (public copy that hides secrets), `priv(state)` (per-player secrets, e.g. roles), `deadline(state)` (timestamp; the host fires a `timeout` action then).
- **How it works:** the host's browser runs the game rules and broadcasts state over a Supabase Realtime channel. Guests send actions; the host applies them. Moves are trusted from each browser, which is fine for family play but not for competitive use.

Run locally: `npx serve .`
