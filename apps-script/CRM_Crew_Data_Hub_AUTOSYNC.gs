/***************************************************************
 * CRM CREW DATA HUB — AUTO-ОРКЕСТРАТОР ПЕРЕСБОРКИ  (V1)
 *
 * ДОБАВЛЯЕТСЯ В ТОТ ЖЕ Apps Script проект, что и
 *   CRM_Crew_Data_Hub_V5.3_Traffic_AMO_MATCHES.gs  (ETL/AMO/MATCHES)
 *   CRM_Crew_Data_Hub_APP_Layer.gs                 (APP-слой Картотеки)
 *
 * ЗАЧЕМ: раньше пересборку запускали руками, по стадиям:
 *   Traffic → AMO → MATCHES → APP (startAppRebuild).
 * Этот файл сшивает их в ОДНУ авто-цепочку. Нажать один раз
 *   installAutoSyncTrigger()
 * — и дальше вся Картотека обновляется сама по расписанию.
 *
 * КАК УСТРОЕНО (ничего в стадиях не меняем):
 *   Каждая стадия уже resumable и сама себя докручивает своими
 *   .after()-триггерами до status='DONE' (Script Property).
 *   Оркестратор — это лёгкий «дирижёр»: раз в HEARTBEAT_MINUTES
 *   просыпается autoSyncTick(), смотрит статус ТЕКУЩЕЙ стадии и:
 *     • DONE      → стартует следующую стадию;
 *     • RUNNING   → ждёт (стадия крутит себя сама); если зависла
 *                   (нет прогресса > STALL_MINUTES) — «пинает» continue*;
 *     • ERROR/ABORTED/CANCELLED → останавливает цепочку, статус ERROR;
 *     • APP DONE  → цепочка завершена, ждём REBUILD_INTERVAL_HOURS
 *                   и стартуем следующую полную пересборку.
 *   Свой lock — getUserLock() (у стадий getScriptLock()), поэтому
 *   вызовы start* / continue* из тика безопасны, без дедлока.
 *
 * ВАЖНО ПРО AMO: AMO_DEALS импортируется из ВНЕШНЕЙ Google-таблицы
 *   (amoCRM-выгрузка, задаётся через setupAmoSheetSource). Живого
 *   API amoCRM тут нет. Цепочка автоматизирует всё ВНУТРИ Data Hub,
 *   но свежесть AMO зависит от того, как обновляется та выгрузка.
 *   Если выгрузка не авто-обновляется — это единственный ручной шаг.
 ***************************************************************/


/* ============================================================
 * CONFIG — правится в одном месте
 * ============================================================ */

const AUTOSYNC_CONFIG = {
  STATE_PROPERTY: 'CRM_CREW_AUTOSYNC_STATE_V1',
  TICK_FUNCTION:  'autoSyncTick',
  MENU_BUILDER:   'autoSyncBuildMenu_',
  LOG_SHEET:      'APP_AUTOSYNC_LOG',

  // Как часто просыпается дирижёр. Допустимо: 1 | 5 | 10 | 15 | 30.
  HEARTBEAT_MINUTES: 10,

  // Минимальный простой между ЗАВЕРШЁННЫМИ полными пересборками.
  // 6 = примерно 4 раза в сутки. Хочешь раз в сутки — поставь 24.
  REBUILD_INTERVAL_HOURS: 6,

  // Нет прогресса стадии дольше этого → считаем, что её .after()-триггер
  // потерялся, и один раз «пинаем» continue* для реанимации.
  STALL_MINUTES: 20,

  // Жёсткий предел на одну стадию. Дольше → аварийно останавливаем цепочку.
  MAX_STAGE_HOURS: 3,

  // Авто-повтор цепочки после ошибки? false = ждём ручного
  // autoSyncRunNow()/autoSyncReset() (чтобы не долбить в проблему).
  RETRY_AFTER_ERROR: false,

  // Порядок стадий цепочки.
  STAGES: ['TRAFFIC', 'AMO', 'MATCHES', 'APP'],

  // Человеко-читаемые имена стадий (для статуса/лога).
  STAGE_LABEL: {
    TRAFFIC: 'Traffic ETL',
    AMO:     'AMO_DEALS',
    MATCHES: 'MATCHES',
    APP:     'APP (Картотека)',
  },
};


/* ============================================================
 * РЕЕСТР СТАДИЙ — привязка к реальным функциям V5.3 / APP-слоя.
 * Явные switch'и, чтобы переименование функции ломало сборку
 * заметно, а не молча.
 * ============================================================ */

function AUTOSYNC_startStage_(stage) {
  switch (stage) {
    case 'TRAFFIC': return startTrafficHubRebuild();   // V5.3
    case 'AMO':     return startAmoDealsRebuild();      // V5.3 (== syncAmoDeals)
    case 'MATCHES': return startMatchesRebuild();       // V5.3
    case 'APP':     return startAppRebuild();           // APP-слой
  }
  throw new Error('AUTOSYNC: неизвестная стадия для старта: ' + stage);
}

function AUTOSYNC_nudgeStage_(stage) {
  switch (stage) {
    case 'TRAFFIC': return continueTrafficHubRebuild();
    case 'AMO':     return continueAmoDealsRebuild();
    case 'MATCHES': return continueMatchesRebuild();
    case 'APP':     return continueAppRebuild();
  }
  throw new Error('AUTOSYNC: неизвестная стадия для nudge: ' + stage);
}

function AUTOSYNC_stageState_(stage) {
  switch (stage) {
    case 'TRAFFIC': return readTrafficState_();
    case 'AMO':     return readAmoState_();
    case 'MATCHES': return readMatchesState_();
    case 'APP':     return APP_readState_();
  }
  return null;
}

function AUTOSYNC_nextStage_(stage) {
  const i = AUTOSYNC_CONFIG.STAGES.indexOf(stage);
  if (i < 0 || i >= AUTOSYNC_CONFIG.STAGES.length - 1) return null;
  return AUTOSYNC_CONFIG.STAGES[i + 1];
}

// true, если ЛЮБАЯ стадия сейчас RUNNING (например, ручной запуск из меню).
function AUTOSYNC_anyStageRunning_() {
  return AUTOSYNC_CONFIG.STAGES.some(function (s) {
    const st = AUTOSYNC_stageState_(s);
    return !!(st && st.status === 'RUNNING');
  });
}


/* ============================================================
 * СОСТОЯНИЕ ОРКЕСТРАТОРА (Script Property, отдельно от стадий)
 * ============================================================ */

function AUTOSYNC_defaultState_() {
  return {
    version: 1,
    status: 'IDLE',          // IDLE | RUNNING | ERROR
    stage: null,             // текущая стадия цепочки
    runId: '',
    chainStartedAt: 0,
    stageStartedAt: 0,
    lastFingerprint: '',
    lastProgressAt: 0,
    lastNudgeAt: 0,
    lastRunFinishedAt: 0,    // когда завершилась прошлая цепочка (ok/err)
    lastRunOk: null,
    error: '',
    tickAt: 0,
  };
}

function AUTOSYNC_readState_() {
  const raw = PropertiesService.getScriptProperties()
    .getProperty(AUTOSYNC_CONFIG.STATE_PROPERTY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

function AUTOSYNC_writeState_(state) {
  PropertiesService.getScriptProperties()
    .setProperty(AUTOSYNC_CONFIG.STATE_PROPERTY, JSON.stringify(state));
}

// «Отпечаток прогресса» стадии: статус + фаза финализации + все числовые
// счётчики. Меняется при любом реальном продвижении — так ловим зависание.
function AUTOSYNC_fingerprint_(st) {
  if (!st) return 'none';
  const parts = [String(st.status || ''), String(st.finalizePhase || '')];
  Object.keys(st).sort().forEach(function (k) {
    if (typeof st[k] === 'number') parts.push(k + '=' + st[k]);
  });
  return parts.join('|');
}


/* ============================================================
 * СЕРДЦЕ — ТИК (ставится на time-trigger everyMinutes)
 * ============================================================ */

function autoSyncTick() {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return;   // другой тик ещё работает — пропускаем
  try {
    const now = Date.now();
    const o = AUTOSYNC_readState_() || AUTOSYNC_defaultState_();
    o.tickAt = now;

    if (o.status === 'RUNNING') {
      AUTOSYNC_tickRunning_(o, now);
    } else {
      AUTOSYNC_tickIdle_(o, now);
    }

    AUTOSYNC_writeState_(o);
  } catch (err) {
    // Тик не должен «убивать» триггер — записываем ошибку и живём дальше.
    try {
      const o2 = AUTOSYNC_readState_() || AUTOSYNC_defaultState_();
      o2.status = 'ERROR';
      o2.error = 'TICK_EXCEPTION: ' + (err && err.message || err);
      o2.lastRunFinishedAt = Date.now();
      o2.lastRunOk = false;
      AUTOSYNC_writeState_(o2);
      AUTOSYNC_log_('ERROR', o2.stage || '', 'tick exception: ' + (err && err.message || err));
    } catch (_) {}
  } finally {
    lock.releaseLock();
  }
}

// Цепочка идёт: следим за текущей стадией и продвигаем.
function AUTOSYNC_tickRunning_(o, now) {
  const stage = o.stage;

  // Жёсткий предел на стадию.
  if (o.stageStartedAt && now - o.stageStartedAt > AUTOSYNC_CONFIG.MAX_STAGE_HOURS * 3600000) {
    o.status = 'ERROR';
    o.error = 'STAGE_TIMEOUT: ' + stage + ' > ' + AUTOSYNC_CONFIG.MAX_STAGE_HOURS + 'ч';
    o.lastRunFinishedAt = now;
    o.lastRunOk = false;
    AUTOSYNC_log_('ERROR', stage, 'стадия превысила MAX_STAGE_HOURS');
    return;
  }

  const st = AUTOSYNC_stageState_(stage);

  // Состояние стадии потерялось / не создалось → (пере)стартуем один раз.
  if (!st) {
    AUTOSYNC_log_('WARN', stage, 'нет состояния стадии → (пере)старт');
    o.stageStartedAt = now;
    o.lastFingerprint = '';
    o.lastProgressAt = now;
    o.lastNudgeAt = now;
    AUTOSYNC_startStage_(stage);
    return;
  }

  const status = st.status;

  if (status === 'RUNNING') {
    const fp = AUTOSYNC_fingerprint_(st);
    if (fp !== o.lastFingerprint) {
      o.lastFingerprint = fp;         // здоровый прогресс
      o.lastProgressAt = now;
    } else {
      const stalledMs = now - (o.lastProgressAt || now);
      const sinceNudge = now - (o.lastNudgeAt || 0);
      if (stalledMs > AUTOSYNC_CONFIG.STALL_MINUTES * 60000 &&
          sinceNudge > AUTOSYNC_CONFIG.STALL_MINUTES * 60000) {
        AUTOSYNC_log_('WARN', stage, 'зависание → пинаем continue*');
        o.lastNudgeAt = now;
        AUTOSYNC_nudgeStage_(stage);  // lock-guarded, безопасно
      }
    }
    return;
  }

  if (status === 'DONE') {
    const next = AUTOSYNC_nextStage_(stage);
    if (next) {
      AUTOSYNC_log_('INFO', stage, 'DONE → старт ' + next);
      o.stage = next;
      o.stageStartedAt = now;
      o.lastFingerprint = '';
      o.lastProgressAt = now;
      o.lastNudgeAt = now;
      AUTOSYNC_startStage_(next);
    } else {
      // APP DONE → вся цепочка завершена.
      o.status = 'IDLE';
      o.stage = null;
      o.lastRunFinishedAt = now;
      o.lastRunOk = true;
      o.error = '';
      const secs = Math.round((now - (o.chainStartedAt || now)) / 1000);
      AUTOSYNC_log_('OK', 'CHAIN',
        'цепочка завершена за ' + secs + 'с; APP_TRAFFIC_ARCHIVE=' + AUTOSYNC_archiveCount_());
    }
    return;
  }

  // ERROR / ABORTED / CANCELLED — стоп цепочки.
  o.status = 'ERROR';
  o.error = stage + ':' + String(status) + (st.error ? (' ' + st.error) : '');
  o.lastRunFinishedAt = now;
  o.lastRunOk = false;
  AUTOSYNC_log_('ERROR', stage, 'стадия ' + status + ' ' + (st.error || ''));
}

// Цепочка не идёт: решаем, пора ли запускать новую.
function AUTOSYNC_tickIdle_(o, now) {
  if (o.status === 'ERROR' && !AUTOSYNC_CONFIG.RETRY_AFTER_ERROR) return;

  const intervalMs = AUTOSYNC_CONFIG.REBUILD_INTERVAL_HOURS * 3600000;
  const due = !o.lastRunFinishedAt || (now - o.lastRunFinishedAt >= intervalMs);
  if (!due) return;

  // Не влезаем поверх ручной пересборки, если её запустили из меню.
  if (AUTOSYNC_anyStageRunning_()) {
    AUTOSYNC_log_('INFO', '', 'отложено: стадия уже RUNNING (ручной запуск?)');
    return;
  }

  AUTOSYNC_beginChain_(o, now);
}

function AUTOSYNC_beginChain_(o, now) {
  o.status = 'RUNNING';
  o.stage = AUTOSYNC_CONFIG.STAGES[0];
  o.runId = Utilities.getUuid();
  o.chainStartedAt = now;
  o.stageStartedAt = now;
  o.lastFingerprint = '';
  o.lastProgressAt = now;
  o.lastNudgeAt = now;
  o.error = '';
  AUTOSYNC_log_('INFO', o.stage, 'старт цепочки (runId ' + o.runId.slice(0, 8) + ')');
  AUTOSYNC_startStage_(o.stage);
}


/* ============================================================
 * УСТАНОВКА / СНЯТИЕ — то, что жмут руками (1 раз)
 * ============================================================ */

function installAutoSyncTrigger() {
  // Валидация частоты сердцебиения.
  const allowed = [1, 5, 10, 15, 30];
  const beat = allowed.indexOf(AUTOSYNC_CONFIG.HEARTBEAT_MINUTES) >= 0
    ? AUTOSYNC_CONFIG.HEARTBEAT_MINUTES : 10;

  // Снимаем прошлые триггеры дирижёра и его меню.
  AUTOSYNC_removeTriggersByHandler_(AUTOSYNC_CONFIG.TICK_FUNCTION);
  AUTOSYNC_removeTriggersByHandler_(AUTOSYNC_CONFIG.MENU_BUILDER);

  // Сердцебиение.
  ScriptApp.newTrigger(AUTOSYNC_CONFIG.TICK_FUNCTION)
    .timeBased().everyMinutes(beat).create();

  // Меню «Картотека AUTO» (installable onOpen — у V5.3 свой onOpen).
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) {
    ScriptApp.newTrigger(AUTOSYNC_CONFIG.MENU_BUILDER)
      .forSpreadsheet(ss).onOpen().create();
    try { autoSyncBuildMenu_(); } catch (_) {}
  }

  // Сброс состояния: lastRunFinishedAt=0 → первая пересборка стартует
  // на ближайшем тике (в течение beat минут).
  const o = AUTOSYNC_defaultState_();
  AUTOSYNC_writeState_(o);
  AUTOSYNC_log_('INFO', '', 'авто-триггер установлен: heartbeat ' + beat +
    ' мин, интервал ' + AUTOSYNC_CONFIG.REBUILD_INTERVAL_HOURS + ' ч');

  AUTOSYNC_alert_(
    'Авто-обновление Картотеки включено.\n\n' +
    '• Дирижёр просыпается каждые ' + beat + ' мин.\n' +
    '• Полная пересборка (Traffic → AMO → MATCHES → APP) — не чаще, чем раз в ' +
      AUTOSYNC_CONFIG.REBUILD_INTERVAL_HOURS + ' ч.\n' +
    '• Первая пересборка стартует в ближайшие ' + beat + ' мин ' +
      '(или сразу через «AUTO: запустить сейчас»).\n\n' +
    'Если раньше ставил часовой триггер Traffic — сними его ' +
    '(removeTrafficHourlyTrigger), иначе Traffic будет дублироваться.'
  );
}

function removeAutoSyncTrigger() {
  AUTOSYNC_removeTriggersByHandler_(AUTOSYNC_CONFIG.TICK_FUNCTION);
  AUTOSYNC_removeTriggersByHandler_(AUTOSYNC_CONFIG.MENU_BUILDER);
  const o = AUTOSYNC_readState_() || AUTOSYNC_defaultState_();
  o.status = 'IDLE';
  o.stage = null;
  AUTOSYNC_writeState_(o);
  AUTOSYNC_log_('INFO', '', 'авто-триггер снят');
  AUTOSYNC_alert_('Авто-обновление выключено. Уже идущие стадии дойдут до конца сами; ' +
    'новые цепочки не запускаются.');
}

function AUTOSYNC_removeTriggersByHandler_(handler) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t);
  });
}

function AUTOSYNC_isInstalled_() {
  return ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === AUTOSYNC_CONFIG.TICK_FUNCTION;
  });
}


/* ============================================================
 * РУЧНЫЕ КОМАНДЫ (меню / редактор)
 * ============================================================ */

// Запустить полную пересборку немедленно (в обход интервала).
function autoSyncRunNow() {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(2000)) { AUTOSYNC_alert_('Дирижёр занят, попробуй через минуту.'); return; }
  try {
    const now = Date.now();
    const o = AUTOSYNC_readState_() || AUTOSYNC_defaultState_();

    if (o.status === 'RUNNING') {
      AUTOSYNC_alert_('Цепочка уже идёт: стадия ' +
        (AUTOSYNC_CONFIG.STAGE_LABEL[o.stage] || o.stage) + '.');
      return;
    }
    if (AUTOSYNC_anyStageRunning_()) {
      AUTOSYNC_alert_('Какая-то стадия уже пересобирается вручную. Дождись её завершения.');
      return;
    }

    AUTOSYNC_beginChain_(o, now);
    AUTOSYNC_writeState_(o);
    AUTOSYNC_alert_('Пересборка запущена: Traffic → AMO → MATCHES → APP.\n' +
      'Следи через «AUTO: статус».');
  } finally {
    lock.releaseLock();
  }
}

// Показать статус дирижёра и стадий.
function autoSyncStatus() {
  const o = AUTOSYNC_readState_() || AUTOSYNC_defaultState_();
  const now = Date.now();
  const lines = [];

  lines.push('Авто-триггер: ' + (AUTOSYNC_isInstalled_() ? 'установлен' : 'НЕ установлен'));
  lines.push('Статус цепочки: ' + o.status +
    (o.stage ? (' · стадия ' + (AUTOSYNC_CONFIG.STAGE_LABEL[o.stage] || o.stage)) : ''));

  if (o.status === 'RUNNING') {
    const st = AUTOSYNC_stageState_(o.stage);
    lines.push('  стадия статус: ' + (st ? st.status : '—') +
      (st && st.finalizePhase ? (' · ' + st.finalizePhase) : ''));
    if (o.lastProgressAt) {
      lines.push('  последний прогресс: ' + AUTOSYNC_ago_(now - o.lastProgressAt) + ' назад');
    }
  }

  if (o.lastRunFinishedAt) {
    lines.push('Прошлая цепочка: ' + (o.lastRunOk ? 'OK' : 'ОШИБКА') +
      ', ' + AUTOSYNC_ago_(now - o.lastRunFinishedAt) + ' назад');
    if (o.status === 'IDLE') {
      const dueIn = AUTOSYNC_CONFIG.REBUILD_INTERVAL_HOURS * 3600000 - (now - o.lastRunFinishedAt);
      lines.push('Следующая: ' + (dueIn <= 0 ? 'на ближайшем тике' : ('через ~' + AUTOSYNC_ago_(dueIn))));
    }
  }

  if (o.error) lines.push('Ошибка: ' + o.error);
  lines.push('APP_TRAFFIC_ARCHIVE: ' + AUTOSYNC_archiveCount_() + ' строк');
  lines.push('');
  lines.push('Стадии сейчас:');
  AUTOSYNC_CONFIG.STAGES.forEach(function (s) {
    const st = AUTOSYNC_stageState_(s);
    lines.push('  ' + AUTOSYNC_CONFIG.STAGE_LABEL[s] + ': ' + (st ? st.status : '—'));
  });

  AUTOSYNC_alert_(lines.join('\n'));
}

// Сбросить залипшее состояние дирижёра (стадии НЕ трогает).
function autoSyncReset() {
  const o = AUTOSYNC_defaultState_();
  // сохраняем момент прошлого завершения, чтобы интервал не обнулялся
  const prev = AUTOSYNC_readState_();
  if (prev && prev.lastRunFinishedAt) {
    o.lastRunFinishedAt = prev.lastRunFinishedAt;
    o.lastRunOk = prev.lastRunOk;
  }
  AUTOSYNC_writeState_(o);
  AUTOSYNC_log_('INFO', '', 'состояние дирижёра сброшено вручную');
  AUTOSYNC_alert_('Состояние дирижёра сброшено (IDLE). Стадии не тронуты.\n' +
    'Запустить сейчас — «AUTO: запустить сейчас».');
}


/* ============================================================
 * МЕНЮ (installable onOpen)
 * ============================================================ */

function autoSyncBuildMenu_() {
  SpreadsheetApp.getUi()
    .createMenu('Картотека AUTO')
    .addItem('AUTO: запустить сейчас', 'autoSyncRunNow')
    .addItem('AUTO: статус', 'autoSyncStatus')
    .addSeparator()
    .addItem('AUTO: установить авто-триггер', 'installAutoSyncTrigger')
    .addItem('AUTO: снять авто-триггер', 'removeAutoSyncTrigger')
    .addItem('AUTO: сбросить состояние', 'autoSyncReset')
    .addToUi();
}


/* ============================================================
 * ЛОГ + МЕЛКИЕ ХЕЛПЕРЫ
 * ============================================================ */

// Пишем только значимые события (старт/переход/финал/ошибка/nudge),
// idle-тик молчит — не гоняем I/O впустую.
function AUTOSYNC_log_(level, stage, msg) {
  try {
    const hub = getHubSpreadsheet_();
    let sh = hub.getSheetByName(AUTOSYNC_CONFIG.LOG_SHEET);
    if (!sh) {
      sh = hub.insertSheet(AUTOSYNC_CONFIG.LOG_SHEET);
      sh.appendRow(['ts', 'level', 'stage', 'message']);
      try { sh.hideSheet(); } catch (_) {}
    }
    sh.appendRow([new Date().toISOString(), level, stage || '', String(msg || '')]);
    // Простой трим, чтобы лист не разрастался бесконечно.
    const last = sh.getLastRow();
    if (last > 2200) sh.deleteRows(2, 1000);
  } catch (_) {}
}

function AUTOSYNC_archiveCount_() {
  try {
    const hub = getHubSpreadsheet_();
    const sh = hub.getSheetByName(APP_CONFIG.ARCHIVE_SHEET);
    if (!sh) return 0;
    return Math.max(0, sh.getLastRow() - 1);
  } catch (_) { return '?'; }
}

function AUTOSYNC_ago_(ms) {
  const s = Math.round(ms / 1000);
  if (s < 90) return s + 'с';
  const m = Math.round(s / 60);
  if (m < 90) return m + ' мин';
  const h = Math.round(m / 60);
  if (h < 48) return h + ' ч';
  return Math.round(h / 24) + ' дн';
}

// alert только в UI-контексте (меню/редактор); из триггера — тихо в лог.
function AUTOSYNC_alert_(text) {
  try {
    SpreadsheetApp.getUi().alert(text);
  } catch (_) {
    try { Logger.log(text); } catch (__) {}
  }
}
