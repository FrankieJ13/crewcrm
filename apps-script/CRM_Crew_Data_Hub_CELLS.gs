/***************************************************************
 * CRM CREW DATA HUB — ЁМКОСТЬ КНИГИ (лимит 10 000 000 ячеек)
 *
 * ДОБАВЛЯЕТСЯ В ТОТ ЖЕ Apps Script проект (V5.3 + APP-слой + AUTOSYNC).
 *
 * Проблема: в одной Google-таблице максимум 10 000 000 ЯЧЕЕК по ВСЕМ листам.
 * Data Hub держит TRAFFIC_VISITS + AMO_DEALS + MATCHES + APP_TRAFFIC_ARCHIVE
 * (~58k строк × 30/51/40/54 колонок ≈ 10M), а пересборка добавляет ещё
 * __STAGING и __BACKUP__ копии → перелезает за лимит. Ошибка:
 *   «количество ячеек в книге превысит максимально допустимое (10000000)»
 *   at resetStagingSheet_ → hub.insertSheet(...)
 *
 * Здесь — ДИАГНОСТИКА и БЕЗОПАСНАЯ ЧИСТКА (не трогает рабочие листы):
 *   hubCellReport()   — сколько ячеек на каждом листе + итог + свободно.
 *   hubReclaimCells() — удаляет transient-листы (__STAGING/__OLD/__FAILED__/
 *                       __BACKUP__ — они регенерируются) и обрезает пустой грид
 *                       у остальных до фактических данных. Освобождает ячейки.
 *
 * ⚠️ Запускать hubReclaimCells() ТОЛЬКО когда пересборка НЕ идёт (иначе удалим
 *    рабочий staging). Функция сама проверяет статусы стадий и откажет, если
 *    какая-то RUNNING.
 ***************************************************************/

// Рабочие (output) листы — НИКОГДА не удаляем и не режем строки данных.
const HUB_PROTECTED_SHEETS = [
  'TRAFFIC_VISITS', 'AMO_DEALS', 'MATCHES',
  'APP_TRAFFIC_ARCHIVE', 'APP_META', 'APP_API_LOG',
  'TRAFFIC_ERRORS', 'AMO_ERRORS', 'MATCH_ERRORS',
  'TRAFFIC_SYNC_LOG', 'AMO_SYNC_LOG', 'MATCH_SYNC_LOG',
  'APP_AUTOSYNC_LOG',
];

// Признак «временного» (регенерируемого) листа пересборки.
function HUB_isTransient_(name) {
  return /__STAGING$/.test(name) || /__OLD$/.test(name) ||
         /__BACKUP__/.test(name) || /__FAILED__/.test(name);
}

function HUB_totalCells_(ss) {
  return ss.getSheets().reduce((a, sh) => a + sh.getMaxRows() * sh.getMaxColumns(), 0);
}

function HUB_num_(n) { return Number(n || 0).toLocaleString('ru-RU'); }

// ── ДИАГНОСТИКА ──────────────────────────────────────────────────────────────
function hubCellReport() {
  const ss = getHubSpreadsheet_();
  const LIMIT = 10000000;
  const rows = ss.getSheets().map(sh => {
    const maxR = sh.getMaxRows(), maxC = sh.getMaxColumns();
    const lr = sh.getLastRow(), lc = sh.getLastColumn();
    return {
      name: sh.getName(), maxR, maxC, cells: maxR * maxC,
      lr, lc, wasteRows: Math.max(0, maxR - lr), wasteCols: Math.max(0, maxC - lc),
      transient: HUB_isTransient_(sh.getName()),
    };
  }).sort((a, b) => b.cells - a.cells);

  const total = rows.reduce((a, x) => a + x.cells, 0);
  const transientCells = rows.filter(x => x.transient).reduce((a, x) => a + x.cells, 0);
  const wasteCells = rows.reduce((a, x) => a + (x.maxR * x.wasteCols + x.wasteRows * x.lc), 0);

  const lines = rows.map(x =>
    (x.transient ? '🗑 ' : '   ') + x.name + ': ' +
    HUB_num_(x.maxR) + '×' + x.maxC + ' = ' + HUB_num_(x.cells) + ' яч.' +
    '  (данные ' + HUB_num_(x.lr) + '×' + x.lc +
    (x.wasteRows || x.wasteCols ? '; пусто +' + HUB_num_(x.wasteRows) + ' стр/+' + x.wasteCols + ' кол' : '') + ')'
  );

  const msg =
    'ЁМКОСТЬ DATA HUB\n' +
    'ИТОГО: ' + HUB_num_(total) + ' / ' + HUB_num_(LIMIT) + ' ячеек' +
    '  (свободно ' + HUB_num_(LIMIT - total) + ')\n' +
    'Временные листы (можно удалить): ' + HUB_num_(transientCells) + ' яч.\n' +
    'Пустой грид (можно обрезать): ~' + HUB_num_(wasteCells) + ' яч.\n' +
    'Листов: ' + rows.length + '\n\n' +
    lines.join('\n');

  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (_) {}
  return msg;
}

// ── БЕЗОПАСНАЯ ЧИСТКА ─────────────────────────────────────────────────────────
function hubReclaimCells() {
  // Защита: не чистим во время активной пересборки (удалили бы рабочий staging).
  const busy = HUB_anyRebuildRunning_();
  if (busy) {
    const m = 'Пересборка идёт (' + busy + '=RUNNING). Дождись завершения/останови и повтори.';
    try { SpreadsheetApp.getUi().alert(m); } catch (_) {}
    return m;
  }

  const ss = getHubSpreadsheet_();
  const before = HUB_totalCells_(ss);
  const killed = [], trimmed = [];

  // 1) Удаляем временные листы (staging/old/failed/backup) — регенерируются.
  ss.getSheets().forEach(sh => {
    const n = sh.getName();
    if (HUB_isTransient_(n) && HUB_PROTECTED_SHEETS.indexOf(n) < 0) {
      try { ss.deleteSheet(sh); killed.push(n); } catch (e) {}
    }
  });

  // 2) Обрезаем пустой грид у ОСТАВШИХСЯ листов до фактических данных.
  ss.getSheets().forEach(sh => {
    const maxR = sh.getMaxRows(), maxC = sh.getMaxColumns();
    const lr = Math.max(1, sh.getLastRow()), lc = Math.max(1, sh.getLastColumn());
    if (maxR > lr) { try { sh.deleteRows(lr + 1, maxR - lr); trimmed.push(sh.getName() + ' −' + HUB_num_(maxR - lr) + ' стр'); } catch (e) {} }
    if (maxC > lc) { try { sh.deleteColumns(lc + 1, maxC - lc); trimmed.push(sh.getName() + ' −' + (maxC - lc) + ' кол'); } catch (e) {} }
  });

  const after = HUB_totalCells_(ss);
  const msg =
    'ОСВОБОЖДЕНО: ' + HUB_num_(before - after) + ' ячеек.\n' +
    'Было ' + HUB_num_(before) + ' → стало ' + HUB_num_(after) +
    ' / 10 000 000 (свободно ' + HUB_num_(10000000 - after) + ').\n\n' +
    'Удалено листов: ' + killed.length + (killed.length ? '\n • ' + killed.join('\n • ') : '') + '\n\n' +
    'Обрезан грид: ' + (trimmed.length ? trimmed.join(', ') : '—');

  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (_) {}
  return msg;
}

// ── ОСВОБОДИТЬ МЕСТО ПОД ПЕРЕСБОРКУ: удалить ПРОИЗВОДНЫЕ листы ─────────────────
// MATCHES и APP_TRAFFIC_ARCHIVE регенерируются пересборкой из TRAFFIC_VISITS+AMO_DEALS.
// Удаляем их (и их __STAGING/__BACKUP__/__OLD/__FAILED__), чтобы освободить ~5-6M
// ячеек — тогда пересборка (уже с фильтром 2025+/без пешего) влезет в лимит.
// ⚠️ Картотека-API вернёт пусто, пока APP-стадия не пересоберёт архив — запускай
//    пересборку сразу после. Отказывает, если пересборка идёт.
function hubDropDerivedSheets() {
  const busy = HUB_anyRebuildRunning_();
  if (busy) { const m = 'Пересборка идёт (' + busy + '=RUNNING). Останови/дождись и повтори.'; try { SpreadsheetApp.getUi().alert(m); } catch (_) {} return m; }

  const ss = getHubSpreadsheet_();
  const before = HUB_totalCells_(ss);
  const targets = ['MATCHES', 'APP_TRAFFIC_ARCHIVE'];  // производные — пересобираются
  const killed = [];
  ss.getSheets().forEach(sh => {
    const n = sh.getName();
    const hit = targets.some(t => n === t || n.indexOf(t + '__') === 0);  // сам лист + его __STAGING/__BACKUP__/…
    if (hit) { try { ss.deleteSheet(sh); killed.push(n); } catch (e) {} }
  });

  const after = HUB_totalCells_(ss);
  const msg =
    'Удалены производные листы (пересоберутся): ' + killed.length +
    (killed.length ? '\n • ' + killed.join('\n • ') : '') + '\n\n' +
    'Освобождено ' + HUB_num_(before - after) + ' ячеек. Стало ' + HUB_num_(after) +
    ' / 10 000 000 (свободно ' + HUB_num_(10000000 - after) + ').\n\n' +
    'Дальше: «AUTO: запустить сейчас» — цепочка пересоберёт TRAFFIC_VISITS ' +
    '(уже с фильтром 2025+/без пешего) → MATCHES → APP.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (_) {}
  return msg;
}

// Идёт ли пересборка любой стадии (по Script Property статусам стадий).
// typeof по необъявленному идентификатору в JS не бросает — безопасно.
function HUB_anyRebuildRunning_() {
  function running(fn) { try { const st = (typeof fn === 'function') ? fn() : null; return !!(st && st.status === 'RUNNING'); } catch (_) { return false; } }
  if (typeof readTrafficState_ !== 'undefined' && running(readTrafficState_)) return 'Traffic';
  if (typeof readAmoState_     !== 'undefined' && running(readAmoState_))     return 'AMO';
  if (typeof readMatchesState_ !== 'undefined' && running(readMatchesState_)) return 'MATCHES';
  if (typeof APP_readState_    !== 'undefined' && running(APP_readState_))     return 'APP';
  return '';
}

// ── ДИАГНОСТИКА ДАТ ───────────────────────────────────────────────────────────
// «Архив» показывает 0 за период → проверяем, что реально лежит в visit_date
// у APP_TRAFFIC_ARCHIVE (и в traffic_visit_date у MATCHES). Считает пустые/битые
// даты, распределение по месяцам и печатает примеры (сырое значение + тип + APP_ymd_).
function appDateSample() {
  const hub = getHubSpreadsheet_();
  const out = [];

  function scan(sheetName, dateHeader) {
    const sh = hub.getSheetByName(sheetName);
    if (!sh) { out.push(sheetName + ': лист не найден'); return; }
    const last = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (last < 2) { out.push(sheetName + ': пусто'); return; }
    const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    const idx = headers.indexOf(dateHeader);
    if (idx < 0) { out.push(sheetName + ': нет колонки ' + dateHeader); return; }

    // Вся колонка даты за один проход.
    const col = sh.getRange(2, idx + 1, last - 1, 1).getValues();
    let empty = 0; const byYm = {};
    for (let i = 0; i < col.length; i++) {
      const ymd = (typeof APP_ymd_ === 'function') ? APP_ymd_(col[i][0]) : String(col[i][0] || '').slice(0, 10);
      if (!ymd) { empty++; continue; }
      const ym = ymd.slice(0, 7); byYm[ym] = (byYm[ym] || 0) + 1;
    }
    const dist = Object.keys(byYm).sort().map(k => '   ' + k + ': ' + byYm[k]).join('\n') || '   (нет валидных дат)';

    // Примеры: первые 4 строки — сырое значение + тип + нормализация.
    const smp = sh.getRange(2, idx + 1, Math.min(4, last - 1), 1).getValues();
    const ex = smp.map((r, i) => {
      const v = r[0], t = Object.prototype.toString.call(v);
      const ymd = (typeof APP_ymd_ === 'function') ? APP_ymd_(v) : '';
      return '   стр' + (i + 2) + ': [' + v + '] ' + t + ' → APP_ymd_=[' + ymd + ']';
    }).join('\n');

    out.push(sheetName + '.' + dateHeader + ': строк ' + (last - 1) + ', пустых/битых дат ' + empty +
      '\n  по месяцам:\n' + dist + '\n  примеры:\n' + ex);
  }

  scan('APP_TRAFFIC_ARCHIVE', 'visit_date');
  scan('MATCHES', 'traffic_visit_date');
  scan('TRAFFIC_VISITS', 'visit_date');

  const msg = out.join('\n\n──────────\n\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (_) {}
  return msg;
}

// Локализуем 40% пустых дат: пустые visit_date в TRAFFIC_VISITS по source_sheet.
// Если пусто кучкуется в конкретных листах → у них не распознан заголовок даты
// (добавим алиас в ETL). Если размазано равномерно → даты реально пустые в источнике.
function appDatelessBySheet() {
  const hub = getHubSpreadsheet_();
  const sh = hub.getSheetByName('TRAFFIC_VISITS');
  if (!sh) { const m = 'нет TRAFFIC_VISITS'; try { SpreadsheetApp.getUi().alert(m); } catch (_) {} return m; }
  const last = sh.getLastRow(), lastCol = sh.getLastColumn();
  const H = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const iDate = H.indexOf('visit_date');
  const iSheet = H.indexOf('source_sheet');
  if (iDate < 0 || iSheet < 0) { const m = 'нет колонок visit_date/source_sheet'; try { SpreadsheetApp.getUi().alert(m); } catch (_) {} return m; }

  const vals = sh.getRange(2, 1, last - 1, lastCol).getValues();
  const by = {};
  for (let i = 0; i < vals.length; i++) {
    const r = vals[i];
    const ymd = (typeof APP_ymd_ === 'function') ? APP_ymd_(r[iDate]) : String(r[iDate] || '').slice(0, 10);
    const key = String(r[iSheet] || '(пусто)').trim() || '(пусто)';
    if (!by[key]) by[key] = { empty: 0, total: 0 };
    by[key].total++;
    if (!ymd) by[key].empty++;
  }
  const rows = Object.keys(by).map(k => ({ sheet: k, empty: by[k].empty, total: by[k].total, pct: Math.round(by[k].empty / by[k].total * 100) }))
    .sort((a, b) => b.empty - a.empty);
  const lines = rows.map(x => x.sheet + ': пустых ' + x.empty + '/' + x.total + ' (' + x.pct + '%)');
  const msg = 'Пустые visit_date по source_sheet (TRAFFIC_VISITS):\n\n' + lines.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (_) {}
  return msg;
}
