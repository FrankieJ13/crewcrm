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
  });
}

function doPost(e) {
  try {
    const payload = crmAuditParsePayload_(e);
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
