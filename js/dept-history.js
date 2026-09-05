/* ═══════════════════════════════════════════════════════════════════════════
 * ИСТОРИЯ ОТДЕЛОВ — безопасный перевод менеджера CRM ⇄ ДОЖИМ без потери истории.
 * Чистая логика (без DOM) — тестируется в node и в браузере.
 * Экспортируется как window.DeptHistory (браузер) и module.exports (node).
 *
 * Модель приложения: отдел менеджера = его РОЛЬ в USERS (колонка C), одна на
 * все месяцы. Результаты CRM и ДОЖИМ лежат в РАЗНЫХ помесячных листах
 * (ВИЗИТЫ<MMYY> / Д_ВИЗИТЫ<MMYY>). Поэтому при переводе сами визиты не
 * «переезжают» в чужой отдел — ломается лишь ЧЛЕНСТВО менеджера в отчёте отдела
 * (список строится по текущей роли и применяется ко всем месяцам одинаково).
 *
 * Этот модуль резолвит отдел менеджера НА ДАТУ/МЕСЯЦ по журналу переводов
 * (лист USER_DEPARTMENT_HISTORY). Нет записей → отдел = текущая роль (полная
 * обратная совместимость: менеджеры без переводов ведут себя как раньше).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  const lib = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  if (root) root.DeptHistory = lib;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {

  const CRM = 'crm', DOZHIM = 'dozhim';

  // ── Канонизация отдела ──────────────────────────────────────────────────────
  // Принимает 'CRM'/'crm'/'КРМ' → 'crm'; 'ДОЖИМ'/'dozhim'/'дожим' → 'dozhim'.
  // Пустая роль ('') в USERS трактуется вызывающим кодом как CRM — здесь же
  // пустая строка → null (не отдел), чтобы отличать «не распознано» в истории.
  function normDept(s) {
    const t = String(s == null ? '' : s).trim().toLowerCase();
    if (!t) return null;
    if (t === 'crm' || t === 'крм' || t === 'срм') return CRM;
    if (t === 'dozhim' || t === 'дожим') return DOZHIM;
    if (t.indexOf('dozhim') >= 0 || t.indexOf('дожим') >= 0) return DOZHIM;
    if (t.indexOf('crm') >= 0 || t.indexOf('крм') >= 0) return CRM;
    return null;
  }

  // Роль из USERS ('crm'|'dozhim'|'ceo'|'rop'|'' …) → отдел ('crm'|'dozhim'|null).
  // Пустая роль → CRM (как во всём приложении). Управленцы (ceo/rop) → null.
  function deptFromRole(role) {
    const t = String(role == null ? '' : role).trim().toLowerCase();
    if (t === 'dozhim') return DOZHIM;
    if (t === 'crm' || t === '') return CRM;
    return null; // ceo / rop / неизвестное — не менеджерский отдел
  }

  // ── Дата перевода ───────────────────────────────────────────────────────────
  // Основной формат YYYY-MM-DD; допускаем DD.MM.YYYY и D/M/YYYY. Строгая проверка
  // (round-trip: 31.02 → null). Возвращает мс (UTC-полночь) или null.
  function parseDate(s) {
    const t = String(s == null ? '' : s).trim();
    if (!t) return null;
    let y, m, d;
    const mIso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const mDot = t.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
    if (mIso) { y = +mIso[1]; m = +mIso[2]; d = +mIso[3]; }
    else if (mDot) { d = +mDot[1]; m = +mDot[2]; y = +mDot[3]; }
    else return null;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) return null;
    return dt.getTime();
  }

  // Границы месяца по суффиксу MMYY → { startMs, endMs } (endMs = последний день).
  function monthRange(suffix) {
    const s = String(suffix || '');
    if (!/^\d{4}$/.test(s)) return null;
    const mm = +s.slice(0, 2), yy = 2000 + +s.slice(2, 4);
    if (mm < 1 || mm > 12) return null;
    return { startMs: Date.UTC(yy, mm - 1, 1), endMs: Date.UTC(yy, mm, 0) };
  }

  // ── Парсинг + валидация журнала ─────────────────────────────────────────────
  // rows: массив строк листа [user_id, manager_name, old_department, new_department, transfer_date].
  // isKnownId(id) → есть ли такой пользователь (для валидации; можно опустить).
  // warn(msg) — логгер невалидных строк (опц.).
  // Возвращает Map<id:string, transfers[]>, transfers отсортированы по дате asc.
  // transfer = { id, name, from, to, ms, dateRaw }.
  function parseHistory(rows, isKnownId, warn) {
    const byId = new Map();
    const log = typeof warn === 'function' ? warn : function () {};
    if (!Array.isArray(rows)) return byId;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      const id = String(r[0] == null ? '' : r[0]).trim();
      const name = String(r[1] == null ? '' : r[1]).trim();
      const rawOld = r[2], rawNew = r[3], rawDate = r[4];
      // Полностью пустая строка — молча пропускаем (это не «битая» строка).
      if (!id && !name && rawOld == null && rawNew == null && rawDate == null) continue;
      const from = normDept(rawOld), to = normDept(rawNew), ms = parseDate(rawDate);
      if (!id) { log('dept-history: строка ' + (i + 1) + ' пропущена — нет user_id'); continue; }
      if (isKnownId && !isKnownId(id)) { log('dept-history: строка ' + (i + 1) + ' пропущена — user_id «' + id + '» не найден в USERS'); continue; }
      if (!from || !to) { log('dept-history: строка ' + (i + 1) + ' пропущена — не распознан отдел (' + rawOld + ' → ' + rawNew + ')'); continue; }
      if (from === to) { log('dept-history: строка ' + (i + 1) + ' пропущена — old == new (' + from + ')'); continue; }
      if (ms == null) { log('dept-history: строка ' + (i + 1) + ' пропущена — неверная дата (' + rawDate + ')'); continue; }
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push({ id, name, from, to, ms, dateRaw: String(rawDate).trim() });
    }
    // Хронологический порядок (обязателен для резолва мультипереводов).
    byId.forEach(list => list.sort((a, b) => a.ms - b.ms));
    return byId;
  }

  // ── Резолв ──────────────────────────────────────────────────────────────────
  // Отдел менеджера на конкретную дату (мс). transfers отсортированы asc.
  // transfer_date означает: с этой даты менеджер уже в НОВОМ отделе.
  // Нет переводов → currentDept (fallback на текущую роль).
  function deptAtDate(transfers, currentDept, targetMs) {
    if (!transfers || !transfers.length) return currentDept || null;
    let dept = transfers[0].from; // до первого перевода — исходный отдел первого перевода
    for (let i = 0; i < transfers.length; i++) {
      if (transfers[i].ms <= targetMs) dept = transfers[i].to; else break;
    }
    return dept;
  }

  // Множество отделов, в которых менеджер был ХОТЯ БЫ ЧАСТЬ периода [startMs, endMs].
  // При переводе внутри месяца вернёт оба отдела (→ менеджер виден в обоих отчётах,
  // каждая карточка читает свой лист, где уже только «свои» дни). Возвращает {crm, dozhim}.
  function deptsInRange(transfers, currentDept, startMs, endMs) {
    const res = { crm: false, dozhim: false };
    const mark = d => { if (d === CRM) res.crm = true; else if (d === DOZHIM) res.dozhim = true; };
    mark(deptAtDate(transfers, currentDept, startMs));           // отдел на начало периода
    if (transfers) for (let i = 0; i < transfers.length; i++) {  // + каждый перевод внутри (start, end]
      const t = transfers[i];
      if (t.ms > startMs && t.ms <= endMs) mark(t.to);
    }
    return res;
  }

  // Удобная обёртка: отделы менеджера за месяц (суффикс MMYY).
  function deptsForMonth(transfers, currentDept, suffix) {
    const mr = monthRange(suffix);
    if (!mr) { // нераспознанный суффикс → падаем на текущий отдел
      return { crm: currentDept === CRM, dozhim: currentDept === DOZHIM };
    }
    return deptsInRange(transfers, currentDept, mr.startMs, mr.endMs);
  }

  return {
    CRM, DOZHIM,
    normDept, deptFromRole, parseDate, monthRange,
    parseHistory, deptAtDate, deptsInRange, deptsForMonth,
  };
});
