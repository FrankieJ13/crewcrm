/* ═══════════════════════════════════════════════════════════════════════════
 * ПЕШИЕ СДЕЛКИ — чистая бизнес-логика (без DOM). Тестируется в node и в браузере.
 * Экспортируется как window.PDLib (браузер) и module.exports (node).
 * UI и парсинг CSV — в js/visit-reconciliation.js (использует эти функции).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  const lib = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  if (root) root.PDLib = lib;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {

  // ── CSV (RFC-4180, делимитер ; или ,, BOM, кавычки, переносы) ──────────────
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const delim = (first.split(';').length > first.split(',').length) ? ';' : ',';
    const rows = []; let row = [], fld = '', i = 0, q = false; const n = text.length;
    while (i < n) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { fld += '"'; i += 2; continue; } q = false; i++; continue; } fld += c; i++; continue; }
      if (c === '"') { q = true; i++; continue; }
      if (c === delim) { row.push(fld); fld = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(fld); rows.push(row); row = []; fld = ''; i++; continue; }
      fld += c; i++;
    }
    if (fld.length || row.length) { row.push(fld); rows.push(row); }
    return rows;
  }

  // ── текст/города ──────────────────────────────────────────────────────────
  function normText(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' '); }

  const PD_CITIES = ['Пермь', 'Челябинск', 'Барнаул', 'Новосибирск', 'Тюмень', 'Омск', 'Томск', 'Красноярск', 'Оренбург', 'Кемерово', 'Новокузнецк', 'Сургут'];
  const PD_CITY_LC = PD_CITIES.map(c => normText(c));

  // «Ответственный» → каноничный город или null. По ТОКЕНАМ (не blind includes),
  // чтобы «Пермяков» (менеджер) не дал ложный «Пермь», а «Город Пермь» / «Пермь /
  // Салон» / «Пермь КСО» — корректно определились.
  function resolvePedestrianCity(responsible) {
    const t = normText(responsible);
    if (!t) return null;
    const tokens = t.split(/[^a-zа-я]+/i).filter(Boolean);   // ё уже заменён на е
    for (let i = 0; i < PD_CITY_LC.length; i++) if (tokens.includes(PD_CITY_LC[i])) return PD_CITIES[i];
    return null;
  }
  // «похоже на город, но не распозналось как токен» — для диагностики опечаток.
  function looksLikeCity(responsible) {
    const t = normText(responsible);
    if (!t || resolvePedestrianCity(responsible)) return false;
    return PD_CITY_LC.some(c => t.includes(c));
  }

  // ── телефоны ──────────────────────────────────────────────────────────────
  // Из ячейки → все нормализованные 10-значные «ядра» РФ-номеров (7XXXXXXXXXX без
  // ведущей 7). Несколько номеров в ячейке, любые разделители; дедуп через Set.
  // Короткие/внутренние/ID/даты (не 10-значное ядро) отсекаются.
  function extractPhones(cell) {
    const out = new Set();
    String(cell == null ? '' : cell).split(/[,;/\n]+/).forEach(part => {
      let d = part.replace(/\D/g, '');
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

  // ── даты (строгая валидация, без авто-переноса JS Date) ────────────────────
  // «дд.мм.гггг[…]» / «гггг-мм-дд[…]» → {d,m,y} ТОЛЬКО если дата реально существует
  // (round-trip). 31.02.2026 → null (а не 03.03 как у new Date).
  function parseDateStrict(s) {
    const t = String(s == null ? '' : s).trim();
    if (!t) return null;
    let d, mo, y, m = t.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/);
    if (m) { d = +m[1]; mo = +m[2]; y = m[3].length === 2 ? 2000 + (+m[3]) : +m[3]; }
    else { m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (!m) return null; y = +m[1]; mo = +m[2]; d = +m[3]; }
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() + 1 !== mo || dt.getDate() !== d) return null;
    return { d, m: mo, y };
  }
  function toMs(dmy) { return dmy ? new Date(dmy.y, dmy.m - 1, dmy.d).getTime() : NaN; }
  // Вычесть N КАЛЕНДАРНЫХ месяцев с зажимом дня к последнему дню целевого месяца.
  // 30.06.2026−4 = 28.02.2026; 31.07−4 = 31.03; 30.06.2024−4 = 29.02.2024.
  function minusCalendarMonths(dmy, n) {
    let mi = (dmy.m - 1) - n, y = dmy.y;
    while (mi < 0) { mi += 12; y--; }
    const lastDay = new Date(y, mi + 1, 0).getDate();
    return { d: Math.min(dmy.d, lastDay), m: mi + 1, y };
  }
  function daysBetween(later, earlier) { return Math.round((toMs(later) - toMs(earlier)) / 86400000); }
  function inPeriod(v, from, to) { if (!v) return false; const t = toMs(v); if (from && t < toMs(from)) return false; if (to && t > toMs(to)) return false; return true; }

  // ── бизнес-правила старой CRM-сделки ───────────────────────────────────────
  function isSuccessfulClosedDeal(deal) { return !!String(deal.success || '').trim(); }
  function isTechnicalClosedDeal(deal) { return /дубль|хоз/i.test(deal.reason || ''); }

  // Оценка кандидата в «старую CRM-сделку» для конкретной пешей. Возвращает
  // {ok, matchPhone, flags} или {ok:false, ex:'<причина исключения>'} (для диагностики).
  function evalOldCrmDeal(old, ped, visitMs, winStartMs) {
    if (!old.id) return { ok: false, ex: 'NO_ID' };
    if (old.id === ped.id) return { ok: false, ex: 'SAME_DEAL' };
    if (!old.phones.some(p => ped.phones.includes(p))) return { ok: false, ex: 'NO_PHONE_INTERSECTION' };
    if (old.visitRaw) return { ok: false, ex: 'OLD_HAS_VISIT' };
    if (old.closeInvalid) return { ok: false, ex: 'INVALID_CLOSE_DATE' };
    if (!old.closed) return { ok: false, ex: 'NO_CLOSE_DATE' };
    const cms = toMs(old.closed);
    if (cms > visitMs) return { ok: false, ex: 'CLOSE_AFTER_VISIT' };
    if (cms < winStartMs) return { ok: false, ex: 'CLOSE_BEFORE_WINDOW' };
    if (isSuccessfulClosedDeal(old)) return { ok: false, ex: 'SUCCESSFUL_DEAL' };
    if (isTechnicalClosedDeal(old)) return { ok: false, ex: /дубль/i.test(old.reason) ? 'DUPLICATE' : 'HOZ' };
    return {
      ok: true, matchPhone: old.phones.find(p => ped.phones.includes(p)),
      flags: ['MATCH_PHONE', 'OLD_HAS_CLOSE_DATE', 'OLD_NO_VISIT_DATE', 'CLOSE_BEFORE_OR_EQUAL_VISIT', 'CLOSE_INSIDE_4_CALENDAR_MONTHS', 'NOT_SUCCESSFUL', 'NOT_DUPLICATE', 'NOT_HOZ'],
    };
  }

  // ── колонки CSV ────────────────────────────────────────────────────────────
  const PD_REQUIRED = ['id', 'resp', 'closed', 'visit'];   // + минимум 1 телефонная колонка
  function detectColumns(header) {
    const lc = {}; header.forEach((h, i) => { const k = normText(h); if (k && !(k in lc)) lc[k] = i; });
    const pick = (...names) => { for (const nm of names) { const k = normText(nm); if (lc[k] != null) return lc[k]; } return -1; };
    const phoneIdx = header.map((h, i) => ({ h: String(h || ''), i })).filter(o => /телефон|phone/i.test(o.h) && !/линия|mango|факс|fax/i.test(o.h)).map(o => o.i);
    return {
      id: pick('ID'), name: pick('Название сделки'), resp: pick('Ответственный'),
      closed: pick('Дата закрытия'), visit: pick('Дата визита'), stage: pick('Этап сделки'),
      reason: pick('Причина закрытия карточки'), success: pick('Успешное закрытие карточки'),
      cityVyd: pick('Город Выдачи'), crmResp: pick('CRM Ответственный'), phoneIdx,
    };
  }
  function validateColumns(cm) {
    const missing = PD_REQUIRED.filter(k => cm[k] == null || cm[k] < 0);
    if (!cm.phoneIdx || !cm.phoneIdx.length) missing.push('phone');
    return { ok: missing.length === 0, missing };
  }

  // ── сборка сделок из строк CSV по маппингу колонок ─────────────────────────
  function buildDeals(rows, cm) {
    const cell = (r, i) => (i != null && i >= 0) ? String(r[i] || '').trim() : '';
    const deals = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]; if (!row || !row.length) continue;
      const ph = new Set(); (cm.phoneIdx || []).forEach(i => extractPhones(row[i]).forEach(p => ph.add(p)));
      const visitRaw = cell(row, cm.visit), closedRaw = cell(row, cm.closed);
      const visit = parseDateStrict(visitRaw), closed = parseDateStrict(closedRaw);
      const resp = cell(row, cm.resp);
      deals.push({
        id: cell(row, cm.id), name: cell(row, cm.name), resp, respCity: resolvePedestrianCity(resp),
        closedRaw, closed, closeInvalid: !!closedRaw && !closed && !/не закрыт/i.test(closedRaw),
        visitRaw, visit, visitInvalid: !!visitRaw && !visit,
        reason: cell(row, cm.reason), success: cell(row, cm.success), stage: cell(row, cm.stage),
        cityVyd: cell(row, cm.cityVyd), crmResp: cell(row, cm.crmResp), phones: [...ph],
      });
    }
    return deals;
  }

  // ── основной анализ ────────────────────────────────────────────────────────
  // deals — из buildDeals; period {from,to} в «дд.мм.гггг»; meta {phoneCols}.
  function analyze(deals, period, meta) {
    period = period || {};
    const byPhone = new Map();
    deals.forEach(d => { if (!d.id) return; d.phones.forEach(p => { if (!byPhone.has(p)) byPhone.set(p, []); byPhone.get(p).push(d); }); });
    const from = period.from ? parseDateStrict(period.from) : null, to = period.to ? parseDateStrict(period.to) : null;
    const results = [];
    const diag = {
      totalRows: deals.length, noId: 0, badVisit: 0, badClose: 0, noPhone: 0,
      phoneCols: (meta && meta.phoneCols) || 0, excludedQuality: 0,
      unknownResp: new Map(), exReasons: {},
    };
    deals.forEach(d => { if (!d.id) diag.noId++; if (d.closeInvalid) diag.badClose++; });

    deals.forEach(ped => {
      if (!ped.respCity) {                                   // не город → не пешая
        if (ped.visitRaw) { const k = ped.resp || '(пусто)'; diag.unknownResp.set(k, { c: (diag.unknownResp.get(k) || { c: 0 }).c + 1, like: looksLikeCity(ped.resp) }); }
        return;
      }
      if (!ped.visitRaw) return;
      if (ped.visitInvalid) { diag.badVisit++; results.push({ ped, status: 'check', reason: 'Дата визита не распознана или некорректна', crm: [], inPeriod: false }); return; }
      if (!inPeriod(ped.visit, from, to)) return;            // вне периода
      if (!ped.id) { diag.excludedQuality++; results.push({ ped, status: 'check', reason: 'Нет ID сделки', crm: [], inPeriod: true }); return; }
      if (!ped.phones.length) { diag.noPhone++; results.push({ ped, status: 'check', reason: 'Нет валидного телефона', crm: [], inPeriod: true }); return; }
      const visitMs = toMs(ped.visit), winStart = toMs(minusCalendarMonths(ped.visit, 4));
      const seen = new Set(); const crm = [];
      ped.phones.forEach(p => (byPhone.get(p) || []).forEach(c => {
        if (seen.has(c.id)) return; seen.add(c.id);
        const e = evalOldCrmDeal(c, ped, visitMs, winStart);
        if (e.ok) crm.push(Object.assign({}, c, { matchPhone: e.matchPhone, days: daysBetween(ped.visit, c.closed), flags: e.flags }));
        else if (e.ex && e.ex !== 'SAME_DEAL' && e.ex !== 'NO_PHONE_INTERSECTION') diag.exReasons[e.ex] = (diag.exReasons[e.ex] || 0) + 1;
      }));
      crm.sort((a, b) => toMs(b.closed) - toMs(a.closed));   // основная = ближайшая к визиту (позднее закрытие)
      results.push({ ped, status: crm.length ? 'found' : 'none', crm, inPeriod: true });
    });
    diag.unknownResp = [...diag.unknownResp.entries()].map(([v, o]) => ({ v, c: o.c, like: o.like })).sort((a, b) => (b.like - a.like) || (b.c - a.c)).slice(0, 30);
    return { results, diag };
  }

  return {
    PD_CITIES, parseCSV, normText, resolvePedestrianCity, looksLikeCity, extractPhones, fmtPhone,
    parseDateStrict, toMs, minusCalendarMonths, daysBetween, inPeriod,
    isSuccessfulClosedDeal, isTechnicalClosedDeal, evalOldCrmDeal,
    detectColumns, validateColumns, buildDeals, analyze, PD_REQUIRED,
  };
});
