/**
 * CRM Crew Dashboard — protected audit log endpoint.
 *
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 *
 * The browser sends the current Google OAuth access token. The script verifies
 * that token against Google userinfo, checks the email against USERS, then
 * writes rows to the protected/hidden "CRM Logs" sheet as the script owner.
 */

const CRM_AUDIT_SHEET_ID = '1DeUsHB_O1SbIMR4p5yd64o_R0yllWvtnyNhjxjhipn8';
const CRM_AUDIT_SHEET_NAME = 'CRM Logs';
const CRM_AUDIT_USERS_SHEET = 'USERS';
const CRM_AUDIT_HEADERS = [
  'timestamp',
  'user_email',
  'user_name',
  'role',
  'module',
  'action',
  'sheet',
  'row',
  'column',
  'entity_id',
  'entity_label',
  'before',
  'after',
  'month',
  'source',
  'session_id',
];
const CRM_AUDIT_MAX_ROWS_PER_REQUEST = 50;
const CRM_AUDIT_RATE_WINDOW_SEC = 60;
const CRM_AUDIT_MAX_ROWS_PER_WINDOW = 150;
const CRM_AUDIT_ALLOWED = {
  visits: {
    update: true,
    add: true,
    insert: true,
    delete: true,
    sverka: true,
  },
  schedule: {
    update: true,
  },
  plan: {
    update: true,
  },
  config: {
    toggle: true,
  },
};

function doGet() {
  return crmAuditJson_({
    ok: true,
    service: 'crm-audit-logs',
    sheet: CRM_AUDIT_SHEET_NAME,
    // Presence of this field confirms the adjustments code is live in this deployment.
    adjustments: ADJ_SHEET_NAME,
  });
}

function doPost(e) {
  try {
    const payload = crmAuditParsePayload_(e);
    // Adjustments (премирование/депремирование) share this Web App / doPost.
    // Routed by payload.type BEFORE the audit-log guard below.
    if (payload && payload.type === 'adjustment_add')    return ADJ_handleAdd_(payload);
    if (payload && payload.type === 'adjustment_cancel') return ADJ_handleCancel_(payload);
    if (!payload || payload.type !== 'crm_audit_logs') {
      throw new Error('bad_payload');
    }

    const profile = crmAuditVerifyGoogleToken_(payload.token);
    const user = crmAuditFindUser_(profile.email);
    if (!user) {
      throw new Error('user_not_allowed');
    }

    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (!rows.length) return crmAuditJson_({ ok: true, written: 0 });
    if (rows.length > CRM_AUDIT_MAX_ROWS_PER_REQUEST) throw new Error('too_many_rows');
    crmAuditCheckRateLimit_(profile.email, rows.length);

    const ss = SpreadsheetApp.openById(CRM_AUDIT_SHEET_ID);
    const sheet = crmAuditEnsureSheet_(ss);
    const now = crmAuditNow_();
    const normalized = rows.map(row => crmAuditNormalizeRow_(row, now, profile.email, user));

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const start = Math.max(sheet.getLastRow() + 1, 2);
      sheet.getRange(start, 1, normalized.length, CRM_AUDIT_HEADERS.length).setValues(normalized);
    } finally {
      lock.releaseLock();
    }

    return crmAuditJson_({ ok: true, written: normalized.length });
  } catch (err) {
    return crmAuditJson_({
      ok: false,
      error: String(err && err.message ? err.message : err),
    });
  }
}

/**
 * Run once manually after pasting the script, or let doPost create it on demand.
 * This creates headers, hides the sheet, and protects it from direct edits.
 */
function setupCrmAuditLogs() {
  const ss = SpreadsheetApp.openById(CRM_AUDIT_SHEET_ID);
  const sheet = crmAuditEnsureSheet_(ss);
  sheet.hideSheet();
  return 'CRM Logs ready: ' + sheet.getName();
}

function crmAuditParsePayload_(e) {
  const raw = e && e.postData && e.postData.contents;
  if (!raw) throw new Error('empty_body');
  return JSON.parse(raw);
}

function crmAuditVerifyGoogleToken_(token) {
  if (!token) throw new Error('missing_token');
  const resp = UrlFetchApp.fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    method: 'get',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token },
  });
  if (resp.getResponseCode() !== 200) throw new Error('invalid_token');
  const profile = JSON.parse(resp.getContentText() || '{}');
  const email = crmAuditNormEmail_(profile.email);
  if (!email) throw new Error('missing_email');
  return {
    email: email,
    name: profile.name || '',
  };
}

function crmAuditFindUser_(email) {
  const target = crmAuditNormEmail_(email);
  const ss = SpreadsheetApp.openById(CRM_AUDIT_SHEET_ID);
  const sheet = ss.getSheetByName(CRM_AUDIT_USERS_SHEET);
  if (!sheet) throw new Error('users_sheet_missing');
  const values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 4).getValues();
  for (let i = 1; i < values.length; i++) {
    const row = values[i] || [];
    const emails = String(row[0] || '')
      .split(',')
      .map(crmAuditNormEmail_)
      .filter(Boolean);
    if (emails.indexOf(target) >= 0) {
      return {
        email: target,
        name: String(row[1] || '').trim(),
        role: String(row[2] || '').trim().toLowerCase(),
      };
    }
  }
  return null;
}

function crmAuditEnsureSheet_(ss) {
  let sheet = ss.getSheetByName(CRM_AUDIT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CRM_AUDIT_SHEET_NAME);
  }

  sheet.getRange(1, 1, 1, CRM_AUDIT_HEADERS.length).setValues([CRM_AUDIT_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, CRM_AUDIT_HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#1f2937')
    .setFontColor('#ffffff');

  crmAuditProtectSheet_(sheet);
  try { sheet.hideSheet(); } catch (_) {}
  return sheet;
}

function crmAuditProtectSheet_(sheet) {
  const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  let protection = protections && protections.length ? protections[0] : sheet.protect();
  protection.setDescription('Protected CRM audit log');
  protection.setWarningOnly(false);
  try {
    const me = Session.getEffectiveUser();
    const editors = protection.getEditors();
    if (editors && editors.length) protection.removeEditors(editors);
    if (me && me.getEmail()) protection.addEditor(me);
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
  } catch (_) {
    // Some consumer accounts restrict editor management. The protection itself
    // still remains in place for normal UI edits.
  }
}

function crmAuditNormalizeRow_(row, timestamp, verifiedEmail, user) {
  const src = Array.isArray(row) ? row : [];
  const out = new Array(CRM_AUDIT_HEADERS.length).fill('');
  for (let i = 0; i < out.length; i++) out[i] = crmAuditCell_(src[i]);
  const module = crmAuditSafeToken_(out[4]);
  const action = crmAuditSafeToken_(out[5]);
  if (!CRM_AUDIT_ALLOWED[module] || !CRM_AUDIT_ALLOWED[module][action]) {
    throw new Error('action_not_allowed');
  }
  out[0] = timestamp;
  out[1] = verifiedEmail;
  out[2] = user.name || out[2] || '';
  out[3] = user.role || out[3] || '';
  out[4] = module;
  out[5] = action;
  out[14] = out[14] || 'app';
  return out;
}

function crmAuditCell_(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(crmAuditCell_).join(' | ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).slice(0, 50000);
}

function crmAuditNormEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function crmAuditSafeToken_(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}

function crmAuditCheckRateLimit_(email, rowsCount) {
  const cache = CacheService.getScriptCache();
  const key = 'crm_audit_rate_' + Utilities.base64EncodeWebSafe(email).slice(0, 80);
  const current = parseInt(cache.get(key) || '0', 10) || 0;
  const next = current + rowsCount;
  if (next > CRM_AUDIT_MAX_ROWS_PER_WINDOW) {
    throw new Error('rate_limited');
  }
  cache.put(key, String(next), CRM_AUDIT_RATE_WINDOW_SEC);
}

function crmAuditNow_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Yekaterinburg', 'yyyy-MM-dd HH:mm:ss');
}

function crmAuditJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ADJUSTMENTS — премирование / депремирование (корректировки дохода)
 *
 * Финансовый журнал в скрытом защищённом листе `adjustments`. Пишется ТОЛЬКО
 * server-side (этот скрипт как владелец), клиенту не доверяем. Append-only:
 * отмена = смена STATUS ACTIVE→CANCELLED + audit-поля, строка не удаляется.
 * Роутинг — через doPost по payload.type ('adjustment_add'|'adjustment_cancel').
 *
 * Разовая инициализация: выполнить setupAdjustments() из редактора.
 * ═══════════════════════════════════════════════════════════════════════════ */

const ADJ_SHEET_NAME = 'adjustments';
const ADJ_HEADERS = [
  'ID', 'MONTH', 'CRM_ID', 'MANAGER_NAME', 'DIRECTION', 'TYPE', 'CATEGORY',
  'AMOUNT', 'COMMENT', 'CREATED_AT', 'CREATED_BY_CRM_ID', 'CREATED_BY_NAME',
  'STATUS', 'CANCELLED_AT', 'CANCELLED_BY_CRM_ID', 'CANCELLED_BY_NAME',
  'CANCEL_COMMENT',
];
// Белые списки категорий должны совпадать с ADJ_CATEGORIES на клиенте (app.js).
const ADJ_CATEGORIES = {
  PENALTY: ['Опоздание', 'Дисциплина', 'Нарушение регламента', 'Ошибка при работе с клиентом', 'Качество работы', 'Прочее'],
  BONUS:   ['Особый результат', 'Дополнительное премирование', 'Инициатива', 'Качество работы', 'Прочее'],
};

/** Разовая настройка: создать лист, спрятать, защитить. */
function setupAdjustments() {
  const ss = SpreadsheetApp.openById(CRM_AUDIT_SHEET_ID);
  const sheet = ADJ_ensureSheet_(ss);
  try { sheet.hideSheet(); } catch (_) {}
  return 'adjustments ready: ' + sheet.getName();
}

function ADJ_handleAdd_(payload) {
  try {
    const profile = crmAuditVerifyGoogleToken_(payload.token);
    const users = ADJ_loadUsers_();
    const author = ADJ_userByEmail_(users, profile.email);
    if (!author) throw new Error('author_not_allowed');
    if (!ADJ_isCeoLike_(author.role)) throw new Error('forbidden_role');

    const targetCrmId = String(payload.targetCrmId || '').trim();
    if (!targetCrmId) throw new Error('missing_target');
    const target = ADJ_userByCrmId_(users, targetCrmId);
    if (!target) throw new Error('target_not_found');
    const direction = target.role;
    if (direction !== 'crm' && direction !== 'dozhim') throw new Error('target_bad_direction');

    // BONUS/PENALTY приходит в payload.op (payload.type занят роутингом).
    const op = String(payload.op || '').trim().toUpperCase();
    if (op !== 'BONUS' && op !== 'PENALTY') throw new Error('bad_type');

    const category = String(payload.category || '').trim();
    if ((ADJ_CATEGORIES[op] || []).indexOf(category) < 0) throw new Error('bad_category');

    const amount = Math.round(Number(payload.amount));
    if (!isFinite(amount) || amount <= 0) throw new Error('bad_amount');

    const comment = String(payload.comment || '').trim();
    if (!comment) throw new Error('empty_comment');

    const month = String(payload.month || '').trim();
    if (!/^\d{4}$/.test(month)) throw new Error('bad_month');
    // Нельзя задним числом: month не раньше реального текущего месяца сервера.
    if (ADJ_monthKey_(month) < ADJ_monthKey_(ADJ_currentMonth_())) throw new Error('past_month');

    const id = ADJ_genId_();
    const now = crmAuditNow_();
    const rowArr = [
      id, month, targetCrmId, target.name, direction, op, category, amount, comment,
      now, author.crmId, author.name, 'ACTIVE', '', '', '', '',
    ];

    const ss = SpreadsheetApp.openById(CRM_AUDIT_SHEET_ID);
    const sheet = ADJ_ensureSheet_(ss);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const start = Math.max(sheet.getLastRow() + 1, 2);
      sheet.getRange(start, 1, 1, ADJ_HEADERS.length).setValues([rowArr]);
    } finally {
      lock.releaseLock();
    }
    return crmAuditJson_({ ok: true, id: id });
  } catch (err) {
    return crmAuditJson_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function ADJ_handleCancel_(payload) {
  try {
    const profile = crmAuditVerifyGoogleToken_(payload.token);
    const users = ADJ_loadUsers_();
    const author = ADJ_userByEmail_(users, profile.email);
    if (!author) throw new Error('author_not_allowed');
    if (!ADJ_isCeoLike_(author.role)) throw new Error('forbidden_role');

    const id = String(payload.id || '').trim();
    if (!id) throw new Error('missing_id');
    const cancelComment = String(payload.cancelComment || '').trim();
    if (!cancelComment) throw new Error('empty_cancel_comment');

    const ss = SpreadsheetApp.openById(CRM_AUDIT_SHEET_ID);
    const sheet = ADJ_ensureSheet_(ss);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const last = sheet.getLastRow();
      if (last < 2) throw new Error('not_found');
      const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
      let rowIdx = -1;
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0] || '').trim() === id) { rowIdx = i + 2; break; }
      }
      if (rowIdx < 0) throw new Error('not_found');
      const cur = String(sheet.getRange(rowIdx, 13).getValue() || '').trim().toUpperCase();
      if (cur !== 'ACTIVE') throw new Error('not_active');
      const now = crmAuditNow_();
      // Колонки M..Q: STATUS, CANCELLED_AT, CANCELLED_BY_CRM_ID, CANCELLED_BY_NAME, CANCEL_COMMENT
      sheet.getRange(rowIdx, 13, 1, 5)
        .setValues([['CANCELLED', now, author.crmId, author.name, cancelComment]]);
    } finally {
      lock.releaseLock();
    }
    return crmAuditJson_({ ok: true, id: id });
  } catch (err) {
    return crmAuditJson_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function ADJ_ensureSheet_(ss) {
  let sheet = ss.getSheetByName(ADJ_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(ADJ_SHEET_NAME);
  sheet.getRange(1, 1, 1, ADJ_HEADERS.length).setValues([ADJ_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, ADJ_HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#1f2937')
    .setFontColor('#ffffff');
  ADJ_protectSheet_(sheet);
  try { sheet.hideSheet(); } catch (_) {}
  return sheet;
}

function ADJ_protectSheet_(sheet) {
  const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  let protection = protections && protections.length ? protections[0] : sheet.protect();
  protection.setDescription('Protected adjustments journal');
  protection.setWarningOnly(false);
  try {
    const me = Session.getEffectiveUser();
    const editors = protection.getEditors();
    if (editors && editors.length) protection.removeEditors(editors);
    if (me && me.getEmail()) protection.addEditor(me);
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
  } catch (_) {
    // Consumer-аккаунты могут ограничивать управление editors — защита всё равно ставится.
  }
}

function ADJ_loadUsers_() {
  const ss = SpreadsheetApp.openById(CRM_AUDIT_SHEET_ID);
  const sheet = ss.getSheetByName(CRM_AUDIT_USERS_SHEET);
  if (!sheet) throw new Error('users_sheet_missing');
  const last = Math.max(sheet.getLastRow(), 1);
  // A..G: email, name, role, fund, rang, (F), ID CRM (col G).
  return sheet.getRange(1, 1, last, 7).getValues();
}

function ADJ_userObj_(row) {
  return {
    email: crmAuditNormEmail_(row[0]),
    name: String(row[1] || '').trim(),
    role: String(row[2] || '').trim().toLowerCase(),
    crmId: String(row[6] || '').trim(),
  };
}

function ADJ_userByEmail_(users, email) {
  const target = crmAuditNormEmail_(email);
  for (let i = 1; i < users.length; i++) {
    const row = users[i] || [];
    const emails = String(row[0] || '').split(',').map(crmAuditNormEmail_).filter(Boolean);
    if (emails.indexOf(target) >= 0) return ADJ_userObj_(row);
  }
  return null;
}

function ADJ_userByCrmId_(users, crmId) {
  const target = String(crmId || '').trim();
  if (!target) return null;
  for (let i = 1; i < users.length; i++) {
    const row = users[i] || [];
    if (String(row[6] || '').trim() === target) return ADJ_userObj_(row);
  }
  return null;
}

function ADJ_isCeoLike_(role) {
  const r = String(role || '').toLowerCase().trim();
  return r === 'ceo' || r === 'rop' || r === 'роп';
}

function ADJ_genId_() {
  const tz = Session.getScriptTimeZone() || 'Asia/Yekaterinburg';
  const stamp = Utilities.formatDate(new Date(), tz, 'yyyyMMdd-HHmmss');
  const rand = Utilities.getUuid().replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
  return 'ADJ-' + stamp + '-' + rand;
}

function ADJ_currentMonth_() {
  const tz = Session.getScriptTimeZone() || 'Asia/Yekaterinburg';
  return Utilities.formatDate(new Date(), tz, 'MMyy'); // формат как currentSuffix (MMYY)
}

function ADJ_monthKey_(mmYY) {
  const mm = parseInt(String(mmYY).slice(0, 2), 10) || 0;
  const yy = parseInt(String(mmYY).slice(2, 4), 10) || 0;
  return (2000 + yy) * 100 + mm;
}
