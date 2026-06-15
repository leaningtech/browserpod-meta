(function () {
  const starfield = document.getElementById('starfield');

  if (!starfield) return;

  function createStar() {
    const star = document.createElement('div');
    const size = Math.random() * 3 + 1;
    const duration = Math.random() * 3 + 2;
    const delay = Math.random() * 5;

    star.className = 'star';
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 75}%`;
    star.style.animationDuration = `${duration}s`;
    star.style.animationDelay = `${delay}s`;

    return star;
  }

  function renderStars() {
    const starCount = Math.max(90, Math.floor((window.innerWidth * window.innerHeight) / 14000));
    starfield.replaceChildren();

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < starCount; i += 1) {
      fragment.appendChild(createStar());
    }

    starfield.appendChild(fragment);
  }

  let resizeTimer = null;

  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(renderStars, 120);
  });

  renderStars();
})();
