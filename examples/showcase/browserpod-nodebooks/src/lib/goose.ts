// A friendly studious goose in round spectacles, hugging a little stack of
// books — the NodeBooks mascot. Flat, cartoonish, drawn to sit on the red
// masthead. currentColor is the goose body so it can be themed if needed.
export const gooseSvg = `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A goose in glasses holding books">
  <!-- book stack -->
  <g>
    <rect x="18" y="86" width="58" height="11" rx="2" fill="#2f9c8f"/>
    <rect x="22" y="76" width="58" height="11" rx="2" fill="#e8a91d"/>
    <rect x="16" y="66" width="58" height="11" rx="2" fill="#e86a92"/>
    <rect x="24" y="56" width="52" height="11" rx="2" fill="#7b5ea7"/>
    <!-- page lines -->
    <line x1="22" y1="91.5" x2="72" y2="91.5" stroke="#ffffff" stroke-width="1.4" opacity="0.5"/>
    <line x1="26" y1="81.5" x2="76" y2="81.5" stroke="#ffffff" stroke-width="1.4" opacity="0.5"/>
    <line x1="20" y1="71.5" x2="70" y2="71.5" stroke="#ffffff" stroke-width="1.4" opacity="0.5"/>
  </g>

  <!-- goose body -->
  <path d="M70 96 C70 70 86 64 86 44 C86 22 70 12 54 12 C42 12 33 20 33 31
           C33 40 39 45 39 52 C39 60 31 64 31 76 C31 88 40 96 56 96 Z"
        fill="#ffffff" stroke="#2b2118" stroke-width="3" stroke-linejoin="round"/>

  <!-- wing holding the books -->
  <path d="M44 60 C36 64 33 74 38 84 C42 90 50 90 54 84 C49 78 49 68 54 62
           C51 59 47 59 44 60 Z"
        fill="#f3ece0" stroke="#2b2118" stroke-width="2.5" stroke-linejoin="round"/>

  <!-- beak -->
  <path d="M83 36 L99 33 L99 43 L83 44 Z" fill="#f0a020" stroke="#2b2118" stroke-width="2.5" stroke-linejoin="round"/>
  <line x1="83" y1="40" x2="98" y2="38.5" stroke="#2b2118" stroke-width="1.6"/>

  <!-- glasses -->
  <circle cx="68" cy="34" r="9" fill="#fffaf0" stroke="#2b2118" stroke-width="2.6"/>
  <circle cx="82" cy="33" r="7" fill="#fffaf0" stroke="#2b2118" stroke-width="2.6"/>
  <line x1="76.5" y1="33.6" x2="75.2" y2="33.8" stroke="#2b2118" stroke-width="2.6"/>
  <!-- eyes -->
  <circle cx="68" cy="34" r="2.6" fill="#2b2118"/>
  <circle cx="82" cy="33" r="2.2" fill="#2b2118"/>

  <!-- cheek blush -->
  <ellipse cx="62" cy="46" rx="5" ry="3" fill="#f0392b" opacity="0.18"/>
</svg>
`;
