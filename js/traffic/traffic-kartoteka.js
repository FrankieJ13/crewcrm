/* ═══════════════════════════════════════════════════════════════════════════
 * КАРТОТЕКА — UI (FAQ-подраздел). Экраны по утв. референсу:
 *   Архив (журнал визитов) · Карточка визита (inline) · Поиск клиента · Справка.
 * Данные — только через window.TrafficAPI (Data Hub read-only API). Cursor-
 * пагинация + infinite scroll (не качаем всю базу). Логику MATCHES не трогаем.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const MON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const MON_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  // ── SVG-иконки (компактные stroke, в стиле проекта) ──
  const I = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
    salon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21V9l9-6 9 6v12"/><path d="M9 21v-6h6v6"/></svg>',
    dozhim: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 16l1.5-5A2 2 0 0 1 8.4 9.6h7.2a2 2 0 0 1 1.9 1.4L19 16"/><path d="M4 16h16v3H4z"/><circle cx="7.5" cy="19" r="1.3"/><circle cx="16.5" cy="19" r="1.3"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 6 15 12 9 18"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="15 6 9 12 15 18"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4h6v6"/><path d="M20 4l-8 8"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3l3 5-2 2a12 12 0 0 0 5 5l2-2 5 3-1 3a2 2 0 0 1-2 1A16 16 0 0 1 3 6a2 2 0 0 1 1-2z"/></svg>',
    avatar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="9" r="3.2"/><path d="M5.5 20c.6-3.4 3.3-5 6.5-5s5.9 1.6 6.5 5"/></svg>',
    deal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    sale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
  };

  const KT = {
    el: null, sub: 'archive', view: 'list', booted: false, opts: null, meta: null,
    items: [], cursor: null, hasMore: true, loading: false, loadedOnce: false, lastTotal: null,
    reqSeq: 0, ac: null, io: null, savedScroll: 0, currentVisit: null, currentClient: null, history: [],
    filters: { dateFrom: '', dateTo: '', city: '', opManager: '', visitType: '', matchStatus: '', archiveMode: '', query: '' },
    search: { phone: '', result: null, loading: false, error: '' },
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function toast(m, t) { try { if (typeof window.toast === 'function') window.toast(m, t); } catch (_) {} }
  function copy(text) { try { navigator.clipboard.writeText(String(text || '')); toast('Скопировано', 's'); } catch (_) {} }
  function getScroller() {
    let el = KT.el;
    while (el && el !== document.body) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 4) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  // Надёжный парсер даты: 'YYYY-MM-DD', ISO, и toString-формат Date ('Wed May 27 2026 …').
  function parseDT(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return null;
    let y, mo, d, hh = null, mm = null;
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{2}):(\d{2}))?/.exec(s);
    if (iso) { y = +iso[1]; mo = +iso[2]; d = +iso[3]; if (iso[4] != null) { hh = +iso[4]; mm = +iso[5]; } }
    else { const dt = new Date(s); if (isNaN(dt.getTime())) return null; y = dt.getFullYear(); mo = dt.getMonth() + 1; d = dt.getDate(); hh = dt.getHours(); mm = dt.getMinutes(); }
    const bad = !(y >= 2015 && y <= new Date().getFullYear() + 1 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31);
    return { y, mo, d, hh, mm, bad };
  }
  function isArch(dt) { return !!(dt && !dt.bad && dt.y < new Date().getFullYear()); }
  function fmtFull(dt) { return dt && !dt.bad ? `${dt.d} ${MON_FULL[dt.mo - 1]} ${dt.y}` + (dt.hh != null && (dt.hh || dt.mm) ? `, ${('0' + dt.hh).slice(-2)}:${('0' + dt.mm).slice(-2)}` : '') : 'ДАТА?'; }
  function shortTs(v) { const dt = parseDT(v); if (!dt || dt.bad) return ''; const p = n => ('0' + n).slice(-2); return `${p(dt.d)}.${p(dt.mo)}` + (dt.hh != null ? ` ${p(dt.hh)}:${p(dt.mm)}` : ''); }

  function matchChip(it) {
    const st = String(it.ui_status || it.match_status || '').toUpperCase();
    const cnt = Number(it.candidate_count || 0);
    switch (st) {
      case 'MATCHED':          return { txt: 'СВЯЗАН', cls: 'ok', sub: it.matched_deal_id ? 'amoCRM #' + it.matched_deal_id : 'amoCRM' };
      case 'AMBIGUOUS':        return { txt: 'НЕСКОЛЬКО СДЕЛОК', cls: 'warn', sub: 'amoCRM ×' + (cnt || '?') };
      case 'PHONE_ONLY':       return { txt: 'ТОЛЬКО ТЕЛЕФОН', cls: 'phone', sub: 'amoCRM по телефону' };
      case 'NO_MATCH':         return { txt: 'НЕТ СВЯЗИ', cls: 'none', sub: '' };
      case 'NO_PHONE':         return { txt: 'НЕТ ТЕЛЕФОНА', cls: 'muted', sub: '' };
      case 'WAITING_AMO_SYNC': return { txt: 'ОЖИДАЕТ SYNC', cls: 'wait', sub: '' };
      default:                 return { txt: st || '—', cls: 'muted', sub: '' };
    }
  }
  const EVID = {
    PHONE_DATE_CITY: 'Совпали телефон, дата визита и город.',
    PHONE_DATE_EXACT: 'Совпали телефон и точная дата.',
    PHONE_NEAR_DATE_CITY: 'Совпали телефон, город и дата в пределах ±1 дня.',
    MULTIPLE_ROBUST_MATCHES: 'Несколько надёжных кандидатов.',
    MULTIPLE_PHONE_CANDIDATES: 'Несколько сделок клиента по телефону.',
    PHONE_ONLY_ONE_DEAL: 'Одна сделка клиента по телефону — конкретный визит не подтверждён.',
    PHONE_NOT_FOUND_IN_AMO: 'Телефон не найден в текущей базе amoCRM.',
    PHONE_NOT_FOUND_AMO_MAY_BE_STALE: 'Телефон не найден — выгрузка amoCRM может быть неполной.',
    NO_VALID_PHONE: 'Нет валидного телефона.',
  };

  /* ── SHELL ── */
  function render(el) {
    KT.el = el;
    if (!window.TrafficAPI || !window.TrafficAPI.isConfigured()) { el.innerHTML = '<div class="kt-empty">Картотека ещё не подключена.</div>'; return; }
    el.innerHTML = `
      <div class="kt-app">
        <div class="kt-head">
          <div class="kt-subtitle">Архив визитов и связи с amoCRM</div>
          <div class="kt-tabs">
            <button class="kt-tab ${KT.sub === 'archive' ? 'on' : ''}" data-kt-tab="archive">Архив</button>
            <button class="kt-tab ${KT.sub === 'search' ? 'on' : ''}" data-kt-tab="search">Поиск клиента</button>
            <button class="kt-tab ${KT.sub === 'help' ? 'on' : ''}" data-kt-tab="help">Справка</button>
          </div>
        </div>
        <div id="kt-body"></div>
      </div>`;
    el.querySelectorAll('[data-kt-tab]').forEach(b => b.onclick = () => setSub(b.getAttribute('data-kt-tab')));
    ensureBoot().then(renderSub).catch(err => showBody(errBox(err)));
  }
  function setSub(sub) {
    if (KT.sub !== sub) KT.view = 'list';
    KT.sub = sub;
    KT.el.querySelectorAll('.kt-tab').forEach(b => b.classList.toggle('on', b.getAttribute('data-kt-tab') === sub));
    renderSub();
  }
  function showBody(html) { const b = KT.el && KT.el.querySelector('#kt-body'); if (b) b.innerHTML = html; }
  function errBox(err) {
    const msg = window.TrafficAPI ? window.TrafficAPI.parseApiError(err) : 'Не удалось загрузить данные';
    const code = err && err.code ? ` (${err.code})` : '';
    return `<div class="kt-empty">${esc(msg)}<span class="kt-muted">${esc(code)}</span><div><button class="kt-btn" onclick="Kartoteka.reload()">Повторить</button></div></div>`;
  }
  async function ensureBoot() {
    if (KT.booted) return;
    const data = await window.TrafficAPI.bootstrap();
    KT.meta = data.meta || {}; KT.opts = data.filters || {}; KT.booted = true;
  }
  function renderSub() {
    if (KT.sub === 'help') return renderHelp();
    if (KT.sub === 'search') return renderSearch();
    if (KT.view === 'detail' && KT.currentVisit) return renderVisit(KT.currentVisit);
    return renderArchive();
  }

  /* ── АРХИВ ── */
  function optList(arr, cur) { return (arr || []).map(v => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(v)}</option>`).join(''); }
  const STATUS_OPTS = [['', 'Все статусы'], ['MATCHED', 'Связан'], ['AMBIGUOUS', 'Несколько сделок'], ['PHONE_ONLY', 'Только телефон'], ['NO_MATCH', 'Нет связи'], ['WAITING_AMO_SYNC', 'Ожидает sync'], ['NO_PHONE', 'Нет телефона']];

  function renderArchive() {
    const o = KT.opts || {}, f = KT.filters;
    showBody(`
      <div class="kt-filters">
        <div class="kt-frow">
          <input type="date" class="kt-date" id="kt-from" value="${esc(f.dateFrom)}" aria-label="Дата с">
          <span class="kt-dash">—</span>
          <input type="date" class="kt-date" id="kt-to" value="${esc(f.dateTo)}" aria-label="Дата по">
          <select class="kt-select" id="kt-city"><option value="">Все города</option>${optList(o.city, f.city)}</select>
        </div>
        <div class="kt-frow">
          <select class="kt-select" id="kt-mgr"><option value="">Все менеджеры</option>${optList(o.opManager, f.opManager)}</select>
          <select class="kt-select" id="kt-type"><option value="">Все типы</option>${optList(o.visitType, f.visitType)}</select>
          <select class="kt-select" id="kt-status">${STATUS_OPTS.map(([v, l]) => `<option value="${v}"${f.matchStatus === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        <div class="kt-frow">
          <input type="search" class="kt-search" id="kt-q" placeholder="Поиск по телефону, ФИО или комментарию…" value="${esc(f.query)}">
        </div>
      </div>
      <div class="kt-summary"><span id="kt-sum-l">Загрузка…</span><span class="kt-muted">Сначала новые</span></div>
      <div class="kt-list" id="kt-list"></div>
      <div id="kt-sentinel" class="kt-sentinel"></div>
    `);
    const on = (id, ev, fn) => { const e = document.getElementById(id); if (e) e.addEventListener(ev, fn); };
    on('kt-from', 'change', e => { f.dateFrom = e.target.value; applyFilters(); });
    on('kt-to', 'change', e => { f.dateTo = e.target.value; applyFilters(); });
    on('kt-city', 'change', e => { f.city = e.target.value; applyFilters(); });
    on('kt-mgr', 'change', e => { f.opManager = e.target.value; applyFilters(); });
    on('kt-type', 'change', e => { f.visitType = e.target.value; applyFilters(); });
    on('kt-status', 'change', e => { f.matchStatus = e.target.value; applyFilters(); });
    on('kt-q', 'keydown', e => { if (e.key === 'Enter') { f.query = e.target.value.trim(); applyFilters(); } });

    if (KT.loadedOnce && KT.items.length) { renderCachedList(); const sc = getScroller(); if (sc && KT.savedScroll) sc.scrollTop = KT.savedScroll; }
    else if (KT.loading) { const l = document.getElementById('kt-list'); if (l) l.innerHTML = skeleton(); }
    else loadFirst();
  }
  function applyFilters() { KT.loadedOnce = false; KT.savedScroll = 0; loadFirst(); }
  function renderCachedList() { const l = document.getElementById('kt-list'); if (l) { l.innerHTML = ''; appendCards(KT.items); } setSummary(); setupObserver(); }
  function setSummary(extra) {
    const el = document.getElementById('kt-sum-l'); if (!el) return;
    if (KT.lastTotal != null) el.innerHTML = 'Найдено: <b>' + KT.lastTotal + '</b> визит.' + (extra ? ' · ' + esc(extra) : '');
    else el.textContent = 'Показано: ' + KT.items.length + (extra ? ' · ' + extra : '');
  }

  function payload() {
    const f = KT.filters, p = { limit: 40 };
    if (f.dateFrom) p.dateFrom = f.dateFrom;
    if (f.dateTo) p.dateTo = f.dateTo;
    if (f.city) p.city = [f.city];
    if (f.opManager) p.opManager = [f.opManager];
    if (f.visitType) p.visitType = [f.visitType];
    if (f.matchStatus) p.matchStatus = [f.matchStatus];
    if (f.query) p.query = f.query;
    return p;
  }
  function loadFirst() {
    KT.reqSeq++;
    if (KT.ac) { try { KT.ac.abort(); } catch (_) {} KT.ac = null; }
    KT.loading = false; KT.items = []; KT.cursor = null; KT.hasMore = true; KT.lastTotal = null;
    const l = document.getElementById('kt-list'); if (l) l.innerHTML = '';
    setupObserver(); loadPage();
  }
  async function loadPage() {
    if (KT.loading || !KT.hasMore) return;
    KT.loading = true; const seq = KT.reqSeq;
    KT.ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const first = KT.items.length === 0;
    { const l = document.getElementById('kt-list'); if (first && l) l.innerHTML = skeleton(); }
    const p = payload(); if (KT.cursor) p.cursor = KT.cursor;
    try {
      const data = await window.TrafficAPI.archiveList(p, KT.ac ? KT.ac.signal : undefined);
      if (seq !== KT.reqSeq) return;
      const items = (data && data.items) || [];
      try { console.log('[Kartoteka] archive.list →', items.length, 'items · total', data && data.totalApprox); } catch (_) {}
      const l = document.getElementById('kt-list'); if (first && l) l.innerHTML = '';
      KT.items = KT.items.concat(items);
      KT.cursor = (data && data.nextCursor) || null; KT.hasMore = !!(data && data.hasMore);
      if (data && data.totalApprox != null) KT.lastTotal = data.totalApprox;
      KT.loadedOnce = true; appendCards(items); setSummary();
      if (!KT.items.length && l) l.innerHTML = '<div class="kt-empty">За выбранный период визитов нет</div>';
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (seq !== KT.reqSeq) return;
      try { console.warn('[Kartoteka] archive.list error', err && err.code, err && err.message); } catch (_) {}
      const l = document.getElementById('kt-list');
      if (first) { if (l) l.innerHTML = errBox(err); else showBody(errBox(err)); }
      else toast(window.TrafficAPI.parseApiError(err), 'e');
      setSummary('ошибка' + (err && err.code ? ' ' + err.code : ''));
    } finally { if (seq === KT.reqSeq) KT.loading = false; }
  }
  function setupObserver() {
    const s = document.getElementById('kt-sentinel');
    if (!s || typeof IntersectionObserver === 'undefined') return;
    if (KT.io) KT.io.disconnect();
    KT.io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) loadPage(); }), { rootMargin: '500px' });
    KT.io.observe(s);
  }
  function appendCards(items) {
    const l = document.getElementById('kt-list'); if (!l) return;
    l.insertAdjacentHTML('beforeend', items.map(cardHtml).join(''));
    while (l.children.length > 400) l.removeChild(l.firstElementChild);
    l.querySelectorAll('.kt-card:not([data-b])').forEach(c => { c.setAttribute('data-b', '1'); c.addEventListener('click', () => openVisit(c.getAttribute('data-key'))); });
  }
  function cardHtml(it) {
    const dt = parseDT(it.visit_date);
    const dateBlock = (dt && !dt.bad)
      ? `<div class="kt-cd"><b>${('0' + dt.d).slice(-2)}</b><i>${MON[dt.mo - 1]}</i><s>${dt.y}</s></div>`
      : `<div class="kt-cd bad"><b>?</b><s>дата</s></div>`;
    const mc = matchChip(it);
    const type = it.visit_type ? `<span class="kt-i">${I.car}${esc(it.visit_type)}</span>` : '';
    const city = it.city ? `<span class="kt-i">${I.pin}${esc(it.city)}</span>` : '';
    const ss = it.short_status ? `<span class="kt-ss">${esc(it.short_status)}</span>` : '';
    return `<div class="kt-card" data-key="${esc(it.traffic_record_key)}">
      ${dateBlock}
      <div class="kt-cm">
        <div class="kt-cn">${esc(it.client_name) || '<span class="kt-muted">Без ФИО</span>'}</div>
        <div class="kt-cp">${esc(it.phone_display) || '<span class="kt-muted">нет телефона</span>'}</div>
        <div class="kt-crow">${type}${city}${ss}</div>
      </div>
      <div class="kt-cr">
        <span class="kt-badge kt-badge-${mc.cls}">${esc(mc.txt)}</span>
        ${mc.sub ? `<span class="kt-cr-sub">${esc(mc.sub)}</span>` : ''}
        ${isArch(dt) ? '<span class="kt-tag kt-tag-arch">АРХИВНЫЙ</span>' : ''}
        <span class="kt-chev">${I.chev}</span>
      </div>
    </div>`;
  }
  function skeleton() { let s = ''; for (let i = 0; i < 6; i++) s += '<div class="kt-card kt-skel"><div class="kt-cd"></div><div class="kt-cm"><div class="kt-sk-line"></div><div class="kt-sk-line short"></div></div><div></div></div>'; return s; }

  /* ── НАВИГАЦИЯ (стек истории: список ↔ визит ↔ клиент) ── */
  const backBtn = (label) => `<button class="kt-back" onclick="Kartoteka.back()">${I.back}${esc(label || 'Назад')}</button>`;
  function back() {
    const f = KT.history.pop();
    if (typeof f === 'function') { try { f(); } catch (_) {} return; }
    KT.view = 'list'; KT.currentVisit = null; KT.currentClient = null; renderArchive();
  }

  /* ── КАРТОЧКА ВИЗИТА (inline) ── */
  async function openVisit(key) {
    const scrollBack = getScroller().scrollTop || 0;
    KT.history.push(() => { KT.view = 'list'; KT.currentVisit = null; renderArchive(); const sc = getScroller(); if (sc) sc.scrollTop = scrollBack; });
    KT.view = 'detail';
    showBody(backBtn('К списку') + '<div class="kt-empty">Загрузка…</div>');
    getScroller().scrollTop = 0;
    try { const data = await window.TrafficAPI.visitGet(key); KT.currentVisit = data.visit; renderVisit(data.visit); }
    catch (err) { showBody(backBtn('К списку') + errBox(err)); }
  }

  function row(label, value, opts) {
    if (value == null || value === '') return '';
    opts = opts || {};
    const cls = opts.link ? ' link' : '';
    // Кнопка копирования — через data-атрибут + addEventListener (bindVisitActions),
    // НЕ inline onclick со строковой интерполяцией (иначе XSS: HTML-энтити в
    // атрибуте декодируются до выполнения JS, и кавычка в данных ломает строку).
    const cp = opts.copy ? `<button class="kt-copy" data-copy="${esc(String(value))}" title="Копировать">${I.copy}</button>` : '';
    return `<div class="kt-r"><span class="kt-rl">${esc(label)}</span><span class="kt-rv${cls}">${esc(value)}${cp}</span></div>`;
  }
  function renderVisit(v) {
    const full = v.full || {};
    const dt = parseDT(v.visit_date);
    const mc = matchChip(v);
    const badDate = !dt || dt.bad;
    const chips = [v.visit_type, v.city, (v.op_manager ? (v.op_manager.split(' ')[0]) : '')].filter(Boolean)
      .map(c => `<span class="kt-chip">${esc(c)}</span>`).join('');
    const followup = full.followup_manager_raw || v.followup_manager_raw || '';
    const st = String(v.ui_status || v.match_status || '').toUpperCase();

    // amoCRM block
    let amo = '';
    if (st === 'MATCHED') {
      amo = row('Сделка', v.matched_deal_id ? '#' + v.matched_deal_id : '', { link: true }) +
        row('Этап', v.matched_stage) + row('Дата события', shortTsFull(v.matched_event_date)) +
        row('Ответственный', v.matched_crm_responsible_raw || v.matched_employee_raw) +
        row('ДОЖИМ ответственный', v.matched_dozhim_responsible_raw) +
        row('Разница дней', v.date_distance_days) + row('Причина закрытия', v.matched_close_reason) +
        row('Квалификация', v.matched_qualification) + row('Дата реализации', shortTsFull(v.matched_sale_date)) +
        row('Источник', v.matched_source);
    } else if (st === 'AMBIGUOUS') {
      amo = `<div class="kt-note">Несколько сделок клиента — конкретный визит выбрать нельзя.</div>` +
        (v.candidates || []).map(c => `<div class="kt-cand"><div class="kt-cand-h"><span class="kt-link">amoCRM #${esc(c.deal_id)}</span>${c.deal_url ? amoBtn(c.deal_url) : ''}</div>${row('Этап', c.stage)}${row('Ответственный', c.responsible)}${row('Дата визита', shortTsFull(c.visit_date))}${row('Дата реализации', shortTsFull(c.sale_date))}${row('Причина закрытия', c.close_reason)}${row('Город', c.city)}</div>`).join('');
    } else if (st === 'PHONE_ONLY') {
      amo = `<div class="kt-note">По телефону найдена сделка клиента, но конкретный визит не подтверждён.</div>` +
        (v.candidates || []).slice(0, 1).map(c => row('Сделка', '#' + c.deal_id, { link: true }) + row('Этап', c.stage) + (c.deal_url ? `<div style="margin-top:8px">${amoBtn(c.deal_url)}</div>` : '')).join('');
    } else if (st === 'NO_PHONE') { amo = `<div class="kt-note">У визита нет валидного телефона.</div>`; }
    else if (st === 'WAITING_AMO_SYNC') { amo = `<div class="kt-note">Ожидает синхронизации amoCRM.</div>`; }
    else { amo = `<div class="kt-note">amoCRM не найдена в текущей базе.</div>`; }

    const fresh = [v.traffic_synced_at ? 'Трафик ' + shortTs(v.traffic_synced_at) : '', v.amo_synced_at ? 'amoCRM ' + shortTs(v.amo_synced_at) : ''].filter(Boolean).join(' · ');

    showBody(`
      <button class="kt-back" onclick="Kartoteka.back()">${I.back}К списку</button>
      <div class="kt-vsum">
        <div class="kt-vtop"><span class="kt-vdate">${esc(fmtFull(dt))}</span><span class="kt-badge kt-badge-${mc.cls}">${esc(mc.txt)}</span>${isArch(dt) ? '<span class="kt-tag kt-tag-arch">АРХИВНЫЙ</span>' : ''}${badDate ? '<span class="kt-tag kt-tag-bad">Некорректная дата</span>' : ''}</div>
        <div class="kt-vid">ID: ${esc(v.traffic_record_key)}<button class="kt-copy" data-copy="${esc(String(v.traffic_record_key))}" title="Копировать">${I.copy}</button></div>
        <div class="kt-vchips">${chips}</div>
      </div>

      <div class="kt-sec"><div class="kt-sec-h">${I.user}<span class="kt-sec-t">Клиент</span></div>
        ${row('ФИО', v.client_name)}
        ${row('Телефон', v.phone_display, { copy: true, link: true })}
        ${full.result_comment ? `<div class="kt-longtext">${esc(full.result_comment)}</div>` : ''}
      </div>

      <div class="kt-sec"><div class="kt-sec-h">${I.salon}<span class="kt-sec-t">ОП (салон)</span></div>
        ${row('Менеджер', v.op_manager)}
        ${row('Источник', full.source || v.source)}
        ${row('Тип визита', v.visit_type)}
        ${row('Город', v.city)}
        ${row('Автомобиль', full.car_reference || v.car_reference)}
        ${row('VIN', full.vin || v.vin)}
      </div>

      ${(full.followup_comment || followup) ? `<div class="kt-sec"><div class="kt-sec-h">${I.dozhim}<span class="kt-sec-t">ДОЖИМ</span></div>
        ${followup ? `<div class="kt-r"><span class="kt-rl">Сотрудник</span><span class="kt-rv">${esc(followup)}${v.followup_manager_verified === true ? '' : ' <span class="kt-tag kt-tag-bad">не подтверждён</span>'}</span></div>` : ''}
        ${full.followup_comment ? `<div class="kt-longtext">${esc(full.followup_comment)}</div>` : ''}
      </div>` : ''}

      <div class="kt-sec"><div class="kt-sec-h">${I.link}<span class="kt-sec-t">Связь с amoCRM</span>${(st === 'MATCHED' && v.matched_deal_url) ? `<span class="kt-sec-badges">${amoBtn(v.matched_deal_url)}</span>` : ''}</div>
        <div class="kt-ev">${esc(EVID[v.evidence_code] || v.evidence_text || '')}</div>
        ${v.evidence_code ? `<div class="kt-ev-code">${esc(v.evidence_code)}</div>` : ''}
        ${amo}
      </div>

      <button class="kt-cta" data-client="${esc(String(v.phone_core || v.phone_display || ''))}">${I.user}Открыть карточку клиента</button>
      ${fresh ? `<div class="kt-empty" style="padding:12px 0 0;font-size:11px">${esc(fresh)}</div>` : ''}
    `);
    bindVisitActions();
    getScroller().scrollTop = 0;
  }
  // Навешиваем обработчики после innerHTML (без inline onclick — защита от XSS).
  function bindVisitActions() {
    const body = KT.el && KT.el.querySelector('#kt-body');
    if (!body) return;
    body.querySelectorAll('.kt-copy[data-copy]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); copy(b.getAttribute('data-copy')); }));
    const cta = body.querySelector('.kt-cta[data-client]');
    if (cta) cta.addEventListener('click', () => openClientOf(cta.getAttribute('data-client')));
  }
  function shortTsFull(v) { const dt = parseDT(v); return dt && !dt.bad ? fmtFull(dt) : (v ? '' : ''); }
  function amoBtn(url) { const u = String(url || ''); if (!/^https?:\/\//i.test(u)) return ''; return `<a class="kt-amo-btn" href="${esc(u)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${I.ext}Открыть в amoCRM</a>`; }

  /* ── ИСТОРИЯ КЛИЕНТА (досье, экран 3) ── */
  function fmtPhone(core) { const c = String(core || '').replace(/\D/g, ''); if (c.length !== 10) return String(core || ''); return '+7 ' + c.slice(0, 3) + ' ' + c.slice(3, 6) + '-' + c.slice(6, 8) + '-' + c.slice(8, 10); }
  function plural(n, one, few, many) { n = Math.abs(n) % 100; const n1 = n % 10; if (n > 10 && n < 20) return many; if (n1 > 1 && n1 < 5) return few; if (n1 === 1) return one; return many; }

  function openClientOf(phone) {
    if (!phone) { toast('У визита нет телефона', 'i'); return; }
    const v = KT.currentVisit;
    KT.history.push(() => { KT.view = 'detail'; KT.currentVisit = v; renderVisit(v); });
    openClientByPhone(phone);
  }
  async function openClientByPhone(phone) {
    KT.view = 'client';
    showBody(backBtn('Назад') + '<div class="kt-empty">Загрузка…</div>');
    getScroller().scrollTop = 0;
    try {
      const look = await window.TrafficAPI.clientLookup(phone);
      if (!look || !look.found || !look.client_key) { showBody(backBtn('Назад') + '<div class="kt-empty">Клиент с таким телефоном не найден в Картотеке.</div>'); return; }
      const data = await window.TrafficAPI.clientGet(look.client_key);
      KT.currentClient = data; renderClient(data);
    } catch (err) {
      const code = err && err.code;
      const msg = code === 'UNKNOWN_ACTION' ? 'История клиента скоро подключится (готовим backend Data Hub).'
        : code === 'INVALID_PHONE_INPUT' ? 'Проверьте номер телефона.'
        : window.TrafficAPI.parseApiError(err) + (code ? ' (' + code + ')' : '');
      showBody(backBtn('Назад') + `<div class="kt-empty">${esc(msg)}</div>`);
    }
  }

  function tlKind(e) {
    const t = String(e.event_type || '').toUpperCase();
    const vt = String(e.visit_type || '').toLowerCase();
    if (t === 'AMO_DEAL') return { color: 'blue', icon: I.deal };
    if (t === 'SALE') return { color: 'green', icon: I.sale };
    if (t === 'CALL' || vt.indexOf('звон') >= 0) return { color: 'grey', icon: I.phone };
    if (vt.indexOf('повтор') >= 0) return { color: 'orange', icon: I.car };
    return { color: 'green', icon: I.car };
  }
  function tlItem(e) {
    const dt = parseDT(e.event_date);
    const dstr = (dt && !dt.bad) ? `${('0' + dt.d).slice(-2)} ${MON[dt.mo - 1]} ${dt.y}` : 'ДАТА?';
    const time = (dt && dt.hh != null && (dt.hh || dt.mm)) ? `${('0' + dt.hh).slice(-2)}:${('0' + dt.mm).slice(-2)}` : '';
    const k = tlKind(e);
    const lines = (e.lines || []).filter(Boolean).map(l => `<div class="kt-tl-l">${esc(l)}</div>`).join('');
    const tap = e.traffic_record_key ? ` data-visit="${esc(e.traffic_record_key)}"` : (/^https?:/i.test(String(e.deal_url || '')) ? ` data-url="${esc(e.deal_url)}"` : '');
    const arch = e.is_archived ? '<span class="kt-tag kt-tag-arch">АРХИВНЫЙ</span>' : '';
    return `<div class="kt-tl-item${tap ? ' tap' : ''}"${tap}>
      <div class="kt-tl-date"><b>${esc(dstr)}</b>${time ? `<span>${esc(time)}</span>` : ''}</div>
      <div class="kt-tl-rail"><span class="kt-tl-ic kt-tl-${k.color}">${k.icon}</span></div>
      <div class="kt-tl-body">
        <div class="kt-tl-t">${esc(e.title || '')} ${arch}</div>${lines}
        ${tap ? `<span class="kt-tl-chev">${I.chev}</span>` : ''}
      </div>
    </div>`;
  }
  function renderClient(d) {
    const s = (d && d.summary) || {}, tl = (d && d.timeline) || [];
    const phone = (s.phones && s.phones[0]) ? fmtPhone(s.phones[0]) : '';
    const chips = [
      s.first_year ? 'Клиент с ' + s.first_year + ' года' : '',
      (s.traffic_count != null) ? s.traffic_count + ' ' + plural(s.traffic_count, 'визит', 'визита', 'визитов') : '',
      (s.deal_count != null) ? s.deal_count + ' ' + plural(s.deal_count, 'сделка', 'сделки', 'сделок') + ' в amoCRM' : '',
    ].filter(Boolean).map(c => `<span class="kt-cchip">${esc(c)}</span>`).join('');
    showBody(`
      ${backBtn('Назад')}
      <div class="kt-chead">
        <div class="kt-avatar">${I.avatar}</div>
        <div class="kt-chead-r">
          <div class="kt-cname">${esc(s.client_name || 'Клиент')}</div>
          ${phone ? `<div class="kt-cphone">${esc(phone)}<button class="kt-copy" data-copy="${esc(phone)}" title="Копировать">${I.copy}</button></div>` : ''}
          ${chips ? `<div class="kt-cmeta">${chips}</div>` : ''}
        </div>
      </div>
      ${tl.length ? `<div class="kt-tl">${tl.map(tlItem).join('')}</div>` : '<div class="kt-empty">История клиента пока пуста.</div>'}
      <div class="kt-infoblock">${I.info}<span>Здесь показана полная история клиента: все визиты, звонки и сделки из amoCRM. Архивные события помечаются по дате.</span></div>
    `);
    const body = KT.el && KT.el.querySelector('#kt-body');
    if (body) {
      body.querySelectorAll('.kt-copy[data-copy]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); copy(b.getAttribute('data-copy')); }));
      body.querySelectorAll('.kt-tl-item[data-visit]').forEach(el => el.addEventListener('click', () => openVisit(el.getAttribute('data-visit'))));
      body.querySelectorAll('.kt-tl-item[data-url]').forEach(el => el.addEventListener('click', () => { const u = el.getAttribute('data-url'); if (/^https?:/i.test(u)) window.open(u, '_blank', 'noopener'); }));
    }
    getScroller().scrollTop = 0;
  }

  /* ── ПОИСК КЛИЕНТА ── */
  function renderSearch() {
    showBody(`
      <div class="kt-search-screen">
        <div class="kt-search-lbl">Поиск клиента</div>
        <div class="kt-search-row">
          <input type="tel" class="kt-search-input" id="kt-ph" placeholder="Введите телефон клиента" value="${esc(KT.search.phone)}" inputmode="tel">
          <button class="kt-find" id="kt-find">Найти</button>
        </div>
        <div id="kt-search-out"></div>
      </div>`);
    const run = () => { const v = (document.getElementById('kt-ph') || {}).value || ''; doClientLookup(v.trim()); };
    const btn = document.getElementById('kt-find'); if (btn) btn.onclick = run;
    const inp = document.getElementById('kt-ph'); if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    if (!KT.search.phone) document.getElementById('kt-search-out').innerHTML = '<div class="kt-empty">Введите телефон клиента</div>';
  }
  function doClientLookup(phone) {
    KT.search.phone = phone;
    if (!phone) { const out = document.getElementById('kt-search-out'); if (out) out.innerHTML = '<div class="kt-empty">Введите телефон клиента</div>'; return; }
    // Возврат из досье — обратно на экран поиска.
    KT.history.push(() => { KT.sub = 'search'; if (KT.el) KT.el.querySelectorAll('.kt-tab').forEach(b => b.classList.toggle('on', b.getAttribute('data-kt-tab') === 'search')); renderSearch(); });
    openClientByPhone(phone);
  }

  /* ── СПРАВКА (accordion) ── */
  function renderHelp() {
    const qa = [
      ['Что такое Картотека?', 'Журнал салонных визитов Crystal Motors и их связи с amoCRM. Данные готовит Data Hub; приложение показывает небольшие срезы.'],
      ['Что значит «Связан»?', 'Есть одна надёжно выбранная сделка (телефон + дата + город или точная дата).'],
      ['Что значит «Несколько сделок»?', 'Есть несколько кандидатов и однозначно выбрать одну нельзя. В карточке показаны все кандидаты.'],
      ['Что значит «Только телефон»?', 'Сделка клиента найдена по телефону, но конкретный визит не подтверждён.'],
      ['Что значит «Нет связи»?', 'Телефон не найден в текущей базе amoCRM. Это не значит, что клиента там нет.'],
      ['Что значит «Ожидает sync»?', 'Выгрузка amoCRM может быть неполной — состояние ожидает синхронизации.'],
      ['Что значит «Архивный»?', 'Визит прошлого года. Это отдельный признак и не влияет на связь: старый визит может иметь новую сделку.'],
    ];
    showBody('<div class="kt-help">' + qa.map(([q, a]) => `<details class="kt-acc"><summary>${esc(q)}</summary><div class="kt-acc-body">${esc(a)}</div></details>`).join('') + '</div>');
  }

  function reload() {
    KT.booted = false; KT.loadedOnce = false; KT.items = []; KT.cursor = null; KT.hasMore = true; KT.lastTotal = null; KT.view = 'list'; KT.currentVisit = null;
    if (window.TrafficAPI) window.TrafficAPI.clearCache();
    render(KT.el);
  }

  window.Kartoteka = { render, reload, back, openVisit, copy, openClientOf };
})();
