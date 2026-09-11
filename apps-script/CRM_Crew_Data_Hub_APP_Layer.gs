/***************************************************************
 * CRM CREW DATA HUB — APP SERVING LAYER + READ-ONLY API  (V1)
 *
 * ДОБАВЛЯЕТСЯ В ТОТ ЖЕ Apps Script проект, что и
 * CRM_Crew_Data_Hub_V5.3_Traffic_AMO_MATCHES.gs.
 * Переиспользует его глобальные хелперы:
 *   getHubSpreadsheet_, extractPhoneCores_, normalizeDate_,
 *   ensureSheetSize_, fastHash_, normalizeCellText_.
 *
 * НИЧЕГО не пересчитывает и не меняет в источниках истины
 * (TRAFFIC_VISITS / AMO_DEALS / MATCHES / городские листы).
 * Только читает их и строит производные листы приложения:
 *   APP_META, APP_TRAFFIC_ARCHIVE, APP_API_LOG.
 * (APP_CLIENT_INDEX / APP_CLIENT_EVENTS — следующий инкремент.)
 *
 * Пересборка resumable (staging + checkpoint + continuation +
 * validate + atomic swap + backup), как в V5.3.
 *
 * API — read-only Web App (doPost), авторизация server-side:
 *   Google token -> userinfo -> email -> allowlist USERS в CRM-таблице.
 *   Actions: bootstrap, archive.list, visit.get, filters.get,
 *            client.lookup, client.get (история клиента, on-the-fly по телефону).
 ***************************************************************/


/* ============================================================
 * CONFIG
 * ============================================================ */

const APP_CONFIG = {
  META_SHEET:            'APP_META',
  ARCHIVE_SHEET:         'APP_TRAFFIC_ARCHIVE',
  ARCHIVE_STAGING:       'APP_TRAFFIC_ARCHIVE__STAGING',
  ARCHIVE_BACKUP_PREFIX: 'APP_TRAFFIC_ARCHIVE__BACKUP__',
  API_LOG_SHEET:         'APP_API_LOG',

  // Источники истины (только чтение).
  TRAFFIC_SHEET:        'TRAFFIC_VISITS',
  AMO_SHEET:            'AMO_DEALS',
  MATCHES_SHEET:        'MATCHES',
  TRAFFIC_ERRORS_SHEET: 'TRAFFIC_ERRORS',

  STATE_PROPERTY:   'CRM_CREW_APP_REBUILD_STATE_V1',
  CONTINUE_FUNCTION: 'continueAppRebuild',

  // Ограничение времени одного запуска — ставим продолжение раньше системного лимита.
  SAFE_RUN_MS:     150000,
  CONTINUE_AFTER_MS: 5000,
  MATCHES_CHUNK_ROWS: 2000,

  // Архивность/качество даты (§5, §26).
  MIN_YEAR: 2024,                 // MIN_REASONABLE_TRAFFIC_YEAR

  API_VERSION:    '1.0.0',
  SCHEMA_VERSION: '1.0.0',

  // Серверный allowlist — лист USERS в CRM-таблице (как в crm-audit-logs.gs).
  // Значение по умолчанию можно переопределить Script Property CRM_USERS_SPREADSHEET_ID.
  CRM_USERS_PROPERTY: 'CRM_USERS_SPREADSHEET_ID',
  CRM_USERS_DEFAULT:  '1DeUsHB_O1SbIMR4p5yd64o_R0yllWvtnyNhjxjhipn8',
  CRM_USERS_SHEET:    'USERS',

  ARCHIVE_DEFAULT_LIMIT: 40,
  ARCHIVE_MAX_LIMIT:     100,
  FILTER_WINDOW_ROWS:    400,     // окно чтения при фильтрации (§15)
  MAX_FILTER_ARRAY:      200,     // защита от гигантских filter arrays (§39)
};


/* ============================================================
 * APP_TRAFFIC_ARCHIVE — SCHEMA
 * Одна строка = один салонный визит, уже joined с MATCHES (§8.1).
 * Полные комментарии/кандидаты НЕ храним — их отдаёт visit.get на лету.
 * ============================================================ */

const APP_ARCHIVE_HEADERS = [
  'archive_row_key',
  'traffic_record_key',
  'visit_fingerprint',
  'visit_date',
  'visit_date_sort',
  'visit_year',
  'is_archived',
  'date_quality',

  'client_name',
  'phone_core',
  'phone_cores',
  'phone_display',
  'city',
  'visit_type',
  'source',
  'car_reference',
  'vin',
  'op_manager',

  'short_status',
  'result_comment_preview',
  'followup_comment_preview',
  'followup_manager_raw',
  'followup_manager_verified',
  'car_problem',

  'traffic_source_sheet',
  'traffic_source_row',

  'match_status',
  'ui_status',
  'candidate_count',
  'candidate_deal_ids',
  'matched_deal_id',
  'matched_deal_url',
  'matched_deal_state',
  'matched_stage',
  'matched_event_type',
  'matched_event_date',
  'date_distance_days',
  'city_match',
  'matched_employee_raw',
  'matched_employee_role',
  'matched_crm_responsible_raw',
  'matched_dozhim_responsible_raw',
  'matched_close_reason',
  'matched_qualification',
  'matched_sale_date',
  'matched_source',

  'evidence_code',
  'evidence_text',
  'freshness_status',

  'traffic_synced_at',
  'amo_snapshot_at',
  'amo_synced_at',
  'matches_synced_at',
  'app_built_at',
];

// Индекс имени поля -> позиция в APP_ARCHIVE_HEADERS (для API-чтения).
const APP_ARCHIVE_COL = (function () {
  const m = {};
  APP_ARCHIVE_HEADERS.forEach((h, i) => { m[h] = i; });
  return m;
})();


/* ============================================================
 * МЕНЮ (installable trigger — у V5.3 уже есть свой onOpen)
 * Запустить APP_installMenu один раз из редактора.
 * ============================================================ */

function APP_installMenu() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'APP_onOpenBuildMenu_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('APP_onOpenBuildMenu_').forSpreadsheet(ss).onOpen().create();
  APP_onOpenBuildMenu_();
  SpreadsheetApp.getUi().alert('Меню «Картотека APP» установлено. Оно появится при открытии таблицы.');
}

function APP_onOpenBuildMenu_() {
  SpreadsheetApp.getUi()
    .createMenu('Картотека APP')
    .addItem('APP: пересобрать данные приложения', 'startAppRebuild')
    .addItem('APP: статус пересборки', 'showAppRebuildStatus')
    .addItem('APP: продолжить сейчас', 'continueAppRebuild')
    .addItem('APP: отменить пересборку', 'cancelAppRebuild')
    .addSeparator()
    .addItem('APP: показать APP_META', 'showAppMeta')
    .addToUi();
}


/* ============================================================
 * STATE
 * ============================================================ */

function APP_readState_() {
  const raw = PropertiesService.getScriptProperties().getProperty(APP_CONFIG.STATE_PROPERTY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

function APP_writeState_(state) {
  PropertiesService.getScriptProperties().setProperty(APP_CONFIG.STATE_PROPERTY, JSON.stringify(state));
}

function APP_clearState_() {
  PropertiesService.getScriptProperties().deleteProperty(APP_CONFIG.STATE_PROPERTY);
}


/* ============================================================
 * REBUILD — START
 * ============================================================ */

function startAppRebuild() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return;
  try {
    const existing = APP_readState_();
    if (existing && existing.status === 'RUNNING') return; // уже идёт

    const hub = getHubSpreadsheet_();

    // Токены источников — чтобы поймать дрейф во время сборки (§9).
    const tokens = APP_sourceTokens_(hub);
    if (!tokens.trafficRows || !tokens.matchesRows) {
      throw new Error('TRAFFIC_VISITS или MATCHES не найдены/пусты. Сначала пересоберите их (V5.3).');
    }

    APP_resetStaging_(hub);

    const state = {
      version: 1,
      runId: Utilities.getUuid(),
      status: 'RUNNING',
      startedAt: new Date().toISOString(),
      appBuiltAt: new Date().toISOString(),

      matchesNextRow: 2,      // следующая читаемая строка MATCHES (1 — заголовок)
      stagingNextRow: 2,
      totalArchive: 0,

      tokens: tokens,          // снимок на старте
      backupSheetName: '',
      finalizePhase: '',
    };
    APP_writeState_(state);
  } finally {
    lock.releaseLock();
  }
  continueAppRebuild();
}


/* ============================================================
 * REBUILD — CONTINUATION WORKER
 * ============================================================ */

function continueAppRebuild() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  const started = Date.now();
  try {
    APP_clearContinuation_();

    let state = APP_readState_();
    if (!state || state.status !== 'RUNNING') return;

    const hub = getHubSpreadsheet_();

    // Проверка дрейфа источников — не публикуем смешанную версию (§9).
    const nowTokens = APP_sourceTokens_(hub);
    if (!APP_tokensEqual_(nowTokens, state.tokens)) {
      state.status = 'ABORTED';
      state.error = 'Источники изменились во время сборки (drift). Пересборка остановлена.';
      APP_writeState_(state);
      APP_appendApiLog_(hub, { action: 'app.rebuild', status: 'ABORTED', error_code: 'SOURCE_DRIFT' });
      return;
    }

    // Индексы источников по заголовкам (устойчиво к перестановке колонок).
    const matches = APP_openIndexed_(hub, APP_CONFIG.MATCHES_SHEET);
    const traffic = APP_openIndexed_(hub, APP_CONFIG.TRAFFIC_SHEET);

    // Джойн-таблица деталей визита (record_key -> детали). Строится заново на
    // каждом продолжении (чтение быстрое, память — только нужные колонки).
    const detailByKey = APP_buildTrafficDetailMap_(traffic);
    // Листы, где followup_manager получен ПОЗИЦИОННО (§0.7) -> значение unverified.
    const positionalSheets = APP_positionalFollowupSheets_(hub);

    const mLast = matches.sheet.getLastRow();
    const mc = matches.col;
    const currentYear = new Date().getFullYear();
    const maxYear = currentYear + 1;

    while (state.matchesNextRow <= mLast) {
      if (Date.now() - started >= APP_CONFIG.SAFE_RUN_MS) {
        APP_writeState_(state);
        APP_scheduleContinuation_();
        return;
      }

      const rowCount = Math.min(APP_CONFIG.MATCHES_CHUNK_ROWS, mLast - state.matchesNextRow + 1);
      const rows = matches.sheet.getRange(state.matchesNextRow, 1, rowCount, matches.width).getValues();

      const out = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const recordKey = String(r[mc.traffic_record_key] || '').trim();
        if (!recordKey) continue;

        const d = detailByKey[recordKey] || null;
        const visitDate = APP_ymd_(r[mc.traffic_visit_date]); // Date/строка → 'YYYY-MM-DD'
        const quality = APP_dateQuality_(visitDate, APP_CONFIG.MIN_YEAR, maxYear);
        const isArchived = APP_isArchived_(visitDate, quality, currentYear);
        const year = quality === 'VALID' ? Number(visitDate.slice(0, 4)) : '';
        const sortKey = quality === 'VALID' ? visitDate : '0000-00-00';

        const sourceSheet = String(r[mc.traffic_source_sheet] || '').trim();
        const followupRaw = d ? d.followup_manager_raw : '';
        const followupVerified = !!followupRaw && !positionalSheets[sourceSheet];

        const phoneCore = String(r[mc.traffic_phone_core] || '').trim();
        const phoneCores = String(r[mc.traffic_phone_cores] || '').trim();

        const archiveRowKey = fastHash_(recordKey);

        out.push([
          archiveRowKey,
          recordKey,
          String(r[mc.traffic_visit_fingerprint] || ''),
          visitDate,
          sortKey,
          year,
          isArchived,
          quality,

          String(r[mc.traffic_client_name] || ''),
          phoneCore,
          phoneCores,
          APP_phoneDisplay_(phoneCore),
          String(r[mc.traffic_city] || ''),
          d ? d.visit_type : '',
          d ? d.source : '',
          d ? d.car_reference : '',
          d ? d.vin : '',
          String(r[mc.traffic_op_manager] || ''),

          String(r[mc.traffic_short_status] || ''),
          d ? APP_preview_(d.result_comment) : '',
          d ? APP_preview_(d.followup_comment) : '',
          followupRaw,
          followupVerified,
          d ? APP_preview_(d.car_problem) : '',

          sourceSheet,
          r[mc.traffic_source_row] || '',

          String(r[mc.match_status] || ''),
          String(r[mc.ui_status] || ''),
          r[mc.candidate_count] || 0,
          String(r[mc.candidate_deal_ids] || ''),
          String(r[mc.matched_deal_id] || ''),
          String(r[mc.matched_deal_url] || ''),
          String(r[mc.matched_deal_state] || ''),
          String(r[mc.matched_stage] || ''),
          String(r[mc.matched_event_type] || ''),
          APP_ymd_(r[mc.matched_event_date]),
          r[mc.date_distance_days] === '' ? '' : r[mc.date_distance_days],
          String(r[mc.city_match] || ''),
          String(r[mc.matched_employee_raw] || ''),
          String(r[mc.matched_employee_role] || ''),
          String(r[mc.matched_crm_responsible_raw] || ''),
          String(r[mc.matched_dozhim_responsible_raw] || ''),
          String(r[mc.matched_close_reason] || ''),
          String(r[mc.matched_qualification] || ''),
          APP_ymd_(r[mc.matched_sale_date]),
          String(r[mc.matched_source] || ''),

          String(r[mc.evidence_code] || ''),
          String(r[mc.evidence_text] || ''),
          String(r[mc.freshness_status] || ''),

          String(r[mc.traffic_synced_at] || ''),
          String(r[mc.amo_snapshot_at] || ''),
          String(r[mc.amo_synced_at] || ''),
          String(r[mc.matches_synced_at] || ''),
          state.appBuiltAt,
        ]);
      }

      if (out.length) {
        APP_appendRows_(hub, APP_CONFIG.ARCHIVE_STAGING, out, state.stagingNextRow, APP_ARCHIVE_HEADERS.length);
        state.stagingNextRow += out.length;
        state.totalArchive += out.length;
      }
      state.matchesNextRow += rowCount;
      APP_writeState_(state);
    }

    APP_finalizeRebuild_(hub, state);

  } catch (err) {
    const state = APP_readState_();
    if (state) {
      state.status = 'ERROR';
      state.error = String((err && err.message) || err);
      APP_writeState_(state);
    }
    try { APP_appendApiLog_(getHubSpreadsheet_(), { action: 'app.rebuild', status: 'ERROR', error_code: String((err && err.message) || err).slice(0, 120) }); } catch (_) {}
    APP_clearContinuation_();
    throw err;
  } finally {
    lock.releaseLock();
  }
}


/* ============================================================
 * REBUILD — FINALIZE (sort DESC, validate, atomic swap, meta)
 * ============================================================ */

function APP_finalizeRebuild_(hub, state) {
  SpreadsheetApp.flush();

  const staging = hub.getSheetByName(APP_CONFIG.ARCHIVE_STAGING);
  if (!staging) throw new Error('STAGING отсутствует.');

  // Валидация ДО подмены рабочего листа.
  const dataRows = staging.getLastRow() - 1;
  if (dataRows !== state.totalArchive) {
    throw new Error('STAGING не прошёл проверку: строк ' + dataRows + ', ожидалось ' + state.totalArchive + '.');
  }

  // Сортировка DESC: visit_date_sort, затем archive_row_key. Повреждённые даты
  // (sort '0000-00-00') уходят в конец и не смешиваются с хронологией (§8.1).
  if (dataRows > 0) {
    staging.getRange(2, 1, dataRows, APP_ARCHIVE_HEADERS.length).sort([
      { column: APP_ARCHIVE_COL.visit_date_sort + 1, ascending: false },
      { column: APP_ARCHIVE_COL.archive_row_key + 1, ascending: false },
    ]);
  }

  // Атомарная подмена с backup.
  const output = hub.getSheetByName(APP_CONFIG.ARCHIVE_SHEET);
  if (output) {
    const backupName = APP_CONFIG.ARCHIVE_BACKUP_PREFIX + String(Date.now());
    output.setName(backupName);
    state.backupSheetName = backupName;
    APP_writeState_(state);
  }
  staging.setName(APP_CONFIG.ARCHIVE_SHEET);

  // Удаляем старые backup'ы (оставляем 1 последний на всякий случай).
  APP_cleanupBackups_(hub, 1);

  // APP_META + предвычисленные фильтры.
  APP_buildMeta_(hub, state);

  state.status = 'DONE';
  state.finishedAt = new Date().toISOString();
  APP_writeState_(state);
  APP_clearContinuation_();

  APP_appendApiLog_(hub, { action: 'app.rebuild', status: 'DONE', result_count: state.totalArchive });
}


/* ============================================================
 * META + FILTERS (предвычислены при сборке -> filters.get дешёвый)
 * ============================================================ */

function APP_buildMeta_(hub, state) {
  const archive = APP_openIndexed_(hub, APP_CONFIG.ARCHIVE_SHEET);
  const last = archive.sheet.getLastRow();
  const c = APP_ARCHIVE_COL;

  const cities = new Set(), visitTypes = new Set(), sources = new Set(),
        opManagers = new Set(), shortStatuses = new Set(), matchStatuses = new Set();
  const crmManagers = new Set(); // CRM + ДОЖИМ сотрудники (из matched_* + followup verified)

  const statusCounts = {};       // baseline-контроль (§46)
  const uiStatusCounts = {};

  const COLS = [
    c.city, c.visit_type, c.source, c.op_manager, c.short_status, c.match_status, c.ui_status,
    c.matched_employee_raw, c.matched_crm_responsible_raw, c.matched_dozhim_responsible_raw,
  ];
  const maxCol = Math.max.apply(null, COLS) + 1;

  for (let start = 2; start <= last; start += 5000) {
    const n = Math.min(5000, last - start + 1);
    const vals = archive.sheet.getRange(start, 1, n, maxCol).getValues();
    vals.forEach(r => {
      if (r[c.city]) cities.add(String(r[c.city]));
      if (r[c.visit_type]) visitTypes.add(String(r[c.visit_type]));
      if (r[c.source]) sources.add(String(r[c.source]));
      if (r[c.op_manager]) opManagers.add(String(r[c.op_manager]));
      if (r[c.short_status]) shortStatuses.add(String(r[c.short_status]));
      const ms = String(r[c.match_status] || ''); if (ms) { matchStatuses.add(ms); statusCounts[ms] = (statusCounts[ms] || 0) + 1; }
      const us = String(r[c.ui_status] || ''); if (us) uiStatusCounts[us] = (uiStatusCounts[us] || 0) + 1;
      [r[c.matched_employee_raw], r[c.matched_crm_responsible_raw], r[c.matched_dozhim_responsible_raw]].forEach(v => {
        const s = String(v || '').trim(); if (s) crmManagers.add(s);
      });
    });
  }

  const sortArr = s => Array.from(s).sort((a, b) => a.localeCompare(b, 'ru'));
  const filters = {
    city: sortArr(cities),
    visitType: sortArr(visitTypes),
    source: sortArr(sources),
    opManager: sortArr(opManagers),
    crmManager: sortArr(crmManagers),
    shortStatus: sortArr(shortStatuses),
    matchStatus: sortArr(matchStatuses),
  };

  const meta = {
    schema_version: APP_CONFIG.SCHEMA_VERSION,
    api_version: APP_CONFIG.API_VERSION,
    archive_rows: state.totalArchive,
    traffic_rows: state.tokens.trafficRows,
    amo_rows: state.tokens.amoRows,
    matches_rows: state.tokens.matchesRows,
    status_counts: statusCounts,
    ui_status_counts: uiStatusCounts,
    app_built_at: state.appBuiltAt,
    filters_json: JSON.stringify(filters),
  };

  const sheet = APP_resetSheet_(hub, APP_CONFIG.META_SHEET, ['key', 'value']);
  const rows = Object.keys(meta).map(k => [k, typeof meta[k] === 'object' ? JSON.stringify(meta[k]) : String(meta[k])]);
  if (rows.length) {
    ensureSheetSize_(sheet, rows.length + 1, 2);
    sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  }
}

function APP_readMeta_(hub) {
  const sheet = hub.getSheetByName(APP_CONFIG.META_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  const meta = {};
  vals.forEach(r => { meta[String(r[0])] = r[1]; });
  return meta;
}

function showAppMeta() {
  const meta = APP_readMeta_(getHubSpreadsheet_());
  SpreadsheetApp.getUi().alert(meta ? JSON.stringify(meta, null, 2) : 'APP_META пуст — сначала пересоберите.');
}


/* ============================================================
 * REBUILD — HELPERS
 * ============================================================ */

function APP_sourceTokens_(hub) {
  const t = hub.getSheetByName(APP_CONFIG.TRAFFIC_SHEET);
  const a = hub.getSheetByName(APP_CONFIG.AMO_SHEET);
  const m = hub.getSheetByName(APP_CONFIG.MATCHES_SHEET);
  return {
    trafficRows: t ? Math.max(0, t.getLastRow() - 1) : 0,
    amoRows:     a ? Math.max(0, a.getLastRow() - 1) : 0,
    matchesRows: m ? Math.max(0, m.getLastRow() - 1) : 0,
  };
}
function APP_tokensEqual_(a, b) {
  return a && b && a.trafficRows === b.trafficRows && a.amoRows === b.amoRows && a.matchesRows === b.matchesRows;
}

// Открыть лист и построить индекс имя_колонки -> позиция (по строке заголовков).
function APP_openIndexed_(hub, name) {
  const sheet = hub.getSheetByName(name);
  if (!sheet) throw new Error('Лист не найден: ' + name);
  const width = Math.max(1, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0].map(h => String(h || '').trim());
  const col = {};
  headers.forEach((h, i) => { if (h) col[h] = i; });
  return { sheet, headers, width, col };
}

// record_key -> детали визита (только колонки, которых нет в MATCHES).
function APP_buildTrafficDetailMap_(traffic) {
  const last = traffic.sheet.getLastRow();
  const map = {};
  if (last < 2) return map;
  const col = traffic.col;
  const need = ['record_key', 'visit_type', 'source', 'car_reference', 'vin',
                'result_comment', 'followup_comment', 'followup_manager_raw', 'car_problem'];
  const maxCol = Math.max.apply(null, need.map(k => (col[k] == null ? 0 : col[k]))) + 1;
  for (let start = 2; start <= last; start += 5000) {
    const n = Math.min(5000, last - start + 1);
    const vals = traffic.sheet.getRange(start, 1, n, maxCol).getValues();
    vals.forEach(r => {
      const key = String(r[col.record_key] || '').trim();
      if (!key) return;
      map[key] = {
        visit_type: col.visit_type != null ? r[col.visit_type] : '',
        source: col.source != null ? r[col.source] : '',
        car_reference: col.car_reference != null ? r[col.car_reference] : '',
        vin: col.vin != null ? r[col.vin] : '',
        result_comment: col.result_comment != null ? r[col.result_comment] : '',
        followup_comment: col.followup_comment != null ? r[col.followup_comment] : '',
        followup_manager_raw: col.followup_manager_raw != null ? r[col.followup_manager_raw] : '',
        car_problem: col.car_problem != null ? r[col.car_problem] : '',
      };
    });
  }
  return map;
}

// Множество source_sheet, где followup_manager получен позиционным fallback (§0.7).
function APP_positionalFollowupSheets_(hub) {
  const out = {};
  const sheet = hub.getSheetByName(APP_CONFIG.TRAFFIC_ERRORS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return out;
  const width = Math.max(1, sheet.getLastColumn());
  const vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
  // Формат ошибок V5.3: [ts, level, sheetName, row, code, message, sample]
  vals.forEach(r => {
    const code = String(r[4] || '');
    const sheetName = String(r[2] || '').trim();
    if (code === 'POSITIONAL_FALLBACK' && sheetName) out[sheetName] = true;
  });
  return out;
}

// Дата → строка 'YYYY-MM-DD'. Sheets часто отдаёт дату как Date-объект —
// его надо форматировать, а не String() (иначе получаем 'Wed May 27 2026 …').
function APP_ymd_(v) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return ('' + v.getFullYear()).padStart(4, '0') + '-' +
           ('' + (v.getMonth() + 1)).padStart(2, '0') + '-' +
           ('' + v.getDate()).padStart(2, '0');
  }
  const s = String(v).trim();
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return m[1] + '-' + ('' + m[2]).padStart(2, '0') + '-' + ('' + m[3]).padStart(2, '0');
  try { const nd = normalizeDate_(s); if (nd) return nd; } catch (_) {} // DD.MM.YYYY и т.п.
  return '';
}
// Дата → мс (для сортировки таймлайна с учётом времени). Date-объект сохраняет часы.
function APP_ms_(v) {
  if (v == null || v === '') return 0;
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? 0 : v.getTime();
  const ymd = APP_ymd_(v); if (!ymd) return 0;
  const p = ymd.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]);
}
// Дата → ISO (с временем, если это Date). Для event_at (фронт покажет время события).
function APP_iso_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : v.toISOString();
  return APP_ymd_(v);
}
// 'YYYY-MM-DD' → 'DD.MM.YYYY' для читаемого вывода.
function APP_dmy_(ymd) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || '')); return m ? m[3] + '.' + m[2] + '.' + m[1] : String(ymd || ''); }

function APP_dateQuality_(visitDate, minYear, maxYear) {
  if (!visitDate) return 'MISSING';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(visitDate);
  if (!m) return 'INVALID';
  const y = Number(m[1]);
  if (y < minYear || y > maxYear) return 'SUSPICIOUS';
  return 'VALID';
}
function APP_isArchived_(visitDate, quality, currentYear) {
  if (quality !== 'VALID') return false;
  return Number(visitDate.slice(0, 4)) < currentYear;
}
function APP_preview_(text) {
  const s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  return s.length > 160 ? s.slice(0, 157) + '…' : s;
}
function APP_phoneDisplay_(core) {
  const c = String(core || '');
  if (c.length !== 10) return c;
  return '+7 ' + c.slice(0, 3) + ' ' + c.slice(3, 6) + '-' + c.slice(6, 8) + '-' + c.slice(8, 10);
}

function APP_resetStaging_(hub) {
  APP_resetSheet_(hub, APP_CONFIG.ARCHIVE_STAGING, APP_ARCHIVE_HEADERS);
}
function APP_resetSheet_(hub, name, headers) {
  let sheet = hub.getSheetByName(name);
  if (sheet) hub.deleteSheet(sheet);
  sheet = hub.insertSheet(name);
  ensureSheetSize_(sheet, 2, headers.length);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  return sheet;
}
function APP_appendRows_(hub, name, rows, startRow, width) {
  if (!rows.length) return;
  const sheet = hub.getSheetByName(name);
  if (!sheet) throw new Error('Лист не найден: ' + name);
  ensureSheetSize_(sheet, startRow + rows.length, width);
  sheet.getRange(startRow, 1, rows.length, width).setValues(rows);
}
function APP_cleanupBackups_(hub, keep) {
  const backups = hub.getSheets()
    .filter(s => s.getName().indexOf(APP_CONFIG.ARCHIVE_BACKUP_PREFIX) === 0)
    .sort((a, b) => a.getName().localeCompare(b.getName()));
  while (backups.length > keep) { hub.deleteSheet(backups.shift()); }
}

function APP_scheduleContinuation_() {
  APP_clearContinuation_();
  ScriptApp.newTrigger(APP_CONFIG.CONTINUE_FUNCTION)
    .timeBased().after(APP_CONFIG.CONTINUE_AFTER_MS).create();
}
function APP_clearContinuation_() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === APP_CONFIG.CONTINUE_FUNCTION) ScriptApp.deleteTrigger(t);
  });
}

function showAppRebuildStatus() {
  const s = APP_readState_();
  SpreadsheetApp.getUi().alert(s ? JSON.stringify(s, null, 2) : 'Пересборка не запускалась.');
}
function cancelAppRebuild() {
  APP_clearContinuation_();
  const s = APP_readState_();
  if (s) { s.status = 'CANCELLED'; APP_writeState_(s); }
  SpreadsheetApp.getUi().alert('Пересборка отменена. Рабочий APP_TRAFFIC_ARCHIVE не тронут.');
}


/* ============================================================
 * ============================  API  =========================
 * Read-only Web App. Deploy: Execute as = Me, Access = Anyone.
 * Доступ к данным всё равно закрыт token-валидацией + allowlist.
 * ============================================================ */

function doGet() {
  return APP_json_({ ok: true, service: 'crm-crew-app-api', api_version: APP_CONFIG.API_VERSION });
}

function doPost(e) {
  const requestId = Utilities.getUuid().slice(0, 8);
  const t0 = Date.now();
  let action = '', email = '';
  try {
    const body = APP_parseBody_(e);
    action = String(body.action || '').trim();
    if (!action) return APP_err_(requestId, 'BAD_REQUEST', 'action не указан');

    const profile = APP_authenticate_(body.authToken); // бросает ACCESS_DENIED
    email = profile.email;

    const payload = body.payload || {};
    let data;
    switch (action) {
      case 'bootstrap':      data = APP_apiBootstrap_(profile); break;
      case 'archive.list':   data = APP_apiArchiveList_(payload); break;
      case 'visit.get':      data = APP_apiVisitGet_(payload); break;
      case 'filters.get':    data = APP_apiFiltersGet_(); break;
      case 'client.lookup':  data = APP_apiClientLookup_(payload); break;
      case 'client.get':     data = APP_apiClientGet_(payload); break;
      default: return APP_err_(requestId, 'UNKNOWN_ACTION', 'Неизвестное действие: ' + action);
    }

    const hub = getHubSpreadsheet_();
    APP_appendApiLog_(hub, { request_id: requestId, action, user_email: email,
      duration_ms: Date.now() - t0, result_count: (data && data.items ? data.items.length : ''), status: 'OK' });

    return APP_ok_(requestId, data, APP_metaEnvelope_(hub));

  } catch (err) {
    const code = (err && err.appCode) || 'INTERNAL';
    try {
      APP_appendApiLog_(getHubSpreadsheet_(), { request_id: requestId, action, user_email: email,
        duration_ms: Date.now() - t0, status: 'ERROR', error_code: code });
    } catch (_) {}
    return APP_err_(requestId, code, code === 'INTERNAL' ? 'Внутренняя ошибка' : String(err.message || err));
  }
}


/* ---- auth ---- */

function APP_authenticate_(authToken) {
  const token = String(authToken || '').trim();
  if (!token) throw APP_error_('ACCESS_DENIED', 'Нет токена');
  let email = '';
  try {
    const resp = UrlFetchApp.fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true,
    });
    if (resp.getResponseCode() !== 200) throw new Error('userinfo ' + resp.getResponseCode());
    const profile = JSON.parse(resp.getContentText());
    email = String(profile.email || '').trim().toLowerCase();
  } catch (_) { throw APP_error_('ACCESS_DENIED', 'Токен не подтверждён'); }
  if (!email) throw APP_error_('ACCESS_DENIED', 'Нет email');

  const user = APP_findUser_(email);
  if (!user) throw APP_error_('ACCESS_DENIED', 'Пользователь не в списке доступа');
  return user;
}

function APP_findUser_(email) {
  const props = PropertiesService.getScriptProperties();
  const crmId = props.getProperty(APP_CONFIG.CRM_USERS_PROPERTY) || APP_CONFIG.CRM_USERS_DEFAULT;
  let sheet;
  try { sheet = SpreadsheetApp.openById(crmId).getSheetByName(APP_CONFIG.CRM_USERS_SHEET); }
  catch (e) { throw APP_error_('CONFIG_ERROR', 'Нет доступа к USERS: ' + (e.message || e)); }
  if (!sheet || sheet.getLastRow() < 2) return null;
  const vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues(); // A..G
  const target = email.toLowerCase();
  for (let i = 0; i < vals.length; i++) {
    const row = vals[i];
    const emails = String(row[0] || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
    if (emails.indexOf(target) >= 0) {
      return {
        email: target,
        name: String(row[1] || '').trim(),
        role: String(row[2] || 'crm').trim().toLowerCase(),
        crmId: String(row[6] || '').trim(),
      };
    }
  }
  return null;
}


/* ---- actions ---- */

function APP_apiBootstrap_(profile) {
  const hub = getHubSpreadsheet_();
  const meta = APP_readMeta_(hub) || {};
  const isCeo = /ceo|rop|роп/.test(profile.role);
  return {
    user: { email: profile.email, name: profile.name, role: profile.role, isAdmin: isCeo },
    meta: APP_metaEnvelope_(hub),
    counts: {
      archive: Number(meta.archive_rows || 0),
      status: APP_safeJson_(meta.status_counts),
      ui_status: APP_safeJson_(meta.ui_status_counts),
    },
    filters: APP_safeJson_(meta.filters_json),
    features: { archive: true, search: true, analytics: false }, // search/analytics — следующие инкременты
    defaultPeriodDays: 90,
  };
}

function APP_apiFiltersGet_() {
  const meta = APP_readMeta_(getHubSpreadsheet_()) || {};
  return APP_safeJson_(meta.filters_json) || {};
}

/* ── ИСТОРИЯ КЛИЕНТА (досье) ──
 * V1: client_key = нормализованный 10-значный телефон (без union-find по
 * связанным телефонам — можно добавить позже). client.get строит таймлайн на
 * лету через TextFinder.findAll по колонке телефонов (§14 «читаем только
 * найденные строки»), без отдельного APP_CLIENT_EVENTS-листа. */
function APP_normPhone_(raw) {
  try { const cores = extractPhoneCores_(raw); return (cores && cores[0]) || ''; } catch (_) { return ''; }
}
function APP_apiClientLookup_(payload) {
  const core = APP_normPhone_(payload && payload.phone);
  if (!core) throw APP_error_('INVALID_PHONE_INPUT', 'Некорректный телефон');
  const hub = getHubSpreadsheet_();
  const inTraffic = APP_phoneExists_(hub, APP_CONFIG.TRAFFIC_SHEET, 'phone_cores', core);
  const inAmo = inTraffic ? true : APP_phoneExists_(hub, APP_CONFIG.AMO_SHEET, 'phone_cores', core);
  return { found: !!(inTraffic || inAmo), client_key: core };
}
function APP_phoneExists_(hub, sheetName, colName, core) {
  const s = APP_openIndexed_(hub, sheetName);
  if (s.col[colName] == null || s.sheet.getLastRow() < 2) return false;
  const found = s.sheet.getRange(2, s.col[colName] + 1, s.sheet.getLastRow() - 1, 1)
    .createTextFinder(core).matchEntireCell(false).findNext();
  return !!found;
}
// Все строки листа, где колонка `colName` содержит `core`. Возвращает массив строк-объектов геттеров.
function APP_rowsByPhone_(hub, sheetName, colName, core, cap) {
  const s = APP_openIndexed_(hub, sheetName);
  const out = [];
  if (s.col[colName] == null || s.sheet.getLastRow() < 2) return out;
  const matches = s.sheet.getRange(2, s.col[colName] + 1, s.sheet.getLastRow() - 1, 1)
    .createTextFinder(core).matchEntireCell(false).findAll();
  for (let i = 0; i < matches.length && out.length < (cap || 200); i++) {
    const rowIdx = matches[i].getRow();
    const r = s.sheet.getRange(rowIdx, 1, 1, s.width).getValues()[0];
    out.push({ g: name => (s.col[name] == null ? '' : r[s.col[name]]) });
  }
  return out;
}
function APP_apiClientGet_(payload) {
  const core = APP_normPhone_(payload && payload.client_key);
  if (!core) throw APP_error_('INVALID_PHONE_INPUT', 'Некорректный ключ клиента');
  const hub = getHubSpreadsheet_();
  const nowY = new Date().getFullYear();

  const tRows = APP_rowsByPhone_(hub, APP_CONFIG.TRAFFIC_SHEET, 'phone_cores', core, 200);
  const aRows = APP_rowsByPhone_(hub, APP_CONFIG.AMO_SHEET, 'phone_cores', core, 200);

  const events = [];
  let clientName = '';
  let years = [];

  // Салонные визиты / звонки (TRAFFIC_VISITS).
  tRows.forEach(row => {
    const g = row.g;
    if (!clientName && g('client_name')) clientName = String(g('client_name'));
    const vd = APP_ymd_(g('visit_date'));
    const q = APP_dateQuality_(vd, APP_CONFIG.MIN_YEAR, nowY + 1);
    if (q === 'VALID') years.push(Number(vd.slice(0, 4)));
    const vt = String(g('visit_type') || '');
    const vtl = vt.toLowerCase();
    const isCall = vtl.indexOf('звон') >= 0;
    const title = isCall ? 'Звонок' : (vtl.indexOf('повтор') >= 0 ? 'Повторный визит' : 'Визит в салон');
    const lines = [];
    const cityType = [g('city'), vt].filter(Boolean).join(' · '); if (cityType) lines.push(cityType);
    if (g('op_manager')) lines.push('Менеджер: ' + g('op_manager'));
    const cm = String(g('result_comment') || '').replace(/\s+/g, ' ').trim(); if (cm) lines.push(cm.length > 120 ? cm.slice(0, 117) + '…' : cm);
    events.push({
      event_type: isCall ? 'CALL' : 'TRAFFIC_VISIT', event_date: vd, sort: vd || '0000-00-00', sortMs: APP_ms_(g('visit_date')),
      title: title, visit_type: vt, lines: lines,
      traffic_record_key: String(g('record_key') || ''),
      is_archived: (q === 'VALID' && Number(vd.slice(0, 4)) < nowY),
    });
  });

  // Сделки amoCRM (AMO_DEALS) + продажи. Исключаем технические закрытия
  // (1_ДУБЛЬ / 1_ХОЗ) и схлопываем «дубли» — сделки, созданные в пределах 7 дней
  // друг от друга (оставляем одну: приоритет продаже, затем свежести).
  const leadPrefix = (typeof AMO_CONFIG !== 'undefined' && AMO_CONFIG.LEAD_URL_PREFIX) || 'https://ksocm66.amocrm.ru/leads/detail/';
  const TECH_CLOSE = /1[_\s]*дубль|1[_\s]*хоз/i;
  const SEVEN_DAYS = 7 * 24 * 3600 * 1000;
  let deals = [];
  aRows.forEach(row => {
    const g = row.g;
    if (!clientName && g('contact_fio')) clientName = String(g('contact_fio'));
    if (TECH_CLOSE.test(String(g('close_reason') || ''))) return; // 1_ДУБЛЬ / 1_ХОЗ — не показываем
    const created = APP_ymd_(g('created_at')) || APP_ymd_(g('visit_date'));
    deals.push({
      g: g, dealId: String(g('deal_id') || ''),
      created: created, createdMs: APP_ms_(g('created_at')) || APP_ms_(g('visit_date')),
      createdIso: APP_iso_(g('created_at')), updatedMs: APP_ms_(g('updated_at')),
      stage: String(g('stage') || ''),
      url: String(g('deal_url') || '') || (g('deal_id') ? leadPrefix + g('deal_id') : ''),
      visitDate: APP_ymd_(g('visit_date')), saleDate: APP_ymd_(g('sale_date')),
    });
  });
  // Дедуп по 7-дневным кластерам создания.
  deals.sort((a, b) => a.createdMs - b.createdMs);
  const kept = [];
  const dealScore = d => (d.saleDate ? 2 : 1);
  deals.forEach(d => {
    const last = kept.length ? kept[kept.length - 1] : null;
    if (last && d.createdMs && last.createdMs && Math.abs(d.createdMs - last.createdMs) < SEVEN_DAYS) {
      if (dealScore(d) > dealScore(last) || (dealScore(d) === dealScore(last) && (d.updatedMs || 0) > (last.updatedMs || 0))) kept[kept.length - 1] = d;
    } else kept.push(d);
  });

  kept.forEach(d => {
    const g = d.g;
    if (d.created) { const y = Number(d.created.slice(0, 4)); if (y >= APP_CONFIG.MIN_YEAR && y <= nowY + 1) years.push(y); }
    const dLines = [];
    if (d.dealId) dLines.push('Сделка #' + d.dealId);
    if (g('responsible_raw')) dLines.push('Ответственный: ' + g('responsible_raw'));
    if (g('source')) dLines.push('Источник: ' + g('source'));
    if (d.visitDate) dLines.push('Дата визита: ' + APP_dmy_(d.visitDate)); // показываем дату визита сделки
    events.push({
      event_type: 'AMO_DEAL', event_date: d.created, event_at: d.createdIso, sortMs: d.createdMs, sort: d.created || '0000-00-00',
      title: 'amoCRM' + (d.stage ? ' · ' + d.stage : ''), deal_id: d.dealId, deal_url: d.url, lines: dLines,
    });
    if (d.saleDate) {
      const car = String(g('car') || g('sold_car') || '');
      events.push({ event_type: 'SALE', event_date: d.saleDate, sortMs: APP_ms_(g('sale_date')), sort: d.saleDate, title: 'Продажа', deal_id: d.dealId, deal_url: d.url, lines: car ? [car] : [] });
    }
  });

  events.sort((a, b) => ((b.sortMs || 0) - (a.sortMs || 0)) || (b.sort < a.sort ? -1 : b.sort > a.sort ? 1 : 0)); // DESC по времени
  years = years.filter(y => y);
  return {
    summary: {
      client_key: core, client_name: clientName || '', phones: [core],
      traffic_count: tRows.length, deal_count: kept.length,
      first_year: years.length ? Math.min.apply(null, years) : null,
    },
    timeline: events.slice(0, 300),
  };
}

function APP_apiArchiveList_(payload) {
  const hub = getHubSpreadsheet_();
  const archive = APP_openIndexed_(hub, APP_CONFIG.ARCHIVE_SHEET);
  const last = archive.sheet.getLastRow();
  const width = APP_ARCHIVE_HEADERS.length;
  const c = APP_ARCHIVE_COL;

  let limit = Math.min(APP_CONFIG.ARCHIVE_MAX_LIMIT, Math.max(1, parseInt(payload.limit, 10) || APP_CONFIG.ARCHIVE_DEFAULT_LIMIT));
  const cursor = APP_decodeCursor_(payload.cursor);
  let row = cursor && cursor.row ? cursor.row : 2;
  if (row < 2) row = 2;

  const f = APP_normalizeFilters_(payload);
  const hasFilters = APP_hasFilters_(f);

  const items = [];
  let scanned = 0;
  const windowSize = hasFilters ? APP_CONFIG.FILTER_WINDOW_ROWS : limit;

  while (row <= last && items.length < limit) {
    const n = Math.min(windowSize, last - row + 1);
    const vals = archive.sheet.getRange(row, 1, n, width).getValues();
    for (let i = 0; i < vals.length && items.length < limit; i++) {
      const r = vals[i];
      row++; scanned++;
      if (hasFilters && !APP_rowMatchesFilters_(r, c, f)) continue;
      items.push(APP_archiveRowToItem_(r, c));
    }
    if (!hasFilters) break; // без фильтров одно окно = limit
    if (scanned > 20000) break; // предохранитель (§15 — без зависаний)
  }

  const hasMore = row <= last;
  return {
    items,
    nextCursor: hasMore ? APP_encodeCursor_({ row }) : null,
    hasMore,
    totalApprox: hasFilters ? null : Math.max(0, last - 1),
    appliedFilters: f,
  };
}

function APP_apiVisitGet_(payload) {
  const key = String(payload.traffic_record_key || '').trim();
  if (!key) throw APP_error_('BAD_REQUEST', 'traffic_record_key не указан');
  const hub = getHubSpreadsheet_();

  // 1) строка архива (по record_key через TextFinder по колонке).
  const archive = APP_openIndexed_(hub, APP_CONFIG.ARCHIVE_SHEET);
  const c = APP_ARCHIVE_COL;
  const found = archive.sheet.getRange(2, c.traffic_record_key + 1, Math.max(0, archive.sheet.getLastRow() - 1), 1)
    .createTextFinder(key).matchEntireCell(true).findNext();
  if (!found) throw APP_error_('NOT_FOUND', 'Визит не найден');
  const rowIdx = found.getRow();
  const r = archive.sheet.getRange(rowIdx, 1, 1, APP_ARCHIVE_HEADERS.length).getValues()[0];
  const item = APP_archiveRowToItem_(r, c);

  // 2) полные комментарии из TRAFFIC_VISITS (record_key = sheetId:row).
  item.full = APP_trafficFullByKey_(hub, key);

  // 3) кандидаты amoCRM при AMBIGUOUS/для показа сделки (§31).
  const dealIds = String(r[c.candidate_deal_ids] || '').split(/[|,;\s]+/).filter(Boolean);
  item.candidates = dealIds.length ? APP_amoDealsByIds_(hub, dealIds) : [];

  return { visit: item };
}


/* ---- action helpers ---- */

function APP_archiveRowToItem_(r, c) {
  const item = {};
  APP_ARCHIVE_HEADERS.forEach(h => { item[h] = r[c[h]]; });
  return item;
}

function APP_trafficFullByKey_(hub, key) {
  const traffic = APP_openIndexed_(hub, APP_CONFIG.TRAFFIC_SHEET);
  const col = traffic.col;
  if (col.record_key == null) return null;
  const found = traffic.sheet.getRange(2, col.record_key + 1, Math.max(0, traffic.sheet.getLastRow() - 1), 1)
    .createTextFinder(key).matchEntireCell(true).findNext();
  if (!found) return null;
  const r = traffic.sheet.getRange(found.getRow(), 1, 1, traffic.width).getValues()[0];
  const g = name => (col[name] == null ? '' : r[col[name]]);
  return {
    result_comment: g('result_comment'),
    followup_comment: g('followup_comment'),
    followup_manager_raw: g('followup_manager_raw'),
    car_problem: g('car_problem'),
    car_reference: g('car_reference'),
    vin: g('vin'),
    phone_raw: g('phone_raw'),
    source: g('source'),
    visit_type: g('visit_type'),
  };
}

function APP_amoDealsByIds_(hub, ids) {
  const amo = APP_openIndexed_(hub, APP_CONFIG.AMO_SHEET);
  const col = amo.col;
  if (col.deal_id == null) return [];
  const want = {}; ids.forEach(id => { want[String(id).trim()] = true; });
  const out = [];
  const last = amo.sheet.getLastRow();
  // Для каждого id — точечный TextFinder (кандидатов обычно единицы).
  Object.keys(want).forEach(id => {
    if (out.length >= 25) return;
    const found = amo.sheet.getRange(2, col.deal_id + 1, Math.max(0, last - 1), 1)
      .createTextFinder(id).matchEntireCell(true).findNext();
    if (!found) return;
    const r = amo.sheet.getRange(found.getRow(), 1, 1, amo.width).getValues()[0];
    const g = name => (col[name] == null ? '' : r[col[name]]);
    out.push({
      deal_id: g('deal_id'), deal_url: g('deal_url'), stage: g('stage'), deal_state: g('deal_state'),
      city: g('city'), visit_date: g('visit_date'), repeat_visit_date: g('repeat_visit_date'),
      responsible: g('responsible_raw'), crm_responsible: g('crm_responsible_raw'), dozhim_responsible: g('dozhim_responsible_raw'),
      sale_date: g('sale_date'), close_reason: g('close_reason'), qualification: g('qualification'), source: g('source'),
    });
  });
  return out;
}

function APP_normalizeFilters_(p) {
  const arr = v => {
    if (!v) return [];
    const a = Array.isArray(v) ? v : String(v).split(',');
    return a.map(x => String(x).trim()).filter(Boolean).slice(0, APP_CONFIG.MAX_FILTER_ARRAY);
  };
  return {
    dateFrom: String(p.dateFrom || '').trim(),
    dateTo: String(p.dateTo || '').trim(),
    city: arr(p.city),
    visitType: arr(p.visitType),
    source: arr(p.source),
    opManager: arr(p.opManager),
    crmManager: arr(p.crmManager),
    role: arr(p.role),                 // ['crm'] / ['dozhim']
    matchStatus: arr(p.matchStatus),
    shortStatus: arr(p.shortStatus),
    archiveMode: String(p.archiveMode || '').trim(), // '', 'archived', 'current', 'bad_date'
    query: String(p.query || '').trim().toLowerCase(),
  };
}
function APP_hasFilters_(f) {
  return !!(f.dateFrom || f.dateTo || f.city.length || f.visitType.length || f.source.length ||
    f.opManager.length || f.crmManager.length || f.role.length || f.matchStatus.length ||
    f.shortStatus.length || f.archiveMode || f.query);
}
function APP_rowMatchesFilters_(r, c, f) {
  const inArr = (arr, val) => !arr.length || arr.indexOf(String(val || '').trim()) >= 0;
  // ВАЖНО: visit_date читается из листа как Date-объект (Google Sheets авто-конвертит
  // 'YYYY-MM-DD' в дату при записи). String(Date) = 'Thu Sep 10 2026…' лексически >
  // любого '2026-…', и сравнение периода отсекало ВСЕ строки → архив пустой. Нормализуем
  // тем же APP_ymd_, которым дата и строилась, → чистое 'YYYY-MM-DD' для сравнения.
  const date = APP_ymd_(r[c.visit_date]);
  if (f.dateFrom && (!date || date < f.dateFrom)) return false;
  if (f.dateTo && (!date || date > f.dateTo)) return false;
  if (!inArr(f.city, r[c.city])) return false;
  if (!inArr(f.visitType, r[c.visit_type])) return false;
  if (!inArr(f.source, r[c.source])) return false;
  if (!inArr(f.opManager, r[c.op_manager])) return false;
  if (!inArr(f.shortStatus, r[c.short_status])) return false;
  // Статус связи: WAITING_AMO_SYNC / NO_PHONE — это ui_status (match_status может
  // быть NO_MATCH), поэтому матчим выбранный статус против match_status ИЛИ ui_status (аудит #1).
  if (f.matchStatus.length) {
    const ms = String(r[c.match_status] || '').trim(), us = String(r[c.ui_status] || '').trim();
    if (f.matchStatus.indexOf(ms) < 0 && f.matchStatus.indexOf(us) < 0) return false;
  }
  if (f.role.length) {
    const role = String(r[c.matched_employee_role] || '').toLowerCase();
    if (f.role.map(x => x.toLowerCase()).indexOf(role) < 0) return false;
  }
  if (f.crmManager.length) {
    const set = f.crmManager;
    const hit = [r[c.matched_employee_raw], r[c.matched_crm_responsible_raw], r[c.matched_dozhim_responsible_raw]]
      .some(v => set.indexOf(String(v || '').trim()) >= 0);
    if (!hit) return false;
  }
  if (f.archiveMode === 'archived' && r[c.is_archived] !== true) return false;
  if (f.archiveMode === 'current' && r[c.is_archived] === true) return false;
  if (f.archiveMode === 'bad_date' && ['MISSING', 'INVALID', 'SUSPICIOUS'].indexOf(String(r[c.date_quality])) < 0) return false;
  if (f.query) {
    const digits = f.query.replace(/\D/g, '');
    const hay = (String(r[c.client_name] || '') + ' ' + String(r[c.phone_cores] || '') + ' ' +
      String(r[c.result_comment_preview] || '')).toLowerCase();
    if (digits.length >= 3) { if (String(r[c.phone_cores] || '').indexOf(digits) < 0) return false; }
    else if (hay.indexOf(f.query) < 0) return false;
  }
  return true;
}


/* ---- API infra ---- */

function APP_parseBody_(e) {
  if (!e || !e.postData) return {};
  const raw = e.postData.contents || '';
  try { return JSON.parse(raw); } catch (_) {}
  // x-www-form-urlencoded fallback (authToken остаётся в body).
  const out = {};
  raw.split('&').forEach(kv => {
    const i = kv.indexOf('=');
    if (i > 0) out[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
  });
  if (out.payload && typeof out.payload === 'string') { try { out.payload = JSON.parse(out.payload); } catch (_) {} }
  return out;
}

function APP_metaEnvelope_(hub) {
  const meta = APP_readMeta_(hub) || {};
  return {
    apiVersion: APP_CONFIG.API_VERSION,
    schemaVersion: APP_CONFIG.SCHEMA_VERSION,
    appBuiltAt: meta.app_built_at || '',
  };
}
function APP_ok_(requestId, data, meta) { return APP_json_({ ok: true, requestId, data, meta }); }
function APP_err_(requestId, code, message) { return APP_json_({ ok: false, requestId, error: { code, message } }); }
function APP_json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function APP_error_(code, message) { const e = new Error(message || code); e.appCode = code; return e; }
function APP_safeJson_(v) { try { return typeof v === 'string' ? JSON.parse(v) : (v || null); } catch (_) { return null; } }

function APP_encodeCursor_(obj) { return Utilities.base64EncodeWebSafe(JSON.stringify(obj)); }
function APP_decodeCursor_(s) {
  if (!s) return null;
  try { return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(String(s))).getDataAsString()); }
  catch (_) { return null; }
}

// APP_API_LOG — без токенов/полных телефонов/комментариев (§8.5, §38).
function APP_appendApiLog_(hub, o) {
  try {
    let sheet = hub.getSheetByName(APP_CONFIG.API_LOG_SHEET);
    if (!sheet) {
      sheet = hub.insertSheet(APP_CONFIG.API_LOG_SHEET);
      sheet.getRange(1, 1, 1, 8).setValues([[
        'timestamp', 'request_id', 'action', 'user_email', 'duration_ms', 'result_count', 'status', 'error_code',
      ]]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([
      new Date().toISOString(), o.request_id || '', o.action || '', o.user_email || '',
      o.duration_ms == null ? '' : o.duration_ms, o.result_count == null ? '' : o.result_count,
      o.status || '', o.error_code || '',
    ]);
  } catch (_) {}
}
