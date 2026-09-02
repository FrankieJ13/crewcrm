/* Регрессионные тесты «Пешие сделки» (js/pedestrian-deals.js). Запуск: node test/pedestrian.test.js */
const P = require('../js/pedestrian-deals.js');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗ FAIL:', name); } }
function eq(name, a, b) { ok(name + ` (=${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

// строит один deal как buildDeals для одной строки
function mkDeal(f) {
  const ph = new Set(); (f.phones || []).forEach(p => P.extractPhones(p).forEach(x => ph.add(x)));
  const closed = P.parseDateStrict(f.closed || ''), visit = P.parseDateStrict(f.visit || '');
  return {
    id: f.id != null ? f.id : '1', resp: f.resp || '', respCity: P.resolvePedestrianCity(f.resp || ''),
    closedRaw: f.closed || '', closed, closeInvalid: !!f.closed && !closed && !/не закрыт/i.test(f.closed || ''),
    visitRaw: f.visit || '', visit, visitInvalid: !!f.visit && !visit,
    reason: f.reason || '', success: f.success || '', stage: '', cityVyd: '', crmResp: '', phones: [...ph],
  };
}
const WIDE = { from: '01.01.2020', to: '31.12.2030' };
// хелпер: статус пешей и id основной CRM
function run(peds, period) { return P.analyze(peds, period || WIDE, { phoneCols: 1 }); }
function firstResult(peds, period) { const r = run(peds, period).results.find(x => x.ped.respCity); return r; }

console.log('— КАЛЕНДАРНЫЕ 4 МЕСЯЦА (minusCalendarMonths) —');
eq('02.09.2026 −4 = 02.05.2026', P.minusCalendarMonths({ d: 2, m: 9, y: 2026 }, 4), { d: 2, m: 5, y: 2026 });
eq('30.06.2026 −4 = 28.02.2026', P.minusCalendarMonths({ d: 30, m: 6, y: 2026 }, 4), { d: 28, m: 2, y: 2026 });
eq('31.07.2026 −4 = 31.03.2026', P.minusCalendarMonths({ d: 31, m: 7, y: 2026 }, 4), { d: 31, m: 3, y: 2026 });
eq('31.05.2026 −4 = 31.01.2026', P.minusCalendarMonths({ d: 31, m: 5, y: 2026 }, 4), { d: 31, m: 1, y: 2026 });
eq('30.06.2024 −4 = 29.02.2024 (високос)', P.minusCalendarMonths({ d: 30, m: 6, y: 2024 }, 4), { d: 29, m: 2, y: 2024 });
eq('15.02.2026 −4 = 15.10.2025 (перескок года)', P.minusCalendarMonths({ d: 15, m: 2, y: 2026 }, 4), { d: 15, m: 10, y: 2025 });

console.log('\n— СТРОГИЕ ДАТЫ (parseDateStrict) —');
ok('31.02.2026 → null', P.parseDateStrict('31.02.2026') === null);
ok('29.02.2024 → валидна (високос)', !!P.parseDateStrict('29.02.2024'));
ok('29.02.2026 → null (не високос)', P.parseDateStrict('29.02.2026') === null);
ok('02.09.2026 10:00:00 → валидна (с временем)', JSON.stringify(P.parseDateStrict('02.09.2026 10:00:00')) === JSON.stringify({ d: 2, m: 9, y: 2026 }));
ok('«не закрыта» → null', P.parseDateStrict('не закрыта') === null);

console.log('\n— ГОРОД (resolvePedestrianCity) —');
eq('«Пермь» → Пермь', P.resolvePedestrianCity('Пермь'), 'Пермь');
eq('«Город Пермь» → Пермь', P.resolvePedestrianCity('Город Пермь'), 'Пермь');
eq('«Пермь / Салон» → Пермь', P.resolvePedestrianCity('Пермь / Салон'), 'Пермь');
eq('«Пермь КСО» → Пермь', P.resolvePedestrianCity('Пермь КСО'), 'Пермь');
ok('«Пермяков» → null (не ложный матч)', P.resolvePedestrianCity('Пермяков') === null);
ok('«Пермяков» не «похож на город» (нет подстроки «пермь»)', P.looksLikeCity('Пермяков') === false);
ok('«Кетов Дмитрий» → null', P.resolvePedestrianCity('Кетов Дмитрий Игоревич') === null);
ok('«Пермьская обл» → null, но looksLikeCity=true (диагностика опечаток)', P.resolvePedestrianCity('Пермьская обл') === null && P.looksLikeCity('Пермьская обл') === true);

console.log('\n— ТЕЛЕФОНЫ —');
const A = P.extractPhones('+7 912 345-67-89')[0], B = P.extractPhones('8912 345 67 89')[0];
ok('+7 912… и 8912… — один номер', A === B && !!A);
eq('короткий/внутренний «1234» → []', P.extractPhones('1234'), []);
eq('дата «10.08.2026» → []', P.extractPhones('10.08.2026'), []);

console.log('\n— МАТЧИНГ (analyze) —');
const ped = { resp: 'Пермь', visit: '02.09.2026', phones: ['79123456789'] };
// 1
ok('1. визит 02.09 / закр 04.05 / тел совпал → MATCH', firstResult([mkDeal({ id: 'p', ...ped }), mkDeal({ id: 'c', closed: '04.05.2026', phones: ['89123456789'] })]).status === 'found');
// 2
ok('2. закр 05.09 после визита 02.09 → NO MATCH', firstResult([mkDeal({ id: 'p', ...ped }), mkDeal({ id: 'c', closed: '05.09.2026', phones: ['89123456789'] })]).status === 'none');
// 3
ok('3. закр 01.05 при визите 02.09 → NO MATCH (до окна)', firstResult([mkDeal({ id: 'p', ...ped }), mkDeal({ id: 'c', closed: '01.05.2026', phones: ['89123456789'] })]).status === 'none');
// 4
ok('4. закр ровно 02.05 → MATCH (граница)', firstResult([mkDeal({ id: 'p', ...ped }), mkDeal({ id: 'c', closed: '02.05.2026', phones: ['89123456789'] })]).status === 'found');
// 5
ok('5. визит 30.06.2026 / закр 28.02.2026 → MATCH', firstResult([mkDeal({ id: 'p', resp: 'Пермь', visit: '30.06.2026', phones: ['79123456789'] }), mkDeal({ id: 'c', closed: '28.02.2026', phones: ['89123456789'] })]).status === 'found');
// 6
ok('6. визит 30.06.2026 / закр 27.02.2026 → NO MATCH', firstResult([mkDeal({ id: 'p', resp: 'Пермь', visit: '30.06.2026', phones: ['79123456789'] }), mkDeal({ id: 'c', closed: '27.02.2026', phones: ['89123456789'] })]).status === 'none');
// 7
ok('7. високос 30.06.2024 / 29.02.2024 → MATCH', firstResult([mkDeal({ id: 'p', resp: 'Пермь', visit: '30.06.2024', phones: ['79123456789'] }), mkDeal({ id: 'c', closed: '29.02.2024', phones: ['89123456789'] })]).status === 'found');
// 8
ok('8. у старой заполнена дата визита → NO MATCH', firstResult([mkDeal({ id: 'p', ...ped }), mkDeal({ id: 'c', closed: '04.05.2026', visit: '05.05.2026', phones: ['89123456789'] })]).status === 'none');
// 9
ok('9. старая успешная → NO MATCH', firstResult([mkDeal({ id: 'p', ...ped }), mkDeal({ id: 'c', closed: '04.05.2026', success: 'Кредит', phones: ['89123456789'] })]).status === 'none');
// 10
ok('10. причина 1_ДУБЛЬ → NO MATCH', firstResult([mkDeal({ id: 'p', ...ped }), mkDeal({ id: 'c', closed: '04.05.2026', reason: '1_ДУБЛЬ', phones: ['89123456789'] })]).status === 'none');
// 11
ok('11. причина 1_ХОЗ → NO MATCH', firstResult([mkDeal({ id: 'p', ...ped }), mkDeal({ id: 'c', closed: '04.05.2026', reason: '1_ХОЗ', phones: ['89123456789'] })]).status === 'none');
// 12
ok('12. +7 912 vs 8912 → MATCH', firstResult([mkDeal({ id: 'p', resp: 'Пермь', visit: '02.09.2026', phones: ['+7 912 345-67-89'] }), mkDeal({ id: 'c', closed: '04.05.2026', phones: ['8912 345 67 89'] })]).status === 'found');
// 13
ok('13. у пешей 2 тел, совпал второй → MATCH', firstResult([mkDeal({ id: 'p', resp: 'Пермь', visit: '02.09.2026', phones: ['79990000000', '79123456789'] }), mkDeal({ id: 'c', closed: '04.05.2026', phones: ['89123456789'] })]).status === 'found');
// 14
ok('14. у старой несколько тел, совпал любой → MATCH', firstResult([mkDeal({ id: 'p', ...ped }), mkDeal({ id: 'c', closed: '04.05.2026', phones: ['78881112233, 89123456789'] })]).status === 'found');
// 15
(() => {
  const r = firstResult([mkDeal({ id: 'p', ...ped }),
    mkDeal({ id: 'c1', closed: '10.05.2026', phones: ['89123456789'] }),
    mkDeal({ id: 'c2', closed: '15.07.2026', phones: ['89123456789'] }),
    mkDeal({ id: 'c3', closed: '29.08.2026', phones: ['89123456789'] })]);
  ok('15. несколько CRM → основная = ближайшая (29.08)', r.status === 'found' && r.crm.length === 3 && r.crm[0].id === 'c3');
})();
// 16 — покрыт parseDateStrict('31.02.2026')===null выше; проверим статус check у пешей с плохой датой
ok('16. пешая с 31.02.2026 → check (не матчинг)', firstResult([mkDeal({ id: 'p', resp: 'Пермь', visit: '31.02.2026', phones: ['79123456789'] })]).status === 'check');
// 17
(() => {
  const res = run([mkDeal({ id: '', resp: 'Пермь', visit: '02.09.2026', phones: ['79123456789'] }), mkDeal({ id: 'c', closed: '04.05.2026', phones: ['89123456789'] })]);
  const pedRes = res.results.find(x => x.ped.respCity);
  ok('17. пешая с пустым ID → check «Нет ID», не матчинг', pedRes.status === 'check' && res.diag.excludedQuality >= 1);
})();
// 17b — старая без ID не участвует (не схлопывает)
ok('17b. старая CRM без ID не даёт совпадения', firstResult([mkDeal({ id: 'p', ...ped }), mkDeal({ id: '', closed: '04.05.2026', phones: ['89123456789'] })]).status === 'none');
// 18/19 покрыты resolvePedestrianCity выше
// 20
(() => {
  const res = run([mkDeal({ id: 'x', resp: 'Пермяков', visit: '02.09.2026', phones: ['79123456789'] })]);
  ok('20. неизвестный ответственный → в диагностике, не пешая', res.results.length === 0 && res.diag.unknownResp.some(u => u.v === 'Пермяков'));
})();
// 21
ok('21. один тел в нескольких колонках → одна связь (дедуп)', (() => {
  const d = mkDeal({ id: 'c', closed: '04.05.2026', phones: ['89123456789', '8-912-345-67-89'] });
  return d.phones.length === 1;
})());
// 22
ok('22. пешая вне периода → не участвует', run([mkDeal({ id: 'p', resp: 'Пермь', visit: '02.09.2026', phones: ['79123456789'] })], { from: '01.01.2025', to: '31.12.2025' }).results.length === 0);

console.log(`\n${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
