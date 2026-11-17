// Landing pages for the two ways to play. `npm run build:pages` writes one
// static HTML file per entry from index.html (plus sitemap.xml), and
// vite.config.js adds each file as a build input.

export const SITE_ORIGIN = 'https://pawnhub.browserpod.io';

export const PAGES = [
  {
    slug: 'play-chess-with-a-friend',
    mode: 'multiplayer',
    linkLabel: 'Play chess with a friend',
    title: 'Play Chess with a Friend Online, Free | PawnHub',
    description:
      'Play chess online with a friend: start a game, send the invite link and play in your browsers. Free, with zero sign-up. Powered by BrowserPod.',
    heading: 'Play chess with a friend online',
    copy: 'Start a game, send the invite link and play. PawnHub runs the game server in your browser tab.',
    stepsHeading: 'How to play chess with a friend',
    steps: [
      'Choose Multiplayer Online and set the clock, from 1 to 120 minutes per side.',
      'Press Launch Online Match.',
      'Send the invite link to your friend. The game starts when they open it.',
    ],
    notes: [
      'Free to play, with zero accounts and zero downloads for either player.',
      'The game server runs in the host’s browser tab through BrowserPod, so the match lasts for as long as the host keeps that tab open.',
      'Legal moves, check and the clock are enforced for both players.',
    ],
  },
  {
    slug: 'play-against-stockfish',
    mode: 'single',
    linkLabel: 'Play against Stockfish',
    title: 'Play Chess Against Stockfish Online, Free | PawnHub',
    description:
      'Play chess against the Stockfish engine in your browser. Choose your colour, the search depth and the clock. Free, with zero sign-up. Powered by BrowserPod.',
    heading: 'Play chess against Stockfish',
    copy: 'Choose your colour, the engine depth and the clock, then play. Free, with zero sign-up.',
    stepsHeading: 'How to play against Stockfish',
    steps: [
      'Choose Single Player and pick White or Black.',
      'Set the AI depth from 1 to 18. A higher depth makes a stronger opponent.',
      'Set the thinking time and the clock, then press Launch Single Player.',
    ],
    notes: [
      'Free to play, with zero accounts and zero downloads.',
      'The opponent’s moves come from the Stockfish engine through chess-api.com, so single player needs an internet connection.',
      'Depth 12 is the starting setting. Lower it for a gentler game.',
    ],
  },
];
