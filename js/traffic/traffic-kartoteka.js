/* ═══════════════════════════════════════════════════════════════════════════
 * КАРТОТЕКА — UI (FAQ-подраздел). Экраны: Архив (журнал визитов) + Справка.
 * Данные — только через window.TrafficAPI (Data Hub read-only API).
 * НЕ качает всю базу: cursor-пагинация + infinite scroll (ТЗ §7, §15, §28).
 * Поиск клиента (досье) — следующий инкремент (нужен client.lookup backend).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const MON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const MON_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const AMO_LEAD = 'https://ksocm66.amocrm.ru/leads/detail/';

  const KT = {
    el: null, sub: 'archive', booted: false, meta: null, opts: null,
    items: [], cursor: null, hasMore: true, loading: false, reqSeq: 0, ac: null, io: null,
    filters: { dateFrom: '', dateTo: '', city: '', matchStatus: '', archiveMode: '', query: '' },
    showMore: false,
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function toast(m, t) { try { if (typeof window.toast === 'function') window.toast(m, t); } catch (_) {} }

  function fmtDateParts(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (!m) return null;
    return { d: m[3], mon: MON[+m[2] - 1] || '', monFull: MON_FULL[+m[2] - 1] || '', y: m[1] };
  }

  // Чип связи с amoCRM (§21). Возвращает {txt, cls, sub}.
  function matchChip(it) {
    const st = String(it.ui_status || it.match_status || '').toUpperCase();
    const cnt = Number(it.candidate_count || 0);
    switch (st) {
      case 'MATCHED':          return { txt: 'СВЯЗАН', cls: 'ok', sub: it.matched_deal_id ? 'amoCRM #' + it.matched_deal_id : 'amoCRM' };
      case 'AMBIGUOUS':        return { txt: 'НЕСКОЛЬКО СДЕЛОК', cls: 'warn', sub: 'amoCRM ×' + (cnt || '?') };
      case 'PHONE_ONLY':       return { txt: 'ТОЛЬКО ТЕЛЕФОН', cls: 'phone', sub: 'amoCRM по телефону' };
      case 'NO_MATCH':         return { txt: 'НЕТ СВЯЗИ', cls: 'none', sub: 'не найдена в базе' };
      case 'NO_PHONE':         return { txt: 'НЕТ ТЕЛЕФОНА', cls: 'muted', sub: '' };
      case 'WAITING_AMO_SYNC': return { txt: 'ОЖИДАЕТ SYNC', cls: 'wait', sub: 'синхронизация amoCRM' };
      default:                 return { txt: st || '—', cls: 'muted', sub: '' };
    }
  }
  function evidenceText(code, fallback) {
    const m = {
      PHONE_DATE_CITY: 'телефон + дата + город',
      PHONE_DATE_EXACT: 'телефон + точная дата',
      PHONE_NEAR_DATE_CITY: 'телефон + город + дата ±1 день',
      MULTIPLE_ROBUST_MATCHES: 'несколько надёжных кандидатов',
      MULTIPLE_PHONE_CANDIDATES: 'несколько сделок по телефону',
      PHONE_ONLY_ONE_DEAL: 'одна сделка клиента по телефону — конкретный визит не подтверждён',
      PHONE_NOT_FOUND_IN_AMO: 'телефон не найден в текущей базе amoCRM',
      PHONE_NOT_FOUND_AMO_MAY_BE_STALE: 'телефон не найден — выгрузка amoCRM может быть неполной',
      NO_VALID_PHONE: 'нет валидного телефона',
    };
    return m[code] || fallback || '';
  }

  /* ── SHELL ── */
  function render(el) {
    KT.el = el;
    if (!window.TrafficAPI || !window.TrafficAPI.isConfigured()) {
      el.innerHTML = '<div class="kt-empty">Картотека ещё не подключена.</div>';
      return;
    }
    el.innerHTML = `
      <div id="kt-app">
        <div class="kt-head">
          <div class="kt-eyebrow">FAQ</div>
          <div class="kt-title">Картотека</div>
          <div class="kt-subtitle">Архив визитов и связи с amoCRM</div>
          <div class="kt-tabs">
            <button class="kt-tab ${KT.sub === 'archive' ? 'on' : ''}" data-kt-tab="archive">Архив</button>
            <button class="kt-tab ${KT.sub === 'help' ? 'on' : ''}" data-kt-tab="help">Справка</button>
          </div>
        </div>
        <div id="kt-body"></div>
      </div>`;
    el.querySelectorAll('[data-kt-tab]').forEach(b => b.onclick = () => setSub(b.getAttribute('data-kt-tab')));
    ensureBoot().then(renderSub).catch(err => showBody(errBox(err)));
  }

  function setSub(sub) {
    KT.sub = sub;
    KT.el.querySelectorAll('.kt-tab').forEach(b => b.classList.toggle('on', b.getAttribute('data-kt-tab') === sub));
    renderSub();
  }
  function showBody(html) { const b = KT.el && KT.el.querySelector('#kt-body'); if (b) b.innerHTML = html; }
  function errBox(err) {
    const msg = window.TrafficAPI ? window.TrafficAPI.parseApiError(err) : 'Ошибка';
    return `<div class="kt-empty">${esc(msg)}<div><button class="kt-btn" onclick="Kartoteka.reload()">Повторить</button></div></div>`;
  }

  async function ensureBoot() {
    if (KT.booted) return;
    const data = await window.TrafficAPI.bootstrap();
    KT.meta = data.meta || {};
    KT.opts = data.filters || {};
    KT.counts = data.counts || {};
    KT.booted = true;
  }

  function renderSub() {
    if (KT.sub === 'help') return renderHelp();
    return renderArchive();
  }

  /* ── АРХИВ ── */
  function renderArchive() {
    const opts = KT.opts || {};
    const cityOpts = (opts.city || []).map(c => `<option value="${esc(c)}"${KT.filters.city === c ? ' selected' : ''}>${esc(c)}</option>`).join('');
    const statusChips = [
      ['', 'Все'], ['MATCHED', 'Связан'], ['AMBIGUOUS', 'Неск. сделок'],
      ['PHONE_ONLY', 'По телефону'], ['NO_MATCH', 'Нет связи'],
    ].map(([v, l]) => `<button class="kt-chip ${KT.filters.matchStatus === v ? 'on' : ''}" data-kt-status="${v}">${l}</button>`).join('');

    showBody(`
      <div class="kt-filters">
        <div class="kt-frow">
          <input type="date" class="kt-date" id="kt-from" value="${esc(KT.filters.dateFrom)}" aria-label="Дата с">
          <span class="kt-dash">—</span>
          <input type="date" class="kt-date" id="kt-to" value="${esc(KT.filters.dateTo)}" aria-label="Дата по">
          <select class="kt-select" id="kt-city"><option value="">Все города</option>${cityOpts}</select>
        </div>
        <div class="kt-chips">${statusChips}</div>
        <div class="kt-frow">
          <input type="search" class="kt-search" id="kt-q" placeholder="Поиск по телефону, ФИО или комментарию…" value="${esc(KT.filters.query)}">
          <button class="kt-btn kt-more" id="kt-more-btn">${KT.showMore ? 'Скрыть' : 'Ещё'}</button>
        </div>
        <div class="kt-more-box" ${KT.showMore ? '' : 'hidden'}>
          <label class="kt-check"><input type="checkbox" id="kt-arch-archived" ${KT.filters.archiveMode === 'archived' ? 'checked' : ''}> Только архивные (прошлые годы)</label>
          <label class="kt-check"><input type="checkbox" id="kt-arch-current" ${KT.filters.archiveMode === 'current' ? 'checked' : ''}> Только текущий год</label>
          <label class="kt-check"><input type="checkbox" id="kt-arch-bad" ${KT.filters.archiveMode === 'bad_date' ? 'checked' : ''}> С ошибкой в дате</label>
        </div>
      </div>
      <div class="kt-summary" id="kt-summary"></div>
      <div class="kt-list" id="kt-list"></div>
      <div id="kt-sentinel" class="kt-sentinel"></div>
      <div id="kt-visit-overlay"></div>
    `);

    // фильтры
    const on = (id, ev, fn) => { const e = document.getElementById(id); if (e) e.addEventListener(ev, fn); };
    on('kt-from', 'change', e => { KT.filters.dateFrom = e.target.value; applyFilters(); });
    on('kt-to', 'change', e => { KT.filters.dateTo = e.target.value; applyFilters(); });
    on('kt-city', 'change', e => { KT.filters.city = e.target.value; applyFilters(); });
    on('kt-q', 'keydown', e => { if (e.key === 'Enter') { KT.filters.query = e.target.value.trim(); applyFilters(); } });
    on('kt-more-btn', 'click', () => { KT.showMore = !KT.showMore; renderArchive(); });
    ['archived', 'current', 'bad'].forEach(mode => {
      on('kt-arch-' + mode, 'change', e => {
        const val = mode === 'bad' ? 'bad_date' : mode;
        KT.filters.archiveMode = e.target.checked ? val : '';
        // взаимоисключающие
        ['archived', 'current', 'bad'].forEach(o => { if (o !== mode) { const c = document.getElementById('kt-arch-' + o); if (c) c.checked = false; } });
        applyFilters();
      });
    });
    KT.el.querySelectorAll('[data-kt-status]').forEach(b => b.onclick = () => { KT.filters.matchStatus = b.getAttribute('data-kt-status'); applyFilters(); });

    loadFirst();
  }

  function applyFilters() { loadFirst(); }

  function payloadFromFilters() {
    const f = KT.filters, p = { limit: 40 };
    if (f.dateFrom) p.dateFrom = f.dateFrom;
    if (f.dateTo) p.dateTo = f.dateTo;
    if (f.city) p.city = [f.city];
    if (f.matchStatus) p.matchStatus = [f.matchStatus];
    if (f.archiveMode) p.archiveMode = f.archiveMode;
    if (f.query) p.query = f.query;
    return p;
  }

  function loadFirst() {
    KT.items = []; KT.cursor = null; KT.hasMore = true; KT.reqSeq++;
    const list = document.getElementById('kt-list');
    if (list) list.innerHTML = '';
    const sum = document.getElementById('kt-summary');
    if (sum) sum.textContent = '';
    setupObserver();
    loadPage();
  }

  async function loadPage() {
    if (KT.loading || !KT.hasMore) return;
    KT.loading = true;
    const seq = KT.reqSeq;
    if (KT.ac) { try { KT.ac.abort(); } catch (_) {} }
    KT.ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;

    const list = document.getElementById('kt-list');
    const skeleton = KT.items.length === 0;
    if (skeleton && list) list.innerHTML = ktSkeleton();

    const p = payloadFromFilters();
    if (KT.cursor) p.cursor = KT.cursor;
    try {
      const data = await window.TrafficAPI.archiveList(p, KT.ac ? KT.ac.signal : undefined);
      if (seq !== KT.reqSeq) return; // устарело
      if (skeleton && list) list.innerHTML = '';
      KT.items = KT.items.concat(data.items || []);
      KT.cursor = data.nextCursor || null;
      KT.hasMore = !!data.hasMore;
      appendCards(data.items || []);
      const sum = document.getElementById('kt-summary');
      if (sum) sum.textContent = data.totalApprox != null ? ('Найдено: ' + data.totalApprox + ' визитов') : ('Показано: ' + KT.items.length);
      if (!KT.items.length && list) list.innerHTML = '<div class="kt-empty">За выбранный период визитов нет</div>';
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (seq !== KT.reqSeq) return;
      if (skeleton && list) list.innerHTML = errBox(err);
      else toast(window.TrafficAPI.parseApiError(err), 'e');
    } finally {
      if (seq === KT.reqSeq) KT.loading = false;
    }
  }

  function setupObserver() {
    const sentinel = document.getElementById('kt-sentinel');
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    if (KT.io) KT.io.disconnect();
    KT.io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) loadPage(); });
    }, { rootMargin: '400px' });
    KT.io.observe(sentinel);
  }

  function appendCards(items) {
    const list = document.getElementById('kt-list');
    if (!list) return;
    const html = items.map(cardHtml).join('');
    list.insertAdjacentHTML('beforeend', html);
    // §28: ограничиваем DOM — режем самые старые карточки.
    while (list.children.length > 400) list.removeChild(list.firstElementChild);
    list.querySelectorAll('.kt-card:not([data-bound])').forEach(c => {
      c.setAttribute('data-bound', '1');
      c.addEventListener('click', () => openVisit(c.getAttribute('data-key')));
    });
  }

  function cardHtml(it) {
    const dp = fmtDateParts(it.visit_date);
    const badDate = String(it.date_quality) !== 'VALID';
    const dateBlock = dp
      ? `<div class="kt-cd"><b>${dp.d}</b><span>${dp.mon}</span><span>${dp.y}</span></div>`
      : `<div class="kt-cd kt-cd-bad"><b>?</b><span>дата</span></div>`;
    const mc = matchChip(it);
    const archived = it.is_archived === true ? '<span class="kt-tag kt-tag-arch">АРХИВНЫЙ</span>' : '';
    const vt = it.visit_type ? `<span class="kt-mini">${esc(it.visit_type)}</span>` : '';
    const city = it.city ? `<span class="kt-mini">📍 ${esc(it.city)}</span>` : '';
    const status = it.short_status ? `<span class="kt-ss">${esc(it.short_status)}</span>` : '';
    return `
      <div class="kt-card" data-key="${esc(it.traffic_record_key)}">
        ${dateBlock}
        <div class="kt-cm">
          <div class="kt-cn">${esc(it.client_name) || '<span class="kt-muted">Без ФИО</span>'}</div>
          <div class="kt-cp">${esc(it.phone_display) || '<span class="kt-muted">нет телефона</span>'}</div>
          <div class="kt-crow">${vt}${city}${status}</div>
        </div>
        <div class="kt-cr">
          <span class="kt-badge kt-badge-${mc.cls}">${esc(mc.txt)}</span>
          ${mc.sub ? `<span class="kt-sub">${esc(mc.sub)}</span>` : ''}
          ${archived}
        </div>
      </div>`;
  }

  function ktSkeleton() {
    let s = '';
    for (let i = 0; i < 6; i++) s += '<div class="kt-card kt-skel"><div class="kt-cd"></div><div class="kt-cm"><div class="kt-sk-line"></div><div class="kt-sk-line short"></div></div></div>';
    return s;
  }

  /* ── КАРТОЧКА ВИЗИТА (full-screen sheet) ── */
  async function openVisit(key) {
    const ov = document.getElementById('kt-visit-overlay');
    if (!ov) return;
    ov.innerHTML = `<div class="kt-sheet"><div class="kt-sheet-head"><button class="kt-back" onclick="Kartoteka.closeVisit()">← К списку</button></div><div class="kt-sheet-body"><div class="kt-empty">Загрузка…</div></div></div>`;
    ov.classList.add('on');
    document.body.classList.add('kt-noscroll');
    try {
      const data = await window.TrafficAPI.visitGet(key);
      renderVisitSheet(data.visit);
    } catch (err) {
      const body = ov.querySelector('.kt-sheet-body');
      if (body) body.innerHTML = errBox(err);
    }
  }
  function closeVisit() {
    const ov = document.getElementById('kt-visit-overlay');
    if (ov) { ov.classList.remove('on'); ov.innerHTML = ''; }
    document.body.classList.remove('kt-noscroll');
  }

  function row(label, value) { return value ? `<div class="kt-r"><span class="kt-rl">${esc(label)}</span><span class="kt-rv">${esc(value)}</span></div>` : ''; }

  function renderVisitSheet(v) {
    const ov = document.getElementById('kt-visit-overlay');
    if (!ov || !v) return;
    const full = v.full || {};
    const dp = fmtDateParts(v.visit_date);
    const dateStr = dp ? `${dp.d} ${dp.monFull} ${dp.y}` : 'ДАТА?';
    const mc = matchChip(v);
    const archived = v.is_archived === true ? '<span class="kt-tag kt-tag-arch">АРХИВНЫЙ</span>' : '';
    const badDate = String(v.date_quality) !== 'VALID' ? '<span class="kt-tag kt-tag-bad">Некорректная дата</span>' : '';

    // Роль сотрудника ДОЖИМ показываем только если verified (§0.7).
    const followup = full.followup_manager_raw || v.followup_manager_raw || '';
    const followupVerified = v.followup_manager_verified === true;

    // amoCRM block
    let amo = '';
    const st = String(v.ui_status || v.match_status || '').toUpperCase();
    if (st === 'MATCHED') {
      amo = `
        ${row('Сделка', 'amoCRM #' + v.matched_deal_id)}
        ${row('Этап', v.matched_stage)}
        ${row('Ответственный', v.matched_crm_responsible_raw || v.matched_employee_raw)}
        ${row('CRM Ответственный', v.matched_crm_responsible_raw)}
        ${row('ДОЖИМ Ответственный', v.matched_dozhim_responsible_raw)}
        ${row('Дата события', v.matched_event_date)}
        ${row('Разница дней', v.date_distance_days)}
        ${row('Причина закрытия', v.matched_close_reason)}
        ${row('Квалификация', v.matched_qualification)}
        ${row('Дата реализации', v.matched_sale_date)}
        ${row('Источник', v.matched_source)}
        ${v.matched_deal_url ? `<a class="kt-amo-link" href="${esc(v.matched_deal_url)}" target="_blank" rel="noopener">Открыть в amoCRM</a>` : ''}`;
    } else if (st === 'AMBIGUOUS') {
      const cands = (v.candidates || []).map(c => `
        <div class="kt-cand">
          <div class="kt-cand-h"><b>amoCRM #${esc(c.deal_id)}</b>${c.deal_url ? ` <a href="${esc(c.deal_url)}" target="_blank" rel="noopener">открыть</a>` : ''}</div>
          ${row('Этап', c.stage)}${row('Ответственный', c.responsible)}${row('Дата визита', c.visit_date)}${row('Дата реализации', c.sale_date)}${row('Причина закрытия', c.close_reason)}${row('Источник', c.source)}
        </div>`).join('');
      amo = `<div class="kt-note">Несколько сделок клиента — конкретный визит выбрать нельзя.</div>${cands || row('Кандидаты', (v.candidate_deal_ids || ''))}`;
    } else if (st === 'PHONE_ONLY') {
      amo = `<div class="kt-note">Есть сделка клиента по телефону, но конкретный визит не подтверждён.</div>` +
        ((v.candidates || []).slice(0, 1).map(c => `${row('Сделка', 'amoCRM #' + c.deal_id)}${row('Этап', c.stage)}${c.deal_url ? `<a class="kt-amo-link" href="${esc(c.deal_url)}" target="_blank" rel="noopener">Открыть в amoCRM</a>` : ''}`).join(''));
    } else if (st === 'NO_PHONE') {
      amo = `<div class="kt-note">У визита нет валидного телефона.</div>`;
    } else if (st === 'WAITING_AMO_SYNC') {
      amo = `<div class="kt-note">Выгрузка amoCRM может быть неполной. Ожидает синхронизации.</div>`;
    } else {
      amo = `<div class="kt-note">Сделка не найдена в текущей базе amoCRM.</div>`;
    }

    const fresh = [
      v.traffic_synced_at ? 'Трафик ' + shortTs(v.traffic_synced_at) : '',
      v.amo_synced_at ? 'amoCRM ' + shortTs(v.amo_synced_at) : '',
    ].filter(Boolean).join(' · ');

    const body = ov.querySelector('.kt-sheet-body');
    body.innerHTML = `
      <div class="kt-vhead">
        <div class="kt-vdate">${esc(dateStr)}</div>
        <div class="kt-vtags"><span class="kt-badge kt-badge-${mc.cls}">${esc(mc.txt)}</span>${archived}${badDate}</div>
        <div class="kt-vid">ID: ${esc(v.traffic_record_key)}</div>
      </div>

      <div class="kt-sec"><div class="kt-sec-t">👤 Клиент</div>
        ${row('ФИО', v.client_name)}
        ${row('Телефон', v.phone_display)}
        ${row('Комментарий', full.result_comment ? '' : '')}
      </div>

      <div class="kt-sec"><div class="kt-sec-t">🏢 Визит</div>
        ${row('Город', v.city)}
        ${row('Тип', v.visit_type)}
        ${row('Источник', full.source || v.source)}
        ${row('Менеджер ОП', v.op_manager)}
        ${row('Автомобиль', full.car_reference || v.car_reference)}
        ${row('VIN', full.vin || v.vin)}
        ${row('Статус', v.short_status)}
        ${row('Проблема с авто', full.car_problem)}
      </div>

      ${full.result_comment ? `<div class="kt-sec"><div class="kt-sec-t">📝 Итог / комментарий</div><div class="kt-longtext">${esc(full.result_comment)}</div></div>` : ''}

      ${(full.followup_comment || followup) ? `<div class="kt-sec"><div class="kt-sec-t">🔁 ДОЖИМ</div>
        ${full.followup_comment ? `<div class="kt-longtext">${esc(full.followup_comment)}</div>` : ''}
        ${followup ? `<div class="kt-r"><span class="kt-rl">Сотрудник</span><span class="kt-rv">${esc(followup)}${followupVerified ? '' : ' <span class="kt-unv">не подтверждён</span>'}</span></div>` : ''}
      </div>` : ''}

      <div class="kt-sec"><div class="kt-sec-t">🔗 Связь с amoCRM</div>
        <div class="kt-ev">${esc(evidenceText(v.evidence_code, v.evidence_text))}</div>
        ${amo}
      </div>

      ${fresh ? `<div class="kt-fresh">${esc(fresh)}</div>` : ''}
    `;
  }

  function shortTs(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const p = n => ('0' + n).slice(-2);
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ── СПРАВКА (§17, §21, §56) ── */
  function renderHelp() {
    showBody(`
      <div class="kt-help">
        <p><b>Картотека</b> — журнал салонных визитов Crystal Motors и их связи с amoCRM. Данные готовит Data Hub; приложение показывает небольшие срезы.</p>
        <div class="kt-help-b"><b>СВЯЗАН</b> — одна надёжно выбранная сделка (телефон + дата + город/точная дата).</div>
        <div class="kt-help-b"><b>НЕСКОЛЬКО СДЕЛОК</b> — есть кандидаты, но однозначно выбрать нельзя. В карточке — все кандидаты.</div>
        <div class="kt-help-b"><b>ТОЛЬКО ТЕЛЕФОН</b> — сделка клиента найдена по телефону, но конкретный визит не подтверждён.</div>
        <div class="kt-help-b"><b>НЕТ СВЯЗИ</b> — телефон не найден в текущей базе amoCRM (не значит, что клиента нет).</div>
        <div class="kt-help-b"><b>АРХИВНЫЙ</b> — визит прошлого года. Не влияет на связь: старый визит может иметь новую сделку amoCRM.</div>
      </div>`);
  }

  function reload() { KT.booted = false; if (window.TrafficAPI) window.TrafficAPI.clearCache(); render(KT.el); }

  window.Kartoteka = { render, reload, closeVisit, openVisit };
})();
