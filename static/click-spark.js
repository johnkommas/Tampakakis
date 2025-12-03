// Click Spark effect for non-interactive clicks across the whole page
// Vanilla JS — attaches a fixed, pointer-events:none canvas overlay to draw sparks.
(function () {
  const cfg = {
    sparkCount: 8,
    sparkSize: 10,      // base line length in CSS pixels
    sparkRadius: 15,    // how far sparks travel (CSS px)
    duration: 400,      // ms
    lineWidth: 2,       // CSS px (will be multiplied by DPR internally)
    easing: 'ease-out', // 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
    extraScale: 1.0,
  };

  const html = document.documentElement;
  let dpr = Math.max(1, window.devicePixelRatio || 1);

  // Create overlay canvas
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'click-spark-overlay';
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: '2147483647', // sit on top of content but not capture events
  });

  // Keep sparks list
  let sparks = [];
  let rafId = 0;

  function ease(t) {
    switch (cfg.easing) {
      case 'linear': return t;
      case 'ease-in': return t * t;
      case 'ease-in-out': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      default: return t * (2 - t); // ease-out
    }
  }

  function getSparkColor() {
    // Prefer the brand color from CSS variables, fallback to white on dark, black on light
    const cs = getComputedStyle(html);
    const fromVar = (cs.getPropertyValue('--brand') || '').trim();
    if (fromVar) return fromVar;
    const theme = html.getAttribute('data-theme') || 'light';
    return theme === 'dark' ? '#ffffff' : '#000000';
  }

  function resize() {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const newDpr = Math.max(1, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cssW * newDpr) || canvas.height !== Math.round(cssH * newDpr)) {
      dpr = newDpr;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
  }

  function draw(now) {
    // Clear full canvas (device pixels)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const lw = cfg.lineWidth * dpr;

    sparks = sparks.filter(spark => {
      const elapsed = now - spark.start;
      if (elapsed >= cfg.duration) return false;

      const progress = elapsed / cfg.duration;
      const eased = ease(progress);

      const distance = eased * cfg.sparkRadius * cfg.extraScale * dpr;
      const lineLength = cfg.sparkSize * (1 - eased) * dpr;

      const x1 = spark.x + distance * Math.cos(spark.angle);
      const y1 = spark.y + distance * Math.sin(spark.angle);
      const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle);
      const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle);

      ctx.strokeStyle = spark.color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      return true;
    });

    rafId = requestAnimationFrame(draw);
  }

  function isInteractive(el) {
    if (!el || el === document || el === window) return false;
    // Consider typical interactive/clickable elements
    const selector = [
      'a', 'button', 'input', 'textarea', 'select', 'summary', 'details',
      '[role="button"]', '[role="link"]', '[contenteditable="true"]', 'label'
    ].join(',');

    if (el.closest('[data-no-spark], .no-spark')) return true; // allow opting out
    if (el.closest(selector)) return true;

    // Elements with an explicit onclick handler are likely interactive
    let node = el;
    while (node && node !== document.body) {
      if (typeof node.onclick === 'function') return true;
      node = node.parentElement;
    }

    // If element (or ancestor) has tabindex >= 0, it's focusable and likely interactive
    node = el;
    while (node && node !== document.body) {
      const ti = node.getAttribute && node.getAttribute('tabindex');
      if (ti !== null && !isNaN(parseInt(ti, 10)) && parseInt(ti, 10) >= 0) return true;
      node = node.parentElement;
    }

    return false;
  }

  function onClick(e) {
    // Only standard left button clicks, ignore modified clicks
    if (e.button !== 0) return;
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

    const target = e.target;
    if (!target || isInteractive(target)) return;

    const x = e.clientX * dpr;
    const y = e.clientY * dpr;
    const now = performance.now();
    const color = getSparkColor();

    const count = cfg.sparkCount;
    for (let i = 0; i < count; i++) {
      sparks.push({
        x,
        y,
        angle: (2 * Math.PI * i) / count,
        start: now,
        color,
      });
    }
  }

  function init() {
    if (!document.body) return; // wait until body exists
    if (!canvas.parentNode) document.body.appendChild(canvas);
    resize();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(draw);
  }

  // Initialize as soon as possible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // Listeners
  window.addEventListener('resize', resize);
  // In case DPR changes (zoom/monitor move), poll on visibilitychange
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resize();
  });
  // Draw on non-interactive clicks (bubble phase is fine; we want to respect defaultPrevented by earlier handlers)
  document.addEventListener('click', onClick, false);
})();
