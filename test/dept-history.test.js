/* Регрессионные тесты «История отделов» (js/dept-history.js). Запуск: node test/dept-history.test.js
 * Покрывают все сценарии ТЗ (TEST 1–10) + мультипереводы, границы месяца, битые строки. */
const D = require('../js/dept-history.js');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗ FAIL:', name); } }
function eq(name, a, b) { ok(name + ` (=${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

const ms = s => D.parseDate(s);
// отдел на дату по журналу переводов
const at = (tr, cur, dateStr) => D.deptAtDate(tr, cur, ms(dateStr));
// отделы за месяц (суффикс MMYY)
const mon = (tr, cur, suffix) => D.deptsForMonth(tr, cur, suffix);
// собрать журнал из «человеческих» строк [id, name, old, new, date]
const H = (rows, known, warn) => D.parseHistory(rows, known, warn);

console.log('— normDept / deptFromRole —');
eq("normDept('CRM') = crm", D.normDept('CRM'), 'crm');
eq("normDept('ДОЖИМ') = dozhim", D.normDept('ДОЖИМ'), 'dozhim');
eq("normDept('dozhim') = dozhim", D.normDept('dozhim'), 'dozhim');
eq("normDept('Отдел CRM') = crm", D.normDept('Отдел CRM'), 'crm');
eq("normDept('') = null", D.normDept(''), null);
eq("normDept('ceo') = null", D.normDept('ceo'), null);
eq("deptFromRole('') = crm (пустая роль → CRM)", D.deptFromRole(''), 'crm');
eq("deptFromRole('crm') = crm", D.deptFromRole('crm'), 'crm');
eq("deptFromRole('dozhim') = dozhim", D.deptFromRole('dozhim'), 'dozhim');
eq("deptFromRole('ceo') = null", D.deptFromRole('ceo'), null);
eq("deptFromRole('rop') = null", D.deptFromRole('rop'), null);

console.log('— parseDate (строгая) —');
ok('2026-09-05 валидна', ms('2026-09-05') != null);
ok('05.09.2026 валидна (DD.MM.YYYY)', ms('05.09.2026') != null);
eq('2026-09-05 == 05.09.2026', ms('2026-09-05'), ms('05.09.2026'));
ok('2026-02-31 → null (нет такого дня)', ms('2026-02-31') == null);
ok('2026-13-01 → null (нет 13 месяца)', ms('2026-13-01') == null);
ok('пусто → null', ms('') == null);
ok('мусор → null', ms('вчера') == null);

console.log('— monthRange —');
eq("monthRange('0926').start = 2026-09-01", D.monthRange('0926').startMs, ms('2026-09-01'));
eq("monthRange('0926').end = 2026-09-30", D.monthRange('0926').endMs, ms('2026-09-30'));
eq("monthRange('0226').end = 2026-02-28", D.monthRange('0226').endMs, ms('2026-02-28'));
eq("monthRange('0224').end = 2024-02-29 (високос)", D.monthRange('0224').endMs, ms('2024-02-29'));
ok("monthRange('99') → null", D.monthRange('99') == null);

console.log('— TEST 1: пользователь без истории —');
const noHist = H([]).get('127') || [];
eq('deptAtDate([], crm) = crm', at(noHist, 'crm', '2026-09-15'), 'crm');
eq("месяц без истории (role=crm) → только CRM", mon(noHist, 'crm', '0926'), { crm: true, dozhim: false });
eq("месяц без истории (role=dozhim) → только ДОЖИМ", mon(noHist, 'dozhim', '0926'), { crm: false, dozhim: true });

console.log('— TEST 2: CRM → ДОЖИМ с 2026-09-05 —');
const t2 = H([['127', 'Иванов Иван', 'CRM', 'ДОЖИМ', '2026-09-05']]).get('127');
eq('2026-09-04 → CRM', at(t2, 'dozhim', '2026-09-04'), 'crm');
eq('2026-09-05 → ДОЖИМ', at(t2, 'dozhim', '2026-09-05'), 'dozhim');
eq('2026-09-06 → ДОЖИМ', at(t2, 'dozhim', '2026-09-06'), 'dozhim');

console.log('— TEST 3: ДОЖИМ → CRM с 2026-09-05 —');
const t3 = H([['127', 'Иванов', 'ДОЖИМ', 'CRM', '2026-09-05']]).get('127');
eq('до перевода (2026-09-04) → ДОЖИМ', at(t3, 'crm', '2026-09-04'), 'dozhim');
eq('с даты перевода (2026-09-05) → CRM', at(t3, 'crm', '2026-09-05'), 'crm');

console.log('— TEST 4: мультипереводы CRM→ДОЖИМ 09-05, ДОЖИМ→CRM 10-20 —');
const t4 = H([
  ['127', 'Иванов', 'CRM', 'ДОЖИМ', '2026-09-05'],
  ['127', 'Иванов', 'ДОЖИМ', 'CRM', '2026-10-20'],
]).get('127');
eq('2026-09-04 → CRM', at(t4, 'crm', '2026-09-04'), 'crm');
eq('2026-09-05 → ДОЖИМ', at(t4, 'crm', '2026-09-05'), 'dozhim');
eq('2026-10-19 → ДОЖИМ', at(t4, 'crm', '2026-10-19'), 'dozhim');
eq('2026-10-20 → CRM', at(t4, 'crm', '2026-10-20'), 'crm');

console.log('— TEST 4b: три перевода (пример ТЗ, входные строки НЕ по порядку) —');
const t4b = H([
  ['127', 'И', 'CRM', 'ДОЖИМ', '2027-01-15'],   // намеренно первым — проверяем сортировку
  ['127', 'И', 'CRM', 'ДОЖИМ', '2026-09-05'],
  ['127', 'И', 'ДОЖИМ', 'CRM', '2026-10-20'],
]).get('127');
eq('до 09-05 → CRM', at(t4b, 'dozhim', '2026-08-31'), 'crm');
eq('09-05..10-19 → ДОЖИМ', at(t4b, 'dozhim', '2026-10-01'), 'dozhim');
eq('10-20..2027-01-14 → CRM', at(t4b, 'dozhim', '2027-01-01'), 'crm');
eq('2027-01-15+ → ДОЖИМ', at(t4b, 'dozhim', '2027-01-15'), 'dozhim');

console.log('— TEST 5: перевод в середине месяца → оба отдела —');
eq('сентябрь (перевод 09-05) → оба отдела', mon(t2, 'dozhim', '0926'), { crm: true, dozhim: true });
eq('август (перевод в сентябре) → только CRM', mon(t2, 'dozhim', '0826'), { crm: true, dozhim: false });
eq('октябрь (перевод в сентябре) → только ДОЖИМ', mon(t2, 'dozhim', '1026'), { crm: false, dozhim: true });

console.log('— границы месяца —');
const tStart = H([['1', 'X', 'CRM', 'ДОЖИМ', '2026-09-01']]).get('1');
eq('перевод 1-го числа → весь месяц только ДОЖИМ', mon(tStart, 'dozhim', '0926'), { crm: false, dozhim: true });
const tEnd = H([['1', 'X', 'CRM', 'ДОЖИМ', '2026-09-30']]).get('1');
eq('перевод в последний день → оба отдела', mon(tEnd, 'dozhim', '0926'), { crm: true, dozhim: true });

console.log('— TEST 6: смешанные пользователи (A с историей, B без) —');
const mix = H([['127', 'A', 'CRM', 'ДОЖИМ', '2026-09-05']]);
eq('A (есть история) сентябрь → оба', mon(mix.get('127'), 'dozhim', '0926'), { crm: true, dozhim: true });
eq('B (нет истории, role=crm) сентябрь → только CRM', mon(mix.get('999') || [], 'crm', '0926'), { crm: true, dozhim: false });

console.log('— TEST 7: пустой журнал —');
eq('parseHistory([]).size = 0', H([]).size, 0);
eq('parseHistory([[]]).size = 0 (пустая строка пропущена)', H([[]]).size, 0);

console.log('— TEST 8: журнала нет вовсе (null/undefined) —');
eq('parseHistory(null).size = 0', H(null).size, 0);
eq('parseHistory(undefined).size = 0', H(undefined).size, 0);
eq('deptAtDate(undefined, crm) = crm (fallback)', D.deptAtDate(undefined, 'crm', ms('2026-09-05')), 'crm');

console.log('— TEST 9: битые строки пропускаются, не роняют —');
let warns = 0;
const t9 = H([
  ['127', 'Иванов', 'CRM', 'ДОЖИМ', '2026-09-05'], // валидная
  ['', 'Безымянный', 'CRM', 'ДОЖИМ', '2026-09-05'], // нет id
  ['200', 'Пётр', 'CRM', 'CRM', '2026-09-05'],      // old == new
  ['201', 'Сидор', 'CRM', 'ДОЖИМ', '2026-02-31'],   // битая дата
  ['202', 'Ольга', 'ЗАГАДКА', 'ДОЖИМ', '2026-09-05'], // отдел не распознан
  ['777', 'Чужой', 'CRM', 'ДОЖИМ', '2026-09-05'],   // id неизвестен USERS
], id => id !== '777', () => { warns++; });
eq('осталась только 1 валидная запись (id 127)', [...t9.keys()], ['127']);
ok('битые строки залогированы (warns >= 5)', warns >= 5);
eq('валидная запись работает', at(t9.get('127'), 'dozhim', '2026-09-06'), 'dozhim');

console.log('— TEST 10: одна личность на все отделы (id как ключ) —');
const t10 = H([
  ['127', 'Иванов', 'CRM', 'ДОЖИМ', '2026-09-05'],
  ['127', 'Иванов', 'ДОЖИМ', 'CRM', '2026-11-01'],
]);
eq('один user_id (не дублируется по отделам)', t10.size, 1);
eq('обе записи под одним id', t10.get('127').length, 2);

console.log(`\n${pass}/${pass + fail} passed` + (fail ? `, ${fail} FAILED` : ' — OK'));
process.exit(fail ? 1 : 0);
