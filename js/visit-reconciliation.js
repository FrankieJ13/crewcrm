/* ════════════════════════════════════════════════════════════════════════
   СВЕРКА ВИЗИТОВ — подраздел «Аналитика»
   Сверяет визиты из листа Google «ВИЗИТЫ{суффикс}» (внесённые менеджерами)
   с выгрузкой сделок amoCRM (CSV), у которых проставлена «Дата визита».

   Поток: стартовый экран (загрузка CSV) → экран сканирования (чек-лист с
   круговым прогрессом) → отчёт (адаптивная таблица + копирование реестров).

   Используется существующая инфраструктура app.js:
     api(sheet, range)          — загрузка листа таблицы (с авторизацией)
     findUserInSheet/isCeoLike  — доступ только для руководителей
     showScr/dockSetActive/...  — навигация
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const LEAD_URL = 'https://ksocm66.amocrm.ru/leads/detail/';
  const WARM = 'теплые лиды';                 // эталон тёплого лида в amoCRM

  // Состояние подраздела
  const VR = {
    fileName: '', deals: [], suffix: '', monthLabel: '',
    vizRows: [], results: [], stats: null,
    steps: [], errors: [], busy: false,
  };

  // ── утилиты ──────────────────────────────────────────────────────────
  function esc(v) {
    return (typeof window.escapeHtml === 'function')
      ? window.escapeHtml(v)
      : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function normText(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' '); }
  function surname(s) { const p = normText(s).split(' ').filter(Boolean); return p[0] || ''; }
  // Телефон → 10-значное «ядро» (без кода страны). Из любого формата amoCRM.
  function normPhone(s) {
    let d = String(s == null ? '' : s).replace(/\D/g, '');
    if (d.length === 11 && (d[0] === '7' || d[0] === '8')) d = d.slice(1);
    return d.length === 10 ? d : '';
  }
  function fmtPhone(core) {
    if (!core || core.length !== 10) return core || '—';
    return '+7 (' + core.slice(0, 3) + ') ' + core.slice(3, 6) + '-' + core.slice(6, 8) + '-' + core.slice(8);
  }
  // Дата → {d,m,y} из «дд.мм.гггг[…]» или «гггг-мм-дд[…]»
  function parseDMY(s) {
    const t = String(s == null ? '' : s).trim();
    if (!t) return null;
    let m = t.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/);
    if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return { d: +m[1], m: +m[2], y }; }
    m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return { d: +m[3], m: +m[2], y: +m[1] };
    return null;
  }
  // «Успешное закрытие карточки» / комментарий визита → канон-токен оплаты
  function payToken(s) {
    const t = normText(s);
    if (!t) return '';
    if (t.includes('кредит')) return 'кредит';
    if (t.includes('наличн')) return 'наличные';
    if (t.includes('обмен')) return 'обмен';
    if (t.includes('комисс')) return 'комиссия';
    if (t.includes('выкуп')) return 'выкуп';
    return '';
  }
  // Комбо-комментарий визита «ПОКУПКА (кредит) + КОМИССИЯ» → ['кредит','комиссия']
  function payTokens(s) {
    return String(s == null ? '' : s).split(/\s*[+&,]\s*/).map(payToken).filter(Boolean);
  }
  function isWarm(s) {
    const t = normText(s);
    return t === 'теплый лид' || t === 'теплые лиды' || t === 'теплый лиды' || t === 'теплые лид';
  }

  // ── надёжный CSV-парсер (RFC-4180): кавычки, экранирование, переносы ──
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');           // BOM
    const rows = []; let row = [], field = '', i = 0, q = false;
    const n = text.length;
    while (i < n) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
        field += c; i++; continue;
      }
      if (c === '"') { q = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.length && !(r.length === 1 && r[0].trim() === ''));
  }

  // ── разбор выгрузки amoCRM ────────────────────────────────────────────
  function buildHeaderIndex(header) {
    const map = {};                                            // header → [indices]
    header.forEach((h, idx) => { const k = String(h || '').trim(); (map[k] || (map[k] = [])).push(idx); });
    return map;
  }
  function firstNonEmpty(row, idxs) {
    if (!idxs) return '';
    for (const i of idxs) { const v = String(row[i] == null ? '' : row[i]).trim(); if (v) return v; }
    return '';
  }
  function extractDeals(rows) {
    if (!rows || rows.length < 2) return [];
    const header = rows[0];
    const H = buildHeaderIndex(header);
    // Колонки телефонов: всё, что похоже на телефон, кроме линий MANGO/факсов
    const phoneIdx = header.map((h, i) => ({ h: String(h || ''), i }))
      .filter(o => /телефон|phone/i.test(o.h) && !/линия|mango|факс|fax/i.test(o.h))
      .map(o => o.i);
    const idId = (H['ID'] || [])[0];
    const idResp = (H['Ответственный'] || [])[0];
    const idVisit = (H['Дата визита'] || [])[0];
    const idSucc = (H['Успешное закрытие карточки'] || [])[0];
    const idCity = (H['Город'] || [])[0];
    const idSrc = H['Источник обращения'];
    const deals = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row.length) continue;
      const visitRaw = idVisit != null ? String(row[idVisit] || '').trim() : '';
      if (!visitRaw) continue;                                 // только сделки с проставленной датой визита
      const phones = new Set();
      phoneIdx.forEach(i => { const p = normPhone(row[i]); if (p) phones.add(p); });
      deals.push({
        id: idId != null ? String(row[idId] || '').trim() : '',
        responsible: idResp != null ? String(row[idResp] || '').trim() : '',
        visitRaw, visit: parseDMY(visitRaw),
        success: idSucc != null ? String(row[idSucc] || '').trim() : '',
        city: idCity != null ? String(row[idCity] || '').trim() : '',
        source: firstNonEmpty(row, idSrc),
        phones: [...phones],
      });
    }
    return deals;
  }
  // Месяц сверки = самый частый mm+yy среди дат визита в CSV
  function determineSuffix(deals) {
    const cnt = {};
    deals.forEach(d => { if (d.visit) { const k = String(d.visit.m).padStart(2, '0') + String(d.visit.y).slice(-2); cnt[k] = (cnt[k] || 0) + 1; } });
    let best = '', max = -1;
    Object.entries(cnt).forEach(([k, v]) => { if (v > max) { max = v; best = k; } });
    return best;
  }
  function monthName(suffix) {
    if (typeof window.getMonthName === 'function') { try { return window.getMonthName(suffix); } catch (_) {} }
    const mm = +suffix.slice(0, 2), yy = 2000 + +suffix.slice(2);
    return new Date(yy, mm - 1, 1).toLocaleString('ru', { month: 'long', year: 'numeric' });
  }

  // ── разбор листа ВИЗИТЫ (колонки A,C,D,E,F,I = 0,2,3,4,5,8) ────────────
  function extractVisits(vizData) {
    const out = [];
    if (!vizData || vizData.length < 2) return out;
    for (let i = 1; i < vizData.length; i++) {
      const row = vizData[i]; if (!row) continue;
      const date = String(row[0] || '').trim();
      const phoneRaw = String(row[2] || '').trim();
      const manager = String(row[8] || '').trim();
      // строка-черновик без даты/телефона/менеджера не сверяем
      if (!date && !phoneRaw && !manager) continue;
      out.push({
        rowNo: i + 1,
        dateRaw: date, date: parseDMY(date),
        phoneRaw, phone: normPhone(phoneRaw),
        city: String(row[3] || '').trim(),
        comment: String(row[4] || '').trim(),
        source: String(row[5] || '').trim(),
        manager,
      });
    }
    return out;
  }

  // ── движок сверки ─────────────────────────────────────────────────────
  function runMatch(deals, visits) {
    // индекс: телефон-ядро → список сделок
    const byPhone = new Map();
    deals.forEach(d => d.phones.forEach(p => { if (!byPhone.has(p)) byPhone.set(p, []); byPhone.get(p).push(d); }));
    // сколько раз телефон встречается среди визитов (двойное внесение)
    const vizPhoneCount = new Map();
    visits.forEach(v => { if (v.phone) vizPhoneCount.set(v.phone, (vizPhoneCount.get(v.phone) || 0) + 1); });

    const results = visits.map(v => {
      const dealsForPhone = v.phone ? (byPhone.get(v.phone) || []) : [];
      const distinctIds = [...new Set(dealsForPhone.map(d => d.id).filter(Boolean))];
      // выбираем эталонную сделку: с лучшим совпадением даты, иначе первую
      let deal = null;
      if (dealsForPhone.length) {
        deal = dealsForPhone.find(d => v.date && d.visit && d.visit.d === v.date.d && d.visit.m === v.date.m && d.visit.y === v.date.y)
          || dealsForPhone.find(d => v.date && d.visit && d.visit.m === v.date.m && d.visit.y === v.date.y)
          || dealsForPhone[0];
      }
      const checks = {};
      // ТЕЛЕФОН (критично)
      checks.phone = !v.phone ? 'fail' : (dealsForPhone.length ? 'ok' : 'fail');
      if (deal) {
        // ДАТА (критично): полное дд.мм.гггг → ok, иначе мм.гггг → month, иначе fail
        if (v.date && deal.visit) {
          if (v.date.d === deal.visit.d && v.date.m === deal.visit.m && v.date.y === deal.visit.y) checks.date = 'ok';
          else if (v.date.m === deal.visit.m && v.date.y === deal.visit.y) checks.date = 'month';
          else checks.date = 'fail';
        } else checks.date = 'fail';
        // МЕНЕДЖЕР (критично): достаточно совпадения фамилии; КОТËЛ = Киричок Лидия
        const vMgr = normText(v.manager) === 'котел' ? 'киричок' : surname(v.manager);
        checks.manager = vMgr && surname(deal.responsible) && vMgr === surname(deal.responsible) ? 'ok' : 'fail';
        // КОММЕНТАРИЙ (оранжевый): токен сделки входит в токены визита
        const dealTok = payToken(deal.success);
        const vizToks = payTokens(v.comment);
        checks.comment = !dealTok && !vizToks.length ? 'na'
          : (dealTok && vizToks.includes(dealTok)) ? 'ok' : 'fail';
        // ИСТОЧНИК (жёлтый; тёплый-лид-несовпадение — критично/реестр)
        if (isWarm(v.source)) checks.source = isWarm(deal.source) ? 'ok' : 'warm-bad';
        else checks.source = normText(v.source) && normText(deal.source) && normText(v.source) === normText(deal.source) ? 'ok'
          : (!normText(v.source) ? 'na' : 'fail');
        // ГОРОД (жёлтый)
        checks.city = normText(v.city) && normText(deal.city) && normText(v.city) === normText(deal.city) ? 'ok'
          : (!normText(v.city) ? 'na' : 'fail');
      } else {
        checks.date = checks.manager = checks.comment = checks.source = checks.city = 'na';
      }
      const dupDeals = distinctIds.length > 1;             // один телефон в нескольких сделках
      const dupViz = v.phone && vizPhoneCount.get(v.phone) > 1;  // двойное внесение визита
      const warmBad = checks.source === 'warm-bad';
      const noDeal = checks.phone === 'fail';
      const criticalFail = noDeal || checks.date === 'fail' || checks.manager === 'fail';
      const minorFail = checks.comment === 'fail' || checks.source === 'fail' || checks.city === 'fail' || checks.date === 'month';

      let status;
      if (criticalFail || dupDeals || dupViz || warmBad) status = 'fail';
      else if (minorFail) status = 'warn';
      else status = 'ok';

      let bucket = null;
      if (dupDeals || dupViz || warmBad || noDeal) bucket = 'attention';
      else if (status !== 'ok') bucket = 'correct';

      return { viz: v, deal, distinctIds, dupDeals, dupViz, warmBad, noDeal, checks, status, bucket };
    });

    const stats = {
      total: results.length,
      ok: results.filter(r => r.status === 'ok').length,
      warn: results.filter(r => r.status === 'warn').length,
      fail: results.filter(r => r.status === 'fail').length,
      correct: results.filter(r => r.bucket === 'correct'),
      attention: results.filter(r => r.bucket === 'attention'),
    };
    return { results, stats };
  }

  // ── навигация / доступ ────────────────────────────────────────────────
  function host() { return document.getElementById('c-sverka'); }
  function canView() {
    const u = typeof window.findUserInSheet === 'function' ? window.findUserInSheet() : null;
    return !!(u && typeof window.isCeoLike === 'function' && window.isCeoLike(u.role));
  }

  window.openVisitReconciliation = function openVisitReconciliation() {
    if (!canView()) return;
    if (typeof window.closeAllDockPopups === 'function') window.closeAllDockPopups();
    if (typeof window.showScr === 'function') window.showScr('sverka');
    if (typeof window.dockSetActive === 'function') window.dockSetActive('analytics');
    renderStart();
    if (typeof window.scheduleFirebasePageUpdate === 'function') window.scheduleFirebasePageUpdate();
    else if (typeof window.updateFirebasePage === 'function') window.updateFirebasePage();
  };

  function chipLabel() {
    if (!VR.suffix) return '';
    return `${VR.suffix.slice(0, 2)} · 20${VR.suffix.slice(2)}`;
  }
  function shell(inner) {
    const hasMonth = !!VR.suffix;
    return `
      <section class="vr-page">
        <div class="vr-head">
          <h1 class="vr-title">Сверка визитов</h1>
          ${hasMonth ? `<div class="vr-head-tools">
            <button class="vr-icon-btn" id="vr-refresh" type="button" aria-label="Обновить сверку" title="Обновить сверку">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v5h-5"/></svg>
            </button>
            <span class="vr-month-chip">${esc(chipLabel())}</span>
          </div>` : ''}
        </div>
        ${inner}
      </section>`;
  }
  function bindHeader() {
    const rb = document.getElementById('vr-refresh');
    if (rb) rb.onclick = vrRefresh;
  }
  async function vrRefresh() {
    if (VR.busy || !VR.suffix || !VR.deals.length) return;
    const rb = document.getElementById('vr-refresh');
    rb && rb.classList.add('spin');
    VR.busy = true;
    try {
      const vizData = await window.api('ВИЗИТЫ' + VR.suffix, 'A:N', { force: true }).catch(() => null);
      if (vizData) {
        VR.vizRows = extractVisits(vizData);
        const { results, stats } = runMatch(VR.deals, VR.vizRows);
        VR.results = results; VR.stats = stats;
      }
    } finally {
      VR.busy = false;
      renderReport();
    }
  }

  // ── 1) стартовый экран ────────────────────────────────────────────────
  function renderStart() {
    const h = host(); if (!h) return;
    h.innerHTML = shell(`
      <div class="vr-start">
        <div class="vr-drop" id="vr-drop">
          <div class="vr-drop-ic">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/></svg>
          </div>
          <div class="vr-drop-t">Загрузите CSV-выгрузку amoCRM</div>
          <div class="vr-drop-s">Сделки за текущий месяц с проставленной «Датой визита».<br>Месяц для сверки с листом <b>ВИЗИТЫ</b> определится автоматически по датам визитов.</div>
          <button class="vr-btn primary" id="vr-pick" type="button">Выбрать файл</button>
          <input id="vr-file" type="file" accept=".csv,text/csv" hidden>
          <div class="vr-drop-hint">или перетащите файл сюда</div>
        </div>
      </div>`);
    bindStart();
  }
  function bindStart() {
    const drop = document.getElementById('vr-drop');
    const file = document.getElementById('vr-file');
    document.getElementById('vr-pick')?.addEventListener('click', () => file?.click());
    file?.addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) onFile(f); });
    if (drop) {
      ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
      drop.addEventListener('drop', e => { const f = e.dataTransfer?.files && e.dataTransfer.files[0]; if (f) onFile(f); });
    }
  }

  function onFile(file) {
    VR.fileName = file.name || 'amocrm.csv';
    const reader = new FileReader();
    reader.onload = () => { runScan(String(reader.result || '')); };
    reader.onerror = () => { renderStart(); alert('Не удалось прочитать файл.'); };
    reader.readAsText(file, 'utf-8');
  }

  // ── 2) экран сканирования (чек-лист + круговой прогресс) ──────────────
  const STEP_DEFS = [
    ['read', 'Чтение CSV amoCRM'],
    ['month', 'Определение месяца сверки'],
    ['sheet', 'Загрузка листа ВИЗИТЫ'],
    ['index', 'Нормализация и индексация'],
    ['match', 'Сверка визитов'],
    ['dups', 'Поиск дубликатов и фрода'],
  ];
  function renderScan() {
    const h = host(); if (!h) return;
    const total = STEP_DEFS.length;
    const done = VR.steps.filter(s => s.state === 'ok' || s.state === 'error').length;
    const pct = Math.round(done / total * 100);
    const R = 52, C = 2 * Math.PI * R, off = C * (1 - pct / 100);
    const allDone = done === total;
    const hasErr = VR.steps.some(s => s.state === 'error');
    h.innerHTML = shell(`
      <div class="vr-scan">
        <div class="vr-ring-wrap">
          <svg class="vr-ring" viewBox="0 0 120 120" width="132" height="132">
            <circle cx="60" cy="60" r="${R}" class="vr-ring-bg"/>
            <circle cx="60" cy="60" r="${R}" class="vr-ring-fg ${hasErr ? 'err' : ''}" style="stroke-dasharray:${C.toFixed(1)};stroke-dashoffset:${off.toFixed(1)}"/>
          </svg>
          <div class="vr-ring-num">${pct}<span>%</span></div>
        </div>
        <ul class="vr-steps">
          ${STEP_DEFS.map(([key, label]) => {
            const st = VR.steps.find(s => s.key === key) || { state: 'pending' };
            return `<li class="vr-step ${st.state}">
              <span class="vr-step-ic">${stepIcon(st.state)}</span>
              <span class="vr-step-lbl">${esc(label)}${st.note ? ` <i class="vr-step-note">${esc(st.note)}</i>` : ''}</span>
            </li>`;
          }).join('')}
        </ul>
        ${VR.errors.length ? `<div class="vr-scan-errs">${VR.errors.map(e => `<div class="vr-scan-err">⚠ ${esc(e)}</div>`).join('')}</div>` : ''}
        <div class="vr-scan-actions">
          <button class="vr-btn" id="vr-back" type="button">Назад</button>
          <button class="vr-btn primary" id="vr-report" type="button" ${allDone ? '' : 'disabled'}>Посмотреть отчёт</button>
        </div>
      </div>`);
    document.getElementById('vr-back')?.addEventListener('click', renderStart);
    document.getElementById('vr-report')?.addEventListener('click', () => { if (allDone) renderReport(); });
    bindHeader();
  }
  function stepIcon(state) {
    if (state === 'ok') return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
    if (state === 'error') return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    if (state === 'run') return '<span class="vr-spin"></span>';
    return '<span class="vr-dot"></span>';
  }
  function setStep(key, state, note) {
    let s = VR.steps.find(x => x.key === key);
    if (!s) { s = { key }; VR.steps.push(s); }
    s.state = state; if (note !== undefined) s.note = note;
    renderScan();
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function runScan(csvText) {
    VR.steps = []; VR.errors = []; VR.deals = []; VR.vizRows = []; VR.results = []; VR.stats = null; VR.suffix = ''; VR.monthLabel = '';
    renderScan();
    // 1) Чтение CSV
    setStep('read', 'run'); await wait(160);
    let rows = [];
    try {
      rows = parseCSV(csvText);
      VR.deals = extractDeals(rows);
      if (!VR.deals.length) throw new Error('в файле нет сделок с проставленной «Датой визита»');
      setStep('read', 'ok', `${VR.deals.length} сделок с визитом`);
    } catch (e) { VR.errors.push('Чтение CSV: ' + e.message); setStep('read', 'error', e.message); }
    await wait(140);
    // 2) Месяц
    setStep('month', 'run'); await wait(160);
    try {
      VR.suffix = determineSuffix(VR.deals);
      if (!VR.suffix) throw new Error('не удалось определить месяц по датам визитов');
      VR.monthLabel = monthName(VR.suffix);
      setStep('month', 'ok', `${VR.monthLabel} → ВИЗИТЫ${VR.suffix}`);
      renderScan();
    } catch (e) { VR.errors.push('Месяц: ' + e.message); setStep('month', 'error', e.message); }
    await wait(140);
    // 3) Лист ВИЗИТЫ{suffix}
    setStep('sheet', 'run'); await wait(120);
    try {
      if (!VR.suffix) throw new Error('месяц не определён');
      if (typeof window.api !== 'function') throw new Error('нет доступа к таблице (api)');
      const vizData = await window.api('ВИЗИТЫ' + VR.suffix, 'A:N', { force: true }).catch(err => { throw new Error(err && err.message === 'NOT_FOUND' ? `лист ВИЗИТЫ${VR.suffix} не найден` : 'ошибка загрузки листа'); });
      VR.vizRows = extractVisits(vizData || []);
      if (!VR.vizRows.length) throw new Error('лист пуст или нет визитов за месяц');
      setStep('sheet', 'ok', `${VR.vizRows.length} визитов в листе`);
    } catch (e) { VR.errors.push('Лист ВИЗИТЫ: ' + e.message); setStep('sheet', 'error', e.message); }
    await wait(140);
    // 4) Индексация
    setStep('index', 'run'); await wait(180);
    const okData = VR.deals.length && VR.vizRows.length;
    setStep('index', okData ? 'ok' : 'error', okData ? `телефоны нормализованы` : 'нет данных для сверки');
    await wait(140);
    // 5) Сверка
    setStep('match', 'run'); await wait(220);
    try {
      if (!okData) throw new Error('недостаточно данных');
      const { results, stats } = runMatch(VR.deals, VR.vizRows);
      VR.results = results; VR.stats = stats;
      setStep('match', 'ok', `${stats.ok} ок · ${stats.warn} частично · ${stats.fail} с ошибкой`);
    } catch (e) { VR.errors.push('Сверка: ' + e.message); setStep('match', 'error', e.message); }
    await wait(140);
    // 6) Дубликаты
    setStep('dups', 'run'); await wait(180);
    if (VR.stats) {
      const att = VR.stats.attention.length;
      setStep('dups', 'ok', att ? `${att} визитов на повышенное внимание` : 'подозрительных не найдено');
    } else setStep('dups', 'error', 'сверка не выполнена');
    renderScan();
  }

  // ── 3) экран отчёта ──────────────────────────────────────────────────
  function renderReport() {
    const h = host(); if (!h) return;
    const s = VR.stats;
    if (!s) { renderScan(); return; }
    h.innerHTML = shell(`
      <div class="vr-report">
        <div class="vr-summary">
          ${summaryCard('Всего визитов', s.total, 'all')}
          ${summaryCard('Совпали', s.ok, 'ok')}
          ${summaryCard('Частично', s.warn, 'warn')}
          ${summaryCard('С ошибкой', s.fail, 'fail')}
        </div>

        ${bucketBlock('Сделки требующие корректировки', s.correct, 'correct')}
        ${bucketBlock('Сделки требующие повышенное внимание', s.attention, 'attention')}

        <div class="vr-table-tools">
          <div class="vr-legend">
            <span><i class="lg ok"></i>совпадение</span>
            <span><i class="lg warn"></i>источник/город</span>
            <span><i class="lg comment"></i>комментарий</span>
            <span><i class="lg fail"></i>дата/менеджер/телефон</span>
          </div>
          <div class="vr-filters" id="vr-filters">
            ${[['all', 'Все'], ['fail', 'С ошибкой'], ['warn', 'Частично'], ['ok', 'Совпали']].map(([k, l], i) =>
              `<button class="vr-fbtn ${i === 0 ? 'on' : ''}" data-vr-filter="${k}" type="button">${l}</button>`).join('')}
          </div>
        </div>

        <div class="vr-table-wrap">
          ${renderTable(VR.results)}
        </div>

        <div class="vr-report-actions">
          <button class="vr-btn" id="vr-new" type="button">Новая сверка</button>
        </div>
      </div>`);
    bindReport();
  }

  function summaryCard(label, value, kind) {
    return `<div class="vr-sum ${kind}"><div class="vr-sum-v">${value}</div><div class="vr-sum-l">${esc(label)}</div></div>`;
  }

  function bucketBlock(title, items, kind) {
    const ids = items.map(r => r.deal && r.deal.id).filter(Boolean);
    const uniqIds = [...new Set(ids)];
    return `
      <div class="vr-bucket ${kind}">
        <div class="vr-bucket-head">
          <h3>${esc(title)}</h3>
          <span class="vr-bucket-count">${items.length}</span>
        </div>
        <div class="vr-copy-row">
          <button class="vr-copy primary" data-vr-copy="ids" data-vr-bucket="${kind}" type="button" ${uniqIds.length ? '' : 'disabled'}>Скопировать ID + Ответственный список</button>
          <button class="vr-copy" data-vr-copy="links" data-vr-bucket="${kind}" type="button" ${uniqIds.length ? '' : 'disabled'}>Скопировать ID + Ответственный список + ссылки</button>
        </div>
      </div>`;
  }

  // Класс цвета ячейки по результату проверки поля
  function cellCls(state, kind) {
    if (state === 'ok' || state === 'month') return 'ok';
    if (state === 'na') return 'na';
    if (kind === 'comment') return 'comment';
    if (kind === 'source' || kind === 'city') return state === 'warm-bad' ? 'fail' : 'warn';
    return 'fail';                                            // phone/date/manager
  }
  // SVG-иконки статуса (галочка / восклицательный знак / крестик)
  function statusIcon(status) {
    const t = status === 'ok' ? 'Совпадение' : status === 'warn' ? 'Частичное совпадение' : 'Есть критичные расхождения';
    let p;
    if (status === 'ok') p = '<path d="M20 6L9 17l-5-5"/>';
    else if (status === 'warn') p = '<path d="M12 6.5v7"/><path d="M12 17.5h.01"/>';
    else p = '<path d="M18 6L6 18M6 6l12 12"/>';
    return `<span class="vr-st ${status}" title="${t}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${p}</svg></span>`;
  }
  // Ячейка «Сделка»: [иконка статуса] СДЕЛКА … номер-ссылка
  function dealCell(r) {
    const dup = r.dupDeals ? `<span class="vr-dup" title="Телефон встречается в нескольких сделках">×${r.distinctIds.length}</span>` : '';
    const link = (r.deal && r.deal.id)
      ? `<a class="vr-lead" href="${LEAD_URL}${encodeURIComponent(r.deal.id)}" target="_blank" rel="noopener">${esc(r.deal.id)}</a>${dup}`
      : '<span class="vr-nodeal">нет сделки</span>';
    return `${statusIcon(r.status)}${link}`;
  }

  function renderTable(results) {
    const cols = ['Дата', 'Телефон', 'Менеджер', 'Город', 'Источник', 'Комментарий', 'Сделка'];
    const head = `<tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>`;
    const body = results.map((r, i) => {
      const v = r.viz, c = r.checks;
      const dateNote = c.date === 'month' ? '<i class="vr-hint">мес.</i>' : '';
      const srcTitle = r.deal ? `CRM: ${esc(r.deal.source || '—')}` : '';
      const cityTitle = r.deal ? `CRM: ${esc(r.deal.city || '—')}` : '';
      const mgrTitle = r.deal ? `CRM: ${esc(r.deal.responsible || '—')}` : '';
      const cmtTitle = r.deal ? `CRM: ${esc(r.deal.success || '—')}` : '';
      const dupViz = r.dupViz ? '<span class="vr-dup" title="Этот телефон внесён в визиты несколько раз">дубль</span>' : '';
      return `<tr class="vr-row ${r.status}" data-vr-status="${r.status}" data-vr-i="${i}">
        <td class="${cellCls(c.date)}" data-l="Дата">${esc(v.dateRaw || '—')} ${dateNote}</td>
        <td class="${cellCls(c.phone)}" data-l="Телефон">${esc(fmtPhone(v.phone) || v.phoneRaw || '—')} ${dupViz}</td>
        <td class="${cellCls(c.manager)}" data-l="Менеджер" title="${mgrTitle}">${esc(v.manager || '—')}</td>
        <td class="${cellCls(c.city, 'city')}" data-l="Город" title="${cityTitle}">${esc(v.city || '—')}</td>
        <td class="${cellCls(c.source, 'source')}" data-l="Источник" title="${srcTitle}">${esc(v.source || '—')}</td>
        <td class="${cellCls(c.comment, 'comment')}" data-l="Комментарий" title="${cmtTitle}">${esc(v.comment || '—')}</td>
        <td class="vr-deal-cell" data-l="Сделка">${dealCell(r)}</td>
      </tr>`;
    }).join('');
    return `<table class="vr-table"><thead>${head}</thead><tbody>${body || `<tr><td colspan="7" class="vr-empty">Нет визитов</td></tr>`}</tbody></table>`;
  }

  function bindReport() {
    bindHeader();
    document.getElementById('vr-new')?.addEventListener('click', renderStart);
    document.querySelectorAll('[data-vr-filter]').forEach(b => b.addEventListener('click', () => {
      const f = b.dataset.vrFilter;
      document.querySelectorAll('[data-vr-filter]').forEach(x => x.classList.toggle('on', x === b));
      document.querySelectorAll('.vr-row').forEach(row => {
        row.style.display = (f === 'all' || row.dataset.vrStatus === f) ? '' : 'none';
      });
    }));
    document.querySelectorAll('[data-vr-copy]').forEach(b => b.addEventListener('click', () => {
      const kind = b.dataset.vrBucket;
      const mode = b.dataset.vrCopy;
      const items = (VR.stats && VR.stats[kind]) || [];
      copyBucket(items, mode === 'links', b);
    }));
  }

  function copyBucket(items, withLinks, btn) {
    // уникальные сделки (по ID), сохраняем ответственного
    const seen = new Set(); const lines = [];
    items.forEach(r => {
      const id = r.deal && r.deal.id; if (!id || seen.has(id)) return; seen.add(id);
      const resp = (r.deal.responsible || '').trim();
      lines.push(withLinks ? `${id}\t${resp}\t${LEAD_URL}${id}` : `${id}\t${resp}`);
    });
    const text = lines.join('\n');
    const done = () => { const t = btn.textContent; btn.classList.add('copied'); btn.textContent = `Скопировано (${lines.length})`; setTimeout(() => { btn.classList.remove('copied'); btn.textContent = t; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    try { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); done(); } catch (_) {}
  }

})();
