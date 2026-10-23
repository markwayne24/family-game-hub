// What the home screen shows for each game, so people can pick one before they create a room.
// min/max: how many players take part (max null = no limit; extra people watch in 2-player games).
// minutes: a typical game, as shown on the card. type: one of TYPES. kids: easy enough for young kids.
export const TYPES = {
  party: '🎉 Party',
  classic: '♟️ Classic',
  words: '🔤 Words & quiz',
  create: '🎨 Draw & act',
};

export const META = {
  werewolf: { pitch: 'Secret roles, night kills and day votes. Find the wolves before they find you.', min: 5, max: null, minutes: '20–40', type: 'party', kids: false },
  impostor: { pitch: 'Everyone knows the secret word except one. Give clues and catch the faker.', min: 3, max: null, minutes: '10–15', type: 'party', kids: true },
  bingo: { pitch: 'Classic number bingo with 38 win shapes, from straight lines to a Christmas tree.', min: 2, max: null, minutes: '10–20', type: 'party', kids: true },
  trivia: { pitch: '8 multiple-choice questions. Pick a pack or write your own family questions.', min: 1, max: null, minutes: '5–10', type: 'words', kids: true },
  wordrace: { pitch: 'Everyone races to guess the same 5-letter word in 6 tries.', min: 1, max: null, minutes: '3–5', type: 'words', kids: false },
  hangman: { pitch: 'Work together to guess the hidden word, one letter at a time.', min: 1, max: null, minutes: '3–5', type: 'words', kids: true },
  drawing: { pitch: 'One player draws a secret word, everyone else races to guess it.', min: 3, max: null, minutes: '10–20', type: 'create', kids: true },
  charades: { pitch: 'Act out the prompt with no words while the others shout their guesses.', min: 3, max: null, minutes: '10–20', type: 'create', kids: true },
  rps: { pitch: 'Rock, paper, scissors with everyone at once. Quick, loud and fair.', min: 2, max: null, minutes: '1–3', type: 'classic', kids: true },
  memory: { pitch: 'Take turns flipping cards to find matching pairs.', min: 1, max: null, minutes: '5–10', type: 'classic', kids: true },
  tictactoe: { pitch: 'Three in a row wins. Two play, everyone else watches.', min: 2, max: 2, minutes: '1–3', type: 'classic', kids: true },
  connect4: { pitch: 'Drop discs and line up four before your opponent. Two play, the rest watch.', min: 2, max: 2, minutes: '5–10', type: 'classic', kids: true },
};

// "2 players", "3+ players", "1–4 players"
export const playersLabel = m => m.max === m.min ? `${m.min} players` : m.max ? `${m.min}–${m.max} players` : `${m.min}+ players`;

// Can a group of `n` people all play this game?
export const fitsGroup = (m, n) => n >= m.min && (m.max == null || n <= m.max);
