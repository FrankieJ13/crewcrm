/* ═══════════════════════════════════════════════════════════════════════════
 * КАРТОТЕКА (Traffic) — единая точка API к Data Hub Web App (read-only).
 * Контракт: POST text/plain (simple request, без preflight — ТЗ §12),
 *   body {action, authToken, payload}; ответ {ok, requestId, data, meta}
 *   либо {ok:false, requestId, error:{code,message}}.
 * authToken — только в теле (никогда в URL). Токен берём из существующего
 * Google OAuth приложения (S.token). Новый OAuth НЕ создаём.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const CACHE = { bootstrap: null, filters: null };

  function _url() { try { return (typeof CFG !== 'undefined' && CFG.TRAFFIC_WEBAPP_URL) || ''; } catch (_) { return ''; } }
  function _token() {
    try { if (typeof S !== 'undefined' && S && S.token) return S.token; } catch (_) {}
    try { return localStorage.getItem('crm_tok') || ''; } catch (_) { return ''; }
  }

  const ERR_MSG = {
    ACCESS_DENIED:       'Нет доступа к данным трафика',
    INVALID_PHONE_INPUT: 'Проверьте номер телефона',
    NOT_FOUND:           'Запись не найдена',
    BAD_REQUEST:         'Некорректный запрос',
    CONFIG_ERROR:        'Сервис трафика не настроен',
    UNKNOWN_ACTION:      'Действие пока недоступно',
    SCHEMA_OUTDATED:     'Трафик обновляется. Требуется новая версия приложения',
    INTERNAL:            'Сервис трафика временно недоступен. Повторить',
    NETWORK:             'Сервис трафика временно недоступен. Повторить',
    NO_URL:              'Картотека ещё не подключена',
    NO_TOKEN:            'Нет авторизации',
  };
  function parseApiError(e) { return ERR_MSG[(e && e.code) || 'INTERNAL'] || ERR_MSG.INTERNAL; }
  function _err(code, message) { const e = new Error(message || code); e.code = code; return e; }

  async function _call(action, payload, opts) {
    opts = opts || {};
    const url = _url();
    if (!url) throw _err('NO_URL');
    const token = _token();
    if (!token) throw _err('NO_TOKEN');

    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, authToken: token, payload: payload || {} }),
        signal: opts.signal,
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw _err('NETWORK');
    }

    let json = null;
    try { json = await resp.json(); } catch (_) { throw _err('INTERNAL'); }
    if (!json || json.ok !== true) {
      const c = (json && json.error && json.error.code) || 'INTERNAL';
      throw _err(c, json && json.error ? json.error.message : '');
    }
    return json;
  }

  async function bootstrap(force) {
    if (CACHE.bootstrap && !force) return CACHE.bootstrap;
    const r = await _call('bootstrap', {});
    CACHE.bootstrap = r.data || null;
    if (CACHE.bootstrap && CACHE.bootstrap.filters) CACHE.filters = CACHE.bootstrap.filters;
    return CACHE.bootstrap;
  }
  async function archiveList(payload, signal) { return (await _call('archive.list', payload, { signal })).data; }
  async function visitGet(key, signal) { return (await _call('visit.get', { traffic_record_key: key }, { signal })).data; }
  async function filtersGet() {
    if (CACHE.filters) return CACHE.filters;
    const d = (await _call('filters.get', {})).data;
    CACHE.filters = d || {};
    return CACHE.filters;
  }
  async function clientLookup(phone, signal) { return (await _call('client.lookup', { phone }, { signal })).data; }
  async function clientGet(clientKey, signal) { return (await _call('client.get', { client_key: clientKey }, { signal })).data; }

  function isConfigured() { return !!_url(); }
  function clearCache() { CACHE.bootstrap = null; CACHE.filters = null; }

  window.TrafficAPI = { bootstrap, archiveList, visitGet, filtersGet, clientLookup, clientGet, parseApiError, isConfigured, clearCache };
})();
