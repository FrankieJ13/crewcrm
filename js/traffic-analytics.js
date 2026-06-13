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
    storageWarning: ''
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
    if (state.rows && state.fields && state.meta) return;
    state.activeTab = localStorage.getItem(STORAGE.tab) || 'base';
    state.widgets = safeJson(localStorage.getItem(STORAGE.widgets), []);
    const rows = safeJson(localStorage.getItem(STORAGE.rows), null);
    const fields = safeJson(localStorage.getItem(STORAGE.fields), null);
    const mapping = safeJson(localStorage.getItem(STORAGE.mapping), null);
    const meta = safeJson(localStorage.getItem(STORAGE.meta), null);
    if (Array.isArray(rows) && Array.isArray(fields) && meta) {
      state.rows = rows;
      state.fields = fields;
      const savedMapping = Object.fromEntries(Object.entries(mapping || {}).filter(([, value]) => value));
      const detectedMapping = detectColumns(fields);
      state.mapping = { ...detectedMapping, ...savedMapping };
      if (detectedMapping.source && fields.some(f => normHeader(f.originalName) === normHeader('Источник обращения'))) {
        state.mapping.source = detectedMapping.source;
      }
      state.meta = meta;
    }
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
    if (file.size > 14 * 1024 * 1024) {
      notify('Файл слишком большой для обработки на устройстве.', 'e');
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
    try {
      const rowsJson = JSON.stringify(state.rows);
      if (rowsJson.length < 3_500_000) {
        localStorage.setItem(STORAGE.rows, rowsJson);
        state.storageWarning = '';
      } else {
        localStorage.removeItem(STORAGE.rows);
        state.storageWarning = 'Файл обработан, но строки не сохранены в браузере: объём выше безопасного лимита localStorage.';
      }
    } catch (_) {
      localStorage.removeItem(STORAGE.rows);
      state.storageWarning = 'Файл обработан, но не сохранён в браузере: превышен лимит localStorage.';
    }
    if (state.meta) {
      state.meta.storageWarning = state.storageWarning;
      localStorage.setItem(STORAGE.meta, JSON.stringify(state.meta));
    }
  }

  function renderDashboard() {
    const tab = state.activeTab === 'advanced' ? 'advanced' : 'base';
    return `
      <section class="traffic-page">
        <div class="traffic-top">
          <div class="traffic-top-copy">
            <div class="traffic-title-row">
              <h1 class="traffic-title">Трафик</h1>
              <button class="traffic-info-btn" id="traffic-import-info" type="button" aria-label="Информация об импорте">!</button>
              <div class="traffic-tabs traffic-tabs-icons" aria-label="Режим аналитики">
                <button class="traffic-tab ${tab === 'base' ? 'active' : ''}" data-traffic-tab="base" type="button" aria-label="Базовый">
                  <img src="${trafficTabIcon('base')}" alt="" onerror="this.style.display='none'">
                </button>
                <button class="traffic-tab ${tab === 'advanced' ? 'active' : ''}" data-traffic-tab="advanced" type="button" aria-label="Расширенный">
                  <img src="${trafficTabIcon('advanced')}" alt="" onerror="this.style.display='none'">
                </button>
              </div>
            </div>
            <p class="traffic-subtitle">Аналитика входящего трафика и лидогенерации</p>
          </div>
        </div>
        <h2 class="traffic-section-title">${tab === 'advanced' ? 'Расширенный' : 'Базовый'} · Трафик</h2>
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
  }

  function renderBaseTab() {
    return `
      <div class="traffic-grid traffic-base-grid">
        ${renderLeadTrendWidget('leadTrend')}
        ${renderSourceShareWidget('sourceShare')}
        ${renderRankingWidget('cities', 'Города', state.mapping.city)}
        ${renderHoursWidget('hours')}
        ${renderRankingWidget('stages', 'Этапы воронки', state.mapping.stage, true)}
        ${renderRankingWidget('lossReasons', 'Причины закрытия', state.mapping.lossReason)}
        ${renderLifetimeWidget('lifetime')}
        ${renderRankingWidget('responsible', 'Ответственные', state.mapping.responsible)}
      </div>`;
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
      <div class="traffic-market-chart">
        ${renderLineSvg(barPoints, true)}
        <div class="traffic-market-columns">
          ${barPoints.map((p) => {
            const index = points.indexOf(p);
            const prev = index > 0 ? points[index - 1].value : p.value;
            const cls = p.value >= prev ? 'up' : 'down';
            const h = Math.max(8, Math.round((p.value / max) * 100));
            const ratio = max ? Math.max(0, Math.min(1, p.value / max)) : 0;
            const dotTop = 30 + ((1 - ratio) * 30);
            const candleH = Math.max(18, Math.round(22 + (p.value / max) * 28));
            return `<span class="traffic-market-column ${cls}" style="--dot-top:${dotTop.toFixed(1)}%;--bar-h:${h}%">
              <i class="traffic-candle ${cls}" style="height:${candleH}px"></i>
              <i class="traffic-market-dot"></i>
              <i class="traffic-market-bar ${cls}"></i>
              <b>${formatMetricValue(p.value)}</b>
              <small>${esc(marketPointLabel(p, data.periodKey))}</small>
            </span>`;
          }).join('')}
        </div>
      </div>
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

  function showTrafficImportInfo() {
    const modal = document.getElementById('traffic-modal');
    if (!modal || !state.meta) return;
    const period = [state.meta.periodFrom, state.meta.periodTo].filter(Boolean).map(v => fmtDate(new Date(v))).join(' — ');
    modal.innerHTML = `
      <div class="traffic-modal-card traffic-import-info-card">
        <button class="traffic-modal-close" data-traffic-close type="button">×</button>
        <h2>✓ CSV успешно импортирован</h2>
        <p><strong>${esc(state.meta.fileName || 'CSV')}</strong> · ${formatMetricValue(state.meta.rows || 0)} строк · ${formatMetricValue(state.meta.cols || 0)} колонок${period ? ` · ${esc(period)}` : ''}</p>
        ${state.meta.storageWarning ? `<p class="traffic-muted">${esc(state.meta.storageWarning)}</p>` : '<p class="traffic-muted">Файл обработан и доступен для аналитики.</p>'}
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
    const widgets = state.widgets || [];
    return `
      <div class="traffic-card traffic-advanced-head">
        <div class="traffic-toolbar">
          <button class="traffic-btn primary" id="traffic-add-widget" ${widgets.length >= 15 ? 'disabled' : ''}>+ Добавить виджет</button>
          <button class="traffic-btn danger" id="traffic-clear-csv">Очистить CSV</button>
          <button class="traffic-btn" id="traffic-import-widgets">Импорт настроек</button>
          <button class="traffic-btn" id="traffic-export-widgets">Экспорт настроек</button>
          <input class="traffic-file-input" id="traffic-import-file" type="file" accept=".json,.crm-traffic-widgets.json,application/json">
        </div>
        <p class="traffic-muted">${widgets.length} из 15 виджетов</p>
      </div>
      <div class="traffic-grid">
        ${widgets.map(renderCustomWidget).join('') || `
          <div class="traffic-empty traffic-card">
            <h3>Пользовательских виджетов пока нет</h3>
            <p class="traffic-muted">Создайте первый виджет на основе колонок импортированного CSV.</p>
          </div>`}
      </div>`;
  }

  function renderCustomWidget(widget) {
    const primary = getPrimaryGroupField(widget)?.normalizedName;
    const rows = rowsForWidget(widget);
    const data = primary ? makeWidgetData(widget, rows, primary) : null;
    const period = PERIOD_LABELS[widget.period?.type || 'all'] || 'Все данные';
    return `
      <article class="traffic-widget traffic-custom-widget traffic-format-${esc(widget.format || 'ranking')}" data-traffic-custom-widget="${esc(widget.id)}">
        <div class="traffic-widget-head">
          <div>
            <h3>${esc(widget.title || 'Без названия')}</h3>
            <p class="traffic-muted">${esc(FORMAT_LABELS[widget.format] || widget.format || 'Виджет')} · ${esc(period)}</p>
          </div>
        </div>
        ${data ? renderWidgetByFormat(widget, data, rows, primary) : '<p class="traffic-muted">Нет данных для построения.</p>'}
      </article>`;
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

  function renderLineSvg(points, smooth) {
    const max = Math.max(...points.map(p => p.value), 1);
    const w = 320, h = 120;
    const coords = points.length ? points.map((p, i) => {
      const x = points.length === 1 ? 0 : (i / (points.length - 1)) * w;
      const y = h - (p.value / max) * (h - 12) - 6;
      return [x, y];
    }) : [[0, h], [w, h]];
    const d = smooth ? smoothPath(coords) : coords.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const area = `${d} L${w} ${h} L0 ${h} Z`;
    return `<svg class="traffic-line-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <path class="traffic-line-area" d="${area}"></path>
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
        <div class="traffic-modal-actions">
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
    [STORAGE.rows, STORAGE.mapping, STORAGE.fields, STORAGE.meta, STORAGE.draft].forEach(k => localStorage.removeItem(k));
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

  function exportWidgets() {
    if (!state.widgets?.length) {
      notify('Нет созданных виджетов для экспорта.', 'e');
      return;
    }
    const payload = {
      schemaVersion: 1,
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
        if (data.schemaVersion !== 1 || !Array.isArray(data.widgets)) throw new Error('Некорректный файл настроек.');
        const currentNames = new Set((state.fields || []).map(f => f.normalizedName));
        const prepared = data.widgets.map(w => ({
          ...w,
          id: `widget_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          selectedFields: (w.selectedFields || []).filter(f => currentNames.has(f.normalizedName)),
          updatedAt: new Date().toISOString()
        })).filter(w => w.selectedFields.length);
        if (!prepared.length) throw new Error('В настройках не найдено полей, совпадающих с текущим CSV.');
        const replace = confirm('Заменить текущие виджеты импортируемыми? Нажмите Отмена, чтобы добавить к текущим.');
        const next = replace ? prepared : [...(state.widgets || []), ...prepared].slice(0, 15);
        state.widgets = next.slice(0, 15);
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

  document.addEventListener('DOMContentLoaded', () => {
    updateTrafficDockAccess();
  });
})();
