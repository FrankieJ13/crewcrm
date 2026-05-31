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
  awardVacationAnnual(now);
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

  // 1b) АНТИ-ТОП1/2/3 — худший прогресс (среди тех у кого был план > 0)
  const antiTop = arr.filter(m => m.plan > 0).sort((a, b) => a.prog - b.prog);
  if (antiTop[0]) push('antinumberone_monthly',   antiTop[0].name, `${period} · ${Math.round(antiTop[0].prog)}%`);
  if (antiTop[1]) push('antinumbertwo_monthly',   antiTop[1].name, `${period} · ${Math.round(antiTop[1].prog)}%`);
  if (antiTop[2]) push('antinumberthree_monthly', antiTop[2].name, `${period} · ${Math.round(antiTop[2].prog)}%`);

  // 2) Normal / Hard / I'm Super-man — выдаём по самой высокой достигнутой планке
  arr.forEach(m => {
    if (m.prog >= 150 && m.stats.kred >= 50) {
      push('veryhard_monthly', m.name, `${period} · ${Math.round(m.prog)}% · ${m.stats.kred} кредитов`);
    } else if (m.prog >= 130 && m.stats.kred >= 30) {
      push('hard_monthly',     m.name, `${period} · ${Math.round(m.prog)}% · ${m.stats.kred} кредитов`);
    } else if (m.prog >= 120 && m.stats.kred >= 20) {
      push('normal_monthly',   m.name, `${period} · ${Math.round(m.prog)}% · ${m.stats.kred} кредитов`);
    }
  });

  // 3) Коллектор — max сделок «Комиссия»
  const byKom = arr.filter(m => m.stats.kom > 0).sort((a, b) => b.stats.kom - a.stats.kom);
  if (byKom[0]) push('commission_monthly', byKom[0].name, `${period} · ${byKom[0].stats.kom} комиссии`);

  // 4) Кредиты по дням: 50+ → Святой Грааль, иначе 33+ → Счастливое число CRM
  arr.forEach(m => {
    if (m.stats.kred >= 50) {
      push('megakd_monthly', m.name, `${period} · ${m.stats.kred} кредитов`);
    } else if (m.stats.kred >= 33) {
      push('kd_monthly',     m.name, `${period} · ${m.stats.kred} кредитов`);
    }
  });

  // 5) Наличные: 20+ → Гамбит, иначе 10+ → Туз в рукаве
  arr.forEach(m => {
    if (m.stats.nalOnly >= 20) {
      push('megacash_monthly', m.name, `${period} · ${m.stats.nalOnly} налом`);
    } else if (m.stats.nalOnly >= 10) {
      push('cash_monthly',     m.name, `${period} · ${m.stats.nalOnly} налом`);
    }
  });

  // 6) Подряд в один день: 10+ → Флеш-рояль, иначе 3+ → Три в ряд
  arr.forEach(m => {
    const maxInDay = maxCreditsInSingleDay(m.stats.kreditDays);
    if (maxInDay >= 10) {
      push('10in1_monthly', m.name, `${period} · ${maxInDay} в день`);
    } else if (maxInDay >= 3) {
      push('3in1_monthly',  m.name, period);
    }
  });

  // 7) Идеальная неделя — 7 дней подряд без отказов/ФССП
  arr.forEach(m => {
    if (m.stats.cleanStreak >= 7) push('notfailure_monthly', m.name, `${period} · ${m.stats.cleanStreak}д подряд`);
  });

  // TODO (нужны формулы дохода):
  //   - emolument_monthly (макс доход месяца)
  //   - snatch_monthly    (макс доход за 6 мес)
  //   - profitability_monthly (макс доходность с одной сделки — manual)
  //   - broke_monthly / bankrupt_monthly — мин доход (требуется ZP{suffix})
  //   - sisyphus_monthly / effective_monthly — min/max conv в визит (CNVRS)

  // Anniversary — если у юзера год работы исполнился в течение месяца
  // (по DOB не определишь; пока MANUAL или добавь поле hire_date в USERS)

  if (toAppend.length) appendRows(ss, SHEET_TROPHY_AWARDS, toAppend);
  console.log(`[trophies] ${period}: добавлено выдач ${toAppend.length}`);

  // ===== Многомесячные трофеи с cooldown'ом ===========================
  awardMultiMonthTrophies(ss, targetDate, awardedAt);
}

/**
 * Multi-month трофеи с burn-логикой:
 *   loser_monthly    — 3 месяца подряд худшая эффективность
 *   mastodon_monthly — за 6 месяцев 1000 визитов
 *   mammoth_monthly  — за 6 месяцев 130 кредитов
 * После выдачи входящие месяцы пишутся в note "burned:YYYY-MM,..." и
 * больше не учитываются в будущих накоплениях для этого кода.
 */
function awardMultiMonthTrophies(ss, targetDate, awardedAt) {
  const usersRows = readSheetSafe(ss, SHEET_USERS);
  const mgrs = {};
  for (let i = 1; i < usersRows.length; i++) {
    const r = usersRows[i]; if (!r) continue;
    const name = String(r[U_NAME]||'').trim();
    const role = String(r[U_ROLE]||'').toLowerCase().trim();
    if (!name || (role !== 'crm' && role !== 'dozhim')) continue;
    mgrs[name.toLowerCase()] = name;
  }
  // Подгрузим планы и визиты за нужные периоды (макс 6 для cumulative-кодов)
  const periods6 = lastNPeriods(targetDate, 6);   // от старого к новому
  const periods3 = periods6.slice(-3);            // последние 3

  // mgrLow → period → { vis, kred, prog }
  const data = {};
  Object.keys(mgrs).forEach(nl => { data[nl] = {}; periods6.forEach(p => data[nl][p] = { vis:0, kred:0, prog:0, plan:0 }); });

  // Заполняем визиты за 6 месяцев
  periods6.forEach(p => {
    const [y, mm] = p.split('-');
    const sfx = String(parseInt(mm)).padStart(2,'0') + String(y).slice(-2);
    const vizityRows  = readSheetSafe(ss, PREFIX_VIZITY   + sfx);
    const dVizityRows = readSheetSafe(ss, PREFIX_D_VIZITY + sfx);
    const planRows    = readSheetSafe(ss, PREFIX_PLAN     + sfx);
    const planMap = {};
    for (let i = 1; i < planRows.length; i++) {
      const row = planRows[i]; if (!row || !row[0]) continue;
      const nm = String(row[0]).trim();
      const pl = parseInt(String(row[1]||'0').replace(/\D/g,''))||0;
      if (nm) planMap[nm.toLowerCase()] = pl;
    }
    const tmpStats = {};
    Object.keys(mgrs).forEach(nl => { tmpStats[nl] = emptyStats(); });
    aggregateInto(vizityRows,  tmpStats.__dummy ? {} : Object.fromEntries(Object.entries(mgrs).map(([k,v]) => [k, { name: v, role: 'crm', stats: tmpStats[k] }])));
    aggregateInto(dVizityRows, Object.fromEntries(Object.entries(mgrs).map(([k,v]) => [k, { name: v, role: 'dozhim', stats: tmpStats[k] }])));
    Object.keys(mgrs).forEach(nl => {
      const st = tmpStats[nl];
      const plan = planMap[nl] || 0;
      data[nl][p] = {
        vis: st.vis,
        kred: st.kred,
        plan: plan,
        prog: plan > 0 ? (st.vis / plan * 100) : 0,
      };
    });
  });

  const toAppend = [];

  // === loser_monthly — 3 последних месяца, худшая суммарная эффективность ===
  // Только если у менеджера есть план хотя бы в одном из 3 месяцев И ни один из них не burned.
  (function awardLoser() {
    const code = 'loser_monthly';
    const candidates = [];
    Object.entries(mgrs).forEach(([nl, name]) => {
      const burned = readBurnedPeriods(ss, code, name);
      if (periods3.some(p => burned.has(p))) return;
      const totals = periods3.reduce((acc, p) => {
        const d = data[nl][p];
        acc.plan += d.plan; acc.vis += d.vis;
        return acc;
      }, { plan: 0, vis: 0 });
      if (totals.plan <= 0) return;
      candidates.push({ nl, name, eff: (totals.vis / totals.plan * 100) });
    });
    if (!candidates.length) return;
    candidates.sort((a, b) => a.eff - b.eff);
    const w = candidates[0];
    const note = `${periods3[0]}..${periods3[2]} · ${Math.round(w.eff)}% · burned:${periods3.join(',')}`;
    toAppend.push([code, w.name, awardedAt, 'system', 'auto', 'active', note]);
  })();

  // === mastodon_monthly — 1000+ визитов за 6 непрерывных месяцев ===
  Object.entries(mgrs).forEach(([nl, name]) => {
    const code = 'mastodon_monthly';
    const burned = readBurnedPeriods(ss, code, name);
    if (periods6.some(p => burned.has(p))) return;
    const totalVis = periods6.reduce((s, p) => s + (data[nl][p].vis||0), 0);
    if (totalVis < 1000) return;
    const note = `${periods6[0]}..${periods6[5]} · ${totalVis} виз · burned:${periods6.join(',')}`;
    toAppend.push([code, name, awardedAt, 'system', 'auto', 'active', note]);
  });

  // === mammoth_monthly — 130+ кредитов за 6 непрерывных месяцев ===
  Object.entries(mgrs).forEach(([nl, name]) => {
    const code = 'mammoth_monthly';
    const burned = readBurnedPeriods(ss, code, name);
    if (periods6.some(p => burned.has(p))) return;
    const totalKred = periods6.reduce((s, p) => s + (data[nl][p].kred||0), 0);
    if (totalKred < 130) return;
    const note = `${periods6[0]}..${periods6[5]} · ${totalKred} кред · burned:${periods6.join(',')}`;
    toAppend.push([code, name, awardedAt, 'system', 'auto', 'active', note]);
  });

  if (toAppend.length) appendRows(ss, SHEET_TROPHY_AWARDS, toAppend);
  console.log(`[trophies] multi-month: добавлено выдач ${toAppend.length}`);
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

/* ─────── VACATION (annual, AUTO) ───────
   Раз в год: если у менеджера в листе «Отпуска {year}» есть хотя бы одна
   строка, у которой дата начала ≤ today — выдаём vacation_{year}_annual.
   Идемпотентно: повторно не выдаём (читаем существующие awards с этим кодом). */
function awardVacationAnnual(now) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const year = now.getFullYear();
  const code = 'vacation_' + year + '_annual';
  const period = String(year);
  const awardedAt = isoDate(now);
  const sheetName = 'Отпуска ' + year;
  const rows = readSheetSafe(ss, sheetName);
  if (!rows.length) { console.log('[trophies] vacation: лист ' + sheetName + ' не найден'); return; }
  const existing = readAwardsIndex(ss, period);
  const toAppend = [];
  const seen = new Set();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const name = String(r[0]||'').trim();
    const startStr = String(r[1]||'').trim();
    if (!name || !startStr) continue;
    // Парсим начало отпуска (DD.MM.YYYY или Date)
    let startDate = null;
    if (r[1] instanceof Date) startDate = r[1];
    else {
      const m = startStr.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
      if (m) {
        let y = parseInt(m[3]); if (y < 100) y += 2000;
        startDate = new Date(y, parseInt(m[2])-1, parseInt(m[1]));
      }
    }
    if (!startDate || startDate > now) continue;
    if (startDate.getFullYear() !== year) continue;
    const nl = name.toLowerCase();
    if (seen.has(nl)) continue;
    seen.add(nl);
    const key = code + '|' + nl;
    if (existing[key]) continue;
    toAppend.push([code, name, awardedAt, 'system', 'auto', 'active', period]);
  }
  if (toAppend.length) appendRows(ss, SHEET_TROPHY_AWARDS, toAppend);
  console.log(`[trophies] vacation ${year}: ${toAppend.length}`);
}

/* ─────── MILESTONE: 25/50/75/100 трофеев (once, AUTO) ─────── */
const MILESTONE_TROPHIES = [
  { code: '25trophies_once',  threshold: 25 },
  { code: '50trophies_once',  threshold: 50 },
  { code: '75trophies_once',  threshold: 75 },
  { code: '100trophies_once', threshold: 100 },
  { code: '150trophies_once', threshold: 150 },
  { code: '200trophies_once', threshold: 200 },
  { code: '300trophies_once', threshold: 300 },
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
function maxCreditsInSingleDay(byDay) {
  let m = 0;
  for (const k in byDay) if (byDay[k] > m) m = byDay[k];
  return m;
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

/**
 * Возвращает Set «сожжённых» (использованных) периодов YYYY-MM
 * для конкретной пары trophy_code + manager. Накопительные многомесячные
 * трофеи (например loser_monthly / bankrupt_monthly / mastodon_monthly /
 * mammoth_monthly) пишут в note строку вида "burned:YYYY-MM,YYYY-MM,..."
 * Эти месяцы не должны учитываться в следующих накоплениях.
 */
function readBurnedPeriods(ss, code, mgrName) {
  const rows = readSheetSafe(ss, SHEET_TROPHY_AWARDS);
  const nl = String(mgrName||'').toLowerCase().trim();
  const burned = new Set();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    if (String(r[0]||'').trim() !== code) continue;
    if (String(r[1]||'').toLowerCase().trim() !== nl) continue;
    const status = String(r[5]||'active').toLowerCase().trim();
    if (status === 'locked') continue;
    const note = String(r[6]||'');
    const m = note.match(/burned:([\d\-,\s]+)/);
    if (m) m[1].split(',').forEach(p => { const v = p.trim(); if (/^\d{4}-\d{2}$/.test(v)) burned.add(v); });
  }
  return burned;
}

/** Список последних N периодов YYYY-MM включая targetDate. */
function lastNPeriods(targetDate, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(targetDate.getFullYear(), targetDate.getMonth() - i, 1);
    out.push(ymKey(d));
  }
  return out.reverse(); // от старого к новому
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

/**
 * Миграция старых кодов star_monthly → hard_monthly и star2_monthly → normal_monthly.
 * Запускать вручную ОДИН РАЗ из редактора (Run → migrateLegacyMonthlyTrophyCodes).
 */
function migrateLegacyMonthlyTrophyCodes() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(SHEET_TROPHY_AWARDS);
  if (!sh) { console.log('TrophyAwards не найден'); return; }
  const range = sh.getDataRange();
  const values = range.getValues();
  const map = { 'star_monthly': 'hard_monthly', 'star2_monthly': 'normal_monthly' };
  let changed = 0;
  for (let i = 1; i < values.length; i++) {
    const code = String(values[i][0] || '').trim();
    if (map[code]) { values[i][0] = map[code]; changed++; }
  }
  if (changed) {
    range.setValues(values);
    console.log(`[migrate] переименовано выдач: ${changed}`);
  } else {
    console.log('[migrate] записей star_monthly/star2_monthly не найдено');
  }
}
