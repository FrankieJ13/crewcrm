/* CEO-only editor for USERS!A:J. */
(function () {
  'use strict';

  const SHEET = 'USERS';
  // Читаем до P, чтобы при синхронизации локального USERS-кеша не потерять
  // служебные переключатели K:P. В интерфейсе и записях доступны только A:J.
  const RANGE = 'A1:P50';
  const FALLBACK_HEADERS = [
    'email_list', 'name_in_sheets', 'role', 'fund', 'rang',
    'DOB', 'ID CRM', 'Telegram', 'MAX', 'Phone Number',
  ];
  const SELECT_COLUMNS = new Set([2, 3, 4]);
  const WIDE_COLUMNS = new Set([0, 1]);
  const PS = { rows: [], headers: FALLBACK_HEADERS.slice(), options: {}, loaded: false, busy: false };

  function esc(value) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(value)
      : String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function strictCeo() {
    if (typeof window.isStrictCeo === 'function') return window.isStrictCeo();
    const user = typeof window.findUserInSheet === 'function' ? window.findUserInSheet() : null;
    return String(user?.role || '').trim().toLowerCase() === 'ceo';
  }

  function normalizeRows(rows) {
    const data = Array.isArray(rows) ? rows.map(r => Array.isArray(r) ? r.slice(0, 16) : []) : [];
    while (data.length < 50) data.push([]);
    return data;
  }

  function isEmptyRow(row) {
    return !(row || []).slice(0, 10).some(v => String(v ?? '').trim());
  }

  function uniqueColumnOptions(col) {
    const seen = new Set();
    const out = [];
    PS.rows.slice(1).forEach(row => {
      const value = String(row?.[col] ?? '').trim();
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return;
      seen.add(key);
      out.push(value);
    });
    return out;
  }

  async function loadOptions() {
    const cols = [2, 3, 4];
    const values = await Promise.all(cols.map(async col => {
      try {
        const live = await window.crmSheetsGetValidationOptions(SHEET, col, 50);
        return [col, live.length ? live : uniqueColumnOptions(col)];
      } catch (_) {
        return [col, uniqueColumnOptions(col)];
      }
    }));
    values.forEach(([col, options]) => { PS.options[col] = options; });
  }

  function optionMarkup(col, current) {
    const options = (PS.options[col] || []).slice();
    if (current && !options.some(v => String(v).toLowerCase() === String(current).toLowerCase())) options.unshift(current);
    return [`<option value="">—</option>`, ...options.map(value =>
      `<option value="${esc(value)}" ${String(value) === String(current) ? 'selected' : ''}>${esc(value)}</option>`
    )].join('');
  }

  function controlMarkup(rowNo, col, value) {
    const header = PS.headers[col] || FALLBACK_HEADERS[col];
    const wide = WIDE_COLUMNS.has(col) ? ' wide' : '';
    let control;
    if (SELECT_COLUMNS.has(col)) {
      control = `<select class="profile-control" data-profile-row="${rowNo}" data-profile-col="${col}">${optionMarkup(col, value)}</select>`;
    } else {
      const dateAttrs = col === 5 ? ' inputmode="numeric" placeholder="дд.мм.гггг" maxlength="10"' : '';
      control = `<input class="profile-control" type="text" value="${esc(value)}" data-profile-row="${rowNo}" data-profile-col="${col}"${dateAttrs}>`;
    }
    return `<div class="profile-field${wide}" data-profile-field="${rowNo}:${col}"><label>${esc(header)}</label>${control}</div>`;
  }

  function profileMarkup(row, rowNo) {
    const values = Array.from({ length: 10 }, (_, col) => String(row?.[col] ?? ''));
    const title = values[1] || values[0] || `Новый профиль · строка ${rowNo}`;
    const role = values[2] || 'без роли';
    return `<details class="profile-row-card" data-profile-card="${rowNo}">
      <summary class="profile-row-summary">
        <span class="profile-row-name">${esc(title)}</span>
        <span class="profile-row-role">${esc(role)}</span>
      </summary>
      <div class="profile-row-fields">
        ${values.map((value, col) => controlMarkup(rowNo, col, value)).join('')}
        <div class="profile-row-actions">
          <span class="profile-save-state" data-profile-state="${rowNo}">Изменения сохраняются автоматически</span>
          <button class="profile-delete" type="button" data-profile-delete="${rowNo}">Удалить профиль</button>
        </div>
      </div>
    </details>`;
  }

  function render() {
    const body = document.getElementById('profiles-settings-body');
    if (!body) return;
    const profiles = [];
    for (let i = 1; i < PS.rows.length; i++) {
      if (!isEmptyRow(PS.rows[i])) profiles.push(profileMarkup(PS.rows[i], i + 1));
    }
    body.innerHTML = `<div class="profiles-toolbar">
      <span class="profiles-count">${profiles.length} профилей · USERS A:J</span>
      <button class="profiles-add" id="profiles-add" type="button">+ Добавить профиль</button>
    </div>
    <div class="profiles-list">${profiles.join('') || '<div class="profiles-empty">Профили не найдены</div>'}</div>`;
    bind();
  }

  function setFieldState(rowNo, col, state) {
    const field = document.querySelector(`[data-profile-field="${rowNo}:${col}"]`);
    if (!field) return;
    field.classList.remove('saving', 'saved', 'error');
    if (state) field.classList.add(state);
    if (state === 'saved') setTimeout(() => field.classList.remove('saved'), 900);
  }

  function setRowState(rowNo, text, error) {
    const node = document.querySelector(`[data-profile-state="${rowNo}"]`);
    if (!node) return;
    node.textContent = text;
    node.style.color = error ? 'var(--red)' : 'var(--txt3)';
  }

  function validDob(value) {
    if (!value) return true;
    const match = String(value).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return false;
    const date = new Date(+match[3], +match[2] - 1, +match[1]);
    return date.getFullYear() === +match[3] && date.getMonth() === +match[2] - 1 && date.getDate() === +match[1];
  }

  async function saveCell(control) {
    const rowNo = Number(control.dataset.profileRow);
    const col = Number(control.dataset.profileCol);
    const value = String(control.value ?? '').trim();
    const row = PS.rows[rowNo - 1] || (PS.rows[rowNo - 1] = []);
    const before = String(row[col] ?? '');
    if (value === before) return;
    if (col === 5 && !validDob(value)) {
      setFieldState(rowNo, col, 'error');
      setRowState(rowNo, 'Дата должна быть в формате дд.мм.гггг', true);
      control.value = before;
      return;
    }
    control.disabled = true;
    setFieldState(rowNo, col, 'saving');
    setRowState(rowNo, 'Сохраняем…');
    const cell = `${window.crmQuoteSheetName(SHEET)}!${window.crmColumnA1(col)}${rowNo}`;
    try {
      await window.crmSheetsUpdateValues(cell, [[value]]);
      row[col] = value;
      window.crmProfilesSyncLocal(PS.rows);
      window.auditLog?.({
        module: 'profiles', action: 'update', sheet: SHEET, row: rowNo,
        column: PS.headers[col] || FALLBACK_HEADERS[col],
        entityId: `user:${row[0] || rowNo}`, entityLabel: row[1] || row[0] || `Строка ${rowNo}`,
        before, after: value,
      });
      setFieldState(rowNo, col, 'saved');
      setRowState(rowNo, 'Сохранено');
      const card = control.closest('.profile-row-card');
      if (card && (col === 0 || col === 1)) card.querySelector('.profile-row-name').textContent = row[1] || row[0] || `Строка ${rowNo}`;
      if (card && col === 2) card.querySelector('.profile-row-role').textContent = value || 'без роли';
    } catch (error) {
      control.value = before;
      setFieldState(rowNo, col, 'error');
      setRowState(rowNo, error.message || 'Не удалось сохранить', true);
      window.toast?.('Не удалось сохранить профиль', 'e');
    } finally {
      control.disabled = false;
    }
  }

  async function addProfile() {
    if (PS.busy) return;
    const rowIdx = PS.rows.findIndex((row, index) => index > 0 && isEmptyRow(row));
    if (rowIdx < 1) {
      window.toast?.('В USERS нет свободной строки до 50', 'e');
      return;
    }
    const rowNo = rowIdx + 1;
    const values = Array(10).fill('');
    values[2] = PS.options[2]?.[0] || 'crm';
    values[3] = PS.options[3]?.find(v => /^нет$/i.test(v)) || PS.options[3]?.[0] || 'нет';
    values[4] = PS.options[4]?.find(v => /^manager$/i.test(v)) || PS.options[4]?.[0] || 'manager';
    PS.busy = true;
    const button = document.getElementById('profiles-add');
    if (button) button.disabled = true;
    try {
      const templateIdx = PS.rows.findIndex((row, index) => index > 0 && !isEmptyRow(row));
      if (templateIdx > 0) await window.crmSheetsCopyValidation(SHEET, templateIdx + 1, rowNo, 2, 5).catch(() => {});
      await window.crmSheetsUpdateValues(`'USERS'!A${rowNo}:J${rowNo}`, [values]);
      PS.rows[rowIdx] = values.concat((PS.rows[rowIdx] || []).slice(10, 16));
      window.crmProfilesSyncLocal(PS.rows);
      window.auditLog?.({ module: 'profiles', action: 'add', sheet: SHEET, row: rowNo, column: 'A:J', entityId: `user:${rowNo}`, entityLabel: `Новый профиль · строка ${rowNo}`, before: '', after: values });
      render();
      const card = document.querySelector(`[data-profile-card="${rowNo}"]`);
      if (card) { card.open = true; card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      window.toast?.('Профиль добавлен', 's');
    } catch (error) {
      window.toast?.(error.message || 'Не удалось добавить профиль', 'e');
    } finally {
      PS.busy = false;
      if (button) button.disabled = false;
    }
  }

  async function deleteProfile(rowNo) {
    if (PS.busy) return;
    const row = PS.rows[rowNo - 1] || [];
    const label = row[1] || row[0] || `строку ${rowNo}`;
    if (!window.confirm(`Удалить профиль «${label}»? Данные A:J будут очищены, выпадающие списки сохранятся.`)) return;
    PS.busy = true;
    try {
      await window.crmSheetsClearValues(`'USERS'!A${rowNo}:J${rowNo}`);
      PS.rows[rowNo - 1] = Array(10).fill('').concat(row.slice(10, 16));
      window.crmProfilesSyncLocal(PS.rows);
      window.auditLog?.({ module: 'profiles', action: 'delete', sheet: SHEET, row: rowNo, column: 'A:J', entityId: `user:${row[0] || rowNo}`, entityLabel: label, before: row, after: '' });
      render();
      window.toast?.('Профиль удалён', 's');
    } catch (error) {
      window.toast?.(error.message || 'Не удалось удалить профиль', 'e');
    } finally {
      PS.busy = false;
    }
  }

  function bind() {
    document.getElementById('profiles-add')?.addEventListener('click', addProfile);
    document.querySelectorAll('[data-profile-row][data-profile-col]').forEach(control => {
      control.addEventListener('change', () => saveCell(control));
      if (Number(control.dataset.profileCol) === 5) {
        control.addEventListener('input', () => {
          let digits = control.value.replace(/\D/g, '').slice(0, 8);
          if (digits.length > 4) digits = `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
          else if (digits.length > 2) digits = `${digits.slice(0, 2)}.${digits.slice(2)}`;
          control.value = digits;
        });
      }
    });
    document.querySelectorAll('[data-profile-delete]').forEach(button => button.addEventListener('click', () => deleteProfile(Number(button.dataset.profileDelete))));
  }

  async function init(force) {
    const spoiler = document.getElementById('profiles-settings-spoiler');
    if (!spoiler) return;
    const allowed = strictCeo();
    spoiler.hidden = !allowed;
    if (!allowed) return;
    if (PS.loaded && !force) { render(); return; }
    const body = document.getElementById('profiles-settings-body');
    if (body) body.innerHTML = '<div class="cfg-placeholder">Загрузка профилей…</div>';
    try {
      const rows = await window.api(SHEET, RANGE, { force: !!force, priority: 10 });
      PS.rows = normalizeRows(rows);
      PS.headers = FALLBACK_HEADERS.map((fallback, col) => String(PS.rows[0]?.[col] || fallback));
      await loadOptions();
      PS.loaded = true;
      render();
    } catch (error) {
      if (body) body.innerHTML = `<div class="profiles-error">${esc(error.message || 'Не удалось загрузить USERS')}</div>`;
    }
  }

  window.initProfilesSettings = init;
})();
