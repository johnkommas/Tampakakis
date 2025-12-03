document.addEventListener('DOMContentLoaded', () => {
  const rotator = document.querySelector('.hero-rotator');
  if (!rotator) return;

  const slides = Array.from(rotator.querySelectorAll('.hero-rotator__slide'));
  if (slides.length <= 1) {
    // Nothing to rotate
    if (slides[0]) slides[0].classList.add('is-active');
    return;
  }

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0;
  let timer = null;
  const INTERVAL = 5000; // ms

  const show = (n) => {
    slides.forEach((el, i) => el.classList.toggle('is-active', i === n));
  };

  const next = () => {
    index = (index + 1) % slides.length;
    show(index);
  };

  const start = () => {
    stop();
    timer = setInterval(next, INTERVAL);
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  // Pause when tab is not visible to save resources
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else if (!prefersReduced.matches) start();
  });

  // Pause rotation on hover (desktop)
  rotator.addEventListener('mouseenter', stop);
  rotator.addEventListener('mouseleave', () => { if (!prefersReduced.matches) start(); });

  // Respect reduced motion
  if (prefersReduced.matches) {
    show(0);
    return;
  }

  // Kick it off
  show(0);
  start();
});
