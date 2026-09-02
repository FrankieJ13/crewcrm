/* Web Worker для «Пеших сделок»: парсинг большого CSV + матчинг вне основного
 * потока (файл amoCRM бывает 40+ МБ → парсинг ~5с блокировал бы UI). Использует
 * чистую логику из pedestrian-deals.js. Строки кешируются: смена периода/маппинга
 * не требует повторного парсинга. */
try { importScripts('./pedestrian-deals.js?v=2'); } catch (e) { /* сообщим при первом сообщении */ }

let ROWS = null;

self.onmessage = function (e) {
  const m = e.data || {};
  if (typeof PDLib === 'undefined') { self.postMessage({ type: 'error', error: 'pedestrian-deals.js не загружен в воркере' }); return; }
  try {
    if (m.cmd === 'load') {
      // ArrayBuffer передан zero-copy (transfer) → декодируем и парсим в воркере,
      // главный поток не блокируется чтением/парсингом 40+ МБ.
      const text = m.buffer ? new TextDecoder('utf-8').decode(m.buffer) : (m.text || '');
      ROWS = PDLib.parseCSV(text);
      self.postMessage({ type: 'loaded', header: (ROWS && ROWS[0]) || [], rowCount: ROWS ? Math.max(0, ROWS.length - 1) : 0 });
      return;
    }
    if (m.cmd === 'analyze') {
      if (!ROWS || ROWS.length < 2) { self.postMessage({ type: 'report', error: 'Пустой файл.' }); return; }
      const cm = m.colMap || PDLib.detectColumns(ROWS[0]);
      const val = PDLib.validateColumns(cm);
      if (!val.ok) { self.postMessage({ type: 'report', error: 'MISSING', missing: val.missing, cm }); return; }
      const deals = PDLib.buildDeals(ROWS, cm);
      const out = PDLib.analyze(deals, m.period || {}, { phoneCols: cm.phoneIdx.length });
      self.postMessage({ type: 'report', results: out.results, diag: out.diag, cm });
      return;
    }
    if (m.cmd === 'free') { ROWS = null; }
  } catch (err) { self.postMessage({ type: 'error', error: String((err && err.message) || err) }); }
};
