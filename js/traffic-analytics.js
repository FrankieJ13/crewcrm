(function(){
  const STORAGE = {
    rows: 'crmTrafficParsedRows',
    mapping: 'crmTrafficColumnMapping',
    fields: 'crmTrafficAvailableFields',
    widgets: 'crmTrafficAdvancedWidgets',
    meta: 'crmTrafficLastImportMeta',
    tab: 'crmTrafficActiveTab',
    draft: 'crmTrafficWidgetDraft'
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

  const state = {
    rows: null,
    fields: null,
    mapping: null,
    meta: null,
    widgets: [],
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
    if (tab === 'traffic') openTrafficAnalytics();
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
      state.mapping = mapping || {};
      state.meta = meta;
    }
  }

  function safeJson(text, fallback) {
    try { return text ? JSON.parse(text) : fallback; } catch(_) { return fallback; }
  }

  function renderImport() {
    return `
      <section class="traffic-page">
        <div class="traffic-hero">
          <p class="traffic-kicker">Аналитика</p>
          <h1 class="traffic-title">Трафик</h1>
          <p class="traffic-subtitle">Аналитика входящего трафика и лидогенерации на основе CSV-выгрузки из amoCRM.</p>
        </div>
        <div class="traffic-import-card">
          <div>
            <h2>Импорт данных</h2>
            <p class="traffic-muted">Загрузите CSV из вашей CRM, чтобы начать анализ.</p>
          </div>
          <label class="traffic-dropzone" id="traffic-dropzone">
            <input class="traffic-file-input" id="traffic-file" type="file" accept=".csv,text/csv">
            <span class="traffic-upload-icon">
              <svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M7 8l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>
            </span>
            <strong>Перетащите CSV файл сюда</strong>
            <span class="traffic-muted">или выберите файл на устройстве</span>
            <span class="traffic-btn primary">Выбрать CSV</span>
          </label>
          <p class="traffic-muted">Файл обрабатывается локально. Данные не отправляются на сервер.</p>
          <p class="traffic-muted">После импорта появятся вкладки «Базовый» и «Расширенный».</p>
        </div>
      </section>`;
  }

  function bindImport() {
    const file = document.getElementById('traffic-file');
    const drop = document.getElementById('traffic-dropzone');
    if (!file || !drop) return;
    file.onchange = () => file.files?.[0] && importTrafficCsv(file.files[0]);
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
    return `
      <section class="traffic-page">
        <div class="traffic-processing traffic-card">
          <h1 class="traffic-title">Трафик</h1>
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
    const byName = new Map(fields.map(f => [norm(f.originalName), f.normalizedName]));
    const mapping = {};
    Object.entries(FIELD_ALIASES).forEach(([key, aliases]) => {
      const exact = aliases.map(norm).find(a => byName.has(a));
      if (exact) {
        mapping[key] = byName.get(exact);
        return;
      }
      const fuzzy = fields.find(f => aliases.some(a => norm(f.originalName).includes(norm(a))));
      if (fuzzy) mapping[key] = fuzzy.normalizedName;
    });
    return mapping;
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
    const period = [state.meta?.periodFrom, state.meta?.periodTo].filter(Boolean).map(v => fmtDate(new Date(v))).join(' — ');
    return `
      <section class="traffic-page">
        <div class="traffic-hero">
          <div class="traffic-dashboard-head">
            <div>
              <p class="traffic-kicker">Аналитика</p>
              <h1 class="traffic-title">Трафик</h1>
              <p class="traffic-subtitle">${esc(state.meta.fileName)} · ${state.meta.rows} строк · ${state.meta.cols} колонок${period ? ` · ${esc(period)}` : ''}</p>
            </div>
            <span class="traffic-meta-pill">CSV успешно импортирован</span>
          </div>
          ${state.meta.storageWarning ? `<p class="traffic-muted">${esc(state.meta.storageWarning)}</p>` : ''}
        </div>
        <div class="traffic-tabs">
          <button class="traffic-tab ${tab === 'base' ? 'active' : ''}" data-traffic-tab="base">Базовый</button>
          <button class="traffic-tab ${tab === 'advanced' ? 'active' : ''}" data-traffic-tab="advanced">Расширенный</button>
        </div>
        ${tab === 'advanced' ? renderAdvancedTab() : renderBaseTab()}
      </section>
      <div class="traffic-modal" id="traffic-modal"></div>`;
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
    document.getElementById('traffic-export-widgets')?.addEventListener('click', exportWidgets);
    document.getElementById('traffic-import-widgets')?.addEventListener('click', () => document.getElementById('traffic-import-file')?.click());
    document.getElementById('traffic-import-file')?.addEventListener('change', e => e.target.files?.[0] && importWidgets(e.target.files[0]));
    document.getElementById('traffic-add-widget')?.addEventListener('click', showWidgetBuilder);
    document.querySelectorAll('[data-delete-traffic-widget]').forEach(btn => {
      btn.onclick = () => deleteWidget(btn.dataset.deleteTrafficWidget);
    });
  }

  function renderBaseTab() {
    const metrics = buildBaseMetrics();
    return `
      <div class="traffic-grid">
        ${renderTrendWidget('Текущий месяц · весь трафик · все сделки', metrics.month, true)}
        ${renderTrendWidget('Текущая неделя · весь трафик · все сделки', metrics.week, true)}
        ${renderRankingWidget('Неделя по городам', metrics.cities, ['Лидер','Доля лидера','Всего городов','Всего заявок'])}
        ${renderRankingWidget('Неделя по ответственным', metrics.responsible, ['Самый загруженный','Среднее на ответственного','Всего ответственных','Всего заявок'])}
        ${renderHoursWidget(metrics.hours)}
      </div>`;
  }

  function buildBaseMetrics() {
    const createdKey = state.mapping.createdAt;
    const cityKey = state.mapping.city;
    const respKey = state.mapping.responsible;
    const withDates = state.rows.map(r => ({ row: r, created: parseDate(r[createdKey])?.date })).filter(x => x.created);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const weekStart = startOfWeek(now);
    const prevWeekStart = new Date(weekStart); prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(weekStart); prevWeekEnd.setMilliseconds(-1);
    const month = withDates.filter(x => x.created >= monthStart && x.created <= now);
    const prevMonth = withDates.filter(x => x.created >= prevMonthStart && x.created <= prevMonthEnd);
    const week = withDates.filter(x => x.created >= weekStart && x.created <= now);
    const prevWeek = withDates.filter(x => x.created >= prevWeekStart && x.created <= prevWeekEnd);
    return {
      month: makeTrend(month, prevMonth, 'day'),
      week: makeTrend(week, prevWeek, 'weekday'),
      cities: makeRanking(week, cityKey),
      responsible: makeRanking(week, respKey),
      hours: makeHours(week)
    };
  }

  function makeTrend(items, prevItems, mode) {
    const buckets = new Map();
    items.forEach(x => {
      const key = mode === 'weekday' ? weekday(x.created) : String(x.created.getDate()).padStart(2, '0');
      buckets.set(key, (buckets.get(key) || 0) + 1);
    });
    const points = Array.from(buckets, ([label, value]) => ({ label, value }));
    const peak = points.reduce((a, b) => b.value > (a?.value || 0) ? b : a, null);
    const total = items.length;
    const avg = points.length ? total / points.length : 0;
    const change = prevItems.length ? ((total - prevItems.length) / prevItems.length) * 100 : null;
    return { total, avg, peak, change, points };
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

  function renderTrendWidget(title, data, wide) {
    return `
      <article class="traffic-widget ${wide ? 'wide' : ''}">
        <h3>${esc(title)}</h3>
        <div class="traffic-stat-row">
          <div class="traffic-stat"><span class="traffic-stat-label">Всего</span><span class="traffic-stat-value">${data.total}</span></div>
          <div class="traffic-stat"><span class="traffic-stat-label">Среднее в день</span><span class="traffic-stat-value">${data.avg.toFixed(1)}</span></div>
          <div class="traffic-stat"><span class="traffic-stat-label">Пиковый день</span><span class="traffic-stat-value">${esc(data.peak?.label || '-')}</span></div>
          <div class="traffic-stat"><span class="traffic-stat-label">Динамика</span><span class="traffic-stat-value">${data.change === null ? '-' : `${data.change > 0 ? '+' : ''}${data.change.toFixed(0)}%`}</span></div>
        </div>
        ${renderBars(data.points)}
        <p class="traffic-widget-note">${data.total ? 'Основная нагрузка видна по пиковым точкам графика.' : 'Нет данных за выбранный период.'}</p>
      </article>`;
  }

  function renderRankingWidget(title, data) {
    const max = Math.max(...data.rows.map(r => r.value), 1);
    const top = data.rows.slice(0, 5);
    return `
      <article class="traffic-widget">
        <h3>${esc(title)}</h3>
        <div class="traffic-stat-row">
          <div class="traffic-stat"><span class="traffic-stat-label">Лидер</span><span class="traffic-stat-value">${esc(data.leader?.label || '-')}</span></div>
          <div class="traffic-stat"><span class="traffic-stat-label">Доля лидера</span><span class="traffic-stat-value">${data.leader && data.total ? Math.round(data.leader.value / data.total * 100) : 0}%</span></div>
          <div class="traffic-stat"><span class="traffic-stat-label">Всего значений</span><span class="traffic-stat-value">${data.unique}</span></div>
          <div class="traffic-stat"><span class="traffic-stat-label">Всего заявок</span><span class="traffic-stat-value">${data.total}</span></div>
        </div>
        <div class="traffic-ranking">
          ${top.map(r => `
            <div class="traffic-rank-row">
              <span class="traffic-rank-label">${esc(r.label)}</span>
              <strong>${r.value}</strong>
              <span class="traffic-rank-track"><span class="traffic-rank-fill" style="width:${Math.max(4, r.value / max * 100)}%"></span></span>
            </div>`).join('') || '<p class="traffic-muted">Нет данных</p>'}
        </div>
      </article>`;
  }

  function renderHoursWidget(data) {
    return `
      <article class="traffic-widget wide">
        <h3>Пиковые часы 9–18</h3>
        <div class="traffic-stat-row">
          <div class="traffic-stat"><span class="traffic-stat-label">Пик трафика</span><span class="traffic-stat-value">${data.peak?.label || '-'}:00</span></div>
          <div class="traffic-stat"><span class="traffic-stat-label">Среднее значение</span><span class="traffic-stat-value">${data.avg.toFixed(1)}</span></div>
          <div class="traffic-stat"><span class="traffic-stat-label">Отклонение от среднего</span><span class="traffic-stat-value">${data.deviation.toFixed(1)}</span></div>
          <div class="traffic-stat"><span class="traffic-stat-label">Всего в рабочие часы</span><span class="traffic-stat-value">${data.total}</span></div>
        </div>
        ${renderBars(data.rows, data.peak?.label)}
      </article>`;
  }

  function renderBars(points, peakLabel) {
    const max = Math.max(...points.map(p => p.value), 1);
    return `<div class="traffic-chart">
      ${points.map(p => `<div class="traffic-bar ${p.label === peakLabel ? 'peak' : ''}" title="${esc(p.label)}: ${p.value}" style="height:${Math.max(3, p.value / max * 100)}%"><span>${esc(p.label)}</span></div>`).join('')}
    </div>`;
  }

  function renderAdvancedTab() {
    const widgets = state.widgets || [];
    return `
      <div class="traffic-card" style="padding:16px">
        <div class="traffic-toolbar">
          <button class="traffic-btn primary" id="traffic-add-widget" ${widgets.length >= 15 ? 'disabled' : ''}>+ Добавить виджет</button>
          <button class="traffic-btn" id="traffic-import-widgets">Импорт настроек</button>
          <button class="traffic-btn" id="traffic-export-widgets">Экспорт настроек</button>
          <button class="traffic-btn danger" id="traffic-clear-csv">Очистить CSV</button>
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
    const fields = (widget.selectedFields || []).map(f => f.normalizedName).join(', ');
    const primary = widget.selectedFields?.[0]?.normalizedName;
    const data = primary ? makeRanking(state.rows.map(row => ({ row })), primary) : null;
    return `
      <article class="traffic-widget">
        <h3>${esc(widget.title || 'Без названия')}</h3>
        <p class="traffic-muted">${esc(FORMAT_LABELS[widget.format] || widget.format || 'Виджет')} · ${esc(fields || 'поля не выбраны')}</p>
        ${data ? renderRankingWidget('Предпросмотр', data).replace('class="traffic-widget"', 'class="traffic-card" style="padding:12px"') : '<p class="traffic-muted">Нет данных для построения.</p>'}
        <p class="traffic-widget-note">Пересчитано: ${esc(fmtDateTime(new Date(widget.updatedAt || Date.now())))}</p>
        <button class="traffic-btn danger" data-delete-traffic-widget="${esc(widget.id)}">Удалить</button>
      </article>`;
  }

  function showWidgetBuilder() {
    const modal = document.getElementById('traffic-modal');
    if (!modal) return;
    const formatOptions = Object.entries(FORMAT_LABELS).map(([v, label]) => `<option value="${v}">${esc(label)}</option>`).join('');
    modal.innerHTML = `
      <div class="traffic-modal-card">
        <h2>Новый виджет</h2>
        <p class="traffic-muted">Формат определяет внешний вид. Расчеты будут выполнены по выбранным полям CSV.</p>
        <label class="traffic-field">Название виджета<input id="traffic-widget-title" placeholder="Заявки по источникам"></label>
        <label class="traffic-field">Формат виджета<select id="traffic-widget-format">${formatOptions}</select></label>
        <div>
          <strong>Выбрать поля из CSV</strong>
          <p class="traffic-muted" id="traffic-selected-count">Выбрано 0 из 10</p>
          <div class="traffic-fields">
            ${state.fields.map(f => `
              <label class="traffic-field">
                <span><input type="checkbox" class="traffic-field-check" value="${esc(f.normalizedName)}"> ${esc(f.normalizedName)}</span>
                <span class="traffic-field-meta">${esc(f.type)} · пример: ${esc(f.example || '-')}</span>
              </label>`).join('')}
          </div>
        </div>
        <div class="traffic-modal-actions">
          <button class="traffic-btn" data-traffic-close>Отмена</button>
          <button class="traffic-btn primary" id="traffic-save-widget">Сохранить виджет</button>
        </div>
      </div>`;
    modal.classList.add('open');
    modal.querySelector('[data-traffic-close]').onclick = closeModal;
    const checks = modal.querySelectorAll('.traffic-field-check');
    checks.forEach(ch => {
      ch.onchange = () => {
        const selected = Array.from(checks).filter(x => x.checked);
        if (selected.length > 10) {
          ch.checked = false;
          notify('В один виджет можно добавить не больше 10 полей.', 'e');
        }
        modal.querySelector('#traffic-selected-count').textContent = `Выбрано ${Array.from(checks).filter(x => x.checked).length} из 10`;
      };
    });
    modal.querySelector('#traffic-save-widget').onclick = () => {
      const selected = Array.from(checks).filter(x => x.checked).map(x => x.value);
      if (!selected.length) {
        notify('Выберите хотя бы одно поле CSV.', 'e');
        return;
      }
      const now = new Date().toISOString();
      const selectedFields = selected.map(name => {
        const f = state.fields.find(field => field.normalizedName === name);
        return {
          originalName: f.originalName,
          normalizedName: f.normalizedName,
          role: f.type === 'date' || f.type === 'datetime' ? 'date' : 'groupBy',
          type: f.type,
          aggregation: f.type === 'number' || f.type === 'money' ? 'sum' : 'count'
        };
      });
      const title = modal.querySelector('#traffic-widget-title').value.trim() || selected.join(' + ');
      state.widgets.push({
        id: `widget_${Date.now()}`,
        title,
        format: modal.querySelector('#traffic-widget-format').value,
        orientation: 'auto',
        selectedFields,
        period: { type: 'all', dateFrom: null, dateTo: null },
        filters: [],
        textBlocks: ['total','average','peak','summary'],
        chart: { type: 'auto', showPeak: true, showLegend: true },
        createdAt: now,
        updatedAt: now
      });
      localStorage.setItem(STORAGE.widgets, JSON.stringify(state.widgets));
      closeModal();
      renderTrafficAnalytics();
      notify('Виджет сохранён', 's');
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
