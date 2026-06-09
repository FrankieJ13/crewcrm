// AUTO.RU CM — каталог авто. IIFE → lazy init, вызывается window.autoruCatalogInit() при открытии вкладки.
window.autoruCatalogInit = function () {
  if (window._autoruCatInited) return;
  window._autoruCatInited = true;
  try { window.DIAG?.push('info','autoru-cat', ['init']); } catch(_){}
  const cfg = window.AUTORU_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const els = {
    status: $('status'), counter: $('counter'),
    statusMobile: $('statusMobile'), counterMobile: $('counterMobile'),
    grid: $('grid'), chips: $('chips'),
    q: $('q'),
    city: $('city'), brand: $('brand'), model: $('model'), body: $('body'),
    transmission: $('transmission'), drive: $('drive'), wheel: $('wheel'),
    country: $('country'), seats: $('seats'), owners: $('owners'),
    pts: $('pts'), condition: $('condition'), color: $('color'),
    priceMin: $('priceMin'), priceMax: $('priceMax'),
    yearMin: $('yearMin'), yearMax: $('yearMax'), mileageMax: $('mileageMax'),
    sort: $('sort'),
    reset: $('reset'), loadMore: $('loadMore'),
    openFilters: $('openFilters'), filtersPopup: $('filtersPopup'), filtersCount: $('filtersCount'),
  };

  // Поля-фильтры по типу — для удобства итерации (reset, badge, события).
  const SELECT_FILTERS = ['city','brand','model','body','transmission','drive','wheel','country','seats','owners','pts','condition','color'];
  const NUMBER_FILTERS = ['priceMin','priceMax','yearMin','yearMax','mileageMax'];

  let cars = [];
  let filtered = [];
  let shown = 0;

  // ============ ЗАГРУЗКА ============
  // Сначала пробуем upstream (свежий каталог), при ошибке — локальный fallback
  const fetchCars = async () => {
    try {
      try { window.DIAG?.push('info','autoru-cat', ['fetch upstream', cfg.dataUrl]); } catch(_){}
      const r = await fetch(cfg.dataUrl, { redirect: 'follow', cache: 'default' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      try { window.DIAG?.push('warn','autoru-cat', ['upstream failed → fallback', e.message]); } catch(_){}
      if (cfg.fallbackUrl) {
        const r2 = await fetch(cfg.fallbackUrl, { cache: 'default' });
        if (!r2.ok) throw new Error('HTTP ' + r2.status + ' (fallback)');
        return await r2.json();
      }
      throw e;
    }
  };
  fetchCars()
    .then(data => { return data; }) // pass-through, чтобы цепочка ниже работала
    .then(data => {
      const h = data.h || [];
      cars = (data.r || []).map(row => {
        const o = {};
        for (let i = 0; i < h.length; i++) o[h[i]] = row[i] === undefined ? '' : row[i];
        return o;
      });
      cars.forEach(c => { if (!c.country) c.country = COUNTRY_BY_BRAND[c.brand] || ''; });
      const status = 'Каталог: ' + cars.length + ' авто';
      if (els.status) els.status.textContent = status;
      if (els.statusMobile) els.statusMobile.textContent = status;
      try { window.DIAG?.push('info','autoru-cat', ['loaded', cars.length]); } catch(_){}
      populateSelects();
      apply();
      // Обновляем бейдж кол-ва — НЕ через renderInstruktsii (он сотрёт хост!),
      // а прямой правкой текста на кнопке КАТАЛОГ.
      try {
        const btn = document.querySelector('.autoru-subtab[onclick*="catalog"]');
        if (btn) btn.textContent = 'КАТАЛОГ · ' + cars.length.toLocaleString('ru-RU');
      } catch(_){}
    })
    .catch(err => {
      if (els.status) els.status.textContent = 'Ошибка загрузки: ' + err.message;
      try { window.DIAG?.push('error','autoru-cat', ['fetch failed', err.message]); } catch(_){}
    });

  // ============ ФИЛЬТРЫ-СЕЛЕКТЫ ============
  function populateSelects() {
    const fillText = (sel, values) => {
      const sorted = Array.from(new Set(values.filter(Boolean).map(String))).sort((a, b) => a.localeCompare(b, 'ru'));
      sorted.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
    };
    const fillNum = (sel, values, suffix) => {
      const sorted = Array.from(new Set(values.filter(v => v !== '' && v != null).map(Number).filter(Number.isFinite))).sort((a, b) => a - b);
      sorted.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v + (suffix || ''); sel.appendChild(o); });
    };
    fillText(els.city, cars.map(c => c.city));
    fillText(els.brand, cars.map(c => c.brand));
    fillText(els.model, cars.map(c => c.model));
    fillText(els.body, cars.map(c => c.body));
    fillText(els.transmission, cars.map(c => c.transmission));
    fillText(els.drive, cars.map(c => c.drive));
    fillText(els.wheel, cars.map(c => c.wheel));
    fillText(els.country, cars.map(c => c.country));
    fillText(els.condition, cars.map(c => c.condition));
    fillText(els.color, cars.map(c => c.color));
    fillText(els.pts, cars.map(c => c.pts));
    fillNum(els.seats, cars.map(c => c.seats));
    fillNum(els.owners, cars.map(c => c.owners));
  }

  // ============ CASCADING: модель зависит от марки ============
  function repopulateModels() {
    if (!els.model) return;
    const brand = els.brand.value;
    const prev = els.model.value;
    // Очищаем все опции кроме первой "Все модели"
    while (els.model.options.length > 1) els.model.remove(1);
    const subset = brand ? cars.filter(c => c.brand === brand) : cars;
    const sorted = Array.from(new Set(subset.map(c => c.model).filter(Boolean).map(String)))
      .sort((a, b) => a.localeCompare(b, 'ru'));
    sorted.forEach(v => {
      const o = document.createElement('option');
      o.value = v; o.textContent = v;
      els.model.appendChild(o);
    });
    // Если предыдущая модель уже не доступна — сбрасываем
    els.model.value = sorted.includes(prev) ? prev : '';
  }

  // ============ ПРИМЕНЕНИЕ ============
  function apply() {
    const rawQ = (els.q.value || '').trim();
    const parsed = rawQ && window.AutoSearch ? window.AutoSearch.parse(rawQ) : null;

    // селекты накладываются поверх распарсенного запроса
    const sel = {
      city: els.city.value, brand: els.brand.value, model: els.model.value, body: els.body.value,
      transmission: els.transmission.value, drive: els.drive.value, wheel: els.wheel.value,
      country: els.country.value, condition: els.condition.value, color: els.color.value,
      pts: els.pts.value, seats: els.seats.value, owners: els.owners.value,
    };
    const numFilters = {
      priceMin: Number(els.priceMin.value) || 0,
      priceMax: Number(els.priceMax.value) || 0,
      yearMin:  Number(els.yearMin.value)  || 0,
      yearMax:  Number(els.yearMax.value)  || 0,
      mileageMax: Number(els.mileageMax.value) || 0,
    };

    filtered = cars.filter(c => {
      if (sel.city  && c.city  !== sel.city)  return false;
      if (sel.brand && c.brand !== sel.brand) return false;
      if (sel.model && c.model !== sel.model) return false;
      if (sel.body  && c.body  !== sel.body)  return false;
      if (sel.transmission && c.transmission !== sel.transmission) return false;
      if (sel.drive && c.drive !== sel.drive) return false;
      if (sel.wheel && c.wheel !== sel.wheel) return false;
      if (sel.country && c.country !== sel.country) return false;
      if (sel.condition && c.condition !== sel.condition) return false;
      if (sel.color && c.color !== sel.color) return false;
      if (sel.pts && c.pts !== sel.pts) return false;
      if (sel.seats && String(c.seats) !== sel.seats) return false;
      if (sel.owners && String(c.owners) !== sel.owners) return false;
      const price = Number(c.price);
      if (numFilters.priceMin && !(price >= numFilters.priceMin)) return false;
      if (numFilters.priceMax && !(price <= numFilters.priceMax)) return false;
      const year = Number(c.year);
      if (numFilters.yearMin && !(year >= numFilters.yearMin)) return false;
      if (numFilters.yearMax && !(year <= numFilters.yearMax)) return false;
      const mileage = Number(c.mileage);
      if (numFilters.mileageMax && !(mileage <= numFilters.mileageMax)) return false;
      if (parsed && !window.AutoSearch.match(c, parsed)) return false;
      return true;
    });

    // сортировка
    const s = els.sort.value;
    filtered.sort((a, b) => {
      if (s === 'price_asc')    return num(a.price) - num(b.price);
      if (s === 'price_desc')   return num(b.price) - num(a.price);
      if (s === 'year_desc')    return num(b.year)  - num(a.year);
      if (s === 'year_asc')     return num(a.year)  - num(b.year);
      if (s === 'mileage_asc')  return num(a.mileage) - num(b.mileage);
      if (s === 'updated_desc') return (b.updated_at || '').localeCompare(a.updated_at || '');
      return 0;
    });

    renderChips(parsed);
    updateFiltersBadge();
    shown = 0;
    els.grid.innerHTML = '';
    render();
  }

  function updateFiltersBadge() {
    const active = SELECT_FILTERS.filter(k => els[k].value).length
                 + NUMBER_FILTERS.filter(k => els[k].value).length;
    if (active) {
      els.filtersCount.textContent = active;
      els.filtersCount.hidden = false;
    } else {
      els.filtersCount.textContent = '';
      els.filtersCount.hidden = true;
    }
  }

  function renderChips(parsed) {
    if (!parsed) { els.chips.innerHTML = ''; return; }
    const chips = window.AutoSearch.chips(parsed);
    if (parsed.free) chips.push(['+', parsed.free]);
    els.chips.innerHTML = chips.map(([k, v]) =>
      `<span class="chip">${k}: <strong>${esc(String(v))}</strong></span>`
    ).join('');
  }

  function render() {
    const pageSize = cfg.pageSize || 24;
    if (!filtered.length) {
      els.grid.innerHTML = '<div class="empty">Ничего не найдено по фильтрам.</div>';
      els.loadMore.hidden = true;
      els.counter.textContent = '0 из 0';
      els.counterMobile.textContent = '0 из 0';
      return;
    }
    const slice = filtered.slice(shown, shown + pageSize);
    const frag = document.createDocumentFragment();
    slice.forEach(c => frag.appendChild(card(c)));
    els.grid.appendChild(frag);
    shown += slice.length;
    els.loadMore.hidden = shown >= filtered.length;
    const ct = shown + ' из ' + filtered.length;
    els.counter.textContent = ct;
    els.counterMobile.textContent = ct;
  }

  // ============ ИКОНКИ (загружены пользователем, currentColor → url(#iconGrad)) ============
  const ICONS = {
    year:    '<svg viewBox="0 0 24 24"><path fill="url(#iconGrad)" fill-rule="evenodd" clip-rule="evenodd" d="M7 1.75a.75.75 0 0 1 .75.75v.763c.662-.013 1.391-.013 2.194-.013h4.112c.803 0 1.532 0 2.194.013V2.5a.75.75 0 0 1 1.5 0v.827q.39.03.739.076c1.172.158 2.121.49 2.87 1.238c.748.749 1.08 1.698 1.238 2.87q.074.562.107 1.23a.75.75 0 0 1 .019.46c.027.801.027 1.712.027 2.743v2.112c0 1.838 0 3.294-.153 4.433c-.158 1.172-.49 2.121-1.238 2.87c-.749.748-1.698 1.08-2.87 1.238c-1.14.153-2.595.153-4.433.153H9.944c-1.838 0-3.294 0-4.433-.153c-1.172-.158-2.121-.49-2.87-1.238c-.748-.749-1.08-1.698-1.238-2.87c-.153-1.14-.153-2.595-.153-4.433v-2.112c0-1.031 0-1.942.027-2.744a.75.75 0 0 1 .02-.46q.032-.667.106-1.229c.158-1.172.49-2.121 1.238-2.87c.749-.748 1.698-1.08 2.87-1.238q.35-.046.739-.076V2.5A.75.75 0 0 1 7 1.75m-4.237 8c-.013.653-.013 1.396-.013 2.25v2c0 1.907.002 3.262.14 4.29c.135 1.005.389 1.585.812 2.008s1.003.677 2.009.812c1.028.138 2.382.14 4.289.14h4c1.907 0 3.262-.002 4.29-.14c1.005-.135 1.585-.389 2.008-.812s.677-1.003.812-2.009c.138-1.027.14-2.382.14-4.289v-2c0-.854 0-1.597-.013-2.25zm18.405-1.5H2.832q.024-.284.058-.54c.135-1.005.389-1.585.812-2.008s1.003-.677 2.009-.812c1.028-.138 2.382-.14 4.289-.14h4c1.907 0 3.262.002 4.29.14c1.005.135 1.585.389 2.008.812s.677 1.003.812 2.009q.034.255.058.539m-10.381 4.057a.75.75 0 0 1 .463.693v4a.75.75 0 0 1-1.5 0v-2.19l-.22.22a.75.75 0 0 1-1.06-1.06l1.5-1.5a.75.75 0 0 1 .817-.163M14 13.75a.25.25 0 0 0-.25.25v2a.25.25 0 1 0 .5 0v-2a.25.25 0 0 0-.25-.25m-1.75.25a1.75 1.75 0 1 1 3.5 0v2a1.75 1.75 0 1 1-3.5 0z"/></svg>',
    miles:   '<svg viewBox="0 0 24 24"><g fill="none" stroke="url(#iconGrad)" stroke-width="1.5"><path d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2s10 4.477 10 10Z"/><path stroke-linecap="round" d="m19 19l-1.5-1.5M19 5l-1.5 1.5M5 19l1.5-1.5M5 5l1.5 1.5M2 12h2m16 0h2M12 4V2"/><path d="M10.121 14.364a3 3 0 1 1 4.243-4.243c.446.446.757 1.371.971 2.346c.321 1.459.482 2.188-.099 2.77c-.58.58-1.31.42-2.769.098c-.975-.214-1.9-.525-2.346-.971Z"/></g></svg>',
    engine:  '<svg viewBox="0 0 256 256"><path fill="url(#iconGrad)" d="M240 104h-12.69L192 68.69A15.86 15.86 0 0 0 180.69 64H140V40h24a8 8 0 0 0 0-16h-64a8 8 0 0 0 0 16h24v24H64a16 16 0 0 0-16 16v52H24v-24a8 8 0 0 0-16 0v64a8 8 0 0 0 16 0v-24h24v20.69A15.86 15.86 0 0 0 52.69 180L92 219.31a15.86 15.86 0 0 0 11.31 4.69h77.38a15.86 15.86 0 0 0 11.31-4.69L227.31 184H240a16 16 0 0 0 16-16v-48a16 16 0 0 0-16-16m0 64h-16a8 8 0 0 0-5.66 2.34L180.69 208h-77.38L64 168.69V80h116.69l37.65 37.66A8 8 0 0 0 224 120h16Z"/></svg>',
    fuel:    '<svg viewBox="0 0 24 24"><path fill="url(#iconGrad)" fill-rule="evenodd" clip-rule="evenodd" d="M8.945 1.25h1.11c1.367 0 2.47 0 3.337.117c.9.12 1.658.38 2.26.981c.602.602.86 1.36.982 2.26c.116.867.116 1.97.116 3.337v8.305h.821c1.204 0 2.179.975 2.179 2.179v.071a.75.75 0 0 0 1.5 0v-3.96l-1.462-.487a2.25 2.25 0 0 1-1.538-2.134V9.5a2.25 2.25 0 0 1 2.25-2.25h.742a2.25 2.25 0 0 0-.74-1.483a6 6 0 0 0-.237-.195l-1.233-.986a.75.75 0 1 1 .936-1.172l1.25 1c.122.098.206.165.285.236a3.75 3.75 0 0 1 1.241 2.582c.006.105.006.213.006.37V18.5a2.25 2.25 0 0 1-4.5 0v-.071a.68.68 0 0 0-.679-.679h-.821v3.5H17a.75.75 0 0 1 0 1.5H2a.75.75 0 0 1 0-1.5h.25V7.945c0-1.367 0-2.47.117-3.337c.12-.9.38-1.658.981-2.26c.602-.602 1.36-.86 2.26-.981c.867-.117 1.97-.117 3.337-.117m-5.195 20h11.5V8c0-1.435-.002-2.437-.103-3.192c-.099-.734-.28-1.122-.556-1.399c-.277-.277-.665-.457-1.4-.556c-.755-.101-1.756-.103-3.191-.103H9c-1.435 0-2.437.002-3.192.103c-.734.099-1.122.28-1.399.556c-.277.277-.457.665-.556 1.4C3.752 5.562 3.75 6.564 3.75 8zm17.5-8.29V8.75h-.75a.75.75 0 0 0-.75.75v2.419c0 .323.207.61.513.711zM7.955 5.25h3.09c.433 0 .83 0 1.152.043c.356.048.731.16 1.04.47s.422.684.47 1.04c.043.323.043.72.043 1.152v.09c0 .433 0 .83-.043 1.152c-.048.356-.16.731-.47 1.04s-.684.422-1.04.47c-.323.043-.72.043-1.152.043h-3.09c-.433 0-.83 0-1.152-.043c-.356-.048-.731-.16-1.04-.47s-.422-.684-.47-1.04c-.043-.323-.043-.72-.043-1.152v-.09c0-.433 0-.83.043-1.152c.048-.356.16-.731.47-1.04s.684-.422 1.04-.47c.323-.043.72-.043 1.152-.043M6.826 6.822l-.003.001l-.001.003l-.005.01a.7.7 0 0 0-.037.167c-.028.21-.03.504-.03.997s.002.787.03.997a.7.7 0 0 0 .042.177l.001.003l.003.001l.01.005c.022.009.07.024.167.037c.21.028.504.03.997.03h3c.493 0 .787-.002.997-.03a.7.7 0 0 0 .177-.042l.003-.001l.001-.003l.005-.01a.7.7 0 0 0 .037-.167c.028-.21.03-.504.03-.997s-.002-.787-.03-.997a.7.7 0 0 0-.042-.177l-.001-.003l-.003-.001l-.01-.005a.7.7 0 0 0-.167-.037c-.21-.028-.504-.03-.997-.03H8c-.493 0-.787.002-.997.03a.7.7 0 0 0-.177.042M6.25 17a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5H7a.75.75 0 0 1-.75-.75"/></svg>',
    gearbox: '<svg viewBox="0 0 24 24"><path fill="url(#iconGrad)" fill-rule="evenodd" clip-rule="evenodd" d="M4 2.75a1.25 1.25 0 1 0 0 2.5a1.25 1.25 0 0 0 0-2.5M1.25 4a2.75 2.75 0 1 1 3.5 2.646v4.604h6.5V6.646a2.751 2.751 0 1 1 1.5 0v4.604H16c.964 0 1.612-.002 2.095-.066c.461-.063.659-.17.789-.3s.237-.328.3-.79c.064-.482.066-1.13.066-2.094V6.646a2.751 2.751 0 1 1 1.5 0v1.406c0 .898 0 1.648-.08 2.242c-.084.628-.27 1.195-.726 1.65c-.455.456-1.022.642-1.65.726c-.594.08-1.343.08-2.242.08H12.75v4.604a2.751 2.751 0 1 1-1.5 0V12.75h-6.5v4.604a2.751 2.751 0 1 1-1.5 0V6.646A2.75 2.75 0 0 1 1.25 4M12 2.75a1.25 1.25 0 1 0 0 2.5a1.25 1.25 0 0 0 0-2.5m8 0a1.25 1.25 0 1 0 0 2.5a1.25 1.25 0 0 0 0-2.5M17.25 15a.75.75 0 0 1 .75-.75h2.286c1.375 0 2.464 1.134 2.464 2.5a2.5 2.5 0 0 1-1.641 2.358l1.53 2.5a.75.75 0 1 1-1.279.784l-1.923-3.142h-.687V22a.75.75 0 0 1-1.5 0zm1.5 2.75h1.536c.518 0 .964-.433.964-1s-.446-1-.964-1H18.75zM4 18.75a1.25 1.25 0 1 0 0 2.5a1.25 1.25 0 0 0 0-2.5m8 0a1.25 1.25 0 1 0 0 2.5a1.25 1.25 0 0 0 0-2.5"/></svg>',
    drive:   '<svg viewBox="0 0 24 24"><path fill="url(#iconGrad)" d="M5.5 3A2.5 2.5 0 0 0 3 5.5v3a2.5 2.5 0 0 0 5 0V8h2.268c.221.384.567.687.982.855v6.29c-.415.168-.76.471-.982.855H8v-.5a2.5 2.5 0 0 0-5 0v3a2.5 2.5 0 0 0 5 0v-1h2.063a2 2 0 0 0 3.874 0H16v1a2.5 2.5 0 0 0 5 0v-3a2.5 2.5 0 0 0-5 0v.5h-2.268a2 2 0 0 0-.982-.855v-6.29c.415-.168.76-.471.982-.855H16v.5a2.5 2.5 0 0 0 5 0v-3a2.5 2.5 0 0 0-5 0v1h-2.063a2 2 0 0 0-3.874 0H8v-1A2.5 2.5 0 0 0 5.5 3m-1 2.5a1 1 0 0 1 2 0v3a1 1 0 0 1-2 0zm1 9a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0v-3a1 1 0 0 1 1-1m12-9a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0zm1 9a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0v-3a1 1 0 0 1 1-1"/></svg>',
    wheel:   '<svg viewBox="0 0 24 24"><path fill="url(#iconGrad)" d="M17 3.34A10 10 0 1 1 2 12l.005-.324A10 10 0 0 1 17 3.34M4 12a8 8 0 0 0 7 7.937V14.83a3 3 0 0 1-1.898-2.05l-5.07-1.504q-.031.36-.032.725m15.967-.725l-5.069 1.503a3 3 0 0 1-1.897 2.051v5.108a8 8 0 0 0 6.985-8.422zM8 5.072a8 8 0 0 0-3.536 4.244l4.812 1.426a3 3 0 0 1 5.448 0l4.812-1.426A8 8 0 0 0 8 5.072"/></svg>',
    body:    '<svg viewBox="0 0 24 24"><path fill="url(#iconGrad)" d="M18.626 6.026A2.75 2.75 0 0 0 15.971 4h-4.83a2.75 2.75 0 0 0-2.368 1.352L6.265 9.598l-2.182.546A2.75 2.75 0 0 0 2 12.812V14.5a2.75 2.75 0 0 0 1.585 2.492a3.251 3.251 0 0 0 6.258.258h4.814a3.252 3.252 0 0 0 6.32-.61A2.75 2.75 0 0 0 22 14.5v-2.25a2.75 2.75 0 0 0-2.422-2.73zM9.962 15.75a3.25 3.25 0 0 0-6.274-.591A1.24 1.24 0 0 1 3.5 14.5v-1.688c0-.574.39-1.074.947-1.213L6.844 11H19.25c.69 0 1.25.56 1.25 1.25v2.267a3.25 3.25 0 0 0-5.962 1.233zM13 9.5H8.066l2-3.386a1.25 1.25 0 0 1 1.076-.614H13zm1.5-4h1.472a1.25 1.25 0 0 1 1.206.921l.84 3.079H14.5zm3.25 9a1.75 1.75 0 1 1 0 3.5a1.75 1.75 0 0 1 0-3.5M8.5 16.25a1.75 1.75 0 1 1-3.5 0a1.75 1.75 0 0 1 3.5 0"/></svg>',
    seats:   '<svg viewBox="0 0 24 24"><path fill="url(#iconGrad)" d="M7 18S4 10 4 6s2-4 2-4h1s1 0 1 1s-1 1-1 3s3 4 3 7s-3 5-3 5m5-1c-1 0-4 2.5-4 2.5c-.3.2-.2.5 0 .8c0 0 1 1.8 3 1.8h6c1.1 0 2-.9 2-2v-1c0-1.1-.9-2-2-2h-5Z"/></svg>',
    color:   '<svg viewBox="0 0 14 14"><g fill="none" stroke="url(#iconGrad)" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.5" cy="4" r="1"/><circle cx="4.5" cy="9.5" r=".5"/><circle cx="4.5" cy="5.5" r="1"/><path d="M9.52 12.28a1 1 0 0 0-.65-.88a2 2 0 0 1 .63-3.9h1.87a2 2 0 0 0 1.89-2.67a6.5 6.5 0 1 0-6.13 8.67a6.3 6.3 0 0 0 1.74-.24a.9.9 0 0 0 .65-.98Z"/></g></svg>',
    state:   '<svg viewBox="0 0 24 24"><g fill="none" stroke="url(#iconGrad)" stroke-width="1.5"><path d="M16 4c2.175.012 3.353.109 4.121.877C21 5.756 21 7.17 21 9.998v6c0 2.829 0 4.243-.879 5.122c-.878.878-2.293.878-5.121.878H9c-2.828 0-4.243 0-5.121-.878C3 20.24 3 18.827 3 15.998v-6c0-2.828 0-4.242.879-5.121C4.647 4.109 5.825 4.012 8 4"/><path stroke-linecap="round" stroke-linejoin="round" d="m9 13.4l1.714 1.6L15 11"/><path d="M8 3.5A1.5 1.5 0 0 1 9.5 2h5A1.5 1.5 0 0 1 16 3.5v1A1.5 1.5 0 0 1 14.5 6h-5A1.5 1.5 0 0 1 8 4.5z"/></g></svg>',
    pts:     '<svg viewBox="0 0 24 24"><g fill="none" stroke="url(#iconGrad)" stroke-width="1.5"><path d="M2 12c0-3.771 0-5.657 1.172-6.828S6.229 4 10 4h4c3.771 0 5.657 0 6.828 1.172S22 8.229 22 12s0 5.657-1.172 6.828S17.771 20 14 20h-4c-3.771 0-5.657 0-6.828-1.172S2 15.771 2 12Z"/><path stroke-linecap="round" d="M10 16.5H6m2-3H6M2 10h20"/><path d="M14 15c0-.943 0-1.414.293-1.707S15.057 13 16 13s1.414 0 1.707.293S18 14.057 18 15s0 1.414-.293 1.707S16.943 17 16 17s-1.414 0-1.707-.293S14 15.943 14 15Z"/></g></svg>',
    owner:   '<svg viewBox="0 0 24 24"><g fill="none" stroke="url(#iconGrad)" stroke-width="1.5"><circle cx="12" cy="6" r="4"/><path stroke-linecap="round" d="M18 9c1.657 0 3-1.12 3-2.5S19.657 4 18 4M6 9C4.343 9 3 7.88 3 6.5S4.343 4 6 4" opacity=".5"/><ellipse cx="12" cy="17" rx="6" ry="4"/><path stroke-linecap="round" d="M20 19c1.754-.385 3-1.359 3-2.5s-1.246-2.115-3-2.5M4 19c-1.754-.385-3-1.359-3-2.5s1.246-2.115 3-2.5" opacity=".5"/></g></svg>',
    flag:    '<svg viewBox="0 0 24 24"><path fill="url(#iconGrad)" fill-rule="evenodd" clip-rule="evenodd" d="M5.578 5.343a9.25 9.25 0 0 0 6.803 15.9c-.206-.912-.234-2.138.393-3.319c.652-1.229 2.002-1.762 2.995-2.006a9.2 9.2 0 0 1 1.898-.254h.043c1.673-.018 2.426-.562 2.826-1.08c.342-.444.47-.887.602-1.336l.05-.172A9.22 9.22 0 0 0 18.6 5.519l-.027.1c-.163.594-.425 1.202-.711 1.636c-.256.388-.752.78-1.164 1.076a10 10 0 0 1-.902.56c-.228.132-.433.25-.63.38c-.432.286-.766.593-.991 1.056a.67.67 0 0 0-.035.49c.075.272.126.578.126.889c.002.649-.328 1.176-.753 1.518a2.4 2.4 0 0 1-1.521.526c-2.455-.027-3.965-2.02-4.164-4.236c-.08-.881-.466-1.773-.954-2.552a8.8 8.8 0 0 0-1.296-1.62m1.167-.956a10.5 10.5 0 0 1 1.4 1.779c.558.89 1.069 2.012 1.177 3.214c.15 1.68 1.213 2.854 2.686 2.87a.9.9 0 0 0 .563-.194c.146-.117.196-.24.195-.346c0-.156-.026-.328-.072-.495a2.16 2.16 0 0 1 .131-1.542c.385-.794.956-1.285 1.514-1.653c.239-.158.487-.3.71-.43l.09-.05c.255-.148.48-.28.683-.427c.431-.31.704-.557.787-.684c.183-.276.388-.734.518-1.207c.103-.374.131-.662.122-.84A9.2 9.2 0 0 0 12 2.75a9.2 9.2 0 0 0-5.255 1.637M22.68 13.24q.07-.61.071-1.24c0-5.937-4.813-10.75-10.75-10.75S1.25 6.063 1.25 12S6.063 22.75 12 22.75c5.46 0 9.97-4.071 10.659-9.344a3 3 0 0 1 .048-.156zm-2.774 3.567c-.596.218-1.314.348-2.179.357h-.031l-.09.003a7.7 7.7 0 0 0-1.477.208c-.902.221-1.693.62-2.029 1.252c-.456.859-.39 1.793-.22 2.432a9.26 9.26 0 0 0 6.026-4.252"/></svg>',
    pin:     '<svg viewBox="0 0 24 24"><g fill="none" stroke="url(#iconGrad)" stroke-width="1.5"><path d="M4 10.143C4 5.646 7.582 2 12 2s8 3.646 8 8.143c0 4.462-2.553 9.67-6.537 11.531a3.45 3.45 0 0 1-2.926 0C6.553 19.812 4 14.606 4 10.144Z"/><circle cx="12" cy="10" r="3"/></g></svg>',
    trim:    '<svg viewBox="0 0 24 24"><g fill="url(#iconGrad)" fill-rule="evenodd" clip-rule="evenodd"><path d="M12 10.75c-.502 0-.814.325-.986.55c-.165.214-.33.511-.5.816l-.121.218l-.057.1l-.099.023l-.238.054c-.327.074-.653.148-.903.246c-.276.109-.65.32-.795.785c-.142.456.037.841.193 1.09c.145.23.365.486.59.749l.16.188l.083.097l-.013.135l-.024.25c-.034.352-.067.692-.055.964c.012.285.08.717.468 1.01c.4.304.84.238 1.12.158c.258-.074.563-.215.87-.356l.222-.103l.085-.038l.037.017l.048.021l.223.103c.306.141.611.282.869.356c.28.08.72.146 1.12-.157c.387-.294.456-.726.468-1.011c.012-.272-.02-.613-.055-.965l-.024-.249l-.012-.135q.03-.039.082-.097l.16-.188c.225-.263.445-.52.59-.75c.156-.248.335-.633.193-1.09c-.144-.463-.519-.675-.795-.784c-.25-.098-.576-.172-.903-.246l-.238-.054l-.1-.023l-.056-.1l-.121-.218c-.17-.305-.335-.602-.5-.816c-.172-.225-.484-.55-.986-.55m-.199 2.138q.112-.204.199-.353q.086.149.199.353l.098.176l.023.04c.078.144.208.382.425.547c.221.168.488.226.643.26l.044.01l.19.042c.176.04.319.072.44.103c-.079.098-.182.219-.316.376l-.13.152l-.03.035c-.108.124-.282.325-.363.584c-.08.256-.052.52-.035.686l.005.047l.02.203c.018.188.032.338.042.46c-.105-.045-.223-.1-.364-.165l-.179-.082l-.04-.019c-.144-.068-.393-.185-.672-.185s-.528.117-.672.185l-.04.019l-.179.082q-.209.097-.364.166c.01-.123.024-.273.042-.461l.02-.203l.005-.047c.017-.166.045-.43-.035-.686c-.08-.26-.255-.46-.363-.584l-.03-.035l-.13-.152a21 21 0 0 1-.316-.376c.121-.03.264-.063.44-.103l.19-.043l.044-.01c.155-.033.422-.091.643-.26c.217-.164.347-.402.425-.545l.023-.04zm-1.062 4.124v-.003zm2.522 0v-.003z"/><path d="M12 1.25c-.706 0-1.155.5-1.457.947c-.306.455-.625 1.11-1.004 1.886L7.276 8.72c-.219.448-.36.735-.482.934a1 1 0 0 1-.142.192a.2.2 0 0 1-.087.017a1 1 0 0 1-.156-.122c-.162-.15-.364-.379-.684-.743l-.029-.033C5.124 8.313 4.656 7.78 4.27 7.42a3.3 3.3 0 0 0-.623-.477a1.4 1.4 0 0 0-.819-.196a1.74 1.74 0 0 0-1.187.637c-.355.429-.395 1.029-.39 1.547c.004.56.074 1.303.16 2.227l.238 2.522c.185 1.966.33 3.505.58 4.701c.256 1.218.64 2.183 1.375 2.933c.745.763 1.66 1.111 2.792 1.277c1.088.159 2.463.159 4.185.159h2.838c1.722 0 3.097 0 4.185-.16c1.132-.165 2.047-.513 2.792-1.276c.734-.75 1.119-1.715 1.374-2.933c.251-1.196.396-2.735.581-4.701l.238-2.522c.087-.924.157-1.667.16-2.227c.005-.518-.035-1.118-.39-1.547a1.74 1.74 0 0 0-1.187-.637a1.4 1.4 0 0 0-.819.196a3.3 3.3 0 0 0-.623.477c-.386.36-.854.893-1.426 1.545l-.03.033c-.32.364-.521.593-.683.743a1 1 0 0 1-.155.122a.2.2 0 0 1-.088-.017a1 1 0 0 1-.142-.192c-.122-.199-.263-.486-.482-.934l-2.263-4.637c-.379-.777-.698-1.431-1.004-1.886c-.302-.448-.75-.947-1.457-.947m-1.139 3.544c.412-.844.686-1.402.926-1.759A1.5 1.5 0 0 1 12 2.772c.04.037.11.112.213.263c.24.357.514.915.926 1.759l2.253 4.616c.198.407.371.76.536 1.03c.17.275.392.568.74.743c.313.158.666.216 1.016.16c.393-.062.691-.285.925-.501c.227-.21.48-.498.768-.826l.025-.028c.608-.693 1.027-1.169 1.352-1.472c.16-.15.266-.227.331-.263a.3.3 0 0 1 .113.08l.001.007c.01.03.054.172.05.58c-.003.487-.066 1.165-.157 2.136l-.23 2.435c-.19 2.024-.328 3.479-.56 4.582c-.229 1.09-.53 1.734-.978 2.193c-.438.448-1 .704-1.937.84c-.967.142-2.232.144-4.027.144h-2.72c-1.795 0-3.06-.002-4.027-.143c-.937-.137-1.499-.393-1.937-.841c-.448-.459-.75-1.103-.978-2.193c-.232-1.103-.37-2.558-.56-4.582l-.23-2.435c-.09-.971-.154-1.65-.158-2.137c-.003-.407.042-.55.05-.58l.003-.005a.3.3 0 0 1 .111-.082h.001c.065.037.17.114.331.264c.325.303.744.779 1.352 1.472l.025.028c.288.328.541.617.768.826c.234.216.532.44.925.502c.35.055.703-.003 1.016-.161c.348-.175.57-.468.74-.743c.165-.27.338-.623.536-1.03zm10.337 3.54l.005.006zM12.044 2.74l-.01.004q.01-.006.01-.004m-.079.004l-.009-.004z"/></g></svg>',
  };

  // Плитка: иконка | значение. Лейбл переезжает в title (тултип) — иконки достаточно.
  function tile(icon, label, value) {
    if (!value && value !== 0) return '';
    return '<div class="tile" title="' + esc(label) + ': ' + esc(String(value)) + '">' +
      '<span class="tile__icon">' + ICONS[icon] + '</span>' +
      '<span class="tile__value">' + esc(String(value)) + '</span>' +
    '</div>';
  }

  // Страна марки — статический маппинг (в данных пусто, заполняем здесь).
  const COUNTRY_BY_BRAND = {
    Toyota:'Япония', Nissan:'Япония', Honda:'Япония', Mazda:'Япония', Mitsubishi:'Япония',
    Subaru:'Япония', Suzuki:'Япония', Lexus:'Япония', Infiniti:'Япония', Daihatsu:'Япония',
    Acura:'Япония', Isuzu:'Япония',
    'Mercedes-Benz':'Германия', BMW:'Германия', Audi:'Германия', Volkswagen:'Германия',
    Porsche:'Германия', Opel:'Германия', Smart:'Германия', MAN:'Германия',
    Lada:'Россия', 'ВАЗ':'Россия', GAZ:'Россия', UAZ:'Россия', Moskvich:'Россия',
    Москвич:'Россия', Aurus:'Россия',
    Renault:'Франция', Peugeot:'Франция', Citroen:'Франция', Bugatti:'Франция', DS:'Франция',
    Hyundai:'Корея', Kia:'Корея', Genesis:'Корея', SsangYong:'Корея', Daewoo:'Корея',
    Chery:'Китай', Geely:'Китай', Haval:'Китай', GAC:'Китай', BYD:'Китай', Changan:'Китай',
    Jetour:'Китай', Lifan:'Китай', FAW:'Китай', Tank:'Китай', Voyah:'Китай', Zeekr:'Китай',
    MG:'Китай', Exeed:'Китай', Brilliance:'Китай', Dongfeng:'Китай', Omoda:'Китай',
    JAC:'Китай', Hongqi:'Китай', Foton:'Китай', Skywell:'Китай', Xpeng:'Китай', LiXiang:'Китай',
    Ford:'США', Chevrolet:'США', Cadillac:'США', Chrysler:'США', Dodge:'США', Jeep:'США',
    Tesla:'США', Lincoln:'США', GMC:'США', Buick:'США', Hummer:'США', Ram:'США',
    Volvo:'Швеция', Saab:'Швеция', Skoda:'Чехия',
    Fiat:'Италия', 'Alfa Romeo':'Италия', Ferrari:'Италия', Lamborghini:'Италия', Maserati:'Италия',
    'Land Rover':'Великобритания', Jaguar:'Великобритания', Mini:'Великобритания',
    Bentley:'Великобритания', 'Aston Martin':'Великобритания', 'Rolls-Royce':'Великобритания',
    SEAT:'Испания', Cupra:'Испания',
  };

  const STRIP_SVG = {
    shield: '<svg viewBox="0 0 24 24"><g fill="none"><path fill="url(#iconGrad)" d="M11.298 2.195a2 2 0 0 1 1.232-.055l.172.055l7 2.625a2 2 0 0 1 1.291 1.708l.007.165v5.363a9 9 0 0 1-4.709 7.911l-.266.139l-3.354 1.677a1.5 1.5 0 0 1-1.198.062l-.144-.062l-3.354-1.677a9 9 0 0 1-4.97-7.75l-.005-.3V6.693a2 2 0 0 1 1.145-1.808l.153-.065zM12 4.068L5 6.693v5.363a7 7 0 0 0 3.635 6.138l.235.123L12 19.882l3.13-1.565a7 7 0 0 0 3.865-5.997l.005-.264V6.693zm3.433 4.561a1 1 0 0 1 1.497 1.32l-.083.094l-5.234 5.235a1.1 1.1 0 0 1-1.46.085l-.096-.085l-2.404-2.404a1 1 0 0 1 1.32-1.498l.094.083l1.768 1.768z"/></g></svg>',
    wrench: '<svg viewBox="0 0 24 24"><g fill="none" stroke="url(#iconGrad)" stroke-width="1.5"><path d="M11 11L6 6"/><path stroke-linejoin="round" d="M5 7.5L7.5 5l-3-1.5l-1 1zm14.975 1.475a3.5 3.5 0 0 0 .79-3.74l-1.422 1.422h-2v-2l1.422-1.422a3.5 3.5 0 0 0-4.529 4.53l-6.47 6.471a3.5 3.5 0 0 0-4.53 4.529l1.421-1.422h2v2l-1.422 1.422a3.5 3.5 0 0 0 4.53-4.528l6.472-6.472a3.5 3.5 0 0 0 3.738-.79Z"/><path stroke-linejoin="round" d="m11.797 14.5l5.604 5.604a1.35 1.35 0 0 0 1.911 0l.792-.792a1.35 1.35 0 0 0 0-1.911L14.5 11.797"/></g></svg>',
    doc:    '<svg viewBox="0 0 16 16"><path fill="url(#iconGrad)" d="M8.75.75V2h.985c.304 0 .603.08.867.231l1.29.736q.058.033.124.033h2.234a.75.75 0 0 1 0 1.5h-.427l2.111 4.692a.75.75 0 0 1-.154.838l-.53-.53l.529.531l-.001.002l-.002.002l-.006.006l-.006.005l-.01.01l-.045.04q-.317.265-.686.45C14.556 10.78 13.88 11 13 11a4.5 4.5 0 0 1-2.023-.454a3.5 3.5 0 0 1-.686-.45l-.045-.04l-.016-.015l-.006-.006l-.004-.004v-.001a.75.75 0 0 1-.154-.838L12.178 4.5h-.162c-.305 0-.604-.079-.868-.231l-1.29-.736a.25.25 0 0 0-.124-.033H8.75V13h2.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5h2.5V3.5h-.984a.25.25 0 0 0-.124.033l-1.289.737c-.265.15-.564.23-.869.23h-.162l2.112 4.692a.75.75 0 0 1-.154.838l-.53-.53l.529.531l-.001.002l-.002.002l-.006.006l-.016.015l-.045.04q-.317.265-.686.45C4.556 10.78 3.88 11 3 11a4.5 4.5 0 0 1-2.023-.454a3.5 3.5 0 0 1-.686-.45l-.045-.04l-.016-.015l-.006-.006l-.004-.004v-.001a.75.75 0 0 1-.154-.838L2.178 4.5H1.75a.75.75 0 0 1 0-1.5h2.234a.25.25 0 0 0 .125-.033l1.288-.737c.265-.15.564-.23.869-.23h.984V.75a.75.75 0 0 1 1.5 0m2.945 8.477c.285.135.718.273 1.305.273s1.02-.138 1.305-.273L13 6.327Zm-10 0c.285.135.718.273 1.305.273s1.02-.138 1.305-.273L3 6.327Z"/></svg>',
    pin:    ICONS.pin,
  };

  // Логотипы марок (CDN drom.ru). Источник: anketa-cm.
  const LOGO_URLS = {
    "Aito":"https://r.drom.ru/js/bundles/media/aito-light.0caab072c01632f2.png","Audi":"https://r.drom.ru/js/bundles/media/audi-light.75b6056d0e41acd5.png","BAIC":"https://r.drom.ru/js/bundles/media/baic.5a16aef42282808c.png","BMW":"https://r.drom.ru/js/bundles/media/bmw-light.d8554c1e92b03045.png","BYD":"https://r.drom.ru/js/bundles/media/byd.1bd550e1c1a00ea7.png","Cadillac":"https://r.drom.ru/js/bundles/media/cadillac.40b154f6ecb131e4.png","Changan":"https://r.drom.ru/js/bundles/media/changan.9c8ae4ae573e17d1.png","Chery":"https://r.drom.ru/js/bundles/media/chery.30aa17044cd7e7d0.png","Chevrolet":"https://r.drom.ru/js/bundles/media/chevrolet.7a1549c14ec9bfff.png","Citroen":"https://r.drom.ru/js/bundles/media/citroen-light.9fd789d52766f63e.png","Daewoo":"https://r.drom.ru/js/bundles/media/daewoo.7ad59af93738d23d.png","Daihatsu":"https://r.drom.ru/js/bundles/media/daihatsu.54d26e973467e698.png","Exeed":"https://r.drom.ru/js/bundles/media/exeed.009e5d5f3aad4544.png","FAW":"https://r.drom.ru/js/bundles/media/faw.b4468374afb0a2a4.png","Ford":"https://r.drom.ru/js/bundles/media/ford.f71e8159380bf49b.png","GAC":"https://r.drom.ru/js/bundles/media/gac.0b11f1136707f5ba.png","Geely":"https://r.drom.ru/js/bundles/media/geely-light.7b86701812158965.png","Genesis":"https://r.drom.ru/js/bundles/media/genesis.14c04e15e9463788.png","Great Wall":"https://r.drom.ru/js/bundles/media/great-wall.6f986b8b16eb0a8b.png","Haima":"https://r.drom.ru/js/bundles/media/haima.0f094e36040b771b.png","Haval":"https://r.drom.ru/js/bundles/media/haval-light.79af4b758ffdeb79.png","Honda":"https://r.drom.ru/js/bundles/media/honda.a71e97477a819fc3.png","Hyundai":"https://r.drom.ru/js/bundles/media/hyundai-light.9015f0d559caa06a.png","Infiniti":"https://r.drom.ru/js/bundles/media/infiniti.f8b05e076dacf1d7.png","Jaecoo":"https://r.drom.ru/js/bundles/media/jaecoo-light.d54ce8a3f5ee7555.png","Jaguar":"https://r.drom.ru/js/bundles/media/jaguar.72a6ec162da24e31.png","Jeep":"https://r.drom.ru/js/bundles/media/jeep.5c7df33f88deae56.png","Jetour":"https://r.drom.ru/js/bundles/media/jetour-light.4e06072a4639a2f6.png","Kaiyi":"https://r.drom.ru/js/bundles/media/kaiyi-light.8ede9033c2c5570b.png","Kia":"https://r.drom.ru/js/bundles/media/kia-light.0f5e2b451de7fb66.png","Lada (ВАЗ)":"https://r.drom.ru/js/bundles/media/lada.85a26ecc218323cd.png","Lada":"https://r.drom.ru/js/bundles/media/lada.85a26ecc218323cd.png","ВАЗ":"https://r.drom.ru/js/bundles/media/lada.85a26ecc218323cd.png","Land Rover":"https://r.drom.ru/js/bundles/media/land-rover.f575feddafb47225.png","Lexus":"https://r.drom.ru/js/bundles/media/lexus.b93166dec5ae1360.png","Lifan":"https://r.drom.ru/js/bundles/media/lifan-light.cfef1c10e61e2ddf.png","Mazda":"https://r.drom.ru/js/bundles/media/mazda.c3208c174011a127.png","Mercedes-Benz":"https://r.drom.ru/js/bundles/media/mercedes-benz.a0afa7f12a925483.png","MINI":"https://r.drom.ru/js/bundles/media/mini-light.c7199b9ad628542d.png","Mitsubishi":"https://r.drom.ru/js/bundles/media/mitsubishi.65c2717a7a005030.png","Nissan":"https://r.drom.ru/js/bundles/media/nissan-light.3e2c1b1a5b9d5f44.png","Omoda":"https://r.drom.ru/js/bundles/media/omoda-light.a217529c894563b1.png","Opel":"https://r.drom.ru/js/bundles/media/opel-light.eca7e7709cb5e30f.png","Oshan":"https://r.drom.ru/js/bundles/media/oshan.37822d5cb18d03f7.png","Peugeot":"https://r.drom.ru/js/bundles/media/peugeot.c549476845fb11e6.png","Porsche":"https://r.drom.ru/js/bundles/media/porsche.280baae7a622d533.png","Ravon":"https://r.drom.ru/js/bundles/media/ravon.710cc8262ab1e8ad.png","Renault":"https://r.drom.ru/js/bundles/media/renault-light.43ab18e0bde119d7.png","SEAT":"https://r.drom.ru/js/bundles/media/seat.f419a28f3238524a.png","Skoda":"https://r.drom.ru/js/bundles/media/skoda.a9a03e95f464db4d.png","SsangYong":"https://r.drom.ru/js/bundles/media/ssangyong-light.7e35d323157fd74b.png","Subaru":"https://r.drom.ru/js/bundles/media/subaru.8676b4eb42ce3ce0.png","Suzuki":"https://r.drom.ru/js/bundles/media/suzuki.1ca02a4a39f84416.png","Tank":"https://r.drom.ru/js/bundles/media/tank-light.d03be2507b43a74d.png","Tenet":"https://r.drom.ru/js/bundles/media/tenet-light.ccc1ba181967f30a.png","Tesla":"https://r.drom.ru/js/bundles/media/tesla.4a459c85e060f5a4.png","Toyota":"https://r.drom.ru/js/bundles/media/toyota-light.c634f942f36c6b39.png","Volkswagen":"https://r.drom.ru/js/bundles/media/volkswagen-light.6d82214350fafc4d.png","Volvo":"https://r.drom.ru/js/bundles/media/volvo-light.3f24925350499f99.png","Voyah":"https://r.drom.ru/js/bundles/media/voyah-light.98abde8353379c89.png","Xcite":"https://r.drom.ru/js/bundles/media/xcite-light.9324b427c2d4e4dd.png","ЗАЗ":"https://r.drom.ru/js/bundles/media/zaz.f75fc8dcc20bde1d.png","Москвич":"https://r.drom.ru/js/bundles/media/moskvich.4a9c060188cc9566.png","УАЗ":"https://r.drom.ru/js/bundles/media/uaz.cb8c6723735ab60b.png"
  };

  // Адреса дилеров по городу (из тз).
  const ADDRESS_BY_CITY = {
    'Пермь':       'Спешилова 101а',
    'Челябинск':   'Кузнецова 1а',
    'Барнаул':     'Правобережный тракт 26',
    'Новосибирск': 'Большевистская 276',
    'Тюмень':      'Республики 254/3',
    'Омск':        'Енисейская 18/1',
    'Томск':       'Смирнова 5и',
    'Красноярск':  'Караульная 47',
    'Оренбург':    'Загородное шоссе 13/7',
    'Кемерово':    'Тухачевского 64',
    'Новокузнецк': 'Байдаевское шоссе 22',
    'Сургут':      'Производственная 6',
  };

  function card(c) {
    const photo = c.image_url || '';
    const country = c.country || COUNTRY_BY_BRAND[c.brand] || '';
    const brand = c.brand || '';
    // строка 2 = модель + поколение (если в title есть генерация после модели)
    let modelLine = c.model || '';
    if (c.title && brand && modelLine) {
      const prefix = (brand + ' ' + modelLine).toLowerCase();
      if (c.title.toLowerCase().startsWith(prefix)) {
        const tail = c.title.slice(prefix.length).trim();
        if (tail) modelLine = modelLine + ' ' + tail;
      }
    }
    if (!brand && !modelLine) modelLine = c.title || '';
    const addr = ADDRESS_BY_CITY[c.city] || '';
    const addrLine = [c.city, addr].filter(Boolean).join(', ');

    // "бензин, 1.6 МТ (80 л.с.)" → fuel="Бензин" + engine="1.6 МТ (80 л.с.)"
    const engRaw = c.engine || '';
    let fuel = '', engine = engRaw;
    const i = engRaw.indexOf(', ');
    if (i > 0) {
      fuel = engRaw.slice(0, i).trim();
      engine = engRaw.slice(i + 2).trim();
      if (fuel) fuel = fuel.charAt(0).toUpperCase() + fuel.slice(1);
    }

    // Карточка НЕ кликабельна целиком. Кликабельно только фото.
    const el = document.createElement('article');
    el.className = 'card';
    el.innerHTML =
      // Шапка на всю ширину
      '<div class="card__head">' +
        '<div class="card__head-left">' +
          (brand && LOGO_URLS[brand] ? '<img class="card__brand-logo" src="' + LOGO_URLS[brand] + '" alt="' + esc(brand) + '" loading="lazy" onerror="this.style.display=\'none\'">' : '') +
          '<div class="card__head-names">' +
            (brand ?     '<h3 class="card__title">' + esc(brand) + '</h3>' : '') +
            (modelLine ? '<div class="card__subtitle">' + esc(modelLine) + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="card__head-right">' +
          '<div class="card__price">' + fmtPrice(c.price) + '</div>' +
          (c.city ? '<div class="card__addr" title="' + esc(addrLine) + '">' + STRIP_SVG.pin + esc(c.city) + '</div>' : '') +
        '</div>' +
      '</div>' +
      // Фото слева, плитки справа — на уровне метрик
      '<a class="card__media" href="' + esc(c.url || '#') + '" target="_blank" rel="noopener">' +
        (photo ? '<img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="' + esc(photo) + '" alt="' + esc(brand + ' ' + modelLine) + '" onerror="if(!this.dataset.r){this.dataset.r=1;this.src=this.src;}else{this.parentElement.classList.add(\'card__media--noimg\');this.remove();}">' : '<div class="card__media-placeholder">📷</div>') +
      '</a>' +
      '<div class="tiles">' +
          tile('year',    'Год',           c.year) +
          tile('miles',   'Пробег',        fmtMileage(c.mileage)) +
          tile('engine',  'Двигатель',     engine) +
          tile('fuel',    'Тип двигателя', fuel) +
          tile('gearbox', 'Коробка',       c.transmission) +
          tile('drive',   'Привод',        c.drive) +
          tile('body',    'Кузов',         c.body) +
          tile('seats',   'Мест',          c.seats) +
          tile('color',   'Цвет',          c.color) +
          tile('wheel',   'Руль',          c.wheel) +
          tile('pts',     'ПТС',           c.pts) +
          tile('owner',   'Владельцы',     c.owners) +
          tile('state',   'Состояние',     c.condition) +
          tile('flag',    'Страна',        country) +
      '</div>' +
      // Нижняя плашка-стрип: трастовые бейджи (адрес теперь в шапке под ценой)
      '<div class="card__strip">' +
        '<span class="strip-item">' + STRIP_SVG.shield + 'Проверено</span>' +
        '<span class="strip-sep"></span>' +
        '<span class="strip-item">' + STRIP_SVG.wrench + 'Гарантия</span>' +
        '<span class="strip-sep"></span>' +
        '<span class="strip-item">' + STRIP_SVG.doc + 'Юридическая чистота</span>' +
      '</div>';
    return el;
  }

  // ============ УТИЛИТЫ ============
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function fmtPrice(p) { const n = num(p); return n ? n.toLocaleString('ru-RU') + ' ₽' : '—'; }
  function fmtMileage(m) { const n = num(m); return n ? n.toLocaleString('ru-RU') + ' км' : '—'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

  // ============ СОБЫТИЯ ============
  els.q.addEventListener('input', apply);
  // Фильтры применяются мгновенно по change/input (как было в оригинале)
  SELECT_FILTERS.concat('sort').forEach(k => els[k] && els[k].addEventListener('change', apply));
  NUMBER_FILTERS.forEach(k => els[k] && els[k].addEventListener('input', apply));
  // Cascading: смена марки → пересобираем список моделей под её модели
  if (els.brand && els.model) {
    els.brand.addEventListener('change', () => { repopulateModels(); apply(); });
  }
  els.reset.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    els.q.value = '';
    SELECT_FILTERS.forEach(k => { els[k].value = ''; });
    NUMBER_FILTERS.forEach(k => { els[k].value = ''; });
    els.sort.value = 'price_asc';
    updateFiltersBadge();
    apply();
    updateFiltersBadge();
  });
  els.loadMore.addEventListener('click', render);

  // ============ ПОПАП ФИЛЬТРОВ ============
  els.openFilters.addEventListener('click', (e) => {
    e.stopPropagation();
    els.filtersPopup.hidden = !els.filtersPopup.hidden;
  });
  document.addEventListener('click', (e) => {
    if (els.filtersPopup.hidden) return;
    if (e.target === els.openFilters || els.openFilters.contains(e.target)) return;
    if (els.filtersPopup.contains(e.target)) return;
    els.filtersPopup.hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') els.filtersPopup.hidden = true;
  });
  window.autoruCatalogReload = () => { try { window._autoruCatInited = false; window.autoruCatalogInit(); } catch(e){} };
  // Экспонируем рендер карточки + список авто для использования в чате (тот же дизайн).
  window.autoruRenderCard = card;
  window.autoruGetCars    = () => cars;
};
