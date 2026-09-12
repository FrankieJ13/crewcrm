/***************************************************************
 * CRM CREW DATA HUB — AMO FLOOR-GUARD (V1)
 *
 * ДОБАВЛЯЕТСЯ В ТОТ ЖЕ Apps Script проект, что и
 *   CRM_Crew_Data_Hub_V5.3_Traffic_AMO_MATCHES.gs  (ETL/AMO/MATCHES)
 *   CRM_Crew_Data_Hub_AUTOSYNC.gs                   (оркестратор)
 *
 * ЗАЧЕМ: выгрузка из amoCRM во ВНЕШНЮЮ google-таблицу иногда падает
 *   НЕ ЦЕЛИКОМ (была база 51 000 строк → пришла 16 000). Сделки из
 *   amoCRM не удаляются, поэтому свежая выгрузка АПРИОРИ не может быть
 *   меньше прошлой. Такой «недогруз» нельзя пускать в AMO_DEALS —
 *   иначе MATCHES/APP пересоберутся на битой урезанной базе.
 *
 * КАК РАБОТАЕТ (защёлка ПЕРЕД импортом, без снапшотов/лишних ячеек):
 *   • запоминаем размер ПОСЛЕДНЕЙ ХОРОШЕЙ выгрузки (Script Property);
 *   • перед стадией AMO оркестратор спрашивает guard: сколько строк
 *     сейчас в источнике?
 *       – если >= floor (RETAIN_RATIO × lastGood)  → импорт разрешён,
 *         после успешного импорта lastGood поднимается до нового числа;
 *       – если < floor (усечённая выгрузка)         → импорт ПРОПУСКАЕТСЯ,
 *         AMO_DEALS остаётся прежним (полным), цепочка идёт дальше на
 *         прошлой хорошей базе. Следующая ПОЛНАЯ выгрузка пройдёт сама.
 *   • guard НИКОГДА не понижает lastGood автоматически (только рост).
 *
 * FAIL-OPEN: если источник не настроен/не открывается — guard НЕ блокирует
 *   пайплайн (разрешает импорт и пишет WARN), чтобы кривая конфигурация
 *   не остановила автообновление. Настроишь — начнёт защищать.
 *
 * ═══ НАСТРОЙКА (1 раз) ═══
 *   1) Впиши в AMO_GUARD_CONFIG.SOURCE_SS_URL ссылку (или ID) на ту самую
 *      внешнюю таблицу-выгрузку amoCRM (та, что ты задавал в
 *      setupAmoSheetSource). При желании — SOURCE_TAB (имя вкладки).
 *      Оставишь пустым — guard попробует сам найти ID среди Script
 *      Properties; не найдёт — будет FAIL-OPEN (не мешает, но и не защищает).
 *   2) Сохрани проект. Запусти amoGuardStatus() — проверь, что видит строки
 *      источника. Один раз запусти amoGuardAcceptCurrent(), чтобы засеять
 *      lastGood текущим (полным) размером — тогда защита включится сразу.
 ***************************************************************/


/* ============================================================
 * CONFIG
 * ============================================================ */

const AMO_GUARD_CONFIG = {
  // Ссылка ИЛИ ID внешней таблицы-выгрузки amoCRM (источник AMO_DEALS).
  // Пример: 'https://docs.google.com/spreadsheets/d/XXXXXXXX/edit'  или  'XXXXXXXX'
  SOURCE_SS_URL: '',

  // Имя вкладки в источнике. Пусто → первая вкладка.
  SOURCE_TAB: '',

  // Имя листа готовой базы внутри хаба (для диагностики в статусе).
  AMO_DEALS_SHEET: 'AMO_DEALS',

  // Порог: пускаем импорт, если строк источника >= RETAIN_RATIO × lastGood.
  // 0.90 = разрешаем усадку до 10% (шум), больше — считаем усечением.
  // Строже некуда: сделки не удаляются, поэтому здоровая выгрузка только растёт.
  RETAIN_RATIO: 0.90,

  // Абсолютный минимум строк, ниже которого выгрузка считается битой
  // всегда (даже если lastGood ещё не засеян). 0 = выключено.
  MIN_ABS_ROWS: 0,

  // Что делать оркестратору при усечении:
  //   'SKIP_AMO'    — пропустить импорт, идти дальше на прошлой базе (реком.).
  //   'ABORT_CHAIN' — остановить всю цепочку до следующего тика.
  ON_TRUNCATED: 'SKIP_AMO',

  PROP_LASTGOOD: 'AMO_GUARD_LASTGOOD_ROWS_V1',
  LOG_SHEET:     'APP_AUTOSYNC_LOG', // тот же журнал, что у оркестратора
};


/* ============================================================
 * ИСТОЧНИК: поиск, открытие, подсчёт строк
 * ============================================================ */

// Достаём spreadsheet-ID из URL или принимаем «голый» ID.
function AMO_GUARD_extractId_(s) {
  if (!s) return '';
  s = String(s).trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s; // уже ID
  return '';
}

// Попытка авто-найти ID источника среди Script Properties (best-effort),
// если SOURCE_SS_URL не задан. Ищем значение, похожее на URL/ID таблицы.
function AMO_GUARD_autodetectId_() {
  try {
    const props = PropertiesService.getScriptProperties().getProperties();
    const keys = Object.keys(props);
    // сначала ключи, где явно пахнет amo/source/sheet
    keys.sort(function (a, b) {
      const pa = /amo|source|src|sheet|deal|export|выгруз/i.test(a) ? 0 : 1;
      const pb = /amo|source|src|sheet|deal|export|выгруз/i.test(b) ? 0 : 1;
      return pa - pb;
    });
    for (let i = 0; i < keys.length; i++) {
      const id = AMO_GUARD_extractId_(props[keys[i]]);
      if (id) return id;
    }
  } catch (_) {}
  return '';
}

function AMO_GUARD_sourceId_() {
  const cfg = AMO_GUARD_CONFIG;
  return AMO_GUARD_extractId_(cfg.SOURCE_SS_URL) || AMO_GUARD_autodetectId_();
}

function AMO_GUARD_openSourceSheet_() {
  const id = AMO_GUARD_sourceId_();
  if (!id) return null;
  let ss;
  try { ss = SpreadsheetApp.openById(id); } catch (_) { return null; }
  if (!ss) return null;
  const cfg = AMO_GUARD_CONFIG;
  let sh = null;
  try {
    sh = cfg.SOURCE_TAB ? ss.getSheetByName(cfg.SOURCE_TAB) : ss.getSheets()[0];
  } catch (_) { sh = null; }
  return sh || null;
}

// Число строк-данных в источнике (без шапки). null = источник недоступен.
function AMO_GUARD_countSource_() {
  const sh = AMO_GUARD_openSourceSheet_();
  if (!sh) return null;
  try { return Math.max(0, sh.getLastRow() - 1); } catch (_) { return null; }
}

// Число строк текущей готовой базы AMO_DEALS в хабе (для диагностики).
function AMO_GUARD_countAmoDeals_() {
  try {
    const hub = getHubSpreadsheet_(); // из V5.3/APP-слоя
    const sh = hub.getSheetByName(AMO_GUARD_CONFIG.AMO_DEALS_SHEET);
    if (!sh) return null;
    return Math.max(0, sh.getLastRow() - 1);
  } catch (_) { return null; }
}


/* ============================================================
 * ПАМЯТЬ: последний хороший размер
 * ============================================================ */

function AMO_GUARD_getLastGood_() {
  const raw = PropertiesService.getScriptProperties()
    .getProperty(AMO_GUARD_CONFIG.PROP_LASTGOOD);
  const n = raw ? parseInt(raw, 10) : 0;
  return isNaN(n) ? 0 : n;
}

function AMO_GUARD_setLastGood_(n) {
  PropertiesService.getScriptProperties()
    .setProperty(AMO_GUARD_CONFIG.PROP_LASTGOOD, String(Math.max(0, n | 0)));
}

// Поднять планку только вверх (никогда не понижаем автоматически).
function AMO_GUARD_raiseLastGood_(n) {
  if (n == null) return;
  const cur = AMO_GUARD_getLastGood_();
  if (n > cur) AMO_GUARD_setLastGood_(n);
}


/* ============================================================
 * ОЦЕНКА: пускать импорт или нет
 * ============================================================ */

// Возвращает вердикт по текущему источнику.
//   {configured, srcRows, lastGood, floor, allow, verdict, reason}
//   verdict: 'OK' | 'OK_GROWTH' | 'TRUNCATED' | 'UNKNOWN'
function AMO_GUARD_evaluate_() {
  const cfg = AMO_GUARD_CONFIG;
  const lastGood = AMO_GUARD_getLastGood_();
  const srcRows = AMO_GUARD_countSource_();

  // Источник недоступен → FAIL-OPEN (не блокируем пайплайн).
  if (srcRows == null) {
    return {
      configured: !!AMO_GUARD_sourceId_(),
      srcRows: null, lastGood: lastGood, floor: 0,
      allow: true, verdict: 'UNKNOWN',
      reason: AMO_GUARD_sourceId_()
        ? 'источник не открылся (нет доступа?) — fail-open'
        : 'источник не настроен (SOURCE_SS_URL пуст) — fail-open',
    };
  }

  const floorRatio = Math.floor(lastGood * cfg.RETAIN_RATIO);
  const floor = Math.max(floorRatio, cfg.MIN_ABS_ROWS | 0);

  // Первый запуск / планка не засеяна → пускаем (и позже поднимем lastGood).
  if (lastGood <= 0 && (cfg.MIN_ABS_ROWS | 0) <= 0) {
    return {
      configured: true, srcRows: srcRows, lastGood: lastGood, floor: 0,
      allow: true, verdict: 'OK',
      reason: 'планка ещё не засеяна — принимаем как базовую',
    };
  }

  if (srcRows >= floor) {
    return {
      configured: true, srcRows: srcRows, lastGood: lastGood, floor: floor,
      allow: true, verdict: srcRows >= lastGood ? 'OK_GROWTH' : 'OK',
      reason: srcRows >= lastGood
        ? ('источник вырос/равен: ' + srcRows + ' >= ' + lastGood)
        : ('в пределах допуска: ' + srcRows + ' >= floor ' + floor),
    };
  }

  return {
    configured: true, srcRows: srcRows, lastGood: lastGood, floor: floor,
    allow: false, verdict: 'TRUNCATED',
    reason: 'усечённая выгрузка: ' + srcRows + ' < floor ' + floor +
            ' (last good ' + lastGood + ')',
  };
}


/* ============================================================
 * ТОЧКИ ВХОДА ДЛЯ ОРКЕСТРАТОРА (зовёт AUTOSYNC)
 * ============================================================ */

// Пускать ли импорт AMO прямо сейчас? Возвращает evaluate() + пишет в лог.
// Оркестратор запоминает srcRows и после DONE зовёт AMO_GUARD_commitGood_.
function AMO_GUARD_gate_() {
  const ev = AMO_GUARD_evaluate_();
  if (ev.verdict === 'TRUNCATED') {
    AMO_GUARD_log_('WARN', ev.reason + ' → импорт AMO пропущен');
  } else if (ev.verdict === 'UNKNOWN') {
    AMO_GUARD_log_('WARN', ev.reason);
  }
  return ev;
}

// После успешного импорта AMO поднять планку до фактически принятого размера.
// preCount — то, что guard видел на входе (может быть null → пересчитаем).
function AMO_GUARD_commitGood_(preCount) {
  let n = (preCount == null) ? AMO_GUARD_countSource_() : preCount;
  if (n == null) n = AMO_GUARD_countAmoDeals_(); // крайний случай
  if (n != null && n > 0) {
    AMO_GUARD_raiseLastGood_(n);
    AMO_GUARD_log_('INFO', 'AMO принят, планка lastGood = ' + AMO_GUARD_getLastGood_());
  }
}


/* ============================================================
 * РУЧНЫЕ КОМАНДЫ (меню/редактор)
 * ============================================================ */

// Показать вердикт guard: источник, планка, порог, решение.
function amoGuardStatus() {
  const ev = AMO_GUARD_evaluate_();
  const amoNow = AMO_GUARD_countAmoDeals_();
  const id = AMO_GUARD_sourceId_();
  const lines = [];
  lines.push('AMO FLOOR-GUARD');
  lines.push('Источник: ' + (id ? ('OK (…' + id.slice(-6) + ')') : 'НЕ НАСТРОЕН'));
  lines.push('Строк в источнике: ' + (ev.srcRows == null ? '— (недоступен)' : ev.srcRows));
  lines.push('AMO_DEALS сейчас: ' + (amoNow == null ? '—' : amoNow));
  lines.push('Планка (last good): ' + ev.lastGood);
  lines.push('Порог (floor ' + Math.round(AMO_GUARD_CONFIG.RETAIN_RATIO * 100) + '%): ' + ev.floor);
  lines.push('');
  lines.push('Вердикт: ' + ev.verdict + (ev.allow ? ' → импорт РАЗРЕШЁН' : ' → импорт БУДЕТ ПРОПУЩЕН'));
  lines.push(ev.reason);
  if (ev.lastGood <= 0) {
    lines.push('');
    lines.push('Планка пуста. Если сейчас источник ПОЛНЫЙ — запусти');
    lines.push('amoGuardAcceptCurrent(), чтобы засеять планку и включить защиту.');
  }
  AMO_GUARD_alert_(lines.join('\n'));
}

// Принять текущий размер источника как «последний хороший» (засев/override).
// Используй, когда выгрузка ЗАВЕДОМО полная (или после реальной чистки amo).
function amoGuardAcceptCurrent() {
  const n = AMO_GUARD_countSource_();
  if (n == null) {
    AMO_GUARD_alert_('Источник недоступен: проверь SOURCE_SS_URL и доступ к таблице.');
    return;
  }
  AMO_GUARD_setLastGood_(n); // прямой set (можно и понизить — это ручное решение)
  AMO_GUARD_log_('INFO', 'планка вручную установлена = ' + n);
  AMO_GUARD_alert_('Планка last good = ' + n + '.\nЗащита активна: выгрузки меньше ' +
    Math.floor(n * AMO_GUARD_CONFIG.RETAIN_RATIO) + ' строк будут отклоняться.');
}

// Сбросить планку (защита уснёт до следующего успешного импорта/засева).
function amoGuardReset() {
  PropertiesService.getScriptProperties().deleteProperty(AMO_GUARD_CONFIG.PROP_LASTGOOD);
  AMO_GUARD_log_('INFO', 'планка сброшена');
  AMO_GUARD_alert_('Планка last good сброшена. Следующий импорт примется как базовый.');
}

// Ручной guarded-запуск AMO (для запуска из редактора в обход оркестратора).
// Проверяет источник и, если ок, зовёт штатный startAmoDealsRebuild().
function amoGuardedAmoRebuild() {
  const ev = AMO_GUARD_gate_();
  if (!ev.allow) {
    AMO_GUARD_alert_('AMO НЕ запущен: ' + ev.reason +
      '\n\nЕсли выгрузка всё же корректна — amoGuardAcceptCurrent(), затем повтори.');
    return;
  }
  startAmoDealsRebuild();               // из V5.3
  AMO_GUARD_commitGood_(ev.srcRows);
  AMO_GUARD_alert_('AMO-пересборка запущена (guard: ' + ev.verdict + ', ' +
    ev.srcRows + ' строк).');
}


/* ============================================================
 * ЛОГ/ALERT — пишем в тот же журнал, что и оркестратор
 * ============================================================ */

function AMO_GUARD_log_(level, msg) {
  try {
    const hub = getHubSpreadsheet_();
    let sh = hub.getSheetByName(AMO_GUARD_CONFIG.LOG_SHEET);
    if (!sh) {
      sh = hub.insertSheet(AMO_GUARD_CONFIG.LOG_SHEET);
      sh.appendRow(['ts', 'level', 'stage', 'message']);
      try { sh.hideSheet(); } catch (_) {}
    }
    sh.appendRow([new Date().toISOString(), level, 'AMO_GUARD', String(msg || '')]);
    const last = sh.getLastRow();
    if (last > 2200) sh.deleteRows(2, 1000);
  } catch (_) {}
}

function AMO_GUARD_alert_(text) {
  try { SpreadsheetApp.getUi().alert(text); }
  catch (_) { try { Logger.log(text); } catch (__) {} }
}
