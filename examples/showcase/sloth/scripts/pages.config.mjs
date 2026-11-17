// Landing pages for SLOTH. Edit this list, then run `npm run build:pages`.
export const SITE_ORIGIN = 'https://sloth.browserpod.io';

const alternativePage = ({ slug, brand, strengths }) => ({
  slug,
  brand,
  title: `${brand} Alternative: Free Slides with Surveys | SLOTH`,
  description: `SLOTH is a free ${brand} alternative for markdown slides. Share a live view by link, add surveys to your deck and keep responses as CSV on your device.`,
  heading: `A free ${brand} alternative for markdown slides`,
  lede: 'SLOTH is a free slide tool that runs in your browser. Write your deck in markdown, share a live view with your audience by link and collect survey responses during your talk.',
  fit: `SLOTH saves responses to a CSV file for you to review after the session, and you write and drive it from the keyboard. If you need ${strengths} on screen during your talk, ${brand} is the stronger choice.`,
});

export const PAGES = [
  alternativePage({
    slug: 'mentimeter-alternative',
    brand: 'Mentimeter',
    strengths: 'live result charts or word clouds',
  }),
  alternativePage({
    slug: 'slido-alternative',
    brand: 'Slido',
    strengths: 'live poll results or audience Q&A with upvoting',
  }),
];
