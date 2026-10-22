# Family Game Hub

Multiplayer party games for family and friends. The host creates a room and shares a link; guests join with a name.
Games: Tic-Tac-Toe, Connect 4, Trivia (4 question packs + your own), Bingo, Rock Paper Scissors, Memory Match, Draw & Guess, Impostor, Hangman, Word Race, Charades.

Bingo: players shuffle their own cards (always unique) until the host starts. The host can give players extra cards (everyone sees the card counts), pick win patterns from a library of 38 shapes (classic lines, letters A–Z shapes, hearts, stars, a Christmas tree, a house, a smiley and more), choose one or several (a card wins with any one of them) or all, or draw a custom one square by square, and choose how numbers are drawn: instant (everyone sees it) or private roll (only the host sees it until they reveal it). Wins are detected automatically and the winning cells light up gold; every revealed number plays an animated ball draw. The host can end a game early or start a new one, and every finished game goes into a history (winners, pattern, numbers called, games played, wins per player) that lasts for the whole room session.

Names: everyone sees their own name at the top of their screen. If two players pick the same name, the later joiner gets a stable 5-digit ID, like "Nicole (31351)" (and is told why), so the host can tell who won.

Players: everyone sees a live total at the top of their screen ("👥 7 players", or "👥 7 / 10 players · 3 spots left" when the host sets a limit). The host can limit how many people can join (the host counts as one), or choose no limit. When the room is full, newcomers see a "room is full" message with a Try again button; players already in are never removed, someone who drops out keeps their seat for 5 minutes, and the host can free held seats at any time. The limit is enforced by the host's browser.

People who join during a game: the host chooses in Room settings. Automatic (the default) makes newcomers watch Bingo until the next game, because a latecomer's card would start with every called number marked, while the casual games let them join in. The host can also force Always watch or Always join in, and let watchers in at any time. Everyone who was there when the game began, including someone who only dropped out for a moment, keeps playing. Watchers see the game, are counted in the total ("👀 2 watching"), and can't act; the host's browser ignores their moves.

Secrets: anything private to one player (your role, your word, a charades prompt) is encrypted for that player only. Everyone joins with a fresh key pair; the host seals each private message with a key shared with its recipient, so other players looking at the network traffic see only scrambled bytes, and the host's own secrets never leave the host's phone. (The host's phone still sees every secret, as it runs the game.)

Dropped connections: the host's game keeps every number that is called, so a player who drops out and comes back sees their card filled in exactly as if they never left. In Bingo a player who drops out stays in the game for 5 minutes and can still win while offline (the host and everyone see "was offline"); a returning phone asks the host for the current game straight away.

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
