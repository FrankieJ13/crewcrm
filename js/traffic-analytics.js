(function(){
  const STORAGE = {
    rows: 'crmTrafficParsedRows',
    mapping: 'crmTrafficColumnMapping',
    fields: 'crmTrafficAvailableFields',
    widgets: 'crmTrafficAdvancedWidgets',
    meta: 'crmTrafficLastImportMeta',
    tab: 'crmTrafficActiveTab',
    draft: 'crmTrafficWidgetDraft',
    basePeriods: 'crmTrafficBasePeriods'
  };

  const PROCESS_STEPS = [
    'Чтение файла',
    'Определение колонок',
    'Парсинг дат',
    'Определение типов полей',
    'Построение метрик',
    'Подготовка вкладок'
  ];

  // ── IndexedDB для больших датасетов (localStorage ~5МБ мало для 18МБ CSV) ──
  const IDB = { name: 'crmTraffic', store: 'kv', key: 'rows' };
  function idbOpen() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('no-idb'));
      const req = indexedDB.open(IDB.name, 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore(IDB.store); } catch(_){} };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb-open'));
    });
  }
  async function idbSet(value) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB.store, 'readwrite');
      tx.objectStore(IDB.store).put(value, IDB.key);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  async function idbGet() {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB.store, 'readonly');
      const r = tx.objectStore(IDB.store).get(IDB.key);
      r.onsuccess = () => { db.close(); resolve(r.result || null); };
      r.onerror = () => { db.close(); reject(r.error); };
    });
  }
  async function idbDel() {
    try {
      const db = await idbOpen();
      await new Promise((resolve) => { const tx = db.transaction(IDB.store, 'readwrite'); tx.objectStore(IDB.store).delete(IDB.key); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); resolve(); }; });
    } catch(_){}
  }

  const FIELD_ALIASES = {
    createdAt: ['Дата создания сделки','Дата создания','created_at','date_create'],
    closedAt: ['Дата закрытия','Дата закрытия сделки','closed_at'],
    source: ['Источник обращения','utm_source','UTM Source','Источник old','Source phone','from','referrer'],
    tags: ['Теги','Теги сделки','tags'],
    stage: ['Этап сделки','Статус','stage','pipeline_stage'],
    pipeline: ['Воронка','pipeline'],
    lossReason: ['Причина закрытия карточки','Причина закрытия','loss_reason'],
    won: ['Успешное закрытие карточки','Успешно реализовано','won','is_won'],
    responsible: ['Ответственный','Менеджер','responsible_user'],
    city: ['Город','REGION TIME - Область или город','Город проживания клиента','Город Сайт','Город Ройстат','Город поддомен'],
    form: ['Форма','Formname','form_name'],
    task: ['Задача','Задачи','task','todo','has_task']
  };

  const FORMAT_LABELS = {
    rollingTrend: 'Скользящий тренд',
    trend: 'Тренд',
    histogram: 'Гистограмма',
    ranking: 'Рейтинг / топ',
    categoryCompare: 'Сравнение категорий',
    shareStructure: 'Доля / структура',
    heatmap: 'Тепловая карта',
    kpiSummary: 'KPI-сводка',
    tableDetail: 'Таблица / детализация',
    comboWidget: 'Комбинированный виджет',
    wordCloud: 'Анаграмма / облако значений'
  };

  const FORMAT_HELP = {
    rollingTrend: ['Сглаженная динамика', 'Для нагрузки по датам, источникам, ответственным и пиков.'],
    trend: ['Обычная динамика', 'Для быстрых изменений по дням, неделям или часам.'],
    histogram: ['Распределение', 'Для сроков, часов, сумм и частотных диапазонов.'],
    ranking: ['Топ значений', 'Для городов, ответственных, источников, этапов и форм.'],
    categoryCompare: ['Сравнение категорий', 'Для понятного сравнения сильных и слабых групп.'],
    shareStructure: ['Структура объема', 'Для долей источников, этапов, тегов и причин.'],
    heatmap: ['Дни и часы', 'Для поиска перегруженных интервалов.'],
    kpiSummary: ['Главная цифра', 'Для управленческого вывода без сложного графика.'],
    tableDetail: ['Детализация', 'Для сверки и просмотра топ-строк.'],
    comboWidget: ['Комбинация', 'Для связки тренда и рейтинга в одном блоке.'],
    wordCloud: ['Частотные слова', 'Для тегов, причин, форм и текстовых полей.']
  };

  const ROLE_LABELS = {
    date: 'Дата',
    metric: 'Метрика',
    groupBy: 'Группировка',
    filter: 'Фильтр',
    splitBy: 'Разрез',
    label: 'Подпись',
    sortBy: 'Сортировка',
    tooltip: 'Подсказка',
    ignore: 'Не участвует'
  };

  const PERIOD_LABELS = {
    all: 'Все данные',
    today: 'Сегодня',
    currentWeek: 'Текущая неделя',
    currentMonth: 'Текущий месяц',
    prevWeek: 'Прошлая неделя',
    prevMonth: 'Прошлый месяц'
  };

  const BASE_PERIOD_LABELS = {
    day: 'День',
    week: 'Неделя',
    month: 'Месяц'
  };

  const BASE_WIDGET_DEFAULT_PERIODS = {
    leadTrend: 'week',
    sourceShare: 'month',
    cities: 'week',
    hours: 'week',
    stages: 'month',
    lossReasons: 'month',
    lifetime: 'month',
    responsible: 'week'
  };

  const state = {
    rows: null,
    fields: null,
    mapping: null,
    meta: null,
    widgets: [],
    basePeriods: { ...BASE_WIDGET_DEFAULT_PERIODS },
    activeTab: 'base',
    processing: null,
    storageWarning: '',
    // Глобальные фильтры базового таба (ТЗ §6) + режим виджета «Срок жизни»
    // source/city/responsible/success — массивы (мультивыбор). period: all|today|week|month|range.
    tzFilters: { period: 'all', dateFrom: '', dateTo: '', source: [], city: [], responsible: [], success: [] },
    tzLifetimeMode: 'all',
    tzTrendMode: 'auto', // виджет «Трафик»: auto = по периоду
    tzView: { base: 'detailed', advanced: 'detailed' }, // глобальный режим по табам
    tzCardMode: {} // персональные override режима по ключу виджета

  };

  window.crmTrafficState = state;

  function esc(v) {
    if (typeof escapeHtml === 'function') return escapeHtml(v);
    return String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function notify(msg, type) {
    if (typeof toast === 'function') toast(msg, type || 'i');
  }

  function canViewTrafficAnalytics() {
    const u = typeof findUserInSheet === 'function' ? findUserInSheet() : null;
    return !!(u && typeof isCeoLike === 'function' && isCeoLike(u.role));
  }

  window.updateTrafficDockAccess = function updateTrafficDockAccess() {
    const wrap = document.getElementById('dock-analytics-wrap');
    if (!wrap) return;
    wrap.style.display = canViewTrafficAnalytics() ? '' : 'none';
  };

  window.dockAnalyticsToggle = function dockAnalyticsToggle(e) {
    if (e) e.stopPropagation();
    if (!canViewTrafficAnalytics()) return;
    if (typeof openDockPopup === 'function') openDockPopup('dock-analytics-popup');
  };

  window.dockAnalytics = function dockAnalytics(tab) {
    if (tab === 'traffic') return openTrafficAnalytics();
    if (tab === 'analiz' && typeof openAnaliz === 'function') return openAnaliz();
    if (tab === 'export' && typeof openExportPage === 'function') return openExportPage();
    if (tab === 'repeats' && typeof openRepeatSearchPage === 'function') return openRepeatSearchPage();
    if (tab === 'sverka' && typeof openVisitReconciliation === 'function') return openVisitReconciliation();
  };

  window.openTrafficAnalytics = function openTrafficAnalytics() {
    if (typeof closeAllDockPopups === 'function') closeAllDockPopups();
    if (typeof showScr === 'function') showScr('traffic');
    if (typeof dockSetActive === 'function') dockSetActive('analytics');
    renderTrafficAnalytics();
    if (typeof updateFirebasePage === 'function') updateFirebasePage();
  };

  window.renderTrafficAnalytics = function renderTrafficAnalytics() {
    updateTrafficDockAccess();
    const root = document.getElementById('c-traffic');
    if (!root) return;
    if (!canViewTrafficAnalytics()) {
      root.innerHTML = `
        <section class="traffic-page">
          <div class="traffic-hero">
            <p class="traffic-kicker">Аналитика</p>
            <h1 class="traffic-title">Трафик</h1>
            <p class="traffic-subtitle">Раздел доступен только руководителям с ролью CEO или ROP.</p>
          </div>
        </section>`;
      return;
    }
    loadTrafficFromStorage();
    if (state.processing) {
      root.innerHTML = renderProcessing();
      return;
    }
    // Большой датасет в IndexedDB — строки грузятся асинхронно
    if (!state.rows && state.meta && state.meta.rowsInIdb && !state._idbTried) {
      root.innerHTML = `<section class="traffic-page"><div class="traffic-hero"><h1 class="traffic-title">Трафик</h1><p class="traffic-subtitle">Загружаю сохранённые данные…</p></div></section>`;
      hydrateRowsFromIdb();
      return;
    }
    if (!state.rows || !state.fields || !state.meta) {
      root.innerHTML = renderImport();
      bindImport();
      return;
    }
    root.innerHTML = renderDashboard();
    bindDashboard();
  };

  function loadTrafficFromStorage() {
    state.basePeriods = { ...BASE_WIDGET_DEFAULT_PERIODS, ...safeJson(localStorage.getItem(STORAGE.basePeriods), {}) };
    state.tzView = { base: 'detailed', advanced: 'detailed', ...safeJson(localStorage.getItem('crmTrafficView'), {}) };
    state.tzCardMode = safeJson(localStorage.getItem('crmTrafficCardMode'), {}) || {};
    if (state.rows && state.fields && state.meta) return;
    state.activeTab = localStorage.getItem(STORAGE.tab) || 'base';
    state.widgets = safeJson(localStorage.getItem(STORAGE.widgets), []);
    const rows = safeJson(localStorage.getItem(STORAGE.rows), null);
    const fields = safeJson(localStorage.getItem(STORAGE.fields), null);
    const mapping = safeJson(localStorage.getItem(STORAGE.mapping), null);
    const meta = safeJson(localStorage.getItem(STORAGE.meta), null);
    // Поля/маппинг/мета грузим всегда (нужны и для idb-варианта)
    if (Array.isArray(fields) && meta) {
      state.fields = fields;
      const savedMapping = Object.fromEntries(Object.entries(mapping || {}).filter(([, value]) => value));
      const detectedMapping = detectColumns(fields);
      state.mapping = { ...detectedMapping, ...savedMapping };
      if (detectedMapping.source && fields.some(f => normHeader(f.originalName) === normHeader('Источник обращения'))) {
        state.mapping.source = detectedMapping.source;
      }
      state.meta = meta;
      if (Array.isArray(rows)) state.rows = rows;       // быстрый путь — localStorage
    }
  }

  // Async-гидрация строк из IndexedDB (большие датасеты). Вызывается из render.
  async function hydrateRowsFromIdb() {
    if (state._idbTried) return;
    state._idbTried = true;
    try {
      const rows = await idbGet();
      if (Array.isArray(rows) && rows.length) {
        state.rows = rows;
        renderTrafficAnalytics();
      } else {
        renderTrafficAnalytics();
      }
    } catch (_) { renderTrafficAnalytics(); }
  }

  function safeJson(text, fallback) {
    try { return text ? JSON.parse(text) : fallback; } catch(_) { return fallback; }
  }

  function renderImport() {
    return `
      <section class="traffic-page">
        <div class="traffic-top">
          <h1 class="traffic-title">Трафик</h1>
          <p class="traffic-subtitle">Аналитика входящего трафика и лидогенерации на основе CSV-выгрузки из amoCRM.</p>
        </div>
        <div class="traffic-import-card">
          <div class="traffic-import-head">
            <h2>Импортируйте raw CSV из amoCRM</h2>
            <p class="traffic-muted">Файл должен быть выгружен в формате CSV с разделителем запятая и кодировкой UTF-8.</p>
          </div>
          <label class="traffic-dropzone" id="traffic-dropzone">
            <input class="traffic-file-input" id="traffic-file" type="file" accept=".csv,text/csv">
            <span class="traffic-upload-icon">
              <svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M7 8l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>
            </span>
            <strong>Загрузите raw CSV из amoCRM</strong>
            <span class="traffic-muted">Перетащите файл сюда или выберите его на устройстве.</span>
            <span class="traffic-muted">Первая строка должна содержать заголовки столбцов.</span>
            <span class="traffic-btn primary">Выбрать CSV</span>
          </label>
          <button class="traffic-requirements" type="button">Посмотреть требования к файлу</button>
          <p class="traffic-note">После импорта появятся вкладки «Базовый» и «Расширенный». Файл обрабатывается локально.</p>
        </div>
      </section>`;
  }

  function bindImport() {
    const file = document.getElementById('traffic-file');
    const drop = document.getElementById('traffic-dropzone');
    const req = document.querySelector('.traffic-requirements');
    if (!file || !drop) return;
    file.onchange = () => file.files?.[0] && importTrafficCsv(file.files[0]);
    if (req) {
      req.onclick = () => alert('CSV: первая строка — заголовки, разделитель — запятая, кодировка — UTF-8. Поддерживаются кавычки, переносы строк внутри кавычек и дубли заголовков.');
    }
    ['dragenter','dragover'].forEach(evt => drop.addEventListener(evt, e => {
      e.preventDefault();
      drop.classList.add('drag');
    }));
    ['dragleave','drop'].forEach(evt => drop.addEventListener(evt, e => {
      e.preventDefault();
      drop.classList.remove('drag');
    }));
    drop.addEventListener('drop', e => {
      const f = e.dataTransfer?.files?.[0];
      if (f) importTrafficCsv(f);
    });
  }

  async function importTrafficCsv(file) {
    if (!file || !/\.csv$/i.test(file.name)) {
      notify('Выберите CSV-файл.', 'e');
      return;
    }
    if (file.size > 60 * 1024 * 1024) {
      notify('Файл больше 60 МБ — слишком большой даже для IndexedDB.', 'e');
      return;
    }
    state.processing = { fileName: file.name, fileSize: file.size, step: 0, rows: 0, cols: 0 };
    renderTrafficAnalytics();
    try {
      await advanceProcessing(0);
      const text = await readFileText(file);
      await advanceProcessing(1);
      const parsed = parseCsv(text);
      if (!parsed.headers.length) throw new Error('В первой строке CSV не найдены заголовки столбцов.');
      state.processing.rows = parsed.rows.length;
      state.processing.cols = parsed.fields.length;
      await advanceProcessing(2);
      const fields = detectFieldTypes(parsed.fields, parsed.rows);
      const mapping = detectColumns(fields);
      await advanceProcessing(3);
      const meta = buildMeta(file, parsed.rows, fields, mapping);
      await advanceProcessing(4);
      state.rows = parsed.rows;
      state.fields = fields;
      state.mapping = mapping;
      state.meta = meta;
      state.activeTab = 'base';
      await saveTrafficData();
      await advanceProcessing(5);
      state.processing = null;
      renderTrafficAnalytics();
      notify('CSV успешно импортирован', 's');
    } catch (e) {
      state.processing = null;
      clearTrafficMemory(false);
      renderTrafficAnalytics();
      notify(e.message || 'Не удалось прочитать CSV. Проверьте формат файла.', 'e');
    }
  }

  function advanceProcessing(step) {
    state.processing.step = step;
    renderTrafficAnalytics();
    return new Promise(resolve => setTimeout(resolve, 80));
  }

  function readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Не удалось прочитать CSV. Проверьте формат файла.'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsText(file, 'UTF-8');
    });
  }

  function renderProcessing() {
    const p = state.processing;
    const pct = Math.min(100, Math.round(((p.step + 1) / PROCESS_STEPS.length) * 100));
    return `
      <section class="traffic-page">
        <div class="traffic-top">
          <h1 class="traffic-title">Трафик</h1>
          <p class="traffic-subtitle">Аналитика входящего трафика и лидогенерации</p>
        </div>
        <div class="traffic-tabs">
          <button class="traffic-tab active" type="button">Базовый</button>
          <button class="traffic-tab" type="button">Расширенный</button>
        </div>
        <h2 class="traffic-section-title">Базовый · Трафик</h2>
        <div class="traffic-processing traffic-card">
          <div class="traffic-process-layout">
            <div class="traffic-progress-ring" style="--traffic-progress:${pct * 3.6}deg">
              <strong>${pct}%</strong>
              <span>обработка...</span>
            </div>
            <div class="traffic-process-copy">
              <p><strong>${esc(p.fileName)}</strong></p>
              <p class="traffic-muted">${p.rows ? `${p.rows} строк · ${p.cols} колонок` : 'Обрабатываем файл...'}</p>
              <div class="traffic-process-list">
                ${PROCESS_STEPS.map((s, i) => `
                  <div class="traffic-process-step">
                    <span class="mark">${i < p.step ? '✓' : i === p.step ? '◌' : '○'}</span>
                    <span>${esc(s)}</span>
                  </div>`).join('')}
              </div>
            </div>
          </div>
          <div class="traffic-progress-line"><span style="width:${pct}%"></span></div>
        </div>
        <div class="traffic-skeleton wide"></div>
        <div class="traffic-skeleton-grid">
          <div class="traffic-skeleton"></div>
          <div class="traffic-skeleton"></div>
        </div>
      </section>`;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];
      if (quoted) {
        if (ch === '"' && next === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
        continue;
      }
      if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else if (ch !== '\r') {
        cell += ch;
      }
    }
    row.push(cell);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    const headerRow = rows.shift() || [];
    const fields = normalizeHeaders(headerRow);
    const objects = rows
      .filter(r => r.some(v => String(v || '').trim() !== ''))
      .map(r => {
        const obj = {};
        fields.forEach(f => { obj[f.normalizedName] = r[f.index] ?? ''; });
        return obj;
      });
    return { headers: headerRow, fields, rows: objects };
  }

  function normalizeHeaders(headers) {
    const counts = new Map();
    return headers.map((name, index) => {
      const base = String(name || `Колонка ${index + 1}`).trim() || `Колонка ${index + 1}`;
      const count = (counts.get(base) || 0) + 1;
      counts.set(base, count);
      return {
        id: `field_${index}`,
        originalName: base,
        normalizedName: count === 1 ? base : `${base} #${count}`,
        index
      };
    });
  }

  function detectFieldTypes(fields, rows) {
    return fields.map(f => {
      const values = rows.map(r => r[f.normalizedName]).filter(v => String(v || '').trim()).slice(0, 80);
      const type = detectType(values);
      const unique = new Set(values.map(v => String(v).trim())).size;
      return { ...f, type, example: values[0] || '', uniqueCount: unique };
    });
  }

  function detectType(values) {
    if (!values.length) return 'unknown';
    const sample = values.slice(0, Math.min(values.length, 25));
    const ok = fn => sample.filter(fn).length / sample.length >= .72;
    if (ok(v => parseDate(v)?.hasTime)) return 'datetime';
    if (ok(v => !!parseDate(v))) return 'date';
    if (ok(v => /%$/.test(String(v).trim()) && !Number.isNaN(parseNum(v)))) return 'percent';
    if (ok(v => /₽|руб|млн|тыс/i.test(String(v)) && !Number.isNaN(parseNum(v)))) return 'money';
    if (ok(v => !Number.isNaN(parseNum(v)))) return 'number';
    if (ok(v => /^(да|нет|true|false|0|1)$/i.test(String(v).trim()))) return 'boolean';
    if (ok(v => /[,;|]/.test(String(v)))) return 'tags';
    const unique = new Set(sample.map(v => String(v).trim())).size;
    if (unique <= Math.max(8, sample.length * .55)) return 'category';
    return 'string';
  }

  function detectColumns(fields) {
    const byName = new Map();
    fields.forEach(f => {
      byName.set(normHeader(f.originalName), f.normalizedName);
      byName.set(normHeader(f.normalizedName), f.normalizedName);
    });
    const mapping = {};
    Object.entries(FIELD_ALIASES).forEach(([key, aliases]) => {
      const normalizedAliases = aliases.map(normHeader);
      const exact = normalizedAliases.find(a => byName.has(a));
      if (exact) {
        mapping[key] = byName.get(exact);
        return;
      }
      const fuzzy = fields.find(f => {
        const names = [f.originalName, f.normalizedName].map(normHeader);
        return normalizedAliases.some(alias => alias.length >= 6 && names.some(name => name.includes(alias) || alias.includes(name)));
      });
      if (fuzzy) mapping[key] = fuzzy.normalizedName;
    });
    return mapping;
  }

  function normHeader(v) {
    return norm(v).replace(/\s+#\d+$/, '');
  }

  function norm(v) {
    return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function buildMeta(file, rows, fields, mapping) {
    if (!mapping.createdAt) {
      const dateField = fields.find(f => f.type === 'datetime' || f.type === 'date');
      if (dateField) mapping.createdAt = dateField.normalizedName;
    }
    const dates = rows.map(r => parseDate(r[mapping.createdAt])).filter(Boolean).map(d => d.date);
    const minDate = dates.length ? new Date(Math.min(...dates)) : null;
    const maxDate = dates.length ? new Date(Math.max(...dates)) : null;
    return {
      fileName: file.name,
      importedAt: new Date().toISOString(),
      rows: rows.length,
      cols: fields.length,
      periodFrom: minDate ? minDate.toISOString() : null,
      periodTo: maxDate ? maxDate.toISOString() : null,
      storageWarning: ''
    };
  }

  async function saveTrafficData() {
    localStorage.setItem(STORAGE.tab, state.activeTab || 'base');
    localStorage.setItem(STORAGE.widgets, JSON.stringify(state.widgets || []));
    localStorage.setItem(STORAGE.fields, JSON.stringify(state.fields));
    localStorage.setItem(STORAGE.mapping, JSON.stringify(state.mapping));
    localStorage.setItem(STORAGE.meta, JSON.stringify(state.meta));
    let rowsInIdb = false;
    try {
      const rowsJson = JSON.stringify(state.rows);
      if (rowsJson.length < 3_500_000) {
        // Маленький датасет — быстрый путь через localStorage
        localStorage.setItem(STORAGE.rows, rowsJson);
        state.storageWarning = '';
        idbDel();
      } else {
        // Большой датасет — IndexedDB (квота сотни МБ)
        localStorage.removeItem(STORAGE.rows);
        try {
          await idbSet(state.rows);
          rowsInIdb = true;
          state.storageWarning = '';
        } catch (e) {
          state.storageWarning = 'Файл обработан, но не сохранён: ' + (e.message || 'нет места в браузере') + '. Доступен до перезагрузки.';
        }
      }
    } catch (_) {
      localStorage.removeItem(STORAGE.rows);
      try { await idbSet(state.rows); rowsInIdb = true; state.storageWarning = ''; }
      catch (e) { state.storageWarning = 'Файл обработан, но не сохранён в браузере. Доступен до перезагрузки.'; }
    }
    if (state.meta) {
      state.meta.storageWarning = state.storageWarning;
      state.meta.rowsInIdb = rowsInIdb;
      localStorage.setItem(STORAGE.meta, JSON.stringify(state.meta));
    }
  }

  function renderDashboard() {
    const tab = state.activeTab === 'advanced' ? 'advanced' : 'base';
    const sectionTitle = tab === 'advanced' ? 'Редактор виджетов' : 'Аналитика CRM';
    return `
      <section class="traffic-page">
        <div class="traffic-top">
          <div class="traffic-top-copy">
            <div class="traffic-title-row">
              <h2 class="traffic-section-title traffic-head-title">${sectionTitle}</h2>
              <div class="traffic-head-actions">
                <button class="traffic-icon-btn traffic-refresh-btn" id="traffic-refresh-head" type="button" aria-label="Обновить" title="Обновить">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v5h-5"/></svg>
                </button>
                <button class="traffic-icon-btn traffic-clear-btn" id="traffic-clear-csv-head" type="button" aria-label="Очистить импортированный CSV" title="Очистить CSV">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>
                </button>
                <button class="traffic-info-btn" id="traffic-import-info" type="button" aria-label="Справка и словарь">!</button>
                <div class="traffic-seg" role="tablist" aria-label="Режим аналитики">
                  <span class="traffic-seg-thumb ${tab === 'advanced' ? 'right' : 'left'}"></span>
                  <button class="traffic-seg-btn ${tab === 'base' ? 'active' : ''}" data-traffic-tab="base" type="button" aria-label="Стандартные виджеты">
                    <img src="${trafficTabIcon('base')}" alt="" onerror="this.style.display='none'">
                  </button>
                  <button class="traffic-seg-btn ${tab === 'advanced' ? 'active' : ''}" data-traffic-tab="advanced" type="button" aria-label="Редактор виджетов">
                    <img src="${trafficTabIcon('advanced')}" alt="" onerror="this.style.display='none'">
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        ${tab === 'advanced' ? renderAdvancedTab() : renderBaseTab()}
      </section>
      <div class="traffic-modal" id="traffic-modal"></div>`;
  }

  function trafficTabIcon(tab) {
    const body = document.body?.classList;
    if (body?.contains('fluent')) {
      return tab === 'base' ? './logos/Fluent/FluentColor-Base.svg' : './logos/Fluent/FluentColor-Extended.svg';
    }
    if (body?.contains('cosmic')) {
      return tab === 'base' ? './logos/cosmic/cosmoc-base.svg' : './logos/cosmic/cosmic-extended.svg';
    }
    return tab === 'base' ? './logos/default/default-base.svg' : './logos/default/default-extended.svg';
  }

  function bindDashboard() {
    document.querySelectorAll('[data-traffic-tab]').forEach(btn => {
      btn.onclick = () => {
        state.activeTab = btn.dataset.trafficTab;
        localStorage.setItem(STORAGE.tab, state.activeTab);
        renderTrafficAnalytics();
      };
    });
    document.getElementById('traffic-clear-csv')?.addEventListener('click', showClearModal);
    document.getElementById('traffic-clear-csv-head')?.addEventListener('click', showClearModal);
    document.getElementById('traffic-refresh-head')?.addEventListener('click', e => {
      e.currentTarget.classList.add('spin');
      setTimeout(() => renderTrafficAnalytics(), 360);
    });
    document.getElementById('traffic-import-info')?.addEventListener('click', showTrafficImportInfo);
    document.getElementById('traffic-export-widgets')?.addEventListener('click', exportWidgets);
    document.getElementById('traffic-import-widgets')?.addEventListener('click', () => document.getElementById('traffic-import-file')?.click());
    document.getElementById('traffic-import-file')?.addEventListener('change', e => e.target.files?.[0] && importWidgets(e.target.files[0]));
    document.getElementById('traffic-add-widget')?.addEventListener('click', showWidgetBuilder);
    document.querySelectorAll('[data-delete-traffic-widget]').forEach(btn => {
      btn.onclick = () => deleteWidget(btn.dataset.deleteTrafficWidget);
    });
    document.querySelectorAll('[data-traffic-custom-widget]').forEach(card => {
      card.onclick = () => showCustomWidgetModal(card.dataset.trafficCustomWidget);
    });
    document.querySelectorAll('[data-traffic-period]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const type = btn.dataset.trafficPeriodWidget;
        state.basePeriods[type] = btn.dataset.trafficPeriod;
        localStorage.setItem(STORAGE.basePeriods, JSON.stringify(state.basePeriods));
        renderTrafficAnalytics();
      };
    });
    document.querySelectorAll('[data-traffic-base-widget]').forEach(card => {
      card.onclick = () => showBaseWidgetModal(card.dataset.trafficBaseWidget);
    });
    bindTzBase();
  }

  function renderBaseTab() {
    // Новый базовый таб по ТЗ «Трафик» — строгие колонки amoCRM.
    return renderTzBase();
  }

  function buildBaseMetrics(periodKey) {
    return getPeriodDataset(periodKey);
  }

  function getDatedRows() {
    const createdKey = state.mapping.createdAt;
    return state.rows.map(r => ({ row: r, created: parseDate(r[createdKey])?.date })).filter(x => x.created);
  }

  function getPeriodDataset(periodKey) {
    const withDates = getDatedRows();
    const now = new Date();
    let from;
    let prevFrom;
    let prevTo;
    let mode = 'day';
    if (periodKey === 'day') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      prevFrom = new Date(from); prevFrom.setDate(prevFrom.getDate() - 1);
      prevTo = new Date(from); prevTo.setMilliseconds(-1);
      mode = 'hour';
    } else if (periodKey === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevTo = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      mode = 'day';
    } else {
      from = startOfWeek(now);
      prevFrom = new Date(from); prevFrom.setDate(prevFrom.getDate() - 7);
      prevTo = new Date(from); prevTo.setMilliseconds(-1);
      mode = 'weekday';
    }
    const rows = withDates.filter(x => x.created >= from && x.created <= now);
    const prevRows = withDates.filter(x => x.created >= prevFrom && x.created <= prevTo);
    return {
      periodKey,
      label: BASE_PERIOD_LABELS[periodKey] || 'Неделя',
      rows,
      prevRows,
      mode,
      trend: makeTrend(rows, prevRows, mode)
    };
  }

  function basePeriod(type) {
    return state.basePeriods[type] || BASE_WIDGET_DEFAULT_PERIODS[type] || 'week';
  }

  function mappedField(key) {
    if (state.mapping?.[key]) return state.mapping[key];
    const aliases = FIELD_ALIASES[key] || [];
    const found = (state.fields || []).find(f => {
      const names = [f.originalName, f.normalizedName].map(normHeader);
      return aliases.map(normHeader).some(alias => names.includes(alias));
    });
    return found?.normalizedName || '';
  }

  function renderBaseWidgetShell(type, title, body, opts = {}) {
    const active = basePeriod(type);
    return `
      <article class="traffic-widget traffic-base-widget ${opts.wide ? 'wide' : ''} ${opts.className || ''}" data-traffic-base-widget="${esc(type)}">
        <div class="traffic-base-head">
          <h3>${esc(title)}</h3>
          ${renderBasePeriodControls(type, active)}
        </div>
        ${body}
      </article>`;
  }

  function renderBasePeriodControls(type, active) {
    const items = type === 'leadTrend'
      ? [['week','Н'],['month','М']]
      : [['day','Д'],['week','Н'],['month','М']];
    const safeActive = type === 'leadTrend' && active === 'day' ? 'week' : active;
    return `<div class="traffic-period-pills" aria-label="Период">
      ${items.map(([value, label]) => `
        <button class="${safeActive === value ? 'active' : ''}" data-traffic-period-widget="${esc(type)}" data-traffic-period="${value}" type="button">${label}</button>
      `).join('')}
    </div>`;
  }

  function renderLeadTrendWidget(type) {
    const period = basePeriod(type) === 'month' ? 'month' : 'week';
    const data = buildLeadTrendMetrics(period);
    const body = `
      ${renderLeadMarketChart(data)}`;
    return renderBaseWidgetShell(type, 'Все сделки', body, { wide: true, className: 'traffic-leads-widget traffic-market-widget' });
  }

  function buildLeadTrendMetrics(periodKey) {
    const withDates = getDatedRows();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let dates = [];
    let prevFrom;
    let prevTo;
    if (periodKey === 'month') {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      for (let d = new Date(from); d <= today; d.setDate(d.getDate() + 1)) dates.push(new Date(d));
      prevFrom = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      prevTo = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
    } else {
      const end = new Date(today); end.setDate(end.getDate() - 1);
      const from = new Date(end); from.setDate(from.getDate() - 6);
      for (let d = new Date(from); d <= end; d.setDate(d.getDate() + 1)) dates.push(new Date(d));
      prevFrom = new Date(from); prevFrom.setDate(prevFrom.getDate() - 7);
      prevTo = new Date(from); prevTo.setMilliseconds(-1);
    }
    const from = dates[0] || today;
    const to = new Date(dates[dates.length - 1] || today); to.setHours(23, 59, 59, 999);
    const rows = withDates.filter(x => x.created >= from && x.created <= to);
    const prevRows = withDates.filter(x => x.created >= prevFrom && x.created <= prevTo);
    return {
      periodKey,
      label: BASE_PERIOD_LABELS[periodKey] || 'Неделя',
      rows,
      prevRows,
      mode: 'day',
      trend: makeDateTrend(rows, prevRows, dates)
    };
  }

  function makeDateTrend(items, prevItems, dates) {
    const buckets = new Map();
    items.forEach(x => buckets.set(dateKey(x.created), (buckets.get(dateKey(x.created)) || 0) + 1));
    const points = dates.map(d => ({
      label: String(d.getDate()).padStart(2, '0'),
      dateLabel: `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`,
      weekday: weekday(d),
      value: buckets.get(dateKey(d)) || 0
    }));
    const peak = points.reduce((a, b) => b.value > (a?.value || 0) ? b : a, null);
    const total = items.length;
    const avg = points.length ? total / points.length : 0;
    const change = prevItems.length ? ((total - prevItems.length) / prevItems.length) * 100 : null;
    return { total, avg, peak, change, points };
  }

  function dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function renderLeadMarketChart(data) {
    const points = data.trend.points || [];
    const barPoints = marketBarPoints(points);
    const isMonth = data.periodKey === 'month';
    const max = points.reduce((m, p) => Math.max(m, p.value || 0), 1);
    const minPoint = points.reduce((a, b) => !a || b.value < a.value ? b : a, null);
    const maxPoint = points.reduce((a, b) => !a || b.value > a.value ? b : a, null);
    const avg = data.trend.avg || 0;
    const dyn = data.trend.change;
    const periodSuffix = data.periodKey === 'day' ? 'к вчера' : data.periodKey === 'month' ? 'к прошлому месяцу' : 'к прошлой неделе';
    return `
      <div class="traffic-market-top">
        <div class="traffic-main-metric">
          <strong>${formatMetricValue(data.trend.total)}</strong>
          <span>лидов</span>
          <em class="${dyn !== null && dyn < 0 ? 'down' : 'up'}">${formatChange(dyn, data.periodKey)}</em>
        </div>
      </div>
      <div class="traffic-market-chart ${isMonth ? 'is-month' : ''}">
        ${renderLineSvg(barPoints, true, true)}
        <div class="traffic-market-columns">
          ${barPoints.map((p) => {
            const index = points.indexOf(p);
            const prev = index > 0 ? points[index - 1].value : p.value;
            const cls = p.value >= prev ? 'up' : 'down';
            const ratio = max ? Math.max(0, Math.min(1, p.value / max)) : 0;
            const dotTop = 10 + ((1 - ratio) * 44);
            const candleH = Math.max(14, Math.round(18 + ratio * 22));
            return `<span class="traffic-market-column ${cls}" style="--dot-top:${dotTop.toFixed(1)}%;--candle-h:${candleH}px">
              <i class="traffic-candle ${cls}"></i>
              <i class="traffic-market-dot"></i>
              ${isMonth ? '' : `<b>${formatMetricValue(p.value)}</b>`}
              <small>${esc(marketPointLabel(p, data.periodKey))}</small>
            </span>`;
          }).join('')}
        </div>
      </div>
      ${data.periodKey === 'month' ? renderMarketWeekLabels(points) : ''}
      <div class="traffic-market-summary">
        <span><i></i><em>Максимум</em><b>${formatMetricValue(maxPoint?.value || 0)}</b><small>${esc(pointDateLabel(maxPoint, data.periodKey))}</small></span>
        <span><i class="min"></i><em>Минимум</em><b>${formatMetricValue(minPoint?.value || 0)}</b><small>${esc(pointDateLabel(minPoint, data.periodKey))}</small></span>
        <span><i></i><em>Среднее</em><b>${formatMetricValue(avg)}</b><small>${data.periodKey === 'day' ? 'в час' : 'в день'}</small></span>
        <span><i class="${dyn !== null && dyn < 0 ? 'down' : 'up'}"></i><em>Динамика</em><b>${dyn === null ? '—' : `${dyn >= 0 ? '+' : '-'}${Math.abs(dyn).toFixed(0)}%`}</b><small>${periodSuffix}</small></span>
      </div>`;
  }

  function marketBarPoints(points) {
    return points;
  }

  function marketPointLabel(point, periodKey) {
    if (!point) return '';
    if (periodKey === 'week') return point.weekday || point.label;
    return point.label || String(point.dateLabel || '').slice(0, 2);
  }

  function renderMarketWeekLabels(points) {
    if (!points.length) return '';
    const weeks = [];
    for (let i = 0; i < points.length; i += 7) {
      const slice = points.slice(i, i + 7);
      const total = slice.reduce((sum, p) => sum + (Number(p.value) || 0), 0);
      const avg = slice.length ? total / slice.length : 0;
      const from = slice[0]?.label || String(slice[0]?.dateLabel || '').slice(0, 2);
      const to = slice[slice.length - 1]?.label || String(slice[slice.length - 1]?.dateLabel || '').slice(0, 2);
      weeks.push({ total, avg, range: `${from}-${to}` });
    }
    return `<div class="traffic-market-week-labels" style="--week-count:${weeks.length}">
      ${weeks.map(w => `<span><b>${formatMetricValue(w.total)}</b><em>~ ${formatMetricValue(w.avg)}</em><small>${esc(w.range)}</small></span>`).join('')}
    </div>`;
  }

  function renderSourceShareWidget(type, options = {}) {
    const data = buildBaseMetrics(basePeriod(type));
    const ranking = makeRanking(data.rows, trafficSourceField());
    const full = !!options.full;
    const rows = full ? ranking.rows : ranking.rows.slice(0, 5);
    const body = `
      <div class="traffic-ranking traffic-ranking-compact traffic-source-ranking">
        ${rows.map((r, i) => `
          <div class="traffic-rank-row">
            <small>${i + 1}</small>
            <span class="traffic-rank-label" title="${esc(r.label)}">${esc(shortTrafficLabel(r.label))}</span>
            <span class="traffic-rank-track"><span class="traffic-rank-fill" style="${trafficRankFillStyle(r.value, Math.max(...ranking.rows.map(x => x.value), 1))}"></span></span>
            <strong>${formatMetricValue(r.value)}</strong>
            <em>${ranking.total ? Math.round(r.value / ranking.total * 100) : 0}%</em>
          </div>`).join('') || '<p class="traffic-muted">Нет данных по полю Источник обращения</p>'}
      </div>
      <div class="traffic-total-strip"><span>Всего лидов</span><b>${formatMetricValue(ranking.total)}</b></div>`;
    return renderBaseWidgetShell(type, 'Лиды по источнику обращения', body, { className: 'traffic-share-widget' });
  }

  function trafficSourceField() {
    const exact = (state.fields || []).find(f => normHeader(f.originalName) === normHeader('Источник обращения') || normHeader(f.normalizedName) === normHeader('Источник обращения'));
    if (exact) return exact.normalizedName;
    return mappedField('source');
  }

  const TZ_GLOSSARY = [
    ['CPL', 'Cost Per Lead — стоимость лида. Расход ÷ число лидов с валидной стоимостью.'],
    ['CPQL', 'Cost Per Qualified Lead — стоимость квалифицированного лида. Расход ÷ число лидов с «Квал лид = Да».'],
    ['CPV', 'Cost Per Visit — стоимость визита. Расход ÷ число лидов с заполненной «Дата визита».'],
    ['CPA', 'Cost Per Action — стоимость реализации. Расход ÷ число успешно реализованных сделок.'],
    ['ROMI', 'Return On Marketing Investment — окупаемость рекламы: (доходность − расход) ÷ расход × 100%. Считается только при покрытии доходности ≥ 90%.'],
    ['Расход', 'Сумма «Стоимость лида» по тёплым лидам с валидной (> 0) стоимостью.'],
    ['Доходность', 'Маржа по успешным сделкам. Заполняется только в сделках со статусом «Кредит» (Успешное закрытие карточки).'],
    ['Покрытие доходности', 'Доля сделок «Кредит», у которых заполнена доходность. Ниже 90% → ROMI скрыт как ненадёжный.'],
    ['Квал. лид', 'Квалифицированный лид — поле «Квал лид = Да».'],
    ['Тёплый лид', 'Лид с источником «Теплые лиды». Только по ним считаются финансовые метрики (есть цена лида).'],
    ['Срок жизни', 'Время от «Дата создания сделки» до «Дата реализации» (или «Дата закрытия»).'],
    ['Медиана', 'Серединное значение: половина сделок быстрее, половина медленнее. Устойчивее среднего к выбросам.'],
    ['P75 / P90', 'Перцентили: 75% / 90% сделок укладываются в этот срок.'],
    ['Реализация', 'Успешная сделка: заполнено «Успешное закрытие карточки» или этап «Успешно реализовано».'],
  ];

  function showTrafficImportInfo() {
    const modal = document.getElementById('traffic-modal');
    if (!modal) return;
    const m = state.meta || {};
    const period = [m.periodFrom, m.periodTo].filter(Boolean).map(v => fmtDate(new Date(v))).join(' — ');
    const glossary = TZ_GLOSSARY.map(([term, def]) => `
      <div class="tz-gloss-row"><dt>${esc(term)}</dt><dd>${esc(def)}</dd></div>`).join('');
    modal.innerHTML = `
      <div class="traffic-modal-card traffic-import-info-card tz-info-card">
        <button class="traffic-modal-close" data-traffic-close type="button">×</button>
        <h2>Справка по разделу «Аналитика CRM»</h2>
        <p class="tz-info-lead">Аналитика входящего трафика и лидогенерации.</p>
        ${state.meta ? `<p class="tz-info-meta"><strong>${esc(m.fileName || 'CSV')}</strong> · ${formatMetricValue(m.rows || 0)} строк · ${formatMetricValue(m.cols || 0)} колонок${period ? ` · ${esc(period)}` : ''}</p>
        ${m.storageWarning ? `<p class="traffic-muted">${esc(m.storageWarning)}</p>` : ''}` : '<p class="traffic-muted">Импортируйте CSV для аналитики.</p>'}
        <h3 class="tz-gloss-title">Словарь сокращений</h3>
        <dl class="tz-gloss">${glossary}</dl>
        <p class="traffic-muted tz-gloss-note">Финансовые метрики (CPL/CPQL/CPV/CPA/ROMI) считаются только по тёплым лидам — у остальных источников нет цены лида.</p>
      </div>`;
    modal.classList.add('open');
    bindModalDismiss(modal);
    modal.querySelector('[data-traffic-close]').onclick = closeModal;
  }

  function trafficRankFillStyle(value, max) {
    const ratio = max ? Math.max(0, Math.min(1, value / max)) : 0;
    const width = Math.max(4, ratio * 100);
    const strong = Math.round(36 + ratio * 44);
    const warm = Math.round(ratio * 76);
    return `width:${width}%;background:linear-gradient(90deg,color-mix(in srgb,var(--acc,#1a86eb) ${strong}%,#dff1ff),color-mix(in srgb,#8b5cf6 ${warm}%,var(--acc,#1a86eb)))`;
  }

  function shortTrafficLabel(label) {
    const text = String(label || '').trim();
    return text.replace(/^Закрыто\s+и\s+не\s+реализовано\s*(\(.*\))$/i, 'ЗинР $1');
  }

  function renderRankingWidget(type, title, key, withFooter, options = {}) {
    const data = buildBaseMetrics(basePeriod(type));
    const ranking = makeRanking(data.rows, key);
    const max = Math.max(...ranking.rows.map(r => r.value), 1);
    const top = ranking.rows.slice(0, options.full ? ranking.rows.length : 5);
    const body = `
      <div class="traffic-ranking traffic-ranking-compact">
        ${top.map((r, i) => `
          <div class="traffic-rank-row">
            <small>${i + 1}</small>
            <span class="traffic-rank-label" title="${esc(r.label)}">${esc(shortTrafficLabel(r.label))}</span>
            <span class="traffic-rank-track"><span class="traffic-rank-fill" style="${trafficRankFillStyle(r.value, max)}"></span></span>
            <strong>${formatMetricValue(r.value)}</strong>
            ${withFooter ? `<em>${ranking.total ? Math.round(r.value / ranking.total * 100) : 0}%</em>` : ''}
          </div>`).join('') || '<p class="traffic-muted">Нет данных</p>'}
      </div>
      ${withFooter ? `<div class="traffic-purple-strip"><span>Конверсия в сделку</span><b>${ranking.total ? Math.round(((top[top.length - 1]?.value || 0) / ranking.total) * 1000) / 10 : 0}%</b></div>` : (options.full ? '' : `<button class="traffic-link-btn" type="button">Смотреть все ›</button>`)}`;
    return renderBaseWidgetShell(type, title, body, { className: 'traffic-ranking-widget' });
  }

  function renderHoursWidget(type) {
    const data = buildBaseMetrics(basePeriod(type));
    const hours = makeHours(data.rows);
    const body = `
      ${renderBars(hours.rows, hours.peak?.label)}
      <div class="traffic-purple-strip"><span>◷ Пик трафика</span><b>${hours.peak?.label || '-'}:00</b></div>`;
    return renderBaseWidgetShell(type, 'Пиковые часы 9–18', body, { className: 'traffic-hours-widget' });
  }

  function renderLifetimeWidget(type) {
    const data = buildBaseMetrics(basePeriod(type));
    const lifetime = makeLifetime(data.rows);
    const body = `
      <div class="traffic-lifetime-head"><strong>${lifetime.avg.toFixed(1)}</strong><span>дня в среднем</span></div>
      ${renderBars(lifetime.rows, lifetime.peak?.label)}
      <div class="traffic-chart-caption">Дней</div>`;
    return renderBaseWidgetShell(type, 'Срок жизни сделки', body, { className: 'traffic-lifetime-widget' });
  }

  function makeLifetime(items) {
    const closedKey = state.mapping.closedAt;
    const buckets = [
      { label: '0–1', min: 0, max: 1, value: 0 },
      { label: '2–3', min: 2, max: 3, value: 0 },
      { label: '4–7', min: 4, max: 7, value: 0 },
      { label: '8–14', min: 8, max: 14, value: 0 },
      { label: '15–30', min: 15, max: 30, value: 0 },
      { label: '31–60', min: 31, max: 60, value: 0 },
      { label: '60+', min: 61, max: Infinity, value: 0 }
    ];
    const values = [];
    if (closedKey) {
      items.forEach(x => {
        const closed = parseDate(x.row[closedKey])?.date;
        if (!closed) return;
        const days = Math.max(0, Math.ceil((closed - x.created) / 86400000));
        values.push(days);
        const bucket = buckets.find(b => days >= b.min && days <= b.max);
        if (bucket) bucket.value++;
      });
    }
    const avg = values.length ? values.reduce((s, n) => s + n, 0) / values.length : 0;
    const peak = buckets.reduce((a, b) => b.value > (a?.value || 0) ? b : a, null);
    return { rows: buckets, avg, peak };
  }

  function makeTrend(items, prevItems, mode) {
    const buckets = new Map();
    items.forEach(x => {
      const key = mode === 'hour'
        ? `${String(x.created.getHours()).padStart(2, '0')}:00`
        : mode === 'weekday'
          ? weekday(x.created)
          : String(x.created.getDate()).padStart(2, '0');
      buckets.set(key, (buckets.get(key) || 0) + 1);
    });
    const labels = trendLabels(mode);
    const points = labels.length
      ? labels.map(label => ({ label, value: buckets.get(label) || 0 }))
      : Array.from(buckets, ([label, value]) => ({ label, value }))
        .sort((a, b) => trendOrder(a.label, mode) - trendOrder(b.label, mode));
    const peak = points.reduce((a, b) => b.value > (a?.value || 0) ? b : a, null);
    const total = items.length;
    const avg = points.length ? total / points.length : 0;
    const change = prevItems.length ? ((total - prevItems.length) / prevItems.length) * 100 : null;
    return { total, avg, peak, change, points };
  }

  function trendLabels(mode) {
    const now = new Date();
    if (mode === 'weekday') {
      const order = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
      const todayIndex = (now.getDay() + 6) % 7;
      return order.slice(0, todayIndex + 1);
    }
    if (mode === 'hour') {
      return Array.from({ length: now.getHours() + 1 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
    }
    if (mode === 'day') {
      return Array.from({ length: now.getDate() }, (_, i) => String(i + 1).padStart(2, '0'));
    }
    return [];
  }

  function trendOrder(label, mode) {
    if (mode === 'weekday') {
      const order = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
      const idx = order.indexOf(label);
      return idx === -1 ? 99 : idx;
    }
    const n = Number(String(label).replace(':00', ''));
    return Number.isFinite(n) ? n : 99;
  }

  function makeRanking(items, key) {
    const counts = new Map();
    if (!key) return { rows: [], total: items.length, unique: 0, leader: null, avg: 0 };
    items.forEach(x => {
      splitValue(x.row[key]).forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    });
    const rows = Array.from(counts, ([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    return {
      rows,
      total: items.length,
      unique: rows.length,
      leader: rows[0] || null,
      avg: rows.length ? items.length / rows.length : 0
    };
  }

  function makeHours(items) {
    const rows = [];
    for (let h = 9; h <= 18; h++) rows.push({ label: String(h), value: 0 });
    items.forEach(x => {
      const h = x.created.getHours();
      const found = rows.find(r => r.label === String(h));
      if (found) found.value++;
    });
    const total = rows.reduce((s, r) => s + r.value, 0);
    const peak = rows.reduce((a, b) => b.value > (a?.value || 0) ? b : a, null);
    const avg = total / rows.length;
    return { rows, total, peak, avg, deviation: peak ? peak.value - avg : 0 };
  }

  function renderBars(points, peakLabel) {
    const max = Math.max(...points.map(p => p.value), 1);
    return `<div class="traffic-chart">
      ${points.map(p => `<div class="traffic-bar ${p.label === peakLabel ? 'peak' : ''}" title="${esc(p.label)}: ${p.value}" style="height:${Math.max(3, p.value / max * 100)}%"><span>${esc(p.label)}</span></div>`).join('')}
    </div>`;
  }

  function formatChange(change, periodKey) {
    const suffix = periodKey === 'day' ? 'к вчера' : periodKey === 'month' ? 'к прошлому месяцу' : 'к прошлой неделе';
    if (change === null) return 'нет прошлого периода';
    return `${change >= 0 ? '↑' : '↓'} ${Math.abs(change).toFixed(0)}% ${suffix}`;
  }

  function pointDateLabel(point, periodKey) {
    if (!point) return '-';
    if (point.dateLabel) return periodKey === 'week' ? `${point.weekday || ''} · ${point.dateLabel}` : point.dateLabel;
    const now = new Date();
    if (periodKey === 'week') {
      const order = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
      const idx = order.indexOf(point.label);
      const d = startOfWeek(now);
      if (idx >= 0) d.setDate(d.getDate() + idx);
      return `${point.label} · ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    if (periodKey === 'month') {
      const day = Number(point.label);
      return `${String(day || now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    return point.label;
  }

  function renderLineAxis(points) {
    if (!points.length) return '<div class="traffic-line-axis"><span>-</span><span>-</span><span>-</span></div>';
    if (points.length <= 7) {
      return `<div class="traffic-line-axis all">${points.map(p => `<span>${esc(p.label)}</span>`).join('')}</div>`;
    }
    const mid = points[Math.floor(points.length / 2)];
    return `<div class="traffic-line-axis">
      <span>${esc(points[0].label)}</span>
      <span>${esc(mid.label)}</span>
      <span>${esc(points[points.length - 1].label)}</span>
    </div>`;
  }

  function renderTrendCandles(points) {
    if (!points.length) return '';
    const max = Math.max(...points.map(p => p.value), 1);
    return `<div class="traffic-candle-layer">
      ${points.map((p, i) => {
        const prev = i ? points[i - 1].value : p.value;
        const cls = p.value >= prev ? 'up' : 'down';
        const h = Math.max(6, Math.round((p.value / max) * 88));
        return `<span class="traffic-candle ${cls}" style="height:${h}%"><b>${formatMetricValue(p.value)}</b></span>`;
      }).join('')}
    </div>`;
  }

  function renderDonut(rows, total) {
    let cursor = 0;
    const safeTotal = Math.max(total, 1);
    const segments = rows.map((r, i) => {
      const next = cursor + Math.max(1, Math.round(r.value / safeTotal * 100));
      const segment = `${shareColor(i)} ${cursor}% ${Math.min(100, next)}%`;
      cursor = next;
      return segment;
    }).join(', ');
    return `<div class="traffic-donut" style="background:conic-gradient(${segments || 'var(--bg3) 0 100%'})"><span>${rows.length}</span></div>`;
  }

  function renderAdvancedTab() {
    return tzRenderEditor();
  }

  function renderCustomWidget(widget) {
    return tzRenderCustomWidget(widget);
  }

  function renderCustomWidgetDetail(widget) {
    const fields = (widget.selectedFields || []).map(f => `${f.normalizedName}${f.role ? ` (${ROLE_LABELS[f.role] || f.role})` : ''}`).join(', ');
    const primary = getPrimaryGroupField(widget)?.normalizedName;
    const rows = rowsForWidget(widget);
    const data = primary ? makeWidgetData(widget, rows, primary) : null;
    const period = PERIOD_LABELS[widget.period?.type || 'all'] || 'Все данные';
    return `
      <article class="traffic-widget traffic-custom-widget traffic-format-${esc(widget.format || 'ranking')}">
        <div class="traffic-widget-head">
          <div>
            <h3>${esc(widget.title || 'Без названия')}</h3>
            <p class="traffic-muted">${esc(FORMAT_LABELS[widget.format] || widget.format || 'Виджет')} · ${esc(period)}</p>
            <p class="traffic-muted">${esc(fields || 'поля не выбраны')}</p>
          </div>
        </div>
        ${data ? renderWidgetByFormat(widget, data, rows, primary) : '<p class="traffic-muted">Нет данных для построения.</p>'}
        <p class="traffic-widget-note">Пересчитано: ${esc(fmtDateTime(new Date(widget.updatedAt || Date.now())))}</p>
      </article>`;
  }

  function showCustomWidgetModal(id) {
    return tzShowWidgetModal(id);
  }
  function showCustomWidgetModalLegacy(id) {
    const widget = (state.widgets || []).find(w => w.id === id);
    const modal = document.getElementById('traffic-modal');
    if (!widget || !modal) return;
    modal.innerHTML = `
      <div class="traffic-modal-card traffic-advanced-modal-card">
        <div class="traffic-modal-topbar">
          <button class="traffic-modal-close" data-traffic-close type="button">×</button>
          <div class="traffic-modal-tools">
            <button class="traffic-icon-tool danger" data-traffic-modal-delete type="button" aria-label="Удалить виджет">⌫</button>
            <button class="traffic-icon-tool" data-traffic-modal-edit type="button" aria-label="Редактировать виджет">✎</button>
            <button class="traffic-icon-tool" data-traffic-modal-info type="button" aria-label="Информация о виджете">i</button>
          </div>
        </div>
        <div class="traffic-advanced-detail">
          ${renderCustomWidgetDetail(widget)}
          <div class="traffic-widget-info" id="traffic-widget-info" hidden>
            ${renderWidgetInfo(widget)}
          </div>
        </div>
      </div>`;
    modal.classList.add('open');
    bindModalDismiss(modal);
    modal.querySelector('[data-traffic-close]').onclick = closeModal;
    modal.querySelector('[data-traffic-modal-delete]').onclick = e => {
      e.stopPropagation();
      closeModal();
      deleteWidget(id);
    };
    modal.querySelector('[data-traffic-modal-edit]').onclick = e => {
      e.stopPropagation();
      closeModal();
      showWidgetBuilder(id);
    };
    modal.querySelector('[data-traffic-modal-info]').onclick = e => {
      e.stopPropagation();
      const info = modal.querySelector('#traffic-widget-info');
      if (info) info.hidden = !info.hidden;
    };
  }

  function renderWidgetInfo(widget) {
    const fields = widget.selectedFields || [];
    return `
      <h3>Из чего собран виджет</h3>
      <div class="traffic-info-grid">
        <span>Формат</span><b>${esc(FORMAT_LABELS[widget.format] || widget.format || '-')}</b>
        <span>Период</span><b>${esc(PERIOD_LABELS[widget.period?.type || 'all'] || 'Все данные')}</b>
        <span>Ориентация</span><b>${esc(widget.orientation || 'auto')}</b>
        <span>Полей</span><b>${fields.length}</b>
      </div>
      <div class="traffic-info-fields">
        ${fields.map(f => `
          <div>
            <strong>${esc(f.normalizedName)}</strong>
            <small>${esc(f.type || 'unknown')} · ${esc(ROLE_LABELS[f.role] || f.role || 'роль не задана')} · ${esc(f.aggregation || 'count')}</small>
            <em>${Array.isArray(f.values) && f.values.length ? `Фильтр: ${f.values.map(esc).join(', ')}` : 'Все значения'}</em>
          </div>
        `).join('') || '<p class="traffic-muted">Поля не выбраны.</p>'}
      </div>`;
  }

  function renderWidgetByFormat(widget, data, rows, primary) {
    const format = widget.format || 'ranking';
    if (format === 'rollingTrend' || format === 'trend') return renderCustomTrend(widget, rows, format);
    if (format === 'histogram') return renderCustomHistogram(data);
    if (format === 'ranking') return renderCustomRanking(data);
    if (format === 'categoryCompare') return renderCustomCompare(data);
    if (format === 'shareStructure') return renderCustomShare(data);
    if (format === 'heatmap') return renderCustomHeatmap(rows);
    if (format === 'kpiSummary') return renderCustomKpi(data, rows);
    if (format === 'tableDetail') return renderCustomTable(data);
    if (format === 'comboWidget') return renderCustomCombo(widget, data, rows);
    if (format === 'wordCloud') return renderCustomCloud(data);
    return renderCustomRanking(data);
  }

  function renderCustomTrend(widget, rows, format) {
    const periodType = widget.period?.type;
    const mode = periodType === 'today' ? 'hour' : (periodType === 'currentWeek' || periodType === 'prevWeek') ? 'weekday' : 'day';
    const trend = makeTrend(rows.filter(x => x.created), [], mode);
    const pts = format === 'rollingTrend' ? rollingPoints(trend.points) : trend.points;
    return `
      <div class="traffic-custom-trend">
        <div class="traffic-main-metric">
          <strong>${trend.total}</strong>
          <span>записей</span>
          <em>${format === 'rollingTrend' ? 'сглаженный тренд' : 'тренд по датам'}</em>
        </div>
        <div class="traffic-trend-chart">
          ${renderTrendCandles(pts)}
          ${renderLineSvg(pts, true)}
          ${renderLineAxis(pts)}
        </div>
        <div class="traffic-mini-kpis">
          <span>Пик: <b>${esc(trend.peak?.label || '-')}</b></span>
          <span>Среднее: <b>${trend.avg.toFixed(1)}</b></span>
          <span>Точек: <b>${pts.length}</b></span>
        </div>
      </div>`;
  }

  function renderCustomHistogram(data) {
    const top = data.rows.slice(0, 8);
    return `
      <div class="traffic-histogram">
        ${renderBars(top.map((r, i) => ({ label: String(i + 1), value: r.value })), '1')}
        <div class="traffic-mini-kpis">
          <span>Частый диапазон: <b>${esc(top[0]?.label || '-')}</b></span>
          <span>Записей: <b>${data.total}</b></span>
        </div>
      </div>`;
  }

  function renderCustomRanking(data) {
    return `<div class="traffic-ranking traffic-custom-ranking">${renderRankRows(data, 7)}</div>`;
  }

  function renderCustomCompare(data) {
    const rows = data.rows.slice(0, 6);
    const max = Math.max(...rows.map(r => r.value), 1);
    return `
      <div class="traffic-compare">
        ${rows.map((r, i) => `
          <div class="traffic-compare-row">
            <span>${esc(r.label)}</span>
            <strong>${r.value}</strong>
            <i style="width:${Math.max(4, r.value / max * 100)}%"></i>
          </div>`).join('')}
      </div>`;
  }

  function renderCustomShare(data) {
    const rows = data.rows.slice(0, 5);
    const total = Math.max(data.total, 1);
    let cursor = 0;
    const gradient = rows.map((r, i) => {
      const next = cursor + Math.max(1, Math.round(r.value / total * 100));
      const segment = `${shareColor(i)} ${cursor}% ${Math.min(100, next)}%`;
      cursor = next;
      return segment;
    }).join(', ');
    return `
      <div class="traffic-share">
        <div class="traffic-donut" style="background:conic-gradient(${gradient || 'var(--bg3) 0 100%'})"><span>${data.unique}</span></div>
        <div class="traffic-share-list">${rows.map((r, i) => `<span><i style="background:${shareColor(i)}"></i>${esc(r.label)} <b>${Math.round(r.value / total * 100)}%</b></span>`).join('')}</div>
      </div>`;
  }

  function renderCustomHeatmap(rows) {
    const matrix = new Map();
    rows.filter(x => x.created).forEach(x => {
      const key = `${x.created.getDay()}_${x.created.getHours()}`;
      matrix.set(key, (matrix.get(key) || 0) + 1);
    });
    const max = Math.max(...matrix.values(), 1);
    const days = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    const hours = [9,10,11,12,13,14,15,16,17,18];
    return `<div class="traffic-heatmap">
      ${days.map((d, di) => `<div class="traffic-heat-row"><b>${d}</b>${hours.map(h => {
        const jsDay = di === 6 ? 0 : di + 1;
        const v = matrix.get(`${jsDay}_${h}`) || 0;
        return `<span style="opacity:${.18 + (v / max) * .82}" title="${d} ${h}:00 · ${v}"></span>`;
      }).join('')}</div>`).join('')}
    </div>`;
  }

  function renderCustomKpi(data, rows) {
    const filled = data.rows.reduce((s, r) => s + r.value, 0);
    return `
      <div class="traffic-kpi-summary">
        <strong>${formatMetricValue(data.aggregation && data.aggregation !== 'count' ? data.total : rows.length)}</strong>
        <span>главная метрика</span>
        <div class="traffic-mini-kpis">
          <span>Уникальных: <b>${data.unique}</b></span>
          <span>Заполнено: <b>${formatMetricValue(filled)}</b></span>
          <span>Лидер: <b>${esc(data.leader?.label || '-')}</b></span>
        </div>
      </div>`;
  }

  function renderCustomTable(data) {
    return `<div class="traffic-table-mini">
      ${data.rows.slice(0, 6).map(r => `<div><span>${esc(r.label)}</span><b>${formatMetricValue(r.value)}</b></div>`).join('')}
    </div>`;
  }

  function renderCustomCombo(widget, data, rows) {
    const trend = makeTrend(rows.filter(x => x.created), [], widget.period?.type === 'today' ? 'hour' : 'day');
    return `
      <div class="traffic-combo">
        ${renderLineSvg(trend.points, false)}
        <div class="traffic-ranking">${renderRankRows(data, 4)}</div>
      </div>`;
  }

  function renderCustomCloud(data) {
    const max = Math.max(...data.rows.map(r => r.value), 1);
    return `<div class="traffic-word-cloud">
      ${data.rows.slice(0, 18).map(r => `<span style="font-size:${12 + (r.value / max) * 18}px">${esc(r.label)}</span>`).join('')}
    </div>`;
  }

  function renderRankRows(data, limit) {
    const max = Math.max(...data.rows.map(r => r.value), 1);
    return data.rows.slice(0, limit).map(r => `
      <div class="traffic-rank-row">
        <span class="traffic-rank-label" title="${esc(r.label)}">${esc(shortTrafficLabel(r.label))}</span>
        <strong>${formatMetricValue(r.value)}</strong>
        <span class="traffic-rank-track"><span class="traffic-rank-fill" style="${trafficRankFillStyle(r.value, max)}"></span></span>
      </div>`).join('') || '<p class="traffic-muted">Нет данных</p>';
  }

  function formatMetricValue(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return esc(value ?? '-');
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: n % 1 ? 1 : 0 }).format(n);
  }

  function getPrimaryGroupField(widget) {
    const fields = widget.selectedFields || [];
    return fields.find(f => f.role === 'groupBy')
      || fields.find(f => f.role === 'splitBy')
      || fields.find(f => f.role !== 'date' && f.role !== 'ignore')
      || fields[0];
  }

  function getMetricField(widget) {
    const fields = widget.selectedFields || [];
    return fields.find(f => f.role === 'metric')
      || fields.find(f => ['number','money','percent'].includes(f.type) && f.role !== 'ignore');
  }

  function makeWidgetData(widget, rows, primary) {
    const metric = getMetricField(widget);
    const aggregation = metric?.aggregation || 'count';
    if (!metric || aggregation === 'count') return makeRanking(rows, primary);
    if (aggregation === 'uniqueCount') return makeUniqueRanking(rows, primary, metric.normalizedName);
    const groups = new Map();
    rows.forEach(x => {
      splitValue(x.row[primary]).forEach(label => {
        const parsed = parseMetricNumber(x.row[metric.normalizedName]);
        if (parsed === null) return;
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(parsed);
      });
    });
    const dataRows = Array.from(groups, ([label, values]) => ({ label, value: aggregateNumbers(values, aggregation), count: values.length }))
      .filter(r => Number.isFinite(r.value))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    const total = aggregateNumbers(dataRows.map(r => r.value), aggregation === 'average' ? 'sum' : 'sum');
    return {
      rows: dataRows,
      total,
      unique: dataRows.length,
      leader: dataRows[0] || null,
      avg: dataRows.length ? total / dataRows.length : 0,
      metricLabel: metric.normalizedName,
      aggregation
    };
  }

  function makeUniqueRanking(rows, primary, metricKey) {
    const groups = new Map();
    rows.forEach(x => {
      splitValue(x.row[primary]).forEach(label => {
        if (!groups.has(label)) groups.set(label, new Set());
        splitValue(x.row[metricKey]).forEach(v => groups.get(label).add(v));
      });
    });
    const dataRows = Array.from(groups, ([label, set]) => ({ label, value: set.size }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    return {
      rows: dataRows,
      total: dataRows.reduce((s, r) => s + r.value, 0),
      unique: dataRows.length,
      leader: dataRows[0] || null,
      avg: dataRows.length ? dataRows.reduce((s, r) => s + r.value, 0) / dataRows.length : 0,
      aggregation: 'uniqueCount'
    };
  }

  function parseMetricNumber(value) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return null;
    const mult = raw.includes('млн') ? 1000000 : raw.includes('тыс') ? 1000 : 1;
    const normalized = raw
      .replace(/\s+/g, '')
      .replace(',', '.')
      .replace(/[^0-9.+-]/g, '');
    if (!normalized || normalized === '-' || normalized === '+') return null;
    const n = Number(normalized);
    return Number.isFinite(n) ? n * mult : null;
  }

  function aggregateNumbers(values, aggregation) {
    const nums = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!nums.length) return 0;
    if (aggregation === 'average') return nums.reduce((s, n) => s + n, 0) / nums.length;
    if (aggregation === 'min') return nums[0];
    if (aggregation === 'max') return nums[nums.length - 1];
    if (aggregation === 'median') {
      const mid = Math.floor(nums.length / 2);
      return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
    }
    return nums.reduce((s, n) => s + n, 0);
  }

  function getDateField(widget) {
    const fields = widget.selectedFields || [];
    return fields.find(f => f.role === 'date')?.normalizedName || state.mapping.createdAt;
  }

  function rowsForWidget(widget) {
    const dateKey = getDateField(widget);
    const rows = state.rows.map(row => ({ row, created: parseDate(row[dateKey])?.date })).filter(x => x.row);
    let filtered = filterRowsByPeriod(rows, widget.period?.type || 'all');
    (widget.selectedFields || []).forEach(field => {
      if (!Array.isArray(field.values) || !field.values.length) return;
      const allowed = new Set(field.values.map(norm));
      filtered = filtered.filter(x => splitValue(x.row[field.normalizedName]).some(v => allowed.has(norm(v))));
    });
    return filtered;
  }

  function uniqueFieldValues(fieldName, limit = 100) {
    const counts = new Map();
    (state.rows || []).forEach(row => {
      splitValue(row[fieldName]).forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
    });
    return Array.from(counts, ([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .slice(0, limit)
      .map(x => x.value);
  }

  function filterRowsByPeriod(rows, periodType) {
    if (!periodType || periodType === 'all') return rows;
    const now = new Date();
    let from = null;
    let to = new Date(now);
    if (periodType === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (periodType === 'currentWeek') {
      from = startOfWeek(now);
    } else if (periodType === 'currentMonth') {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (periodType === 'prevWeek') {
      to = startOfWeek(now);
      to.setMilliseconds(-1);
      from = new Date(to);
      from.setDate(from.getDate() - 6);
      from.setHours(0,0,0,0);
    } else if (periodType === 'prevMonth') {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    }
    if (!from) return rows;
    return rows.filter(x => x.created && x.created >= from && x.created <= to);
  }

  function renderLineSvg(points, smooth, marketMode = false) {
    const max = Math.max(...points.map(p => p.value), 1);
    const w = 320, h = 120;
    const gradId = `traffic-line-gradient-${Math.random().toString(36).slice(2)}`;
    const coords = points.length ? points.map((p, i) => {
      const x = points.length === 1 ? 0 : (i / (points.length - 1)) * w;
      const ratio = max ? Math.max(0, Math.min(1, (Number(p.value) || 0) / max)) : 0;
      const y = marketMode ? ((10 + ((1 - ratio) * 44)) / 100) * h : h - ratio * (h - 12) - 6;
      return [x, y];
    }) : [[0, h], [w, h]];
    const d = smooth ? smoothPath(coords) : coords.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const area = `${d} L${w} ${h} L0 ${h} Z`;
    return `<svg class="traffic-line-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="currentColor" stop-opacity=".28"></stop>
          <stop offset="100%" stop-color="currentColor" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      <path class="traffic-line-area" d="${area}" style="fill:url(#${gradId})"></path>
      <path class="traffic-line-path ${smooth ? 'smooth' : ''}" d="${d}"></path>
      <g class="traffic-line-points">${coords.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.6"></circle>`).join('')}</g>
    </svg>`;
  }

  function smoothPath(coords) {
    if (coords.length < 2) return coords.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    return coords.reduce((d, curr, i) => {
      if (!i) return `M${curr[0].toFixed(1)} ${curr[1].toFixed(1)}`;
      const prev = coords[i - 1];
      const midX = (prev[0] + curr[0]) / 2;
      return `${d} C${midX.toFixed(1)} ${prev[1].toFixed(1)}, ${midX.toFixed(1)} ${curr[1].toFixed(1)}, ${curr[0].toFixed(1)} ${curr[1].toFixed(1)}`;
    }, '');
  }

  function rollingPoints(points) {
    return points.map((p, i) => {
      const slice = points.slice(Math.max(0, i - 2), i + 1);
      return { ...p, value: Math.round(slice.reduce((s, x) => s + x.value, 0) / slice.length) };
    });
  }

  function shareColor(i) {
    return ['var(--acc, #1a86eb)', '#8b5cf6', 'var(--grn, #2ed573)', '#ffb020', '#ef476f'][i % 5];
  }

  function renderBaseWidgetByType(type, options = {}) {
    if (type === 'leadTrend') return renderLeadTrendWidget(type);
    if (type === 'sourceShare') return renderSourceShareWidget(type, options);
    if (type === 'cities') return renderRankingWidget(type, 'Города', state.mapping.city, false, options);
    if (type === 'hours') return renderHoursWidget(type);
    if (type === 'stages') return renderRankingWidget(type, 'Этапы воронки', state.mapping.stage, true, options);
    if (type === 'lossReasons') return renderRankingWidget(type, 'Причины закрытия', state.mapping.lossReason, false, options);
    if (type === 'lifetime') return renderLifetimeWidget(type);
    if (type === 'responsible') return renderRankingWidget(type, 'Ответственные', state.mapping.responsible, false, options);
    return '';
  }

  function showBaseWidgetModal(type) {
    const modal = document.getElementById('traffic-modal');
    if (!modal) return;
    const card = renderBaseWidgetByType(type, { full: true });
    modal.innerHTML = `
      <div class="traffic-modal-card traffic-base-modal-card">
        <button class="traffic-modal-close" data-traffic-close type="button">×</button>
        <div class="traffic-base-detail">
          ${card}
        </div>
      </div>`;
    modal.classList.add('open');
    bindModalDismiss(modal);
    modal.querySelector('[data-traffic-close]').onclick = closeModal;
    modal.querySelectorAll('[data-traffic-period]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        state.basePeriods[btn.dataset.trafficPeriodWidget] = btn.dataset.trafficPeriod;
        localStorage.setItem(STORAGE.basePeriods, JSON.stringify(state.basePeriods));
        closeModal();
        renderTrafficAnalytics();
        showBaseWidgetModal(type);
      };
    });
  }

  function showWidgetBuilder(editId) {
    return tzShowBuilder(editId);
  }
  function showWidgetBuilderLegacy(editId) {
    const modal = document.getElementById('traffic-modal');
    if (!modal) return;
    const editing = typeof editId === 'string' ? (state.widgets || []).find(w => w.id === editId) : null;
    const editingFields = editing?.selectedFields || [];
    const editingNames = new Set(editingFields.map(f => f.normalizedName));
    const formatCards = Object.entries(FORMAT_LABELS).map(([value, label], i) => {
      const help = FORMAT_HELP[value] || ['', ''];
      const checked = editing ? editing.format === value : i === 0;
      return `
        <label class="traffic-format-card ${checked ? 'active' : ''}" data-format-card="${esc(value)}">
          <input type="radio" name="traffic-widget-format" value="${esc(value)}" ${checked ? 'checked' : ''}>
          <span class="traffic-format-preview traffic-preview-${esc(value)}"></span>
          <strong>${esc(label)}</strong>
          <small>${esc(help[0])}</small>
          <em>${esc(help[1])}</em>
        </label>`;
    }).join('');
    const roleOptions = Object.entries(ROLE_LABELS).map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join('');
    const periodOptions = Object.entries(PERIOD_LABELS).map(([value, label], i) => {
      const checked = editing ? (editing.period?.type || 'all') === value : i === 0;
      return `<label class="traffic-segment"><input type="radio" name="traffic-widget-period" value="${value}" ${checked ? 'checked' : ''}><span>${esc(label)}</span></label>`;
    }).join('');
    modal.innerHTML = `
      <div class="traffic-modal-card">
        <h2>${editing ? 'Редактировать виджет' : 'Новый виджет'}</h2>
        <p class="traffic-muted">Формат определяет внешний вид. Расчеты будут выполнены по выбранным полям CSV.</p>
        <label class="traffic-field">Название виджета<input id="traffic-widget-title" placeholder="Заявки по источникам" value="${esc(editing?.title || '')}"></label>
        <div class="traffic-builder-section">
          <strong>Выберите формат виджета</strong>
          <div class="traffic-format-grid">${formatCards}</div>
        </div>
        <div class="traffic-builder-section">
          <strong>Выбрать поля из CSV</strong>
          <div class="traffic-field-search">
            <input id="traffic-field-search" type="search" placeholder="Поиск метрики: источник, город, ответственный...">
            <button id="traffic-field-search-clear" type="button" aria-label="Очистить поиск">×</button>
          </div>
          <p class="traffic-muted" id="traffic-selected-count">Выбрано ${editingNames.size} из 10</p>
          <div class="traffic-fields" id="traffic-fields-list">
            ${state.fields.map(f => `
              <label class="traffic-field traffic-field-option" data-field-search="${esc(`${f.normalizedName} ${f.originalName} ${f.type} ${f.example || ''}`.toLowerCase())}">
                <span><input type="checkbox" class="traffic-field-check" value="${esc(f.normalizedName)}" ${editingNames.has(f.normalizedName) ? 'checked' : ''}> ${esc(f.normalizedName)}</span>
                <span class="traffic-field-meta">${esc(f.type)} · пример: ${esc(f.example || '-')}</span>
              </label>`).join('')}
          </div>
        </div>
        <div class="traffic-builder-section">
          <strong>Роли выбранных полей</strong>
          <div class="traffic-role-list" id="traffic-role-list"><p class="traffic-muted">Выберите поля выше, чтобы назначить роли.</p></div>
        </div>
        <div class="traffic-builder-section">
          <strong>Период</strong>
          <div class="traffic-segment-grid">${periodOptions}</div>
        </div>
        <div class="traffic-builder-section">
          <strong>Ориентация данных</strong>
          <div class="traffic-segment-grid">
            <label class="traffic-segment"><input type="radio" name="traffic-widget-orientation" value="auto" checked><span>Авто</span></label>
            <label class="traffic-segment"><input type="radio" name="traffic-widget-orientation" value="horizontal"><span>Горизонтально</span></label>
            <label class="traffic-segment"><input type="radio" name="traffic-widget-orientation" value="vertical"><span>Вертикально</span></label>
          </div>
        </div>
        <div class="traffic-modal-actions">
          <button class="traffic-btn" data-traffic-close>Отмена</button>
          <button class="traffic-btn primary" id="traffic-save-widget">${editing ? 'Сохранить изменения' : 'Сохранить виджет'}</button>
        </div>
      </div>`;
    modal.classList.add('open');
    bindModalDismiss(modal);
    modal.querySelector('[data-traffic-close]').onclick = closeModal;
    if (editing?.orientation) {
      const orient = modal.querySelector(`input[name="traffic-widget-orientation"][value="${editing.orientation}"]`);
      if (orient) orient.checked = true;
    }
    const checks = modal.querySelectorAll('.traffic-field-check');
    const roleList = modal.querySelector('#traffic-role-list');
    const syncRoleList = () => {
      const selected = Array.from(checks).filter(x => x.checked).map(x => x.value);
      if (!selected.length) {
        roleList.innerHTML = '<p class="traffic-muted">Выберите поля выше, чтобы назначить роли.</p>';
        return;
      }
      roleList.innerHTML = selected.map((name, idx) => {
        const f = state.fields.find(field => field.normalizedName === name);
        const saved = editingFields.find(field => field.normalizedName === name);
        const values = uniqueFieldValues(name, 80);
        return `
          <div class="traffic-role-card">
            <div class="traffic-role-row">
              <div>
                <strong>${esc(name)}</strong>
                <small>${esc(f.type)} · ${esc(f.example || '-')}</small>
              </div>
              <select class="traffic-role-select" data-role-index="${idx}">${roleOptions}</select>
              <select class="traffic-agg-select" data-agg-index="${idx}">
                <option value="count">count</option>
                <option value="uniqueCount">uniqueCount</option>
                <option value="sum">sum</option>
                <option value="average">average</option>
                <option value="min">min</option>
                <option value="max">max</option>
                <option value="median">median</option>
                <option value="share">share</option>
              </select>
            </div>
            <details class="traffic-value-picker">
              <summary>Значения: все${values.length ? ` · ${values.length}` : ''}</summary>
              <div class="traffic-value-list">
                ${values.map(v => `
                  <label><input type="checkbox" data-value-index="${idx}" value="${esc(v)}" ${saved?.values?.includes(v) ? 'checked' : ''}> <span>${esc(v)}</span></label>
                `).join('') || '<span class="traffic-muted">В этом поле нет значений.</span>'}
              </div>
              <small>Ничего не отмечено — используются все значения.</small>
            </details>
          </div>`;
      }).join('');
      selected.forEach((name, idx) => {
        const f = state.fields.find(field => field.normalizedName === name);
        const saved = editingFields.find(field => field.normalizedName === name);
        const role = saved?.role || ((f.type === 'date' || f.type === 'datetime') ? 'date' : idx === 0 ? 'groupBy' : idx === 1 ? 'splitBy' : 'filter');
        const roleSel = roleList.querySelector(`[data-role-index="${idx}"]`);
        const aggSel = roleList.querySelector(`[data-agg-index="${idx}"]`);
        if (roleSel) roleSel.value = role;
        if (aggSel) aggSel.value = saved?.aggregation || (f.type === 'number' || f.type === 'money' ? 'sum' : 'count');
      });
    };
    const fieldSearch = modal.querySelector('#traffic-field-search');
    const clearSearch = modal.querySelector('#traffic-field-search-clear');
    const filterFields = () => {
      const q = norm(fieldSearch.value);
      modal.querySelectorAll('.traffic-field-option').forEach(option => {
        option.hidden = q && !norm(option.dataset.fieldSearch || '').includes(q);
      });
      clearSearch.classList.toggle('show', Boolean(fieldSearch.value));
    };
    fieldSearch.oninput = filterFields;
    clearSearch.onclick = () => {
      fieldSearch.value = '';
      filterFields();
      fieldSearch.focus();
    };
    modal.querySelectorAll('.traffic-format-card').forEach(card => {
      card.onclick = () => {
        modal.querySelectorAll('.traffic-format-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      };
    });
    checks.forEach(ch => {
      ch.onchange = () => {
        const selected = Array.from(checks).filter(x => x.checked);
        if (selected.length > 10) {
          ch.checked = false;
          notify('В один виджет можно добавить не больше 10 полей.', 'e');
        }
        modal.querySelector('#traffic-selected-count').textContent = `Выбрано ${Array.from(checks).filter(x => x.checked).length} из 10`;
        syncRoleList();
      };
    });
    syncRoleList();
    modal.querySelector('#traffic-save-widget').onclick = () => {
      const selected = Array.from(checks).filter(x => x.checked).map(x => x.value);
      if (!selected.length) {
        notify('Выберите хотя бы одно поле CSV.', 'e');
        return;
      }
      const now = new Date().toISOString();
      const selectedFields = selected.map(name => {
        const idx = selected.indexOf(name);
        const f = state.fields.find(field => field.normalizedName === name);
        const role = modal.querySelector(`[data-role-index="${idx}"]`)?.value || ((f.type === 'date' || f.type === 'datetime') ? 'date' : 'groupBy');
        const aggregation = modal.querySelector(`[data-agg-index="${idx}"]`)?.value || (f.type === 'number' || f.type === 'money' ? 'sum' : 'count');
        const values = Array.from(modal.querySelectorAll(`[data-value-index="${idx}"]:checked`)).map(input => input.value);
        return {
          originalName: f.originalName,
          normalizedName: f.normalizedName,
          role,
          type: f.type,
          aggregation,
          values
        };
      });
      const title = modal.querySelector('#traffic-widget-title').value.trim() || selected.join(' + ');
      const format = modal.querySelector('input[name="traffic-widget-format"]:checked')?.value || 'ranking';
      const periodType = modal.querySelector('input[name="traffic-widget-period"]:checked')?.value || 'all';
      const orientation = modal.querySelector('input[name="traffic-widget-orientation"]:checked')?.value || 'auto';
      const nextWidget = {
        id: editing?.id || `widget_${Date.now()}`,
        title,
        format,
        orientation,
        selectedFields,
        period: { type: periodType, dateFrom: null, dateTo: null },
        filters: [],
        textBlocks: ['total','average','peak','summary'],
        chart: { type: 'auto', showPeak: true, showLegend: true },
        createdAt: editing?.createdAt || now,
        updatedAt: now
      };
      if (editing) {
        const index = state.widgets.findIndex(w => w.id === editing.id);
        if (index >= 0) state.widgets[index] = nextWidget;
      } else {
        state.widgets.push(nextWidget);
      }
      localStorage.setItem(STORAGE.widgets, JSON.stringify(state.widgets));
      closeModal();
      renderTrafficAnalytics();
      notify(editing ? 'Виджет обновлён' : 'Виджет сохранён', 's');
    };
  }

  function showClearModal() {
    const modal = document.getElementById('traffic-modal');
    if (!modal) return;
    modal.innerHTML = `
      <div class="traffic-modal-card">
        <h2>Очистить импортированный CSV?</h2>
        <p class="traffic-muted">Данные файла будут удалены из браузера. Пользовательские виджеты можно оставить или также удалить.</p>
        <div class="traffic-modal-actions tz-clear-actions">
          <button class="traffic-btn" data-traffic-close>Отмена</button>
          <button class="traffic-btn" id="traffic-clear-only">Очистить только CSV</button>
          <button class="traffic-btn danger" id="traffic-clear-all">Очистить CSV и виджеты</button>
        </div>
      </div>`;
    modal.classList.add('open');
    bindModalDismiss(modal);
    modal.querySelector('[data-traffic-close]').onclick = closeModal;
    modal.querySelector('#traffic-clear-only').onclick = () => {
      clearTrafficMemory(false);
      closeModal();
      renderTrafficAnalytics();
      notify('CSV очищена', 's');
    };
    modal.querySelector('#traffic-clear-all').onclick = () => {
      clearTrafficMemory(true);
      closeModal();
      renderTrafficAnalytics();
      notify('CSV и виджеты очищены', 's');
    };
  }

  function closeModal() {
    const modal = document.getElementById('traffic-modal');
    if (modal) {
      modal.classList.remove('open');
      modal.innerHTML = '';
    }
  }

  function bindModalDismiss(modal) {
    modal.onclick = e => {
      if (e.target === modal) closeModal();
    };
  }

  function clearTrafficMemory(withWidgets) {
    state.rows = null;
    state.fields = null;
    state.mapping = null;
    state.meta = null;
    state.processing = null;
    state._idbTried = false;
    [STORAGE.rows, STORAGE.mapping, STORAGE.fields, STORAGE.meta, STORAGE.draft].forEach(k => localStorage.removeItem(k));
    idbDel();
    if (withWidgets) {
      state.widgets = [];
      localStorage.removeItem(STORAGE.widgets);
    }
  }

  function deleteWidget(id) {
    if (!confirm('Удалить виджет?')) return;
    state.widgets = (state.widgets || []).filter(w => w.id !== id);
    localStorage.setItem(STORAGE.widgets, JSON.stringify(state.widgets));
    renderTrafficAnalytics();
  }

  const TZ_WIDGET_LIMIT = 50;

  function exportWidgets() {
    if (!state.widgets?.length) {
      notify('Нет созданных виджетов для экспорта.', 'e');
      return;
    }
    const payload = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      source: 'crmTrafficAnalytics',
      widgets: state.widgets
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `crm-traffic-widgets-${new Date().toISOString().slice(0,10)}.crm-traffic-widgets.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    notify('Настройки виджетов экспортированы', 's');
  }

  function importWidgets(file) {
    const reader = new FileReader();
    reader.onerror = () => notify('Не удалось прочитать файл настроек.', 'e');
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || ''));
        if (!Array.isArray(data.widgets)) throw new Error('Некорректный файл настроек.');
        // v2: виджеты определяются конфигом (kind/dimension/metric), не привязаны
        // к именам колонок — переносимы между импортами. v1 мигрируем.
        const prepared = data.widgets.map(w => {
          const mig = tzMigrateWidget(w);
          return { ...mig, id: `widget_${Date.now()}_${Math.random().toString(16).slice(2)}`, updatedAt: new Date().toISOString() };
        }).filter(Boolean);
        if (!prepared.length) throw new Error('В файле нет валидных виджетов.');
        const replace = confirm('Заменить текущие виджеты импортируемыми? Нажмите Отмена, чтобы добавить к текущим.');
        const next = replace ? prepared : [...(state.widgets || []), ...prepared];
        state.widgets = next.slice(0, TZ_WIDGET_LIMIT);
        localStorage.setItem(STORAGE.widgets, JSON.stringify(state.widgets));
        renderTrafficAnalytics();
        notify('Настройки виджетов импортированы', 's');
      } catch(e) {
        notify(e.message || 'Не удалось импортировать настройки.', 'e');
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  function parseDate(v) {
    const s = String(v || '').trim();
    if (!s) return null;
    const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (ru) {
      const d = new Date(+ru[3], +ru[2] - 1, +ru[1], +(ru[4] || 0), +(ru[5] || 0), +(ru[6] || 0));
      return Number.isNaN(d.getTime()) ? null : { date: d, hasTime: !!ru[4] };
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return { date: d, hasTime: /T|\d{1,2}:\d{2}/.test(s) };
  }

  function parseNum(v) {
    const s = String(v || '')
      .replace(/\s/g, '')
      .replace(/,/g, '.')
      .replace(/[^\d.-]/g, '');
    return s ? Number(s) : NaN;
  }

  function splitValue(v) {
    const s = String(v || '').trim();
    if (!s) return ['Не указано'];
    return s.split(/[,;|]/).map(x => x.trim()).filter(Boolean).slice(0, 20);
  }

  function startOfWeek(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay() || 7;
    x.setDate(x.getDate() - day + 1);
    return x;
  }

  function weekday(d) {
    return ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][d.getDay()];
  }

  function fmtDate(d) {
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function fmtDateTime(d) {
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  /* ════════════════════════════════════════════════════════════════
     TZ «ТРАФИК» — аналитические виджеты строго по колонкам amoCRM.
     Источник данных: state.rows (объекты по normalizedName; дубли → " #2").
     ════════════════════════════════════════════════════════════════ */

  // Колонки amoCRM. Для дублей primary/reserve. row-объекты используют
  // normalizedName: первое вхождение = базовое имя, второе = "имя #2".
  const TZC = {
    id:        ['ID'],
    created:   ['Дата создания сделки'],
    closed:    ['Дата закрытия'],
    stage:     ['Этап сделки'],
    reason:    ['Причина закрытия карточки'],
    source:    ['Источник обращения'],            // primary, НЕ "Источник обращения #2"
    city:      ['Город'],
    responsible:['Ответственный'],
    qual:      ['Квал лид'],
    visitDate: ['Дата визита'],
    realizDate:['Дата реализации'],
    success:   ['Успешное закрытие карточки'],
    cost:      ['Стоимость лида'],
    landing:   ['Посадка'],
    revenue:   ['Доходность #2', 'Доходность']     // primary "Доходность.1" (#2), reserve "Доходность"
  };
  const WARM_SOURCE = 'Теплые лиды';
  const EMPTY_LABEL = 'Не заполнено';

  function tzEmpty(v) {
    if (v === null || v === undefined) return true;
    const s = String(v).trim().toLowerCase();
    return s === '' || s === 'nan' || s === 'none' || s === 'null' || s === 'undefined';
  }
  // Получить значение строки по канон. имени (учитывает что в state.rows ключ = normalizedName)
  function tzVal(row, candidates) {
    for (const name of candidates) {
      if (name in row && !tzEmpty(row[name])) return row[name];
      // fallback: точное совпадение по normalizedName уже покрыто; пробуем без изменений
    }
    // вернём пустую строку первого кандидата если ничего не нашли
    return '';
  }
  function tzRaw(row, candidates) {
    for (const name of candidates) if (name in row) return row[name];
    return '';
  }
  function tzMoney(v) {
    if (tzEmpty(v)) return null;
    const c = String(v).replace(/\s/g, '').replace(/ /g, '').replace('₽', '').replace(',', '.').trim();
    if (!c) return null;
    const n = Number(c);
    return Number.isFinite(n) ? n : null;
  }
  function tzDate(v) {
    if (tzEmpty(v)) return null;
    const s = String(v).trim();
    if (s.toLowerCase() === 'не закрыта') return null;
    const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    const d = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function tzNum(n) { return Number(n || 0).toLocaleString('ru-RU'); }
  // Русское склонение: tzPlural(2,'лид','лида','лидов') → 'лида'
  function tzPlural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }
  function tzMoneyFmt(n) { return (n === null || n === undefined || !Number.isFinite(n)) ? '—' : Math.round(n).toLocaleString('ru-RU') + ' ₽'; }
  function tzPct(part, total) { return total > 0 ? (part / total * 100) : 0; }
  function tzPctFmt(part, total) { return total > 0 ? (part / total * 100).toFixed(1) + '%' : '—'; }
  function tzDivFmt(a, b, fmt) { if (!b) return '—'; const v = a / b; return fmt ? fmt(v) : (Math.round(v)).toLocaleString('ru-RU'); }
  function tzMedian(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function tzPercentile(arr, p) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const k = (s.length - 1) * p / 100;
    const f = Math.floor(k), c = Math.min(f + 1, s.length - 1);
    return s[f] + (s[c] - s[f]) * (k - f);
  }
  function tzHours(h) { return h.toFixed(1) + ' ч'; }

  // ── ВЫБОРКА с глобальными фильтрами (ТЗ §6) ──
  function tzAllRows() { return state.rows || []; }
  function tzDateRange() {
    const f = state.tzFilters;
    const now = new Date();
    if (f.period === 'today') return [new Date(now.getFullYear(), now.getMonth(), now.getDate()), now];
    if (f.period === 'week') return [startOfWeek(now), now];
    if (f.period === 'month') return [new Date(now.getFullYear(), now.getMonth(), 1), now];
    if (f.period === 'range') {
      const from = f.dateFrom ? new Date(f.dateFrom + 'T00:00:00') : null;
      const to = f.dateTo ? new Date(f.dateTo + 'T23:59:59') : null;
      return [from, to];
    }
    return [null, null];
  }
  function tzFilteredRows() {
    const f = state.tzFilters;
    let rows = tzAllRows();
    const [from, to] = tzDateRange();
    if (from || to) {
      rows = rows.filter(r => {
        const d = tzDate(tzRaw(r, TZC.created));
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }
    const inList = (list, val) => !list || !list.length || list.includes(String(val).trim());
    if (f.source && f.source.length) rows = rows.filter(r => inList(f.source, tzRaw(r, TZC.source)));
    if (f.city && f.city.length) rows = rows.filter(r => inList(f.city, tzRaw(r, TZC.city)));
    if (f.responsible && f.responsible.length) rows = rows.filter(r => inList(f.responsible, tzRaw(r, TZC.responsible)));
    if (f.success && f.success.length) rows = rows.filter(r => inList(f.success, tzRaw(r, TZC.success)));
    return rows;
  }

  // Метка периода по фактическим датам создания в выборке (для подзаголовков)
  function tzPeriodLabel(rows) {
    let min = null, max = null;
    rows.forEach(r => {
      const d = tzDate(tzRaw(r, TZC.created));
      if (!d) return;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    });
    if (!min || !max) return '';
    const f = d => `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getFullYear()).slice(-2)}`;
    return f(min) === f(max) ? f(min) : `${f(min)}–${f(max)}`;
  }

  // Уникальные значения для селектов фильтра
  function tzUnique(candidates) {
    const set = new Map();
    tzAllRows().forEach(r => {
      const v = String(tzRaw(r, candidates)).trim();
      if (!tzEmpty(v)) set.set(v, (set.get(v) || 0) + 1);
    });
    return Array.from(set, ([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
  }

  function renderTzBase() {
    if (!state.rows || !state.rows.length) {
      return `<div class="traffic-grid traffic-base-grid"><div class="tz-empty">Нет данных для расчёта</div></div>`;
    }
    const rows = tzFilteredRows();
    _tzIssues = {};
    _tzPeriod = tzPeriodLabel(rows);
    return `
      ${renderTzFilters()}
      <div class="traffic-grid tz-grid ${tzGridClass()}">
        ${tzWidgetTrend(rows)}
        ${tzWidgetSource(rows)}
        ${tzWidgetRealizations(rows)}
        ${tzWidgetWarmFinance(rows)}
        ${tzWidgetStages(rows)}
        ${tzWidgetReasons(rows)}
        ${tzWidgetLifetime(rows)}
        ${tzWidgetResponsible(rows)}
        ${tzWidgetCities(rows)}
        ${tzWidgetQuality(rows)}
      </div>
      <div class="tz-issue-overlay" id="tz-issue-overlay" aria-hidden="true"></div>`;
  }

  // Список ID для модалки «вне расчёта»
  function tzIssueIds(rows, predicate) {
    return rows.filter(predicate).map(tzId).filter(id => id && id !== '—');
  }

  // ═══ ВИДЖЕТ 0: Трафик (кол-во лидов во времени) ═══
  // Базовые параметры — источник/период из глобальных фильтров.
  // ≤31 день → столбики с датой и кол-вом (текст повёрнут на 90°).
  // Иначе → сглаженная линия тренда (как визиты на перс. странице).
  function tzWidgetTrend(rows) {
    // Группируем по дню создания
    const byDay = new Map();
    let minD = null, maxD = null;
    rows.forEach(r => {
      const d = tzDate(tzRaw(r, TZC.created));
      if (!d) return;
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const key = +day;
      byDay.set(key, (byDay.get(key) || 0) + 1);
      if (!minD || day < minD) minD = day;
      if (!maxD || day > maxD) maxD = day;
    });
    if (!byDay.size) {
      return tzWidgetShell('Трафик', 'Лиды во времени', '', '<div class="tz-empty-inline">Нет датированных лидов в выборке</div>', { wide: true, className: 'tz-trend-widget' });
    }
    // Полный диапазон дней
    const days = [];
    for (let d = new Date(minD); d <= maxD; d.setDate(d.getDate() + 1)) {
      const day = new Date(d);
      days.push({ date: day, value: byDay.get(+day) || 0 });
    }
    const totalLeads = days.reduce((s, x) => s + x.value, 0);
    const peak = days.reduce((a, b) => b.value > (a?.value || 0) ? b : a, null);
    const spanDays = days.length;
    // Всегда сглаженная линия трендов (как при выборке «Всё»). Для 1–2 точек —
    // столбики (линию строить не из чего).
    const body = spanDays <= 2 ? tzTrendBars(days, peak) : tzTrendLine(days);
    const sub = `${fmtDate(minD)} — ${fmtDate(maxD)} · ${spanDays} дн.`;
    const issues = tzIssueIds(rows, r => tzDate(tzRaw(r, TZC.created)) === null);
    return tzWidgetShell('Трафик', sub, tzNum(totalLeads) + ' лидов', body, { wide: true, noPeriod: true, className: 'tz-trend-widget', issues: { ids: issues, hint: 'Сделки без валидной «Дата создания сделки» — не легли на график.' } });
  }

  function tzTrendBars(days, peak) {
    const max = Math.max(...days.map(d => d.value), 1);
    return `
      <div class="tz-trend-bars" style="--tz-cols:${days.length}">
        ${days.map(d => {
          const h = Math.max(3, d.value / max * 100);
          const isPeak = peak && +d.date === +peak.date;
          return `<div class="tz-tb ${isPeak ? 'peak' : ''}" title="${fmtDate(d.date)}: ${d.value}">
            <span class="tz-tb-val">${d.value}</span>
            <span class="tz-tb-fill" style="height:${h}%"></span>
            <span class="tz-tb-day">${String(d.date.getDate()).padStart(2, '0')}</span>
          </div>`;
        }).join('')}
      </div>`;
  }

  function tzTrendLine(days) {
    // Сглаженная линия (Catmull-Rom → Безье), как на перс. странице по визитам
    const W = 640, H = 150, padX = 6, padY = 14;
    const max = Math.max(...days.map(d => d.value), 1);
    const n = days.length;
    const pts = days.map((d, i) => [
      padX + (n === 1 ? 0 : i / (n - 1)) * (W - padX * 2),
      H - padY - (d.value / max) * (H - padY * 2)
    ]);
    let path = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      path += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    const area = path + ` L ${pts[n - 1][0].toFixed(1)} ${H} L ${pts[0][0].toFixed(1)} ${H} Z`;
    const peakIdx = days.reduce((a, d, i) => d.value > days[a].value ? i : a, 0);
    return `
      <div class="tz-trend-line">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="tz-trend-svg">
          <defs><linearGradient id="tzTrendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--acc,#4f7cff)" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="var(--acc,#4f7cff)" stop-opacity="0"/>
          </linearGradient></defs>
          <path class="tz-trend-area" d="${area}" fill="url(#tzTrendGrad)"/>
          <path class="tz-trend-path" d="${path}" pathLength="1" fill="none" stroke="var(--acc,#4f7cff)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
          <circle class="tz-trend-peak" cx="${pts[peakIdx][0].toFixed(1)}" cy="${pts[peakIdx][1].toFixed(1)}" r="3.5" fill="var(--acc,#4f7cff)"/>
        </svg>
        <div class="tz-trend-axis"><span>${fmtDate(days[0].date)}</span><span>пик ${days[peakIdx].value} · ${fmtDate(days[peakIdx].date)}</span><span>${fmtDate(days[n - 1].date)}</span></div>
      </div>`;
  }

  // Кастомный мультиселект (чекбоксы в поповере)
  // SVG-иконки фильтров (Bootstrap Icons, fill=currentColor)
  const TZ_FILTER_ICONS = {
    source: '<path d="M4.98 1a.5.5 0 0 0-.39.188L1.54 5H6a.5.5 0 0 1 .5.5a1.5 1.5 0 0 0 3 0A.5.5 0 0 1 10 5h4.46l-3.05-3.812A.5.5 0 0 0 11.02 1zM3.81.563A1.5 1.5 0 0 1 4.98 0h6.04a1.5 1.5 0 0 1 1.17.563l3.7 4.625a.5.5 0 0 1 .106.374l-.39 3.124A1.5 1.5 0 0 1 14.117 10H1.883A1.5 1.5 0 0 1 .394 8.686l-.39-3.124a.5.5 0 0 1 .106-.374zM.125 11.17A.5.5 0 0 1 .5 11H6a.5.5 0 0 1 .5.5a1.5 1.5 0 0 0 3 0a.5.5 0 0 1 .5-.5h5.5a.5.5 0 0 1 .496.562l-.39 3.124A1.5 1.5 0 0 1 14.117 16H1.883a1.5 1.5 0 0 1-1.489-1.314l-.39-3.124a.5.5 0 0 1 .121-.393z"/>',
    city: '<g><path d="m10.495 6.92l1.278-.619a.483.483 0 0 0 .126-.782c-.252-.244-.682-.139-.932.107c-.23.226-.513.373-.816.53l-.102.054c-.338.178-.264.626.1.736a.48.48 0 0 0 .346-.027ZM7.741 9.808V9.78a.413.413 0 1 1 .783.183l-.22.443a.6.6 0 0 1-.12.167l-.193.185a.36.36 0 1 1-.5-.516l.112-.108a.45.45 0 0 0 .138-.326M5.672 12.5l.482.233A.386.386 0 1 0 6.32 12h-.416a.7.7 0 0 1-.419-.139l-.277-.206a.302.302 0 1 0-.298.52z"/><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0M1.612 10.867l.756-1.288a1 1 0 0 1 1.545-.225l1.074 1.005a.986.986 0 0 0 1.36-.011l.038-.037a.88.88 0 0 0 .26-.755c-.075-.548.37-1.033.92-1.099c.728-.086 1.587-.324 1.728-.957c.086-.386-.114-.83-.361-1.2c-.207-.312 0-.8.374-.8c.123 0 .24-.055.318-.15l.393-.474c.196-.237.491-.368.797-.403c.554-.064 1.407-.277 1.583-.973c.098-.391-.192-.634-.484-.88c-.254-.212-.51-.426-.515-.741a7 7 0 0 1 3.425 7.692a1 1 0 0 0-.087-.063l-.316-.204a1 1 0 0 0-.977-.06l-.169.082a1 1 0 0 1-.741.051l-1.021-.329A1 1 0 0 0 11.205 9h-.165a1 1 0 0 0-.945.674l-.172.499a1 1 0 0 1-.404.514l-.802.518a1 1 0 0 0-.458.84v.455a1 1 0 0 0 1 1h.257a1 1 0 0 1 .542.16l.762.49a1 1 0 0 0 .283.126a7 7 0 0 1-9.49-3.409Z"/></g>',
    responsible: '<path d="M7 14s-1 0-1-1s1-4 5-4s5 3 5 4s-1 1-1 1zm4-6a3 3 0 1 0 0-6a3 3 0 0 0 0 6m-5.784 6A2.24 2.24 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.3 6.3 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1zM4.5 8a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5"/>',
    success: '<g><path fill-rule="evenodd" d="M11 15a4 4 0 1 0 0-8a4 4 0 0 0 0 8m5-4a5 5 0 1 1-10 0a5 5 0 0 1 10 0"/><path d="M9.438 11.944c.047.596.518 1.06 1.363 1.116v.44h.375v-.443c.875-.061 1.386-.529 1.386-1.207c0-.618-.39-.936-1.09-1.1l-.296-.07v-1.2c.376.043.614.248.671.532h.658c-.047-.575-.54-1.024-1.329-1.073V8.5h-.375v.45c-.747.073-1.255.522-1.255 1.158c0 .562.378.92 1.007 1.066l.248.061v1.272c-.384-.058-.639-.27-.696-.563h-.668zm1.36-1.354c-.369-.085-.569-.26-.569-.522c0-.294.216-.514.572-.578v1.1zm.432.746c.449.104.655.272.655.569c0 .339-.257.571-.709.614v-1.195z"/><path d="M1 0a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h4.083q.088-.517.258-1H3a2 2 0 0 0-2-2V3a2 2 0 0 0 2-2h10a2 2 0 0 0 2 2v3.528c.38.34.717.728 1 1.154V1a1 1 0 0 0-1-1z"/><path d="M9.998 5.083L10 5a2 2 0 1 0-3.132 1.65a6 6 0 0 1 3.13-1.567"/></g>',
  };
  function tzMultiSelect(key, label, cand) {
    const sel = state.tzFilters[key] || [];
    const items = tzUnique(cand);
    const btnLabel = sel.length === 0 ? label : (sel.length === 1 ? sel[0] : `${label}: ${sel.length}`);
    const icon = TZ_FILTER_ICONS[key];
    const selText = sel.length === 1 ? sel[0] : String(sel.length);
    const list = items.map(x => {
      const on = sel.includes(x.label);
      return `<label class="tz-ms-opt ${on ? 'on' : ''}"><input type="checkbox" data-tz-ms-cb="${esc(key)}" value="${esc(x.label)}" ${on ? 'checked' : ''}><span class="tz-ms-name" title="${esc(x.label)}">${esc(x.label)}</span><span class="tz-ms-n">${x.n}</span></label>`;
    }).join('');
    return `
      <div class="tz-ms" data-tz-ms-wrap="${esc(key)}">
        <button class="tz-ms-btn ${sel.length ? 'active' : ''} ${icon ? 'tz-ms-iconic' : ''}" data-tz-ms="${esc(key)}" type="button" aria-label="${esc(label)}" title="${esc(btnLabel)}">
          ${icon ? `<svg class="tz-ms-ic" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">${icon}</svg>` : ''}
          ${(!icon || sel.length) ? `<span class="tz-ms-btn-label">${esc(icon ? selText : btnLabel)}</span>` : ''}
          <svg viewBox="0 0 12 12" width="11" height="11"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="tz-ms-panel" data-tz-ms-panel="${esc(key)}" hidden>
          <div class="tz-ms-panel-head"><span>${esc(label)}</span>${sel.length ? `<button class="tz-ms-clear" data-tz-ms-clear="${esc(key)}" type="button">Очистить</button>` : ''}</div>
          <div class="tz-ms-list">${list || '<div class="tz-ms-empty">Нет значений</div>'}</div>
          <button class="tz-ms-apply" data-tz-ms-apply type="button">Готово</button>
        </div>
      </div>`;
  }

  function renderTzFilters() {
    const f = state.tzFilters;
    const periods = [['all','Всё'],['today','Сегодня'],['week','Неделя'],['month','Месяц']];
    const total = tzFilteredRows().length;
    const all = tzAllRows().length;
    const rangeActive = f.period === 'range';
    const rangeLabel = rangeActive && (f.dateFrom || f.dateTo)
      ? `${f.dateFrom ? f.dateFrom.split('-').reverse().join('.') : '…'} – ${f.dateTo ? f.dateTo.split('-').reverse().join('.') : '…'}`
      : 'Период';
    const hasFilter = (f.source.length || f.city.length || f.responsible.length || f.success.length || f.period !== 'all');
    return `
      <div class="tz-filters">
        <div class="tz-filter-periods">
          ${periods.map(([v, l]) => `<button class="tz-fp ${f.period === v ? 'active' : ''}" data-tz-period="${v}" type="button">${l}</button>`).join('')}
          <div class="tz-range" data-tz-range-wrap>
            <button class="tz-fp tz-fp-range ${rangeActive ? 'active' : ''}" data-tz-range-toggle type="button">📅 ${esc(rangeLabel)}</button>
            <div class="tz-range-panel" data-tz-range-panel hidden>
              <label>От<input type="date" data-tz-date="from" value="${esc(f.dateFrom || '')}"></label>
              <label>До<input type="date" data-tz-date="to" value="${esc(f.dateTo || '')}"></label>
              <button class="tz-ms-apply" data-tz-range-apply type="button">Применить</button>
            </div>
          </div>
        </div>
        <div class="tz-filter-selects">
          ${tzMultiSelect('source', 'Источник', TZC.source)}
          ${tzMultiSelect('city', 'Город', TZC.city)}
          ${tzMultiSelect('responsible', 'Ответственный', TZC.responsible)}
          ${tzMultiSelect('success', 'Вид реализации', TZC.success)}
        </div>
        <div class="tz-filter-count">В выборке: <b>${tzNum(total)}</b>${total !== all ? ` из ${tzNum(all)}` : ''} лидов${hasFilter ? `<button class="tz-reset-inline" data-tz-reset type="button" aria-label="Очистить выборку" title="Очистить выборку"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg></button>` : ''}${tzModeToggle()}</div>
      </div>`;
  }

  // ── Рейтинговая строка (ТЗ §7.2) ──
  function tzRankRow(label, value, total, max, opts = {}) {
    const pct = tzPct(value, total);
    const fillPct = max > 0 ? (value / max * 100) : 0;
    const cls = shareColorClass(opts.colorIndex || 0);
    const clickAttr = opts.clickFilter ? `data-tz-rank-filter="${esc(opts.clickFilter)}" data-tz-rank-value="${esc(label)}"` : '';
    const shown = opts.display != null ? opts.display : label;
    return `
      <div class="tz-rank-row ${opts.clickFilter ? 'clickable' : ''}" ${clickAttr}>
        <div class="tz-rank-top">
          <span class="tz-rank-label" title="${esc(label)}">${esc(shown)}</span>
          <span class="tz-rank-value">${tzNum(value)}</span>
          <span class="tz-rank-percent">${pct.toFixed(1)}%</span>
        </div>
        <div class="tz-rank-bar"><div class="tz-rank-bar-fill ${cls}" style="width:${Math.max(2, fillPct).toFixed(1)}%"></div></div>
      </div>`;
  }
  function shareColorClass(i) { return i >= 6 ? 'tz-c6' : 'tz-c' + i; }

  // Сборка топ-рейтинга с объединением «Прочие» (ТЗ §7.3)
  function tzRanking(rows, candidates, { emptyAs = EMPTY_LABEL } = {}) {
    const counts = new Map();
    rows.forEach(r => {
      let v = String(tzRaw(r, candidates)).trim();
      if (tzEmpty(v)) v = emptyAs;
      counts.set(v, (counts.get(v) || 0) + 1);
    });
    const sorted = Array.from(counts, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    if (sorted.length <= 10) return { items: sorted, hasOther: false };
    const top = sorted.slice(0, 10);
    const other = sorted.slice(10).reduce((s, x) => s + x.value, 0);
    return { items: top, other, hasOther: true };
  }

  // Реестр «проблемных» сделок по виджетам (для модалки «!»)
  let _tzIssues = {};
  let _tzPeriod = '';                       // период текущей выборки (для подзаголовков)
  function tzId(row) { const v = String(tzRaw(row, TZC.id)).trim(); return v || '—'; }

  // ФИО → «Фамилия И.О.» (компактно). Несловесные значения (города/система) — без изменений.
  function tzShortFio(s) {
    const p = String(s || '').trim().split(/\s+/).filter(Boolean);
    if (p.length < 2) return s;
    const initials = p.slice(1).map(x => (x[0] || '').toUpperCase() + '.').join('');
    return p[0] + ' ' + initials;
  }
  // Отображаемая подпись разреза: для «Ответственный» сокращаем ФИО
  function tzDimDisplay(dimKey, label) {
    if (label === EMPTY_LABEL || label === 'Прочие') return label;
    return dimKey === 'responsible' ? tzShortFio(label) : label;
  }

  // ── Режимы отображения (компактный / детальный) ──
  function tzActiveTab() { return state.activeTab === 'advanced' ? 'advanced' : 'base'; }
  function tzGlobalMode() { return state.tzView?.[tzActiveTab()] === 'compact' ? 'compact' : 'detailed'; }
  function tzEffMode(key) {
    const ov = state.tzCardMode?.[key];
    return ov === 'compact' || ov === 'detailed' ? ov : tzGlobalMode();
  }
  function tzPersistView() {
    try {
      localStorage.setItem('crmTrafficView', JSON.stringify(state.tzView || {}));
      localStorage.setItem('crmTrafficCardMode', JSON.stringify(state.tzCardMode || {}));
    } catch(_){}
  }
  function tzToggleGlobalMode() {
    const tab = tzActiveTab();
    state.tzView[tab] = tzGlobalMode() === 'compact' ? 'detailed' : 'compact';
    // Сброс персональных override только текущего таба
    const prefix = tab === 'advanced' ? 'cw:' : 'bw:';
    Object.keys(state.tzCardMode || {}).forEach(k => { if (k.startsWith(prefix)) delete state.tzCardMode[k]; });
    tzPersistView();
    renderTrafficAnalytics();
  }
  function tzToggleCard(key) {
    const cur = tzEffMode(key);
    state.tzCardMode[key] = cur === 'compact' ? 'detailed' : 'compact';
    tzPersistView();
    renderTrafficAnalytics();
  }
  window.tzToggleCard = tzToggleCard;
  function tzGridClass() { return tzGlobalMode() === 'compact' ? 'tz-mode-compact' : 'tz-mode-detailed'; }
  // Глобальный сегмент-тумблер «Компактно / Детально» — той же геометрии,
  // что базовый traffic-seg (бегунок + 2 иконки-кнопки)
  const TZ_ICON_COMPACT = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="1.6"/><rect x="13" y="3" width="8" height="8" rx="1.6"/><rect x="3" y="13" width="8" height="8" rx="1.6"/><rect x="13" y="13" width="8" height="8" rx="1.6"/></svg>';
  const TZ_ICON_DETAILED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  function tzModeToggle() {
    const m = tzGlobalMode();
    return `<div class="tz-mode-seg" role="group" aria-label="Режим виджетов">
      <span class="tz-mode-thumb ${m === 'compact' ? 'left' : 'right'}"></span>
      <button class="tz-mode-seg-btn ${m === 'compact' ? 'active' : ''}" data-tz-global-mode="compact" type="button" title="Компактно" aria-label="Компактно">${TZ_ICON_COMPACT}</button>
      <button class="tz-mode-seg-btn ${m === 'detailed' ? 'active' : ''}" data-tz-global-mode="detailed" type="button" title="Детально" aria-label="Детально">${TZ_ICON_DETAILED}</button>
    </div>`;
  }
  // Мини-кнопка свернуть/развернуть в углу виджета (SVG-шеврон)
  function tzCardToggleBtn(wkey, compact) {
    const icon = compact
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
    return `<button class="tz-mode-btn" data-tz-card-toggle="${esc(wkey)}" type="button" aria-label="${compact ? 'Развернуть' : 'Свернуть'}" title="${compact ? 'Развернуть' : 'Свернуть'}">${icon}</button>`;
  }

  function tzWidgetShell(title, subtitle, mainValue, body, opts = {}) {
    let issueBtn = '';
    if (opts.issues && opts.issues.ids && opts.issues.ids.length) {
      const key = 'w' + (Object.keys(_tzIssues).length + 1);
      _tzIssues[key] = { title, hint: opts.issues.hint || '', ids: opts.issues.ids };
      issueBtn = `<button class="tz-issue-btn" data-tz-issue="${key}" type="button" aria-label="Сделки вне расчёта" title="${esc(opts.issues.ids.length + ' сделок вне расчёта')}"><span class="tz-issue-pulse"></span><span class="tz-issue-mark">!</span></button>`;
    }
    const sub = subtitle ? (subtitle + (_tzPeriod && !opts.noPeriod ? ' · ' + _tzPeriod : '')) : '';
    // Режим отображения базового виджета (ключ bw:<className|title>)
    const wkey = 'bw:' + (opts.wkey || opts.className || title);
    const compact = tzEffMode(wkey) === 'compact';
    const toggleBtn = tzCardToggleBtn(wkey, compact);
    // В компактном режиме показываем только значение без слова-метрики
    // (название виджета уже объясняет смысл). opts.compactValue — явное переопределение.
    const shownMain = compact ? (opts.compactValue != null ? opts.compactValue : tzStripUnit(mainValue)) : mainValue;
    return `
      <article class="traffic-widget tz-card ${compact ? 'tz-compact' : (opts.wide ? 'tz-wide' : 'tz-detailed')} ${opts.className || ''}">
        <div class="tz-card-head">
          <div class="tz-card-title">${esc(title)}</div>
          <div class="tz-card-tools">${issueBtn}${toggleBtn}</div>
          ${sub ? `<div class="tz-card-sub">${esc(sub)}</div>` : ''}
        </div>
        ${shownMain ? `<div class="tz-card-main">${shownMain}</div>` : ''}
        ${compact ? '' : `<div class="tz-card-body">${body}</div>`}
      </article>`;
  }
  // Убирает завершающее слово-метрику («436 реализаций» → «436», «15 322 лида» → «15 322»),
  // сохраняя ₽/%/числа.
  function tzStripUnit(v) {
    const s = String(v == null ? '' : v);
    return s.replace(/(?:\s+[А-Яа-яЁё]+\.?)+$/u, '').trim() || s;
  }

  // Ступенчатое кольцо (donut): сегмент = доля топ-N; чем больше значение,
  // тем толще дуга и тем дальше наружу («слой выше») — круговая лесенка.
  // Анимация построения: от меньшего значения к большему (stroke-dashoffset).
  function tzDonut(items, total, centerLabel, centerSub) {
    const safeTotal = Math.max(total, 1);
    const list = (items || []).filter(it => it.value > 0).slice(0, 6);
    const maxV = list.reduce((m, it) => Math.max(m, it.value), 1);
    const INNER = 33, SW_MIN = 7, SW_MAX = 17;            // viewBox 100×100
    // порядок появления: меньшие значения первыми
    const order = list.map((_, i) => i).sort((a, b) => list[a].value - list[b].value);
    const delay = {}; order.forEach((idx, rank) => { delay[idx] = (rank * 0.09).toFixed(2); });
    let cum = 0;
    const arc = (frac, sw, color, d, dash) => {
      const r = INNER + sw / 2;
      const C = 2 * Math.PI * r;
      const A = frac * C;
      const start = cum * 360;
      cum += frac;
      return `<circle class="tz-donut-seg" cx="50" cy="50" r="${r.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${sw.toFixed(2)}" stroke-dasharray="${A.toFixed(2)} ${(C - A + 1).toFixed(2)}" transform="rotate(${start.toFixed(2)} 50 50)" style="--a:${A.toFixed(2)};animation-delay:${d}s"/>`;
    };
    const segs = list.map((it, i) => arc(it.value / safeTotal, SW_MIN + (it.value / maxV) * (SW_MAX - SW_MIN), `var(--tz-c${i % 6})`, delay[i])).join('');
    let rem = '';
    if (cum < 0.999) rem = arc(1 - cum, SW_MIN, 'var(--line,#e4e4e4)', (list.length * 0.09).toFixed(2));
    return `<div class="tz-donut-wrap">
      <div class="tz-donut">
        <svg viewBox="0 0 100 100">${segs}${rem}</svg>
        <div class="tz-donut-hole"><b>${esc(centerLabel)}</b><span>${esc(centerSub || '')}</span></div>
      </div>
    </div>`;
  }

  // ═══ ВИДЖЕТ 1: Лиды по источнику ═══
  function tzWidgetSource(rows) {
    const total = rows.length;
    const rank = tzRanking(rows, TZC.source);
    const max = rank.items[0]?.value || 1;
    // Кол-во уникальных источников (включая «Не заполнено»)
    const srcCount = new Set(rows.map(r => { const v = String(tzRaw(r, TZC.source)).trim(); return tzEmpty(v) ? EMPTY_LABEL : v; })).size;
    const body = `
      <div class="tz-rank-with-ring">
        <div class="tz-rank-list">
          ${rank.items.map((it, i) => tzRankRow(it.label, it.value, total, max, { colorIndex: i, clickFilter: 'source' })).join('')}
          ${rank.hasOther ? tzRankRow('Прочие', rank.other, total, max, { colorIndex: 6 }) : ''}
        </div>
        ${tzDonut(rank.items, total, tzNum(total), 'лидов')}
      </div>`;
    const issues = tzIssueIds(rows, r => tzEmpty(tzRaw(r, TZC.source)));
    const mainVal = `${tzNum(srcCount)} ${tzPlural(srcCount, 'источник', 'источника', 'источников')} / ${tzNum(total)} ${tzPlural(total, 'лид', 'лида', 'лидов')}`;
    return tzWidgetShell('Лиды по источнику', 'Источник обращения', mainVal, body, { wide: true, className: 'tz-source-widget', compactValue: tzNum(total), issues: { ids: issues, hint: 'Сделки без «Источник обращения» — попали в «Не заполнено».' } });
  }

  // ═══ ВИДЖЕТ: Успешные реализации ═══
  // По виду реализации (Успешное закрытие карточки), доходности, средней
  // доходности за месяц, самым доходным источнику/городу/ответственному.
  function tzWidgetRealizations(rows) {
    const success = rows.filter(tzIsSuccess);
    if (!success.length) {
      return tzWidgetShell('Успешные реализации', 'Закрытые в плюс', '', '<div class="tz-empty-inline">Нет успешных реализаций в выборке</div>', { wide: true, className: 'tz-realiz-widget' });
    }
    // Распределение по виду реализации (Успешное закрытие карточки)
    const byKind = new Map();
    success.forEach(r => { let k = String(tzRaw(r, TZC.success)).trim(); if (tzEmpty(k)) k = 'Успешно (без вида)'; byKind.set(k, (byKind.get(k) || 0) + 1); });
    const kinds = Array.from(byKind, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const kindMax = kinds[0]?.value || 1;
    // Доходность (по успешным с доходностью)
    const revRows = success.filter(r => tzRevenue(r) !== null);
    const revenueSum = revRows.reduce((s, r) => s + tzRevenue(r), 0);
    const avgRevenue = revRows.length ? revenueSum / revRows.length : 0;
    // Средняя доходность за месяц: группируем доходные сделки по месяцу реализации/закрытия
    const byMonth = new Map();
    revRows.forEach(r => {
      const d = tzDate(tzRaw(r, TZC.realizDate)) || tzDate(tzRaw(r, TZC.closed)) || tzDate(tzRaw(r, TZC.created));
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth.has(key)) byMonth.set(key, { sum: 0, n: 0 });
      const m = byMonth.get(key); m.sum += tzRevenue(r); m.n++;
    });
    const months = Array.from(byMonth, ([key, v]) => ({ key, sum: v.sum, n: v.n })).sort((a, b) => a.key.localeCompare(b.key));
    const avgMonthRevenue = months.length ? months.reduce((s, m) => s + m.sum, 0) / months.length : 0;
    // Топ-доходные по источнику/городу/ответственному
    const topBy = (cand) => {
      const map = new Map();
      revRows.forEach(r => { let g = String(tzRaw(r, cand)).trim(); if (tzEmpty(g)) g = EMPTY_LABEL; map.set(g, (map.get(g) || 0) + tzRevenue(r)); });
      const arr = Array.from(map, ([label, sum]) => ({ label, sum })).sort((a, b) => b.sum - a.sum);
      return arr[0] || null;
    };
    const topSource = topBy(TZC.source), topCity = topBy(TZC.city), topResp = topBy(TZC.responsible);
    // Горизонтальные бары доходности по месяцам, сортировка по номеру месяца (янв→дек)
    const mMax = Math.max(...months.map(m => m.sum), 1);
    const multiYear = new Set(months.map(m => m.key.split('-')[0])).size > 1;
    const monthsSorted = months.slice().sort((a, b) => {
      const ma = +a.key.split('-')[1], mb = +b.key.split('-')[1];
      return ma !== mb ? ma - mb : a.key.localeCompare(b.key);
    });
    const monthBars = months.length ? `
      <div class="tz-realiz-months">
        ${monthsSorted.map(m => {
          const [y, mo] = m.key.split('-');
          const mn = ['', 'янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][+mo];
          const lbl = multiYear ? `${mn} ${y.slice(2)}` : mn;
          return `<div class="tz-rm" title="${mn} ${y}: ${tzMoneyFmt(m.sum)} (${m.n})"><span class="tz-rm-lbl">${lbl}</span><span class="tz-rm-track"><span class="tz-rm-fill" style="width:${Math.max(2, m.sum / mMax * 100)}%"></span></span><span class="tz-rm-val">${tzMoneyFmt(m.sum)}</span></div>`;
        }).join('')}
      </div>` : '';
    const kpis = [
      ['Реализаций', tzNum(success.length)],
      ['Доходность', tzMoneyFmt(revenueSum)],
      ['Средняя', tzMoneyFmt(avgRevenue)],
      ['Сред./мес', tzMoneyFmt(avgMonthRevenue)],
    ];
    const tops = [
      ['Топ источник', topSource, false],
      ['Топ город', topCity, false],
      ['Топ ответственный', topResp, true],
    ];
    const body = `
      <div class="tz-realiz-top">
        <div class="tz-kpi-grid tz-kpi-4">
          ${kpis.map(([l, v]) => `<div class="tz-kpi"><div class="tz-kpi-lbl">${esc(l)}</div><div class="tz-kpi-val">${v}</div></div>`).join('')}
        </div>
        ${monthBars ? `<div class="tz-realiz-chart"><div class="tz-realiz-chart-t">Доходность по месяцам</div>${monthBars}</div>` : ''}
      </div>
      <div class="tz-realiz-kinds">
        <div class="tz-realiz-sub">Виды реализации</div>
        ${kinds.map((k, i) => tzRankRow(k.label, k.value, success.length, kindMax, { colorIndex: i })).join('')}
      </div>
      <div class="tz-realiz-tops">
        ${tops.map(([l, t, isResp]) => { const nm = t ? (isResp ? tzShortFio(t.label) : t.label) : '—'; return `<div class="tz-realiz-toprow"><span class="tz-realiz-toplbl">${esc(l)}</span><span class="tz-realiz-topname" title="${esc(t ? t.label : '—')}">${esc(nm)}</span><span class="tz-realiz-topsum">${t ? tzMoneyFmt(t.sum) : '—'}</span></div>`; }).join('')}
      </div>`;
    return tzWidgetShell('Успешные реализации', 'Закрытые в плюс', tzNum(success.length) + ' реализаций', body, { wide: true, className: 'tz-realiz-widget' });
  }

  // ═══ ВИДЖЕТ 2: Финансы тёплых лидов ═══
  function tzWidgetWarmFinance(rows) {
    const warm = rows.filter(r => String(tzRaw(r, TZC.source)).trim() === WARM_SOURCE);
    if (!warm.length) {
      return tzWidgetShell('Финансы тёплых лидов', WARM_SOURCE, '', '<div class="tz-empty-inline">Нет тёплых лидов для финансового расчёта</div>', { wide: true, className: 'tz-finance-widget' });
    }
    const fin = tzWarmStats(warm);
    const ringPct = Math.round(fin.revenueCoverage);
    const romiOk = fin.revenueCoverage >= 90;
    const kpis = [
      ['Тёплые лиды', tzNum(fin.count)],
      ['Расход', tzMoneyFmt(fin.costSum)],
      ['CPL', tzDivFmt(fin.costSum, fin.costCount, tzMoneyFmt)],
      ['Квал. лиды', tzNum(fin.qualCount)],
      ['CPQL', tzDivFmt(fin.costSum, fin.qualCount, tzMoneyFmt)],
      ['Визиты', tzNum(fin.visitCount)],
      ['CPV', tzDivFmt(fin.costSum, fin.visitCount, tzMoneyFmt)],
      ['Реализации', tzNum(fin.successCount)],
      ['CPA', tzDivFmt(fin.costSum, fin.successCount, tzMoneyFmt)],
      ['Доходность', tzMoneyFmt(fin.revenueSum)],
    ];
    // Подтаблица по посадкам
    const landRows = tzWarmByLanding(warm);
    const landTable = `
      <div class="tz-land-table">
        <div class="tz-land-head"><span>Посадка</span><span>Лиды</span><span>Расход</span><span>CPL</span><span>CPA</span></div>
        ${landRows.map(l => `
          <div class="tz-land-row">
            <span class="tz-land-name" title="${esc(l.name)}">${esc(l.name)}</span>
            <span>${tzNum(l.count)}</span>
            <span>${tzMoneyFmt(l.costSum)}</span>
            <span>${tzDivFmt(l.costSum, l.costCount, tzMoneyFmt)}</span>
            <span>${tzDivFmt(l.costSum, l.successCount, tzMoneyFmt)}</span>
          </div>`).join('')}
      </div>`;
    const body = `
      <div class="tz-fin-top">
        <div class="tz-kpi-grid">
          ${kpis.map(([l, v]) => `<div class="tz-kpi"><div class="tz-kpi-lbl">${esc(l)}</div><div class="tz-kpi-val">${v}</div></div>`).join('')}
        </div>
        <div class="tz-fin-ring">
          <div class="tz-cov-ring" style="--p:${ringPct}">
            <div class="tz-cov-hole"><b>${ringPct}%</b><span>покрытие<br>доходности</span></div>
          </div>
          ${romiOk
            ? `<div class="tz-romi-ok">ROMI: ${fin.costSum > 0 ? Math.round((fin.revenueSum - fin.costSum) / fin.costSum * 100) : '—'}%</div>`
            : `<div class="tz-romi-warn">ROMI не рассчитан: доходность заполнена у ${ringPct}% сделок «Кредит» (${fin.creditCount} шт). Нужно ≥ 90%.</div>`}
        </div>
      </div>
      <div class="tz-land-title">Разбивка по посадкам</div>
      ${landTable}`;
    const issues = tzIssueIds(warm, r => { const c = tzMoney(tzRaw(r, TZC.cost)); return c === null || c <= 0; });
    return tzWidgetShell('Финансы тёплых лидов', WARM_SOURCE + ' · только этот источник', '', body, { wide: true, className: 'tz-finance-widget', issues: { ids: issues, hint: 'Тёплые лиды без валидной «Стоимость лида» — не вошли в расход/CPL.' } });
  }
  function tzIsSuccess(r) {
    return !tzEmpty(tzRaw(r, TZC.success)) || String(tzRaw(r, TZC.stage)).trim() === 'Успешно реализовано';
  }
  function tzRevenue(r) {
    const a = tzMoney(tzRaw(r, ['Доходность #2']));
    if (a !== null) return a;
    return tzMoney(tzRaw(r, ['Доходность']));
  }
  function tzWarmStats(warm) {
    const costs = warm.map(r => tzMoney(tzRaw(r, TZC.cost))).filter(c => c !== null && c > 0);
    const costSum = costs.reduce((s, c) => s + c, 0);
    const costCount = costs.length;
    const qualCount = warm.filter(r => String(tzRaw(r, TZC.qual)).trim() === 'Да').length;
    const visitCount = warm.filter(r => tzDate(tzRaw(r, TZC.visitDate)) !== null).length;
    const success = warm.filter(tzIsSuccess);
    const successCount = success.length;
    // Доходность ставится ТОЛЬКО в сделках «Кредит» (Успешное закрытие карточки).
    // Покрытие меряем относительно кредитных сделок — иначе нал/обмен/комиссия
    // занижают покрытие, хотя доходность у них и не предусмотрена.
    const creditDeals = warm.filter(r => String(tzRaw(r, TZC.success)).trim() === 'Кредит');
    const revRows = success.filter(r => tzRevenue(r) !== null);
    const revenueSum = revRows.reduce((s, r) => s + tzRevenue(r), 0);
    const creditWithRev = creditDeals.filter(r => tzRevenue(r) !== null).length;
    const revenueCoverage = creditDeals.length > 0 ? (creditWithRev / creditDeals.length * 100) : 0;
    return { count: warm.length, costSum, costCount, qualCount, visitCount, successCount, revenueSum, revenueCoverage, creditCount: creditDeals.length };
  }
  function tzWarmByLanding(warm) {
    const map = new Map();
    warm.forEach(r => {
      let land = String(tzRaw(r, TZC.landing)).trim();
      if (tzEmpty(land)) land = EMPTY_LABEL;
      if (!map.has(land)) map.set(land, []);
      map.get(land).push(r);
    });
    return Array.from(map, ([name, rs]) => {
      const costs = rs.map(r => tzMoney(tzRaw(r, TZC.cost))).filter(c => c !== null && c > 0);
      return {
        name, count: rs.length,
        costSum: costs.reduce((s, c) => s + c, 0),
        costCount: costs.length,
        qualCount: rs.filter(r => String(tzRaw(r, TZC.qual)).trim() === 'Да').length,
        visitCount: rs.filter(r => tzDate(tzRaw(r, TZC.visitDate)) !== null).length,
        successCount: rs.filter(tzIsSuccess).length
      };
    }).sort((a, b) => b.count - a.count);
  }

  // ═══ ВИДЖЕТ 3: Этапы воронки ═══
  function tzWidgetStages(rows) {
    const total = rows.length;
    const rank = tzRanking(rows, TZC.stage);
    const max = rank.items[0]?.value || 1;
    const body = `<div class="tz-rank-list">
      ${rank.items.map((it, i) => tzRankRow(it.label, it.value, total, max, { colorIndex: i })).join('')}
      ${rank.hasOther ? tzRankRow('Прочие', rank.other, total, max, { colorIndex: 6 }) : ''}
    </div>`;
    const issues = tzIssueIds(rows, r => tzEmpty(tzRaw(r, TZC.stage)));
    return tzWidgetShell('Этапы воронки', 'Этап сделки', tzNum(total) + ' лидов', body, { className: 'tz-stages-widget', issues: { ids: issues, hint: 'Сделки без «Этап сделки».' } });
  }

  // ═══ ВИДЖЕТ 4: Причины закрытия ═══
  function tzWidgetReasons(rows) {
    const total = rows.length;
    const withReason = rows.filter(r => !tzEmpty(tzRaw(r, TZC.reason)));
    const without = total - withReason.length;
    const rank = tzRanking(withReason, TZC.reason, { emptyAs: EMPTY_LABEL });
    const max = rank.items[0]?.value || 1;
    const closedTotal = withReason.length;
    const body = `
      <div class="tz-rank-list">
        ${rank.items.map((it, i) => `
          <div class="tz-rank-row">
            <div class="tz-rank-top">
              <span class="tz-rank-label" title="${esc(it.label)}">${esc(it.label)}</span>
              <span class="tz-rank-value">${tzNum(it.value)}</span>
              <span class="tz-rank-percent">${tzPct(it.value, total).toFixed(1)}%</span>
            </div>
            <div class="tz-rank-bar"><div class="tz-rank-bar-fill ${shareColorClass(i)}" style="width:${Math.max(2, it.value / max * 100).toFixed(1)}%"></div></div>
            <div class="tz-rank-sub">${tzPct(it.value, closedTotal).toFixed(1)}% от закрытых с причиной</div>
          </div>`).join('')}
        ${rank.hasOther ? tzRankRow('Прочие', rank.other, total, max, { colorIndex: 6 }) : ''}
      </div>
      <div class="tz-quality-line">Без причины закрытия: <b>${tzNum(without)}</b></div>`;
    // «Вне расчёта» = закрытые сделки (есть дата закрытия / этап «Закрыто…») без причины
    const issues = tzIssueIds(rows, r => {
      if (!tzEmpty(tzRaw(r, TZC.reason))) return false;
      const closed = tzDate(tzRaw(r, TZC.closed)) !== null;
      const stageClosed = /^Закрыто/i.test(String(tzRaw(r, TZC.stage)).trim());
      return closed || stageClosed;
    });
    return tzWidgetShell('Причины закрытия', 'Причина закрытия карточки', tzNum(withReason.length) + ' с причиной', body, { className: 'tz-reasons-widget', compactValue: tzNum(withReason.length), issues: { ids: issues, hint: 'Закрытые сделки без «Причина закрытия карточки».' } });
  }

  // ═══ ВИДЖЕТ 5: Срок жизни сделки ═══
  function tzLifetimeData(rows) {
    let closed = [], openCnt = 0, invalid = 0;
    rows.forEach(r => {
      const start = tzDate(tzRaw(r, TZC.created));
      if (!start) return;
      const end = tzDate(tzRaw(r, TZC.realizDate)) || tzDate(tzRaw(r, TZC.closed));
      if (!end) { openCnt++; return; }
      const ms = end - start;
      if (ms < 0) { invalid++; return; }
      closed.push({ row: r, hours: ms / 3600000 });
    });
    return { closed, openCnt, invalid };
  }
  function tzWidgetLifetime(rows) {
    const mode = state.tzLifetimeMode || 'all';
    const data = tzLifetimeData(rows);
    const hoursArr = data.closed.map(x => x.hours);
    const avg = hoursArr.length ? hoursArr.reduce((s, h) => s + h, 0) / hoursArr.length : 0;
    const med = tzMedian(hoursArr);
    const p75 = tzPercentile(hoursArr, 75);
    const p90 = tzPercentile(hoursArr, 90);
    const modes = [['all','Все'],['source','Источники'],['city','Города'],['responsible','Ответственные']];
    let breakdownBody = '';
    if (mode === 'all') {
      const stats = [['Средний', tzHours(avg)],['Медиана', tzHours(med)],['P75', tzHours(p75)],['P90', tzHours(p90)]];
      breakdownBody = `
        <div class="tz-life-stats">
          ${stats.map(([l, v]) => `<div class="tz-life-stat"><div class="tz-life-lbl">${l}</div><div class="tz-life-val">${v}</div></div>`).join('')}
        </div>
        <div class="tz-life-foot">
          <span>В расчёте: <b>${tzNum(data.closed.length)}</b></span>
          <span>Открытых: <b>${tzNum(data.openCnt)}</b></span>
          ${data.invalid ? `<span class="tz-life-warn">Ошибок дат: ${tzNum(data.invalid)}</span>` : ''}
        </div>`;
    } else {
      const cand = mode === 'source' ? TZC.source : mode === 'city' ? TZC.city : TZC.responsible;
      const groups = new Map();
      data.closed.forEach(x => {
        let g = String(tzRaw(x.row, cand)).trim(); if (tzEmpty(g)) g = EMPTY_LABEL;
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(x.hours);
      });
      const list = Array.from(groups, ([label, hs]) => ({
        label, n: hs.length,
        avg: hs.reduce((s, h) => s + h, 0) / hs.length,
        med: tzMedian(hs), p75: tzPercentile(hs, 75)
      })).sort((a, b) => b.n - a.n).slice(0, 10);
      breakdownBody = `
        <div class="tz-life-table">
          <div class="tz-life-thead"><span>${mode === 'source' ? 'Источник' : mode === 'city' ? 'Город' : 'Ответственный'}</span><span>Завер.</span><span>Сред.</span><span>Медиана</span><span>P75</span></div>
          ${list.map(g => `<div class="tz-life-trow">
            <span class="tz-life-gname" title="${esc(g.label)}">${esc(g.label)}</span>
            <span>${tzNum(g.n)}</span><span>${g.avg.toFixed(1)}ч</span><span>${g.med.toFixed(1)}ч</span><span>${g.p75.toFixed(1)}ч</span>
          </div>`).join('')}
        </div>`;
    }
    const body = `
      <div class="tz-life-modes">${modes.map(([v, l]) => `<button class="tz-life-mode ${mode === v ? 'active' : ''}" data-tz-life-mode="${v}" type="button">${l}</button>`).join('')}</div>
      ${breakdownBody}`;
    // «Вне расчёта» = endDate < startDate (ошибка дат)
    const issues = tzIssueIds(rows, r => {
      const start = tzDate(tzRaw(r, TZC.created));
      if (!start) return false;
      const end = tzDate(tzRaw(r, TZC.realizDate)) || tzDate(tzRaw(r, TZC.closed));
      return end && (end - start) < 0;
    });
    return tzWidgetShell('Срок жизни сделки', 'От создания до реализации / закрытия', tzHours(med) + ' медиана', body, { wide: true, className: 'tz-lifetime-widget', compactValue: tzHours(med), issues: { ids: issues, hint: 'Сделки с датой завершения раньше создания — исключены из расчёта.' } });
  }

  // ═══ ВИДЖЕТ 6: Лиды по ответственному ═══
  function tzWidgetResponsible(rows) {
    const total = rows.length;
    const rank = tzRanking(rows, TZC.responsible);
    const max = rank.items[0]?.value || 1;
    const body = `<div class="tz-rank-list">
      ${rank.items.map((it, i) => tzRankRow(it.label, it.value, total, max, { colorIndex: i, clickFilter: 'responsible', display: tzDimDisplay('responsible', it.label) })).join('')}
      ${rank.hasOther ? tzRankRow('Прочие', rank.other, total, max, { colorIndex: 6 }) : ''}
    </div>
    <div class="tz-quality-line tz-note">⚠ В поле «Ответственный» могут быть города/системные значения — проверьте справочник</div>`;
    const issues = tzIssueIds(rows, r => tzEmpty(tzRaw(r, TZC.responsible)));
    return tzWidgetShell('Лиды по ответственному', 'Ответственный', tzNum(total) + ' лидов', body, { className: 'tz-responsible-widget', issues: { ids: issues, hint: 'Сделки без «Ответственный».' } });
  }

  // ═══ ВИДЖЕТ 7: Лиды по городам ═══
  function tzWidgetCities(rows) {
    const total = rows.length;
    const rank = tzRanking(rows, TZC.city);
    const max = rank.items[0]?.value || 1;
    const body = `<div class="tz-rank-list">
      ${rank.items.map((it, i) => tzRankRow(it.label, it.value, total, max, { colorIndex: i, clickFilter: 'city' })).join('')}
      ${rank.hasOther ? tzRankRow('Прочие', rank.other, total, max, { colorIndex: 6 }) : ''}
    </div>`;
    const issues = tzIssueIds(rows, r => tzEmpty(tzRaw(r, TZC.city)));
    return tzWidgetShell('Лиды по городам', 'Город', tzNum(total) + ' лидов', body, { className: 'tz-cities-widget', issues: { ids: issues, hint: 'Сделки без «Город».' } });
  }

  // ═══ ВИДЖЕТ 8: Качество данных ═══
  function tzWidgetQuality(rows) {
    const total = rows.length;
    const noSource = rows.filter(r => tzEmpty(tzRaw(r, TZC.source))).length;
    const noCity = rows.filter(r => tzEmpty(tzRaw(r, TZC.city))).length;
    const noResp = rows.filter(r => tzEmpty(tzRaw(r, TZC.responsible))).length;
    const noStage = rows.filter(r => tzEmpty(tzRaw(r, TZC.stage))).length;
    const noReason = rows.filter(r => tzEmpty(tzRaw(r, TZC.reason))).length;
    const warm = rows.filter(r => String(tzRaw(r, TZC.source)).trim() === WARM_SOURCE);
    const warmNoCost = warm.filter(r => { const c = tzMoney(tzRaw(r, TZC.cost)); return c === null || c <= 0; }).length;
    const success = rows.filter(tzIsSuccess);
    const succNoRev = success.filter(r => tzRevenue(r) === null).length;
    const realizNoSucc = rows.filter(r => tzDate(tzRaw(r, TZC.realizDate)) && tzEmpty(tzRaw(r, TZC.success))).length;
    const succWrongStage = rows.filter(r => !tzEmpty(tzRaw(r, TZC.success)) && String(tzRaw(r, TZC.stage)).trim() !== 'Успешно реализовано').length;
    // Каждая проверка: [подпись, predicate]. Клик по строке с N>0 открывает
    // модалку со списком ID/ссылок этих сделок.
    const checks = [
      ['Источник не заполнен', r => tzEmpty(tzRaw(r, TZC.source))],
      ['Город не заполнен', r => tzEmpty(tzRaw(r, TZC.city))],
      ['Ответственный не заполнен', r => tzEmpty(tzRaw(r, TZC.responsible))],
      ['Этап не заполнен', r => tzEmpty(tzRaw(r, TZC.stage))],
      ['Причина закрытия не заполнена', r => tzEmpty(tzRaw(r, TZC.reason))],
      ['Тёплые лиды без стоимости', r => String(tzRaw(r, TZC.source)).trim() === WARM_SOURCE && (() => { const c = tzMoney(tzRaw(r, TZC.cost)); return c === null || c <= 0; })()],
      ['Успешные без доходности', r => tzIsSuccess(r) && tzRevenue(r) === null],
      ['Реализация есть, успех пуст', r => tzDate(tzRaw(r, TZC.realizDate)) && tzEmpty(tzRaw(r, TZC.success))],
      ['Успех есть, этап ≠ «Успешно реализовано»', r => !tzEmpty(tzRaw(r, TZC.success)) && String(tzRaw(r, TZC.stage)).trim() !== 'Успешно реализовано'],
    ];
    let nonZero = 0;
    const body = `<div class="tz-quality-list">
      ${checks.map(([l, pred]) => {
        const ids = tzIssueIds(rows, pred);
        const v = ids.length;
        if (v > 0) nonZero++;
        let key = '';
        if (v > 0) { key = 'q' + (Object.keys(_tzIssues).length + 1); _tzIssues[key] = { title: l, hint: 'Сделки по проверке «' + l + '».', ids }; }
        return `<div class="tz-quality-item ${v > 0 ? 'has clickable' : 'ok'}" ${v > 0 ? `data-tz-issue="${key}"` : ''}>
          <span class="tz-quality-lbl">${esc(l)}</span>
          <span class="tz-quality-num">${tzNum(v)}</span>
        </div>`;
      }).join('')}
    </div>`;
    // Компактно: сколько проверок с ненулевыми проблемами из общего числа
    return tzWidgetShell('Качество данных', 'Проверка полноты и согласованности', '', body, { className: 'tz-quality-widget', compactValue: `${nonZero} / ${checks.length}` });
  }

  function bindTzBase() {
    // Период-кнопки (быстрые)
    document.querySelectorAll('[data-tz-period]').forEach(b => {
      b.onclick = () => { state.tzFilters.period = b.dataset.tzPeriod; renderTrafficAnalytics(); };
    });
    // Календарь-диапазон
    const rangeToggle = document.querySelector('[data-tz-range-toggle]');
    const rangePanel = document.querySelector('[data-tz-range-panel]');
    if (rangeToggle && rangePanel) {
      rangeToggle.onclick = (e) => { e.stopPropagation(); const willOpen = rangePanel.hidden; tzCloseAllPanels(rangePanel); rangePanel.hidden = !rangePanel.hidden; if (willOpen) tzPositionPanel(rangeToggle, rangePanel); };
      rangePanel.querySelectorAll('[data-tz-date]').forEach(inp => {
        inp.onchange = () => {
          if (inp.dataset.tzDate === 'from') state.tzFilters.dateFrom = inp.value;
          else state.tzFilters.dateTo = inp.value;
        };
      });
      rangePanel.querySelector('[data-tz-range-apply]').onclick = () => {
        state.tzFilters.period = (state.tzFilters.dateFrom || state.tzFilters.dateTo) ? 'range' : 'all';
        renderTrafficAnalytics();
      };
    }
    // Мультиселекты
    document.querySelectorAll('[data-tz-ms]').forEach(btn => {
      const key = btn.dataset.tzMs;
      const panel = document.querySelector(`[data-tz-ms-panel="${key}"]`);
      btn.onclick = (e) => { e.stopPropagation(); const willOpen = panel && panel.hidden; tzCloseAllPanels(panel); if (panel) { panel.hidden = !panel.hidden; if (willOpen) tzPositionPanel(btn, panel); } };
    });
    document.querySelectorAll('[data-tz-ms-cb]').forEach(cb => {
      cb.onchange = () => {
        const key = cb.dataset.tzMsCb;
        const arr = state.tzFilters[key] || (state.tzFilters[key] = []);
        const i = arr.indexOf(cb.value);
        if (cb.checked && i < 0) arr.push(cb.value);
        else if (!cb.checked && i >= 0) arr.splice(i, 1);
        cb.closest('.tz-ms-opt')?.classList.toggle('on', cb.checked);
      };
    });
    document.querySelectorAll('[data-tz-ms-clear]').forEach(btn => {
      btn.onclick = () => { state.tzFilters[btn.dataset.tzMsClear] = []; renderTrafficAnalytics(); };
    });
    document.querySelectorAll('[data-tz-ms-apply]').forEach(btn => {
      btn.onclick = () => renderTrafficAnalytics();
    });
    // Клик вне панелей — закрыть (и применить мультиселекты при изменениях)
    if (!document._tzPanelDoc) {
      document._tzPanelDoc = true;
      document.addEventListener('click', (e) => {
        const open = document.querySelectorAll('.tz-ms-panel:not([hidden]), .tz-range-panel:not([hidden])');
        if (!open.length) return;
        let inside = false;
        open.forEach(p => { if (p.contains(e.target) || p.parentElement.contains(e.target)) inside = true; });
        if (!inside) { open.forEach(p => p.hidden = true); renderTrafficAnalytics(); }
      });
    }
    document.querySelector('[data-tz-reset]')?.addEventListener('click', () => {
      state.tzFilters = { period: 'all', dateFrom: '', dateTo: '', source: [], city: [], responsible: [], success: [] };
      renderTrafficAnalytics();
    });
    document.querySelectorAll('[data-tz-life-mode]').forEach(b => {
      b.onclick = () => { state.tzLifetimeMode = b.dataset.tzLifeMode; renderTrafficAnalytics(); };
    });
    // Кнопка «!» виджета → модалка со списком ID сделок вне расчёта
    document.querySelectorAll('[data-tz-issue]').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); tzOpenIssueModal(btn.dataset.tzIssue); };
    });
    // Клик по строке рейтинга → тоггл значения в массиве фильтра
    document.querySelectorAll('[data-tz-rank-filter]').forEach(row => {
      row.onclick = () => {
        const key = row.dataset.tzRankFilter;
        const val = row.dataset.tzRankValue;
        if (val === 'Прочие' || val === EMPTY_LABEL) return;
        const arr = state.tzFilters[key] || (state.tzFilters[key] = []);
        const i = arr.indexOf(val);
        if (i >= 0) arr.splice(i, 1); else arr.push(val);
        renderTrafficAnalytics();
      };
    });
    tzBindModeControls();
  }
  // Бинды режима отображения: глобальный сегмент + персональные кнопки виджетов.
  // Вызывается на обеих вкладках (база и редактор).
  function tzBindModeControls() {
    document.querySelectorAll('[data-tz-global-mode]').forEach(b => {
      b.onclick = () => {
        const want = b.dataset.tzGlobalMode;
        if (tzGlobalMode() !== want) tzToggleGlobalMode();
      };
    });
    document.querySelectorAll('[data-tz-card-toggle]').forEach(b => {
      b.onclick = (e) => { e.stopPropagation(); tzToggleCard(b.dataset.tzCardToggle); };
    });
    // Клик по компактному виджету (мимо кнопок/ссылок) → разворачивает его
    document.querySelectorAll('.traffic-widget.tz-compact').forEach(card => {
      card.onclick = (e) => {
        if (e.target.closest('button, a, [data-tz-card-toggle], [data-tz-issue]')) return;
        const btn = card.querySelector('[data-tz-card-toggle]');
        if (btn) tzToggleCard(btn.dataset.tzCardToggle);
      };
    });
  }
  function tzCloseAllPanels(except) {
    document.querySelectorAll('.tz-ms-panel, .tz-range-panel').forEach(p => { if (p !== except) p.hidden = true; });
  }

  // Позиционирует поповер (position:fixed) строго внутри вьюпорта на любом
  // устройстве: под кнопкой, с клампом left/top/width по краям экрана.
  function tzPositionPanel(btn, panel) {
    if (!btn || !panel) return;
    const M = 8;                                   // отступ от краёв
    const vw = window.innerWidth, vh = window.innerHeight;
    const r = btn.getBoundingClientRect();
    // Ширина: не шире вьюпорта
    let w = panel.offsetWidth || 230;
    w = Math.min(w, vw - M * 2);
    panel.style.width = w + 'px';
    // Левый край: выравниваем по кнопке, затем клампим
    let left = r.left;
    if (left + w > vw - M) left = vw - M - w;       // не вылезать вправо
    if (left < M) left = M;                          // не вылезать влево
    panel.style.left = left + 'px';
    // Верх: под кнопкой; если не влезает вниз — над кнопкой
    let top = r.bottom + 6;
    const h = panel.offsetHeight || 200;
    if (top + h > vh - M) {
      const above = r.top - 6 - h;
      top = above >= M ? above : Math.max(M, vh - M - h);
    }
    panel.style.top = top + 'px';
  }

  function tzOpenIssueModal(key) {
    const data = _tzIssues[key];
    const overlay = document.getElementById('tz-issue-overlay');
    if (!data || !overlay) return;
    const idsHtml = data.ids.map(id => `<span class="tz-issue-id">${esc(id)}</span>`).join('');
    overlay.innerHTML = `
      <div class="tz-issue-modal" role="dialog" aria-modal="true">
        <button class="tz-issue-close" data-tz-issue-close type="button" aria-label="Закрыть">×</button>
        <div class="tz-issue-head">
          <div class="tz-issue-title">${esc(data.title)} · вне расчёта</div>
          <div class="tz-issue-count">${tzNum(data.ids.length)} сделок</div>
        </div>
        ${data.hint ? `<div class="tz-issue-hint">${esc(data.hint)}</div>` : ''}
        <div class="tz-issue-ids">${idsHtml || '<span class="tz-issue-empty">Нет ID</span>'}</div>
        <div class="tz-issue-actions">
          <button class="tz-issue-copy" data-tz-issue-copy="ids" type="button">Скопировать ID</button>
          <button class="tz-issue-copy tz-issue-copy-alt" data-tz-issue-copy="links" type="button">Скопировать ссылки</button>
        </div>
      </div>`;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    const close = () => { overlay.classList.remove('open'); overlay.setAttribute('aria-hidden', 'true'); overlay.innerHTML = ''; };
    overlay.querySelector('[data-tz-issue-close]').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    const AMO = 'https://ksocm66.amocrm.ru/leads/detail/';
    overlay.querySelectorAll('[data-tz-issue-copy]').forEach(btn => {
      btn.onclick = () => {
        const text = btn.dataset.tzIssueCopy === 'links'
          ? data.ids.map(id => AMO + id).join('\n')      // каждая ссылка с новой строки
          : data.ids.join('\n');                          // каждый ID с новой строки
        try { navigator.clipboard.writeText(text); notify(btn.dataset.tzIssueCopy === 'links' ? 'Ссылки скопированы' : 'ID скопированы', 's'); } catch(_){}
      };
    });
  }

  /* ════════════════════════════════════════════════════════════════
     РЕДАКТОР ВИДЖЕТОВ v2 — concept-driven конструктор.
     Логика связей всегда валидна: вид → только допустимые контролы,
     метрики и разрезы — из курируемых списков. Нелогичных комбинаций нет.
     ════════════════════════════════════════════════════════════════ */

  // Разрезы (категориальные поля)
  const TZ_DIMS = {
    source:      { label: 'Источник',         cand: TZC.source },
    city:        { label: 'Город',            cand: TZC.city },
    responsible: { label: 'Ответственный',    cand: TZC.responsible },
    stage:       { label: 'Этап сделки',      cand: TZC.stage },
    reason:      { label: 'Причина закрытия', cand: TZC.reason },
    success:     { label: 'Вид реализации',   cand: TZC.success },
    landing:     { label: 'Посадка',          cand: TZC.landing },
    qual:        { label: 'Квал лид',         cand: TZC.qual },
  };
  // Дата-поля для трендов
  const TZ_DATEF = {
    created:    { label: 'Дата создания',    cand: TZC.created },
    closed:     { label: 'Дата закрытия',    cand: TZC.closed },
    visitDate:  { label: 'Дата визита',      cand: TZC.visitDate },
    realizDate: { label: 'Дата реализации',  cand: TZC.realizDate },
  };
  // Метрики (каждая — корректная свёртка набора строк → число)
  const TZ_METRICS = {
    count:     { label: 'Кол-во лидов',        fmt: tzNum,      reduce: rs => rs.length },
    costSum:   { label: 'Σ Стоимость лида',    fmt: tzMoneyFmt, reduce: rs => { const c = rs.map(r => tzMoney(tzRaw(r, TZC.cost))).filter(x => x !== null && x > 0); return c.length ? c.reduce((s, x) => s + x, 0) : 0; } },
    costAvg:   { label: 'Ср. стоимость лида',  fmt: tzMoneyFmt, reduce: rs => { const c = rs.map(r => tzMoney(tzRaw(r, TZC.cost))).filter(x => x !== null && x > 0); return c.length ? c.reduce((s, x) => s + x, 0) / c.length : null; } },
    revSum:    { label: 'Σ Доходность',        fmt: tzMoneyFmt, reduce: rs => rs.filter(tzIsSuccess).map(tzRevenue).filter(x => x !== null).reduce((s, x) => s + x, 0) },
    revAvg:    { label: 'Ср. доходность',      fmt: tzMoneyFmt, reduce: rs => { const v = rs.filter(tzIsSuccess).map(tzRevenue).filter(x => x !== null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; } },
    convVisit: { label: '% в визит',           fmt: v => v === null ? '—' : v.toFixed(1) + '%', reduce: rs => rs.length ? rs.filter(r => tzDate(tzRaw(r, TZC.visitDate)) !== null).length / rs.length * 100 : null },
    convReal:  { label: '% в реализацию',      fmt: v => v === null ? '—' : v.toFixed(1) + '%', reduce: rs => rs.length ? rs.filter(tzIsSuccess).length / rs.length * 100 : null },
    qualRate:  { label: '% квал-лидов',        fmt: v => v === null ? '—' : v.toFixed(1) + '%', reduce: rs => rs.length ? rs.filter(r => String(tzRaw(r, TZC.qual)).trim() === 'Да').length / rs.length * 100 : null },
  };
  // Виды виджетов и какие контролы им нужны
  const TZ_KINDS = {
    ranking: { label: 'Рейтинг',      need: ['dimension', 'metric', 'topN'], hint: 'Топ значений разреза по метрике' },
    share:   { label: 'Доля',         need: ['dimension', 'metricShare'],    hint: 'Кольцо долей по разрезу' },
    trend:   { label: 'Динамика',     need: ['dateField', 'granularity', 'metric'], hint: 'Линия во времени' },
    compare: { label: 'Сравнение',    need: ['dimension', 'splitBy', 'metric'], hint: 'Разрез × разрез (таблица)' },
    kpi:     { label: 'KPI-число',    need: ['metric'],                      hint: 'Одна крупная цифра' },
    table:   { label: 'Таблица',      need: ['dimension', 'metricsMulti'],   hint: 'Разрез + несколько метрик' },
  };
  const TZ_SHARE_METRICS = ['count', 'costSum', 'revSum'];   // для доли — только аддитивные

  function tzDimLabel(k) { return TZ_DIMS[k]?.label || k; }
  function tzMetricLabel(k) { return TZ_METRICS[k]?.label || k; }

  // Миграция v1 → v2 (старые виджеты с format/selectedFields)
  function tzMigrateWidget(w) {
    if (!w) return null;
    if (w.v === 2) return w;
    // Пытаемся вытащить разрез из старых selectedFields по совпадению с TZC
    let dimension = 'source';
    const sel = w.selectedFields || [];
    for (const f of sel) {
      const hit = Object.entries(TZ_DIMS).find(([, d]) => d.cand.some(c => c === f.normalizedName || c === f.originalName));
      if (hit) { dimension = hit[0]; break; }
    }
    const kindMap = { ranking: 'ranking', shareStructure: 'share', rollingTrend: 'trend', trend: 'trend', kpiSummary: 'kpi', tableDetail: 'table' };
    return {
      v: 2, id: w.id || `widget_${Date.now()}`, title: w.title || 'Виджет',
      kind: kindMap[w.format] || 'ranking', dimension, splitBy: '', dateField: 'created',
      granularity: 'day', metric: 'count', metrics: ['count'], topN: 10,
      period: w.period || { type: 'all', dateFrom: null, dateTo: null }, filters: {},
      createdAt: w.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
    };
  }

  // Строки виджета: state.rows, отфильтрованные по периоду + собств. фильтрам
  function tzWidgetRows(w) {
    let rows = state.rows || [];
    const p = w.period || { type: 'all' };
    if (p.type && p.type !== 'all') {
      const now = new Date();
      let from = null, to = now;
      if (p.type === 'today') from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      else if (p.type === 'week') from = startOfWeek(now);
      else if (p.type === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1);
      else if (p.type === 'range') { from = p.dateFrom ? new Date(p.dateFrom + 'T00:00:00') : null; to = p.dateTo ? new Date(p.dateTo + 'T23:59:59') : now; }
      if (from || p.type === 'range') rows = rows.filter(r => { const d = tzDate(tzRaw(r, TZC.created)); if (!d) return false; if (from && d < from) return false; if (to && d > to) return false; return true; });
    }
    const fl = w.filters || {};
    Object.entries(fl).forEach(([dim, vals]) => {
      if (!vals || !vals.length || !TZ_DIMS[dim]) return;
      rows = rows.filter(r => vals.includes(String(tzRaw(r, TZ_DIMS[dim].cand)).trim()));
    });
    return rows;
  }

  // Группировка строк по разрезу → [{label, rows}]
  function tzGroupBy(rows, dimKey) {
    const cand = TZ_DIMS[dimKey].cand;
    const map = new Map();
    rows.forEach(r => { let v = String(tzRaw(r, cand)).trim(); if (tzEmpty(v)) v = EMPTY_LABEL; if (!map.has(v)) map.set(v, []); map.get(v).push(r); });
    return Array.from(map, ([label, rs]) => ({ label, rows: rs }));
  }

  function tzRenderEditor() {
    const widgets = (state.widgets || []).map(tzMigrateWidget).filter(Boolean);
    state.widgets = widgets; // нормализуем
    return `
      <div class="tz-editor-bar">
        <div class="tz-editor-actions">
          <button class="tz-ed-btn primary" id="traffic-add-widget" ${widgets.length >= TZ_WIDGET_LIMIT ? 'disabled' : ''}>+ Новый виджет</button>
          <button class="tz-ed-btn tz-ed-icon" id="traffic-export-widgets" type="button" aria-label="Экспорт настроек" title="Экспорт настроек (.json)">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
          </button>
          <button class="tz-ed-btn tz-ed-icon" id="traffic-import-widgets" type="button" aria-label="Импорт настроек" title="Импорт настроек (.json)">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/></svg>
          </button>
          <input class="traffic-file-input" id="traffic-import-file" type="file" accept=".json,application/json" hidden>
        </div>
        <div class="tz-editor-right">${tzModeToggle()}<span class="tz-editor-count">${widgets.length} / ${TZ_WIDGET_LIMIT}</span></div>
      </div>
      <div class="traffic-grid tz-grid ${tzGridClass()}">
        ${widgets.length ? widgets.map(tzRenderCustomWidget).join('') : `
          <div class="tz-empty">Виджетов нет. Нажмите «+ Новый виджет» — конструктор проведёт по шагам и не даст собрать нелогичную комбинацию.</div>`}
      </div>
      <div class="tz-issue-overlay" id="tz-issue-overlay" aria-hidden="true"></div>`;
  }

  function tzRenderCustomWidget(w) {
    w = tzMigrateWidget(w);
    const rows = tzWidgetRows(w);
    const kind = TZ_KINDS[w.kind] ? w.kind : 'ranking';
    const per = tzPeriodLabel(rows);
    let body = '', main = '', sub = TZ_KINDS[kind].label;
    if (!rows.length) {
      body = '<div class="tz-empty-inline">Нет данных в выбранном периоде</div>';
    } else if (kind === 'ranking' || kind === 'share') {
      const groups = tzGroupBy(rows, w.dimension);
      const metricKey = kind === 'share' ? (TZ_SHARE_METRICS.includes(w.metric) ? w.metric : 'count') : (w.metric || 'count');
      const M = TZ_METRICS[metricKey];
      const items = groups.map(g => ({ label: g.label, value: M.reduce(g.rows) || 0 })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
      const totalVal = items.reduce((s, x) => s + x.value, 0);
      const topN = kind === 'share' ? 6 : (w.topN || 10);
      const top = items.slice(0, topN);
      const otherVal = items.slice(topN).reduce((s, x) => s + x.value, 0);
      const max = top[0]?.value || 1;
      sub = `${tzDimLabel(w.dimension)} · ${M.label}`;
      main = M.fmt(totalVal);
      if (kind === 'share') {
        body = `<div class="tz-rank-with-ring"><div class="tz-rank-list">
          ${top.map((it, i) => `<div class="tz-rank-row"><div class="tz-rank-top"><span class="tz-rank-label" title="${esc(it.label)}">${esc(tzDimDisplay(w.dimension, it.label))}</span><span class="tz-rank-value">${M.fmt(it.value)}</span><span class="tz-rank-percent">${tzPct(it.value, totalVal).toFixed(1)}%</span></div><div class="tz-rank-bar"><div class="tz-rank-bar-fill ${shareColorClass(i)}" style="width:${Math.max(2, it.value / max * 100).toFixed(1)}%"></div></div></div>`).join('')}
        </div>${tzDonut(top, totalVal, top.length + '', 'групп')}</div>`;
      } else {
        body = `<div class="tz-rank-list">
          ${top.map((it, i) => `<div class="tz-rank-row"><div class="tz-rank-top"><span class="tz-rank-label" title="${esc(it.label)}">${esc(tzDimDisplay(w.dimension, it.label))}</span><span class="tz-rank-value">${M.fmt(it.value)}</span><span class="tz-rank-percent">${tzPct(it.value, totalVal).toFixed(1)}%</span></div><div class="tz-rank-bar"><div class="tz-rank-bar-fill ${shareColorClass(i)}" style="width:${Math.max(2, it.value / max * 100).toFixed(1)}%"></div></div></div>`).join('')}
          ${otherVal > 0 ? `<div class="tz-rank-row"><div class="tz-rank-top"><span class="tz-rank-label">Прочие</span><span class="tz-rank-value">${M.fmt(otherVal)}</span><span class="tz-rank-percent">${tzPct(otherVal, totalVal).toFixed(1)}%</span></div><div class="tz-rank-bar"><div class="tz-rank-bar-fill tz-c6" style="width:${Math.max(2, otherVal / max * 100).toFixed(1)}%"></div></div></div>` : ''}
        </div>`;
      }
    } else if (kind === 'trend') {
      const cand = (TZ_DATEF[w.dateField] || TZ_DATEF.created).cand;
      const M = TZ_METRICS[w.metric || 'count'];
      const gran = w.granularity || 'day';
      const buckets = new Map();
      rows.forEach(r => {
        const d = tzDate(tzRaw(r, cand)); if (!d) return;
        let key;
        if (gran === 'month') key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        else if (gran === 'week') { const ws = startOfWeek(d); key = `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, '0')}-${String(ws.getDate()).padStart(2, '0')}`; }
        else key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(r);
      });
      const pts = Array.from(buckets, ([key, rs]) => ({ key, date: new Date(key), value: M.reduce(rs) || 0 })).sort((a, b) => a.date - b.date);
      sub = `${(TZ_DATEF[w.dateField] || TZ_DATEF.created).label} · ${M.label} · ${gran === 'month' ? 'по месяцам' : gran === 'week' ? 'по неделям' : 'по дням'}`;
      main = M.fmt(pts.reduce((s, p) => s + p.value, 0));
      body = pts.length <= 2
        ? tzTrendBars(pts.map(p => ({ date: p.date, value: p.value })), pts.reduce((a, b) => b.value > (a?.value || 0) ? b : a, null))
        : tzTrendLine(pts.map(p => ({ date: p.date, value: p.value })));
    } else if (kind === 'compare') {
      const dimA = w.dimension, dimB = w.splitBy && TZ_DIMS[w.splitBy] ? w.splitBy : null;
      const M = TZ_METRICS[w.metric || 'count'];
      sub = dimB ? `${tzDimLabel(dimA)} × ${tzDimLabel(dimB)} · ${M.label}` : `${tzDimLabel(dimA)} · ${M.label}`;
      const groupsA = tzGroupBy(rows, dimA).map(g => ({ label: g.label, rows: g.rows, value: M.reduce(g.rows) || 0 })).sort((a, b) => b.value - a.value).slice(0, 8);
      if (!dimB) {
        const max = groupsA[0]?.value || 1;
        body = `<div class="tz-rank-list">${groupsA.map((g, i) => `<div class="tz-rank-row"><div class="tz-rank-top"><span class="tz-rank-label" title="${esc(g.label)}">${esc(tzDimDisplay(dimA, g.label))}</span><span class="tz-rank-value">${M.fmt(g.value)}</span></div><div class="tz-rank-bar"><div class="tz-rank-bar-fill ${shareColorClass(i)}" style="width:${Math.max(2, g.value / max * 100).toFixed(1)}%"></div></div></div>`).join('')}</div>`;
      } else {
        const colsAll = tzGroupBy(rows, dimB).map(g => ({ label: g.label, value: g.rows.length })).sort((a, b) => b.value - a.value).slice(0, 4).map(c => c.label);
        body = `<div class="tz-cmp-table"><div class="tz-cmp-row tz-cmp-head"><span>${esc(tzDimLabel(dimA))}</span>${colsAll.map(c => `<span title="${esc(c)}">${esc(tzDimDisplay(dimB, c))}</span>`).join('')}</div>
          ${groupsA.map(g => {
            const cells = colsAll.map(col => { const sub = g.rows.filter(r => String(tzRaw(r, TZ_DIMS[dimB].cand)).trim() === col); return M.fmt(M.reduce(sub) || 0); });
            return `<div class="tz-cmp-row"><span class="tz-cmp-name" title="${esc(g.label)}">${esc(tzDimDisplay(dimA, g.label))}</span>${cells.map(c => `<span>${c}</span>`).join('')}</div>`;
          }).join('')}</div>`;
      }
    } else if (kind === 'kpi') {
      const M = TZ_METRICS[w.metric || 'count'];
      sub = M.label;
      const val = M.reduce(rows);
      body = `<div class="tz-kpi-big">${M.fmt(val === null ? null : val)}</div><div class="tz-kpi-big-sub">${esc(M.label)} · ${tzNum(rows.length)} лидов в выборке</div>`;
    } else if (kind === 'table') {
      const metrics = (w.metrics && w.metrics.length ? w.metrics : ['count']).filter(k => TZ_METRICS[k]).slice(0, 4);
      sub = `${tzDimLabel(w.dimension)} · ${metrics.map(tzMetricLabel).join(' · ')}`;
      const groups = tzGroupBy(rows, w.dimension).map(g => ({ label: g.label, rows: g.rows, sort: TZ_METRICS[metrics[0]].reduce(g.rows) || 0 })).sort((a, b) => b.sort - a.sort).slice(0, w.topN || 12);
      body = `<div class="tz-cmp-table"><div class="tz-cmp-row tz-cmp-head"><span>${esc(tzDimLabel(w.dimension))}</span>${metrics.map(m => `<span>${esc(TZ_METRICS[m].label)}</span>`).join('')}</div>
        ${groups.map(g => `<div class="tz-cmp-row"><span class="tz-cmp-name" title="${esc(g.label)}">${esc(tzDimDisplay(w.dimension, g.label))}</span>${metrics.map(m => { const v = TZ_METRICS[m].reduce(g.rows); return `<span>${TZ_METRICS[m].fmt(v === null ? null : v)}</span>`; }).join('')}</div>`).join('')}</div>`;
    }
    const wkey = 'cw:' + w.id;
    const compact = tzEffMode(wkey) === 'compact';
    const toggleBtn = tzCardToggleBtn(wkey, compact);
    return `
      <article class="traffic-widget tz-card ${compact ? 'tz-compact' : 'tz-detailed'} tz-custom-widget" data-traffic-custom-widget="${esc(w.id)}">
        <div class="tz-card-head">
          <div class="tz-card-title">${esc(w.title || 'Виджет')}</div>
          <div class="tz-card-tools">${toggleBtn}</div>
          <div class="tz-card-sub">${esc(sub)}${per ? ' · ' + per : ''}</div>
        </div>
        ${main ? `<div class="tz-card-main">${main}</div>` : ''}
        ${compact ? '' : `<div class="tz-card-body">${body}</div>`}
      </article>`;
  }

  // ── Конструктор (модалка) ──
  function tzShowBuilder(editId) {
    const modal = document.getElementById('traffic-modal');
    if (!modal) return;
    if ((state.widgets || []).length >= TZ_WIDGET_LIMIT && !editId) { notify(`Лимит ${TZ_WIDGET_LIMIT} виджетов достигнут.`, 'e'); return; }
    const editing = typeof editId === 'string' ? (state.widgets || []).map(tzMigrateWidget).find(w => w.id === editId) : null;
    // Рабочая копия конфигурации
    const cfg = editing ? JSON.parse(JSON.stringify(editing)) : {
      v: 2, id: `widget_${Date.now()}`, title: '', kind: 'ranking',
      dimension: 'source', splitBy: '', dateField: 'created', granularity: 'day',
      metric: 'count', metrics: ['count'], topN: 10, period: { type: 'all', dateFrom: null, dateTo: null }, filters: {}
    };
    modal.innerHTML = `<div class="traffic-modal-card tz-builder-card">
      <button class="traffic-modal-close" data-traffic-close type="button">×</button>
      <h2>${editing ? 'Редактировать виджет' : 'Новый виджет'}</h2>
      <label class="tz-b-field">Название<input id="tzb-title" placeholder="Напр. Лиды по источникам" value="${esc(cfg.title)}"></label>
      <div class="tz-b-sec"><div class="tz-b-lbl">Вид виджета</div><div class="tz-b-kinds">
        ${Object.entries(TZ_KINDS).map(([k, v]) => `<button type="button" class="tz-b-kind ${cfg.kind === k ? 'active' : ''}" data-tzb-kind="${k}"><b>${esc(v.label)}</b><span>${esc(v.hint)}</span></button>`).join('')}
      </div></div>
      <div class="tz-b-controls" id="tzb-controls"></div>
      <div class="tz-b-sec"><div class="tz-b-lbl">Период</div><div class="tz-b-period" id="tzb-period">
        ${[['all','Всё'],['today','Сегодня'],['week','Неделя'],['month','Месяц']].map(([v, l]) => `<button type="button" class="tz-b-pill ${cfg.period.type === v ? 'active' : ''}" data-tzb-period="${v}">${l}</button>`).join('')}
      </div></div>
      <div class="tz-b-preview" id="tzb-preview"></div>
      <div class="traffic-modal-actions">
        <button class="tz-ed-btn" data-traffic-close>Отмена</button>
        <button class="tz-ed-btn primary" id="tzb-save">${editing ? 'Сохранить' : 'Создать'}</button>
      </div>
    </div>`;
    modal.classList.add('open');

    const dimOpts = (sel) => Object.entries(TZ_DIMS).map(([k, d]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${esc(d.label)}</option>`).join('');
    const metricOpts = (sel, only) => Object.entries(TZ_METRICS).filter(([k]) => !only || only.includes(k)).map(([k, m]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${esc(m.label)}</option>`).join('');
    const dateOpts = (sel) => Object.entries(TZ_DATEF).map(([k, d]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${esc(d.label)}</option>`).join('');

    const renderControls = () => {
      const need = TZ_KINDS[cfg.kind].need;
      const ctrl = document.getElementById('tzb-controls');
      let h = '';
      if (need.includes('dimension')) h += `<label class="tz-b-field">Разрез<select id="tzb-dim">${dimOpts(cfg.dimension)}</select></label>`;
      if (need.includes('splitBy')) h += `<label class="tz-b-field">Второй разрез (столбцы)<select id="tzb-split"><option value="">— нет —</option>${Object.entries(TZ_DIMS).map(([k, d]) => `<option value="${k}" ${cfg.splitBy === k ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select></label>`;
      if (need.includes('dateField')) h += `<label class="tz-b-field">Дата по оси X<select id="tzb-datef">${dateOpts(cfg.dateField)}</select></label>`;
      if (need.includes('granularity')) h += `<label class="tz-b-field">Шаг<select id="tzb-gran"><option value="day" ${cfg.granularity==='day'?'selected':''}>День</option><option value="week" ${cfg.granularity==='week'?'selected':''}>Неделя</option><option value="month" ${cfg.granularity==='month'?'selected':''}>Месяц</option></select></label>`;
      if (need.includes('metric')) h += `<label class="tz-b-field">Метрика<select id="tzb-metric">${metricOpts(cfg.metric)}</select></label>`;
      if (need.includes('metricShare')) h += `<label class="tz-b-field">Метрика<select id="tzb-metric">${metricOpts(TZ_SHARE_METRICS.includes(cfg.metric) ? cfg.metric : 'count', TZ_SHARE_METRICS)}</select></label>`;
      if (need.includes('metricsMulti')) h += `<div class="tz-b-field"><span>Метрики (до 4)</span><div class="tz-b-metrics">${Object.entries(TZ_METRICS).map(([k, m]) => `<label class="tz-b-chk"><input type="checkbox" data-tzb-metric="${k}" ${(cfg.metrics||[]).includes(k)?'checked':''}> ${esc(m.label)}</label>`).join('')}</div></div>`;
      if (need.includes('topN')) h += `<label class="tz-b-field">Сколько показывать<select id="tzb-topn">${[5,10,15,20].map(n => `<option value="${n}" ${cfg.topN===n?'selected':''}>Топ ${n}</option>`).join('')}</select></label>`;
      ctrl.innerHTML = h;
      // bind control changes
      ctrl.querySelector('#tzb-dim') && (ctrl.querySelector('#tzb-dim').onchange = e => { cfg.dimension = e.target.value; preview(); });
      ctrl.querySelector('#tzb-split') && (ctrl.querySelector('#tzb-split').onchange = e => { cfg.splitBy = e.target.value; preview(); });
      ctrl.querySelector('#tzb-datef') && (ctrl.querySelector('#tzb-datef').onchange = e => { cfg.dateField = e.target.value; preview(); });
      ctrl.querySelector('#tzb-gran') && (ctrl.querySelector('#tzb-gran').onchange = e => { cfg.granularity = e.target.value; preview(); });
      ctrl.querySelector('#tzb-metric') && (ctrl.querySelector('#tzb-metric').onchange = e => { cfg.metric = e.target.value; preview(); });
      ctrl.querySelector('#tzb-topn') && (ctrl.querySelector('#tzb-topn').onchange = e => { cfg.topN = +e.target.value; preview(); });
      ctrl.querySelectorAll('[data-tzb-metric]').forEach(cb => cb.onchange = () => {
        const k = cb.dataset.tzbMetric;
        cfg.metrics = cfg.metrics || [];
        if (cb.checked) { if (cfg.metrics.length >= 4) { cb.checked = false; notify('Максимум 4 метрики', 'e'); return; } if (!cfg.metrics.includes(k)) cfg.metrics.push(k); }
        else cfg.metrics = cfg.metrics.filter(x => x !== k);
        preview();
      });
    };
    const preview = () => {
      cfg.title = (document.getElementById('tzb-title').value || '').trim();
      const prev = document.getElementById('tzb-preview');
      try { prev.innerHTML = tzRenderCustomWidget({ ...cfg, title: cfg.title || 'Превью' }); } catch(e) { prev.innerHTML = '<div class="tz-empty-inline">Ошибка превью</div>'; }
    };
    modal.querySelectorAll('[data-tzb-kind]').forEach(b => b.onclick = () => {
      cfg.kind = b.dataset.tzbKind;
      modal.querySelectorAll('[data-tzb-kind]').forEach(x => x.classList.toggle('active', x === b));
      renderControls(); preview();
    });
    modal.querySelectorAll('[data-tzb-period]').forEach(b => b.onclick = () => {
      cfg.period = { ...cfg.period, type: b.dataset.tzbPeriod };
      modal.querySelectorAll('[data-tzb-period]').forEach(x => x.classList.toggle('active', x === b));
      preview();
    });
    document.getElementById('tzb-title').oninput = preview;
    renderControls();
    preview();
    // Снимок исходной конфигурации для проверки «грязных» изменений.
    // Отмена/×/клик по фону: если ничего не менялось — просто закрыть,
    // иначе спросить о сбросе изменений.
    const tzBuilderSnapshot = JSON.stringify(cfg);
    const tzBuilderClose = () => {
      if (JSON.stringify(cfg) !== tzBuilderSnapshot && !confirm('Сбросить несохранённые изменения?')) return;
      closeModal();
    };
    modal.querySelectorAll('[data-traffic-close]').forEach(b => { b.onclick = tzBuilderClose; });
    modal.onclick = e => { if (e.target === modal) tzBuilderClose(); };
    document.getElementById('tzb-save').onclick = () => {
      cfg.title = (document.getElementById('tzb-title').value || '').trim() || TZ_KINDS[cfg.kind].label;
      cfg.updatedAt = new Date().toISOString();
      if (!cfg.createdAt) cfg.createdAt = cfg.updatedAt;
      const list = (state.widgets || []).map(tzMigrateWidget);
      const idx = list.findIndex(w => w.id === cfg.id);
      if (idx >= 0) list[idx] = cfg; else list.push(cfg);
      state.widgets = list.slice(0, TZ_WIDGET_LIMIT);
      localStorage.setItem(STORAGE.widgets, JSON.stringify(state.widgets));
      closeModal();
      renderTrafficAnalytics();
      notify(editing ? 'Виджет сохранён' : 'Виджет создан', 's');
    };
  }

  // ── Просмотр виджета (модалка с редактировать/удалить) ──
  function tzShowWidgetModal(id) {
    const w = (state.widgets || []).map(tzMigrateWidget).find(x => x.id === id);
    const modal = document.getElementById('traffic-modal');
    if (!w || !modal) return;
    modal.innerHTML = `<div class="traffic-modal-card tz-builder-card">
      <button class="traffic-modal-close" data-traffic-close type="button">×</button>
      <div class="tz-wm-tools">
        <button class="tz-ed-btn" id="tzwm-edit">✎ Редактировать</button>
        <button class="tz-ed-btn danger" id="tzwm-del">Удалить</button>
      </div>
      <div class="tz-wm-preview">${tzRenderCustomWidget(w)}</div>
    </div>`;
    modal.classList.add('open');
    bindModalDismiss(modal);
    modal.querySelector('[data-traffic-close]').onclick = closeModal;
    document.getElementById('tzwm-edit').onclick = () => { closeModal(); tzShowBuilder(w.id); };
    document.getElementById('tzwm-del').onclick = () => {
      if (!confirm('Удалить виджет?')) return;
      state.widgets = (state.widgets || []).filter(x => x.id !== w.id);
      localStorage.setItem(STORAGE.widgets, JSON.stringify(state.widgets));
      closeModal();
      renderTrafficAnalytics();
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateTrafficDockAccess();
  });
})();
