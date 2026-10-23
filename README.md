# Barkada Hub

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

Landing page: signed-out visitors see a landing page with three games as a teaser (the rest are locked), how it works, the sign-in form and a "Got a room code?" box. After signing in, the home screen lists every game with its goal and how to play. Guests with an invite link or room code still join without an account.

Accounts: anyone can sign up and host rooms, with **Continue with Google** or with an email and a password (8+ characters). A new email account gets a 6-digit code by email and must enter it (or tap the link in the email) before it can sign in, so only real addresses get in. Guests joining a room still don't need an account.

Supabase setup for sign-in:
1. **Authentication → Sign In / Providers → Email:** turn on "Confirm email". Keep "Allow anonymous sign-ins" on for guests.
2. **Authentication → Emails → Confirm signup:** put the code in the email, e.g. `<p>Your Barkada Hub code is <b>{{ .Token }}</b></p><p>Or <a href="{{ .ConfirmationURL }}">confirm your email</a>.</p>`. Set up custom SMTP for real traffic, as Supabase's built-in mailer only sends a few emails an hour.
3. **Authentication → Sign In / Providers → Google:** turn on and paste the Client ID and secret from a Google Cloud OAuth client (type "Web application") whose authorized redirect URI is `https://<project>.supabase.co/auth/v1/callback`.
4. **Authentication → URL Configuration:** Site URL `https://www.barkadahub.com`, and add it (plus `http://localhost:3000` for local testing) to the redirect URLs.
5. Existing database: run `supabase/002_open_hosting.sql` once in the SQL editor so every verified account can host (before, only the first account could).

Run locally: `npx serve .`

## Tests

`npm test` checks every game's rules, scoring, secret-info handling and timers (no browser needed).

## Werewolf

Needs 5+ players. The host picks who runs the game:

- **No moderator** – the app runs everything on timers (night, discussion, vote); the host plays too.
- **Host moderates** – the host sees every role, reads the script and presses ▶ to move on (does not play).
- **A player moderates** – the host picks one player to moderate; the host plays.

Roles: Werewolf, Villager, Seer, Doctor, optional Hunter. Wolves count is automatic or fixed; the host can toggle roles, whether the dead's roles are shown, and whether the dead can see everyone's roles. Roles and night actions are sent encrypted to each player.

Werewolf atmosphere: the night screen has a moonlit sky with a howling wolf, bats and twinkling stars, crickets and wind, a far-off howl, and a heartbeat in the last 10 seconds. Each morning every phone plays the same short scene (tap to skip): a wolf lunges out of the dark and either claws the victim's name or is driven back. The scene is identical on every device and the night-action buttons all make the same quiet sound, so nothing gives away who the wolves are. Respects the sound mute button and "reduce motion".

**Face-to-face mode** (Werewolf option): when everyone sits in the same room, tapping on a phone at night gives wolves away. With this on, every player gets the identical night screen and must pick someone. A wolf's pick is the kill vote, the seer's pick is inspected (answer arrives at dawn), the doctor's pick is protected, and everyone else's pick is a decoy. A "peek" button explains what your own pick does. Players who skip the night can't vote the next day.

Villagers and the hunter get a decoy job at night in normal mode too (a seer-style or doctor-style screen whose pick does nothing, never sent to anyone), so an idle phone doesn't give them away.

### Werewolf: more roles and rules
- **Roles:** 🛡️ Bodyguard (dies in place of the person they guard), 🧙‍♀️ Witch (one heal and one poison per game; sees who the wolves chose once the pack has decided), 💘 Cupid (picks two lovers on night one; they die together and win together if they are the last two on opposite sides), 🎭 Tanner (wins alone if voted out). Witch and Cupid are off in face-to-face mode (they need two choices).
- **Voting:** optional open voting (votes visible live) and a runoff vote on a tie. Votes are read out one by one with a count-up and a farewell for the player who is out.
- **Atmosphere:** sunrise and dusk themes, a daytime sky with birds, glowing wolf eyes on a wolf's own night screen, a golden shield scene for the doctor when a save works, a hunter's bang, and a ghost view with a timeline for players who are out.
- **After the game:** a night-by-night recap of what everyone did and a leaderboard (wins, games, survived) that carries across rematches.
- **Moderator tools:** a read-aloud script (one line per step, with a sound), and a countdown the moderator can start, extend or stop. When it runs out the game moves on.

Werewolf vote privacy: the host can turn **Show who voted for whom** off in the lobby. The result then shows only the totals (and the number of skips), and the individual votes are never sent to players.

### Werewolf: pause and drop-outs
- **Pause:** the host or moderator can pause the game (bathroom break!). Everyone sees a "paused" banner, countdowns freeze, nothing can be played, and when they resume the timers pick up where they stopped.
- **Someone goes offline:** a 🔌 shows next to their name. After 2 minutes the host (or moderator) is asked, without naming any roles: **Wait**, **Autopilot** (the app plays random legal moves for them and they take over again if they return), or **Remove** (they are out as "left the game"; if that was the last wolf the village wins). People who are offline that long are no longer waited for when closing the night or a vote. If the **moderator** drops, the host can switch the game to timers.

### Room bar and menu
A fixed bar stays at the top of every screen with the room code, the 🔊 sound switch (for everyone) and a ⚙ menu. The host's menu holds every host control: invite link, back to the game list, player limit, what happens when people join mid-game, and close room. Other players' menu has Leave room. A paused Werewolf game covers the whole screen for everyone, wherever they have scrolled to.

Werewolf in face-to-face mode: at dawn and during the day every living player has the same "Peek at my night result" button (the seer sees who they inspected, the doctor sees a successful save, everyone else sees "nothing to report").

With a moderator (host or player), Werewolf no longer moves on by itself: when everyone has acted at night, everyone has voted, or most players are ready to vote, the moderator gets a green "everyone is done" prompt with a beep, the big button glows, and players see "Waiting for the moderator…". The moderator then presses the button when ready. Without a moderator the game still moves on by itself.

### Impostor: animation and sound
Role cards flip in with a whoosh (the impostor's card pulses red with a growl and heartbeat; crew get a soft ding and see their word in big letters). Turn-order chips show who has given a clue, with a "Your turn!" banner (blip and vibration) and animated "…is thinking" dots for everyone else. New clues pop in, the vote screen has a progress bar and ✅/⏳ chips with a tick for each vote, a caught impostor triggers an alarm banner and drum roll, and the result is revealed beat by beat: votes read out one at a time, "The impostor was…", the name, the secret word, then the verdict with confetti and a win or lose jingle for your side.

Impostor result scene: when a round ends, every phone plays a full-screen reveal (tap to skip). A spotlight sweeps a dark screen with floating question marks, the detective runs in with a magnifier, a drum roll builds into "The impostor was…", the name slams in with a flash and screen shake, the secret word flips over (with who was voted out and any final guess), and the verdict lands with confetti and a win or lose jingle for your side. Reduced-motion settings skip the picture and keep the sounds.
