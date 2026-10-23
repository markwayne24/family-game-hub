// Plain-language instructions shown to everyone in the room, one entry per game.
// goal: one line. steps: how a round goes. tips: optional extras.
export const HOWTO = {
  tictactoe: {
    goal: 'Get three of your marks in a row before your opponent does.',
    steps: ['The first two players take ❌ and ⭕. Everyone else watches.', 'Take turns tapping an empty square on your turn.', 'Three in a row (across, down or diagonal) wins. A full board is a draw.'],
  },
  connect4: {
    goal: 'Be the first to line up four of your discs.',
    steps: ['Two players play 🔴 and 🟡. Everyone else watches.', 'On your turn, tap a column. Your disc drops to the lowest free spot.', 'Four in a row (across, down or diagonal) wins. A full board is a draw.'],
  },
  trivia: {
    goal: 'Answer questions correctly to collect the most points.',
    steps: ['Everyone sees the same question and picks one answer.', 'When all have answered (or the host moves on) the right answer is shown.', 'Each correct answer is worth 100 points. After 8 questions the top score wins.'],
    tips: ['The host can add your own family questions on the game picker.'],
  },
  bingo: {
    goal: 'Complete the winning shape on your card before anyone else.',
    steps: ['You get a card of numbers. The host calls one number at a time with a rolling ball.', 'Called numbers on your card are marked automatically (or tap them, depending on the host\'s setting).', 'The host picks which shape(s) win, e.g. a line, four corners or a Christmas tree. The shape is shown above your card.', 'The first player to complete a shape wins. The game spots it for you and highlights the winning squares.'],
    tips: ['If you lose connection, your card stays safe for 5 minutes. Come back and you can still win.', 'If you join while a round is running, you may watch until the next one.'],
  },
  rps: {
    goal: 'Beat the other players with Rock, Paper or Scissors.',
    steps: ['Everyone secretly picks Rock 🪨, Paper 📄 or Scissors ✂️.', 'When all have picked, the choices are revealed together.', 'Rock beats Scissors, Scissors beats Paper, Paper beats Rock. You score a point for each player you beat.'],
  },
  memory: {
    goal: 'Find the most matching pairs of cards.',
    steps: ['Take turns flipping two cards.', 'If they match, you keep the pair, score a point and go again.', 'If not, they flip back and the next player goes. Remember where things are!', 'When all pairs are found, the most pairs wins.'],
  },
  drawing: {
    goal: 'Draw a secret word so others can guess it, or guess what is being drawn.',
    steps: ['Each turn one player is the drawer and sees a secret word. Only they see it.', 'The drawer draws on the canvas with finger or mouse (no letters or words!). You have about 75 seconds.', 'Everyone else types guesses. Faster correct guesses earn more points, and the drawer earns points too.', 'Each player gets a turn to draw.'],
  },
  impostor: {
    goal: 'Crew: find the impostor. Impostor: blend in without knowing the word.',
    steps: ['Everyone but one player (the impostor) sees the same secret word. The impostor only sees the category.', 'In turn, each player gives a one-word clue related to the word. Don\'t make it too obvious!', 'Then everyone discusses and votes for who they think the impostor is.', 'If the impostor is caught, they get one last chance to guess the word. Otherwise the impostor wins.'],
    tips: ['Needs at least 3 players.', 'Before the game starts the host picks which categories the secret words come from (or everything). They can change it between rounds.'],
  },
  hangman: {
    goal: 'Work together to guess the hidden word before the drawing is complete.',
    steps: ['Everyone shares the same word. The category is shown.', 'Anyone can tap a letter. Right letters appear and score points.', 'Wrong letters draw a piece of the hangman. After 6 misses the round is lost.'],
  },
  wordrace: {
    goal: 'Guess the 5-letter word in 6 tries, faster than the others.',
    steps: ['Everyone is guessing the same secret 5-letter word at the same time.', 'Type a word and submit. 🟩 = right letter in the right spot, 🟨 = in the word but wrong spot, ⬜ = not in the word.', 'You see everyone\'s colours (not their letters), so you can race them.', 'Earlier solves and fewer tries score more points.'],
  },
  charades: {
    goal: 'Act out a prompt without speaking so others guess it.',
    steps: ['One player at a time is the actor and sees a secret prompt, like "swimming" or "riding a jeepney".', 'Act it out with no talking and no pointing at objects! Everyone else shouts guesses out loud.', 'When someone guesses it, the actor taps their name. Both get points.', 'Stuck? The actor can pass for a new prompt (no points). The turn ends after 60 seconds.'],
  },
  werewolf: {
    goal: 'Village: find and vote out all werewolves. Werewolves: eat villagers until you equal their number.',
    steps: [
      'Everyone gets a secret role. Tap "see my role" and keep your screen private. Needs 5+ players.',
      '🌙 Night: everyone "closes their eyes". Werewolves 🐺 pick a victim together, the Seer 🔮 checks if one player is a werewolf, the Doctor 🩺 protects one player (not the same person two nights in a row). Everyone else just waits.',
      '☀️ Morning: see who was killed (if the Doctor guessed right, nobody dies).',
      '🗣️ Day: discuss out loud who seems suspicious. When most people tap "ready", the vote begins.',
      '🗳️ Vote: everyone alive votes. The most-voted player is out. A tie means nobody goes. Then night comes again.',
      'The Hunter 🏹 (if used) takes one last shot when they die. The game ends when all wolves are out (village wins) or wolves equal the villagers (wolves win).',
      'Optional roles: 🛡️ Bodyguard (guard someone, and die in their place if the wolves attack them), 🧙‍♀️ Witch (one heal potion and one poison for the whole game), 💘 Cupid (picks two lovers on night one; if one dies, so does the other, and if they are the last two on opposite sides they win together), 🎭 Tanner (wins alone if the village votes them out).',
    ],
    tips: ['With a moderator, the game does not move on by itself. The moderator gets a green "everyone is done" prompt (with a beep) when everyone has acted, voted or is ready, and presses the big button to continue.', 'The moderator (or host) can pause the game for a break. If someone goes offline, the host can wait, let the app play for them, or remove them.', 'At the end you get a night-by-night recap of what everyone did.', 'The host can switch on open voting (see votes live) and a runoff vote when there is a tie.', 'The host chooses who runs the game: no moderator (timers), the host, or another player.', 'Playing in the same room? The host can turn on Face-to-face mode: at night everyone gets the same screen and must pick a player (only the right picks count), so nobody can tell who the wolves are. Skip the night and you can\'t vote the next day.',
      'If you are out, stay quiet and don\'t give hints!'],
  },
};
