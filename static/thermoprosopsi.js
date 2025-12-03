(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    catalog: { areas: [], linear: [], workers: [] },
    m2: 0,
    lm: 0,
    markup: 20,
    workerDays: {}, // key -> days
  };

  const currencyFormatter = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });
  const fmtEUR = (n) => currencyFormatter.format(isFinite(n) ? Number(n) : 0);
  // Try to parse a currency string like "1.234,56 €" or "€0.00" back to a number (best-effort)
  const parseCurrency = (s) => {
    if (typeof s !== 'string') return 0;
    // remove currency symbols and spaces (incl. NBSP)
    let t = s.replace(/[€\s\u00A0]/g, '');
    // remove thousand separators (.) and normalize decimal comma to dot
    t = t.replace(/\./g, '').replace(/,/g, '.');
    const n = parseFloat(t);
    return isFinite(n) ? n : 0;
  };

  // Lightweight Count-Up animation for currency values
  const _animHandles = new WeakMap();
  function animateCurrency(el, to, opts = {}) {
    if (!el) return;
    const { duration = 800 } = opts; // ms
    const toNum = isFinite(to) ? Number(to) : 0;

    // Cancel previous animation if any
    const prev = _animHandles.get(el);
    if (prev && typeof prev.cancel === 'function') prev.cancel();

    const fromNum = parseCurrency(el.textContent || '') || 0;
    if (Math.abs(toNum - fromNum) < 0.005) { // tiny diff -> set directly
      el.textContent = fmtEUR(toNum);
      _animHandles.delete(el);
      return;
    }

    const start = performance.now();
    let rafId = 0;
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      el.classList.remove('count-anim');
    };
    _animHandles.set(el, { cancel });

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    el.classList.add('count-anim');

    const tick = (now) => {
      if (cancelled) return;
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      const val = fromNum + (toNum - fromNum) * eased;
      el.textContent = fmtEUR(val);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        el.textContent = fmtEUR(toNum);
        _animHandles.delete(el);
        // let the CSS animation finish then remove the class
        setTimeout(() => el.classList.remove('count-anim'), 80);
      }
    };
    rafId = requestAnimationFrame(tick);
  }
  const parseNum = (v) => {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    return parseFloat(String(v).replace(',', '.')) || 0;
  };

  const unitNice = (u) => {
    if (!u) return '';
    if (u === 'm2') return 'm²';
    if (u === 'day') return 'ημέρα';
    return u; // lm, etc.
  };
  const formatConsumption = (item) => {
    if (item.consumption) {
      // Convert patterns like "6 kgr per 1 m2" -> "6 kgr/m²"
      let s = String(item.consumption);
      s = s.replace(/\bunits?\b/gi, 'τεμ.');
      s = s.replace(/\bm2\b/g, 'm²');
      s = s.replace(/ per 1 /g, '/');
      // Replace 1 m²/m² -> m² and similar unit/unit forms
      s = s.replace(/^\s*1\s*(m²)\s*\/\s*1\s*(m²)\s*$/i, '$1');
      s = s.replace(/^\s*1\s*(lm)\s*\/\s*1\s*(lm)\s*$/i, '$1');
      return s;
    }
    if (item.unit) return `ανά ${unitNice(item.unit)}`;
    return '';
  };

  // UX: auto-select content when focusing/clicking inputs
  function enableAutoSelect(el) {
    if (!el) return;
    const selectAll = (e) => { try { e.target.select(); } catch(_) {} };
    const preventMouseUpClear = (e) => e.preventDefault();
    el.addEventListener('focus', selectAll);
    el.addEventListener('click', selectAll);
    el.addEventListener('mouseup', preventMouseUpClear);
    el.addEventListener('touchend', selectAll, { passive: true });
  }

  async function fetchCatalog() {
    const res = await fetch('/api/thermoprosopsi/catalog');
    if (!res.ok) throw new Error('Αποτυχία φόρτωσης καταλόγου');
    state.catalog = await res.json();
  }

  function renderLists() {
    const areasList = $('#areas-list');
    const linearList = $('#linear-list');
    const workersList = $('#workers-list');
    if (!areasList || !linearList || !workersList) return;
    areasList.innerHTML = '';
    linearList.innerHTML = '';
    workersList.innerHTML = '';

    const makePriceGroup = (item) => `
      <div class="price-stack">
        <div class="price-label">Τιμή/μον.</div>
        <div class="price-group">
          <div class="price-chip">
            <input type="number" class="price price-input" min="0" step="0.01" value="${item.latest_price}" data-original="${item.latest_price}">
            <span class="sep">|</span>
            <span class="unit">${unitNice(item.unit)}</span>
          </div>
          <button class="btn-update" hidden>Ενημέρωση</button>
        </div>
      </div>`;

    // Areas (per m2)
    state.catalog.areas.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.dataset.key = item.key;
      card.dataset.group = 'areas';
      card.innerHTML = `
        <div class="info">
          <div class="title">${item.name}</div>
          <div class="sub">${formatConsumption(item)}</div>
        </div>
        ${makePriceGroup(item)}
        <div class="card-total right">
          <div class="qty"><span class="qty-val">0.00</span> m²</div>
          <div class="cost">${fmtEUR(0)}</div>
        </div>
      `;
      areasList.appendChild(card);
    });

    // Linear (per lm)
    state.catalog.linear.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.dataset.key = item.key;
      card.dataset.group = 'linear';
      card.innerHTML = `
        <div class="info">
          <div class="title">${item.name}</div>
          <div class="sub">${formatConsumption(item) || 'ανά lm'}</div>
        </div>
        ${makePriceGroup(item)}
        <div class="card-total right">
          <div class="qty"><span class="qty-val">0.00</span> lm</div>
          <div class="cost">${fmtEUR(0)}</div>
        </div>
      `;
      linearList.appendChild(card);
    });

    // Workers
    state.catalog.workers.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.dataset.key = item.key;
      card.dataset.group = 'workers';
      const unit = unitNice(item.unit);
      card.innerHTML = `
        <div class="info">
          <div class="title">${item.name}</div>
          <div class="sub">/ημέρα</div>
        </div>
        ${makePriceGroup(item)}
        <div class="card-total right">
          <div class="qty"><span class="qty-val">0.0</span> ημ.</div>
          <div class="cost">${fmtEUR(0)}</div>
        </div>
      `;
      workersList.appendChild(card);
    });

    attachCardHandlers();
    // Enable auto-select for newly created inputs (prices)
    $$('#areas-list input.price, #linear-list input.price, #workers-list input.price').forEach(enableAutoSelect);
    recalc();
  }

  function attachCardHandlers() {
    ['#areas-list', '#linear-list', '#workers-list'].forEach(sel => {
      const list = document.querySelector(sel);
      if (!list) return;
      list.addEventListener('input', (e) => {
        if (e.target.classList.contains('price')) {
          const input = e.target;
          const card = input.closest('.item-card');
          const updateBtn = card.querySelector('.btn-update');
          const orig = parseNum(input.dataset.original);
          const now = parseNum(input.value);
          updateBtn.hidden = !(Math.abs(now - orig) > 1e-9);
          recalc();
        }
      });
      list.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-update');
        if (btn) {
          const card = btn.closest('.item-card');
          const key = card.dataset.key;
          const priceInput = card.querySelector('input.price');
          const newPrice = parseNum(priceInput.value);
          btn.disabled = true;
          try {
            await savePrice(key, newPrice);
            priceInput.dataset.original = String(newPrice.toFixed(2));
            btn.hidden = true;
          } catch (err) {
            console.error(err);
            alert('Σφάλμα ενημέρωσης τιμής.');
          } finally {
            btn.disabled = false;
          }
        }
      });
    });
  }

  async function savePrice(key, latest_price) {
    const res = await fetch('/api/thermoprosopsi/update-price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, latest_price })
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Αποτυχία αποθήκευσης: ${txt}`);
    }
    const data = await res.json();
    // Update local catalog snapshot
    const item = data.item;
    ['areas', 'linear', 'workers'].forEach(group => {
      const idx = state.catalog[group].findIndex(x => x.key === item.key);
      if (idx >= 0) state.catalog[group][idx].latest_price = item.latest_price;
    });
    recalc();
  }

  function recalc() {
    const m2 = state.m2;
    const lm = state.lm;

    let sumAreas = 0;
    $$('#areas-list .item-card').forEach(card => {
      const price = parseNum(card.querySelector('input.price').value);
      const qtyVal = card.querySelector('.qty-val');
      const costEl = card.querySelector('.cost');
      if (qtyVal) qtyVal.textContent = m2.toFixed(2);
      const cost = price * m2;
      if (costEl) costEl.textContent = fmtEUR(cost);
      sumAreas += cost;
    });

    let sumLinear = 0;
    $$('#linear-list .item-card').forEach(card => {
      const price = parseNum(card.querySelector('input.price').value);
      const qtyVal = card.querySelector('.qty-val');
      const costEl = card.querySelector('.cost');
      if (qtyVal) qtyVal.textContent = lm.toFixed(2);
      const cost = price * lm;
      if (costEl) costEl.textContent = fmtEUR(cost);
      sumLinear += cost;
    });

    let sumWorkers = 0;
    $$('#workers-list .item-card').forEach(card => {
      const price = parseNum(card.querySelector('input.price').value);
      const key = card.dataset.key;
      const days = parseNum(state.workerDays[key] ?? 0);
      const qtyVal = card.querySelector('.qty-val');
      const costEl = card.querySelector('.cost');
      if (qtyVal) qtyVal.textContent = days.toFixed(1);
      const cost = price * days;
      if (costEl) costEl.textContent = fmtEUR(cost);
      sumWorkers += cost;
    });

    const sumCost = sumAreas + sumLinear + sumWorkers;
    const markup = state.markup;
    const sell = sumCost * (1 + markup / 100);
    const gross = sell - sumCost;
    const marginPct = sell > 0 ? (gross / sell) * 100 : 0;

    $('#sumAreas').textContent = fmtEUR(sumAreas);
    $('#sumLinear').textContent = fmtEUR(sumLinear);
    $('#sumWorkers').textContent = fmtEUR(sumWorkers);
    animateCurrency($('#sumCost'), sumCost);
    $('#sumMarkup').textContent = `${markup}%`;
    animateCurrency($('#sumSell'), sell);
    $('#sumGross').textContent = `${fmtEUR(gross)} (${marginPct.toFixed(1)}%)`;
    $('#sumPerM2').textContent = m2 > 0 ? fmtEUR(sell / m2) : '—';
    $('#sumPerLm').textContent = lm > 0 ? fmtEUR(sell / Math.max(lm, 1e-9)) : '—';

    // Live header widgets
    const liveCost = $('#liveCost');
    const liveSell = $('#liveSell');
    if (liveCost) animateCurrency(liveCost, sumCost, { duration: 700 });
    if (liveSell) animateCurrency(liveSell, sell, { duration: 700 });
    const liveGrossAmt = $('#liveGrossAmt');
    const liveGrossPct = $('#liveGrossPct');
    if (liveGrossAmt) liveGrossAmt.textContent = fmtEUR(gross);
    if (liveGrossPct) liveGrossPct.textContent = `(${marginPct.toFixed(1)}%)`;
  }

  function attachInputs() {
    const m2El = $('#m2');
    const lmEl = $('#lm');
    const markupEl = $('#markup');
    const markupBubbleEl = $('#markupBubble');
    const markupZoneEl = $('#markup-zone-label');
    const daysTechnitisEl = $('#days-technitis');
    const daysVoithosEl = $('#days-voithos');

    enableAutoSelect(m2El);
    enableAutoSelect(lmEl);
    enableAutoSelect(daysTechnitisEl);
    enableAutoSelect(daysVoithosEl);

    m2El.addEventListener('input', () => { state.m2 = parseNum(m2El.value); recalc(); });
    lmEl.addEventListener('input', () => { state.lm = parseNum(lmEl.value); recalc(); });
    // Initialize worker days from top inputs
    state.workerDays['technitis'] = parseNum(daysTechnitisEl.value);
    state.workerDays['voithos'] = parseNum(daysVoithosEl.value);
    daysTechnitisEl.addEventListener('input', () => { state.workerDays['technitis'] = parseNum(daysTechnitisEl.value); recalc(); });
    daysVoithosEl.addEventListener('input', () => { state.workerDays['voithos'] = parseNum(daysVoithosEl.value); recalc(); });

    // Keep pretty slider fill in sync via CSS vars
    function updateRangeVars(range) {
      if (!range) return;
      const track = range.closest('.slider-track') || range.parentElement;
      const v = range.value;
      const min = range.min ?? '0';
      const max = range.max ?? '100';
      // set on the input
      range.style.setProperty('--val', v);
      range.style.setProperty('--min', min);
      range.style.setProperty('--max', max);
      // also set on the wrapper so ::after can consume them
      if (track) {
        track.style.setProperty('--val', v);
        track.style.setProperty('--min', min);
        track.style.setProperty('--max', max);
        // derived fill percent used by CSS width
        const fillPct = ((Number(v) - Number(min)) / (Number(max) - Number(min) || 1)) * 100;
        track.style.setProperty('--_fill', `${Math.max(0, Math.min(100, fillPct))}%`);
      }
    }

    // Enhanced UI sync: slider → bubble, zone label
    const clamp = (val, min, max) => Math.min(max, Math.max(min, Number(val) || 0));
    function updateMarkupUI() {
      if (!markupEl) return;
      const min = Number(markupEl.min || 0);
      const max = Number(markupEl.max || 100);
      let val = clamp(markupEl.value, min, max);
      val = Math.round(val);

      state.markup = val;
      markupEl.value = String(val);

      // bubble text + precise position over thumb (px-based)
      if (markupBubbleEl) {
        markupBubbleEl.textContent = `${val}%`;
        const percent = (val - min) / (max - min || 1);
        const track = markupEl.closest('.slider-track') || markupEl.parentElement;
        if (track) {
          const rect = track.getBoundingClientRect();
          const THUMB_W = 34; // must match CSS
          const effective = Math.max(0, rect.width - THUMB_W);
          let x = (THUMB_W / 2) + percent * effective;
          // clamp inside the track
          x = Math.max(THUMB_W / 2, Math.min(rect.width - THUMB_W / 2, x));
          markupBubbleEl.style.left = `${x}px`;
        } else {
          // fallback to percentage positioning
          markupBubbleEl.style.left = `${percent * 100}%`;
        }
      }

      // colored zone label text + bubble color theme
      if (markupZoneEl) {
        let text = '';
        let color = '';
        if (val <= 14) { text = 'Ζώνη: Επικίνδυνα χαμηλό περιθώριο (κόκκινο)'; color = '#ef4444'; }
        else if (val <= 30) { text = 'Ζώνη: Συντηρητικό περιθώριο (γκρι)'; color = '#9ca3af'; }
        else if (val <= 60) { text = 'Ζώνη: Ισορροπημένο περιθώριο (κίτρινο)'; color = '#f59e0b'; }
        else { text = 'Ζώνη: Ισχυρό περιθώριο (πράσινο)'; color = '#10b981'; }
        markupZoneEl.textContent = text;
        markupZoneEl.style.color = color;

        // Update bubble theme (background + text/arrow color) via CSS vars
        if (markupBubbleEl) {
          markupBubbleEl.style.setProperty('--bubble-bg', color);
          const useLightText = (color === '#ef4444' || color === '#10b981');
          const fg = useLightText ? '#ffffff' : '#0b1220';
          markupBubbleEl.style.setProperty('--bubble-fg', fg);
        }
      }

      // track fill css vars (kept for consistency; visual line is disabled in CSS)
      updateRangeVars(markupEl);

      // reflect in summary and totals
      $('#sumMarkup').textContent = `${state.markup}%`;
      recalc();
    }

    // events
    if (markupEl) markupEl.addEventListener('input', () => updateMarkupUI());

    // initial sync for bubble/zone
    updateRangeVars(markupEl);
    updateMarkupUI();

    // keep bubble aligned on resize/orientation changes
    window.addEventListener('resize', () => updateMarkupUI());
    window.addEventListener('orientationchange', () => updateMarkupUI());
  }

  async function init() {
    try {
      await fetchCatalog();
      attachInputs();
      renderLists();
    } catch (e) {
      console.error(e);
      alert('Κάτι πήγε στραβά κατά τη φόρτωση της σελίδας.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
