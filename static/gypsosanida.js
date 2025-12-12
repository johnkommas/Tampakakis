(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    catalog: { areas: [], linear: [], pieces: [], workers: [] },
    m2: 0,
    lm: 0,
    sheetsGyps: 0, // manual sheets count for Γυψοσανίδα (ceil)
    sheetsIno: 0,  // manual sheets count for Ινοσανίδα (ceil)
    sheetsAnth: 0, // manual sheets count for Ανθυγρή (ceil)
    strotiras: 0, // manual pieces count (ceil)
    orthostatis: 0, // manual pieces count (ceil)
    lengthOpt: '500', // '500' | '750' | '1000'
    markup: 20,
    workerDays: {}, // key -> days
    extras: [], // { id, desc, unit, qty, price, autoQty }
  };

  const currencyFormatter = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });
  const fmtEUR = (n) => currencyFormatter.format(isFinite(n) ? Number(n) : 0);
  const parseCurrency = (s) => {
    if (typeof s !== 'string') return 0;
    let t = s.replace(/[€\s\u00A0]/g, '');
    t = t.replace(/\./g, '').replace(/,/g, '.');
    const n = parseFloat(t);
    return isFinite(n) ? n : 0;
  };

  const _animHandles = new WeakMap();
  function animateCurrency(el, to, opts = {}) {
    if (!el) return;
    const { duration = 800 } = opts; // ms
    const toNum = isFinite(to) ? Number(to) : 0;
    const prev = _animHandles.get(el);
    if (prev && typeof prev.cancel === 'function') prev.cancel();
    const fromNum = parseCurrency(el.textContent || '') || 0;
    if (Math.abs(toNum - fromNum) < 0.005) {
      el.textContent = fmtEUR(toNum);
      _animHandles.delete(el);
      return;
    }
    const start = performance.now();
    let rafId = 0;
    let cancelled = false;
    const cancel = () => { cancelled = true; if (rafId) cancelAnimationFrame(rafId); el.classList.remove('count-anim'); };
    _animHandles.set(el, { cancel });
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    el.classList.add('count-anim');
    const tick = (now) => {
      if (cancelled) return;
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      el.textContent = fmtEUR(fromNum + (toNum - fromNum) * eased);
      if (t < 1) rafId = requestAnimationFrame(tick);
      else { el.textContent = fmtEUR(toNum); _animHandles.delete(el); setTimeout(() => el.classList.remove('count-anim'), 80); }
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
    if (u === 'lm') return 'lm';
    if (u === 'm3') return 'm³';
    if (u === 'day') return 'ημέρα';
    if (u === 'unit' || u === 'units') return 'τεμ.';
    if (u === 'sheet') return 'φύλλο';
    return u;
  };
  const isPieceUnit = (u) => {
    const x = String(u || '').toLowerCase();
    return ['unit', 'units', 'sheet', 'τεμ', 'τεμάχιο', 'τεμάχια'].includes(x);
  };

  const formatConsumption = (item) => {
    if (item.consumption) {
      let s = String(item.consumption);
      s = s.replace(/\bunits?\b/gi, 'τεμ.');
      s = s.replace(/\bm2\b/g, 'm²');
      s = s.replace(/\bm3\b/g, 'm³');
      s = s.replace(/\bsheet\b/gi, 'φύλλο');
      s = s.replace(/ per 1 /g, '/');
      return s;
    }
    if (item.unit) return `ανά ${unitNice(item.unit)}`;
    return '';
  };

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
    const res = await fetch('/api/gypsosanida/catalog');
    if (!res.ok) throw new Error('Αποτυχία φόρτωσης καταλόγου');
    state.catalog = await res.json();
  }

  // ---------- Extras (Επιπρόσθετα) ----------
  const UNIT_OPTIONS = [
    { value: 'm2', label: 'Τετραγωνικά Μέτρα (m²)' },
    { value: 'm3', label: 'Κυβικά Μέτρα (m³)' },
    { value: 'lm', label: 'Τρεχόμετρο (lm)' },
    { value: 'day', label: 'Ημέρα' },
    { value: 'unit', label: 'Τεμάχια' },
  ];

  // Units that have an automatic source on this page (Γυψοσανίδα)
  function supportsAutoUnit(unit) {
    return unit === 'm2' || unit === 'lm' || unit === 'day';
  }

  function createExtra(desc = '', unit = 'unit', qty = 0, price = 0, autoQty = true, key = null) {
    return {
      id: Math.random().toString(36).slice(2),
      desc,
      unit,
      qty: Number(qty) || 0,
      price: Number(price) || 0,
      autoQty: !!autoQty,
      key: key || null,
    };
  }

  function unitAutoQtyValue(unit) {
    switch (unit) {
      case 'm2': return state.m2 || 0;
      case 'lm': return state.lm || 0;
      case 'day': {
        let total = 0; for (const k in state.workerDays) total += Number(state.workerDays[k] || 0); return total;
      }
      default:
        return 0; // m3, unit
    }
  }

  function renderExtras() {
    const wrap = document.getElementById('extras-list');
    if (!wrap) return;
    wrap.innerHTML = '';
    state.extras.forEach(ex => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.dataset.id = ex.id;
      if (ex.key) card.dataset.key = ex.key;
      const opts = UNIT_OPTIONS.map(o => `<option value="${o.value}" ${ex.unit===o.value?'selected':''}>${o.label}</option>`).join('');
      const canAuto = supportsAutoUnit(ex.unit);
      const effectiveAuto = canAuto && !!ex.autoQty;
      const qtyVal = effectiveAuto ? unitAutoQtyValue(ex.unit) : ex.qty;
      const cost = (Number(ex.price)||0) * (Number(qtyVal)||0);
      card.innerHTML = `
        <div class="info">
          <div class="title"><input type="text" class="extra-desc" value="${ex.desc}" placeholder="Περιγραφή"></div>
        </div>
        <div class="price-stack">
          <div class="price-label">Τιμή/μον.</div>
          <div class="price-group">
            <div class="price-chip">
              <input type="number" class="price extra-price" min="0" step="0.01" value="${ex.price}" ${ex.key ? `data-original="${Number(ex.price).toFixed(2)}"` : ''}>
              <span class="sep">|</span>
              <span class="unit">€/${unitNice(ex.unit)}</span>
            </div>
            ${ex.key ? '<button class="btn-update" hidden>Ενημέρωση</button>' : ''}
          </div>
        </div>
        <div class="card-total right">
          <div class="qty">
            <select class="extra-unit">${opts}</select>
            <span class="sep">|</span>
            <input type="number" class="extra-qty" min="0" step="0.01" value="${Number(qtyVal).toFixed(2)}" ${effectiveAuto ? 'disabled' : ''}>
            <label style="display:inline-flex;align-items:center;gap:6px;margin-left:6px;font-size:12px;">
              <input type="checkbox" class="extra-auto" ${effectiveAuto ? 'checked' : ''} ${canAuto ? '' : 'disabled'}> αυτόματα
            </label>
          </div>
          <div class="qty-help" hidden>Απαιτείται ποσότητα</div>
          <div class="cost">${fmtEUR(cost)}</div>
          <button type="button" class="btn-remove" title="Διαγραφή">−</button>
        </div>
      `;
      wrap.appendChild(card);
    });

    // Enable select-all on numeric inputs (price/qty)
    wrap.querySelectorAll('input.extra-price, input.extra-qty').forEach(enableAutoSelect);
    if (!wrap.dataset.bound) {
      wrap.addEventListener('input', onExtrasInput);
      wrap.addEventListener('change', onExtrasChange);
      wrap.addEventListener('click', onExtrasClick);
      wrap.dataset.bound = '1';
    }
  }

  function onExtrasInput(e) {
    const card = e.target.closest('.item-card');
    if (!card) return;
    const id = card.dataset.id;
    const ex = state.extras.find(x => x.id === id);
    if (!ex) return;
    if (e.target.classList.contains('extra-desc')) ex.desc = e.target.value;
    else if (e.target.classList.contains('extra-price')) {
      ex.price = parseNum(e.target.value);
      if (ex.key) {
        const btn = card.querySelector('.btn-update');
        const orig = parseNum(e.target.dataset.original);
        const now = parseNum(e.target.value);
        if (btn) btn.hidden = !(Math.abs(now - orig) > 0.0001);
      }
    }
    else if (e.target.classList.contains('extra-qty')) ex.qty = parseNum(e.target.value);
    recalc();
  }

  function onExtrasChange(e) {
    const card = e.target.closest('.item-card');
    if (!card) return;
    const id = card.dataset.id;
    const ex = state.extras.find(x => x.id === id);
    if (!ex) return;
    if (e.target.classList.contains('extra-unit')) {
      ex.unit = e.target.value;
      const canAuto = supportsAutoUnit(ex.unit);
      const autoCb = card.querySelector('.extra-auto');
      const qtyInput = card.querySelector('.extra-qty');
      if (autoCb) {
        autoCb.disabled = !canAuto;
        autoCb.checked = !!canAuto;
        ex.autoQty = !!canAuto;
      }
      if (qtyInput) {
        if (canAuto) { qtyInput.value = unitAutoQtyValue(ex.unit).toFixed(2); qtyInput.disabled = true; }
        else { qtyInput.disabled = false; }
      }
      const unitSpan = card.querySelector('.price-chip .unit');
      if (unitSpan) unitSpan.textContent = '€/' + unitNice(ex.unit);
    } else if (e.target.classList.contains('extra-auto')) {
      const canAuto = supportsAutoUnit(ex.unit);
      const checked = canAuto && e.target.checked;
      e.target.checked = checked;
      ex.autoQty = checked;
      const q = card.querySelector('.extra-qty');
      if (q) {
        if (checked) { q.value = unitAutoQtyValue(ex.unit).toFixed(2); q.disabled = true; }
        else { q.disabled = false; }
      }
    }
    recalc();
  }

  function onExtrasClick(e) {
    if (e.target.classList.contains('btn-remove')) {
      const card = e.target.closest('.item-card');
      const id = card?.dataset.id; if (!id) return;
      state.extras = state.extras.filter(x => x.id !== id);
      renderExtras();
      recalc();
    } else {
      const btn = e.target.closest('.btn-update');
      if (btn) {
        const card = btn.closest('.item-card');
        const key = card?.dataset.key;
        if (!key) return;
        const priceInput = card.querySelector('input.extra-price');
        const newPrice = parseNum(priceInput.value);
        btn.disabled = true;
        (async () => {
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
        })();
      }
    }
  }

  function addExtraRow(prefill) { state.extras.push(prefill || createExtra('', 'unit', 0, 0, true)); renderExtras(); recalc(); }

  function makePriceGroup(item) {
    return `
      <div class="price-stack">
        <div class="price-label">Τιμή/μον.</div>
        <div class="price-group">
          <div class="price-chip">
            <input type="number" class="price price-input" min="0" step="0.01" value="${item.latest_price}" data-original="${item.latest_price}">
            <span class="sep">|</span>
            <span class="unit">€/${unitNice(item.unit)}</span>
          </div>
          <button class="btn-update" hidden>Ενημέρωση</button>
        </div>
      </div>`;
  }

  function renderAreasList() {
    const list = $('#areas-list');
    if (!list) return;
    list.innerHTML = '';
    state.catalog.areas.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.dataset.key = item.key;
      card.dataset.group = 'areas';
      card.dataset.unit = item.unit;
      card.innerHTML = `
        <div class="info">
          <div class="title">${item.name}</div>
          <div class="sub">${formatConsumption(item)}</div>
        </div>
        ${makePriceGroup(item)}
        <div class="card-total right">
          <div class="qty"><span class="qty-val">0.00</span> m²</div>
          <div class="cost">${fmtEUR(0)}</div>
        </div>`;
      list.appendChild(card);
    });
  }

  function renderLinearList() {
    const list = $('#linear-list');
    if (!list) return;
    list.innerHTML = '';
    state.catalog.linear.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.dataset.key = item.key;
      card.dataset.group = 'linear';
      card.dataset.unit = item.unit;
      if (item.consumption) card.dataset.consumption = item.consumption;
      const sub = formatConsumption(item) || 'ανά lm';
      card.innerHTML = `
        <div class="info">
          <div class="title">${item.name}</div>
          <div class="sub">${sub}</div>
        </div>
        ${makePriceGroup(item)}
        <div class="card-total right">
          <div class="qty"><span class="qty-val">0.00</span> <span class="qty-unit">lm</span></div>
          <div class="cost">${fmtEUR(0)}</div>
        </div>`;
      list.appendChild(card);
    });
  }

  function getPieceItemByKey(key) {
    return state.catalog.pieces.find(x => x.key === key);
  }

  function renderPiecesList() {
    const list = $('#pieces-list');
    if (!list) return;
    list.innerHTML = '';

    // Render all three sheet types simultaneously
    ['sheet_gyps', 'sheet_ino', 'sheet_anthygri'].forEach((key) => {
      const sheetItem = getPieceItemByKey(key);
      if (!sheetItem) return;
      const card = document.createElement('div');
      card.className = 'item-card';
      card.dataset.key = sheetItem.key;
      card.dataset.group = 'pieces';
      card.dataset.unit = sheetItem.unit;
      if (sheetItem.consumption) card.dataset.consumption = sheetItem.consumption; // 3 τεμ/φύλλο (informative)
      card.innerHTML = `
        <div class="info">
          <div class="title">${sheetItem.name}</div>
          <div class="sub">${formatConsumption(sheetItem)}</div>
        </div>
        ${makePriceGroup(sheetItem)}
        <div class="card-total right">
          <div class="qty"><span class="qty-val">0</span> <span class="qty-unit">φύλλα</span></div>
          <div class="cost">${fmtEUR(0)}</div>
        </div>`;
      list.appendChild(card);
    });

    // Selected length for Στρωτήρας/Ορθοστάτης
    const len = state.lengthOpt;
    const strotKey = `strotiras_${len}`;
    const orthoKey = `orthostatis_${len}`;
    const strotItem = getPieceItemByKey(strotKey);
    const orthoItem = getPieceItemByKey(orthoKey);

    if (strotItem) {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.dataset.key = strotItem.key;
      card.dataset.group = 'pieces';
      card.dataset.unit = strotItem.unit;
      card.innerHTML = `
        <div class="info">
          <div class="title">${strotItem.name}</div>
          <div class="sub">τιμή ανά τεμ.</div>
        </div>
        ${makePriceGroup(strotItem)}
        <div class="card-total right">
          <div class="qty"><span class="qty-val">0</span> τεμ.</div>
          <div class="cost">${fmtEUR(0)}</div>
        </div>`;
      list.appendChild(card);
    }

    if (orthoItem) {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.dataset.key = orthoItem.key;
      card.dataset.group = 'pieces';
      card.dataset.unit = orthoItem.unit;
      card.innerHTML = `
        <div class="info">
          <div class="title">${orthoItem.name}</div>
          <div class="sub">τιμή ανά τεμ.</div>
        </div>
        ${makePriceGroup(orthoItem)}
        <div class="card-total right">
          <div class="qty"><span class="qty-val">0</span> τεμ.</div>
          <div class="cost">${fmtEUR(0)}</div>
        </div>`;
      list.appendChild(card);
    }

    attachCardHandlers(list);
    $$('#pieces-list input.price').forEach(enableAutoSelect);
  }

  function attachCardHandlers(rootEl) {
    const roots = rootEl ? [rootEl] : ['#areas-list', '#linear-list', '#pieces-list', '#workers-list'].map(sel => $(sel)).filter(Boolean);
    roots.forEach(list => {
      list.addEventListener('input', (ev) => {
        const t = ev.target;
        if (!(t instanceof HTMLInputElement)) return;
        if (!t.classList.contains('price')) return;
        const card = t.closest('.item-card');
        if (!card) return;
        const original = parseNum(t.dataset.original);
        const now = parseNum(t.value);
        const btn = card.querySelector('.btn-update');
        btn.hidden = !(Math.abs(now - original) > 0.0001);
        recalc();
      });
      list.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('.btn-update');
        if (!btn) return;
        const card = btn.closest('.item-card');
        const priceInput = card.querySelector('input.price');
        const key = card.dataset.key;
        const newPrice = parseNum(priceInput.value);
        if (newPrice > 0) {
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
    const res = await fetch('/api/gypsosanida/update-price', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, latest_price })
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Αποτυχία αποθήκευσης: ${txt}`);
    }
    const data = await res.json();
    const item = data.item;
    ['areas', 'linear', 'pieces', 'workers', 'extras'].forEach(group => {
      const idx = state.catalog[group].findIndex(x => x.key === item.key);
      if (idx >= 0) state.catalog[group][idx].latest_price = item.latest_price;
    });
    recalc();
  }

  function parseConsumption(cons) {
    if (!cons) return null;
    const m = String(cons).trim().match(/^(\d+(?:\.\d+)?)\s+(\w+)\s+per\s+(\d+(?:\.\d+)?)\s+(m2|m3|lm|sheet)$/i);
    if (!m) return null;
    const num = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    const den = parseFloat(m[3]);
    const base = m[4].toLowerCase();
    return { perQty: num, perUnit: unit, baseQty: den, baseUnit: base };
  }

  function calcQtyFromConsumption(consObj, baseAmount) {
    if (!consObj) return { qty: baseAmount, unit: null, rounded: false };
    const factor = consObj.perQty / consObj.baseQty; // quantity per 1 base unit
    let qty = baseAmount * factor;
    const rounded = isPieceUnit(consObj.perUnit);
    if (rounded) qty = Math.ceil(qty - 1e-9);
    return { qty, unit: consObj.perUnit, rounded };
  }

  function recalc() {
    const m2 = state.m2;
    const lm = state.lm;
    const sheetsGyps = Math.ceil(parseNum(state.sheetsGyps));
    const sheetsIno = Math.ceil(parseNum(state.sheetsIno));
    const sheetsAnth = Math.ceil(parseNum(state.sheetsAnth));
    const strot = Math.ceil(parseNum(state.strotiras));
    const ortho = Math.ceil(parseNum(state.orthostatis));

    // Areas
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

    // Linear
    let sumLinear = 0;
    $$('#linear-list .item-card').forEach(card => {
      const price = parseNum(card.querySelector('input.price').value);
      const unit = card.dataset.unit || '';
      const cons = parseConsumption(card.dataset.consumption || '');
      const qtyVal = card.querySelector('.qty-val');
      const qtyUnitEl = card.querySelector('.qty-unit');
      const costEl = card.querySelector('.cost');
      let qty = 0;
      let shownUnit = unitNice(unit);
      if (cons) {
        const r = calcQtyFromConsumption(cons, lm);
        qty = r.qty;
        shownUnit = unitNice(r.unit || unit);
      } else {
        qty = lm;
        shownUnit = 'lm';
      }
      if (qtyVal) qtyVal.textContent = isPieceUnit(unit) ? String(Math.round(qty)) : qty.toFixed(2);
      if (qtyUnitEl) qtyUnitEl.textContent = shownUnit;
      const cost = price * qty;
      if (costEl) costEl.textContent = fmtEUR(cost);
      sumLinear += cost;
    });

    // Pieces (sheet types + strotiras + orthostatis)
    let sumPieces = 0;
    const sheetPairs = [
      ['sheet_gyps', sheetsGyps],
      ['sheet_ino', sheetsIno],
      ['sheet_anthygri', sheetsAnth],
    ];
    sheetPairs.forEach(([key, qty]) => {
      const card = document.querySelector(`#pieces-list .item-card[data-key="${key}"]`);
      if (!card) return;
      const price = parseNum(card.querySelector('input.price').value);
      const qtyVal = card.querySelector('.qty-val');
      const costEl = card.querySelector('.cost');
      if (qtyVal) qtyVal.textContent = String(qty);
      const cost = price * qty; // price per sheet
      if (costEl) costEl.textContent = fmtEUR(cost);
      sumPieces += cost;
    });
    const strotCard = $('#pieces-list .item-card[data-key^="strotiras_"]');
    if (strotCard) {
      const price = parseNum(strotCard.querySelector('input.price').value);
      const qtyVal = strotCard.querySelector('.qty-val');
      const costEl = strotCard.querySelector('.cost');
      if (qtyVal) qtyVal.textContent = String(strot);
      const cost = price * strot;
      if (costEl) costEl.textContent = fmtEUR(cost);
      sumPieces += cost;
    }
    const orthoCard = $('#pieces-list .item-card[data-key^="orthostatis_"]');
    if (orthoCard) {
      const price = parseNum(orthoCard.querySelector('input.price').value);
      const qtyVal = orthoCard.querySelector('.qty-val');
      const costEl = orthoCard.querySelector('.cost');
      if (qtyVal) qtyVal.textContent = String(ortho);
      const cost = price * ortho;
      if (costEl) costEl.textContent = fmtEUR(cost);
      sumPieces += cost;
    }

    // Workers
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

    // Extras
    let sumExtras = 0;
    $$('#extras-list .item-card').forEach(card => {
      const price = parseNum(card.querySelector('input.extra-price').value);
      const unitSel = card.querySelector('select.extra-unit');
      const autoCb = card.querySelector('input.extra-auto');
      const qtyInput = card.querySelector('input.extra-qty');
      let qty = 0;
      const unit = unitSel?.value;
      if (autoCb && autoCb.checked && supportsAutoUnit(unit)) {
        qty = unitAutoQtyValue(unit);
        if (qtyInput) qtyInput.value = Number(qty).toFixed(2);
      } else {
        qty = parseNum(qtyInput?.value);
      }
      const costEl = card.querySelector('.cost');
      const cost = price * qty;
      if (costEl) costEl.textContent = fmtEUR(cost);
      const help = card.querySelector('.qty-help');
      if (qtyInput && qty <= 0) {
        qtyInput.classList.add('qty--invalid');
        card.classList.add('has-zero-qty');
        if (help) help.hidden = false;
      } else {
        if (qtyInput) qtyInput.classList.remove('qty--invalid');
        card.classList.remove('has-zero-qty');
        if (help) help.hidden = true;
      }
      sumExtras += cost;
    });

    const sumCost = sumAreas + sumLinear + sumPieces + sumWorkers + sumExtras;
    const markup = state.markup;
    const sell = sumCost * (1 + markup / 100);
    const gross = sell - sumCost;
    const marginPct = sell > 0 ? (gross / sell) * 100 : 0;

    $('#sumAreas').textContent = fmtEUR(sumAreas);
    $('#sumLinear').textContent = fmtEUR(sumLinear);
    $('#sumPieces').textContent = fmtEUR(sumPieces);
    const sumExtrasEl = $('#sumExtras'); if (sumExtrasEl) sumExtrasEl.textContent = fmtEUR(sumExtras);
    $('#sumWorkers').textContent = fmtEUR(sumWorkers);
    animateCurrency($('#sumCost'), sumCost);
    $('#sumMarkup').textContent = `${markup}%`;
    animateCurrency($('#sumSell'), sell);
    const sumGrossAmtEl = $('#sumGrossAmt');
    const sumGrossPctEl = $('#sumGrossPct');
    if (sumGrossAmtEl) animateCurrency(sumGrossAmtEl, gross);
    if (sumGrossPctEl) sumGrossPctEl.textContent = `(${marginPct.toFixed(1)}%)`;
    $('#sumPerM2').textContent = m2 > 0 ? fmtEUR(sell / Math.max(m2, 1e-9)) : '—';
    $('#sumPerLm').textContent = lm > 0 ? fmtEUR(sell / Math.max(lm, 1e-9)) : '—';

    const liveCost = $('#liveCost');
    const liveSell = $('#liveSell');
    if (liveCost) animateCurrency(liveCost, sumCost, { duration: 700 });
    if (liveSell) animateCurrency(liveSell, sell, { duration: 700 });
    const liveGrossAmt = $('#liveGrossAmt');
    const liveGrossPct = $('#liveGrossPct');
    if (liveGrossAmt) animateCurrency(liveGrossAmt, gross, { duration: 700 });
    if (liveGrossPct) liveGrossPct.textContent = `(${marginPct.toFixed(1)}%)`;
  }

  function renderWorkersList() {
    const list = $('#workers-list');
    if (!list) return;
    list.innerHTML = '';
    state.catalog.workers.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.dataset.key = item.key;
      card.dataset.group = 'workers';
      card.dataset.unit = item.unit;
      card.innerHTML = `
        <div class="info">
          <div class="title">${item.name}</div>
          <div class="sub">/ημέρα</div>
        </div>
        ${makePriceGroup(item)}
        <div class="card-total right">
          <div class="qty"><span class="qty-val">0.0</span> ημ.</div>
          <div class="cost">${fmtEUR(0)}</div>
        </div>`;
      list.appendChild(card);
    });
  }

  function renderAllLists() {
    renderAreasList();
    renderLinearList();
    renderPiecesList();
    renderWorkersList();
    attachCardHandlers();
    $$('#areas-list input.price, #linear-list input.price, #workers-list input.price').forEach(enableAutoSelect);
    recalc();
  }

  function attachInputs() {
    const m2El = $('#m2');
    const lmEl = $('#lm');
    const markupEl = $('#markup');
    const markupBubbleEl = $('#markupBubble');
    const markupZoneEl = $('#markup-zone-label');
    const daysTechnitisEl = $('#days-technitis');
    const daysVoithosEl = $('#days-voithos');
    const sheetsGypsEl = $('#sheetsGyps');
    const sheetsInoEl = $('#sheetsIno');
    const sheetsAnthEl = $('#sheetsAnth');
    const strotEl = $('#strotirasCount');
    const orthoEl = $('#orthostatisCount');
    const lengthRadioGroup = $('#lengthGroup');

    enableAutoSelect(m2El); enableAutoSelect(lmEl);
    enableAutoSelect(daysTechnitisEl); enableAutoSelect(daysVoithosEl);
    enableAutoSelect(sheetsGypsEl); enableAutoSelect(sheetsInoEl); enableAutoSelect(sheetsAnthEl);
    enableAutoSelect(strotEl); enableAutoSelect(orthoEl);

    m2El.addEventListener('input', () => { state.m2 = parseNum(m2El.value); recalc(); });
    lmEl.addEventListener('input', () => { state.lm = parseNum(lmEl.value); recalc(); });
    state.workerDays['technitis'] = parseNum(daysTechnitisEl.value);
    state.workerDays['voithos'] = parseNum(daysVoithosEl.value);
    daysTechnitisEl.addEventListener('input', () => { state.workerDays['technitis'] = parseNum(daysTechnitisEl.value); recalc(); });
    daysVoithosEl.addEventListener('input', () => { state.workerDays['voithos'] = parseNum(daysVoithosEl.value); recalc(); });

    if (sheetsGypsEl) sheetsGypsEl.addEventListener('input', () => { state.sheetsGyps = parseNum(sheetsGypsEl.value); recalc(); });
    if (sheetsInoEl) sheetsInoEl.addEventListener('input', () => { state.sheetsIno = parseNum(sheetsInoEl.value); recalc(); });
    if (sheetsAnthEl) sheetsAnthEl.addEventListener('input', () => { state.sheetsAnth = parseNum(sheetsAnthEl.value); recalc(); });
    strotEl.addEventListener('input', () => { state.strotiras = parseNum(strotEl.value); recalc(); });
    orthoEl.addEventListener('input', () => { state.orthostatis = parseNum(orthoEl.value); recalc(); });

    // Default radio selections if none checked (to keep indicator sane)
    if (!lengthRadioGroup.querySelector('input[name="lengthOpt"]:checked')) {
      const def = lengthRadioGroup.querySelector('input[value="500"]');
      if (def) def.checked = true;
    }
    lengthRadioGroup.addEventListener('change', (e) => {
      const inp = e.target.closest('input[type="radio"][name="lengthOpt"]');
      if (!inp) return;
      state.lengthOpt = inp.value;
      renderPiecesList();
      recalc();
    });

    // Keep pretty slider fill in sync via CSS vars
    function updateRangeVars(range) {
      if (!range) return;
      const track = range.closest('.slider-track') || range.parentElement;
      const v = range.value;
      const min = range.min ?? '0';
      const max = range.max ?? '100';
      range.style.setProperty('--val', v);
      range.style.setProperty('--min', min);
      range.style.setProperty('--max', max);
      if (track) {
        track.style.setProperty('--val', v);
        track.style.setProperty('--min', min);
        track.style.setProperty('--max', max);
        const fillPct = ((Number(v) - Number(min)) / (Number(max) - Number(min) || 1)) * 100;
        track.style.setProperty('--_fill', `${Math.max(0, Math.min(100, fillPct))}%`);
      }
    }

    const clamp = (val, min, max) => Math.min(max, Math.max(min, Number(val) || 0));
    function updateMarkupUI() {
      if (!markupEl) return;
      const min = Number(markupEl.min || 0);
      const max = Number(markupEl.max || 100);
      let val = clamp(markupEl.value, min, max);
      val = Math.round(val);

      state.markup = val;
      markupEl.value = String(val);

      if (markupBubbleEl) {
        markupBubbleEl.textContent = `${val}%`;
        const percent = (val - min) / (max - min || 1);
        const track = markupEl.closest('.slider-track') || markupEl.parentElement;
        if (track) {
          const rect = track.getBoundingClientRect();
          const THUMB_W = 34;
          const effective = Math.max(0, rect.width - THUMB_W);
          let x = (THUMB_W / 2) + percent * effective;
          x = Math.max(THUMB_W / 2, Math.min(rect.width - THUMB_W / 2, x));
          markupBubbleEl.style.left = `${x}px`;
        } else {
          markupBubbleEl.style.left = `${percent * 100}%`;
        }
      }

      if (markupZoneEl) {
        let text = '';
        let color = '';
        if (val <= 14) { text = 'Ζώνη: Επικίνδυνα χαμηλό περιθώριο (κόκκινο)'; color = '#ef4444'; }
        else if (val <= 30) { text = 'Ζώνη: Συντηρητικό περιθώριο (γκρι)'; color = '#9ca3af'; }
        else if (val <= 60) { text = 'Ζώνη: Ισορροπημένο περιθώριο (κίτρινο)'; color = '#f59e0b'; }
        else { text = 'Ζώνη: Ισχυρό περιθώριο (πράσινο)'; color = '#10b981'; }
        markupZoneEl.textContent = text;
        markupZoneEl.style.color = color;
        if (markupBubbleEl) {
          markupBubbleEl.style.setProperty('--bubble-bg', color);
          const useLightText = (color === '#ef4444' || color === '#10b981');
          const fg = useLightText ? '#ffffff' : '#0b1220';
          markupBubbleEl.style.setProperty('--bubble-fg', fg);
        }
      }

      updateRangeVars(markupEl);
      $('#sumMarkup').textContent = `${state.markup}%`;
      recalc();
    }

    if (markupEl) markupEl.addEventListener('input', () => updateMarkupUI());
    updateRangeVars(markupEl);
    updateMarkupUI();
    window.addEventListener('resize', () => updateMarkupUI());
    window.addEventListener('orientationchange', () => updateMarkupUI());
  }

  function renderHeaderDefaults() {
    // Ensure radio defaults reflect state for length only
    const lenInp = document.querySelector(`#lengthGroup input[value="${state.lengthOpt}"]`);
    if (lenInp) lenInp.checked = true;
  }

  async function init() {
    try {
      await fetchCatalog();
      renderAreasList();
      renderLinearList();
      renderPiecesList();
      renderWorkersList();
      attachCardHandlers();
      attachInputs();
      renderHeaderDefaults();
      // Extras UI and defaults
      const addBtn = document.getElementById('add-extra');
      if (addBtn) addBtn.addEventListener('click', () => addExtraRow());
      if (Array.isArray(state.catalog.extras) && state.catalog.extras.length) {
        const order = ['extra_kados', 'extra_fatoura'];
        const sorted = [...state.catalog.extras].sort((a,b)=>order.indexOf(a.key)-order.indexOf(b.key));
        state.extras = sorted.map(it => createExtra(it.name, it.unit, 0, it.latest_price, true, it.key));
      } else {
        state.extras = [
          createExtra('Κάδος', 'unit', 0, 120, true, 'extra_kados'),
          createExtra('Φατούρα', 'm2', 0, 0, true, 'extra_fatoura'),
        ];
      }
      renderExtras();
      recalc();
    } catch (e) {
      console.error(e);
      alert('Αποτυχία φόρτωσης σελίδας Γυψοσανίδα.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
