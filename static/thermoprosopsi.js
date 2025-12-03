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
  const parseNum = (v) => {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    return parseFloat(String(v).replace(',', '.')) || 0;
  };

  const unitNice = (u) => (u === 'm2' ? 'm²' : u);
  const formatConsumption = (item) => {
    if (item.consumption) {
      // Convert patterns like "6 kgr per 1 m2" -> "6 kgr/m²"
      let s = String(item.consumption);
      s = s.replace(/\bm2\b/g, 'm²');
      s = s.replace(/ per 1 /g, '/');
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

  function renderTables() {
    const areasTbody = $('#tbl-areas tbody');
    const linearTbody = $('#tbl-linear tbody');
    const workersTbody = $('#tbl-workers tbody');
    areasTbody.innerHTML = '';
    linearTbody.innerHTML = '';
    workersTbody.innerHTML = '';

    // Areas (per m2)
    state.catalog.areas.forEach((item) => {
      const tr = document.createElement('tr');
      tr.dataset.key = item.key;
      tr.innerHTML = `
        <td class="name-cell"><div class="primary">${item.name}</div><div class="sub">${formatConsumption(item)}</div></td>
        <td>
          <div class="inline-flex">
            <input type="number" class="price" min="0" step="0.01" value="${item.latest_price}" data-original="${item.latest_price}">
            <span class="unit muted">/${unitNice(item.unit)}</span>
            <button class="btn-update" hidden>Ενημέρωση</button>
          </div>
        </td>
        <td class="right qty">0</td>
        <td class="right cost">${fmtEUR(0)}</td>
      `;
      areasTbody.appendChild(tr);
    });

    // Linear (per lm)
    state.catalog.linear.forEach((item) => {
      const tr = document.createElement('tr');
      tr.dataset.key = item.key;
      tr.innerHTML = `
        <td class="name-cell"><div class="primary">${item.name}</div><div class="sub">${formatConsumption(item)}</div></td>
        <td>
          <div class="inline-flex">
            <input type="number" class="price" min="0" step="0.01" value="${item.latest_price}" data-original="${item.latest_price}">
            <span class="unit muted">/${unitNice(item.unit)}</span>
            <button class="btn-update" hidden>Ενημέρωση</button>
          </div>
        </td>
        <td class="right qty">0</td>
        <td class="right cost">${fmtEUR(0)}</td>
      `;
      linearTbody.appendChild(tr);
    });

    // Workers
    state.catalog.workers.forEach((item) => {
      const tr = document.createElement('tr');
      tr.dataset.key = item.key;
      tr.innerHTML = `
        <td class="name-cell"><div class="primary">${item.name}</div><div class="sub">/ημέρα</div></td>
        <td>
          <div class="inline-flex">
            <input type="number" class="price" min="0" step="0.01" value="${item.latest_price}" data-original="${item.latest_price}">
            <span class="unit muted">/ημέρα</span>
            <button class="btn-update" hidden>Ενημέρωση</button>
          </div>
        </td>
        <td class="right cost">${fmtEUR(0)}</td>
      `;
      workersTbody.appendChild(tr);
    });

    attachRowHandlers();
    // Enable auto-select for newly created inputs (prices, days)
    $$('#tbl-areas input.price, #tbl-linear input.price, #tbl-workers input.price').forEach(enableAutoSelect);
    recalc();
  }

  function attachRowHandlers() {
    // Price changes recalc live, Update button persists
    ['#tbl-areas', '#tbl-linear', '#tbl-workers'].forEach(sel => {
      const table = document.querySelector(sel);
      table.addEventListener('input', (e) => {
        if (e.target.classList.contains('price')) {
          const input = e.target;
          const tr = input.closest('tr');
          const updateBtn = tr.querySelector('.btn-update');
          const orig = parseNum(input.dataset.original);
          const now = parseNum(input.value);
          if (Math.abs(now - orig) > 1e-9) updateBtn.hidden = false; else updateBtn.hidden = true;
          recalc();
        }
      });
      table.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-update');
        if (btn) {
          const tr = btn.closest('tr');
          const key = tr.dataset.key;
          const priceInput = tr.querySelector('input.price');
          const newPrice = parseNum(priceInput.value);
          btn.disabled = true;
          try {
            await savePrice(key, newPrice);
            // reset original and hide button
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
    $$('#tbl-areas tbody tr').forEach(tr => {
      const price = parseNum(tr.querySelector('input.price').value);
      const qtyCell = tr.querySelector('.qty');
      const costCell = tr.querySelector('.cost');
      qtyCell.textContent = m2.toFixed(2);
      const cost = price * m2;
      costCell.textContent = fmtEUR(cost);
      sumAreas += cost;
    });

    let sumLinear = 0;
    $$('#tbl-linear tbody tr').forEach(tr => {
      const price = parseNum(tr.querySelector('input.price').value);
      const qtyCell = tr.querySelector('.qty');
      const costCell = tr.querySelector('.cost');
      qtyCell.textContent = lm.toFixed(2);
      const cost = price * lm;
      costCell.textContent = fmtEUR(cost);
      sumLinear += cost;
    });

    let sumWorkers = 0;
    $$('#tbl-workers tbody tr').forEach(tr => {
      const price = parseNum(tr.querySelector('input.price').value);
      const key = tr.dataset.key;
      const days = parseNum(state.workerDays[key] ?? 0);
      const costCell = tr.querySelector('.cost');
      const cost = price * days;
      costCell.textContent = fmtEUR(cost);
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
    $('#sumCost').textContent = fmtEUR(sumCost);
    $('#sumMarkup').textContent = `${markup}%`;
    $('#sumSell').textContent = fmtEUR(sell);
    $('#sumGross').textContent = `${fmtEUR(gross)} (${marginPct.toFixed(1)}%)`;
    $('#sumPerM2').textContent = m2 > 0 ? fmtEUR(sell / m2) : '—';
    $('#sumPerLm').textContent = lm > 0 ? fmtEUR(sell / Math.max(lm, 1e-9)) : '—';

    // Live header widgets
    const liveCost = $('#liveCost');
    const liveSell = $('#liveSell');
    if (liveCost) liveCost.textContent = fmtEUR(sumCost);
    if (liveSell) liveSell.textContent = fmtEUR(sell);
  }

  function attachInputs() {
    const m2El = $('#m2');
    const lmEl = $('#lm');
    const markupEl = $('#markup');
    const markupPercentEl = $('#markupPercent');
    const daysTechnitisEl = $('#days-technitis');
    const daysVoithosEl = $('#days-voithos');

    enableAutoSelect(m2El);
    enableAutoSelect(lmEl);
    enableAutoSelect(markupPercentEl);
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
      range.style.setProperty('--val', range.value);
      range.style.setProperty('--min', range.min ?? '0');
      range.style.setProperty('--max', range.max ?? '100');
    }
    updateRangeVars(markupEl);

    markupEl.addEventListener('input', () => {
      state.markup = parseNum(markupEl.value);
      markupPercentEl.value = String(Math.round(state.markup));
      $('#sumMarkup').textContent = `${state.markup}%`;
      updateRangeVars(markupEl);
      recalc();
    });

    // Allow direct percent typing
    markupPercentEl.addEventListener('input', () => {
      let val = parseNum(markupPercentEl.value);
      if (!isFinite(val)) val = 0;
      if (val < 0) val = 0; if (val > 100) val = 100;
      markupPercentEl.value = String(Math.round(val));
      state.markup = val;
      markupEl.value = String(val);
      updateRangeVars(markupEl);
      $('#sumMarkup').textContent = `${state.markup}%`;
      recalc();
    });
  }

  async function init() {
    try {
      await fetchCatalog();
      attachInputs();
      renderTables();
    } catch (e) {
      console.error(e);
      alert('Κάτι πήγε στραβά κατά τη φόρτωση της σελίδας.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
