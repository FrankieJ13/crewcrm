/**
 * Crystal Motors Dashboard — автоматическая выдача трофеев.
 *
 * Точки входа (вешаются на триггеры через редактор Apps Script):
 *   1) awardMonthlyTrophies()  — ежемесячно 2-го числа в 03:00 (Time-driven, Month-timer, Day=2)
 *   2) awardDailyTrophies()    — ежедневно в 09:00 (Time-driven, Day-timer)
 *   3) awardHnyTrophies()      — 1 января (Time-driven, Calendar, 1st of January 00:00)
 *
 * Все функции идемпотентны: повторный запуск не создаёт дубли.
 * Запись идёт в лист TrophyAwards с колонками:
 *   A trophy_code | B manager_name | C awarded_at (YYYY-MM-DD)
 *   D awarded_by  | E source (auto) | F status (active) | G note (период)
 */

/* ──────────────────────── КОНФИГ ──────────────────────── */
const SHEET_ID = '1DeUsHB_O1SbIMR4p5yd64o_R0yllWvtnyNhjxjhipn8'; // дашборд

const SHEET_USERS         = 'USERS';
const SHEET_TROPHY_AWARDS = 'TrophyAwards';

// Шаблоны имён месячных листов: например ВИЗИТЫ + '0526'
const PREFIX_VIZITY   = 'ВИЗИТЫ';
const PREFIX_D_VIZITY = 'Д_ВИЗИТЫ';
const PREFIX_PLAN     = 'ПЛАН';

// Статусы из колонки E (комментарий итоговой сделки)
const ST_KREDIT = 'покупка (кредит)';
const ST_NAL    = 'покупка (наличные)';
const ST_OBMEN  = 'обмен';
const ST_KOM    = 'комиссия';
const ST_OTKAZ  = 'отказ';
const ST_FSSP   = 'фссп не подаем';

// USERS колонки (0-based): A=email B=name C=role D=fund E=rang F=dob
//   G=avatar I/H=tg I=max J=phone K=sverka L=viz-paste M=svc N=notif O=autos
const U_NAME = 1;
const U_ROLE = 2;
const U_DOB  = 5;

// VIZITY колонки (0-based): A=date B=ФИО C=tel D=city E=коммент F=источник
//   G=категория H=способ I=менеджер J=задаток K=авто L=сверка M=note N=...
const V_DATE = 0;
const V_ST   = 4;
const V_CAT  = 6;
const V_MGR  = 8;

const VIS_CATEGORIES = ['кат 800', 'кат 1000', 'кат 1200'];

/* ──────────────────────── ENTRYPOINTS ──────────────────────── */

/**
 * Ежемесячная выдача — запускать 2-го числа.
 * Считает результаты за предыдущий полный месяц.
 */
function awardMonthlyTrophies() {
  const now = new Date();
  // Целевой месяц = предыдущий относительно сегодня
  const target = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  awardMonthlyTrophiesFor(target);
}

/**
 * Дайли-задачи: ДР + кумулятивные milestone-трофеи (Бронза/Серебро/Золото/Платина).
 */
function awardDailyTrophies() {
  const now = new Date();
  awardBirthdayFor(now);
  awardMilestoneTrophies(now);
}

/**
 * Ежегодная массовая раздача 1 января.
 */
function awardHnyTrophies() {
  const now = new Date();
  awardHnyFor(now);
}

/* ──────────────────────── MONTHLY LOGIC ──────────────────────── */

function awardMonthlyTrophiesFor(targetDate) {
  const sfx = mmYY(targetDate);
  const period = ymKey(targetDate);          // напр. '2026-05'
  const awardedAt = isoDate(addDays(firstOfNextMonth(targetDate), 1)); // 2-е число след. месяца
  const ss = SpreadsheetApp.openById(SHEET_ID);

  const vizityRows   = readSheetSafe(ss, PREFIX_VIZITY   + sfx);
  const dVizityRows  = readSheetSafe(ss, PREFIX_D_VIZITY + sfx);
  const planRows     = readSheetSafe(ss, PREFIX_PLAN     + sfx);
  const usersRows    = readSheetSafe(ss, SHEET_USERS);

  // План: первый столбец имя, далее — план в визитах (берём столбец B, индекс 1)
  const planMap = {};
  for (let i = 1; i < planRows.length; i++) {
    const row = planRows[i]; if (!row || !row[0]) continue;
    const name = String(row[0]).trim();
    const plan = parseInt(String(row[1] || '0').replace(/\D/g, '')) || 0;
    if (name) planMap[name.toLowerCase()] = plan;
  }

  // Список менеджеров CRM/Дожим из USERS
  const mgrs = {};
  for (let i = 1; i < usersRows.length; i++) {
    const row = usersRows[i]; if (!row) continue;
    const name = String(row[U_NAME] || '').trim();
    const role = String(row[U_ROLE] || '').toLowerCase().trim();
    if (!name || (role !== 'crm' && role !== 'dozhim')) continue;
    mgrs[name.toLowerCase()] = { name, role, stats: emptyStats() };
  }

  // Агрегируем по визитам обоих отделов
  aggregateInto(vizityRows,  mgrs);
  aggregateInto(dVizityRows, mgrs);

  // Список с факт/план/прогресс
  const arr = Object.values(mgrs).map(m => {
    const plan = planMap[m.name.toLowerCase()] || 0;
    const prog = plan > 0 ? (m.stats.vis / plan * 100) : 0;
    return Object.assign({}, m, { plan, prog });
  });

  // Существующие выдачи за этот период (для идемпотентности)
  const existing = readAwardsIndex(ss, period);
  const toAppend = [];
  const push = (code, name, note) => {
    const key = code + '|' + name.toLowerCase();
    if (existing[key]) return; // уже выдан в этом периоде
    existing[key] = true;
    toAppend.push([code, name, awardedAt, 'system', 'auto', 'active', note || period]);
  };

  // 1) ТОП1/2/3 — сортировка по прогрессу (план ≥100%)
  const top = arr.filter(m => m.prog >= 100).sort((a, b) => b.prog - a.prog);
  if (top[0]) push('numberone_monthly',   top[0].name, `${period} · ${Math.round(top[0].prog)}%`);
  if (top[1]) push('numbertwo_monthly',   top[1].name, `${period} · ${Math.round(top[1].prog)}%`);
  if (top[2]) push('numberthree_monthly', top[2].name, `${period} · ${Math.round(top[2].prog)}%`);

  // 2) AWESOME / NICE
  arr.forEach(m => {
    if (m.prog >= 130 && m.stats.kred >= 30) push('star_monthly',  m.name, `${period} · ${Math.round(m.prog)}% · ${m.stats.kred} кредитов`);
    if (m.prog >= 120 && m.stats.kred >= 20) push('star2_monthly', m.name, `${period} · ${Math.round(m.prog)}% · ${m.stats.kred} кредитов`);
  });

  // 3) Коллектор — max сделок «Комиссия»
  const byKom = arr.filter(m => m.stats.kom > 0).sort((a, b) => b.stats.kom - a.stats.kom);
  if (byKom[0]) push('commission_monthly', byKom[0].name, `${period} · ${byKom[0].stats.kom} комиссии`);

  // 4) Счастливое число CRM — 33 кредита
  arr.forEach(m => {
    if (m.stats.kred >= 33) push('kd_monthly', m.name, `${period} · ${m.stats.kred} кредитов`);
  });

  // 5) Туз в рукаве — 10 наличных продаж (без обмена)
  arr.forEach(m => {
    if (m.stats.nalOnly >= 10) push('cash_monthly', m.name, `${period} · ${m.stats.nalOnly} налом`);
  });

  // 6) Три в ряд — 3 кредитные сделки в один день
  arr.forEach(m => {
    if (hasTripleCreditDay(m.stats.kreditDays)) push('3in1_monthly', m.name, period);
  });

  // 7) Идеальная неделя — 7 дней подряд без отказов/ФССП
  arr.forEach(m => {
    if (m.stats.cleanStreak >= 7) push('notfailure_monthly', m.name, `${period} · ${m.stats.cleanStreak}д подряд`);
  });

  // TODO (нужны формулы дохода):
  //   - emolument_monthly (макс доход месяца)
  //   - snatch_monthly    (макс доход за 6 мес)
  //   - profitability_monthly (макс доходность с одной сделки — manual)

  // Anniversary — если у юзера год работы исполнился в течение месяца
  // (по DOB не определишь; пока MANUAL или добавь поле hire_date в USERS)

  if (toAppend.length) appendRows(ss, SHEET_TROPHY_AWARDS, toAppend);
  console.log(`[trophies] ${period}: добавлено выдач ${toAppend.length}`);
}

/* ──────────────────────── DAILY: BIRTHDAY ──────────────────────── */

function awardBirthdayFor(now) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const usersRows = readSheetSafe(ss, SHEET_USERS);
  const d = now.getDate(), m = now.getMonth() + 1;
  const period = String(now.getFullYear());
  const awardedAt = isoDate(now);
  const existing = readAwardsIndex(ss, period);
  const toAppend = [];

  // Код трофея ДР зависит от года: hb_2026_annual, hb_2027_annual, ...
  const hbCode = 'hb_' + period + '_annual';
  for (let i = 1; i < usersRows.length; i++) {
    const row = usersRows[i]; if (!row) continue;
    const name = String(row[U_NAME] || '').trim();
    const role = String(row[U_ROLE] || '').toLowerCase().trim();
    if (!name || (role !== 'crm' && role !== 'dozhim')) continue;
    const dob = parseDob(row[U_DOB]);
    if (!dob || dob.day !== d || dob.month !== m) continue;
    const key = hbCode + '|' + name.toLowerCase();
    if (existing[key]) continue;
    toAppend.push([hbCode, name, awardedAt, 'system', 'auto', 'active', period]);
  }
  if (toAppend.length) appendRows(ss, SHEET_TROPHY_AWARDS, toAppend);
  console.log(`[trophies] hb ${awardedAt}: ${toAppend.length}`);
}

/* ──────────────────────── ANNUAL: HNY ──────────────────────── */

function awardHnyFor(now) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const usersRows = readSheetSafe(ss, SHEET_USERS);
  const period = String(now.getFullYear());
  const awardedAt = isoDate(now);
  const existing = readAwardsIndex(ss, period);
  const toAppend = [];

  // Код трофея HNY зависит от года: hny_2026_annual, hny_2027_annual, ...
  const hnyCode = 'hny_' + period + '_annual';
  for (let i = 1; i < usersRows.length; i++) {
    const row = usersRows[i]; if (!row) continue;
    const name = String(row[U_NAME] || '').trim();
    const role = String(row[U_ROLE] || '').toLowerCase().trim();
    if (!name || (role !== 'crm' && role !== 'dozhim')) continue;
    const key = hnyCode + '|' + name.toLowerCase();
    if (existing[key]) continue;
    toAppend.push([hnyCode, name, awardedAt, 'system', 'auto', 'active', period]);
  }
  if (toAppend.length) appendRows(ss, SHEET_TROPHY_AWARDS, toAppend);
  console.log(`[trophies] hny ${awardedAt}: ${toAppend.length}`);
}

/* ─────── MILESTONE: 25/50/75/100 трофеев (once, AUTO) ─────── */
const MILESTONE_TROPHIES = [
  { code: '25trophies_once',  threshold: 25 },
  { code: '50trophies_once',  threshold: 50 },
  { code: '75trophies_once',  threshold: 75 },
  { code: '100trophies_once', threshold: 100 },
];

function awardMilestoneTrophies(now) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const usersRows = readSheetSafe(ss, SHEET_USERS);
  const awardRows = readSheetSafe(ss, SHEET_TROPHY_AWARDS);
  const awardedAt = isoDate(now);

  // Карта менеджеров: nameLow → ФИО
  const mgrMap = {};
  for (let i = 1; i < usersRows.length; i++) {
    const row = usersRows[i]; if (!row) continue;
    const name = String(row[U_NAME] || '').trim();
    const role = String(row[U_ROLE] || '').toLowerCase().trim();
    if (!name || (role !== 'crm' && role !== 'dozhim')) continue;
    mgrMap[name.toLowerCase()] = name;
  }

  // Подсчёт всех активных выдач у каждого менеджера + регистрация уже
  // полученных milestone-кодов, чтобы не дублировать
  const milestoneCodes = MILESTONE_TROPHIES.map(m => m.code);
  const counts = {};                // nameLow → число выданных трофеев (без milestone)
  const hasMilestone = {};          // 'code|nameLow' → true

  for (let i = 1; i < awardRows.length; i++) {
    const r = awardRows[i]; if (!r) continue;
    const code = String(r[0] || '').trim();
    const name = String(r[1] || '').toLowerCase().trim();
    const status = String(r[5] || 'active').toLowerCase().trim();
    if (!code || !name || status === 'locked') continue;
    if (milestoneCodes.indexOf(code) >= 0) {
      hasMilestone[code + '|' + name] = true;
      continue; // milestone-трофеи в счёт не идут
    }
    counts[name] = (counts[name] || 0) + 1;
  }

  const toAppend = [];
  Object.keys(mgrMap).forEach(nameLow => {
    const total = counts[nameLow] || 0;
    MILESTONE_TROPHIES.forEach(m => {
      if (total < m.threshold) return;
      if (hasMilestone[m.code + '|' + nameLow]) return;
      toAppend.push([m.code, mgrMap[nameLow], awardedAt, 'system', 'auto', 'active', `milestone ${m.threshold}`]);
      hasMilestone[m.code + '|' + nameLow] = true;
    });
  });

  if (toAppend.length) appendRows(ss, SHEET_TROPHY_AWARDS, toAppend);
  console.log(`[trophies] milestones ${awardedAt}: ${toAppend.length}`);
}

/* ──────────────────────── АГРЕГАТОР ВИЗИТОВ ──────────────────────── */

function emptyStats() {
  return { vis: 0, kred: 0, nal: 0, obmen: 0, nalOnly: 0, kom: 0, otkaz: 0, fssp: 0,
           kreditDays: {}, dailyClean: {}, cleanStreak: 0 };
}

function aggregateInto(rows, mgrs) {
  if (!rows || rows.length < 2) return;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]; if (!row) continue;
    const mgrName = String(row[V_MGR] || '').trim();
    const key = mgrName.toLowerCase();
    if (!mgrs[key]) continue;
    const cat = String(row[V_CAT] || '').toLowerCase().trim();
    if (VIS_CATEGORIES.indexOf(cat) < 0) continue;
    const st = String(row[V_ST] || '').toLowerCase().trim();
    const day = parseDayKey(row[V_DATE]);
    const s = mgrs[key].stats;

    s.vis++;
    if (st === ST_KREDIT) { s.kred++; if (day) s.kreditDays[day] = (s.kreditDays[day] || 0) + 1; }
    else if (st === ST_NAL)    { s.nal++; s.nalOnly++; }
    else if (st === ST_OBMEN)  { s.nal++; s.obmen++; }
    else if (st === ST_KOM)    { s.kom++; }
    else if (st === ST_OTKAZ)  { s.otkaz++; }
    else if (st === ST_FSSP)   { s.fssp++; }

    // дневная отметка для streak'a: если хоть один отказ/ФССП в день — день "грязный"
    if (day) {
      if (s.dailyClean[day] === undefined) s.dailyClean[day] = true;
      if (st === ST_OTKAZ || st === ST_FSSP) s.dailyClean[day] = false;
    }
  }
  // Посчитаем максимальный streak чистых дней (по календарю)
  Object.values(mgrs).forEach(m => {
    const days = Object.keys(m.stats.dailyClean).sort();
    let cur = 0, best = 0, prev = null;
    days.forEach(dStr => {
      const d = new Date(dStr);
      if (m.stats.dailyClean[dStr]) {
        if (prev && (d - prev) === 86400000) cur++;
        else cur = 1;
        if (cur > best) best = cur;
        prev = d;
      } else {
        cur = 0; prev = d;
      }
    });
    m.stats.cleanStreak = best;
  });
}

function hasTripleCreditDay(byDay) {
  for (const k in byDay) if (byDay[k] >= 3) return true;
  return false;
}

/* ──────────────────────── УТИЛИТЫ ──────────────────────── */

function readSheetSafe(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) return [];
  const range = sh.getDataRange();
  return range.getValues();
}

function readAwardsIndex(ss, period) {
  // Возвращает { 'code|name_lower': true } для записей с note содержащим period
  const rows = readSheetSafe(ss, SHEET_TROPHY_AWARDS);
  const idx = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]; if (!row) continue;
    const code = String(row[0] || '').trim();
    const name = String(row[1] || '').trim();
    const note = String(row[6] || '');
    const status = String(row[5] || 'active').toLowerCase().trim();
    if (!code || !name) continue;
    if (status === 'locked') { // явный locked = трогать нельзя
      idx[code + '|' + name.toLowerCase()] = true;
      continue;
    }
    if (note.indexOf(period) >= 0) idx[code + '|' + name.toLowerCase()] = true;
  }
  return idx;
}

function appendRows(ss, sheetName, rows) {
  let sh = ss.getSheetByName(sheetName);
  if (!sh) {
    sh = ss.insertSheet(sheetName);
    sh.appendRow(['trophy_code', 'manager_name', 'awarded_at', 'awarded_by', 'source', 'status', 'note']);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
}

function mmYY(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return mm + yy;
}
function ymKey(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return d.getFullYear() + '-' + mm;
}
function isoDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function firstOfNextMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 1); }

function parseDayKey(val) {
  if (!val) return null;
  if (val instanceof Date) return isoDate(val);
  const s = String(val).trim();
  // Форматы: "DD.MM.YYYY", "YYYY-MM-DD", "DD/MM/YYYY"
  let m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (m) {
    let y = parseInt(m[3]); if (y < 100) y += 2000;
    return y + '-' + String(parseInt(m[2])).padStart(2, '0') + '-' + String(parseInt(m[1])).padStart(2, '0');
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + String(parseInt(m[2])).padStart(2, '0') + '-' + String(parseInt(m[3])).padStart(2, '0');
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : isoDate(d);
}

function parseDob(val) {
  if (!val) return null;
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})[.\-/](\d{1,2})/);
  if (!m) return null;
  return { day: parseInt(m[1]), month: parseInt(m[2]) };
}

/* ──────────────────────── РУЧНОЙ ТЕСТ ──────────────────────── */
// Запускай эти функции из редактора Apps Script (Run → выбрать функцию) для отладки.

function debugLastMonth()   { awardMonthlyTrophies(); }
function debugTodayBirthday() { awardDailyTrophies(); }
function debugHnyNow()      { awardHnyTrophies(); }
function debugMilestonesNow() { awardMilestoneTrophies(new Date()); }

/**
 * Ручной прогон за конкретный месяц (формат '2026-05').
 * Пример вызова: rerunFor('2026-05')
 */
function rerunFor(periodStr) {
  const m = String(periodStr).match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new Error('rerunFor: ожидается YYYY-MM, получено ' + periodStr);
  awardMonthlyTrophiesFor(new Date(parseInt(m[1]), parseInt(m[2]) - 1, 1));
}
