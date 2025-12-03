(function () {
  const STORAGE_KEY = 'color-scheme'; // values: 'light' | 'dark' | 'auto'
  const root = document.documentElement; // <html>

  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function applyTheme(mode) {
    // mode: 'light' | 'dark' | 'auto'
    const resolved = mode === 'auto' ? (systemPrefersDark() ? 'dark' : 'light') : mode;
    root.setAttribute('data-theme', resolved === 'dark' ? 'dark' : 'light');
    // Keep the chosen mode on the root dataset for reference
    root.dataset.mode = mode;
  }

  function readStored() {
    try { return localStorage.getItem(STORAGE_KEY) || 'auto'; } catch { return 'auto'; }
  }

  function store(mode) {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
  }

  function updateControls(mode) {
    const inputs = document.querySelectorAll('.color-scheme-toggle input[type="radio"][name="color-scheme"]');
    inputs.forEach(input => { input.checked = (input.value === mode); });
  }

  // Initialize
  const initial = readStored();
  applyTheme(initial);
  updateControls(initial);

  // Listen to control changes
  const fieldset = document.querySelector('.color-scheme-toggle');
  if (fieldset) {
    fieldset.addEventListener('change', (e) => {
      const target = e.target;
      if (target && target.name === 'color-scheme') {
        const mode = target.value;
        store(mode);
        applyTheme(mode);
      }
    });
  }

  // React to system changes when in auto mode
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener ? mq.addEventListener('change', onSystemChange) : mq.addListener(onSystemChange);
    function onSystemChange() {
      if ((root.dataset.mode || 'auto') === 'auto') {
        applyTheme('auto');
      }
    }
  }
})();
