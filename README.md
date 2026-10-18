# Family Game Hub

Multiplayer party games for family and friends. The host creates a room and shares a link; guests join with a name.
Games: Tic-Tac-Toe, Trivia, Bingo.

- **Frontend:** static files (no build step), hosted on any static host.
- **Backend:** Supabase (Auth, Postgres for rooms, Realtime for gameplay).
- **Schema:** `supabase/migration.sql`. Enable "Allow anonymous sign-ins" in Supabase Auth settings.
- **Add a game:** create `games/<name>.js` exporting `{ id, name, emoji, init, reduce, render, view? }` and list it in `games/index.js`.

Run locally: `npx serve .`
