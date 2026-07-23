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
  // Из ячейки вытаскиваем ВСЕ номера → массив 10-значных «ядер».
  // Ячейка может содержать несколько номеров (через , ; / перенос), мусорный
  // текст и любые форматы: +7 (923) 680-92-56, .../89199202520, 89028012585,
  // '+79322515905, 9322515745 Альбина, 9050815802 и т.п.
  function extractPhones(cell) {
    const out = new Set();
    String(cell == null ? '' : cell).split(/[,;/\n]+/).forEach(part => {
      let d = part.replace(/\D/g, '');
      // греедли вытаскиваем номера из возможной склейки
      while (d.length >= 10) {
        let core;
        if (d.length >= 11 && (d[0] === '7' || d[0] === '8')) { core = d.slice(1, 11); d = d.slice(11); }
        else { core = d.slice(0, 10); d = d.slice(10); }
        if (core.length === 10) out.add(core); else break;
      }
    });
    return [...out];
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
    // В выгрузке amoCRM встречаются одноимённые поля контакта и сделки.
    // Актуальный источник сделки находится в последнем столбце с точным
    // заголовком «Источник обращения». Похожие source/utm-поля не используем.
    const sourceColumns = H['Источник обращения'] || [];
    const idSrc = sourceColumns[sourceColumns.length - 1];
    const idDozhimVisit = (H['Повторная дата визита (ДОЖИМ)'] || [])[0];
    const idDozhimResp = (H['ДОЖИМ Ответственный'] || [])[0];
    const deals = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row.length) continue;
      const visitRaw = idVisit != null ? String(row[idVisit] || '').trim() : '';
      const dozhimVisitRaw = idDozhimVisit != null ? String(row[idDozhimVisit] || '').trim() : '';
      const dozhimResp = idDozhimResp != null ? String(row[idDozhimResp] || '').trim() : '';
      // берём сделку с осн. датой визита ИЛИ дожимной (когда «ДОЖИМ Ответственный» пуст)
      if (!visitRaw && !(dozhimVisitRaw && !dozhimResp)) continue;
      const phones = new Set();
      phoneIdx.forEach(i => { extractPhones(row[i]).forEach(p => phones.add(p)); });
      deals.push({
        id: idId != null ? String(row[idId] || '').trim() : '',
        responsible: idResp != null ? String(row[idResp] || '').trim() : '',
        visitRaw, visit: parseDMY(visitRaw),
        dozhimVisit: parseDMY(dozhimVisitRaw), dozhimResp,
        success: idSucc != null ? String(row[idSucc] || '').trim() : '',
        city: idCity != null ? String(row[idCity] || '').trim() : '',
        source: idSrc != null ? String(row[idSrc] || '').trim() : '',
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

  // ── разбор листа ВИЗИТЫ (A,C,D,E,F,G,I = 0,2,3,4,5,6,8) ────────────────
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
      const vphones = extractPhones(phoneRaw);
      out.push({
        rowNo: i + 1,
        dateRaw: date, date: parseDMY(date),
        phoneRaw, phone: vphones[0] || normPhone(phoneRaw), phones: vphones,
        city: String(row[3] || '').trim(),
        comment: String(row[4] || '').trim(),
        source: String(row[5] || '').trim(),
        category: String(row[6] || '').trim(),
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
      // у визита может быть несколько номеров — матчим по любому совпавшему
      const vphones = (v.phones && v.phones.length) ? v.phones : (v.phone ? [v.phone] : []);
      const seenDeal = new Set();
      const dealsForPhone = vphones.flatMap(p => byPhone.get(p) || []).filter(d => { const k = d.id || d; if (seenDeal.has(k)) return false; seenDeal.add(k); return true; });
      const distinctIds = [...new Set(dealsForPhone.map(d => d.id).filter(Boolean))];
      // выбираем эталонную сделку: с лучшим совпадением даты, иначе первую
      let deal = null;
      if (dealsForPhone.length) {
        const dd = d => [d.visit, (d.dozhimVisit && !d.dozhimResp) ? d.dozhimVisit : null].filter(Boolean);
        deal = dealsForPhone.find(d => v.date && dd(d).some(x => x.d === v.date.d && x.m === v.date.m && x.y === v.date.y))
          || dealsForPhone.find(d => v.date && dd(d).some(x => x.m === v.date.m && x.y === v.date.y))
          || dealsForPhone[0];
      }
      const checks = {};
      // ТЕЛЕФОН (критично)
      checks.phone = !vphones.length ? 'fail' : (dealsForPhone.length ? 'ok' : 'fail');
      if (deal) {
        // ДАТА (критично): полное дд.мм.гггг → ok, иначе мм.гггг → month, иначе fail.
        // Если осн. «Дата визита» не совпала, но «Повторная дата визита (ДОЖИМ)»
        // попадает в проверяемый месяц И «ДОЖИМ Ответственный» пуст — верим дожим-дате.
        if (v.date) {
          const cands = [];
          if (deal.visit) cands.push(deal.visit);
          if (deal.dozhimVisit && !deal.dozhimResp) cands.push(deal.dozhimVisit);
          let best = 'fail';
          for (const d of cands) {
            if (d.d === v.date.d && d.m === v.date.m && d.y === v.date.y) { best = 'ok'; break; }
            if (d.m === v.date.m && d.y === v.date.y) best = 'month';
          }
          checks.date = best;
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

    const byField = { date: 0, phone: 0, manager: 0, source: 0 };
    results.forEach(r => vrBadFields(r).forEach(f => { if (f in byField) byField[f]++; }));
    const stats = {
      total: results.length,
      ok: results.filter(r => r.status === 'ok').length,
      warn: results.filter(r => r.status === 'warn').length,
      fail: results.filter(r => r.status === 'fail').length,
      correct: results.filter(r => r.bucket === 'correct'),
      attention: results.filter(r => r.bucket === 'attention'),
      byField,
    };
    return { results, stats };
  }
  // Поля с несоответствием (для фильтров по типам)
  function vrBadFields(r) {
    const c = r.checks, out = [];
    if (c.date === 'fail' || c.date === 'month') out.push('date');
    if (c.phone === 'fail') out.push('phone');
    if (c.manager === 'fail') out.push('manager');
    if (c.source === 'fail' || c.source === 'warm-bad') out.push('source');
    if (c.city === 'fail') out.push('city');
    if (c.comment === 'fail') out.push('comment');
    return out;
  }

  // ── навигация / доступ ────────────────────────────────────────────────
  function host() { return document.getElementById('c-sverka'); }
  function canView() {
    const u = typeof window.findUserInSheet === 'function' ? window.findUserInSheet() : null;
    return !!(u && typeof window.isCeoLike === 'function' && window.isCeoLike(u.role));
  }

  // ── персистентность отчёта (как в «Аналитике CRM») ───────────────────
  // Лёгкая мета — в localStorage (мгновенно решаем report/start без await),
  // тяжёлые массивы (deals/vizRows/results) — в IndexedDB. Загруженный файл
  // «остаётся на месте» при переходе в другой раздел и возврате, и даже
  // переживает перезагрузку нативной оболочки.
  const VR_LS_KEY = 'crmSverkaMeta';
  const VR_IDB = { name: 'crmSverka', store: 'kv', key: 'state', ver: 1 };
  function vrIdbOpen() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('no-idb'));
      const req = indexedDB.open(VR_IDB.name, VR_IDB.ver);
      req.onupgradeneeded = () => { try { req.result.createObjectStore(VR_IDB.store); } catch (_) {} };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb-open'));
    });
  }
  async function vrIdbSet(value) {
    const db = await vrIdbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VR_IDB.store, 'readwrite');
      tx.objectStore(VR_IDB.store).put(value, VR_IDB.key);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  async function vrIdbGet() {
    const db = await vrIdbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VR_IDB.store, 'readonly');
      const r = tx.objectStore(VR_IDB.store).get(VR_IDB.key);
      r.onsuccess = () => { db.close(); resolve(r.result || null); };
      r.onerror = () => { db.close(); reject(r.error); };
    });
  }
  async function vrIdbDelete() {
    const db = await vrIdbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VR_IDB.store, 'readwrite');
      tx.objectStore(VR_IDB.store).delete(VR_IDB.key);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  function vrPersist() {
    if (!VR.stats || !VR.results || !VR.results.length) return;
    try {
      localStorage.setItem(VR_LS_KEY, JSON.stringify({
        fileName: VR.fileName, suffix: VR.suffix, monthLabel: VR.monthLabel,
        stats: VR.stats, t: Date.now()
      }));
    } catch (_) {}
    vrIdbSet({
      deals: VR.deals, vizRows: VR.vizRows, results: VR.results, stats: VR.stats,
      suffix: VR.suffix, monthLabel: VR.monthLabel, fileName: VR.fileName
    }).catch(() => {});
  }
  function vrReadMeta() {
    try {
      const raw = localStorage.getItem(VR_LS_KEY);
      if (!raw) return null;
      const m = JSON.parse(raw);
      return (m && m.suffix && m.stats) ? m : null;
    } catch (_) { return null; }
  }
  async function vrHydrateAndRender() {
    try {
      const st = await vrIdbGet();
      if (st && Array.isArray(st.results) && st.results.length) {
        VR.deals = st.deals || []; VR.vizRows = st.vizRows || [];
        VR.results = st.results; VR.stats = st.stats || VR.stats;
        VR.suffix = st.suffix || VR.suffix; VR.monthLabel = st.monthLabel || VR.monthLabel;
        VR.fileName = st.fileName || VR.fileName;
        renderReport();
        return;
      }
    } catch (_) {}
    renderStart();
  }

  window.openVisitReconciliation = function openVisitReconciliation() {
    if (!canView()) return;
    if (typeof window.closeAllDockPopups === 'function') window.closeAllDockPopups();
    if (typeof window.showScr === 'function') window.showScr('sverka');
    if (typeof window.dockSetActive === 'function') window.dockSetActive('analytics');
    // Персист: отчёт уже в памяти → показываем; иначе восстанавливаем из хранилища.
    if (VR.results && VR.results.length && VR.stats) {
      renderReport();
    } else {
      const meta = vrReadMeta();
      if (meta) {
        VR.fileName = meta.fileName || ''; VR.suffix = meta.suffix || '';
        VR.monthLabel = meta.monthLabel || ''; VR.stats = meta.stats || null;
        const h = host();
        if (h) h.innerHTML = shell(`<div class="vr-start"><div class="vr-drop"><div class="vr-drop-t">Восстановление сохранённого отчёта…</div></div></div>`);
        vrHydrateAndRender();
      } else {
        renderStart();
      }
    }
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
            <button class="vr-icon-btn" id="vr-eject" type="button" aria-label="Извлечь отчёт" title="Извлечь отчёт">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11 12 4l7 7H5Z"/><path d="M5 16h14v3H5z"/></svg>
            </button>
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
    const eb = document.getElementById('vr-eject');
    if (eb) eb.onclick = ejectReport;
    const rb = document.getElementById('vr-refresh');
    if (rb) rb.onclick = vrRefresh;
  }
  async function ejectReport() {
    if (VR.busy) return;
    VR.fileName = ''; VR.deals = []; VR.suffix = ''; VR.monthLabel = '';
    VR.vizRows = []; VR.results = []; VR.stats = null; VR.steps = []; VR.errors = [];
    try { localStorage.removeItem(VR_LS_KEY); } catch (_) {}
    try { await vrIdbDelete(); } catch (_) {}
    renderStart();
    if (typeof window.toast === 'function') window.toast('Отчёт извлечён', 's');
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
        vrPersist();   // обновлённый отчёт тоже сохраняем
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
    vrPersist();   // сохраняем отчёт, чтобы файл «оставался на месте» между разделами
    renderScan();
  }

  // ── 3) экран отчёта ──────────────────────────────────────────────────
  function renderReport() {
    const h = host(); if (!h) return;
    const s = VR.stats;
    if (!s) { renderScan(); return; }
    const sourceFixCount = VR.results.filter(r => r.deal && normText(r.deal.source) && normText(r.viz.source) !== normText(r.deal.source)).length;
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
        <div class="vr-field-filters" id="vr-field-filters">
          <span class="vr-ff-lbl">Несоответствия:</span>
          ${[['date', 'Дата'], ['phone', 'Телефон'], ['manager', 'Менеджер'], ['source', 'Источник']].map(([k, l]) => {
            const n = s.byField[k] || 0;
            return `<button class="vr-ff-btn" data-vr-field="${k}" type="button" ${n ? '' : 'disabled'}>${l}<span class="vr-ff-n">${n}</span></button>`;
          }).join('')}
        </div>
        <div class="vr-bulk-row">
          <button class="vr-btn vr-bulk-source" id="vr-bulk-source" type="button" ${sourceFixCount ? '' : 'disabled'}>
            Заменить отличающиеся источники из amoCRM <span>${sourceFixCount}</span>
          </button>
          <small>Значения обновятся в листе ВИЗИТЫ; выпадающие списки ячеек сохранятся.</small>
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

  function canEditField(r, field) {
    if (!r || !r.deal) return false;
    const state = r.checks?.[field];
    if (field === 'date') return state === 'fail' || state === 'month';
    if (field === 'source') return state === 'fail' || state === 'warm-bad' || state === 'na';
    return state === 'fail' || state === 'na';
  }

  function editableValue(r, index, field, value, extra) {
    const content = `${esc(value || '—')}${extra || ''}`;
    if (!canEditField(r, field)) return content;
    return `<button class="vr-cell-edit" type="button" data-vr-edit="${field}" data-vr-index="${index}" title="Изменить значение в Google Таблице">
      <span>${content}</span>
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
    </button>`;
  }

  function amoSourceClass(r) {
    if (!r.deal || !normText(r.deal.source)) return 'na';
    return normText(r.viz.source) === normText(r.deal.source) ? 'ok' : (r.checks.source === 'warm-bad' ? 'fail' : 'warn');
  }

  function renderTable(results) {
    const cols = ['Дата', 'Телефон', 'Менеджер', 'Город', 'Источник', 'Категория', 'Источник amoCRM', 'Комментарий', 'Сделка'];
    const head = `<tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>`;
    const body = results.map((r, i) => {
      const v = r.viz, c = r.checks;
      const dateNote = c.date === 'month' ? '<i class="vr-hint">мес.</i>' : '';
      const srcTitle = r.deal ? `CRM: ${esc(r.deal.source || '—')}` : '';
      const cityTitle = r.deal ? `CRM: ${esc(r.deal.city || '—')}` : '';
      const mgrTitle = r.deal ? `CRM: ${esc(r.deal.responsible || '—')}` : '';
      const cmtTitle = r.deal ? `CRM: ${esc(r.deal.success || '—')}` : '';
      const dupViz = r.dupViz ? '<span class="vr-dup" title="Этот телефон внесён в визиты несколько раз">дубль</span>' : '';
      return `<tr class="vr-row ${r.status}" data-vr-status="${r.status}" data-vr-bad="${vrBadFields(r).join(' ')}" data-vr-i="${i}">
        <td class="${cellCls(c.date)}" data-l="Дата">${editableValue(r, i, 'date', v.dateRaw, ` ${dateNote}`)}</td>
        <td class="${cellCls(c.phone)}" data-l="Телефон">${esc(fmtPhone(v.phone) || v.phoneRaw || '—')} ${dupViz}</td>
        <td class="${cellCls(c.manager)}" data-l="Менеджер" title="${mgrTitle}">${editableValue(r, i, 'manager', v.manager)}</td>
        <td class="${cellCls(c.city, 'city')}" data-l="Город" title="${cityTitle}">${editableValue(r, i, 'city', v.city)}</td>
        <td class="${cellCls(c.source, 'source')}" data-l="Источник" title="${srcTitle}">${editableValue(r, i, 'source', v.source)}</td>
        <td class="${v.category ? 'ok' : 'na'}" data-l="Категория">${esc(v.category || '—')}</td>
        <td class="${amoSourceClass(r)}" data-l="Источник amoCRM">${esc(r.deal?.source || '—')}</td>
        <td class="${cellCls(c.comment, 'comment')}" data-l="Комментарий" title="${cmtTitle}">${esc(v.comment || '—')}</td>
        <td class="vr-deal-cell" data-l="Сделка">${dealCell(r)}</td>
      </tr>`;
    }).join('');
    return `<table class="vr-table"><thead>${head}</thead><tbody>${body || `<tr><td colspan="9" class="vr-empty">Нет визитов</td></tr>`}</tbody></table>`;
  }

  const EDIT_FIELDS = {
    date: { label: 'Дата', col: 'A', key: 'dateRaw' },
    city: { label: 'Город', col: 'D', key: 'city' },
    source: { label: 'Источник', col: 'F', key: 'source' },
    manager: { label: 'Менеджер', col: 'I', key: 'manager' },
  };

  function formatParsedDate(date) {
    if (!date) return '';
    return `${String(date.d).padStart(2, '0')}.${String(date.m).padStart(2, '0')}.${date.y}`;
  }

  function suggestedValue(result, field) {
    const deal = result?.deal;
    if (!deal) return '';
    if (field === 'date') return formatParsedDate(deal.visit || deal.dozhimVisit);
    if (field === 'city') return deal.city || '';
    if (field === 'source') return deal.source || '';
    if (field === 'manager') return deal.responsible || '';
    return '';
  }

  function uniqueValues(values) {
    const seen = new Set();
    return values.map(v => String(v ?? '').trim()).filter(value => {
      const key = normText(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function editOptions(field) {
    if (field === 'date') return [];
    const colMap = { city: 3, source: 5, manager: 8 };
    const local = VR.vizRows.map(v => v[field]);
    const crm = VR.deals.map(d => field === 'manager' ? d.responsible : d[field]);
    let validation = [];
    try {
      validation = await window.crmSheetsGetValidationOptions?.('ВИЗИТЫ' + VR.suffix, colMap[field], 1000) || [];
    } catch (_) {}
    return uniqueValues(validation.concat(local, crm));
  }

  async function openCellEditor(index, field) {
    const result = VR.results[index];
    const meta = EDIT_FIELDS[field];
    if (!result || !meta || !canEditField(result, field)) return;
    document.getElementById('vr-edit-overlay')?.remove();
    const current = String(result.viz[meta.key] || '');
    const suggested = suggestedValue(result, field);
    const overlay = document.createElement('div');
    overlay.id = 'vr-edit-overlay';
    overlay.className = 'vr-edit-overlay';
    overlay.innerHTML = `<form class="vr-edit-modal" id="vr-edit-form" role="dialog" aria-modal="true" aria-labelledby="vr-edit-title">
      <div class="vr-edit-head">
        <div><span>Изменить значение</span><strong id="vr-edit-title">${esc(meta.label)}</strong></div>
        <button type="button" class="vr-edit-close" aria-label="Закрыть">×</button>
      </div>
      <label class="vr-edit-label" for="vr-edit-value">Текущее значение в листе ВИЗИТЫ</label>
      <input class="vr-edit-input" id="vr-edit-value" value="${esc(current)}" autocomplete="off" ${field === 'date' ? 'inputmode="numeric" placeholder="дд.мм.гггг"' : 'list="vr-edit-options"'}>
      <datalist id="vr-edit-options"></datalist>
      ${suggested ? `<button type="button" class="vr-edit-suggest" id="vr-edit-suggest"><span>Значение amoCRM</span><b>${esc(suggested)}</b></button>` : ''}
      <div class="vr-edit-note">Изменится ячейка <b>${esc(meta.col + result.viz.rowNo)}</b>. Выпадающий список Google Таблицы сохранится.</div>
      <div class="vr-edit-actions">
        <button type="button" class="vr-btn" id="vr-edit-cancel">Отмена</button>
        <button type="submit" class="vr-btn primary" id="vr-edit-save">Сохранить</button>
      </div>
      <div class="vr-edit-error" id="vr-edit-error"></div>
    </form>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('.vr-edit-close')?.addEventListener('click', close);
    overlay.querySelector('#vr-edit-cancel')?.addEventListener('click', close);
    overlay.querySelector('#vr-edit-suggest')?.addEventListener('click', () => {
      const input = overlay.querySelector('#vr-edit-value');
      if (input) { input.value = suggested; input.focus(); }
    });
    const input = overlay.querySelector('#vr-edit-value');
    if (field === 'date') {
      input?.addEventListener('input', () => {
        let digits = input.value.replace(/\D/g, '').slice(0, 8);
        if (digits.length > 4) digits = `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
        else if (digits.length > 2) digits = `${digits.slice(0, 2)}.${digits.slice(2)}`;
        input.value = digits;
      });
    } else {
      editOptions(field).then(options => {
        const list = overlay.querySelector('#vr-edit-options');
        if (list) list.innerHTML = options.map(value => `<option value="${esc(value)}"></option>`).join('');
      });
    }
    overlay.querySelector('#vr-edit-form')?.addEventListener('submit', event => {
      event.preventDefault();
      saveEditedCell(index, field, input?.value || '', overlay);
    });
    requestAnimationFrame(() => input?.focus());
  }

  async function saveEditedCell(index, field, rawValue, overlay) {
    const result = VR.results[index];
    const meta = EDIT_FIELDS[field];
    if (!result || !meta || VR.busy) return;
    let value = String(rawValue ?? '').trim();
    if (field === 'date') {
      const parsed = parseDMY(value);
      if (!parsed) {
        const error = overlay.querySelector('#vr-edit-error');
        if (error) error.textContent = 'Введите дату в формате дд.мм.гггг';
        return;
      }
      value = formatParsedDate(parsed);
    }
    const before = String(result.viz[meta.key] || '');
    if (value === before) { overlay.remove(); return; }
    const save = overlay.querySelector('#vr-edit-save');
    const error = overlay.querySelector('#vr-edit-error');
    if (save) save.disabled = true;
    if (error) error.textContent = '';
    VR.busy = true;
    const sheet = 'ВИЗИТЫ' + VR.suffix;
    const range = `'${sheet}'!${meta.col}${result.viz.rowNo}`;
    try {
      await window.crmSheetsUpdateValues(range, [[value]]);
      result.viz[meta.key] = value;
      if (field === 'date') result.viz.date = parseDMY(value);
      const matched = runMatch(VR.deals, VR.vizRows);
      VR.results = matched.results; VR.stats = matched.stats;
      window.apiCacheInvalidate?.(sheet);
      window.auditLog?.({
        module: 'visits', action: 'reconciliation-update', sheet, row: result.viz.rowNo,
        column: meta.label, entityId: `visit:${sheet}:${result.viz.rowNo}`,
        entityLabel: [result.viz.dateRaw, result.viz.manager, result.viz.phoneRaw, result.viz.category].filter(Boolean).join(' · '),
        before, after: value,
      });
      vrPersist();
      overlay.remove();
      renderReport();
      window.toast?.(`${meta.label}: значение обновлено`, 's');
    } catch (err) {
      if (error) error.textContent = err.message || 'Не удалось сохранить значение';
      if (save) save.disabled = false;
    } finally {
      VR.busy = false;
    }
  }

  async function replaceAllSources() {
    if (VR.busy) return;
    const fixes = VR.results.filter(r => r.deal && normText(r.deal.source) && normText(r.viz.source) !== normText(r.deal.source));
    if (!fixes.length) return;
    if (!window.confirm(`Заменить источник в ${fixes.length} визитах значением из amoCRM?`)) return;
    const button = document.getElementById('vr-bulk-source');
    if (button) { button.disabled = true; button.textContent = 'Обновляем источники…'; }
    VR.busy = true;
    const sheet = 'ВИЗИТЫ' + VR.suffix;
    try {
      await window.crmSheetsBatchUpdateValues(fixes.map(r => ({
        range: `'${sheet}'!F${r.viz.rowNo}`,
        majorDimension: 'ROWS',
        values: [[r.deal.source]],
      })));
      fixes.forEach(r => {
        const before = r.viz.source;
        r.viz.source = r.deal.source;
        window.auditLog?.({
          module: 'visits', action: 'reconciliation-source-bulk', sheet, row: r.viz.rowNo,
          column: 'Источник', entityId: `visit:${sheet}:${r.viz.rowNo}`,
          entityLabel: [r.viz.dateRaw, r.viz.manager, r.viz.phoneRaw, r.viz.category].filter(Boolean).join(' · '),
          before, after: r.deal.source,
        });
      });
      const matched = runMatch(VR.deals, VR.vizRows);
      VR.results = matched.results; VR.stats = matched.stats;
      window.apiCacheInvalidate?.(sheet);
      vrPersist();
      renderReport();
      window.toast?.(`Источники обновлены: ${fixes.length}`, 's');
    } catch (err) {
      if (button) { button.disabled = false; button.textContent = `Повторить замену источников (${fixes.length})`; }
      window.toast?.(err.message || 'Не удалось обновить источники', 'e');
    } finally {
      VR.busy = false;
    }
  }

  function bindReport() {
    bindHeader();
    document.getElementById('vr-new')?.addEventListener('click', ejectReport);
    document.getElementById('vr-bulk-source')?.addEventListener('click', replaceAllSources);
    document.querySelectorAll('[data-vr-edit]').forEach(button => button.addEventListener('click', () => {
      openCellEditor(Number(button.dataset.vrIndex), button.dataset.vrEdit);
    }));
    // Комбинированная фильтрация: статус (один) + типы несоответствий (мультивыбор)
    let statusF = 'all';
    const fieldF = new Set();
    const applyFilters = () => {
      document.querySelectorAll('.vr-row').forEach(row => {
        const okStatus = statusF === 'all' || row.dataset.vrStatus === statusF;
        const bad = (row.dataset.vrBad || '').split(' ').filter(Boolean);
        const okField = fieldF.size === 0 || [...fieldF].some(f => bad.includes(f));
        row.style.display = (okStatus && okField) ? '' : 'none';
      });
    };
    document.querySelectorAll('[data-vr-filter]').forEach(b => b.addEventListener('click', () => {
      statusF = b.dataset.vrFilter;
      document.querySelectorAll('[data-vr-filter]').forEach(x => x.classList.toggle('on', x === b));
      applyFilters();
    }));
    document.querySelectorAll('[data-vr-field]').forEach(b => b.addEventListener('click', () => {
      const f = b.dataset.vrField;
      if (fieldF.has(f)) fieldF.delete(f); else fieldF.add(f);
      b.classList.toggle('on', fieldF.has(f));
      applyFilters();
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
