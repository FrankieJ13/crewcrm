if ('serviceWorker' in navigator && ['http:', 'https:'].includes(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('service worker registration failed', err);
    });
  });
}

// Переносим оверлеи из #app в <body>, иначе #app (z:10) кэпит их z-index
// в корневом stacking context — они проигрывают mop-overlay (sibling #app в body).
document.addEventListener('DOMContentLoaded', () => {
  ['plan-editor-overlay', 'about-overlay', 'profile-modal-overlay'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.parentElement && el.parentElement.id !== 'document-body-root') {
      document.body.appendChild(el);
    }
  });
  // Прогреваем кеш иконок ВСЕХ тем — чтобы при переключении не было flash/broken
  _preloadThemeIcons();
  // Аккордеон в Конфигураторе режимов: открытие одного схлопа
  // автоматически закрывает остальные открытые в той же группе.
  _initCfgAccordion();
});

function _initCfgAccordion() {
  const group = document.querySelectorAll('.cfg-modes-body > details.cfg-spoiler-inner');
  if (!group.length) return;
  group.forEach(det => {
    det.addEventListener('toggle', () => {
      if (det.open) {
        group.forEach(other => {
          if (other !== det && other.open) other.open = false;
        });
      }
    });
  });
}

function _preloadThemeIcons() {
  const list = [
    // Fluent
    'Fluent/FluentColor-About.svg','Fluent/FluentColor-Alert.svg','Fluent/FluentColor-Analysis.svg',
    'Fluent/FluentColor-Archive.svg','Fluent/FluentColor-Cash.svg','Fluent/FluentColor-Close.svg',
    'Fluent/FluentColor-Exit.svg','Fluent/FluentColor-FAQ.svg','Fluent/FluentColor-Grafik.svg',
    'Fluent/FluentColor-Home.svg','Fluent/FluentColor-KPI.svg','Fluent/FluentColor-Menu.svg',
    'Fluent/FluentColor-Online.svg','Fluent/FluentColor-profile.svg','Fluent/FluentColor-Rang.svg',
    'Fluent/FluentColor-Refresh.svg','Fluent/FluentColor-Report.svg','Fluent/FluentColor-Settings.svg',
    'Fluent/FluentColor-Themes.svg','Fluent/FluentColor-Trophies.svg','Fluent/FluentColor-Vizity.svg',
    // Cosmic
    'cosmic/cosmic-alert.svg','cosmic/cosmic-profile.svg','cosmic/cosmic-trophies.svg',
    'cosmic/cosmic_about.svg','cosmic/cosmic_base.svg','cosmic/cosmic_config.svg',
    'cosmic/cosmic_exit.svg','cosmic/cosmic_faq.svg','cosmic/cosmic_grafik.svg',
    'cosmic/cosmic_home.svg','cosmic/cosmic_kpi.svg','cosmic/cosmic_menu.svg',
    'cosmic/cosmic_money.svg','cosmic/cosmic_online.svg','cosmic/cosmic_rang.svg',
    'cosmic/cosmic_refresh.svg','cosmic/cosmic_themes.svg','cosmic/cosmic_vizity.svg',
    // Default
    'default/about.svg','default/base.svg','default/config.svg','default/exit.svg',
    'default/faq.svg','default/grafik.svg','default/home.svg','default/kpi.svg',
    'default/menu.svg','default/money.svg','default/online.svg','default/profile.svg',
    'default/rang.svg','default/refresh.svg','default/send-noti.svg','default/theme.svg',
    'default/trophies.svg','default/vizity.svg',
  ];
  // requestIdleCallback на десктопе / fallback на мобильных
  const ric = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
  ric(() => {
    list.forEach(p => {
      const img = new Image();
      img.decoding = 'async';
      img.src = 'logos/' + p;
    });
  });
}

/* ══ CONFIG ══ */
const CFG = {
  CLIENT_ID: '364532815329-0j1lkobb1v9vcserj6artf64nd95a0la.apps.googleusercontent.com',
  SHEET_ID:  '1DeUsHB_O1SbIMR4p5yd64o_R0yllWvtnyNhjxjhipn8',
  FIREBASE: {
    apiKey: 'AIzaSyAmXoyZdIuxmbWyFHTKfdYRbYLcKxgVbWE',
    authDomain: 'crm-crew.firebaseapp.com',
    databaseURL: 'https://crm-crew-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'crm-crew',
    appId: '1:1062620277496:web:c59852f529351fbc1b290d',
  },
};
const ASSET_BASE = new URL('./logos/', document.baseURI).href;
const DEFAULT_ICON_BASE = ASSET_BASE + 'default/';
const COSMIC_ICON_BASE = ASSET_BASE + 'cosmic/';
const FLUENT_ICON_BASE = ASSET_BASE + 'Fluent/';

function requestPortraitOrientation() {
  if (!screen.orientation?.lock) return;
  const isMobile = matchMedia('(max-width: 900px)').matches;
  if (!isMobile) return;
  screen.orientation.lock('portrait').catch(() => {});
}
window.addEventListener('load', requestPortraitOrientation);

/* ══ MONTH STATE ══ */
let currentSuffix = (() => {
  const now = new Date();
  return String(now.getMonth()+1).padStart(2,'0') + String(now.getFullYear()).slice(-2);
})();

function getMonthName(suffix) {
  const mm = parseInt(suffix.slice(0,2));
  const yy = 2000 + parseInt(suffix.slice(2,4));
  return new Date(yy, mm-1, 1).toLocaleString('ru', { month:'long', year:'numeric' });
}

function getSheetNames(suffix) {
  return {
    otchet:      'ОТЧЁТ'   + suffix,
    dohod:       'ЗП'      + suffix,   // больше не используется, но оставим для совместимости
    d_otchet:    'Д_ОТЧЁТ' + suffix,
    d_dohod:     'Д_ЗП'    + suffix,
    grafik:      'ГРАФИКИ' + suffix,
    cnvrs:       'CNVRS'   + suffix,
    stavki:      'СТАВКИ'  + suffix,
    d_stavki:    'Д_СТАВКИ'+ suffix,
    instruktsii: 'ИНСТРУКЦИИ',
    vizity:      'ВИЗИТЫ'   + suffix,
    plan:        'ПЛАН'     + suffix,
    d_vizity:    'Д_ВИЗИТЫ' + suffix,
    trophyAwards:'TrophyAwards',
    vacationCalendar: 'Календарь 2026',
    vacationsList: 'Отпуска 2026',
    vacationManagers: 'Менеджеры Отпусков 2026',
  };
}

let SHEETS = getSheetNames(currentSuffix);

function updateBadge() {
  const el = document.getElementById('badge-month');
  if (el) {
    el.textContent = currentSuffix.slice(0, 2);
    const now = new Date();
    const curMm = String(now.getMonth() + 1).padStart(2, '0');
    const curYy = now.getFullYear().toString().slice(-2);
    el.classList.toggle('current-month', currentSuffix === curMm + curYy);
  }
  // Обновляем лейбл в гамбургере
  const lbl = document.getElementById('hmb-month-label');
  if (lbl) lbl.textContent = getMonthName(currentSuffix);
}

function toggleHmbMonth(e) {
  e.stopPropagation();
  const sub = document.getElementById('hmb-month-sub');
  const trigger = document.getElementById('hmb-month-trigger');
  if (!sub) return;
  const isOpen = sub.style.display === 'flex';
  if (isOpen) {
    sub.style.display = 'none';
    if (trigger) trigger.classList.remove('expanded');
    return;
  }
  // Закрываем тему если открыта
  const tSub = document.getElementById('hmb-theme-sub');
  const tTrig = document.querySelector('.hmb-theme-trigger');
  if (tSub && tSub.classList.contains('open')) {
    tSub.classList.remove('open');
    if (tTrig) tTrig.classList.remove('expanded');
  }
  // Строим список месяцев. Если до конца текущего месяца ≤5 дней (включая
  // сегодня) — добавляем БУДУЩИЙ месяц в начало списка (но дефолтно активен
  // всегда текущий — currentSuffix инициализирован под сегодня).
  sub.innerHTML = '';
  const months = [];
  const today = new Date();
  const daysInCur = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysLeftIncl = daysInCur - today.getDate() + 1;
  if (daysLeftIncl <= 5) {
    months.push(new Date(today.getFullYear(), today.getMonth() + 1, 1));
  }
  for (let i = 0; i < 6; i++) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    months.push(d);
  }
  months.forEach(d => {
    const yy = d.getFullYear().toString().slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const suffix = mm + yy;
    const btn = document.createElement('button');
    btn.className = 'hmb-item hmb-sub-item';
    const isActive = suffix === currentSuffix;
    btn.innerHTML = `<span style="font-family:'Unbounded',sans-serif;font-size:11px;font-weight:800;min-width:20px;${isActive?'color:var(--acc)':''}">${mm}</span><span style="${isActive?'color:var(--acc)':''}">${getMonthName(suffix)}</span>${isActive?'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>':''}`;
    btn.onclick = () => { setCurrentMonth(suffix); closeHamburger(); };
    sub.appendChild(btn);
  });
  sub.style.display = 'flex';
  sub.style.flexDirection = 'column';
  if (trigger) trigger.classList.add('expanded');
}
updateBadge();

/* ══ STATE ══ */
const S = {
  token:null,
  user:null,
  usersData:null,
  data:{ otchet:null, dohod:null, grafik:null, grafikFmt:null, instruktsii:null, d_otchet:null, d_dohod:null, cnvrs:null, stavki:null, d_stavki:null, vizity:null, plan:null, d_vizity:null, vizityFmt:null, d_vizityFmt:null },
  reportTab: 'dept',
  dohodTab: 'crm',
  faqTab: 'instr',
  ratingDept: null,
  ceoLeadersDept: 'crm',
  silentRefresh: false,
  authReady: false,
  sverkaMode: false,
  trophies: null,         // справочник из /data/trophies.json
  trophyAwards: null,     // факты выдачи из листа TrophyAwards
  trophiesView: 'self',   // 'self' или имя менеджера (для CEO/ROP)
};

/* ══ THEME ══ */
const THEMES = ['fluent', 'cosmic', 'dark', 'light', 'tiffany', 'cinematic', 'neo-dark', 'neo-light'];

function applyTheme(theme) {
  document.body.classList.remove('light', 'tiffany', 'cinematic', 'neo-dark', 'neo-light', 'cosmic', 'fluent');
  if (theme === 'light')      document.body.classList.add('light');
  if (theme === 'tiffany')    document.body.classList.add('tiffany');
  if (theme === 'cinematic')  document.body.classList.add('cinematic');
  if (theme === 'neo-dark')   document.body.classList.add('neo-dark');
  if (theme === 'neo-light')  document.body.classList.add('neo-light');
  if (theme === 'cosmic')     document.body.classList.add('cosmic');
  if (theme === 'fluent')     document.body.classList.add('fluent');
  localStorage.setItem('crm_theme', theme);
  // Обновляем активный пункт в дропдауне
  THEMES.forEach(t => {
    const btn = document.getElementById('td-' + t);
    if (btn) btn.classList.toggle('active', t === theme);
  });
  // Обновляем иконки логотипа (тема-зависимые)
  syncTheme();
  // Закрываем дропдаун
  const dd = document.getElementById('theme-dropdown');
  if (dd) dd.style.display = 'none';
}

function selectTheme(theme) {
  applyTheme(theme);
  closeHamburger();
  setTimeout(() => location.reload(), 120);
}

function toggleThemeDropdown(e) {
  e.stopPropagation();
  const dd = document.getElementById('theme-dropdown');
  if (!dd) return;
  const open = dd.style.display === 'flex';
  // Закрываем все другие дропдауны
  document.querySelectorAll('.month-dropdown, .theme-dropdown').forEach(el => el.style.display = 'none');
  if (!open) dd.style.display = 'flex';
}

function syncTheme() {
  const b = document.body.classList;
  const isLight = b.contains('light') || b.contains('tiffany') || b.contains('neo-light') || b.contains('fluent');
  const isCosmic = b.contains('cosmic');
  const isFluent = b.contains('fluent');
  const logoD = document.getElementById('logo-dark');
  const logoL = document.getElementById('logo-light');
  if (logoD) logoD.style.display = isLight ? 'none' : '';
  if (logoL) logoL.style.display = isLight ? '' : 'none';

  // Cosmic: подменяем иконки в доке и гамбургере
  const COSMIC_ICONS = {
    'dock-btn-home':        COSMIC_ICON_BASE + 'cosmic_home.svg',
    'dock-btn-kpi':         COSMIC_ICON_BASE + 'cosmic_kpi.svg',
    'dock-btn-rating':      COSMIC_ICON_BASE + 'cosmic_rang.svg',
    'dock-btn-dohod':       COSMIC_ICON_BASE + 'cosmic_money.svg',
    'dock-btn-grafik':      COSMIC_ICON_BASE + 'cosmic_grafik.svg',
    'dock-btn-instruktsii': COSMIC_ICON_BASE + 'cosmic_faq.svg',
    'dock-btn-vizity':      COSMIC_ICON_BASE + 'cosmic_vizity.svg',
    'btn-presence':         COSMIC_ICON_BASE + 'cosmic_online.svg',
    'btn-notify':           COSMIC_ICON_BASE + 'cosmic-send-noti.svg',
    'btn-rem':              COSMIC_ICON_BASE + 'cosmic-alert.svg',
    'btn-refresh':          COSMIC_ICON_BASE + 'cosmic_refresh.svg',
    'btn-hamburger':        COSMIC_ICON_BASE + 'cosmic_menu.svg',
    // Гамбургер
    'hmb-month-trigger':    COSMIC_ICON_BASE + 'cosmic_base.svg',
    'hmb-plan-edit':        COSMIC_ICON_BASE + 'cosmic_config.svg',
    'hmb-trophies':         COSMIC_ICON_BASE + 'cosmic-trophies.svg',
    'hmb-repeats':          COSMIC_ICON_BASE + 'cosmic_find_duble.svg',
    'hmb-logout':           COSMIC_ICON_BASE + 'cosmic_exit.svg',
    'hmb-about-btn':        COSMIC_ICON_BASE + 'cosmic_about.svg',
  };
  const DEFAULT_ICONS = {
    'dock-btn-home':        DEFAULT_ICON_BASE + 'home.svg',
    'dock-btn-kpi':         DEFAULT_ICON_BASE + 'kpi.svg',
    'dock-btn-rating':      DEFAULT_ICON_BASE + 'rang.svg',
    'dock-btn-dohod':       DEFAULT_ICON_BASE + 'money.svg',
    'dock-btn-grafik':      DEFAULT_ICON_BASE + 'grafik.svg',
    'dock-btn-instruktsii': DEFAULT_ICON_BASE + 'faq.svg',
    'dock-btn-vizity':      DEFAULT_ICON_BASE + 'vizity.svg',
    'btn-presence':         DEFAULT_ICON_BASE + 'online.svg',
    'btn-notify':           DEFAULT_ICON_BASE + 'send-noti.svg',
    'btn-refresh':          DEFAULT_ICON_BASE + 'refresh.svg',
    'btn-hamburger':        DEFAULT_ICON_BASE + 'menu.svg',
    'hmb-month-trigger':    DEFAULT_ICON_BASE + 'base.svg',
    'hmb-plan-edit':        DEFAULT_ICON_BASE + 'config.svg',
    'hmb-trophies':         DEFAULT_ICON_BASE + 'trophies.svg',
    'hmb-repeats':          DEFAULT_ICON_BASE + 'find-duble.svg',
    'hmb-logout':           DEFAULT_ICON_BASE + 'exit.svg',
    'hmb-about-btn':        DEFAULT_ICON_BASE + 'about.svg',
  };
  // Гамбургер — тема-триггер отдельно (нет стабильного ID)
  const themeTrigger = document.querySelector('.hmb-theme-trigger');

  function setAppIcon(el, src, kind) {
    if (!el) return;
    let icon = el.querySelector('.app-icon');
    if (!icon || (kind === 'default' && icon.tagName !== 'SPAN') || (kind !== 'default' && icon.tagName !== 'IMG')) {
      if (icon) icon.remove();
      icon = document.createElement(kind === 'default' ? 'span' : 'img');
      el.prepend(icon);
    }
    icon.className = `app-icon ${kind}-icon`;
    if (kind === 'default') {
      icon.style.setProperty('--app-icon-url', `url("${src}")`);
      icon.removeAttribute('src');
    } else {
      // Прячем картинку пока она не загрузилась — никаких broken-image заглушек
      icon.style.opacity = '0';
      icon.onload  = () => { icon.style.opacity = ''; icon.dataset.loaded = '1'; };
      icon.onerror = () => {
        // Одна попытка retry с cache-bust. Если опять упало — оставляем прозрачный
        if (icon.dataset.retry !== '1') {
          icon.dataset.retry = '1';
          setTimeout(() => { icon.src = src + (src.includes('?') ? '&' : '?') + '_=' + Date.now(); }, 500);
        }
      };
      icon.alt = '';
      icon.src = src;
    }
    icon.style.display = '';
    el.querySelectorAll('svg').forEach(s => s.style.display = 'none');
  }

  const FLUENT_ICONS = {
    'dock-btn-home':        FLUENT_ICON_BASE + 'FluentColor-Home.svg',
    'dock-btn-kpi':         FLUENT_ICON_BASE + 'FluentColor-KPI.svg',
    'dock-btn-rating':      FLUENT_ICON_BASE + 'FluentColor-Rang.svg',
    'dock-btn-dohod':       FLUENT_ICON_BASE + 'FluentColor-Cash.svg',
    'dock-btn-grafik':      FLUENT_ICON_BASE + 'FluentColor-Grafik.svg',
    'dock-btn-instruktsii': FLUENT_ICON_BASE + 'FluentColor-FAQ.svg',
    'dock-btn-vizity':      FLUENT_ICON_BASE + 'FluentColor-Vizity.svg',
    'btn-presence':         FLUENT_ICON_BASE + 'FluentColor-Online.svg',
    'btn-notify':           FLUENT_ICON_BASE + 'FluentColor-Alert.svg',
    'btn-rem':              FLUENT_ICON_BASE + 'FluentColor-Alert.svg',
    'btn-refresh':          FLUENT_ICON_BASE + 'FluentColor-Refresh.svg',
    'btn-hamburger':        FLUENT_ICON_BASE + 'FluentColor-Menu.svg',
    'hmb-month-trigger':    FLUENT_ICON_BASE + 'FluentColor-Archive.svg',
    'hmb-plan-edit':        FLUENT_ICON_BASE + 'FluentColor-Settings.svg',
    'hmb-export':           FLUENT_ICON_BASE + 'FluentColor-Report.svg',
    'hmb-analiz':           FLUENT_ICON_BASE + 'FluentColor-Analysis.svg',
    'hmb-trophies':         FLUENT_ICON_BASE + 'FluentColor-Trophies.svg',
    'hmb-repeats':          FLUENT_ICON_BASE + 'FluentColor-FindDuble.svg',
    'hmb-logout':           FLUENT_ICON_BASE + 'FluentColor-Exit.svg',
    'hmb-about-btn':        FLUENT_ICON_BASE + 'FluentColor-About.svg',
  };

  if (isCosmic) {
    Object.entries(COSMIC_ICONS).forEach(([id, src]) => setAppIcon(document.getElementById(id), src, 'cosmic'));
    if (themeTrigger) setAppIcon(themeTrigger, COSMIC_ICON_BASE + 'cosmic_themes.svg', 'cosmic');
    // Аккаунт
    const acc = document.getElementById('hmb-account-btn');
    if (acc) { const img = acc.querySelector('img:not(.app-icon)'); if(img) img.style.opacity='.7'; }
  } else if (isFluent) {
    Object.entries(FLUENT_ICONS).forEach(([id, src]) => setAppIcon(document.getElementById(id), src, 'fluent'));
    if (themeTrigger) setAppIcon(themeTrigger, FLUENT_ICON_BASE + 'FluentColor-Themes.svg', 'fluent');
  } else {
    Object.entries(DEFAULT_ICONS).forEach(([id, src]) => setAppIcon(document.getElementById(id), src, 'default'));
    if (themeTrigger) setAppIcon(themeTrigger, DEFAULT_ICON_BASE + 'theme.svg', 'default');
  }

  // Lock icon on auth screen
  const lockDefault = document.getElementById('gate-lock-default');
  const lockCosmic  = document.getElementById('gate-lock-cosmic');
  const lockFluent  = document.getElementById('gate-lock-fluent');
  if (lockCosmic) lockCosmic.onerror = null;
  if (lockFluent) lockFluent.onerror = null;
  if (lockDefault) lockDefault.style.display = (isCosmic || isFluent) ? 'none' : '';
  if (lockCosmic)  lockCosmic.style.display  = isCosmic ? '' : 'none';
  if (lockFluent)  lockFluent.style.display  = isFluent ? '' : 'none';

  THEMES.forEach(t => {
    const btn = document.getElementById('htd-' + t);
    const isDarkDefault = t === 'dark' && !THEMES.some(name => name !== 'dark' && b.contains(name));
    const active = b.contains(t) || isDarkDefault;
    if (btn) {
      btn.style.fontWeight = active ? '900' : '';
      btn.classList.toggle('theme-active', active);
    }
  });
}

// Инициализация при загрузке
(function() {
  const saved = localStorage.getItem('crm_theme') || 'fluent';
  applyTheme(saved);
})();

let _tt;
function toast(msg, type='i') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = type + ' on';
  clearTimeout(_tt); _tt = setTimeout(() => el.className='', 2600);
}

// ==================== АНАЛИТИК ИИ ====================
const AZ_CITIES = ['Барнаул','Кемерово','Красноярск','Новокузнецк','Новосибирск','Омск','Оренбург','Пермь','Сургут','Томск','Тюмень','Челябинск'];
const AZ_DEFAULT_CURR = {
  'Барнаул':{budget:1905835,leads:500,badLeads:26,visits:100,deals:20,cash:0,buyout:0,creditIncome:925840},
  'Кемерово':{budget:655583,leads:240,badLeads:22,visits:38,deals:8,cash:0,buyout:0,creditIncome:655584},
  'Красноярск':{budget:1273852,leads:210,badLeads:18,visits:45,deals:1,cash:0,buyout:0,creditIncome:28308},
  'Новокузнецк':{budget:830722,leads:250,badLeads:23,visits:67,deals:10,cash:0,buyout:0,creditIncome:550720},
  'Новосибирск':{budget:975731,leads:300,badLeads:22,visits:43,deals:4,cash:0,buyout:0,creditIncome:835732},
  'Омск':{budget:1870970,leads:460,badLeads:28,visits:122,deals:18,cash:0,buyout:0,creditIncome:1170970},
  'Оренбург':{budget:574111,leads:360,badLeads:24,visits:60,deals:9,cash:0,buyout:0,creditIncome:294111},
  'Пермь':{budget:1255038,leads:300,badLeads:25,visits:45,deals:17,cash:0,buyout:0,creditIncome:1115030},
  'Сургут':{budget:612460,leads:270,badLeads:24,visits:41,deals:3,cash:0,buyout:0,creditIncome:332460},
  'Томск':{budget:732725,leads:240,badLeads:23,visits:66,deals:14,cash:0,buyout:0,creditIncome:32732},
  'Тюмень':{budget:800000,leads:280,badLeads:22,visits:50,deals:10,cash:0,buyout:0,creditIncome:500000},
  'Челябинск':{budget:900000,leads:300,badLeads:25,visits:55,deals:12,cash:0,buyout:0,creditIncome:600000},
};
const AZ_FIELD_RANGES = {
  budget:{min:0,max:5000000,step:10000,unit:'₽',lbl:'Бюджет на рекламу'},
  leads:{min:0,max:1500,step:1,unit:'шт',lbl:'Заявок в AmoCRM'},
  badLeads:{min:0,max:500,step:1,unit:'шт',lbl:'Нецелевых заявок'},
  visits:{min:0,max:300,step:1,unit:'шт',lbl:'Визитов в салон'},
  deals:{min:0,max:100,step:1,unit:'шт',lbl:'Сделок в кредит'},
  cash:{min:0,max:10000000,step:50000,unit:'₽',lbl:'Наличка + Обмен'},
  buyout:{min:0,max:5000000,step:10000,unit:'₽',lbl:'Выкуп + Комиссия'},
  creditIncome:{min:0,max:5000000,step:10000,unit:'₽',lbl:'Доход с кредита'},
};
const AZ_STORAGE = 'az_analytics_data';
let azState = { period:'curr', mode:'fact', view:'all', activeCity:'Барнаул', importType:'csv' };
let azData = null;

function azEmpty(){return {budget:0,leads:0,badLeads:0,visits:0,deals:0,cash:0,buyout:0,creditIncome:0};}
function azLoad() {
  try {
    const s = localStorage.getItem(AZ_STORAGE);
    if (s) return JSON.parse(s);
  } catch(e) {}
  return {
    curr: {...AZ_DEFAULT_CURR},
    prev: Object.fromEntries(AZ_CITIES.map(c=>[c,azEmpty()])),
    plan: Object.fromEntries(AZ_CITIES.map(c=>[c,azEmpty()])),
  };
}
function azSave() { localStorage.setItem(AZ_STORAGE, JSON.stringify(azData)); }
function azEnsure(p) {
  if (!azData[p]) azData[p] = Object.fromEntries(AZ_CITIES.map(c=>[c,azEmpty()]));
  AZ_CITIES.forEach(c=>{if(!azData[p][c]) azData[p][c]=azEmpty();});
}
function azCompute(c) {
  const quals = Math.max(0, c.leads - c.badLeads);
  const gross = (c.cash||0)+(c.buyout||0)+(c.creditIncome||0);
  return {
    ...c, quals,
    pctBad: c.leads ? c.badLeads/c.leads*100 : 0,
    costLead: c.leads ? c.budget/c.leads : 0,
    costQual: quals ? c.budget/quals : 0,
    costVisit: c.visits ? c.budget/c.visits : 0,
    costDeal: c.deals ? c.budget/c.deals : 0,
    convLS: c.leads ? c.deals/c.leads*100 : 0,
    convQS: quals ? c.deals/quals*100 : 0,
    convVS: c.visits ? c.deals/c.visits*100 : 0,
    convQV: quals ? c.visits/quals*100 : 0,
    avgCreditIncome: c.deals ? c.creditIncome/c.deals : 0,
    gross,
    profit: c.creditIncome - c.budget,
    roi: c.budget ? (c.creditIncome - c.budget)/c.budget*100 : 0,
  };
}
function azAggregate(period) {
  const all = AZ_CITIES.map(c => azData[period][c]);
  const sum = k => all.reduce((a,b)=>a+(b[k]||0),0);
  return azCompute({budget:sum('budget'),leads:sum('leads'),badLeads:sum('badLeads'),visits:sum('visits'),deals:sum('deals'),cash:sum('cash'),buyout:sum('buyout'),creditIncome:sum('creditIncome')});
}
function azFmtRub(n) {
  if (!isFinite(n) || n===0) return '—';
  const sign = n<0?'-':''; n = Math.abs(Math.round(n));
  if (n>=1e9) return sign+(n/1e9).toFixed(2)+' млрд';
  if (n>=1e6) return sign+(n/1e6).toFixed(2)+' млн';
  if (n>=1e3) return sign+(n/1e3).toFixed(0)+' тыс';
  return sign+n;
}
function azFmtRub2(n){return azFmtRub(n)+' ₽';}
function azFmtPct(n){if(!isFinite(n))return '—';return (Math.round(n*10)/10)+'%';}
function azFmtInt(n){if(!isFinite(n))return '—';return Math.round(n).toLocaleString('ru-RU');}

function openAnaliz() {
  const matched = findUserInSheet();
  if (!matched || !isCeoLike(matched.role)) return;
  azData = azLoad();
  ['curr','prev','plan'].forEach(azEnsure);
  showScr('analiz');
  dockSetActive('home');
  renderAnaliz();
}

function renderAnaliz() {
  const el = document.getElementById('c-analiz');
  if (!el) return;
  el.innerHTML = `
    <div class="az-top">
      <div class="az-eyebrow">// Аналитика воронки и финмодели</div>
      <div class="az-title">Аналитик ИИ <span class="beta">(бета)</span></div>
      <div class="az-sub">Введи фактические данные маркетинга и продаж. Система посчитает конверсии, цены, прибыль и выдаст инсайты.</div>
    </div>
    <div class="az-controls">
      <div>
        <div class="az-seg-lbl">Период</div>
        <div class="az-seg" id="az-period-seg">
          <button class="az-seg-btn ${azState.period==='prev'?'on':''}" data-period="prev">Прошлый</button>
          <button class="az-seg-btn ${azState.period==='curr'?'on':''}" data-period="curr">Текущий</button>
          <button class="az-seg-btn ${azState.period==='plan'?'on':''}" data-period="plan">План</button>
        </div>
      </div>
      <div>
        <div class="az-seg-lbl">Данные</div>
        <div class="az-seg" id="az-view-seg">
          <button class="az-seg-btn ${azState.view==='all'?'on':''}" data-view="all">Все города</button>
          <button class="az-seg-btn ${azState.view==='single'?'on':''}" data-view="single">Один город</button>
          <button class="az-seg-btn ${azState.view==='import'?'on':''}" data-view="import">Импорт</button>
        </div>
      </div>
      <div id="az-single-wrap" style="display:${azState.view==='single'?'block':'none'}">
        <div class="az-seg-lbl">Выбор города</div>
        <select id="az-single-select" class="az-select"></select>
      </div>
    </div>
    <div class="az-kpi-grid">
      <div class="az-kpi-card"><div class="az-kpi-lbl">Валовая выручка</div><div class="az-kpi-val acc" id="az-kpi-gross">—</div><div class="az-kpi-sub" id="az-kpi-gross-sub">—</div></div>
      <div class="az-kpi-card"><div class="az-kpi-lbl">Прибыль с кредита</div><div class="az-kpi-val grn" id="az-kpi-profit">—</div><div class="az-kpi-sub">доход − бюджет</div></div>
      <div class="az-kpi-card"><div class="az-kpi-lbl">ROI</div><div class="az-kpi-val yel" id="az-kpi-roi">—</div><div class="az-kpi-sub" id="az-kpi-roi-sub">отдача</div></div>
      <div class="az-kpi-card"><div class="az-kpi-lbl">Цена продажи</div><div class="az-kpi-val pur" id="az-kpi-cac">—</div><div class="az-kpi-sub">CAC</div></div>
    </div>
    <div class="sec-title">Воронка</div>
    <div id="az-funnel"></div>
    <div class="sec-title">Инсайты</div>
    <div id="az-insights"></div>
    <div id="az-cities-wrap"><div class="sec-title">Города</div><div id="az-cities"></div></div>
    <div class="az-import" id="az-import">
      <div class="sec-title">Импорт данных</div>
      <div class="az-import-tabs">
        <div class="az-import-tab on" data-imp="csv">CSV</div>
        <div class="az-import-tab" data-imp="json">JSON</div>
        <div class="az-import-tab" data-imp="sheet">Google Sheet</div>
      </div>
      <div class="az-import-body" id="az-imp-csv">
        <textarea id="az-csv" placeholder="Город,Бюджет,Заявки,Нецелевые,Визиты,Сделки,Нал+Обмен,Выкуп+Комиссия,Доход кредит"></textarea>
        <div class="az-import-actions"><button class="az-btn" onclick="azImportCSV()">Применить</button><button class="az-btn ghost" onclick="document.getElementById('az-csv').value=''">Очистить</button></div>
        <div class="az-import-hint">Колонки: <code>Город, Бюджет, Заявки, Нецелевые, Визиты, Сделки, Нал+Обмен, Выкуп+Комиссия, Доход кредит</code></div>
        <div class="az-import-status" id="az-csv-st"></div>
      </div>
      <div class="az-import-body" id="az-imp-json" style="display:none">
        <textarea id="az-json" placeholder='[{"city":"Барнаул","budget":...,"leads":...,...}]'></textarea>
        <div class="az-import-actions"><button class="az-btn" onclick="azImportJSON()">Применить</button><button class="az-btn ghost" onclick="document.getElementById('az-json').value=''">Очистить</button></div>
        <div class="az-import-status" id="az-json-st"></div>
      </div>
      <div class="az-import-body" id="az-imp-sheet" style="display:none">
        <input type="text" id="az-sheet" placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=...">
        <div class="az-import-actions"><button class="az-btn" onclick="azImportSheet()">Загрузить</button><button class="az-btn ghost" onclick="document.getElementById('az-sheet').value=''">Очистить</button></div>
        <div class="az-import-hint">Лист должен быть с доступом «Anyone with the link».</div>
        <div class="az-import-status" id="az-sheet-st"></div>
      </div>
    </div>`;
  // Bind events
  el.querySelector('#az-period-seg').addEventListener('click', e => {
    const b = e.target.closest('.az-seg-btn'); if (!b) return;
    azState.period = b.dataset.period; renderAnaliz();
  });
  el.querySelector('#az-view-seg').addEventListener('click', e => {
    const b = e.target.closest('.az-seg-btn'); if (!b) return;
    azState.view = b.dataset.view; renderAnaliz();
  });
  el.querySelectorAll('.az-import-tab').forEach(t => t.addEventListener('click', () => {
    el.querySelectorAll('.az-import-tab').forEach(x=>x.classList.remove('on'));
    t.classList.add('on');
    ['csv','json','sheet'].forEach(k => document.getElementById('az-imp-'+k).style.display = k===t.dataset.imp?'':'none');
  }));
  azUpdateAggregates();
  if (azState.view === 'all') azRenderCities();
  else if (azState.view === 'single') azRenderSingle();
  document.getElementById('az-cities-wrap').style.display = azState.view==='import'?'none':'';
  document.getElementById('az-import').classList.toggle('on', azState.view==='import');
}

function azFunnelHTML(a) {
  return `
    <div class="az-funnel-row">
      <div><div class="az-funnel-lbl">Заявки в AmoCRM</div><span class="az-funnel-pct">из бюджета ${azFmtRub2(a.budget)}</span></div>
      <div class="az-funnel-cnt">${azFmtInt(a.leads)}</div>
      <div class="az-funnel-cost">${azFmtRub2(a.costLead)} / шт</div>
    </div>
    <div class="az-funnel-row q">
      <div><div class="az-funnel-lbl">Квал. заявки</div><span class="az-funnel-pct">нецелевых ${azFmtPct(a.pctBad)}</span></div>
      <div class="az-funnel-cnt">${azFmtInt(a.quals)}</div>
      <div class="az-funnel-cost">${azFmtRub2(a.costQual)} / шт</div>
    </div>
    <div class="az-funnel-row v">
      <div><div class="az-funnel-lbl">Визиты в салон</div><span class="az-funnel-pct">${azFmtPct(a.convQV)} из квала</span></div>
      <div class="az-funnel-cnt">${azFmtInt(a.visits)}</div>
      <div class="az-funnel-cost">${azFmtRub2(a.costVisit)} / визит</div>
    </div>
    <div class="az-funnel-row d">
      <div><div class="az-funnel-lbl">Сделки (кредит)</div><span class="az-funnel-pct">${azFmtPct(a.convVS)} из визита · ${azFmtPct(a.convQS)} из квала</span></div>
      <div class="az-funnel-cnt">${azFmtInt(a.deals)}</div>
      <div class="az-funnel-cost">${azFmtRub2(a.costDeal)} / шт</div>
    </div>`;
}
function azBuildInsights(agg) {
  const out = [];
  const cities = AZ_CITIES.map(n => ({name:n, ...azCompute(azData[azState.period][n])}));
  const active = cities.filter(c => c.budget>0 && c.visits>0);
  if (!active.length) { out.push({ico:'💡',cls:'',text:'Введите данные хотя бы по одному городу — будут авто-инсайты.'}); return out; }
  const sortedRoi = [...active].sort((a,b)=>b.roi-a.roi);
  if (sortedRoi.length) {
    const t=sortedRoi[0], b=sortedRoi[sortedRoi.length-1];
    out.push({ico:'🏆',cls:'good',text:`<b>${t.name}</b> — лучший ROI: <b>${azFmtPct(t.roi)}</b>. Бюджет ${azFmtRub2(t.budget)} → доход с кредита ${azFmtRub2(t.creditIncome)}.`});
    if (b.roi < 0 && b.name !== t.name) out.push({ico:'⚠️',cls:'bad',text:`<b>${b.name}</b> в убытке: ROI <b>${azFmtPct(b.roi)}</b>.`});
  }
  active.forEach(c => {
    if (c.costVisit > agg.costVisit*1.5 && c.visits>5) out.push({ico:'💸',cls:'warn',text:`<b>${c.name}</b>: визит обходится в <b>${azFmtRub2(c.costVisit)}</b> — это в ${(c.costVisit/agg.costVisit).toFixed(1)}× выше среднего (${azFmtRub2(agg.costVisit)}).`});
    if (c.convQV < agg.convQV*0.6 && c.quals>50) out.push({ico:'📉',cls:'warn',text:`<b>${c.name}</b>: квал→визит <b>${azFmtPct(c.convQV)}</b> при среднем ${azFmtPct(agg.convQV)}.`});
    if (c.visits>=30 && c.convVS < agg.convVS*0.5) out.push({ico:'📉',cls:'bad',text:`<b>${c.name}</b>: <b>${azFmtPct(c.convVS)}</b> закрытия с визита (среднее ${azFmtPct(agg.convVS)}).`});
  });
  const sortedAvg = [...active].filter(c=>c.deals>0).sort((a,b)=>b.avgCreditIncome-a.avgCreditIncome);
  if (sortedAvg[0]) out.push({ico:'💎',cls:'good',text:`Самый высокий средний доход: <b>${sortedAvg[0].name}</b> — <b>${azFmtRub2(sortedAvg[0].avgCreditIncome)}</b>.`});
  const sortedCAC = [...active].filter(c=>c.deals>0).sort((a,b)=>a.costDeal-b.costDeal);
  if (sortedCAC[0]) out.push({ico:'⚡',cls:'good',text:`Самая дешёвая продажа: <b>${sortedCAC[0].name}</b> — <b>${azFmtRub2(sortedCAC[0].costDeal)}</b>.`});
  const sortedBad = [...active].sort((a,b)=>b.pctBad-a.pctBad);
  if (sortedBad[0] && sortedBad[0].pctBad>25) out.push({ico:'🚫',cls:'warn',text:`<b>${sortedBad[0].name}</b>: <b>${azFmtPct(sortedBad[0].pctBad)}</b> нецелевых заявок.`});
  active.forEach(c => {
    if (c.deals===0 && c.visits>10) out.push({ico:'🔥',cls:'bad',text:`<b>${c.name}</b>: <b>${c.visits}</b> визитов, 0 сделок. Бюджет ${azFmtRub2(c.budget)} — слив.`});
  });
  return out;
}
function azUpdateAggregates() {
  const agg = azAggregate(azState.period);
  document.getElementById('az-kpi-gross').textContent = azFmtRub2(agg.gross);
  document.getElementById('az-kpi-gross-sub').textContent = `${azFmtInt(agg.deals)} продаж`;
  document.getElementById('az-kpi-profit').textContent = azFmtRub2(agg.profit);
  const roiEl = document.getElementById('az-kpi-roi');
  roiEl.textContent = azFmtPct(agg.roi);
  roiEl.className = 'az-kpi-val '+(agg.roi>=50?'grn':agg.roi>=0?'yel':'red');
  document.getElementById('az-kpi-roi-sub').textContent = agg.roi>=0?'положительный':'убыток';
  document.getElementById('az-kpi-cac').textContent = azFmtRub2(agg.costDeal);
  document.getElementById('az-funnel').innerHTML = azFunnelHTML(agg);
  const ins = azBuildInsights(agg);
  document.getElementById('az-insights').innerHTML = ins.map(i=>`<div class="az-insight ${i.cls}"><span class="az-insight-ico">${i.ico}</span><div>${i.text}</div></div>`).join('');
}
function azCityFieldsHTML(name) {
  const c = azData[azState.period][name];
  return `<div class="az-fields">${Object.keys(AZ_FIELD_RANGES).map(k => {
    const r = AZ_FIELD_RANGES[k]; const v = c[k]||0;
    const dynMax = Math.max(r.max, v*2 || r.max);
    return `<div class="az-field">
      <div class="az-field-head">
        <div class="az-field-lbl">${r.lbl}</div>
        <div class="az-field-val"><input type="number" inputmode="numeric" class="az-field-input" data-city="${name}" data-key="${k}" value="${v}"><span class="az-field-unit">${r.unit}</span></div>
      </div>
      <input type="range" class="az-field-slider" data-city="${name}" data-key="${k}" min="${r.min}" max="${dynMax}" step="${r.step}" value="${v}">
    </div>`;
  }).join('')}</div>`;
}
function azCityDerivedHTML(c) {
  return `<div class="az-derived">
    <div class="az-derived-row"><span class="l">Квал. заявок</span><span class="v">${azFmtInt(c.quals)} · ${azFmtRub2(c.costQual)}/шт</span></div>
    <div class="az-derived-row"><span class="l">Цена заявки</span><span class="v">${azFmtRub2(c.costLead)}</span></div>
    <div class="az-derived-row"><span class="l">% нецелевых</span><span class="v">${azFmtPct(c.pctBad)}</span></div>
    <div class="az-derived-row"><span class="l">% квал → визит</span><span class="v">${azFmtPct(c.convQV)}</span></div>
    <div class="az-derived-row"><span class="l">Цена визита</span><span class="v">${azFmtRub2(c.costVisit)}</span></div>
    <div class="az-derived-row"><span class="l">% визит → продажа</span><span class="v">${azFmtPct(c.convVS)}</span></div>
    <div class="az-derived-row"><span class="l">% квал → продажа</span><span class="v">${azFmtPct(c.convQS)}</span></div>
    <div class="az-derived-row"><span class="l">Цена продажи (CAC)</span><span class="v">${azFmtRub2(c.costDeal)}</span></div>
    <div class="az-derived-row"><span class="l">Средний доход</span><span class="v">${azFmtRub2(c.avgCreditIncome)}</span></div>
    <div class="az-derived-row"><span class="l">Прибыль с кредита</span><span class="v" style="color:${c.profit>=0?'var(--grn)':'var(--red)'}">${azFmtRub2(c.profit)}</span></div>
    <div class="az-derived-row"><span class="l">ROI</span><span class="v" style="color:${c.roi>=0?'var(--grn)':'var(--red)'}">${azFmtPct(c.roi)}</span></div>
  </div>`;
}
function azRenderCities() {
  const list = document.getElementById('az-cities');
  list.innerHTML = AZ_CITIES.map(name => {
    const c = azCompute(azData[azState.period][name]);
    const roiCls = c.roi>0?'up':c.roi<0?'dn':'nu';
    return `<div class="az-city" data-city="${name}">
      <div class="az-city-hdr" onclick="azToggleCity('${name}')">
        <span class="az-city-toggle">▸</span>
        <span class="az-city-name">${name}</span>
        <span class="az-city-budget">${azFmtRub2(c.budget)}</span>
        <span class="az-city-roi ${roiCls}">${azFmtPct(c.roi)}</span>
      </div>
      <div class="az-city-body">${azCityFieldsHTML(name)}${azCityDerivedHTML(c)}</div>
    </div>`;
  }).join('');
  azBindFields();
}
function azRenderSingle() {
  const sel = document.getElementById('az-single-select');
  sel.innerHTML = AZ_CITIES.map(c=>`<option value="${c}">${c}</option>`).join('');
  sel.value = azState.activeCity;
  sel.onchange = () => { azState.activeCity = sel.value; azRenderSingle(); };
  const name = azState.activeCity;
  const c = azCompute(azData[azState.period][name]);
  const roiCls = c.roi>0?'up':c.roi<0?'dn':'nu';
  document.getElementById('az-cities').innerHTML = `<div class="az-city expanded" data-city="${name}">
    <div class="az-city-hdr">
      <span class="az-city-toggle">▾</span>
      <span class="az-city-name">${name}</span>
      <span class="az-city-budget">${azFmtRub2(c.budget)}</span>
      <span class="az-city-roi ${roiCls}">${azFmtPct(c.roi)}</span>
    </div>
    <div class="az-city-body">${azCityFieldsHTML(name)}${azCityDerivedHTML(c)}</div>
  </div>`;
  azBindFields();
}
function azToggleCity(name) {
  if (azState.view !== 'all') return;
  const r = document.querySelector(`.az-city[data-city="${name}"]`);
  if (r) r.classList.toggle('expanded');
}
function azUpdateSliderFill(s) {
  if (!s) return;
  const mn=parseFloat(s.min)||0, mx=parseFloat(s.max)||1, v=parseFloat(s.value)||0;
  const p = mx>mn ? (v-mn)/(mx-mn)*100 : 0;
  s.style.setProperty('--p', Math.max(0,Math.min(100,p))+'%');
}
function azUpdateCityDerived(name) {
  const row = document.querySelector(`.az-city[data-city="${name}"]`);
  if (!row) return;
  const c = azCompute(azData[azState.period][name]);
  const dEl = row.querySelector('.az-derived');
  if (dEl) dEl.outerHTML = azCityDerivedHTML(c);
  const roiBadge = row.querySelector('.az-city-roi');
  if (roiBadge) { roiBadge.textContent = azFmtPct(c.roi); roiBadge.className = 'az-city-roi '+(c.roi>0?'up':c.roi<0?'dn':'nu'); }
  const budEl = row.querySelector('.az-city-budget');
  if (budEl) budEl.textContent = azFmtRub2(c.budget);
}
function azBindFields() {
  document.querySelectorAll('.az-field-slider').forEach(azUpdateSliderFill);
  document.querySelectorAll('.az-field-input, .az-field-slider').forEach(inp => {
    inp.addEventListener('input', e => {
      const c = e.target.dataset.city, k = e.target.dataset.key;
      const v = parseFloat(e.target.value)||0;
      azData[azState.period][c][k] = v;
      azSave();
      document.querySelectorAll(`[data-city="${c}"][data-key="${k}"]`).forEach(el => { if (el!==e.target) el.value = v; });
      const sl = e.target.classList.contains('az-field-slider') ? e.target : document.querySelector(`.az-field-slider[data-city="${c}"][data-key="${k}"]`);
      azUpdateSliderFill(sl);
      azUpdateCityDerived(c);
      azUpdateAggregates();
    });
  });
}
function azParseCSV(text) {
  const lines = text.trim().split('\n').filter(Boolean);
  if (!lines.length) return [];
  const first = lines[0].toLowerCase();
  const hasHeader = first.includes('город') || first.includes('city') || first.includes('бюджет');
  const rows = hasHeader ? lines.slice(1) : lines;
  return rows.map(row => {
    const parts = row.split(/[,;\t]/).map(s => s.trim());
    const num = s => parseFloat((s||'').toString().replace(/\s/g,'').replace(/,/g,'.').replace(/[^\d.\-]/g,''))||0;
    return { city:parts[0], budget:num(parts[1]), leads:num(parts[2]), badLeads:num(parts[3]), visits:num(parts[4]), deals:num(parts[5]), cash:num(parts[6]), buyout:num(parts[7]), creditIncome:num(parts[8]) };
  }).filter(r=>r.city);
}
function azApplyImport(rows) {
  let n=0;
  rows.forEach(r => {
    const match = AZ_CITIES.find(c => c.toLowerCase()===String(r.city||'').toLowerCase());
    if (match) {
      Object.assign(azData[azState.period][match], {budget:r.budget,leads:r.leads,badLeads:r.badLeads,visits:r.visits,deals:r.deals,cash:r.cash,buyout:r.buyout,creditIncome:r.creditIncome});
      n++;
    }
  });
  azSave(); return n;
}
function azStatus(id, msg, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg; el.className = 'az-import-status on '+(ok?'ok':'err');
  setTimeout(()=>el.classList.remove('on'), 4000);
}
function azImportCSV() {
  try { const n=azApplyImport(azParseCSV(document.getElementById('az-csv').value)); azStatus('az-csv-st',`Применено: ${n} городов`,true); renderAnaliz(); }
  catch(e){ azStatus('az-csv-st','Ошибка: '+e.message,false); }
}
function azImportJSON() {
  try { const n=azApplyImport(JSON.parse(document.getElementById('az-json').value)); azStatus('az-json-st',`Применено: ${n} городов`,true); renderAnaliz(); }
  catch(e){ azStatus('az-json-st','Ошибка JSON: '+e.message,false); }
}
async function azImportSheet() {
  const url = document.getElementById('az-sheet').value.trim();
  if (!url) { azStatus('az-sheet-st','Введите URL',false); return; }
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const gidM = url.match(/[#?&]gid=(\d+)/);
  if (!m) { azStatus('az-sheet-st','URL не похож на Google Sheet',false); return; }
  const csvUrl = `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv&gid=${gidM?gidM[1]:'0'}`;
  azStatus('az-sheet-st','Загружаем…',true);
  try {
    const resp = await fetch(csvUrl);
    if (!resp.ok) throw new Error('HTTP '+resp.status);
    const text = await resp.text();
    const n = azApplyImport(azParseCSV(text));
    azStatus('az-sheet-st',`Загружено: ${n} городов`,true);
    renderAnaliz();
  } catch(e) { azStatus('az-sheet-st','Не удалось: '+e.message,false); }
}

function showScr(id) {
  ['otchet','dohod','grafik','instruktsii','personal','rating','vizity','ceo','analiz','trophies','profile'].forEach(t => {
    const el = document.getElementById('scr-'+t);
    if (el) el.classList.remove('on');
  });
  const scrEl = document.getElementById('scr-'+id);
  scrEl?.classList.add('on');
  if (scrEl) requestAnimationFrame(() => flushPendingAnimations(scrEl));
  const gs = document.getElementById('grafik-sticky');
  if (gs) gs.style.display = id === 'grafik' ? '' : 'none';
  // Все верхние вкладки убраны
  ['floating-subtabs','floating-dohod-subtabs','floating-faq-subtabs'].forEach(fid => {
    const f = document.getElementById(fid); if (f) f.style.display = 'none';
  });
  // Dock active
  if (typeof dockSetActive === 'function') {
    const dockId = id === 'personal' ? 'home' : id === 'otchet' ? 'home' : id === 'ceo' ? 'home' : id;
    dockSetActive(dockId);
  }
  updateFirebasePage();
}

function num(v) { return parseInt(v)||0 }
function fmtRub(v) {
  const n = parseFloat(String(v||'').replace(/[^\d.,-]/g,'').replace(',','.'));
  return isNaN(n) ? (v||'—') : n.toLocaleString('ru') + ' ₽';
}
function pctClr(p) {
  const n = (typeof p === 'number') ? p : (parseFloat(String(p||0).replace(/[^\d.,-]/g,'').replace(',','.')) || 0);
  if (n >= 120) return '#7f5af0';
  if (n >= 110) return '#ff7ab6';
  if (n >= 100) return 'var(--grn)';
  if (n >= 90) return 'var(--org)';
  return 'var(--red)';
}
function pctGrad(p) {
  const n = (typeof p === 'number') ? p : (parseFloat(String(p||0).replace(/[^\d.,-]/g,'').replace(',','.')) || 0);
  if (n >= 120) return 'linear-gradient(45deg,#b06aff,#59d879)'; // purple → green
  if (n >= 110) return 'linear-gradient(45deg,#ff5faa,#59d879)'; // hot-pink → green
  if (n >= 100) return 'linear-gradient(45deg,#34e06a,#059652)'; // light-green → deep-green
  if (n >= 90)  return 'linear-gradient(45deg,#ffd84d,#f59e0b)'; // gold → amber
  return 'linear-gradient(45deg,#ff6b75,#c0392b)';               // red → dark-red
}
function pctTextStyle(p) {
  return `background:${pctGrad(p)};-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent`;
}
function pctToneStyle(p) {
  const n = (typeof p === 'number') ? p : (parseFloat(String(p||0).replace(/[^\d.,-]/g,'').replace(',','.')) || 0);
  if (n >= 120) return 'background:linear-gradient(45deg,rgba(234,220,255,.7),rgba(89,216,121,.32));border-color:rgba(127,90,240,.46)';
  if (n >= 110) return 'background:linear-gradient(45deg,rgba(255,224,238,.72),rgba(89,216,121,.32));border-color:rgba(255,122,182,.46)';
  if (n >= 100) return 'background:linear-gradient(45deg,rgba(217,248,222,.72),rgba(89,216,121,.32));border-color:rgba(46,213,115,.46)';
  if (n >= 90) return 'background:linear-gradient(45deg,rgba(255,243,184,.72),rgba(255,216,77,.34));border-color:rgba(255,165,2,.48)';
  return 'background:linear-gradient(45deg,rgba(255,214,217,.72),rgba(255,107,117,.34));border-color:rgba(255,71,87,.46)';
}

function rankColor(pos, total) {
  if (total <= 1) return { r:0, g:230, b:90 };
  const t = pos / (total - 1);
  let r, g, b;
  if (t <= 0.5) {
    const f = t * 2;
    r = Math.round(0   + (255 - 0)   * f);
    g = Math.round(230 + (224 - 230) * f);
    b = Math.round(90  + (0   - 90)  * f);
  } else {
    const f = (t - 0.5) * 2;
    r = Math.round(255 + (255 - 255) * f);
    g = Math.round(224 + (40  - 224) * f);
    b = Math.round(0   + (40  - 0)   * f);
  }
  return { r, g, b };
}

function rankStyles(pos, total) {
  const { r, g, b } = rankColor(pos, total);
  const color   = `rgb(${r},${g},${b})`;
  const border  = `rgba(${r},${g},${b},.6)`;
  const badgeBg = `rgba(${r},${g},${b},.25)`;
  return { color, border, badgeBg, r, g, b };
}
// Прогрессирующие фразы. После вставки .loader в DOM, через определённые
// интервалы фразы плавно сменяются (fade-out → fade-in). Без цикла —
// последняя фраза остаётся до перезагрузки.
const LOADER_PHRASES = [
  { at: 3000,  text: 'Подождите ещё чуть-чуть…' },
  { at: 6000,  text: 'Данных много, загружаем…' },
  { at: 10000, text: 'Хмм, удивительно, насколько сильно разрослась BD…' },
  { at: 18000, text: 'Что-то наебнулось, обнови ручками…' },
];
let _loaderIdSeq = 0;
function _attachLoaderProgression(loaderEl) {
  if (!loaderEl || loaderEl.dataset.lpAttached === '1') return;
  loaderEl.dataset.lpAttached = '1';
  const span = loaderEl.querySelector('.loader-text');
  if (!span) return;
  LOADER_PHRASES.forEach(p => {
    setTimeout(() => {
      if (!loaderEl.isConnected) return;
      span.classList.add('loader-text-fade');
      setTimeout(() => {
        if (!loaderEl.isConnected) return;
        span.textContent = p.text;
        span.classList.remove('loader-text-fade');
      }, 320);
    }, p.at);
  });
}
function loader(text='Синхронизация…') {
  const id = 'ldr-' + (++_loaderIdSeq);
  // После вставки HTML — через rAF находим .loader по id и навешиваем прогрессию.
  // Это заменяет глобальный MutationObserver, который слушал ВСЕ DOM-мутации
  // и был дорогой на дашборде с частыми перерисовками.
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (el) _attachLoaderProgression(el);
  });
  const parts = Array(13).fill('<i></i>').join('');
  return `<div class="loader" id="${id}"><div class="ldv2">${parts}</div><span class="loader-text">${text}</span></div>`;
}

function medalBtn(idx) {
  const emoji = idx===0 ? '🥇' : idx===1 ? '🥈' : idx===2 ? '🥉' : '';
  if (!emoji) return '';
  return `<button class="medal-btn" onclick="burstConfetti(this,${idx})" title="🎉">${emoji}</button>`;
}

let tokenClient;
let refreshTimer = null;
let autoRefreshTimer = null;
let tokenExpiresAt = 0;
let tokenRequest = null;
const AUTO_REFRESH_INTERVAL = 3 * 60 * 1000; // 3 минуты
const PRESENCE_STALE_MS = 15 * 60 * 1000;

const firebasePresence = {
  app: null,
  auth: null,
  db: null,
  uid: null,
  userRef: null,
  connectionsRef: null,
  connectionRef: null,
  connectedHandler: null,
  connectionsHandler: null,
  usersRef: null,
  usersHandler: null,
  onlineUsers: [],
  selfUser: null,
  error: '',
};

// Определяем Android WebView (Capacitor) — Google OAuth там не работает
const isAndroidWebView = /Android/.test(navigator.userAgent) && /wv\b/.test(navigator.userAgent);

const LOGOS = Array.from({length: 20}, (_, i) => `${ASSET_BASE}${String(i+1).padStart(2,'0')}.png`);
let _logoIdx = Math.floor(Math.random() * LOGOS.length); // стартуем со случайной
let _logoTimer = null;

function makeSvgDataUri(svg) {
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg.trim());
}

function setLogoByIndex(idx, attempts = 0) {
  const el = document.getElementById('logo-img');
  if (!el) return;
  if (attempts >= LOGOS.length) {
    el.removeAttribute('src');
    el.style.opacity = '0';
    return;
  }
  _logoIdx = ((idx % LOGOS.length) + LOGOS.length) % LOGOS.length;
  el.style.opacity = '0';
  setTimeout(() => {
    const newSrc = LOGOS[_logoIdx];
    const img = new Image();
    img.onload = () => { el.src = newSrc; el.style.opacity = '1'; };
    img.onerror = () => setLogoByIndex(_logoIdx + 1, attempts + 1);
    img.src = newSrc;
  }, 400);
}

function rotateLogo() {
  setLogoByIndex(_logoIdx + 1);
}

function initLogoRotation() {
  const el = document.getElementById('logo-img');
  if (el) setLogoByIndex(_logoIdx);
  if (_logoTimer) clearInterval(_logoTimer);
  _logoTimer = setInterval(rotateLogo, 5 * 60 * 1000);
}

// ==================== GOOEY LOGO ANIMATION ====================
(function initGooeyLogo() {
  const TEXTS = ['CRM Crew', 'Dashboard'];
  const MORPH_TIME = 1.4;     // длительность морфа (сек)
  const COOLDOWN_TIME = 13.6; // ~15 сек между сменами (cooldown + morph)

  function start() {
    const t1 = document.getElementById('gooey-t1');
    const t2 = document.getElementById('gooey-t2');
    if (!t1 || !t2) { setTimeout(start, 200); return; }
    const parent = t1.parentElement;

    let textIndex = TEXTS.length - 1;
    let prevTime = performance.now();
    let morph = 0;
    let cooldown = COOLDOWN_TIME;
    let filterOn = false;
    t1.textContent = TEXTS[textIndex % TEXTS.length];
    t2.textContent = TEXTS[(textIndex + 1) % TEXTS.length];

    function setParentFilter(on) {
      if (on === filterOn) return;
      filterOn = on;
      const sh = getComputedStyle(parent).getPropertyValue('--logo-shadow').trim() || '0 2px 3px rgba(0,0,0,0.35)';
      parent.style.filter = on
        ? `url(#gooey-threshold-local) drop-shadow(${sh})`
        : `drop-shadow(${sh})`;
    }
    function setMorph(fraction) {
      setParentFilter(true);
      t2.style.filter = `blur(${Math.min(8 / fraction - 8, 100)}px)`;
      t2.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`;
      const inv = 1 - fraction;
      t1.style.filter = `blur(${Math.min(8 / inv - 8, 100)}px)`;
      t1.style.opacity = `${Math.pow(inv, 0.4) * 100}%`;
    }
    function doCooldown() {
      morph = 0;
      setParentFilter(false);
      t2.style.filter = '';  t2.style.opacity = '100%';
      t1.style.filter = '';  t1.style.opacity = '0%';
    }
    function doMorph() {
      morph -= cooldown;
      cooldown = 0;
      let fraction = morph / MORPH_TIME;
      if (fraction > 1) { cooldown = COOLDOWN_TIME; fraction = 1; }
      setMorph(fraction);
    }
    function animate() {
      requestAnimationFrame(animate);
      const now = performance.now();
      const dt = (now - prevTime) / 1000;
      prevTime = now;
      const shouldIncrement = cooldown > 0;
      cooldown -= dt;
      if (cooldown <= 0) {
        if (shouldIncrement) {
          textIndex = (textIndex + 1) % TEXTS.length;
          t1.textContent = TEXTS[textIndex % TEXTS.length];
          t2.textContent = TEXTS[(textIndex + 1) % TEXTS.length];
        }
        doMorph();
      } else {
        doCooldown();
      }
    }
    animate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

function firebaseConfigured() {
  const cfg = CFG.FIREBASE || {};
  return !!(cfg.apiKey && cfg.authDomain && cfg.databaseURL && cfg.projectId && cfg.appId);
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

const escapeAttr = escapeHtml;

function normalizeEmail(v) {
  return String(v || '')
    .replace(/\u00a0/g, ' ')
    .toLowerCase()
    .trim();
}

function splitEmails(v) {
  return String(v || '')
    .split(/[,;|\s]+/)
    .map(normalizeEmail)
    .filter(Boolean);
}

function getUserSheetNameByEmail(email) {
  const target = normalizeEmail(email);
  if (!target || !S.usersData) return '';
  for (let i = 1; i < S.usersData.length; i++) {
    const row = S.usersData[i] || [];
    const emails = splitEmails(row[0]);
    if (emails.includes(target)) return String(row[1] || '').trim();
  }
  return '';
}

function normalizePresenceUser(user) {
  if (!user) return user;
  const email = normalizeEmail(user.email);
  const sheetName = getUserSheetNameByEmail(email);
  const updatedAt = Number(user.updatedAt || 0);
  const normalized = { ...user, email, updatedAt };
  normalized.name = sheetName || normalized.name || '';
  if (sheetName) normalized.personKey = String(sheetName).toLowerCase().trim();
  else if (email) normalized.personKey = email;
  else if (normalized.name) normalized.personKey = String(normalized.name).toLowerCase().trim();
  return normalized;
}

function isPresenceFresh(user) {
  const ts = Number(user?.updatedAt || 0);
  return !!ts && Date.now() - ts <= PRESENCE_STALE_MS;
}

function dedupePresenceUsers(users) {
  const byPerson = new Map();
  users
    .map(normalizePresenceUser)
    .filter(u => u && u.status === 'online' && isPresenceFresh(u))
    .forEach(u => {
      const key = u.personKey || u.uid || u.email || u.name;
      const prev = byPerson.get(key);
      if (!prev || Number(u.updatedAt || 0) > Number(prev.updatedAt || 0)) byPerson.set(key, u);
    });
  return [...byPerson.values()]
    .sort((a, b) => String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''), 'ru'));
}

// «Бочаров Юлиан» → «Юлиан Б.», «Виталий» → «Виталий».
// В USERS хранится «Фамилия Имя», поэтому имя — parts[1], фамилия — parts[0].
function _presenceShortName(full) {
  if (!full) return '';
  const parts = String(full).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || '';
  const surname = parts[0];
  const firstName = parts[1];
  const initial = surname.charAt(0).toUpperCase();
  return `${firstName} ${initial}.`;
}

function getPresencePageLabel() {
  const deptLabel = dept => dept === 'dozhim' ? 'Дожим' : 'CRM';
  const matched = findUserInSheet();
  const role = matched?.role || 'crm';
  const isCeo = isCeoLike(role);
  const roleDept = role === 'dozhim' ? 'dozhim' : 'crm';
  const effectiveRatingDept = isCeo ? S.ratingDept : roleDept;
  const effectiveDohodDept = isCeo ? S.dohodTab : roleDept;
  // Автоподбор — фуллскрин-оверлей, не scr-* — проверяем по классу .open
  if (document.getElementById('autopodbor-fullscreen')?.classList.contains('open')) return 'Автоподбор';
  if (document.getElementById('profile-modal-overlay')?.classList.contains('open')) {
    // Если в S.viewingProfileOf лежит имя — показываем «Чекает стр. {Имя}»;
    // если открыт собственный профиль или имя не передано — короткий лейбл.
    const target = (S.viewingProfileOf || '').trim();
    const me = matched?.name || '';
    if (target && target.toLowerCase() !== me.toLowerCase()) {
      const parts = target.split(/\s+/).filter(Boolean);
      // Имя в USERS: «Фамилия Имя» → берём parts[1], иначе parts[0]
      const firstName = parts[1] || parts[0] || target;
      return `Профиль ${firstName}`;
    }
    return 'Профиль';
  }
  if (document.getElementById('scr-profile')?.classList.contains('on')) return 'Мой профиль';
  if (document.getElementById('scr-ceo')?.classList.contains('on')) return 'Главная';
  if (document.getElementById('scr-analiz')?.classList.contains('on')) return 'Аналитик ИИ';
  if (document.getElementById('scr-trophies')?.classList.contains('on')) return 'Трофеи';
  if (document.getElementById('scr-personal')?.classList.contains('on')) return 'Мой KPI';
  if (document.getElementById('scr-rating')?.classList.contains('on')) {
    return isCeo ? `Рейтинг ${deptLabel(effectiveRatingDept)}` : 'Рейтинг';
  }
  if (document.getElementById('scr-grafik')?.classList.contains('on')) return 'График';
  if (document.getElementById('scr-dohod')?.classList.contains('on')) {
    return isCeo ? `Доход ${deptLabel(effectiveDohodDept)}` : 'Мой доход';
  }
  if (document.getElementById('scr-vizity')?.classList.contains('on')) return `Визиты ${deptLabel(S.vizDept || roleDept)}`;
  if (document.getElementById('scr-instruktsii')?.classList.contains('on')) {
    const faq = S.faqTab === 'mango' ? 'MANGO' : S.faqTab === 'links' ? 'Ссылки' : S.faqTab === 'reglament' ? 'Регламент' : S.faqTab === 'autopodbor' ? 'Автоподбор' : 'Инструкции';
    return `FAQ ${faq}`;
  }
  if (document.getElementById('scr-otchet')?.classList.contains('on')) {
    if (!isCeo) return 'Главная';
    if (S.reportTab === 'mgr') return 'KPI CRM';
    if (S.reportTab === 'dozhim') return 'KPI Дожим';
    return 'Итоги';
  }
  return 'Главная';
}

function initFirebasePresence() {
  if (firebasePresence.app) return firebasePresence;
  if (!firebaseConfigured()) return null;
  if (!window.firebase?.initializeApp || !firebase.auth || !firebase.database) {
    console.warn('Firebase SDK не загружен: presence отключен');
    return null;
  }
  firebasePresence.app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(CFG.FIREBASE);
  firebasePresence.auth = firebase.auth();
  firebasePresence.db = firebase.database();
  return firebasePresence;
}

function renderPresenceState() {
  const listed = dedupePresenceUsers(firebasePresence.onlineUsers || []);
  const selfRaw = firebasePresence.selfUser
    ? { ...firebasePresence.selfUser, updatedAt: Date.now(), status: 'online' }
    : null;
  const self = normalizePresenceUser(selfRaw);
  const hasSelf = self && listed.some(u => u.uid === self.uid);
  const users = dedupePresenceUsers(self && !hasSelf ? [self, ...listed] : listed);
  const countEl = document.getElementById('presence-count');
  if (countEl) {
    countEl.textContent = users.length;
    countEl.style.display = users.length ? 'flex' : 'none';
  }
  const titleEl = document.getElementById('presence-title');
  if (titleEl) titleEl.textContent = `Сейчас онлайн: ${users.length}`;

  const body = document.getElementById('presence-body');
  if (!body) return;
  if (!firebaseConfigured()) {
    body.innerHTML = '<div class="presence-empty">Firebase еще не настроен</div>';
    return;
  }
  if (!users.length) {
    const msg = firebasePresence.error || 'Пока никого онлайн не видно';
    body.innerHTML = `<div class="presence-empty">${escapeHtml(msg)}</div>`;
    return;
  }
  const rows = users.map(u => `
    <div class="presence-row">
      <span class="presence-dot"></span>
      <span class="presence-name">${escapeHtml(_presenceShortName(u.name) || u.email || 'Без имени')}</span>
      <span class="presence-page">${escapeHtml(u.page || 'Сайт')}</span>
    </div>
  `).join('');
  const note = firebasePresence.error
    ? `<div class="presence-empty">${escapeHtml(firebasePresence.error)}</div>`
    : '';
  body.innerHTML = `${rows}${note}`;
}

function subscribeFirebaseUsers() {
  const p = firebasePresence;
  if (!p.db || p.usersRef) return;
  p.usersRef = p.db.ref('presence/users');
  p.usersHandler = snap => {
    const raw = snap.val() || {};
    p.error = '';
    p.onlineUsers = dedupePresenceUsers(Object.values(raw));
    renderPresenceState();
  };
  p.usersRef.on('value', p.usersHandler, err => {
    p.error = err?.code === 'PERMISSION_DENIED'
      ? 'Нет доступа к списку онлайн. Проверь Rules для presence/users.'
      : 'Онлайн-список временно недоступен';
    renderPresenceState();
  });
}

function updateFirebasePage() {
  const p = firebasePresence;
  const page = getPresencePageLabel();
  const now = Date.now();
  if (p.selfUser) {
    p.selfUser = { ...p.selfUser, page, updatedAt: now, status: 'online' };
  }
  if (p.onlineUsers?.length && p.uid) {
    p.onlineUsers = p.onlineUsers.map(u => u.uid === p.uid ? { ...u, page, updatedAt: now, status: 'online' } : u);
  }
  renderPresenceState();
  if (!p.userRef || !window.firebase?.database) return;
  p.userRef.update({
    page,
    updatedAt: firebase.database.ServerValue.TIMESTAMP,
  }).catch(() => {});
  if (p.connectionRef) p.connectionRef.update({ page }).catch(() => {});
}

function refreshFirebaseProfile() {
  const p = firebasePresence;
  if (!p.userRef || !p.uid || !window.firebase?.database) return;
  const profile = { ...firebaseProfile({ uid: p.uid }), updatedAt: Date.now() };
  if (p.selfUser) {
    p.selfUser = { ...p.selfUser, ...profile, status: 'online' };
  }
  if (p.onlineUsers?.length) {
    p.onlineUsers = p.onlineUsers.map(u => u.uid === p.uid ? { ...u, ...profile, status: 'online' } : u);
    renderPresenceState();
  }
  p.userRef.update({
    ...profile,
    status: 'online',
    updatedAt: firebase.database.ServerValue.TIMESTAMP,
  }).catch(() => {});
  if (p.connectionRef) p.connectionRef.update({ page: profile.page }).catch(() => {});
}

function openPresenceModal() {
  renderPresenceState();
  document.getElementById('presence-popover')?.classList.add('open');
}

function closePresenceModal() {
  document.getElementById('presence-popover')?.classList.remove('open');
}

/* ══ CEO PUSH NOTIFICATION ══ */
function openNotifyModal() {
  const overlay = document.getElementById('notify-modal-overlay');
  const ta = document.getElementById('notify-text');
  if (!overlay) return;
  ta.value = '';
  document.getElementById('notify-char').textContent = '0';
  overlay.style.display = 'flex';
  setTimeout(() => ta.focus(), 80);
}

function closeNotifyModal() {
  const overlay = document.getElementById('notify-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

function _notifyCharUpdate() {
  const ta = document.getElementById('notify-text');
  const cc = document.getElementById('notify-char');
  if (ta && cc) cc.textContent = ta.value.length;
}

async function sendPushNotification() {
  const ta   = document.getElementById('notify-text');
  const btn  = document.getElementById('notify-send-btn');
  const text = (ta?.value || '').trim();
  if (!text) { ta?.focus(); return; }

  const p = firebasePresence;
  if (!p.db) { toast('Firebase не подключён', 'e'); return; }

  const me = findUserInSheet();
  const sentBy = me?.name || S.user?.name || 'CEO';

  btn.disabled = true;
  btn.textContent = 'Отправка…';
  try {
    await p.db.ref('notification').set({
      text,
      sentBy,
      sentAt: firebase.database.ServerValue.TIMESTAMP,
    });
    toast('Уведомление отправлено', 's');
    closeNotifyModal();
  } catch(e) {
    toast('Ошибка отправки: ' + (e.message || e), 'e');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Отправить';
  }
}

let _notifyListenerStarted = false;
let _currentNotifySentAt   = 0;

function startNotificationListener() {
  if (_notifyListenerStarted) return;
  const p = firebasePresence;
  if (!p.db) return;
  const me = findUserInSheet();
  if (isCeoLike(me?.role)) return; // CEO не получает свои же уведомления
  _notifyListenerStarted = true;

  p.db.ref('notification').on('value', snap => {
    const data = snap.val();
    if (!data || !data.sentAt || !data.text) return;
    const age = Date.now() - data.sentAt;
    if (age > 600_000) return; // старше 10 минут — игнор

    // Уже видел это уведомление (та же временна́я метка)?
    const seenAt = parseInt(localStorage.getItem('notify_seen_at') || '0');
    if (data.sentAt <= seenAt) return;

    showPushBanner(data);
  }, () => {}); // ошибку доступа тихо игнорируем
}

function showPushBanner(data) {
  const banner = document.getElementById('push-banner');
  if (!banner) return;
  _currentNotifySentAt = data.sentAt || 0;
  document.getElementById('push-banner-text').textContent   = data.text || '';
  document.getElementById('push-banner-sender').textContent = data.sentBy || 'Руководитель';
  const mins = Math.max(0, Math.round((Date.now() - (data.sentAt || Date.now())) / 60000));
  document.getElementById('push-banner-time').textContent   = mins < 1 ? 'только что' : `${mins} мин назад`;
  banner.style.display = 'flex';
}

function closePushBanner() {
  const banner = document.getElementById('push-banner');
  if (banner) banner.style.display = 'none';
  // Запоминаем: это уведомление уже показано, не показывать повторно
  if (_currentNotifySentAt) {
    localStorage.setItem('notify_seen_at', String(_currentNotifySentAt));
    _currentNotifySentAt = 0;
  }
}

// ==================== MAINTENANCE OVERLAY ====================
let _svcRenderer = null;
let _svcAnimFrame = null;

function showMaintenancePage() {
  const overlay = document.getElementById('maintenance-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  _initMaintenanceShader();
}

function hideMaintenancePage() {
  const overlay = document.getElementById('maintenance-overlay');
  if (overlay) overlay.style.display = 'none';
  _destroyMaintenanceShader();
}

function _destroyMaintenanceShader() {
  if (_svcAnimFrame) { cancelAnimationFrame(_svcAnimFrame); _svcAnimFrame = null; }
  if (_svcRenderer) { _svcRenderer.dispose(); _svcRenderer = null; }
}

function _initMaintenanceShader() {
  if (typeof THREE === 'undefined') return;
  const canvas = document.getElementById('maintenance-canvas');
  if (!canvas) return;
  _destroyMaintenanceShader();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  _svcRenderer = renderer;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene  = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const vertexShader = `
    void main() {
      gl_Position = vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform vec2  uResolution;

    vec3 palette(float t) {
      vec3 a = vec3(0.1, 0.05, 0.2);
      vec3 b = vec3(0.1, 0.1,  0.3);
      vec3 c = vec3(0.5, 0.4,  0.7);
      vec3 d = vec3(0.0, 0.15, 0.4);
      return a + b * cos(6.28318 * (c * t + d));
    }

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1,0)), f.x),
        mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
        f.y
      );
    }

    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for(int i = 0; i < 6; i++) {
        v += a * noise(p);
        p *= 2.0; a *= 0.5;
      }
      return v;
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / min(uResolution.x, uResolution.y);
      float t = uTime * 0.18;

      vec2 q = vec2(fbm(uv + t), fbm(uv + vec2(1.7, 9.2)));
      vec2 r = vec2(fbm(uv + 4.0*q + vec2(1.7+t, 9.2)), fbm(uv + 4.0*q + vec2(8.3, 2.8+t)));
      float f = fbm(uv + 4.0 * r);

      vec3 col = mix(
        mix(vec3(0.02, 0.01, 0.05), palette(f + 0.3 * t), clamp(f * 2.0, 0.0, 1.0)),
        palette(f + 0.5),
        clamp(length(q) * 1.5, 0.0, 1.0)
      );
      col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 1.8));

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const uniforms = {
    uTime:       { value: 0.0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
  };

  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms });
  scene.add(new THREE.Mesh(geometry, material));

  const onResize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  const clock = new THREE.Clock();
  const animate = () => {
    if (!_svcRenderer) { window.removeEventListener('resize', onResize); return; }
    _svcAnimFrame = requestAnimationFrame(animate);
    uniforms.uTime.value = clock.getElapsedTime();
    renderer.render(scene, camera);
  };
  animate();
}

function firebaseProfile(user) {
  const profile = S.user || {};
  const email = profile.email || user.email || '';
  const sheetName = getUserSheetNameByEmail(email);
  return {
    uid: user.uid,
    name: sheetName || profile.name || user.displayName || '',
    email,
    photoURL: profile.picture || user.photoURL || '',
    page: getPresencePageLabel(),
    userAgent: navigator.userAgent,
  };
}

function detachFirebasePresence() {
  const p = firebasePresence;
  try {
    if (p.connectedHandler && p.db) p.db.ref('.info/connected').off('value', p.connectedHandler);
    if (p.connectionsHandler && p.connectionsRef) p.connectionsRef.off('value', p.connectionsHandler);
    if (p.usersHandler && p.usersRef) p.usersRef.off('value', p.usersHandler);
    if (p.connectionRef) p.connectionRef.remove().catch?.(() => {});
  } catch(e) {}
  p.uid = null;
  p.userRef = null;
  p.connectionsRef = null;
  p.connectionRef = null;
  p.connectedHandler = null;
  p.connectionsHandler = null;
  p.usersRef = null;
  p.usersHandler = null;
  p.onlineUsers = [];
  p.selfUser = null;
  p.error = '';
  renderPresenceState();
}

function markFirebaseOffline(signOut = false) {
  const p = firebasePresence;
  if (!p.userRef || !window.firebase?.database) {
    if (signOut && p.auth) p.auth.signOut().catch(() => {});
    return;
  }
  const offline = {
    status: 'offline',
    lastSeen: firebase.database.ServerValue.TIMESTAMP,
    updatedAt: firebase.database.ServerValue.TIMESTAMP,
  };
  if (p.connectionRef) p.connectionRef.remove().catch(() => {});
  p.userRef.update(offline).finally(() => {
    detachFirebasePresence();
    if (signOut && p.auth) p.auth.signOut().catch(() => {});
  });
}

function startFirebasePresence(user) {
  const p = initFirebasePresence();
  if (!p || !user) return;
  if (p.uid === user.uid && p.connectionRef) return;
  detachFirebasePresence();

  const uid = user.uid;
  const profile = firebaseProfile(user);
  p.selfUser = { ...profile, status: 'online', updatedAt: Date.now() };
  p.error = '';
  p.uid = uid;
  p.userRef = p.db.ref(`presence/users/${uid}`);
  p.connectionsRef = p.db.ref(`presence/connections/${uid}`);
  subscribeFirebaseUsers();
  renderPresenceState();

  const connectedRef = p.db.ref('.info/connected');
  p.connectedHandler = snap => {
    if (snap.val() !== true) return;
    const con = p.connectionsRef.push();
    p.connectionRef = con;
    const online = {
      ...profile,
      status: 'online',
      updatedAt: firebase.database.ServerValue.TIMESTAMP,
    };
    const offline = {
      ...profile,
      status: 'offline',
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
      updatedAt: firebase.database.ServerValue.TIMESTAMP,
    };

    con.onDisconnect().remove().catch?.(() => {});
    p.userRef.onDisconnect().update(offline).catch?.(() => {});
    con.set({
      status: 'online',
      connectedAt: firebase.database.ServerValue.TIMESTAMP,
      page: profile.page,
      userAgent: profile.userAgent,
    }).catch(err => {
      p.error = err?.code === 'PERMISSION_DENIED' ? 'Нет доступа к записи соединения online' : 'Не удалось записать online-соединение';
      renderPresenceState();
    });
    p.userRef.update(online).catch(err => {
      p.error = err?.code === 'PERMISSION_DENIED' ? 'Нет доступа к записи online-статуса' : 'Не удалось записать online-статус';
      renderPresenceState();
    });
    setTimeout(() => {
      const latest = firebaseProfile(user);
      p.userRef?.update({
        ...latest,
        status: 'online',
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
      }).catch(() => {});
    }, 1000);
    renderPresenceState();
  };

  p.connectionsHandler = snap => {
    if (snap.exists()) {
      const currentProfile = firebaseProfile({ uid: p.uid });
      p.userRef.update({
        ...currentProfile,
        status: 'online',
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
      });
    }
  };

  connectedRef.on('value', p.connectedHandler);
  p.connectionsRef.on('value', p.connectionsHandler);
}

async function syncFirebaseAuth(accessToken) {
  const p = initFirebasePresence();
  if (!p || !accessToken) return null;
  try {
    const current = p.auth.currentUser;
    if (current) {
      startFirebasePresence(current);
      return current;
    }
    const credential = firebase.auth.GoogleAuthProvider.credential(null, accessToken);
    const result = await p.auth.signInWithCredential(credential);
    startFirebasePresence(result.user);
    return result.user;
  } catch(e) {
    console.warn('Firebase Auth/Presence не запущен', e);
    const code = e?.code || e?.message || 'unknown';
    if (code === 'auth/invalid-credential') return signInFirebaseAnonymously();
    firebasePresence.error = `Firebase Auth не подключился: ${code}`;
    renderPresenceState();
    return null;
  }
}

async function signInFirebaseAnonymously() {
  const p = initFirebasePresence();
  if (!p) return null;
  try {
    if (p.auth.currentUser) {
      startFirebasePresence(p.auth.currentUser);
      return p.auth.currentUser;
    }
    const result = await p.auth.signInAnonymously();
    p.error = '';
    startFirebasePresence(result.user);
    return result.user;
  } catch(e) {
    console.warn('Firebase anonymous auth failed', e);
    const code = e?.code || e?.message || 'unknown';
    firebasePresence.error = code === 'auth/operation-not-allowed'
      ? 'В Firebase Auth включи Anonymous provider для online.'
      : `Firebase online не подключился: ${code}`;
    renderPresenceState();
    return null;
  }
}

function scheduleTokenRefresh(expiresIn) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const delay = Math.max((expiresIn - 300) * 1000, 0);
  refreshTimer = setTimeout(() => {
    if (tokenClient && S.token) {
      tokenClient.requestAccessToken({ prompt: '' });
    }
    refreshTimer = null;
  }, delay);
}

function cleanupTokenRequest() {
  if (!tokenRequest) return;
  if (tokenRequest.timer) clearTimeout(tokenRequest.timer);
  tokenRequest = null;
}

function showLoginScreen() {
  const l = document.getElementById('silent-loader');
  if (l) l.remove();
  const login = document.getElementById('scr-login');
  if (login) {
    login.style.display = '';
    login.classList.add('on');
  }
  document.body.classList.add('login-active');
  if (window._loginLiquidInit) window._loginLiquidInit();
}

function requestGoogleToken({ prompt = '', mode = 'ensure', force = false } = {}) {
  if (!tokenClient) return Promise.reject(new Error('oauth_not_ready'));
  if (force && tokenRequest) cleanupTokenRequest();
  if (tokenRequest) return tokenRequest.promise;

  let resolveRequest, rejectRequest;
  const promise = new Promise((resolve, reject) => {
    resolveRequest = resolve;
    rejectRequest = reject;
  });

  tokenRequest = {
    mode,
    promise,
    resolve: resolveRequest,
    reject: rejectRequest,
    timer: setTimeout(() => {
      const current = tokenRequest;
      cleanupTokenRequest();
      if (current) current.reject(new Error('oauth_timeout'));
    }, 15000),
  };

  try {
    tokenClient.requestAccessToken({ prompt });
  } catch (err) {
    const current = tokenRequest;
    cleanupTokenRequest();
    if (current) current.reject(err);
  }

  return promise;
}

async function ensureToken({ interactive = false } = {}) {
  if (S.token && Date.now() < tokenExpiresAt - 60_000) return S.token;
  const tok = localStorage.getItem('crm_tok');
  const exp = parseInt(localStorage.getItem('crm_exp') || '0');
  if (tok && exp > Date.now()) {
    S.token = tok;
    tokenExpiresAt = exp;
    return tok;
  }
  try {
    const resp = await requestGoogleToken({ prompt: interactive ? 'consent' : '', mode: 'ensure' });
    return resp.access_token;
  } catch (err) {
    err.isAuthError = true;
    throw err;
  }
}

async function authHeaders(extra = {}, opts = {}) {
  const token = await ensureToken(opts);
  return { Authorization: 'Bearer ' + token, ...extra };
}

function initAuth() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CFG.CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
    error_callback: (err) => {
      const pending = tokenRequest;
      cleanupTokenRequest();
      if (pending) pending.reject(new Error(err?.type || 'oauth_popup_error'));
      if (pending?.mode === 'login') {
        showLoginScreen();
        toast('Окно авторизации не завершилось. Попробуйте войти еще раз', 'e');
      }
    },
    callback: async (resp) => {
      const pending = tokenRequest;
      if (resp.error) {
        cleanupTokenRequest();
        if (window._silentFallback) { clearTimeout(window._silentFallback); window._silentFallback = null; }
        showLoginScreen();
        toast('Ошибка: '+resp.error, 'e');
        if (pending) pending.reject(new Error(resp.error));
        return;
      }
      const l = document.getElementById('silent-loader');
      if (l) l.remove();
      if (window._silentFallback) { clearTimeout(window._silentFallback); window._silentFallback = null; }
      S.token = resp.access_token;
      tokenExpiresAt = Date.now() + Math.max((resp.expires_in || 3600) - 60, 60) * 1000;
      localStorage.setItem('crm_tok', resp.access_token);
      localStorage.setItem('crm_exp', tokenExpiresAt);
      loadUser();
      syncFirebaseAuth(resp.access_token);
      onLogin();
      scheduleTokenRefresh(resp.expires_in);
      cleanupTokenRequest();
      if (pending) pending.resolve(resp);
    },
  });
}

async function loadUser() {
  try {
    const token = S.token || localStorage.getItem('crm_tok');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo',
      { headers:{ Authorization:'Bearer '+token }, signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return;
    S.user = await r.json();
    localStorage.setItem('crm_user', JSON.stringify(S.user));
    renderUser();
    refreshFirebaseProfile();
    if (S.usersData !== null &&
        document.getElementById('scr-otchet')?.classList.contains('on') &&
        !document.getElementById('scr-personal')?.classList.contains('on')) {
      const matched = findUserInSheet();
      if (matched && matched.name) goPersonal();
    }
  } catch(e) { /* ignore */ }
}

function renderUser() {
  if (!S.user) return;
  const av = document.getElementById('user-avatar');
  if (S.user.picture) {
    av.src = S.user.picture;
  }
  av.style.cursor = 'pointer';
  av.title = 'Мой KPI';
  av.onclick = function() {
    const m = findUserInSheet();
    if (m && isCeoLike(m.role)) return;
    goPersonal();
  };
  // Имя пользователя (из USERS если есть, иначе из Google)
  const matchedU = (typeof findUserInSheet === 'function') ? findUserInSheet() : null;
  const displayName = (matchedU && matchedU.name) ? matchedU.name : (S.user.name || '');
  if (displayName) {
    const nameParts = displayName.split(' ');
    document.getElementById('user-name').textContent = nameParts[0];
    const hmbName = document.getElementById('hmb-account-name');
    if (hmbName) hmbName.textContent = displayName;
  }
  // Аватар в гамбургере: из logos/avatar/{id}-default.png по ID из USERS
  const hmbAv = document.getElementById('hmb-avatar');
  if (hmbAv) {
    const id = matchedU ? getMgrCrmId(matchedU.name) : null;
    if (id) {
      const src = `logos/avatar/${id}-default.png`;
      hmbAv.onerror = function(){ this.style.display='none'; };
      hmbAv.style.display = '';
      hmbAv.src = src;
    } else if (S.user.picture) {
      hmbAv.onerror = function(){ this.style.display='none'; };
      hmbAv.style.display = '';
      hmbAv.src = S.user.picture;
    } else {
      hmbAv.style.display = 'none';
    }
  }
  // Показываем аккаунт-блок в гамбургере
  const hmbAcc = document.getElementById('hmb-account-btn');
  const hmbAccSep = document.getElementById('hmb-sep-account');
  if (hmbAcc) hmbAcc.style.display = '';
  if (hmbAccSep) hmbAccSep.style.display = '';
  document.getElementById('user-wrap').style.display = 'none'; // скрыт из хедера
}

function onLogin() {
  S.authReady = false;
  const _bo = document.getElementById('btn-out');
  if (_bo) _bo.style.display = '';
  document.getElementById('main-nav').style.display  = 'none';
  document.getElementById('main-dock').style.display = 'flex';
  // Hamburger: сразу показываем Выйти + Месяц
  const hmbl = document.getElementById('hmb-logout'); if (hmbl) hmbl.style.display = '';
  const hmbsl = document.getElementById('hmb-sep-logout'); if (hmbsl) hmbsl.style.display = '';
  const hmbm = document.getElementById('hmb-month-trigger'); if (hmbm) hmbm.style.display = '';
  const hmbms = document.getElementById('hmb-sep-month'); if (hmbms) hmbms.style.display = '';
  // Трофеи и «О проекте» показываем только после авторизации
  const hmbt = document.getElementById('hmb-trophies'); if (hmbt) hmbt.style.display = '';
  const hmba = document.getElementById('hmb-about-btn'); if (hmba) hmba.style.display = '';
  updateBadge();
  const ls = document.getElementById('scr-login');
  ls.classList.remove('on'); ls.style.display = 'none'; document.body.classList.remove('login-active');
  if (window._loginLiquidCleanup) window._loginLiquidCleanup();
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab==='otchet'));
  showScr('otchet');
  const firstScreen = document.getElementById('c-otchet');
  if (firstScreen) firstScreen.innerHTML = loader();
  loadUsersAndStart();
  // Автообновление каждые 3 минуты — полный сброс кеша
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => {
    if (!S.token) return;
    // Не обновляем пока открыт журнал визитов — пользователь может вводить данные
    if (document.getElementById('scr-vizity')?.classList.contains('on')) return;
    // Не обновляем пока открыт фуллскрин-Автоподбор — нет смысла дёргать API
    // и под оверлеем; на закрытии следующий тик пойдёт по обычному расписанию.
    if (document.getElementById('autopodbor-fullscreen')?.classList.contains('open')) return;
    const isPersonal = document.getElementById('scr-personal')?.classList.contains('on');
    const ratingOn = document.getElementById('scr-rating')?.classList.contains('on');
    const activeTab = ratingOn ? 'rating' : (document.querySelector('.tab.on')?.dataset.tab || 'otchet');
    if (!isPersonal && activeTab === 'instruktsii') return;
    refreshVisibleDataLive().catch(err => {
      if (err?.message !== 'auth') console.warn('silent live refresh failed', err);
    });
  }, AUTO_REFRESH_INTERVAL);
}

function onLogout() {
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
  S.authReady = false;
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  cleanupTokenRequest();
  markFirebaseOffline(true);
  if (S.token) google.accounts.oauth2.revoke(S.token, ()=>{});
  tokenExpiresAt = 0;
  S.token=null; S.user=null; S.usersData=null;
  S.data = { otchet:null, dohod:null, grafik:null, grafikFmt:null, instruktsii:null, d_otchet:null, d_dohod:null, cnvrs:null, stavki:null, d_stavki:null, vizity:null, plan:null, d_vizity:null, vizityFmt:null, d_vizityFmt:null };
  ['crm_tok','crm_exp','crm_user'].forEach(k => localStorage.removeItem(k));
  document.getElementById('user-wrap').style.display = 'none';
  const _bo2 = document.getElementById('btn-out');
  if (_bo2) _bo2.style.display = 'none';
  document.getElementById('main-nav').style.display  = 'none';
  document.getElementById('main-dock').style.display = 'none';
  const hmbl2 = document.getElementById('hmb-logout'); if (hmbl2) hmbl2.style.display = 'none';
  const hmbsl2 = document.getElementById('hmb-sep-logout'); if (hmbsl2) hmbsl2.style.display = 'none';
  const hmbAcc2 = document.getElementById('hmb-account-btn'); if (hmbAcc2) hmbAcc2.style.display = 'none';
  const hmbAccSep2 = document.getElementById('hmb-sep-account'); if (hmbAccSep2) hmbAccSep2.style.display = 'none';
  // Скрываем Трофеи и «О проекте» при выходе — экран авторизации без них
  const hmbt2 = document.getElementById('hmb-trophies'); if (hmbt2) hmbt2.style.display = 'none';
  const hmba2 = document.getElementById('hmb-about-btn'); if (hmba2) hmba2.style.display = 'none';
  const hdrMain2 = document.getElementById('hdr-title');
  const hdrGreeting2 = document.getElementById('hdr-greeting');
  /* hdr-title aurora is always-on — don't remove it on logout */
  if (hdrGreeting2) { hdrGreeting2.style.display = 'none'; hdrGreeting2.classList.remove('aurora'); }
  closeHamburger();
  // Сбрасываем ВСЕ экраны
  ['otchet','dohod','grafik','instruktsii','personal','rating','vizity','ceo','analiz','trophies','profile'].forEach(t => {
    const s = document.getElementById('scr-'+t);
    if (s) { s.classList.remove('on'); s.style.display = ''; }
  });
  // Сбрасываем визиты
  S.vizRows = []; S.vizDept = null;
  if (window._loginLiquidCleanup) window._loginLiquidCleanup();
  // Скрываем экран технического обслуживания при выходе
  hideMaintenancePage();
  // Показываем логин
  const ls = document.getElementById('scr-login');
  ls.style.display=''; ls.classList.add('on');
  document.body.classList.add('login-active');
  if (window._loginLiquidInit) window._loginLiquidInit();
  toast('Вы вышли');
}

function tryRestore() {
  const tok = localStorage.getItem('crm_tok');
  const exp = parseInt(localStorage.getItem('crm_exp') || '0');
  const u = localStorage.getItem('crm_user');

  if (tok && exp > Date.now()) {
    S.token = tok;
    tokenExpiresAt = exp;
    if (u) { try { S.user = JSON.parse(u); renderUser(); } catch(e) { localStorage.removeItem('crm_user'); } }
    const remaining = Math.max(Math.floor((exp - Date.now()) / 1000), 0);
    scheduleTokenRefresh(remaining);
    syncFirebaseAuth(tok);
    onLogin();
    return true;
  }

  if (u) {
    localStorage.removeItem('crm_user');
    trySilentRefresh();
    return false;
  }

  return false;
}

function trySilentRefresh() {
  document.getElementById('scr-login').classList.remove('on');
  document.getElementById('scr-login').style.display = 'none'; document.body.classList.remove('login-active');
  const loader = document.createElement('div');
  loader.id = 'silent-loader';
  loader.className = 'loader';
  loader.innerHTML = '<div class="spin"></div><div>Восстановление сессии…</div>';
  document.querySelector('main').prepend(loader);

  tokenClient.requestAccessToken({ prompt: '' });

  const fallback = setTimeout(() => {
    const l = document.getElementById('silent-loader');
    if (l) l.remove();
    if (!S.token) {
      localStorage.removeItem('crm_user');
      showLoginScreen();
    }
  }, 8000);

  window._silentFallback = fallback;
}

// ==================== API LAYER ====================
const _apiInflight = {};   // key → Promise (дедупликация одновременных запросов)
const _apiCache    = {};   // key → {ts, data} (TTL-кеш: не перезапрашиваем в течение TTL)
const API_TTL_MS   = 45_000; // 45 сек — минимальный интервал повторной загрузки одного листа

async function api(sheet, range) {
  const key = sheet + '!' + range;

  // TTL-кеш: если данные свежие — отдаём из кеша без сетевого запроса
  const cached = _apiCache[key];
  if (cached && (Date.now() - cached.ts) < API_TTL_MS) {
    return cached.data;
  }

  // Дедупликация: если уже идёт запрос с тем же ключом — возвращаем тот же Promise
  if (_apiInflight[key]) return _apiInflight[key];

  _apiInflight[key] = _apiFetch(sheet, range, key);
  try {
    const result = await _apiInflight[key];
    return result;
  } finally {
    delete _apiInflight[key];
  }
}

async function _apiFetch(sheet, range, key, retryCount = 0) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}/values/`
            + encodeURIComponent(sheet + '!' + range);

  // Таймаут 12 секунд — fetch не будет висеть бесконечно
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 12000);

  let r;
  try {
    r = await fetch(url, { headers: await authHeaders(), signal: ctrl.signal });
  } catch (err) {
    clearTimeout(tid);
    if (err.isAuthError) { showLoginScreen(); throw new Error('auth'); }
    if (retryCount < 3) {
      // Тихий первый retry; сообщаем только начиная со второй неудачи
      if (retryCount === 1) toast('Связь с Google нестабильна — повторяю…', 'i');
      const jitter = Math.round(Math.random() * 800);
      const wait   = Math.min((retryCount + 1) * 3000 + jitter, 10000);
      await new Promise(res => setTimeout(res, wait));
      return _apiFetch(sheet, range, key, retryCount + 1);
    }
    toast('Не удалось получить данные Google. Проверьте сеть и обновите экран', 'e');
    throw err;
  }
  clearTimeout(tid);

  if (r.status === 429) {
    // Quota exceeded — ждём и повторяем (до 3 раз)
    if (retryCount < 3) {
      const wait = (retryCount + 1) * 8000; // 8s, 16s, 24s
      if (retryCount === 1) toast('Лимит запросов — повтор через ' + (wait/1000) + 'с…', 'i');
      await new Promise(res => setTimeout(res, wait));
      return _apiFetch(sheet, range, key, retryCount + 1);
    }
    toast('Превышен лимит Sheets API — подождите минуту', 'e');
    throw new Error('QUOTA_EXCEEDED');
  }

  if (!r.ok) {
    const e = await r.json();
    const msg = e.error?.message || r.statusText;
    if (r.status === 401 || r.status === 403 || msg.includes('insufficient')) {
      if (retryCount < 3) {
        // Чистим и кеш в памяти, и токен в localStorage — иначе ensureToken
        // вернёт тот же протухший токен и retry снова словит 401
        S.token = null;
        tokenExpiresAt = 0;
        try {
          localStorage.removeItem('crm_tok');
          localStorage.removeItem('crm_exp');
        } catch (e) { /* iOS PWA private mode иногда блокирует */ }
        try {
          await ensureToken();
          return _apiFetch(sheet, range, key, retryCount + 1);
        } catch(authErr) {
          toast('Сессия требует повторного входа', 'e');
        }
      }
      showLoginScreen();
      throw new Error('auth');
    }
    if (r.status === 404) throw new Error('NOT_FOUND');
    // Лист не существует — Sheets API возвращает 400 с «Unable to parse range»
    if (msg && msg.indexOf('Unable to parse range') >= 0) throw new Error('NOT_FOUND');
    throw new Error(msg);
  }

  const data = (await r.json()).values || [];
  _apiCache[key] = { ts: Date.now(), data };
  return data;
}

// Инвалидируем кеш при смене месяца или явном pull-to-refresh
function apiCacheInvalidate(sheetName) {
  if (sheetName) {
    Object.keys(_apiCache).forEach(k => { if (k.startsWith(sheetName + '!')) delete _apiCache[k]; });
  } else {
    Object.keys(_apiCache).forEach(k => delete _apiCache[k]);
  }
}

async function setCurrentMonth(newSuffix) {
  if (newSuffix === currentSuffix) return;
  currentSuffix = newSuffix;
  updateBadge();
  SHEETS = getSheetNames(currentSuffix);
  S.data = { otchet:null, dohod:null, grafik:null, grafikFmt:null, instruktsii:null, d_otchet:null, d_dohod:null, cnvrs:null, stavki:null, d_stavki:null, vizity:null, plan:null, d_vizity:null, vizityFmt:null, d_vizityFmt:null };
  apiCacheInvalidate(); // сбрасываем кеш при смене месяца
  _schedWeek = null;
  // Если выбран будущий месяц — сначала создаём недостающие листы (фон), ПОТОМ грузим вкладку
  try { await ensureFutureMonthSheets(newSuffix); }
  catch (e) { console.warn('ensureFutureMonthSheets:', e); }
  // Определяем активный экран и перезагружаем его данные
  const isActive = id => document.getElementById('scr-'+id)?.classList.contains('on');
  if (isActive('profile'))      { if (typeof renderProfile === 'function') renderProfile(); return; }
  if (isActive('ceo'))          { if (typeof loadCeoDashboard === 'function') loadCeoDashboard(); return; }
  if (isActive('personal'))     { if (typeof goPersonal === 'function') goPersonal(); return; }
  if (isActive('rating'))       { if (typeof loadRating === 'function') loadRating(); return; }
  if (isActive('analiz'))       { if (typeof renderAnaliz === 'function') renderAnaliz(); return; }
  if (isActive('vizity'))       { if (typeof loadTab === 'function') loadTab('vizity'); return; }
  const activeTab = document.querySelector('.tab.on')?.dataset.tab
    || ['otchet','dohod','grafik','instruktsii'].find(t => isActive(t))
    || 'otchet';
  loadTab(activeTab);
}

/**
 * Если newSuffix — будущий месяц (относительно сегодня), и не все «месячные»
 * листы созданы, дублируем их из предыдущего календарного месяца (как
 * заготовку — с пустой/прошлой структурой). Идемпотентно. Бежит фоном.
 */
const FUTURE_SHEET_PREFIXES = [
  'ВИЗИТЫ', 'Д_ВИЗИТЫ', 'ПЛАН', 'ОТЧЁТ', 'Д_ОТЧЁТ',
  'ГРАФИКИ', 'CNVRS', 'СТАВКИ', 'Д_СТАВКИ',
];
// Для каких префиксов после дублирования надо очистить данные (оставив
// заголовок 1-й строки) — это «листы ввода» в которые льётся транзакционная
// инфа за конкретный месяц. Для ПЛАН/СТАВКИ/ГРАФИКИ/ОТЧЁТ/CNVRS дубликат
// остаётся как есть — там либо справочные значения, либо формулы.
const FUTURE_SHEET_CLEAR_DATA = new Set(['ВИЗИТЫ', 'Д_ВИЗИТЫ']);
let _ensureFutureRunning = false;
async function ensureFutureMonthSheets(newSuffix) {
  if (!/^\d{4}$/.test(newSuffix)) return;
  // Только для CEO/ROP
  const me = (typeof findUserInSheet === 'function') ? findUserInSheet() : null;
  if (!me || (typeof isCeoLike === 'function' && !isCeoLike(me.role))) return;

  const now = new Date();
  const curSfx = String(now.getMonth() + 1).padStart(2, '0') + String(now.getFullYear()).slice(-2);
  const yKey = sfx => 2000 + parseInt(sfx.slice(2, 4)) + parseInt(sfx.slice(0, 2)) / 100;
  if (yKey(newSuffix) <= yKey(curSfx)) return;
  if (_ensureFutureRunning) return;
  _ensureFutureRunning = true;
  try {
    // Берём предыдущий календарный месяц как источник
    const mo = parseInt(newSuffix.slice(0, 2));
    const yr = 2000 + parseInt(newSuffix.slice(2, 4));
    const prev = new Date(yr, mo - 2, 1);
    const sourceSuffix = String(prev.getMonth() + 1).padStart(2, '0') + String(prev.getFullYear()).slice(-2);

    // 1) Список существующих листов
    const metaResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}?fields=sheets.properties(sheetId,title)`,
      { headers: await authHeaders() }
    );
    if (!metaResp.ok) throw new Error('meta fetch failed');
    const meta = await metaResp.json();
    const sheets = (meta.sheets || []).map(s => s.properties);
    const titles = new Set(sheets.map(s => s.title));
    const byTitle = Object.fromEntries(sheets.map(s => [s.title, s.sheetId]));

    // 2) Какие листы нужно создать
    const requests = [];
    const created = [];     // [{ prefix, target }]
    for (const prefix of FUTURE_SHEET_PREFIXES) {
      const target = prefix + newSuffix;
      if (titles.has(target)) continue;
      const source = prefix + sourceSuffix;
      const sourceId = byTitle[source];
      if (sourceId == null) continue;
      requests.push({ duplicateSheet: { sourceSheetId: sourceId, newSheetName: target } });
      created.push({ prefix, target });
    }
    if (!requests.length) return;
    toast('Создаю листы на ' + getMonthName(newSuffix) + '…', 'i');
    const dupResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}:batchUpdate`,
      { method: 'POST', headers: await authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ requests }) }
    );
    if (!dupResp.ok) throw new Error('duplicate failed: ' + dupResp.status);
    // Собираем новые sheetId из ответа (нужны для сброса форматирования)
    const dupBody = await dupResp.json().catch(() => ({}));
    const newSheetIds = {};
    (dupBody.replies || []).forEach(rep => {
      const props = rep.duplicateSheet?.properties;
      if (props && props.title) newSheetIds[props.title] = props.sheetId;
    });

    // 3) Для листов «ввода» — чистим данные и сбрасываем формат (фон → белый,
    // текст → чёрный), чтобы не было «шлейфа» от ручных заливок прошлого месяца.
    const toClear = created.filter(c => FUTURE_SHEET_CLEAR_DATA.has(c.prefix));
    if (toClear.length) {
      // 3a) Очистка значений
      try {
        const clearResp = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}/values:batchClear`,
          { method: 'POST', headers: await authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ ranges: toClear.map(c => `'${c.target}'!A2:Z10000`) }) }
        );
        if (!clearResp.ok) console.warn('batchClear failed', clearResp.status);
      } catch (e) { console.warn('batchClear error', e); }
      // 3b) Сброс формата (bg=#fff, text=#000) для строк 2+
      const fmtReqs = toClear.map(c => {
        const sheetId = newSheetIds[c.target];
        if (sheetId == null) return null;
        return {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 0 }, // строки 2..N, все колонки
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1, green: 1, blue: 1 },
                textFormat: { foregroundColor: { red: 0, green: 0, blue: 0 } },
              },
            },
            fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.foregroundColor',
          },
        };
      }).filter(Boolean);
      if (fmtReqs.length) {
        try {
          const fmtResp = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}:batchUpdate`,
            { method: 'POST', headers: await authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ requests: fmtReqs }) }
          );
          if (!fmtResp.ok) console.warn('format reset failed', fmtResp.status);
        } catch (e) { console.warn('format reset error', e); }
      }
    }
    toast('Создано листов: ' + created.length, 's');
    apiCacheInvalidate();
  } catch (e) {
    console.warn('ensureFutureMonthSheets error', e);
  } finally {
    _ensureFutureRunning = false;
  }
}

function goTab(tab) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab===tab));
  showScr(tab);
  loadTab(tab);
}

async function loadTab(tab) {
  const showArchiveMsg = (container, isArchive=true) => {
    if (container) container.innerHTML = `<div class="empty">${isArchive ? 'Информация отсутствует. Данные ушли в архив.' : 'Нет данных'}</div>`;
  };
  if (tab === 'otchet') {
    const el = document.getElementById('c-otchet');
    const needDvizity = (S.reportTab === 'dept' || S.reportTab === 'dozhim') && !S.data.d_vizity;
    const needAnything = !S.data.vizity || !S.data.plan || needDvizity || !S.data.cnvrs;

    if (needAnything) {
      if (el) el.innerHTML = loader();
      try {
        const [vd, pd, dv, cv] = await Promise.all([
          S.data.vizity   ? Promise.resolve(S.data.vizity) : api(SHEETS.vizity, 'A:N').catch(() => []),
          S.data.plan     ? Promise.resolve(S.data.plan)   : api(SHEETS.plan,   'A:D').catch(() => []),
          needDvizity     ? api(SHEETS.d_vizity, 'A:N').catch(() => []) : Promise.resolve(S.data.d_vizity),
          S.data.cnvrs    ? Promise.resolve(S.data.cnvrs)  : api(SHEETS.cnvrs,  'A1:N40').catch(() => []),
        ]);
        S.data.vizity = vd || [];
        if (pd?.length) S.data.plan = pd;
        if (dv !== undefined) S.data.d_vizity = dv || [];
        if (cv?.length) S.data.cnvrs = cv;
      } catch(e) {
        if (e.message === 'auth') return;
        if (!S.data.plan) {
          try { S.data.plan = await api(SHEETS.plan, 'A:D'); }
          catch(e2) { if (el) el.innerHTML = `<div class="err">Ошибка: ${e2.message}</div>`; return; }
        }
        S.data.vizity = S.data.vizity || [];
      }
    }

    renderOtchet();
    return;
  }
  if (tab === 'dohod') {
    const el = document.getElementById('c-dohod');
    if (el && !S.silentRefresh) el.innerHTML = loader();  // показываем сразу при ручном переходе
    const matched = findUserInSheet();
    const role = matched?.role || '';
    const isCeo = isCeoLike(role);
    const isDozhim = role === 'dozhim';

    if (isCeo || !isDozhim) {
      // CEO или CRM — нужны vizity + plan + stavki + grafik
      if (!S.data.vizity || !S.data.plan) {
        if (el) el.innerHTML = loader();
        try {
          const [vd, pd] = await Promise.all([
            S.data.vizity ? Promise.resolve(S.data.vizity) : api(SHEETS.vizity, 'A:N'),
            S.data.plan   ? Promise.resolve(S.data.plan)   : api(SHEETS.plan,   'A:D'),
          ]);
          S.data.vizity = vd; S.data.plan = pd;
        } catch(e) {
          if (e.message!=='auth') {
            if (e.message === 'NOT_FOUND') showArchiveMsg(el);
            else if (el) el.innerHTML = `<div class="err">Ошибка: ${e.message}</div>`;
          }
          return;
        }
      }
      if (!S.data.stavki) {
        try { S.data.stavki = await api(SHEETS.stavki, 'A1:B25'); }
        catch(e) { S.data.stavki = []; }
      }
      if (!S.data.grafik) {
        try { S.data.grafik = await api(SHEETS.grafik, 'A1:AI25'); }
        catch(e) { S.data.grafik = []; }
      }
    }

    if (isDozhim) {
      // ДОЖИМ — нужны d_vizity + plan + grafik
      if (!S.data.d_vizity || !S.data.plan || !S.data.grafik) {
        if (el) el.innerHTML = loader();
        await Promise.all([
          S.data.d_vizity ? Promise.resolve() : api(SHEETS.d_vizity, 'A:N').then(d => S.data.d_vizity = d).catch(() => S.data.d_vizity = []),
          S.data.plan     ? Promise.resolve() : api(SHEETS.plan,     'A:D').then(d => S.data.plan     = d).catch(() => S.data.plan     = []),
          S.data.grafik   ? Promise.resolve() : api(SHEETS.grafik,   'A1:AI25').then(d => S.data.grafik = d).catch(() => S.data.grafik = []),
        ]);
      }
    }

    renderTab('dohod');
    return;
  }
  if (S.data[tab]) { renderTab(tab); return; }
  const el = document.getElementById('c-'+tab);
  if (el) el.innerHTML = loader();
  try {
    if      (tab==='grafik')      S.data.grafik       = await api(SHEETS.grafik,      'A1:AI25');
    else if (tab==='instruktsii') S.data.instruktsii  = await api(SHEETS.instruktsii, 'A1:C200');
    renderTab(tab);
  } catch(e) {
    if (e.message!=='auth') {
      if (e.message === 'NOT_FOUND') showArchiveMsg(el);
      else if (el) el.innerHTML = `<div class="err">Ошибка: ${e.message}</div>`;
    }
  }
}

function reloadCurrent() {
  // Страница Трофеев — сбрасываем кеш каталога и фактов выдачи
  if (document.getElementById('scr-trophies')?.classList.contains('on')) {
    apiCacheInvalidate('TrophyAwards');
    S.trophies = null;
    S.trophyAwards = null;
    _trophiesCatalogPromise = null;
    renderTrophiesPage().then(() => toast('Обновлено','s'));
    return;
  }
  if (document.getElementById('scr-ceo')?.classList.contains('on')) {
    apiCacheInvalidate();
    S.data.vizity = null; S.data.d_vizity = null;
    S.data.plan = null; S.data.cnvrs = null; S.data.stavki = null;
    loadCeoDashboard().then(() => toast('Обновлено','s'));
    return;
  }
  // На странице Отчёта — перезагружаем только журнал визитов
  if (document.getElementById('scr-rating')?.classList.contains('on')) {
    apiCacheInvalidate();
    S.data.vizity=null; S.data.d_vizity=null; S.data.plan=null;
    S.data.stavki=null; S.data.d_stavki=null;
    loadRating().then(() => toast('Обновлено','s'));
    return;
  }
  if (document.getElementById('scr-vizity')?.classList.contains('on')) {
    apiCacheInvalidate(vizSheetName());
    S.vizRows = [];
    loadVizity().then(() => toast('Обновлено','s'));
    return;
  }
  const isPersonal = document.getElementById('scr-personal')?.classList.contains('on');
  if (isPersonal) {
    const matched = findUserInSheet();
    if (matched) {
      const isDozhim = matched.role === 'dozhim';
      if (isDozhim) { apiCacheInvalidate(); S.data.d_vizity = null; S.data.plan = null; }
      else { apiCacheInvalidate(); S.data.vizity = null; S.data.plan = null; S.data.stavki = null; S.data.cnvrs = null; }
      loadPersonal(matched).then(() => toast('Обновлено','s'));
    }
    return;
  }
  const tab = document.querySelector('.tab.on')?.dataset.tab || 'otchet';
  if (tab === 'grafik') _schedWeek = null;
  apiCacheInvalidate(); // полный сброс кеша при ручном обновлении
  S.data[tab] = null;
  if (tab === 'otchet') { S.data.d_vizity = null; S.data.cnvrs = null; S.data.vizity = null; S.data.plan = null; }
  if (tab === 'dohod') { S.data.vizity = null; S.data.plan = null; S.data.stavki = null; S.data.d_dohod = null; }
  loadTab(tab).then(() => toast('Обновлено','s'));
}

function renderTab(tab) {
  if      (tab==='otchet')      renderOtchet();
  else if (tab==='dohod')       renderDohod();
  else if (tab==='grafik')      renderGrafik();
  else if (tab==='instruktsii') renderInstruktsii();
}

// Поцифровая анимация: только изменившиеся позиции перелистываются
const DIGIT_STAGGER  = 200;  // мс между цифрами
const DIGIT_DURATION = 320;  // мс на одно движение

// Тест в консоли: _testDigitAnim() — прибавляет 1 ко всем видимым числовым значениям
window._testDigitAnim = function() {
  S.silentRefresh = true;
  document.querySelectorAll('.dc-val,.kb-val,.mv,.mc-v,.speedo-value,.speedo-visits').forEach(el => {
    const t = el.firstChild;
    if (!t || t.nodeType !== Node.TEXT_NODE) return;
    const v = t.nodeValue.trim();
    const n = parseInt(v.replace(/\s/g, ''), 10);
    if (isNaN(n)) return;
    const next = String(n + 1).padStart(v.replace(/\s/g,'').length, '0');
    liveTextUpdate(t, next);
  });
  setTimeout(() => { S.silentRefresh = false; }, 500);
};

function slideDigits(parent, node, oldText, nextText, changedPos) {
  // Каждый символ — слот с overflow:hidden + старый/новый символ внутри
  const chars = [...oldText];
  const slots = chars.map((ch) => {
    const slot   = document.createElement('span');
    slot.className = 'digit-slot';
    // Спейсер (невидимый) держит ширину слота
    const spacer = document.createElement('span');
    spacer.className = 'digit-spacer';
    spacer.textContent = ch;
    // Текущий символ — виден, будет анимирован
    const cur = document.createElement('span');
    cur.className = 'digit-cur';
    cur.textContent = ch;
    slot.appendChild(spacer);
    slot.appendChild(cur);
    return { slot, spacer, cur };
  });

  while (parent.firstChild) parent.removeChild(parent.firstChild);
  slots.forEach(({ slot }) => parent.appendChild(slot));

  const token = {};
  parent._slideToken = token;

  // Единицы первые (справа налево: rightmost index = единицы)
  const ordered = [...changedPos].sort((a, b) => b - a);
  ordered.forEach((pos, j) => {
    const { slot, spacer, cur } = slots[pos];
    const newCh = nextText[pos];
    setTimeout(() => {
      if (!slot.isConnected) return;
      spacer.textContent = newCh;                         // обновляем ширину слота
      cur.style.animation = `digitOut ${DIGIT_DURATION}ms ease-in forwards`;
      const nxt = document.createElement('span');
      nxt.className = 'digit-nxt';
      nxt.textContent = newCh;
      nxt.style.animation = `digitIn ${DIGIT_DURATION}ms ease-out forwards`;
      slot.appendChild(nxt);
    }, j * DIGIT_STAGGER);
  });

  // После всех анимаций — восстанавливаем текстовый узел
  const done = (ordered.length - 1) * DIGIT_STAGGER + DIGIT_DURATION + 80;
  setTimeout(() => {
    if (!parent.isConnected || parent._slideToken !== token) return;
    const isOurs = [...parent.childNodes].every(n => n.classList?.contains('digit-slot'));
    if (isOurs) { node.nodeValue = nextText; parent.replaceChildren(node); }
    parent._slideToken = null;
  }, done);
}

function liveTextUpdate(node, nextText) {
  if (node.nodeValue === nextText) return;
  const parent = node.parentElement;
  if (!parent || !S.silentRefresh) { node.nodeValue = nextText; return; }

  const oldText = node.nodeValue;
  parent._slideToken = null;
  parent.classList.remove('digit-fold-el', 'digit-unfold-el');

  // Поцифровое скольжение — только когда длина одинакова
  if (oldText.length === nextText.length) {
    const changed = [];
    for (let i = 0; i < oldText.length; i++) {
      if (oldText[i] !== nextText[i]) changed.push(i);
    }
    if (changed.length > 0) { slideDigits(parent, node, oldText, nextText, changed); return; }
  }

  // Фолбэк (длина изменилась: "9"→"10", "—"→"7" и т.п.): весь элемент
  void parent.offsetWidth;
  parent.classList.add('digit-fold-el');
  setTimeout(() => {
    node.nodeValue = nextText;
    parent.classList.remove('digit-fold-el');
    void parent.offsetWidth;
    parent.classList.add('digit-unfold-el');
    parent.addEventListener('animationend', () => parent.classList.remove('digit-unfold-el'), { once: true });
  }, 300);
}

const ANIMATED_VALUE_SELECTOR = [
  '.kb-val', '.zv', '.mv', '.dc-val', '.dc-sn', '.rating-sum-val', '.rating-card-pct',
  '.rating-card-prog', '.ic-val', '.ib-val', '.ist-val', '.mc-v', '.vis-card-total-value',
  '.speedo-value', '.speedo-conv', '.speedo-visits'
].join(',');

function isPlanValueElement(el) {
  const labelSelectors = '.kb-lbl,.ml,.dc-lbl,.mc-l,.rating-sum-lbl';
  const containers = '.kpi-badge,.mm,.m4,.dept-cell,.modal-cell,.rating-sum-cell';
  const container = el.closest(containers);
  const label = container?.querySelector(labelSelectors);
  return String(label?.textContent || '').trim().toLowerCase() === 'план';
}

function parseAnimatedNumber(text) {
  const raw = String(text || '').trim();
  if (!raw || raw === '—' || raw.includes('/')) return null;
  const matches = raw.match(/-?\d[\d\s]*(?:[.,]\d+)?/g);
  if (!matches || matches.length !== 1) return null;
  const token = matches[0];
  const normalized = token.replace(/\s/g, '').replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const decimals = (token.match(/[.,](\d+)/)?.[1] || '').length;
  return {
    raw,
    token,
    value,
    decimals,
    prefix: raw.slice(0, raw.indexOf(token)),
    suffix: raw.slice(raw.indexOf(token) + token.length),
    grouped: /\d\s+\d/.test(token),
  };
}

function formatAnimatedNumber(value, meta) {
  const fixed = Math.max(0, meta.decimals || 0);
  let out = Number(value).toFixed(fixed);
  if (meta.grouped) {
    const [intPart, decPart] = out.split('.');
    out = Number(intPart).toLocaleString('ru-RU') + (decPart ? ',' + decPart : '');
  } else if (meta.decimals && meta.token.includes(',')) {
    out = out.replace('.', ',');
  }
  return meta.prefix + out + meta.suffix;
}

function springCountValue(el, meta) {
  const prevTarget = Number(el.dataset.countTarget);
  const fromCurrent = parseAnimatedNumber(el.textContent);
  const preparedStart = el.dataset.countStart;
  const start = preparedStart != null
    ? Number(preparedStart)
    : (Number.isFinite(prevTarget) && fromCurrent ? fromCurrent.value : 0);
  delete el.dataset.countStart;
  if (preparedStart == null && Number.isFinite(prevTarget) && Math.abs(prevTarget - meta.value) < 0.0001 && el.dataset.countRaw === meta.raw) return;

  el.dataset.countTarget = String(meta.value);
  el.dataset.countRaw = meta.raw;
  el.classList.add('value-counting');

  let current = start;
  let velocity = 0;
  let last = performance.now();
  let frames = 0;
  const stiffness = 200;
  const damping = 50;
  const mass = 1;

  function tick(now) {
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    frames++;
    const force = -stiffness * (current - meta.value);
    const damp = -damping * velocity;
    const accel = (force + damp) / mass;
    velocity += accel * dt;
    current += velocity * dt;
    const done = frames > 12 && Math.abs(current - meta.value) < 0.01 && Math.abs(velocity) < 0.01;
    el.textContent = done ? meta.raw : formatAnimatedNumber(current, meta);
    if (!done) {
      requestAnimationFrame(tick);
    } else {
      el.classList.remove('value-counting');
    }
  }

  el.textContent = formatAnimatedNumber(start, meta);
  requestAnimationFrame(tick);
}

function animateDynamicValues(root = document) {
  const scope = root instanceof Element || root === document ? root : document;
  scope.querySelectorAll(ANIMATED_VALUE_SELECTOR).forEach(el => {
    if (el.closest('.vt-row-card, .vt-picker-modal')) return;
    if (isPlanValueElement(el)) return;
    const meta = parseAnimatedNumber(el.textContent);
    if (!meta) return;
    springCountValue(el, meta);
  });
}

function prepareDynamicValues(root = document) {
  const scope = root instanceof Element || root === document ? root : document;
  const prepared = [];
  scope.querySelectorAll(ANIMATED_VALUE_SELECTOR).forEach(el => {
    if (el.closest('.vt-row-card, .vt-picker-modal')) return;
    if (isPlanValueElement(el)) return;
    const meta = parseAnimatedNumber(el.textContent);
    if (!meta) return;
    el.dataset.countStart = '0';
    el.textContent = formatAnimatedNumber(0, meta);
    prepared.push([el, meta]);
  });
  return prepared;
}

function isAnimationRootVisible(root) {
  if (!root || root === document || root === document.body) return true;
  // Модалки/оверлеи — видны если открыты
  const overlay = root.closest('[id$="-overlay"],[class*="overlay"]');
  if (overlay) return overlay.classList.contains('open');
  // Вкладки — видны если их родительский scr имеет класс on
  const scr = root.closest('[id^="scr-"]');
  if (scr) return scr.classList.contains('on');
  return true; // не в специальном контейнере — считаем видимым
}

// force=true — первый рендер на пустом контейнере (переход на вкладку),
// запускает spring даже во время silentRefresh.
// force=false (default) — тихий рефреш видимого контента, spring не запускается.
function scheduleAnimatedValues(root = document, force = false) {
  if (!S.authReady) return;
  // Тихий фоновый рефреш + не первый рендер → morph сам обновит через liveValueTick
  if (S.silentRefresh && !force) return;
  const prepared = prepareDynamicValues(root);
  if (!prepared.length) return;
  const visible = isAnimationRootVisible(root instanceof Element ? root : document.body);
  if (!visible) {
    // Экран не виден — сохраняем цель, запустим при переходе
    prepared.forEach(([el, meta]) => { el.dataset.countPending = meta.raw; });
    return;
  }
  requestAnimationFrame(() => {
    prepared.forEach(([el, meta]) => { if (el.isConnected) springCountValue(el, meta); });
  });
}

function flushPendingAnimations(scr) {
  if (!scr) return;
  scr.querySelectorAll('[data-count-pending]').forEach(el => {
    const raw = el.dataset.countPending;
    delete el.dataset.countPending;
    const meta = parseAnimatedNumber(raw);
    if (meta && el.isConnected) springCountValue(el, meta);
  });
}

function canMorphElement(a, b) {
  if (!a || !b || a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== Node.ELEMENT_NODE) return true;
  if (a.tagName !== b.tagName) return false;
  const stableA = a.id || a.getAttribute('data-live-key') || '';
  const stableB = b.id || b.getAttribute('data-live-key') || '';
  if (stableA || stableB) return stableA === stableB;
  return a.className === b.className;
}

function syncAttributes(cur, next) {
  [...cur.attributes].forEach(attr => {
    if (!next.hasAttribute(attr.name)) cur.removeAttribute(attr.name);
  });
  [...next.attributes].forEach(attr => {
    if (cur.getAttribute(attr.name) !== attr.value) cur.setAttribute(attr.name, attr.value);
  });
}

function morphLiveNode(cur, next) {
  if (cur.nodeType === Node.TEXT_NODE && next.nodeType === Node.TEXT_NODE) {
    liveTextUpdate(cur, next.nodeValue);
    return;
  }
  if (!canMorphElement(cur, next)) {
    cur.replaceWith(next.cloneNode(true));
    return;
  }
  if (cur.nodeType !== Node.ELEMENT_NODE) return;
  syncAttributes(cur, next);
  const curChildren = [...cur.childNodes];
  const nextChildren = [...next.childNodes];
  if (curChildren.length !== nextChildren.length) {
    cur._slideToken = null; // отменяем анимацию если структура поменялась
    cur.replaceChildren(...nextChildren.map(ch => ch.cloneNode(true)));
    return;
  }
  for (let i = 0; i < nextChildren.length; i++) {
    morphLiveNode(curChildren[i], nextChildren[i]);
  }
}

function setLiveHTML(el, html) {
  if (!el) return;
  if (!S.silentRefresh || !el.children.length) {
    // firstRender = true если контейнер пустой ИЛИ показывал лоадер (Синхронизация…)
    // В обоих случаях анимация spring должна стартовать с нуля
    const wasLoader = !!el.querySelector('.loader');
    const firstRender = !el.children.length || wasLoader;
    el.innerHTML = html;
    // force=true только при первом рендере (пустой контейнер → переход на вкладку)
    scheduleAnimatedValues(el, firstRender);
    return;
  }
  // Тихий рефреш с существующим контентом → morph, liveValueTick, без spring
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  const curChildren = [...el.childNodes];
  const nextChildren = [...tpl.content.childNodes];
  if (curChildren.length !== nextChildren.length) {
    el.replaceChildren(...nextChildren.map(ch => ch.cloneNode(true)));
    // структура изменилась, но это silentRefresh — spring не нужен
    return;
  }
  for (let i = 0; i < nextChildren.length; i++) {
    morphLiveNode(curChildren[i], nextChildren[i]);
  }
  // morph обновил текст через liveValueTick — spring не запускаем
}

async function refreshVisibleDataLive() {
  if (document.getElementById('scr-vizity')?.classList.contains('on')) return;
  if (document.getElementById('scr-ceo')?.classList.contains('on')) {
    apiCacheInvalidate();
    S.silentRefresh = true;
    try {
      const [vd, dv, pd, cv, sd] = await Promise.all([
        api(SHEETS.vizity,   'A:N').catch(() => []),
        api(SHEETS.d_vizity, 'A:N').catch(() => []),
        api(SHEETS.plan,     'A:D').catch(() => []),
        api(SHEETS.cnvrs,    'A1:N40').catch(() => []),
        api(SHEETS.stavki,   'A1:B25').catch(() => []),
      ]);
      if (vd?.length)  S.data.vizity   = vd;
      if (dv?.length)  S.data.d_vizity = dv;
      if (pd?.length)  S.data.plan     = pd;
      if (cv?.length)  S.data.cnvrs    = cv;
      if (sd?.length)  S.data.stavki   = sd;
      renderCeoDashboard();
    } finally { S.silentRefresh = false; }
    return;
  }
  const personalOn = document.getElementById('scr-personal')?.classList.contains('on');
  const ratingOn = document.getElementById('scr-rating')?.classList.contains('on');
  const activeTab = ratingOn ? 'rating' : (document.querySelector('.tab.on')?.dataset.tab || (personalOn ? null : 'otchet'));
  const matched = findUserInSheet();
  const role = matched?.role || '';

  apiCacheInvalidate();
  S.silentRefresh = true;
  try {
    if (personalOn) {
      if (!matched) return;
      if (role === 'dozhim') {
        const [dv, pd, gr] = await Promise.all([
          api(SHEETS.d_vizity, 'A:N').catch(() => []),
          api(SHEETS.plan, 'A:D').catch(() => []),
          api(SHEETS.grafik, 'A1:AI25').catch(() => []),
        ]);
        S.data.d_vizity = dv; S.data.plan = pd; S.data.grafik = gr;
      } else {
        const [vd, pd, st, cn, gr] = await Promise.all([
          api(SHEETS.vizity, 'A:N').catch(() => []),
          api(SHEETS.plan, 'A:D').catch(() => []),
          api(SHEETS.stavki, 'A1:B25').catch(() => []),
          api(SHEETS.cnvrs, 'A1:N40').catch(() => []),
          api(SHEETS.grafik, 'A1:AI25').catch(() => []),
        ]);
        S.data.vizity = vd; S.data.plan = pd; S.data.stavki = st; S.data.cnvrs = cn; S.data.grafik = gr;
      }
      renderPersonal(matched);
      return;
    }

    if (activeTab === 'otchet') {
      const tasks = [
        api(SHEETS.vizity, 'A:N').catch(() => []),
        api(SHEETS.plan, 'A:D').catch(() => []),
        api(SHEETS.cnvrs, 'A1:N40').catch(() => []),
      ];
      if (S.reportTab === 'dozhim' || S.reportTab === 'dept') tasks.push(api(SHEETS.d_vizity, 'A:N').catch(() => []));
      const [vd, pd, cn, dv] = await Promise.all(tasks);
      S.data.vizity = vd; S.data.plan = pd; S.data.cnvrs = cn;
      if (dv) S.data.d_vizity = dv;
      renderOtchet();
    } else if (activeTab === 'dohod') {
      const isCeo = isCeoLike(role);
      const isDozhim = role === 'dozhim' || (isCeo && S.dohodTab === 'dozhim');
      if (isDozhim) {
        const [dv, pd, gr] = await Promise.all([
          api(SHEETS.d_vizity, 'A:N').catch(() => []),
          api(SHEETS.plan, 'A:D').catch(() => []),
          api(SHEETS.grafik, 'A1:AI25').catch(() => []),
        ]);
        S.data.d_vizity = dv; S.data.plan = pd; S.data.grafik = gr;
      } else {
        const [vd, pd, st, gr] = await Promise.all([
          api(SHEETS.vizity, 'A:N').catch(() => []),
          api(SHEETS.plan, 'A:D').catch(() => []),
          api(SHEETS.stavki, 'A1:B25').catch(() => []),
          api(SHEETS.grafik, 'A1:AI25').catch(() => []),
        ]);
        S.data.vizity = vd; S.data.plan = pd; S.data.stavki = st; S.data.grafik = gr;
      }
      renderDohod();
    } else if (activeTab === 'rating') {
      const isDozhimRating = S.ratingDept === 'dozhim';
      const [pd, vd, st] = await Promise.all([
        api(SHEETS.plan, 'A:D').catch(() => []),
        api(isDozhimRating ? SHEETS.d_vizity : SHEETS.vizity, 'A:N').catch(() => []),
        isDozhimRating ? api(SHEETS.d_stavki, 'A1:B25').catch(() => []) : Promise.resolve(S.data.stavki || []),
      ]);
      S.data.plan = pd;
      if (isDozhimRating) { S.data.d_vizity = vd; S.data.d_stavki = st; }
      else S.data.vizity = vd;
      renderRating();
    } else if (activeTab === 'grafik') {
      S.data.grafik = await api(SHEETS.grafik, 'A1:AI25').catch(() => []);
      renderGrafik();
    }
  } finally {
    S.silentRefresh = false;
  }
}

// ==================== HELPER: дни в месяце / отработанные дни ====================
function getDaysInMonth(suffix) {
  const mm = parseInt(suffix.slice(0,2));
  const yy = 2000 + parseInt(suffix.slice(2,4));
  return new Date(yy, mm, 0).getDate();
}
function getWorkedDays(suffix) {
  const mm = parseInt(suffix.slice(0,2));
  const yy = 2000 + parseInt(suffix.slice(2,4));
  const now = new Date();
  const isCurrent = (now.getFullYear() === yy && now.getMonth()+1 === mm);
  const daysInMonth = getDaysInMonth(suffix);
  if (!isCurrent) return daysInMonth;
  const today = now.getDate();
  return Math.min(today, daysInMonth);
}

function computeFactPct(allV, plan) {
  if (!plan || plan <= 0) return 0;
  return Math.round(allV / plan * 100);
}

function computeProgPct(allV, plan, suffix) {
  if (!plan || plan <= 0) return 0;
  const worked = getWorkedDays(suffix);
  const total  = getDaysInMonth(suffix);
  if (worked <= 0) return 0;
  return Math.round(allV / plan * total / worked * 100);
}

function getManagerShiftCounts(name, suffix) {
  const raw = S.data.grafik;
  if (!raw || raw.length < 3) return null;
  const mm = parseInt(suffix.slice(0,2));
  const yy = 2000 + parseInt(suffix.slice(2,4));
  const nameLow = (name||'').toLowerCase().trim();
  const idx = buildSchedIndex(raw);
  const entry = idx[nameLow];
  if (!entry) return null;
  const { row: mgrRow, daysRow } = entry;
  const now = new Date();
  const isCurrent = (now.getFullYear() === yy && now.getMonth()+1 === mm);
  const today = isCurrent ? now.getDate() : 0;
  let total = 0, remaining = 0;
  for (let c = 1; c < daysRow.length; c++) {
    const dayNum = parseInt(daysRow[c]);
    if (!dayNum || dayNum < 1 || dayNum > 31) continue;
    if (normalizeSchedVal(mgrRow[c]) === 'Р') {
      total++;
      if (!isCurrent || dayNum > today) remaining++;
    }
  }
  return { total, remaining };
}

function computeDailyPlan(plan, fact, progNum, suffix, name) {
  const shifts = name ? getManagerShiftCounts(name, suffix) : null;
  if (shifts && shifts.total > 0) {
    const daysInMonth = getDaysInMonth(suffix);
    const worked = getWorkedDays(suffix);
    if (worked < daysInMonth && progNum < 100) {
      if (shifts.remaining <= 0) return shifts.total > 0 ? Math.ceil(plan / shifts.total) : '—';
      const need = plan - fact;
      if (need <= 0) return 0;
      return Math.ceil(need / shifts.remaining);
    }
    return shifts.total > 0 ? Math.ceil(plan / shifts.total) : '—';
  }
  const daysInMonth = getDaysInMonth(suffix);
  const worked = getWorkedDays(suffix);
  if (worked < daysInMonth && progNum < 100) {
    const remainingDays = daysInMonth - worked;
    if (remainingDays <= 0) return Math.ceil(plan / daysInMonth);
    const need = plan - fact;
    if (need <= 0) return 0;
    return Math.ceil(need / remainingDays);
  }
  return Math.ceil(plan / daysInMonth);
}

// ==================== RENDER OTCHET ====================
// ==================== CRM STATS FROM ВИЗИТЫ ====================
// Фильтр сверки применяется только там, где он явно нужен: сверка и расчёт дохода.
function isSverkaRow(row, sverkaOnly = false) {
  if (!sverkaOnly || !S || !S.sverkaMode) return true;
  const sverka = (row[13]||'').trim().toLowerCase();
  return sverka === 'да' || sverka === 'yes';
}

// Строит агрегат по каждому менеджеру из листа ВИЗИТЫ
function buildCrmStats(vizData, opts = {}) {
  const mgrs = {};
  if (!vizData || vizData.length < 2) return mgrs;
  const sverkaOnly = !!opts.sverkaOnly;

  const BUY_KREDIT  = 'покупка (кредит)';
  const BUY_NAL     = 'покупка (наличные)';
  const BUY_OBMEN   = 'обмен';
  const BUY_VYKUP   = 'выкуп';
  const BUY_KOM     = 'комиссия';
  const ST_SALON    = 'в салоне';
  const ST_KSO1     = 'в работе ксо';
  const ST_KSO2     = 'на рассмотрении банка';
  const ST_KSO3     = 'подает заявку';
  const ST_FSSП     = 'фссп не подаем';
  const ST_OTKAZ    = 'отказ';
  const ST_ODOB_NK  = 'одобрено банком, но не купил';
  const CAT800      = 'кат 800';
  const CAT1200     = 'кат 1200';

  function emptyCity(city) {
    return {
      city,
      vis:0, kred:0, nal:0, obmen:0, vykup:0, kom:0,
      otkaz:0, fssp:0, odobNeKupil:0,
    };
  }

  for (let i = 1; i < vizData.length; i++) {
    const row = vizData[i];
    if (!row || !row[8]) continue;
    if (!isSverkaRow(row, sverkaOnly)) continue;
    const mgr  = String(row[8]).trim();
    const mgrL = mgr.toLowerCase();
    if (!mgr) continue;

    if (!mgrs[mgrL]) {
      mgrs[mgrL] = {
        name: mgr,
        vis:0,             // общее число всех строк менеджера — соответствует хронологии
        vis800:0, vis1200:0,
        kred800:0, nal800:0, obmen800:0, vykup800:0, kom800:0,
        kred1200:0, nal1200:0, obmen1200:0, vykup1200:0, kom1200:0,
        zadatok:0,
        vsalone:0, vkso:0, vfssп:0, vbanke:0, otkaz:0, odobNeKupil:0,
        byCity: {},
      };
    }
    const m   = mgrs[mgrL];
    const cat = String(row[6]||'').trim().toLowerCase();  // col G = категория
    const st  = String(row[4]||'').trim().toLowerCase();  // col E = способ/статус
    const city = String(row[3]||'').trim() || '—';        // col D = город
    const zadSum = parseFloat(String(row[9]||'0').replace(/[^\d.]/g,'')) || 0; // col J

    m.vis++;  // считаем КАЖДУЮ строку менеджера, как хронология
    if (cat === CAT800)  m.vis800++;
    if (cat === CAT1200) m.vis1200++;

    if (cat === CAT800) {
      if (st === BUY_KREDIT) m.kred800++;
      if (st === BUY_NAL)    m.nal800++;
      if (st === BUY_OBMEN)  m.obmen800++;
      if (st === BUY_VYKUP)  m.vykup800++;
      if (st === BUY_KOM)    m.kom800++;
    }
    if (cat === CAT1200) {
      if (st === BUY_KREDIT) m.kred1200++;
      if (st === BUY_NAL)    m.nal1200++;
      if (st === BUY_OBMEN)  m.obmen1200++;
      if (st === BUY_VYKUP)  m.vykup1200++;
      if (st === BUY_KOM)    m.kom1200++;
    }
    if (zadSum > 1000) m.zadatok++;

    if (st === ST_SALON)  m.vsalone++;
    if (st === ST_KSO1 || st === ST_KSO2 || st === ST_KSO3) m.vkso++;
    if (st === ST_FSSП)   m.vfssп++;
    if (st === ST_OTKAZ)  m.otkaz++;
    if (st === ST_ODOB_NK) m.odobNeKupil++;

    // По городам (только кат 800 + 1200 — все визиты этого менеджера)
    if (cat === CAT800 || cat === CAT1200) {
      if (!m.byCity[city]) m.byCity[city] = emptyCity(city);
      const c = m.byCity[city];
      c.vis++;
      if (st === BUY_KREDIT) c.kred++;
      else if (st === BUY_NAL)    c.nal++;
      else if (st === BUY_OBMEN)  c.obmen++;
      else if (st === BUY_VYKUP)  c.vykup++;
      else if (st === BUY_KOM)    c.kom++;
      else if (st === ST_OTKAZ)   c.otkaz++;
      else if (st === ST_FSSП)    c.fssp++;
      else if (st === ST_ODOB_NK) c.odobNeKupil++;
    }
  }
  return mgrs;
}

// Возвращает Map: nameLow → plan (число) из листа ПЛАН
// ==================== DOZHIM STATS FROM Д_ВИЗИТЫ ====================
// Столбцы (0-based): A=дата, B=ФИО, C=телефон, D=город, E=комментарий,
//   F=источник, G=категория, H=способ покупки, I=менеджер, J=задаток, K=авто, L=сверка
// Категории: кат 800, кат 1000
function buildDozhimStats(dVizData, opts = {}) {
  const mgrs = {};
  if (!dVizData || dVizData.length < 2) return mgrs;
  const sverkaOnly = !!opts.sverkaOnly;

  const BUY_KREDIT = 'покупка (кредит)';
  const BUY_NAL    = 'покупка (наличные)';
  const BUY_OBMEN  = 'обмен';
  const BUY_KOM    = 'комиссия';
  const CAT800     = 'кат 800';
  const CAT1000    = 'кат 1000';

  for (let i = 1; i < dVizData.length; i++) {
    const row = dVizData[i];
    if (!row || !row[8]) continue;
    if (!isSverkaRow(row, sverkaOnly)) continue;
    const mgr  = String(row[8]).trim();
    const mgrL = mgr.toLowerCase();
    if (!mgr) continue;

    if (!mgrs[mgrL]) {
      mgrs[mgrL] = {
        name: mgr,
        vis:0,             // общее число строк менеджера — для единообразия с хронологией
        vis800:0, vis1000:0,
        kred800:0, nal800:0, obmen800:0, kom800:0,
        kred1000:0, nal1000:0, kom1000:0,
        zadatok:0,
      };
    }
    const m   = mgrs[mgrL];
    const cat = String(row[6]||'').trim().toLowerCase(); // col G = категория
    const st  = String(row[4]||'').trim().toLowerCase(); // col E = комментарий (итоговый статус сделки)
    const zadSum = parseFloat(String(row[9]||'0').replace(/[^\d.]/g,'')) || 0; // col J
    m.vis++; // каждая строка менеджера, как хронология

    if (cat === CAT800)  m.vis800++;
    if (cat === CAT1000) m.vis1000++;

    if (cat === CAT800) {
      if (st === BUY_KREDIT) m.kred800++;
      if (st === BUY_NAL)    m.nal800++;
      if (st === BUY_OBMEN)  m.obmen800++;
      if (st === BUY_KOM)    m.kom800++;
    }
    if (cat === CAT1000) {
      if (st === BUY_KREDIT) m.kred1000++;
      if (st === BUY_NAL)    m.nal1000++;
      if (st === BUY_KOM)    m.kom1000++;
    }
    if (zadSum >= 1000) m.zadatok++;
  }
  return mgrs;
}

// ==================== DOZHIM SALARY FROM Д_ВИЗИТЫ ====================
// Фиксированные ставки (не зависят от листа Д_СТАВКИ)
const DOZHIM_RATES = {
  baseOklad: 15000,
  r800Vis: 800, r800Kred: 3000, r800Nal: 2000, r800Obmen: 2000, r800Kom: 2000,
  r1000Vis: 1000, r1000Kred: 7000, r1000Nal: 7000, r1000Kom: 3000,
  rZadatok: 1000,
};

function calcSalaryDozhimFromVizity(nameLow) {
  const dVizData = S.data.d_vizity || [];
  const allStats = buildDozhimStats(dVizData, { sverkaOnly: true });
  const mgrStat  = allStats[nameLow];
  if (!mgrStat) return null;

  const R = DOZHIM_RATES;
  const schedInfo = getWorkedAndTotalR(nameLow);
  const oklad = (schedInfo && schedInfo.totalR > 0)
    ? Math.round(R.baseOklad / schedInfo.totalR * schedInfo.workedR)
    : R.baseOklad;

  const ch800 = { vis: mgrStat.vis800, kred: mgrStat.kred800, nal: mgrStat.nal800, obmen: mgrStat.obmen800, kom: mgrStat.kom800, zadatok: mgrStat.zadatok };
  const ch1000 = { vis: mgrStat.vis1000, kred: mgrStat.kred1000, nal: mgrStat.nal1000, kom: mgrStat.kom1000 };

  const pure800  = Math.max(0, ch800.vis  - ch800.kred  - ch800.nal  - ch800.obmen - ch800.kom);
  const pure1000 = Math.max(0, ch1000.vis - ch1000.kred - ch1000.nal - ch1000.kom);

  const earn800  = pure800*R.r800Vis  + ch800.kred*R.r800Kred  + ch800.nal*R.r800Nal  + ch800.obmen*R.r800Obmen  + ch800.kom*R.r800Kom  + ch800.zadatok*R.rZadatok;
  const earn1000 = pure1000*R.r1000Vis + ch1000.kred*R.r1000Kred + ch1000.nal*R.r1000Nal + ch1000.kom*R.r1000Kom;

  // Котёл — суммируем тех кто не в ПЛАН (dozhim-менеджеры)
  const planM = getPlanMap(S.data.plan || []);
  const planNamesLow = new Set(Object.keys(planM).filter(nl => getRoleByName(nl) === 'dozhim'));
  let kotelEarn800 = 0, kotelEarn1000 = 0;
  Object.values(allStats).forEach(s => {
    if (!planNamesLow.has(s.name.toLowerCase())) {
      const p8  = Math.max(0, s.vis800  - s.kred800  - s.nal800  - s.obmen800 - s.kom800);
      const p10 = Math.max(0, s.vis1000 - s.kred1000 - s.nal1000 - s.kom1000);
      kotelEarn800  += p8*R.r800Vis  + s.kred800*R.r800Kred  + s.nal800*R.r800Nal  + s.obmen800*R.r800Obmen  + s.kom800*R.r800Kom  + s.zadatok*R.rZadatok;
      kotelEarn1000 += p10*R.r1000Vis + s.kred1000*R.r1000Kred + s.nal1000*R.r1000Nal + s.kom1000*R.r1000Kom;
    }
  });
  const kotelTotal = kotelEarn800 + kotelEarn1000;
  const fundCount  = getFundCount('dozhim');
  const inFund     = isInFund(nameLow, 'dozhim');
  const kotelShare = (inFund && fundCount > 0) ? kotelTotal / fundCount : 0;

  const premium   = earn800 + earn1000 + kotelShare;
  const totalFact = oklad + premium;  // без коэффициента

  const planVal = planM[nameLow] || 0;
  const allVis  = ch800.vis + ch1000.vis;
  const pctFact = computeFactPct(allVis, planVal || 1);
  const pctProg = computeProgPct(allVis, planVal || 1, currentSuffix);

  return {
    fact:    { total: totalFact, koef: null, pct: pctFact, premium },
    prognoz: { total: totalFact, koef: null, pct: pctProg, premium }, // прогноз = факт (нет коэфа)
    detail: {
      oklad, baseOklad: R.baseOklad,
      workedR: schedInfo ? schedInfo.workedR : null,
      totalR:  schedInfo ? schedInfo.totalR  : null,
      inFund, premium, kotel: kotelShare, kotelTotal, fundCount,
      ch800, ch1000, earn800, earn1000,
    },
  };
}

function getPlanMap(planData) {
  const map = {};
  if (!planData) return map;
  for (let i = 1; i < planData.length; i++) {
    const row = planData[i];
    if (!row || !row[0]) continue;
    const name = String(row[0]).trim().toLowerCase();
    const plan = parseFloat(String(row[1]||'0').replace(/[^\d.]/g,'')) || 0;
    if (name) map[name] = plan;
  }
  return map;
}
// Читает колонку D (индекс 3) — план продажи для дожима
function getDSalesPlanMap(planData) {
  const map = {};
  if (!planData) return map;
  for (let i = 1; i < planData.length; i++) {
    const row = planData[i];
    if (!row || !row[0]) continue;
    const name = String(row[0]).trim().toLowerCase();
    const plan = parseFloat(String(row[3]||'0').replace(/[^\d.]/g,'')) || 0;
    if (name) map[name] = plan;
  }
  return map;
}

// Глобальная функция иконок мессенджеров по имени менеджера
function maxIconSvg(size) {
  const path = "M508.211 878.328c-75.007 0-109.864-10.95-170.453-54.75-38.325 49.275-159.686 87.783-164.979 21.9 0-49.456-10.95-91.248-23.36-136.873-14.782-56.21-31.572-118.807-31.572-209.508 0-216.626 177.754-379.597 388.357-379.597 210.786 0 375.947 171.001 375.947 381.604.707 207.347-166.595 376.118-373.94 377.224m3.103-571.585c-102.564-5.292-182.499 65.7-200.201 177.024-14.6 92.162 11.315 204.398 33.397 210.238 10.585 2.555 37.23-18.98 53.837-35.587a189.8 189.8 0 0 0 92.71 33.032c106.273 5.112 197.08-75.794 204.215-181.95 4.154-106.382-77.67-196.486-183.958-202.574z";
  return `<svg width="${size}" height="${size}" viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg"><circle class="max-circle" cx="500" cy="500" r="500"/><path fill="#fff" fill-rule="evenodd" d="${path}" clip-rule="evenodd"/></svg>`;
}

// Аватар: ID берётся из USER столбец G (row[6]), эмоция — от прогноза выполнения плана
function getMgrCrmId(name) {
  if (!S.usersData || !name) return null;
  const nl = String(name).toLowerCase().trim();
  for (let i = 1; i < S.usersData.length; i++) {
    const row = S.usersData[i];
    if ((row[1]||'').toLowerCase().trim() === nl) {
      const id = String(row[6]||'').trim();
      return id || null;
    }
  }
  return null;
}
function getMgrAvatarEmotion(progNum) {
  const n = (typeof progNum === 'number') ? progNum : (parseFloat(String(progNum||0).replace(/[^\d.,-]/g,'').replace(',','.')) || 0);
  if (n < 80)  return 'anger';
  if (n < 90)  return 'sadness';
  if (n < 100) return 'surprise';
  if (n < 110) return 'joy';
  if (n < 120) return 'laughter';
  return 'like';
}
window._avatarCache = window._avatarCache || {}; // url -> 'ok' | 'fail'
function _avatarPreload(src) {
  return new Promise(resolve => {
    if (window._avatarCache[src] === 'ok') return resolve(true);
    if (window._avatarCache[src] === 'fail') return resolve(false);
    const img = new Image();
    img.onload  = () => { window._avatarCache[src] = 'ok'; resolve(true); };
    img.onerror = () => { window._avatarCache[src] = 'fail'; resolve(false); };
    img.src = src;
  });
}

function getMgrAvatarHtml(name, progNum) {
  const id = getMgrCrmId(name);
  if (!id) return '';
  const finalEmo = getMgrAvatarEmotion(progNum);
  const finalSrc   = `logos/avatar/${id}-${finalEmo}.png`;
  const defaultSrc = `logos/avatar/${id}-default.png`;
  // Прогружаем кэш в фоне
  _avatarPreload(finalSrc);
  _avatarPreload(defaultSrc);
  const finalOk   = window._avatarCache[finalSrc] === 'ok';
  const finalFail = window._avatarCache[finalSrc] === 'fail';
  const defOk     = window._avatarCache[defaultSrc] === 'ok';
  const defFail   = window._avatarCache[defaultSrc] === 'fail';
  // Если финальный точно недоступен — не рендерим аватар вообще
  if (finalFail) return '';
  // Если default точно недоступен — рендерим только финальный (без анимации)
  if (defFail) {
    return `<div class="kpi-avatar-wrap" data-final-src="${finalSrc}" data-default-src="${defaultSrc}" data-no-default="1">
      <img class="kpi-avatar kpi-avatar-final" src="${finalSrc}" alt="" style="opacity:1" onerror="this.parentElement.remove()">
    </div>`;
  }
  // Обычный случай — два img для crossfade
  return `<div class="kpi-avatar-wrap" onclick="event.stopPropagation();ceoAvatarReplay(this)" data-final-src="${finalSrc}" data-default-src="${defaultSrc}">
    <img class="kpi-avatar kpi-avatar-final" src="${finalSrc}" alt="" onerror="this.style.display='none'">
    <img class="kpi-avatar kpi-avatar-default" src="${defaultSrc}" alt="" onerror="this.style.display='none';this.parentElement.dataset.noDefault='1'">
  </div>`;
}

// Проигрывание плавной смены: default → final (привязка к анимации .avatar-trigger)
function ceoAvatarPlay(wrap, force) {
  if (!wrap || !wrap.isConnected) return;
  const defImg   = wrap.querySelector('.kpi-avatar-default');
  const finalImg = wrap.querySelector('.kpi-avatar-final');
  if (!finalImg) return;
  // Если уже доиграно — просто восстанавливаем финальное состояние (после morph)
  if (!force && wrap.dataset.played === '1') {
    if (defImg) defImg.style.opacity = '0';
    finalImg.style.opacity = '1';
    return;
  }
  clearTimeout(wrap._t);
  clearInterval(wrap._watch);

  // Если default не загрузился или отсутствует — сразу финальная
  if (!defImg || wrap.dataset.noDefault === '1') {
    if (defImg) defImg.style.opacity = '0';
    finalImg.style.opacity = '1';
    wrap.dataset.played = '1';
    return;
  }

  // Старт
  defImg.style.opacity = '1';
  finalImg.style.opacity = '0';
  wrap.dataset.played = '0';

  const swap = () => {
    if (!wrap.isConnected) return;
    defImg.style.opacity = '0';
    finalImg.style.opacity = '1';
    wrap.dataset.played = '1';
  };

  // Ищем элемент-триггер. Опрос в 2 фазы: дождаться появления .value-counting, затем его исчезновения.
  const findTrigger = () => {
    const scr = wrap.closest('.scr') || document;
    return scr.querySelector('.avatar-trigger');
  };

  let elapsed = 0;
  let phase = 'waitStart';
  const tick = 50;
  const minDefault = 700;  // минимально показать default
  const startTimeout = 500; // если spring не стартовал — переходим к waitEnd
  const maxWait = 4500;

  wrap._watch = setInterval(() => {
    elapsed += tick;
    if (elapsed >= maxWait || !wrap.isConnected) {
      clearInterval(wrap._watch);
      swap();
      return;
    }
    const trigger = findTrigger();
    const counting = trigger && trigger.isConnected && trigger.classList.contains('value-counting');
    if (phase === 'waitStart') {
      if (counting) phase = 'waitEnd';
      else if (elapsed >= startTimeout) phase = 'waitEnd';
    } else if (phase === 'waitEnd') {
      if (!counting && elapsed >= minDefault) {
        clearInterval(wrap._watch);
        swap();
      }
    }
  }, tick);
}

function ceoAvatarReplay(wrap) {
  ceoAvatarPlay(wrap, true);
}

function ceoAvatarInitOnRender() {
  const wrap = document.querySelector('#c-ceo .kpi-avatar-wrap');
  if (wrap) ceoAvatarPlay(wrap);
}

function getMgrMessengerHtml(name) {
  if (!S.usersData || !name) return '';
  const nl = name.toLowerCase().trim();
  let tg = null, max = null;
  for (let i = 1; i < S.usersData.length; i++) {
    const row = S.usersData[i];
    if ((row[1]||'').toLowerCase().trim() === nl) {
      tg  = (row[7]||'').trim() || null;
      max = (row[8]||'').trim() || null;
      break;
    }
  }
  let html = '';
  if (tg) html += `<a href="${tg}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Telegram" style="display:inline-flex;text-decoration:none;opacity:0.6;transition:opacity .15s" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'"><svg width="20" height="20" viewBox="0 0 24 24" fill="#2CA5E0"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8l-1.68 7.93c-.12.55-.44.69-.9.43l-2.48-1.83-1.2 1.16c-.13.13-.25.25-.5.25l.18-2.52 4.56-4.12c.2-.18-.04-.27-.3-.1L7.92 14.45l-2.42-.75c-.52-.17-.53-.52.11-.77l9.48-3.66c.43-.16.82.11.55.53z"/></svg></a>`;
  if (max) html += `<a href="${max}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="MAX" class="max-icon-link" style="display:inline-flex;text-decoration:none;margin-left:2px">${maxIconSvg(16)}</a>`;
  // Кнопка открытия модалки профиля (третья иконка, тема-зависимая)
  if (typeof _profileTriggerIconHtml === 'function') html += _profileTriggerIconHtml(name);
  return html ? `<span style="display:inline-flex;align-items:center;gap:3px;margin-left:6px">${html}</span>` : '';
}

function renderOtchet() {
  const floating = document.getElementById('floating-subtabs');
  const el  = document.getElementById('c-otchet');

  // Ждём ВИЗИТЫ и ПЛАН
  if (!S.data.vizity || !S.data.plan) {
    if (!S.silentRefresh) el.innerHTML = loader();
    return;
  }

  const vizData  = S.data.vizity;
  const planData = S.data.plan;
  const crmStats = buildCrmStats(vizData);
  const planMap  = getPlanMap(planData);

  // Список менеджеров из ПЛАН (сохраняем порядок)
  const KOTEL = ['котел','котёл','kotel'];
  const isKotel = n => KOTEL.includes((n||'').toLowerCase().trim());

  const planNames = (planData || []).slice(1)
    .filter(r => r && r[0])
    .map(r => String(r[0]).trim())
    .filter(name => {
      const role = getRoleByName(name.toLowerCase().trim());
      return role === 'crm' || role === '';  // только CRM (не dozhim, не ceo)
    });

  if (!planNames.length) {
    if (floating) floating.innerHTML = '';
    el.innerHTML = '<div class="empty">Нет данных — добавьте менеджеров в лист ПЛАН</div>';
    return;
  }

  // Строим mgrRows — массив объектов совместимый со старым форматом r[N]
  // чтобы не переписывать весь renderOtchet целиком
  // Индексы: [0]=имя [1]=vis800 [2]=vis1200 [3]=план [4]=остаток [7]=allVis
  //          [8]=kred800 [9]=nal800 [10]=obmen800 [11]=kom800
  //          [12]=kred1200 [13]=nal1200 [14]=obmen1200 [15]=kom1200
  //          [16]=zadatok [19]=vsalone [22]=vkso [23]=vfssп [25]=otkaz
  function makeRow(name) {
    const nl = name.toLowerCase();
    const s  = crmStats[nl] || {};
    const plan = planMap[nl] || 0;
    const vis800  = s.vis800  || 0;
    const vis1200 = s.vis1200 || 0;
    const allVis  = (typeof s.vis === 'number') ? s.vis : (vis800 + vis1200);
    const ost     = Math.max(0, plan - allVis);
    const row     = new Array(30).fill('');
    row[0]  = name;
    row[1]  = vis800;
    row[2]  = vis1200;
    row[3]  = plan;
    row[4]  = ost;
    row[7]  = allVis;
    row[8]  = s.kred800  || 0;
    row[9]  = s.nal800   || 0;
    row[10] = s.obmen800 || 0;
    row[11] = s.kom800   || 0;
    row[12] = s.kred1200 || 0;
    row[13] = s.nal1200  || 0;
    row[14] = s.obmen1200|| 0;
    row[15] = s.kom1200  || 0;
    row[16] = s.zadatok  || 0;
    row[17] = s.vykup800 || 0;
    row[18] = s.vykup1200|| 0;
    row[19] = s.vsalone  || 0;
    row[22] = s.vkso     || 0;
    row[23] = s.vfssп    || 0;
    row[24] = s.vbanke   || 0;
    row[25] = s.otkaz    || 0;
    row[26] = s.odobNeKupil || 0;
    row[27] = s.byCity   || {};
    return row;
  }

  const mgrRows = planNames.map(makeRow);

  // Котёл — суммируем тех кто не в ПЛАН (если есть)
  const kotelStats = { vis:0, vis800:0, vis1200:0, kred800:0, nal800:0, obmen800:0, kom800:0,
                       kred1200:0, nal1200:0, obmen1200:0, kom1200:0, zadatok:0 };
  const planNamesLow = new Set(planNames.map(n => n.toLowerCase()));
  Object.values(crmStats).forEach(s => {
    if (!planNamesLow.has(s.name.toLowerCase())) {
      kotelStats.vis       += (s.vis || 0);
      kotelStats.vis800    += s.vis800;
      kotelStats.vis1200   += s.vis1200;
      kotelStats.kred800   += s.kred800;
      kotelStats.nal800    += s.nal800;
      kotelStats.obmen800  += s.obmen800;
      kotelStats.kom800    += s.kom800;
      kotelStats.kred1200  += s.kred1200;
      kotelStats.nal1200   += s.nal1200;
      kotelStats.obmen1200 += s.obmen1200;
      kotelStats.kom1200   += s.kom1200;
      kotelStats.zadatok   += s.zadatok;
    }
  });
  const kot = new Array(30).fill('');
  kot[1]  = kotelStats.vis800;
  kot[2]  = kotelStats.vis1200;
  kot[8]  = kotelStats.kred800;  kot[9]  = kotelStats.nal800;
  kot[11] = kotelStats.kom800;   kot[12] = kotelStats.kred1200;
  kot[13] = kotelStats.nal1200;  kot[15] = kotelStats.kom1200;

  const vis800sum  = mgrRows.reduce((s,r) => s + num(r[1]), 0) + num(kot[1]);
  const vis1200sum = mgrRows.reduce((s,r) => s + num(r[2]), 0) + num(kot[2]);
  // Total visits = сумма m.vis по всем менеджерам отдела (включая Котёл).
  // row[7] хранит s.vis (без фильтра по категориям) — корректно соответствует хронологии.
  const allVis     = mgrRows.reduce((s,r) => s + num(r[7]), 0) + (kotelStats.vis || 0);
  const planTotal  = mgrRows.reduce((s,r) => s + num(r[3]), 0);

  const mo  = parseInt(currentSuffix.slice(0,2));
  const yr  = 2000 + parseInt(currentSuffix.slice(2,4));
  const dim = new Date(yr, mo, 0).getDate();
  const today = new Date();
  const dp  = (today.getFullYear()===yr && today.getMonth()+1===mo) ? today.getDate()
            : today > new Date(yr,mo-1,dim) ? dim : null;

  let progOtdel = '—';
  if (dp && planTotal > 0) {
    const target = (planTotal / dim) * dp;
    progOtdel = Math.round(allVis / target * 100) + '%';
  }

  const deptKred = mgrRows.reduce((s,r) => s + num(r[8])  + num(r[12]), 0) + num(kot[8])  + num(kot[12]);
  const deptNal  = mgrRows.reduce((s,r) => s + num(r[9])  + num(r[13]), 0) + num(kot[9])  + num(kot[13]);
  const deptKom  = mgrRows.reduce((s,r) => s + num(r[11]) + num(r[15]), 0) + num(kot[11]) + num(kot[15]);

  const isLight = (document.body.classList.contains('light')||document.body.classList.contains('tiffany'));
  const accR = isLight ? 81  : 232;
  const accG = isLight ? 55  : 255;
  const accB = isLight ? 221 : 71;

  const ostPlan = Math.max(0, planTotal - allVis);

  // ПРОГНОЗ ШТ — прогноз визитов (CRM + ТЛ) к концу месяца при текущем темпе
  let progVisShт = '—';
  if (dp && dp > 0) {
    progVisShт = Math.round((vis800sum + vis1200sum) / dp * dim);
  }

  // СЕГОДНЯ и В КСО — из листа ВИЗИТЫ{suffix}
  // Ожидаем: колонка A — дата, колонка E — статус "В работе КСО"
  let todayVis = '—', todayKso = '—';

  if (vizData && vizData.length > 1) {
    const now = new Date();
    const todayStr = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`;
    const todayAlt = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    let tVis = 0, tKso = 0;
    for (let i = 1; i < vizData.length; i++) {
      const row = vizData[i];
      if (!row || !row[0]) continue;
      const cell = String(row[0]).trim();
      if (cell === todayStr || cell === todayAlt || cell.startsWith(todayStr) || cell.startsWith(todayAlt)) {
        tVis++;
        const status = String(row[4]||'').trim();
        const ksoStatuses = ['Подает заявку', 'В работе КСО', 'на рассмотрении банка'];
        if (ksoStatuses.includes(status)) tKso++;
      }
    }
    todayVis = tVis;
    todayKso = tKso;
  }
  const cnvrsData = S.data.cnvrs || [];
  const cnvrsTotCrm  = cnvrsData[11] || [];
  const cnvrsTotWarm = cnvrsData[25] || [];
  const cnvrsTotGen  = cnvrsData[39] || [];

  const deptCard = `
  <div class="sec-title">ОТДЕЛ CRM</div>
  <div class="dept-card" style="background:rgba(${accR},${accG},${accB},0.08)">
    <div class="dept-row1" style="margin-bottom:8px">
      <div class="dept-cell"><div class="dc-lbl">План</div><div class="dc-val">${planTotal||'—'}</div></div>
      <div class="dept-cell hi"><div class="dc-lbl">Визиты</div><div class="dc-val">${allVis||'—'}</div></div>
      <div class="dept-cell"><div class="dc-lbl">Остаток</div><div class="dc-val">${ostPlan||'—'}</div></div>
      <div class="dept-cell"><div class="dc-lbl">Прогноз</div><div class="dc-val">${progVisShт}</div></div>
    </div>
    <div class="dept-row1" style="margin-bottom:8px">
      <div class="dept-cell"><div class="dc-lbl">Прогноз</div><div class="dc-val" style="color:${pctClr(parseInt(progOtdel))}">${progOtdel}</div></div>
      <div class="dept-cell hi"><div class="dc-lbl">Сегодня</div><div class="dc-val">${todayVis}</div></div>
      <div class="dept-cell"><div class="dc-lbl">Ви-CRM</div><div class="dc-val">${vis800sum||'—'}</div></div>
      <div class="dept-cell"><div class="dc-lbl">Ви-ТЛ</div><div class="dc-val">${vis1200sum||'—'}</div></div>
    </div>
    <div class="dept-row2" style="margin-bottom:8px">
      <div class="dept-cell"><div class="dc-lbl">В КСО</div><div class="dc-val">${todayKso}</div></div>
      <div class="dept-cell"><div class="dc-lbl">Кредит</div><div class="dc-val">${deptKred||'—'}</div></div>
      <div class="dept-cell"><div class="dc-lbl">Наличка</div><div class="dc-val">${deptNal||'—'}</div></div>
      <div class="dept-cell"><div class="dc-lbl">Комиссия</div><div class="dc-val">${deptKom||'—'}</div></div>
    </div>
    <details class="dept-cnvrs-spoiler">
      <summary class="dept-cnvrs-summary">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>Конверсии / Доли</span>
      </summary>
      <div class="dept-cnvrs-body">
        <div class="dept-sec-lbl" style="font-size:7px;color:var(--txt2);margin:4px 0 6px"><b><i>К</i></b> общая</div>
        <div class="dept-row3">
          <div class="dept-cell"><div class="dc-lbl"><b><i>К</i></b> визиты</div><div class="dc-val">${cnvrsTotGen[6]||'—'}</div></div>
          <div class="dept-cell"><div class="dc-lbl"><b><i>К</i></b> кредиты</div><div class="dc-val">${cnvrsTotGen[7]||'—'}</div></div>
          <div class="dept-cell"><div class="dc-lbl">% нецелевых</div><div class="dc-val">${cnvrsTotGen[9]||'—'}</div></div>
        </div>
        <div class="dept-sec-lbl" style="font-size:7px;color:var(--txt2);margin:10px 0 6px"><b><i>К</i></b> CRM</div>
        <div class="dept-row3">
          <div class="dept-cell"><div class="dc-lbl"><b><i>К</i></b> визиты</div><div class="dc-val">${cnvrsTotCrm[6]||'—'}</div></div>
          <div class="dept-cell"><div class="dc-lbl"><b><i>К</i></b> кредиты</div><div class="dc-val">${cnvrsTotCrm[7]||'—'}</div></div>
          <div class="dept-cell"><div class="dc-lbl">% нецелевых</div><div class="dc-val">${cnvrsTotCrm[9]||'—'}</div></div>
        </div>
        <div class="dept-sec-lbl" style="font-size:7px;color:var(--txt2);margin:10px 0 6px"><b><i>К</i></b> тёплые лиды</div>
        <div class="dept-row3">
          <div class="dept-cell"><div class="dc-lbl"><b><i>К</i></b> визиты</div><div class="dc-val">${cnvrsTotWarm[6]||'—'}</div></div>
          <div class="dept-cell"><div class="dc-lbl"><b><i>К</i></b> кредиты</div><div class="dc-val">${cnvrsTotWarm[7]||'—'}</div></div>
          <div class="dept-cell"><div class="dc-lbl">% нецелевых</div><div class="dc-val">${cnvrsTotWarm[9]||'—'}</div></div>
        </div>
      </div>
    </details>
  </div>`;

  let dozhimDeptCard = '';
  const dVizData = S.data.d_vizity;
  if (dVizData && dVizData.length > 1) {
    const dStats   = buildDozhimStats(dVizData);
    const dPlanM   = getPlanMap(S.data.plan || []);
    const dSalesM2 = getDSalesPlanMap(S.data.plan || []);
    // Берём имена дожим-менеджеров: из USERS с role=dozhim + из листа ПЛАН
    const dNames = (S.data.plan||[]).slice(1)
      .filter(r => r && r[0])
      .map(r => String(r[0]).trim())
      .filter(n => {
        const nl = n.toLowerCase();
        const role = getRoleByName(nl);
        return role === 'dozhim';
      });
    // Если dNames пустой — берём всех у кого есть визиты в d_vizity
    const dNamesEff = dNames.length > 0 ? dNames : Object.keys(dStats).map(nl => dStats[nl].name);
    const dAllVis   = dNamesEff.reduce((s,n)=>{const st=dStats[n.toLowerCase()]||{};return s+(st.vis800||0)+(st.vis1000||0);},0);
    const dPlan     = dNamesEff.reduce((s,n)=>{const v=dPlanM[n.toLowerCase()]||0; return s+v;},0);
    const dSalesPl  = dNamesEff.reduce((s,n)=>{const v=dSalesM2[n.toLowerCase()]||0; return s+v;},0);
    const dSalesFact= dNamesEff.reduce((s,n)=>{const st=dStats[n.toLowerCase()]||{};return s+(st.kred800||0)+(st.nal800||0)+(st.obmen800||0)+(st.kred1000||0)+(st.nal1000||0);},0);
    const dKred     = dNamesEff.reduce((s,n)=>{const st=dStats[n.toLowerCase()]||{};return s+(st.kred800||0)+(st.kred1000||0);},0);
    const dNal      = dNamesEff.reduce((s,n)=>{const st=dStats[n.toLowerCase()]||{};return s+(st.nal800||0)+(st.nal1000||0);},0);
    const dKom      = dNamesEff.reduce((s,n)=>{const st=dStats[n.toLowerCase()]||{};return s+(st.kom800||0)+(st.kom1000||0);},0);
    let dProgNum = 0;
    let dProg = '—';
    if (dp && dPlan > 0) { dProgNum = Math.round(dAllVis / (dPlan / dim * dp) * 100); dProg = dProgNum + '%'; }
    let dSalesProgNum = 0;
    let dSalesProg = '—';
    if (dp && dSalesPl > 0) { dSalesProgNum = Math.round(dSalesFact / (dSalesPl / dim * dp) * 100); dSalesProg = dSalesProgNum + '%'; }
    const dOst = Math.max(0, dPlan - dAllVis);
    dozhimDeptCard = `
    <div class="sec-title">ОТДЕЛ ДОЖИМ</div>
    <div class="dept-card" style="background:rgba(${accR},${accG},${accB},0.08)">
      <div class="dept-sec-lbl">Визиты</div>
      <div class="dept-row1">
        <div class="dept-cell"><div class="dc-lbl">План</div><div class="dc-val">${dPlan||'—'}</div></div>
        <div class="dept-cell hi"><div class="dc-lbl">Визиты</div><div class="dc-val">${dAllVis||'—'}</div></div>
        <div class="dept-cell"><div class="dc-lbl">Остаток</div><div class="dc-val">${dOst||'—'}</div></div>
        <div class="dept-cell"><div class="dc-lbl">Прогноз</div><div class="dc-val" style="color:${pctClr(dProgNum)}">${dProg}</div></div>
      </div>
      <div class="dept-sec-lbl">Продажи</div>
      <div class="dept-row1">
        <div class="dept-cell"><div class="dc-lbl">План</div><div class="dc-val">${dSalesPl||'—'}</div></div>
        <div class="dept-cell hi"><div class="dc-lbl">Продажи</div><div class="dc-val">${dSalesFact||'—'}</div></div>
        <div class="dept-cell"><div class="dc-lbl">Остаток</div><div class="dc-val">${Math.max(0,dSalesPl-dSalesFact)||'—'}</div></div>
        <div class="dept-cell"><div class="dc-lbl">Прогноз</div><div class="dc-val" style="color:${pctClr(dSalesProgNum)}">${dSalesProg}</div></div>
      </div>
      <div style="height:1px;background:var(--line2);margin:8px 0"></div>
      <div class="dept-row2" style="grid-template-columns:repeat(3,1fr)">
        <div class="dept-cell"><div class="dc-lbl">Кредит</div><div class="dc-val">${dKred||'—'}</div></div>
        <div class="dept-cell"><div class="dc-lbl">Наличка</div><div class="dc-val">${dNal||'—'}</div></div>
        <div class="dept-cell"><div class="dc-lbl">Комиссия</div><div class="dc-val">${dKom||'—'}</div></div>
      </div>
    </div>`;
  } else {
    dozhimDeptCard = `
    <div class="sec-title">ОТДЕЛ ДОЖИМ</div>
    <div class="dept-card" style="opacity:0.7;background:rgba(${accR},${accG},${accB},0.08)">
      <div class="dept-sec-lbl">Визиты</div>
      <div class="dept-row1">
        <div class="dept-cell"><div class="dc-lbl">План</div><div class="dc-val">—</div></div>
        <div class="dept-cell hi"><div class="dc-lbl">Визиты</div><div class="dc-val">—</div></div>
        <div class="dept-cell"><div class="dc-lbl">Остаток</div><div class="dc-val">—</div></div>
        <div class="dept-cell"><div class="dc-lbl">Прогноз</div><div class="dc-val">—</div></div>
      </div>
      <div class="dept-sec-lbl">Продажи</div>
      <div class="dept-row1">
        <div class="dept-cell"><div class="dc-lbl">План</div><div class="dc-val">—</div></div>
        <div class="dept-cell hi"><div class="dc-lbl">Продажи</div><div class="dc-val">—</div></div>
        <div class="dept-cell"><div class="dc-lbl">Остаток</div><div class="dc-val">—</div></div>
        <div class="dept-cell"><div class="dc-lbl">Прогноз</div><div class="dc-val">—</div></div>
      </div>
      <div style="height:1px;background:var(--line2);margin:8px 0"></div>
      <div class="dept-row2" style="grid-template-columns:repeat(3,1fr)">
        <div class="dept-cell"><div class="dc-lbl">Кредит</div><div class="dc-val">—</div></div>
        <div class="dept-cell"><div class="dc-lbl">Наличка</div><div class="dc-val">—</div></div>
        <div class="dept-cell"><div class="dc-lbl">Комиссия</div><div class="dc-val">—</div></div>
      </div>
    </div>`;
  }


  function getCnvrsRow(name, section) {
    const n = (name||'').toLowerCase().trim();
    let rows;
    if (section === 'crm') rows = cnvrsData.slice(2, 11);
    else if (section === 'warm') rows = cnvrsData.slice(16, 25);
    else rows = cnvrsData.slice(30, 39);
    return rows.find(r => (r[0]||'').toLowerCase().trim() === n) || [];
  }

  const managerStats = mgrRows
    .filter(r => {
      if (isKotel(r[0])) return true; // котёл показываем
      const role = getRoleByName(r[0].toLowerCase().trim());
      return role === 'crm' || role === '';
    })
    .map(r => {
    const mName = (r[0]||'—').trim();
    const genRow = getCnvrsRow(mName, 'general');
    const convStr = (genRow[6]||'0%').replace('%','').replace(',','.');
    const allV = num(r[7]);
    const plan = num(r[3]) || 1;
    return {
      name:     mName.toUpperCase(),
      visits:   allV,
      plan,
      progNum:  computeProgPct(allV, plan, currentSuffix),
      convPct:  parseFloat(convStr) || 0,
      isKotel:  isKotel(r[0]),
    };
  });
  managerStats.sort((a, b) => b.progNum - a.progNum);

  const speedoHTML = managerStats.map((item, idx) => {
    const progressId = `progress-${idx}`;
    const innerProgressId = `inner-progress-${idx}`;
    const convPct = item.convPct || 0;
    const nameLabel = item.isKotel ? `🫕 ${item.name}` : item.name;
    return `
      <div class="speedo-item" style="${item.isKotel ? 'opacity:0.75' : ''}">
        <div class="speedo-svg-container">
          <svg viewBox="0 0 200 200">
            <defs><linearGradient id="speedGradient" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#eb4d4b"/><stop offset="50%" stop-color="#fbad33"/><stop offset="100%" stop-color="#27ae60"/></linearGradient></defs>
            <path class="base-path" d="M 40 160 A 85 85 0 1 1 160 160"/>
            <path id="${progressId}" class="progress-path" stroke="url(#speedGradient)" d="M 40 160 A 85 85 0 1 1 160 160"/>
            <path class="inner-base-path" d="M 61 139 A 55 55 0 1 1 139 139"/>
            <path id="${innerProgressId}" class="inner-progress-path" stroke="url(#speedGradient)" d="M 61 139 A 55 55 0 1 1 139 139"/>
          </svg>
          <div class="speedo-value">${Math.round(item.progNum)}%</div>
          <div class="speedo-conv">${convPct}%</div>
          <div class="speedo-visits">${item.visits}</div>
        </div>
        <div class="speedo-name">${nameLabel}</div>
      </div>`;
  }).join('');

  const speedoCard = `
    <div class="sec-title">ПРОГНОЗЫ ПО МЕНЕДЖЕРАМ</div>
    <div class="dept-card" style="margin-top:0;background:rgba(${accR},${accG},${accB},0.08)">
      <div class="speedo-grid">${speedoHTML}</div>
    </div>`;

  // Фильтруем: в CRM-рейтинге только менеджеры с role=crm
  const rankRows  = mgrRows.filter(r => {
    if (isKotel(r[0])) return false;
    const role = getRoleByName(r[0].toLowerCase().trim());
    return role === 'crm' || role === '';
  });
  const kotelRows = mgrRows.filter(r => isKotel(r[0]));

  const withProg = rankRows.map(r => {
    const allV = num(r[7]);
    const plan = num(r[3]) || 1;
    const progNum = computeProgPct(allV, plan, currentSuffix);
    const factNum = computeFactPct(allV, plan);
    return { r, progNum, factNum };
  });
  withProg.sort((a, b) => b.progNum - a.progNum);
  const total = withProg.length;

  const ranked = withProg.map(({ r, progNum, factNum }, idx) => {
    const name  = (r[0]||'—').toUpperCase();
    const plan  = num(r[3]);
    const fact  = num(r[7]);
    const daily = computeDailyPlan(plan, fact, progNum, currentSuffix, name);
    const rplan = r[3]||'0', ost = r[4]||'0';
    const prc   = factNum + '%';
    const prog  = progNum + '%';
    const allV  = r[7]||'0';
    const rs    = rankStyles(idx, total);
    const fillGrad = `linear-gradient(90deg,${rs.color},${rs.color})`;
    const crmCnvrs  = getCnvrsRow(name, 'crm');
    const warmCnvrs = getCnvrsRow(name, 'warm');
    const genCnvrs  = getCnvrsRow(name, 'general');
    const modalData = JSON.stringify({
      name, nameLow: String(r[0]||'').toLowerCase().trim(), v800:r[1], v1200:r[2], rplan, ost, prc, prog, allV, daily, progNum,
      kred800:r[8], nal800:r[9], td800:r[10], kom800:r[11],
      kred1200:r[12], nal1200:r[13], td1200:r[14], kom1200:r[15],
      zadatok:r[16], vykup800:r[17]||0, vykup1200:r[18]||0,
      vsalone:r[19], vkso:r[22], vfSSP:r[23], vbanke:r[24], otkaz:r[25],
      odobNeKupil:r[26]||0, byCity:r[27]||{},
      crmConVis:crmCnvrs[6]||'—', crmConKred:crmCnvrs[7]||'—',
      crmDolya:crmCnvrs[8]||'—', crmKoef:crmCnvrs[12]||'—',
      warmConVis:warmCnvrs[6]||'—', warmConKred:warmCnvrs[7]||'—',
      warmDolya:warmCnvrs[8]||'—', warmKoef:warmCnvrs[12]||'—',
      genConVis:genCnvrs[6]||'—', genConKred:genCnvrs[7]||'—',
      genDolya:genCnvrs[8]||'—', genKoef:genCnvrs[12]||'—',
      rs, idx: idx+1
    }).replace(/'/g,"&#39;");

    return `<div class="mop" style="--rank-r:${rs.r};--rank-g:${rs.g};--rank-b:${rs.b};border-color:${rs.border}">
      <div class="mop-strip" style="width:100%;background:${pctClr(progNum)}"></div>
      <div class="mop-head"><div class="mop-head-left"><span class="rank-badge" style="background:${rs.badgeBg};color:${rs.color}">${idx+1}</span><span class="mop-name">${name}</span>${getMgrMessengerHtml(name)}</div><button class="mop-info-btn" onclick="openMopModal('${modalData.replace(/"/g,"&quot;")}')">i</button></div>
      <div class="mop-mini">
        <div class="mm kpi-visits-drill" onclick="openVisitsDayModal(${JSON.stringify(String(r[0]||'').toLowerCase().trim()).replace(/"/g, '&quot;')}, false)" title="Хронология визитов по дням"><div class="ml">Визиты</div><div class="mv">${allV}</div></div>
        <div class="mm"><div class="ml">План</div><div class="mv">${rplan}</div></div>
        <div class="mm"><div class="ml">Остаток</div><div class="mv">${ost}</div></div>
        <div class="mm"><div class="ml">Дневной</div><div class="mv">${daily}</div></div>
      </div>
    </div>`;
  }).join('');

  const kotelHTML = kotelRows.map(r => {
    const name = (r[0]||'—').toUpperCase();
    const allV = num(r[7]);
    const plan = num(r[3]) || 1;
    const p = computeProgPct(allV, plan, currentSuffix);
    const prog = p + '%';
    const fact  = allV;
    const daily = computeDailyPlan(plan, fact, p, currentSuffix, name);
    return `<div class="mop" style="opacity:.65"><div class="mop-strip" style="width:100%;background:var(--txt3)"></div><div class="mop-head"><div class="mop-head-left"><span class="rank-badge" style="background:rgba(128,128,128,.15);color:var(--txt3)">—</span><span class="mop-name">${name}</span></div></div>
      <div class="mop-mini">
        <div class="mm"><div class="ml">Визиты</div><div class="mv">${r[7]||'0'}</div></div>
        <div class="mm"><div class="ml">План</div><div class="mv">${r[3]||'0'}</div></div>
        <div class="mm"><div class="ml">Остаток</div><div class="mv">${r[4]||'0'}</div></div>
        <div class="mm"><div class="ml">Дневной</div><div class="mv">${daily}</div></div>
      </div>
    </div>`;
  }).join('');

  const mops_html = ranked + kotelHTML;

  const subtabs = ``; // верхние вкладки убраны — управление через Dock
  if (floating) floating.innerHTML = '';

  let content = '';
  if (S.reportTab === 'dept') content = deptCard + dozhimDeptCard + speedoCard;
  else if (S.reportTab === 'mgr') content = `<div class="sec-title">Менеджеры CRM</div><div class="mops">${mops_html}</div>`;
  else if (S.reportTab === 'dozhim') content = renderDozhimCards();

  setLiveHTML(el, content);

  if (S.reportTab === 'dept') {
    managerStats.forEach((item, idx) => {
      const progressPath = document.getElementById(`progress-${idx}`);
      const innerPath = document.getElementById(`inner-progress-${idx}`);
      if (!progressPath) return;
      const length = progressPath.getTotalLength();
      const targetPct = Math.min(item.visits / item.plan, 1);
      progressPath.style.strokeDasharray = `0,${length}`;
      const innerLen = innerPath ? innerPath.getTotalLength() : 0;
      const innerTarget = Math.min((item.convPct || 0) / 25, 1);
      if (innerPath) innerPath.style.strokeDasharray = `0,${innerLen}`;
      let start = null;
      function animate(ts) {
        if (!start) start = ts;
        const ease = 1 - Math.pow(1 - Math.min((ts - start) / 2000, 1), 4);
        progressPath.style.strokeDasharray = `${ease * length * targetPct},${length}`;
        if (innerPath) innerPath.style.strokeDasharray = `${ease * innerLen * innerTarget},${innerLen}`;
        if (ease < 1) requestAnimationFrame(animate);
      }
      requestAnimationFrame(animate);
    });
  }
}

function renderDozhimCards() {
  if (!S.data.d_vizity || !S.data.plan) return '<div class="empty">Загрузка данных дожима…</div>';
  const planData  = S.data.plan || [];
  const planM     = getPlanMap(planData);
  const dSalesM   = getDSalesPlanMap(planData);
  const dStats    = buildDozhimStats(S.data.d_vizity);

  // Менеджеры дожима из ПЛАН с role=dozhim
  const dozhimNames = planData.slice(1)
    .filter(r => r && r[0])
    .map(r => String(r[0]).trim())
    .filter(name => getRoleByName(name.toLowerCase().trim()) === 'dozhim');

  if (!dozhimNames.length) return '<div class="empty">Нет данных по дожиму</div>';

  const withProg = dozhimNames.map(name => {
    const nl     = name.toLowerCase();
    const s      = dStats[nl] || {};
    const allVis = (s.vis800||0) + (s.vis1000||0);
    const plan   = planM[nl] || 1;
    return { name, nl, s, allVis, plan, progNum: computeProgPct(allVis, plan, currentSuffix), factNum: computeFactPct(allVis, plan) };
  });
  withProg.sort((a, b) => b.progNum - a.progNum);
  const total = withProg.length;

  const cards = withProg.map(({ name, nl, s, allVis, plan, progNum, factNum }, idx) => {
    const rs      = rankStyles(idx, total);
    const ost     = Math.max(0, plan - allVis);
    const daily   = computeDailyPlan(plan, allVis, progNum, currentSuffix, name);
    const sPlan   = dSalesM[nl] || 0;
    const sFact   = (s.kred800||0)+(s.nal800||0)+(s.obmen800||0)+(s.kred1000||0)+(s.nal1000||0);
    const sOst    = Math.max(0, sPlan - sFact);
    const sProg   = sPlan ? computeProgPct(sFact, sPlan, currentSuffix) : 0;
    const modalData = JSON.stringify({
      type:'dozhim', name: name.toUpperCase(), nameLow: nl,
      v800: s.vis800||0, v1000: s.vis1000||0,
      rplan: plan, ost, prc: factNum+'%', prog: progNum+'%', allV: allVis,
      kred800:s.kred800||0, nal800:s.nal800||0, obmen800:s.obmen800||0, kom800:s.kom800||0,
      kred1000:s.kred1000||0, nal1000:s.nal1000||0, kom1000:s.kom1000||0, zadatok:s.zadatok||0,
      sPlan, sFact, sOst, sProg,
      rs, idx: idx+1,
    }).replace(/'/g,"&#39;");
    return `<div class="mop" style="--rank-r:${rs.r};--rank-g:${rs.g};--rank-b:${rs.b};border-color:${rs.border}">
      <div class="mop-strip" style="width:100%;background:${pctClr(progNum)}"></div>
      <div class="mop-head"><div class="mop-head-left"><span class="rank-badge" style="background:${rs.badgeBg};color:${rs.color}">${idx+1}</span><span class="mop-name">${name.toUpperCase()}</span>${getMgrMessengerHtml(name)}</div><button class="mop-info-btn" onclick="openDozhimModal('${modalData.replace(/"/g,"&quot;")}')">i</button></div>
      <div class="mop-mini">
        <div class="mm kpi-visits-drill" onclick="openVisitsDayModal(${JSON.stringify(nl).replace(/"/g, '&quot;')}, true)" title="Хронология визитов по дням"><div class="ml">Визиты</div><div class="mv">${allVis}</div></div>
        <div class="mm"><div class="ml">План</div><div class="mv">${plan}</div></div>
        <div class="mm"><div class="ml">Остаток</div><div class="mv">${ost}</div></div>
        <div class="mm"><div class="ml">Дневной</div><div class="mv">${daily}</div></div>
      </div>
    </div>`;
  }).join('');

  return `<div class="sec-title">Менеджеры дожима</div><div class="mops">${cards}</div>`;
}

function openDozhimModal(dataStr) {
  const d = JSON.parse(dataStr.replace(/&#39;/g,"'").replace(/&quot;/g,'"'));
  const p = num(d.prc);
  const rs = d.rs;
  document.getElementById('mop-modal-title').innerHTML = `<span class="rank-badge" style="background:${rs.badgeBg};color:${rs.color}">${d.idx}</span><span style="font-family:'Unbounded',sans-serif">${d.name}</span>`;
  const sp = d.sProg || 0;
  document.getElementById('mop-modal-body').innerHTML = `<div class="mop-grid4"><div class="m4"><div class="ml">Визиты</div><div class="mv">${d.allV}</div></div><div class="m4"><div class="ml">План</div><div class="mv">${d.rplan}</div></div><div class="m4"><div class="ml">Остаток</div><div class="mv">${d.ost}</div></div><div class="m4"><div class="ml">Прогноз</div><div class="mv" style="color:${pctClr(p)}">${d.prog}</div></div></div>${d.sPlan ? `<div class="mop-grid4" style="margin-top:6px"><div class="m4"><div class="ml">Продажи</div><div class="mv" style="color:${pctClr(sp)}">${d.sFact}</div></div><div class="m4"><div class="ml">План</div><div class="mv">${d.sPlan}</div></div><div class="m4"><div class="ml">Остаток</div><div class="mv">${d.sOst}</div></div><div class="m4"><div class="ml">Прогноз</div><div class="mv" style="color:${pctClr(sp)}">${sp}%</div></div></div>` : ''}<div class="prog-row"><span class="prog-l" style="color:${pctClr(p)}">${d.prc}</span><div class="prog-track"><div class="prog-fill" style="width:${Math.min(p,100)}%;background:${pctClr(p)}"></div></div><span class="prog-r">100%</span></div><div class="modal-sec"><div class="modal-sec-title">КАТ 800</div><div class="modal-grid"><div class="modal-cell"><div class="mc-l">Визиты</div><div class="mc-v">${d.v800}</div></div><div class="modal-cell"><div class="mc-l">Кредиты</div><div class="mc-v">${d.kred800}</div></div><div class="modal-cell"><div class="mc-l">Наличка</div><div class="mc-v">${d.nal800}</div></div><div class="modal-cell"><div class="mc-l">Обмен</div><div class="mc-v">${d.obmen800||0}</div></div><div class="modal-cell"><div class="mc-l">Комиссия</div><div class="mc-v">${d.kom800}</div></div></div></div><div class="modal-sec"><div class="modal-sec-title">КАТ 1000</div><div class="modal-grid"><div class="modal-cell"><div class="mc-l">Визиты</div><div class="mc-v">${d.v1000}</div></div><div class="modal-cell"><div class="mc-l">Кредиты</div><div class="mc-v">${d.kred1000}</div></div><div class="modal-cell"><div class="mc-l">Наличка</div><div class="mc-v">${d.nal1000}</div></div><div class="modal-cell"><div class="mc-l">Комиссия</div><div class="mc-v">${d.kom1000}</div></div><div class="modal-cell"><div class="mc-l">Задаток</div><div class="mc-v">${d.zadatok}</div></div></div></div>`;
  document.getElementById('mop-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function setReportTab(tab) {
  S.reportTab = tab;
  updateFirebasePage();
  if (tab === 'dozhim' && !S.data.d_vizity) {
    const el = document.getElementById('c-otchet');
    el.innerHTML = loader();
    Promise.all([
      api(SHEETS.d_vizity, 'A:N').catch(() => []),
      S.data.plan ? Promise.resolve(S.data.plan) : api(SHEETS.plan, 'A:D').catch(() => []),
    ]).then(([dv, pd]) => {
      S.data.d_vizity = dv;
      S.data.plan     = pd;
      renderOtchet();
    });
    return;
  }
  renderOtchet();
}

function goHome() {
  const matched = findUserInSheet();
  if (matched && isCeoLike(matched.role)) {
    showScr('ceo');
    dockSetActive('home');
    if (typeof loadCeoDashboard === 'function') loadCeoDashboard();
  } else if (matched) {
    goPersonal();
  }
}

// ==================== RENDER DOHOD ====================
function renderDohod() {
  const el = document.getElementById('c-dohod');
  const floating = document.getElementById('floating-dohod-subtabs');
  const matched = findUserInSheet();
  const role = matched?.role || '';
  const isCeo = isCeoLike(role);

  // CEO — без верхних вкладок, выбор через Dock
  if (isCeo) {
    if (floating) { floating.innerHTML = ''; floating.style.display = 'none'; }
    if (S.dohodTab === 'dozhim') { renderDohodDozhim(el); return; }
    renderDohodCrm(el);
    return;
  }

  // Обычный менеджер — без подвкладок
  if (floating) { floating.innerHTML = ''; floating.style.display = 'none'; }

  if (!matched || !matched.name) {
    el.innerHTML = '<div class="empty">Пользователь не найден в базе</div>';
    return;
  }

  const nameLow = matched.name.toLowerCase().trim();
  const isDozhim = role === 'dozhim';
  const isLight = (document.body.classList.contains('light')||document.body.classList.contains('tiffany'));
  const accR = isLight ? 81 : 232, accG = isLight ? 55 : 255, accB = isLight ? 221 : 71;

  if (isDozhim) {
    if (!S.data.d_vizity || !S.data.plan) { if (!S.silentRefresh) el.innerHTML = loader(); return; }
    const sal = calcSalaryDozhimFromVizity(nameLow);
    if (!sal) { el.innerHTML = '<div class="empty">Нет данных по вашему доходу</div>'; return; }
    const det = {
      oklad: sal.detail.oklad, baseOklad: sal.detail.baseOklad,
      workedR: sal.detail.workedR, totalR: sal.detail.totalR,
      premium: sal.detail.premium, kotel: sal.detail.kotel,
      kotelTotal: sal.detail.kotelTotal, fundCount: sal.detail.fundCount,
      inFund: sal.detail.inFund,
      ch800: sal.detail.ch800, ch1000: sal.detail.ch1000,
      earn800: sal.detail.earn800, earn1000: sal.detail.earn1000,
      fact: sal.fact, prognoz: sal.prognoz,
    };
    setLiveHTML(el, `
      <div class="w" style="padding-top:16px">
        <div class="kpi-subtitle">Доход за месяц<button class="kpi-subtitle-info" onclick="openSalInfo('dozhim')">i</button></div>
        <div class="kpi-income-panel" style="position:relative;text-align:center;cursor:pointer;background:rgba(${accR},${accG},${accB},0.15)"
             onclick="openDozhimIncomeModal(this)" data-income='${JSON.stringify(det).replace(/'/g,"&#39;")}' data-total="">
          <div class="zl">Фактический доход</div>
          <div class="zv">${fmtRub(Math.round(sal.fact.total))}</div>
        </div>
      </div>`);
  } else {
    if (!S.data.vizity || !S.data.stavki) { if (!S.silentRefresh) el.innerHTML = loader(); return; }
    const sal = calcSalary(nameLow);
    if (!sal) { el.innerHTML = '<div class="empty">Нет данных по вашему доходу</div>'; return; }

    const d = sal;
    const n = v => parseFloat(String(v||'0').replace(/[^\d.,-]/g,'').replace(',','.')) || 0;
    function badge(lbl, val, cnt) {
      const cntHtml = (cnt != null && cnt > 0) ? `<div class="ib-cnt">${cnt} шт</div>` : '';
      return `<div class="income-badge"><div class="ib-lbl">${lbl}</div>${cntHtml}<div class="ib-val">${fmtRub(val)}</div></div>`;
    }
    function subtotal(lbl, sum) {
      return `<div class="income-subtotal"><span class="ist-lbl">${lbl}</span><span class="ist-val">${fmtRub(sum)}</span></div>`;
    }
    const crmSum  = n(d.detail.crm.vis)+n(d.detail.crm.kred)+n(d.detail.crm.nal)+n(d.detail.crm.obmen)+n(d.detail.crm.kom)+n(d.detail.crm.zadatok);
    const warmSum = n(d.detail.warm.vis)+n(d.detail.warm.kred)+n(d.detail.warm.nal)+n(d.detail.warm.obmen)+n(d.detail.warm.kom);
    const oklad      = n(d.detail.oklad);
    const baseOklad  = n(d.detail.baseOklad) || oklad;
    const kotel      = n(d.detail.kotel);
    const premium    = n(d.detail.premium);
    const fundCount  = d.detail.fundCount || '—';
    const factKoef   = d.fact.koef;
    const progKoef   = d.prognoz.koef;
    const okladLbl   = d.detail.workedR != null ? `Оклад (${d.detail.workedR}/${d.detail.totalR} дн.)` : 'Оклад';
    const okladFormula = d.detail.workedR != null
      ? `(${fmtRub(baseOklad)}÷${d.detail.totalR}×${d.detail.workedR}) + (${fmtRub(Math.round(premium))} × ${factKoef.toFixed(1)}) = ${fmtRub(Math.round(d.fact.total))}`
      : `${fmtRub(oklad)} + (${fmtRub(Math.round(premium))} × ${factKoef.toFixed(1)}) = ${fmtRub(Math.round(d.fact.total))}`;
    const okladRow   = oklad > 0 ? `<div class="income-sec-title">Оклад</div>${subtotal(okladLbl, oklad)}` : '';
    const kotelRow   = (d.detail.inFund && kotel > 0) ? `<div class="income-sec-title">Котёл</div><div class="kpi-bare-text" style="font-size:10px;margin-bottom:6px">Участников котла: ${fundCount}</div>${subtotal('Доля котла', kotel)}` : '';
    const noKoefTotal = Math.round(baseOklad + crmSum + warmSum + kotel);
    const noKoefRow = `<div class="income-sec-title">Без коэффициентов</div>${subtotal('Оклад 100% + Премия + Котёл', noKoefTotal)}`;

    setLiveHTML(el, `
      <div class="w" style="padding-top:16px">
        <div class="kpi-subtitle">Доход за месяц<button class="kpi-subtitle-info" onclick="openSalInfo()">i</button></div>
        <div class="kpi-income-panel" style="background:rgba(${accR},${accG},${accB},0.15)">
          <div class="income-cols" style="margin-bottom:0">
            <div class="income-col" style="${pctToneStyle(d.fact.pct)}">
              <span class="ic-koef ${koefClass(factKoef)}">×${factKoef.toFixed(1)}</span>
              <div class="ic-lbl">ФАКТ</div>
              <div class="ic-val" style="color:${pctClr(d.fact.pct)}">${fmtRub(Math.round(d.fact.total))}</div>
            </div>
            <div class="income-col" style="${pctToneStyle(d.prognoz.pct)}">
              <span class="ic-koef ${koefClass(progKoef)}">×${progKoef.toFixed(1)}</span>
              <div class="ic-lbl">ПРОГНОЗ</div>
              <div class="ic-val" style="color:${pctClr(d.prognoz.pct)}">${fmtRub(Math.round(d.prognoz.total))}</div>
            </div>
          </div>
        </div>
        <div class="kpi-subtitle" style="margin-top:16px">Детализация</div>
        <div style="padding-bottom:16px">
          <div class="kpi-bare-text" style="font-size:10px;margin-bottom:8px;line-height:1.5">
            Оклад + (Премия × К) = Итог<br>${okladFormula}
          </div>
          ${okladRow}
          <div class="income-sec-title">CRM</div>
          <div class="income-badges">
            ${badge('Визиты', d.detail.crm.vis, d.detail.crm.cnt?.vis)}${badge('Кредит', d.detail.crm.kred, d.detail.crm.cnt?.kred)}${badge('Наличка', d.detail.crm.nal, d.detail.crm.cnt?.nal)}
          </div>
          <div class="income-badges">
            ${badge('Обмен', d.detail.crm.obmen, d.detail.crm.cnt?.obmen)}${badge('Комиссия', d.detail.crm.kom, d.detail.crm.cnt?.kom)}${badge('Задаток', d.detail.crm.zadatok, d.detail.crm.cnt?.zadatok)}
          </div>
          ${subtotal('Итого CRM', crmSum)}
          <div class="income-sec-title">Тёплые лиды</div>
          <div class="income-badges">
            ${badge('Визиты', d.detail.warm.vis, d.detail.warm.cnt?.vis)}${badge('Кредит', d.detail.warm.kred, d.detail.warm.cnt?.kred)}${badge('Наличка', d.detail.warm.nal, d.detail.warm.cnt?.nal)}
          </div>
          <div class="income-badges" style="grid-template-columns:repeat(2,1fr)">
            ${badge('Обмен', d.detail.warm.obmen, d.detail.warm.cnt?.obmen)}${badge('Комиссия', d.detail.warm.kom, d.detail.warm.cnt?.kom)}
          </div>
          ${subtotal('Итого Тёплые лиды', warmSum)}
          ${kotelRow}
          ${noKoefRow}
          ${buildDayCalendar(nameLow, S.data.vizity||[], {
            rCrmVis:   parseRate((S.data.stavki||[])[8]?.[1]),
            rCrmKred:  parseRate((S.data.stavki||[])[9]?.[1]),
            rCrmNal:   parseRate((S.data.stavki||[])[10]?.[1]),
            rCrmObmen: parseRate((S.data.stavki||[])[11]?.[1]),
            rCrmKom:   parseRate((S.data.stavki||[])[12]?.[1]),
            rWarmVis:  parseRate((S.data.stavki||[])[14]?.[1]),
            rWarmKred: parseRate((S.data.stavki||[])[15]?.[1]),
            rWarmNal:  parseRate((S.data.stavki||[])[16]?.[1]),
            rWarmObmen:parseRate((S.data.stavki||[])[17]?.[1]),
            rWarmKom:  parseRate((S.data.stavki||[])[18]?.[1]),
            rZadatok:  parseRate((S.data.stavki||[])[20]?.[1]),
          }, false)}
        </div>
      </div>`);
  }
}

function renderDohodCrm(el) {
  if (!S.data.vizity || !S.data.plan) { if (!S.silentRefresh) el.innerHTML = loader(); return; }
  if (!S.data.stavki) { if (!S.silentRefresh) el.innerHTML = loader(); return; }

  const planData = S.data.plan || [];
  const planNames = planData.slice(1)
    .filter(r => r && r[0])
    .map(r => String(r[0]).trim())
    .filter(name => {
      const role = getRoleByName(name.toLowerCase().trim());
      return role === 'crm' || role === '';
    });
  if (!planNames.length) { el.innerHTML = '<div class="empty">Нет данных</div>'; return; }

  const mgrRows = planNames.map(name => name);
  const parsed = mgrRows.map(name => {
    const nameLow = name.toLowerCase().trim();
    const sal = calcSalary(nameLow);
    return { name: name.toUpperCase(), nameLow, sal };
  });

  // Сортировка по прогнозному доходу
  parsed.sort((a, b) => {
    const aT = a.sal ? a.sal.prognoz.total : 0;
    const bT = b.sal ? b.sal.prognoz.total : 0;
    return bT - aT;
  });

  const totalFund = parsed.reduce((s, p) => s + (p.sal ? Math.round(p.sal.prognoz.total) : 0), 0);
  const maxAmt = parsed[0]?.sal ? Math.round(parsed[0].sal.prognoz.total) : 0;
  const total  = parsed.length;
  const isLight = (document.body.classList.contains('light')||document.body.classList.contains('tiffany'));
  const accR = isLight ? 81 : 232, accG = isLight ? 55 : 255, accB = isLight ? 221 : 71;

  const rows = parsed.map((item, idx) => {
    const rs = rankStyles(idx, total);
    const progTotal = item.sal ? Math.round(item.sal.prognoz.total) : 0;
    const w = maxAmt ? Math.round(progTotal / maxAmt * 100) : 0;
    let detailBtn = '';
    if (item.sal) {
      const det = {
        nameLow:  item.nameLow,
        crm:      item.sal.detail.crm,
        warm:     item.sal.detail.warm,
        oklad:    item.sal.detail.oklad,
        baseOklad:item.sal.detail.baseOklad,
        workedR:  item.sal.detail.workedR,
        totalR:   item.sal.detail.totalR,
        premium:  item.sal.detail.premium,
        kotel:    item.sal.detail.kotel,
        fundCount:item.sal.detail.fundCount,
        inFund:   item.sal.detail.inFund,
        fact:     item.sal.fact,
        prognoz:  item.sal.prognoz,
      };
      detailBtn = `<button class="mop-info-btn" style="position:absolute;top:10px;right:10px" onclick="openIncomeDetail(this)" data-income='${JSON.stringify(det).replace(/'/g,"&#39;")}' data-total="">i</button>`;
    }
    const incomeCols = item.sal ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 4px">
        <div class="income-col" style="${pctToneStyle(item.sal.fact.pct)}">
          <span class="ic-koef ${koefClass(item.sal.fact.koef)}">×${item.sal.fact.koef.toFixed(1)}</span>
          <div class="ic-lbl">ФАКТ</div>
          <div class="ic-val" style="color:${pctClr(item.sal.fact.pct)}">${fmtRub(Math.round(item.sal.fact.total))}</div>
        </div>
        <div class="income-col" style="${pctToneStyle(item.sal.prognoz.pct)}">
          <span class="ic-koef ${koefClass(item.sal.prognoz.koef)}">×${item.sal.prognoz.koef.toFixed(1)}</span>
          <div class="ic-lbl">ПРОГНОЗ</div>
          <div class="ic-val" style="color:${pctClr(item.sal.prognoz.pct)}">${fmtRub(Math.round(item.sal.prognoz.total))}</div>
        </div>
      </div>` : `<div style="text-align:right"><span class="zp-a" style="color:${rs.color}">—</span></div>`;

    return `<div class="zp-row" style="--rank-r:${rs.r};--rank-g:${rs.g};--rank-b:${rs.b};border-color:${rs.border}">${detailBtn}<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span class="rank-badge" style="background:${rs.badgeBg};color:${rs.color}">${idx+1}</span><span class="zp-n" style="color:var(--txt)">${item.name}</span>${getMgrMessengerHtml(item.name)}</div>${incomeCols}</div>`;
  }).join('');

  setLiveHTML(el, `<div class="zp-banner" style="background:rgba(${accR},${accG},${accB},0.15);position:relative"><div class="zl">Прогноз фонда отдела</div><div class="zv">${fmtRub(totalFund)}</div><button class="income-modal-info-btn" onclick="openSalInfo('crm')" title="Как считается зарплата" style="position:absolute;top:10px;right:10px">i</button></div><div class="sec-title">Топ по доходу</div><div class="zp-list">${rows}</div>`);
}

function renderDohodDozhim(el) {
  if (!S.data.d_vizity || !S.data.plan) { if (!S.silentRefresh) el.innerHTML = loader(); return; }

  const planData = S.data.plan || [];
  const planM    = getPlanMap(planData);
  const dStats   = buildDozhimStats(S.data.d_vizity);

  const dozhimNames = planData.slice(1)
    .filter(r => r && r[0])
    .map(r => String(r[0]).trim())
    .filter(name => getRoleByName(name.toLowerCase().trim()) === 'dozhim');

  if (!dozhimNames.length) { el.innerHTML = '<div class="empty">Нет данных по дожиму</div>'; return; }

  const parsed = dozhimNames.map(name => {
    const nameLow = name.toLowerCase().trim();
    const sal = calcSalaryDozhimFromVizity(nameLow);
    return { name: name.toUpperCase(), nameLow, sal };
  });
  parsed.sort((a, b) => {
    const aT = a.sal ? a.sal.fact.total : 0;
    const bT = b.sal ? b.sal.fact.total : 0;
    return bT - aT;
  });

  const totalFund = parsed.reduce((s, p) => s + (p.sal ? Math.round(p.sal.fact.total) : 0), 0);
  const maxAmt = parsed[0]?.sal ? Math.round(parsed[0].sal.fact.total) : 0;
  const total  = parsed.length;
  const isLight = (document.body.classList.contains('light')||document.body.classList.contains('tiffany'));
  const accR = isLight ? 81 : 232, accG = isLight ? 55 : 255, accB = isLight ? 221 : 71;

  const rows = parsed.map((item, idx) => {
    const rs = rankStyles(idx, total);
    const factTotal = item.sal ? Math.round(item.sal.fact.total) : 0;
    const w = maxAmt ? Math.round(factTotal / maxAmt * 100) : 0;
    let detailBtn = '';
    if (item.sal) {
      const det = {
        nameLow: item.nameLow,
        oklad: item.sal.detail.oklad, baseOklad: item.sal.detail.baseOklad,
        workedR: item.sal.detail.workedR, totalR: item.sal.detail.totalR,
        premium: item.sal.detail.premium, kotel: item.sal.detail.kotel,
        kotelTotal: item.sal.detail.kotelTotal, fundCount: item.sal.detail.fundCount,
        inFund: item.sal.detail.inFund,
        ch800: item.sal.detail.ch800, ch1000: item.sal.detail.ch1000,
        earn800: item.sal.detail.earn800, earn1000: item.sal.detail.earn1000,
        fact: item.sal.fact, prognoz: item.sal.prognoz,
      };
      detailBtn = `<button class="mop-info-btn" style="position:absolute;top:10px;right:10px" onclick="openDozhimIncomeModal(this)" data-income='${JSON.stringify(det).replace(/'/g,"&#39;")}' data-total="">i</button>`;
    }
    const incomeCols = item.sal
      ? `<div style="text-align:right;margin:6px 0 4px"><span class="zp-a" style="color:${rs.color}">${fmtRub(factTotal)}</span></div>`
      : `<div style="text-align:right;margin:6px 0 4px"><span class="zp-a" style="color:var(--acc)">—</span></div>`;
    return `<div class="zp-row" style="--rank-r:${rs.r};--rank-g:${rs.g};--rank-b:${rs.b};border-color:${rs.border}">${detailBtn}<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span class="rank-badge" style="background:${rs.badgeBg};color:${rs.color}">${idx+1}</span><span class="zp-n" style="color:var(--txt)">${item.name}</span>${getMgrMessengerHtml(item.name)}</div>${incomeCols}</div>`;
  }).join('');

  setLiveHTML(el, `<div class="zp-banner" style="background:rgba(${accR},${accG},${accB},0.15);position:relative"><div class="zl">Фонд дожима (факт)</div><div class="zv">${fmtRub(totalFund)}</div><button class="income-modal-info-btn" onclick="openSalInfo('dozhim')" title="Как считается зарплата" style="position:absolute;top:10px;right:10px">i</button></div><div class="sec-title">Топ по доходу</div><div class="zp-list">${rows}</div>`);
}

function setDohodTab(tab) {
  S.dohodTab = tab;
  updateFirebasePage();
  const el = document.getElementById('c-dohod');
  if (tab === 'dozhim' && (!S.data.d_vizity || !S.data.plan)) {
    el.innerHTML = loader();
    Promise.all([
      S.data.d_vizity ? Promise.resolve(S.data.d_vizity) : api(SHEETS.d_vizity, 'A:N').catch(() => []),
      S.data.plan     ? Promise.resolve(S.data.plan)     : api(SHEETS.plan,     'A:D').catch(() => []),
      S.data.grafik   ? Promise.resolve(S.data.grafik)   : api(SHEETS.grafik,   'A1:AI25').catch(() => []),
    ]).then(([dvizity, plan, grafik]) => {
      S.data.d_vizity = dvizity;
      S.data.plan     = plan;
      S.data.grafik   = grafik;
      renderDohod();
    });
    return;
  }
  renderDohod();
}

// ==================== GRAFIK ====================
const DOW = ['вс','пн','вт','ср','чт','пт','сб'];
let _schedWeek = null;
let _schedEditPopover = null;

function sheetColName(idx) {
  let n = idx + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function normalizeSchedVal(v) {
  const s = String(v || '').trim().toUpperCase();
  if (s === 'Р' || s === 'Р*') return 'Р';
  if (s === 'В' || s === 'В*') return 'В';
  if (s === 'ВС') return 'ВС';
  if (s === 'О')  return 'О';
  return '';
}
// Возвращает сырое значение ячейки (Р, Р*, В, В*, ВС, О, '')
function rawSchedVal(v) {
  const s = String(v || '').trim().toUpperCase();
  if (s === 'Р' || s === 'Р*') return s;
  if (s === 'В' || s === 'В*') return s;
  if (s === 'ВС') return 'ВС';
  if (s === 'О')  return 'О';
  return '';
}
// Цвет/стиль ячейки в приложении по сырому значению
const SCHED_CELL_BG = { 'В': '#f50e02', 'В*': '#ffff00', 'Р*': '#4386f5', 'О': '#ff9500' };
const SCHED_CELL_FG = { 'В': '#fff',    'В*': '#222',    'Р*': '#fff',    'О': '#fff'    };
function schedCellAppStyle(rawVal) {
  const bg = SCHED_CELL_BG[rawVal];
  if (!bg) return '';
  return ` style="background:${bg};color:${SCHED_CELL_FG[rawVal]}"`;
}
// Цвет фона в Google Sheets по сырому значению
const SCHED_SHEET_BG = {
  'В':  { red: 0.961, green: 0.055, blue: 0.008 },
  'В*': { red: 1,     green: 1,     blue: 0     },
  'Р*': { red: 0.263, green: 0.525, blue: 0.961 },
  'О':  { red: 1,     green: 0.584, blue: 0     }, // #ff9500 — отпуск
};
// Показываем звёздочки в дропдауне (перед открытием)
function schedBulkShowStars(sel) {
  for (const opt of sel.options) {
    if (opt.value === 'Р*') opt.text = 'Р*';
    else if (opt.value === 'В*') opt.text = 'В*';
  }
}
// Прячем звёздочки в закрытом select (после выбора / потери фокуса)
function schedBulkHideStars(sel) {
  for (const opt of sel.options) {
    if (opt.value === 'Р*') opt.text = 'Р';
    else if (opt.value === 'В*') opt.text = 'В';
  }
}
// Обработчик изменения select в bulk-редакторе
function schedBulkSelectChanged(sel) {
  const v = sel.value;
  sel.style.background = SCHED_CELL_BG[v] || '';
  sel.style.color      = SCHED_CELL_FG[v] || '';
  schedBulkHideStars(sel);
}

function canEditScheduleName(name) {
  const matched = findUserInSheet();
  if (!matched) return false;
  if (isCeoLike(matched.role)) return true;
  return String(name || '').trim().toLowerCase() === String(matched.name || '').trim().toLowerCase();
}

async function putScheduleCell(sheetRow, colIdx, value) {
  const sheet = SHEETS.grafik;
  const col = sheetColName(colIdx);
  const range = `'${sheet}'!${col}${sheetRow}:${col}${sheetRow}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  // В таблицу пишем без звёздочки (Р*/В* → Р/В), цвет форматируем отдельно
  const sheetValue = normalizeSchedVal(value) || '';
  const resp = await fetch(url, {
    method: 'PUT',
    headers: await authHeaders({ 'Content-Type':'application/json' }),
    body: JSON.stringify({ values: [[sheetValue]] })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Ошибка сохранения графика');
  }
  await formatScheduleCell(sheet, sheetRow, colIdx, value); // value с звёздочкой — для цвета
  apiCacheInvalidate(SHEETS.grafik);
  S.data.grafikFmt = null; // сбрасываем кеш цветов — перечитаем при следующем рендере
}

async function getSpreadsheetSheetId(sheetName) {
  S._sheetIdCache = S._sheetIdCache || {};
  if (S._sheetIdCache[sheetName] !== undefined) return S._sheetIdCache[sheetName];
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}?fields=sheets.properties`;
  const resp = await fetch(url, { headers: await authHeaders() });
  if (!resp.ok) return null;
  const data = await resp.json();
  (data.sheets || []).forEach(s => {
    S._sheetIdCache[s.properties.title] = s.properties.sheetId;
  });
  return S._sheetIdCache[sheetName] ?? null;
}

async function formatScheduleCell(sheetName, sheetRow, colIdx, value) {
  const sheetId = await getSpreadsheetSheetId(sheetName);
  if (sheetId === null) return;
  const raw  = rawSchedVal(value);
  const bg   = SCHED_SHEET_BG[raw];
  const cell = bg ? { userEnteredFormat: { backgroundColor: bg } }
                  : { userEnteredFormat: {} };
  const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}:batchUpdate`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type':'application/json' }),
    body: JSON.stringify({
      requests: [{
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: sheetRow - 1,
            endRowIndex: sheetRow,
            startColumnIndex: colIdx,
            endColumnIndex: colIdx + 1,
          },
          cell,
          fields: 'userEnteredFormat.backgroundColor',
        }
      }]
    })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Ошибка форматирования графика');
  }
}

function findSchedDayCol(daysRow, dayNum) {
  for (let c = 1; c < (daysRow || []).length; c++) {
    if (parseInt(daysRow[c]) === dayNum) return c;
  }
  return -1;
}

function getWeeksForMonth(year, month) {
  const dim = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let d = 1; d <= dim; d++) {
    days.push({ day: d, dow: new Date(year, month, d).getDay() });
  }
  const weeks = [];
  let i = 0;
  while (i < days.length) {
    let end = i;
    while (end < days.length && days[end].dow !== 0) end++;
    if (end < days.length) {
      weeks.push(days.slice(i, end + 1));
      i = end + 1;
    } else {
      weeks.push(days.slice(i));
      break;
    }
  }
  return weeks;
}

// Строит индекс ГРАФИКИ: nameLow → { row, daysRow }
// Строка дней = строка с 20+ числами 1-31, запоминается как ближайшая выше
function buildSchedIndex(raw) {
  const idx = {};
  let lastDaysRow = [];
  for (let i = 0; i < (raw||[]).length; i++) {
    const r = raw[i];
    if (!r) continue;
    const nums = r.slice(1).filter(c => { const n = parseInt(c); return n >= 1 && n <= 31; }).length;
    if (nums >= 20) { lastDaysRow = r; continue; }
    const name = (r[0]||'').trim();
    if (name) idx[name.toLowerCase()] = { row: r, daysRow: lastDaysRow, sheetRow: i + 1, name };
  }
  return idx;
}

function parseGroup(rows, daysRow, weekDays) {
  const dRow = daysRow || [];
  return rows.filter(r => r[0] && r[0].trim()).map(r => {
    const cells = weekDays.map(dayNum => {
      let colIdx = -1;
      for (let c = 1; c <= 31; c++) {
        if (parseInt(dRow[c]) === dayNum) { colIdx = c; break; }
      }
      return colIdx >= 0 ? (r[colIdx] || '') : '';
    });
    return { name: r[0], cells };
  });
}

// Определяет Р* / В* / О по цвету фона ячейки из Google Sheets API (float 0-1)
function colorToSchedVariant(bg) {
  if (!bg) return null;
  const r = bg.red || 0, g = bg.green || 0, b = bg.blue || 0;
  const near = (a, x) => Math.abs(a - x) < 0.06;
  if (near(r, 0.263) && near(g, 0.525) && near(b, 0.961)) return 'Р*'; // #4386f5
  if (near(r, 1)     && near(g, 1)     && near(b, 0))     return 'В*'; // #ffff00
  if (near(r, 1)     && near(g, 0.584) && near(b, 0))     return 'О';  // #ff9500 — отпуск
  return null;
}

// Загружает цвета заливки ячеек листа ГРАФИКИ и кеширует в S.data.grafikFmt
// grafikFmt — объект вида { rowIndex: { colIndex: 'Р*'|'В*' } }, индексы 0-based
async function fetchGrafikFmt() {
  try {
    const range  = encodeURIComponent(`'${SHEETS.grafik}'!A1:AI25`);
    const fields = 'sheets.data.rowData.values.userEnteredFormat.backgroundColor';
    const url    = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}`
                 + `?ranges=${range}&fields=${fields}&includeGridData=true`;
    const resp = await fetch(url, { headers: await authHeaders() });
    if (!resp.ok) { S.data.grafikFmt = {}; return; }
    const data    = await resp.json();
    const rowData = data?.sheets?.[0]?.data?.[0]?.rowData || [];
    const fmt     = {};
    rowData.forEach((row, ri) => {
      (row.values || []).forEach((cell, ci) => {
        const variant = colorToSchedVariant(cell?.userEnteredFormat?.backgroundColor);
        if (variant) { (fmt[ri] = fmt[ri] || {})[ci] = variant; }
      });
    });
    S.data.grafikFmt = fmt;
  } catch (e) {
    S.data.grafikFmt = {};
  }
}

// Возвращает значение ячейки с учётом цвета из Sheets (textVal — то, что читаем из массива данных)
function resolveSchedVal(textVal, sheetRow, colIdx) {
  const variant = S.data.grafikFmt?.[sheetRow - 1]?.[colIdx];
  if (!variant) return textVal;
  const norm = normalizeSchedVal(textVal);
  if (variant === 'Р*' && norm === 'Р') return 'Р*';
  if (variant === 'В*' && norm === 'В') return 'В*';
  if (variant === 'О'  && norm === 'О') return 'О';
  return textVal;
}

function renderGrafik() {
  const el  = document.getElementById('c-grafik');
  const raw = S.data.grafik;
  if (!raw || raw.length < 3) { el.innerHTML = '<div class="empty">Нет данных</div>'; return; }

  // Загружаем цвета заливки из Sheets, если ещё не загружены; после загрузки перерисуем
  if (S.data.grafikFmt === null) {
    S.data.grafikFmt = 'loading'; // sentinel — не запускать повторно
    fetchGrafikFmt().then(() => { if (document.getElementById('c-grafik')) renderGrafik(); });
  }

  const mo    = parseInt(currentSuffix.slice(0,2));
  const yr    = 2000 + parseInt(currentSuffix.slice(2,4));
  const weeks = getWeeksForMonth(yr, mo - 1);
  if (_schedWeek === null) {
    const today = new Date();
    const tw = weeks.findIndex(w => w.some(d => d.day === today.getDate() && today.getMonth()+1 === mo && today.getFullYear() === yr));
    _schedWeek = tw >= 0 ? tw : 0;
  }
  _schedWeek = Math.max(0, Math.min(_schedWeek, weeks.length-1));
  const week    = weeks[_schedWeek];
  const weekDays = week.map(d => d.day);
  const today   = new Date();
  const isToday = d => d === today.getDate() && today.getMonth()+1 === mo && today.getFullYear() === yr;

  // 1. Строим индекс ГРАФИКИ: nameLow → { row, daysRow }
  //    «строка дней» — ближайшая выше строка, в которой 20+ ячеек являются числами 1-31
  function isDaysRow(r) {
    return r && r.slice(1).filter(c => { const n = parseInt(c); return n >= 1 && n <= 31; }).length >= 20;
  }
  const schedIndex = {};
  let lastDaysRow = raw[1] || [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (!r) continue;
    if (isDaysRow(r)) { lastDaysRow = r; continue; }
    const name = (r[0]||'').trim();
    if (!name) continue;
    schedIndex[name.toLowerCase()] = { name, row: r, daysRow: lastDaysRow, sheetRow: i + 1 };
  }

  // 2. Собираем CRM и ДОЖИМ из USERS
  const users = S.usersData || [];
  const crmNames    = [];
  const dozhimNames = [];
  for (let i = 1; i < users.length; i++) {
    const u = users[i];
    if (!u || !u[1]) continue;
    const name = u[1].trim();
    const role = (u[2]||'crm').toLowerCase().trim();
    if (isCeoLike(role)) continue;
    if (role === 'dozhim') dozhimNames.push(name);
    else crmNames.push(name);
  }

  // Авторизованный пользователь — в начало своего отдела
  const me = findUserInSheet();
  const myName = me?.name || '';
  const myRole = me?.role || '';
  if (myName) {
    const moveFirst = arr => {
      const idx = arr.findIndex(n => n.toLowerCase() === myName.toLowerCase());
      if (idx > 0) { arr.splice(idx, 1); arr.unshift(myName); }
    };
    moveFirst(crmNames);
    moveFirst(dozhimNames);
  }
  const myDeptIsDozhim = myRole === 'dozhim';

  // 3. Строим объект person для отображения
  function makePerson(name) {
    const entry = schedIndex[name.toLowerCase()];
    const daysRow = entry ? entry.daysRow : [];
    const cells = weekDays.map(dayNum => {
      if (!entry) return '';
      const colIdx = findSchedDayCol(daysRow, dayNum);
      if (colIdx < 0) return '';
      const textVal = entry.row[colIdx] || '';
      return resolveSchedVal(textVal, entry.sheetRow, colIdx);
    });
    return { name, cells, found: !!entry, entry };
  }

  const crmPeople    = crmNames.map(makePerson).filter(p => p.found);
  const dozhimPeople = dozhimNames.map(makePerson).filter(p => p.found);

  // 4. Шапка с числами рабочих в день
  const workerCounts = weekDays.map((_, wi) =>
    crmPeople.filter(p => normalizeSchedVal(p.cells[wi]) === 'Р').length
  );
  const hdrs = week.map((d, wi) => {
    const cnt = workerCounts[wi];
    const under = cnt < 6 && cnt > 0 ? ' understaffed' : '';
    const today = isToday(d.day) ? ' today' : '';
    return `<div class="sched-day-hdr${today}${under}"><div class="sd-date"><div class="sd-num">${d.day}</div><div class="sd-dow">${DOW[d.dow]}</div></div><div class="sd-divider"></div><div class="sd-workers">${cnt}</div></div>`;
  }).join('');
  const weekHeader = `<div class="sched-week">${hdrs}</div>`;

  // 5. Карточки
  function buildCards(people) {
    return people.map(p => {
      const cells = p.cells.map((val, wi) => {
        const norm = normalizeSchedVal(val);
        const raw  = rawSchedVal(val);
        // Р* и В* получают свои классы dr-star/dv-star (без inline-стиля)
        // чтобы !important правила тем не затирали их цвета
        let cls, extraStyle;
        if (raw === 'Р*')      { cls = 'dr-star'; extraStyle = ''; }
        else if (raw === 'В*') { cls = 'dv-star'; extraStyle = ''; }
        else if (raw === 'О')  { cls = 'do-vac';  extraStyle = schedCellAppStyle('О'); }
        else {
          cls = norm==='Р'?'dr':norm==='В'?'dv':norm==='ВС'?'dvs':val?'':'empty';
          extraStyle = schedCellAppStyle(raw); // для В — inline #f50e02
        }
        const entry = p.entry;
        const dayNum = week[wi]?.day || 0;
        const colIdx = entry ? findSchedDayCol(entry.daysRow, dayNum) : -1;
        const canEdit = entry && colIdx >= 0 && canEditScheduleName(p.name);
        const editAttrs = canEdit
          ? ` role="button" tabindex="0" onclick="openSchedCellEditor(event, ${entry.sheetRow}, ${colIdx}, '${escapeAttr(p.name)}', ${dayNum})" onkeydown="if(event.key==='Enter'||event.key===' '){openSchedCellEditor(event, ${entry.sheetRow}, ${colIdx}, '${escapeAttr(p.name)}', ${dayNum})}"`
          : '';
        return `<div class="sched-cell ${cls}${canEdit?' editable':''}${isToday(dayNum)?' today-col':''}" data-sched-cell="${entry ? entry.sheetRow + '-' + colIdx : ''}"${editAttrs}${extraStyle}>${norm||'·'}</div>`;
      }).join('');
      const sched = getWorkedAndTotalR(p.name.toLowerCase().trim());
      const workedBadge = sched
        ? `<span style="font-family:'Unbounded',sans-serif;font-size:10px;font-weight:700;color:var(--acc);margin-left:auto">отработано ${sched.workedR}<span style="color:var(--txt3);font-weight:500"> / ${sched.totalR}</span></span>`
        : '';
      const missing = !p.found ? `<span style="font-size:10px;color:var(--txt3);margin-left:auto">нет в графике</span>` : '';
      return `<div class="sched-person"><div class="sched-person-name" style="display:flex;align-items:center;gap:8px"><span>${p.name}</span>${getMgrMessengerHtml(p.name)}${workedBadge}${missing}</div><div class="sched-cells">${cells}</div></div>`;
    }).join('');
  }

  // 6. Заголовки групп берём из первой непустой строки-нечисла ГРАФИКИ
  const groupTitles = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[0] || !r[0].trim()) continue;
    if (!isDaysRow(r) && !schedIndex[r[0].trim().toLowerCase()]) {
      groupTitles.push(r[0].trim());
      if (groupTitles.length >= 2) break;
    }
  }
  const g1title = groupTitles[0] || 'CRM';
  const g2title = groupTitles[1] || 'ДОЖИМ';

  const firstTitle  = myDeptIsDozhim ? g2title    : g1title;
  const firstPeople = myDeptIsDozhim ? dozhimPeople : crmPeople;
  const secTitle    = myDeptIsDozhim ? g1title     : g2title;
  const secPeople   = myDeptIsDozhim ? crmPeople   : dozhimPeople;
  setLiveHTML(el, `<div class="sched-group-title" style="margin-top:4px">${firstTitle}</div>${buildCards(firstPeople)}<div class="sched-group-title">${secTitle}</div>${buildCards(secPeople)}`);

  const stickyEl    = document.getElementById('grafik-sticky');
  const stickyInner = document.getElementById('grafik-sticky-inner');
  if (stickyEl && stickyInner) {
    stickyEl.style.display = '';
    const wStart = week[0].day, wEnd = week[week.length-1].day;
    const mName  = new Date(yr, mo-1, 1).toLocaleString('ru',{month:'long'});
    const prevDis = _schedWeek === 0 ? 'disabled' : '';
    const nextDis = _schedWeek === weeks.length-1 ? 'disabled' : '';
    const schedIconBase = document.body.classList.contains('cosmic') ? COSMIC_ICON_BASE :
                          document.body.classList.contains('fluent') ? FLUENT_ICON_BASE : DEFAULT_ICON_BASE;
    const leftIco  = document.body.classList.contains('fluent') ? 'FluentColor-Left.svg'       : 'left.svg';
    const rightIco = document.body.classList.contains('fluent') ? 'FluentColor-Right.svg'      : 'right.svg';
    const editIco  = document.body.classList.contains('fluent') ? 'FluentColor-GrafikEdit.svg' : 'edit.svg';
    const vacIco   = document.body.classList.contains('fluent') ? 'FluentColor-Vacation.svg'
                   : document.body.classList.contains('cosmic') ? 'cosmic_vacation.svg'
                   : 'vacation.svg';
    stickyInner.innerHTML = `<div class="sched-nav"><button class="sched-nav-btn" onclick="schedNav(-1)" ${prevDis} aria-label="Предыдущая неделя"><span class="sched-nav-icon" style="--sched-nav-icon:url('${schedIconBase}${leftIco}')"></span></button><div class="sched-nav-title">${wStart}–${wEnd} ${mName}</div><button class="sched-vac-btn" onclick="openVacationCalendar()" aria-label="Календарь отпусков"><span class="sched-vac-icon" style="--sched-vac-icon:url('${schedIconBase}${vacIco}')"></span></button><button class="sched-edit-btn" onclick="openScheduleBulkEditor()" aria-label="Редактировать график"><span class="sched-edit-icon" style="--sched-edit-icon:url('${schedIconBase}${editIco}')"></span></button><button class="sched-nav-btn" onclick="schedNav(1)" ${nextDis} aria-label="Следующая неделя"><span class="sched-nav-icon" style="--sched-nav-icon:url('${schedIconBase}${rightIco}')"></span></button></div>${weekHeader}`;
    const hdr = document.querySelector('header');
    const nav = document.getElementById('main-nav');
    if (hdr && nav) stickyEl.style.top = (hdr.offsetHeight + nav.offsetHeight) + 'px';
  }
}

function schedNav(dir) {
  _schedWeek = (_schedWeek||0) + dir;
  if (S.data.grafik) renderGrafik();
}

/* ═══ Календарь отпусков ═══ */
let _vacCalCache = null; // { rows, fmts } — cached per session

async function fetchVacationCalendar() {
  const sheetName = SHEETS.vacationCalendar || 'Календарь 2026';
  const range  = encodeURIComponent(`'${sheetName}'!A1:W40`);
  const fields = 'sheets.data.rowData.values(formattedValue,effectiveValue,userEnteredFormat.backgroundColor)';
  const url    = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}`
               + `?ranges=${range}&fields=${fields}&includeGridData=true`;
  const resp = await fetch(url, { headers: await authHeaders() });
  if (!resp.ok) throw new Error('vac fetch failed: ' + resp.status);
  const data = await resp.json();
  const rowData = data?.sheets?.[0]?.data?.[0]?.rowData || [];
  // Преобразуем в массив строк объектов { v, bg }
  const grid = rowData.map(row =>
    (row.values || []).map(cell => ({
      v: (cell?.formattedValue ?? '').toString(),
      bg: cell?.userEnteredFormat?.backgroundColor || null,
    }))
  );
  return grid;
}

// Парсим лист «Отпуска 2026» (A:Менеджер, B:Начало, C:Конец, D:Комментарий)
// с цветом фона A-ячейки как идентификатором менеджера.
async function fetchVacationsList() {
  const sheetName = SHEETS.vacationsList || 'Отпуска 2026';
  const range  = encodeURIComponent(`'${sheetName}'!A1:D300`);
  // Берём все возможные источники цвета: старое backgroundColor и новое
  // backgroundColorStyle.rgbColor — на случай conditional formatting с rgbColor
  const fields = 'sheets.data.rowData.values(formattedValue,userEnteredFormat(backgroundColor,backgroundColorStyle/rgbColor),effectiveFormat(backgroundColor,backgroundColorStyle/rgbColor))';
  const url    = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}`
               + `?ranges=${range}&fields=${fields}&includeGridData=true`;
  const resp = await fetch(url, { headers: await authHeaders() });
  if (!resp.ok) throw new Error('vac-list fetch failed: ' + resp.status);
  const data = await resp.json();
  const rowData = data?.sheets?.[0]?.data?.[0]?.rowData || [];
  const rows = rowData.map(r => r.values || []);
  return rows;
}

// Парсим лист «Менеджеры Отпусков 2026» — словарь { имя → цвет }.
// Колонка A: ФИО, колонка B: ячейка с заливкой (без текста). Берём цвет фона B.
async function fetchVacationManagerColors() {
  const sheetName = SHEETS.vacationManagers || 'Менеджеры Отпусков 2026';
  const range  = encodeURIComponent(`'${sheetName}'!A1:B100`);
  const fields = 'sheets.data.rowData.values(formattedValue,userEnteredFormat(backgroundColor,backgroundColorStyle/rgbColor),effectiveFormat(backgroundColor,backgroundColorStyle/rgbColor))';
  const url    = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}`
               + `?ranges=${range}&fields=${fields}&includeGridData=true`;
  const resp = await fetch(url, { headers: await authHeaders() });
  if (!resp.ok) throw new Error('vac-mgr fetch failed: ' + resp.status);
  const data = await resp.json();
  const rowData = data?.sheets?.[0]?.data?.[0]?.rowData || [];
  const map = {};
  // Пропускаем заголовок (строка 0)
  for (let i = 1; i < rowData.length; i++) {
    const r = rowData[i]?.values || [];
    const name = (r[0]?.formattedValue || '').trim();
    if (!name) continue;
    const candidates = [
      r[1]?.effectiveFormat?.backgroundColorStyle?.rgbColor,
      r[1]?.effectiveFormat?.backgroundColor,
      r[1]?.userEnteredFormat?.backgroundColorStyle?.rgbColor,
      r[1]?.userEnteredFormat?.backgroundColor,
    ].filter(Boolean);
    const bg = _vacPickBestBg(candidates);
    if (bg) map[name] = bg;
  }
  return map;
}

function _parseRuDate(s) {
  const m = String(s||'').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (!m) return null;
  const dd = parseInt(m[1],10);
  const mo = parseInt(m[2],10) - 1;
  const yr = m[3].length === 2 ? 2000 + parseInt(m[3],10) : parseInt(m[3],10);
  if (mo < 0 || mo > 11 || dd < 1 || dd > 31) return null;
  return { year: yr, month: mo, day: dd, ts: Date.UTC(yr, mo, dd) };
}

function parseVacationsList(rows) {
  const periods = [];
  // Пропускаем заголовок (строка 0)
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = (r[0]?.formattedValue || '').trim();
    const startStr = (r[1]?.formattedValue || '').trim();
    const endStr = (r[2]?.formattedValue || '').trim();
    if (!name || !startStr || !endStr) continue;
    const start = _parseRuDate(startStr);
    const end = _parseRuDate(endStr);
    if (!start || !end) continue;
    if (end.ts < start.ts) continue;
    // Собираем все источники цвета (новый/старый API × userEntered/effective)
    // и выбираем самый «отличный от белого/банинга» — это и есть цвет менеджера.
    const candidates = [
      r[0]?.effectiveFormat?.backgroundColorStyle?.rgbColor,
      r[0]?.effectiveFormat?.backgroundColor,
      r[0]?.userEnteredFormat?.backgroundColorStyle?.rgbColor,
      r[0]?.userEnteredFormat?.backgroundColor,
    ].filter(Boolean);
    const bg = _vacPickBestBg(candidates);
    const comment = (r[3]?.formattedValue || '').trim();
    periods.push({ name, start, end, bg, comment });
  }
  return periods;
}

// Строим 12-месячный массив blocks из периодов (совместим с renderVacationCalendarInto).
// ВАЖНО: в days попадают ВСЕ дни месяца (1..monthLen), даже без отпусков —
// иначе в календаре пропадают пустые ячейки с номером дня.
function buildBlocksFromPeriods(periods, year) {
  const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
  const blocks = [];
  for (let mi = 0; mi < 12; mi++) {
    const monthLen = MONTH_DAYS[mi];
    // Инициализируем все дни месяца
    const seen = {};
    for (let day = 1; day <= monthLen; day++) {
      const d = new Date(Date.UTC(year, mi, day));
      const dow = (d.getUTCDay() + 6) % 7; // Пн=0 … Вс=6
      seen[day] = { day, dow, names: [], bg: null };
    }
    // Накладываем периоды
    periods.forEach(p => {
      let ts = p.start.ts;
      while (ts <= p.end.ts) {
        const d = new Date(ts);
        if (d.getUTCFullYear() === year && d.getUTCMonth() === mi) {
          const day = d.getUTCDate();
          seen[day].names.push(p.name);
          if (!seen[day].bg && p.bg) seen[day].bg = p.bg;
        }
        ts += 86400000;
      }
    });
    const days = Object.values(seen).map(d => ({
      day: d.day,
      dow: d.dow,
      names: d.names,
      name: d.names.join(' / '),
      bg: d.bg,
    }));
    blocks.push({ title: MONTHS[mi], monthIdx: mi, days });
  }
  return blocks;
}

function _vacBgToCss(bg) {
  if (!bg) return null;
  const r = Math.round((bg.red   || 0) * 255);
  const g = Math.round((bg.green || 0) * 255);
  const b = Math.round((bg.blue  || 0) * 255);
  // только чистый/почти белый считаем "нет фона" — пастельные оттенки оставляем
  if (r >= 253 && g >= 253 && b >= 253) return null;
  return `rgb(${r}, ${g}, ${b})`;
}

// Из нескольких источников цвета выбираем «самый отличающийся» — у банинга
// (alternating rows) цвет монотонно повторяется у всех ячеек, а conditional
// formatting даёт уникальные оттенки. Берём кандидата, наиболее далёкого
// от серого/белого (по сумме отклонений каналов от среднего и от 255).
function _vacPickBestBg(candidates) {
  if (!candidates || !candidates.length) return null;
  let best = null;
  let bestScore = -1;
  for (const c of candidates) {
    if (!c) continue;
    const r = Math.round((c.red   || 0) * 255);
    const g = Math.round((c.green || 0) * 255);
    const b = Math.round((c.blue  || 0) * 255);
    if (r >= 253 && g >= 253 && b >= 253) continue; // почти белый — мимо
    // Score: насколько далеко от белого + насколько цвет «насыщенный»
    const fromWhite = (255 - r) + (255 - g) + (255 - b);
    const avg = (r + g + b) / 3;
    const sat = Math.abs(r - avg) + Math.abs(g - avg) + Math.abs(b - avg);
    const score = fromWhite + sat * 2;
    if (score > bestScore) {
      bestScore = score;
      best = `rgb(${r}, ${g}, ${b})`;
    }
  }
  return best;
}

// Парсит лист на 12 блоков-месяцев. Сетка: 4 ряда × 3 колонки.
// Каждый блок: 7 столбцов (A-G | I-O | Q-W), 8 строк (title + dow + 6 weeks).
function parseVacationCalendar(grid) {
  const MONTHS = [
    'Январь','Февраль','Март','Апрель','Май','Июнь',
    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'
  ];
  const blocks = [];
  // 4 ряда × 3 столбца блоков
  const blockRowStarts = [0, 10, 20, 30];
  const blockColStarts = [0, 8, 16];
  let monthIdx = 0;
  for (let br = 0; br < blockRowStarts.length; br++) {
    for (let bc = 0; bc < blockColStarts.length; bc++) {
      const r0 = blockRowStarts[br];
      const c0 = blockColStarts[bc];
      // Заголовок месяца (в листе он может быть объединён — берём первую непустую ячейку из строки r0)
      let titleRow = grid[r0] || [];
      let titleText = '';
      for (let ci = c0; ci < c0 + 7; ci++) {
        if (titleRow[ci] && titleRow[ci].v && titleRow[ci].v.trim()) { titleText = titleRow[ci].v.trim(); break; }
      }
      if (!titleText) titleText = MONTHS[monthIdx] || '';
      const days = []; // массив { day, name, bg }
      // строки недель: r0+2 .. r0+7
      for (let rr = r0 + 2; rr <= r0 + 7; rr++) {
        const row = grid[rr] || [];
        for (let cc = c0; cc < c0 + 7; cc++) {
          const cell = row[cc];
          if (!cell) continue;
          const txt = (cell.v || '').trim();
          if (!txt) continue;
          // Текст ячейки: "5" или "5\nКиричок" или "5 Киричок"
          // Извлекаем число и опционально имя
          const m = txt.match(/^(\d{1,2})(?:[\s\n\r]+(.+))?$/s);
          if (!m) continue;
          const dayNum = parseInt(m[1], 10);
          // Несколько фамилий через перенос строки → массив имён
          const names = (m[2] || '')
            .split(/[\r\n]+/)
            .map(s => s.trim())
            .filter(Boolean);
          const name = names.join(' / '); // совместимость
          const bg = _vacBgToCss(cell.bg);
          const dow = cc - c0; // 0=Пн … 6=Вс
          days.push({ day: dayNum, name, names, bg, dow });
        }
      }
      blocks.push({ title: titleText, monthIdx, days });
      monthIdx++;
    }
  }
  return blocks;
}

function renderVacationCalendarInto(el, blocks) {
  const DOW_RU = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  if (!blocks || !blocks.length) {
    el.innerHTML = '<div class="vac-cal-loading">Нет данных</div>';
    return;
  }
  const now = new Date();
  const curYear = 2026; // календарь на 2026
  const curMonthIdx = (now.getFullYear() === curYear) ? now.getMonth() : (now.getFullYear() > curYear ? 12 : -1);
  // Длительность месяцев 2026 (год не високосный)
  const MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];

  // ─── Собираем непрерывные периоды отпусков по всем месяцам ───
  // Период = последовательность подряд идущих дней одного менеджера (включая переходы через границу месяца).
  const allEntries = []; // {name, mi, day, ts}
  blocks.forEach((b, mi) => {
    b.days.forEach(d => {
      const arr = d.names && d.names.length ? d.names : (d.name ? [d.name] : []);
      arr.forEach(n => {
        const ts = Date.UTC(curYear, mi, d.day);
        allEntries.push({ name: n, mi, day: d.day, ts });
      });
    });
  });
  const byMgrAll = {};
  allEntries.forEach(e => { (byMgrAll[e.name] = byMgrAll[e.name] || []).push(e); });

  const periods = []; // {name, startTs, endTs, startMi, startDay, endMi, endDay, days, dominantMi}
  Object.entries(byMgrAll).forEach(([name, list]) => {
    list.sort((a, b) => a.ts - b.ts);
    let cur = null;
    list.forEach(e => {
      if (!cur) {
        cur = { name, entries: [e] };
      } else {
        const prev = cur.entries[cur.entries.length - 1];
        const diffDays = (e.ts - prev.ts) / 86400000;
        if (diffDays === 1) {
          cur.entries.push(e);
        } else {
          periods.push(cur); cur = { name, entries: [e] };
        }
      }
    });
    if (cur) periods.push(cur);
  });
  // Заполняем агрегаты периода
  periods.forEach(p => {
    const ents = p.entries;
    const s = ents[0], en = ents[ents.length - 1];
    p.startTs = s.ts; p.endTs = en.ts;
    p.startMi = s.mi; p.startDay = s.day;
    p.endMi = en.mi;  p.endDay = en.day;
    p.days = ents.length;
    const cnt = {};
    ents.forEach(e => { cnt[e.mi] = (cnt[e.mi] || 0) + 1; });
    let bestMi = s.mi, bestCnt = -1;
    Object.entries(cnt).forEach(([mi, c]) => {
      if (c > bestCnt || (c === bestCnt && +mi < bestMi)) { bestCnt = c; bestMi = +mi; }
    });
    p.dominantMi = bestMi;
  });
  // Группируем периоды по «основному» месяцу
  const periodsByMonth = {};
  periods.forEach(p => {
    (periodsByMonth[p.dominantMi] = periodsByMonth[p.dominantMi] || []).push(p);
  });
  Object.values(periodsByMonth).forEach(arr => arr.sort((a, b) => a.startTs - b.startTs));

  function fmtDate(mi, day) {
    const dd = String(day).padStart(2, '0');
    const mm = String(mi + 1).padStart(2, '0');
    const yy = String(curYear).slice(-2);
    return `${dd}.${mm}.${yy}`;
  }
  function pluralDays(n) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return 'дней';
    if (b === 1) return 'день';
    if (b >= 2 && b <= 4) return 'дня';
    return 'дней';
  }

  // Рендерим один месяц-блок (без обёртки <details> вокруг)
  function renderMonth(b, mi) {
    const monthPeriods = periodsByMonth[mi] || [];
    const mgrCount = monthPeriods.length;
    const badgeHtml = mgrCount > 0
      ? `<span class="vac-month-badge"><svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" style="vertical-align:-1px"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4 0-9 2-9 6v2h18v-2c0-4-5-6-9-6Z"/></svg> ${mgrCount}</span>`
      : '';
    const summaryHtml = monthPeriods.length
      ? `<div class="vac-month-summary">${
          monthPeriods.map(p =>
            `<div class="vac-summary-row"><span class="vac-sum-name">${escapeHtml(p.name)}</span><span class="vac-sum-dash">·</span><span class="vac-sum-days">${p.days} ${pluralDays(p.days)}</span><span class="vac-sum-dash">·</span><span class="vac-sum-range">${fmtDate(p.startMi, p.startDay)} – ${fmtDate(p.endMi, p.endDay)}</span></div>`
          ).join('')
        }</div>`
      : '';

    if (!b.days.length) {
      return `<div class="vac-month"><div class="vac-month-title"><span class="vac-month-title-left"><span>${escapeHtml(b.title)}</span></span>${badgeHtml}</div><div class="vac-cal-loading" style="padding:14px">Пусто</div>${summaryHtml}</div>`;
    }
    // Найдём минимальный день и его dow → пустые ячейки до него
    const byDay = {};
    b.days.forEach(d => { byDay[d.day] = d; });
    const sorted = b.days.slice().sort((a,b) => a.day - b.day);
    const firstDay = sorted[0];
    const lastDay  = sorted[sorted.length - 1].day;
    // Расставляем по dow первой ячейки
    const cells = [];
    for (let i = 0; i < firstDay.dow; i++) cells.push('<div class="vac-cell vac-empty"></div>');
    for (let d = firstDay.day; d <= lastDay; d++) {
      const info = byDay[d];
      if (!info) { cells.push('<div class="vac-cell vac-empty"></div>'); continue; }
      const styleBg = info.bg ? `background:${info.bg};` : '';
      const arr = info.names && info.names.length ? info.names : (info.name ? [info.name] : []);
      const hasVac  = arr.length ? ' has-vac' : '';
      const nameHtml = arr.map(n => {
        const surname = String(n).trim().split(/\s+/)[0] || n;
        return `<div class="vac-name" title="${escapeAttr(n)}">${escapeHtml(surname)}</div>`;
      }).join('');
      cells.push(`<div class="vac-cell${hasVac}" style="${styleBg}"><div class="vac-d">${d}</div>${nameHtml}</div>`);
    }
    // Дополнить до кратного 7
    while (cells.length % 7 !== 0) cells.push('<div class="vac-cell vac-empty"></div>');
    const dowHdr = DOW_RU.map((d,i) => `<div class="vac-dow${i>=5?' we':''}">${d}</div>`).join('');
    return `<div class="vac-month"><div class="vac-month-title"><span class="vac-month-title-left"><span>${escapeHtml(b.title)}</span></span>${badgeHtml}</div><div class="vac-month-grid">${dowHdr}${cells.join('')}</div>${summaryHtml}</div>`;
  }

  // Разделяем на прошедшие и текущие/будущие
  const pastBlocks = [];
  const liveBlocks = [];
  blocks.forEach((b, mi) => {
    if (curMonthIdx >= 0 && mi < curMonthIdx) pastBlocks.push({ b, mi });
    else liveBlocks.push({ b, mi });
  });
  const liveHtml = liveBlocks.map(x => renderMonth(x.b, x.mi)).join('');
  let pastHtml = '';
  if (pastBlocks.length) {
    const innerPast = pastBlocks.map(x => renderMonth(x.b, x.mi)).join('');
    const rangeText = pastBlocks.length === 1
      ? pastBlocks[0].b.title
      : `${pastBlocks[0].b.title} – ${pastBlocks[pastBlocks.length-1].b.title}`;
    const chevron = `<svg class="vac-month-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
    pastHtml = `<details class="vac-past-group">
        <summary class="vac-past-summary">
          <span class="vac-past-sum-left">${chevron}<span class="vac-past-sum-title">Прошедшие месяцы</span></span>
          <span class="vac-past-sum-range">${escapeHtml(rangeText)}</span>
        </summary>
        <div class="vac-past-body">${innerPast}</div>
      </details>`;
  }

  el.innerHTML = pastHtml + liveHtml;
}

function _ensureVacOverlay() {
  let ov = document.getElementById('vac-cal-overlay');
  if (ov) return ov;
  ov = document.createElement('div');
  ov.id = 'vac-cal-overlay';
  ov.className = 'vac-cal-overlay';
  ov.setAttribute('aria-hidden', 'true');
  ov.innerHTML = `
    <div class="vac-cal-shell">
      <div class="vac-cal-hdr">
        <div class="vac-cal-title">Календарь отпусков 2026</div>
        <button class="vac-cal-close" onclick="closeVacationCalendar()" aria-label="Закрыть">×</button>
      </div>
      <div class="vac-cal-body" id="vac-cal-body">
        <div class="vac-cal-loading">Загрузка…</div>
      </div>
    </div>`;
  document.body.appendChild(ov); // вне #app, чтобы перекрыть header и dock
  return ov;
}

async function openVacationCalendar() {
  const ov = _ensureVacOverlay();
  const body = document.getElementById('vac-cal-body');
  if (!ov || !body) return;
  ov.classList.add('open');
  ov.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  // Сбросить скролл на начало списка
  requestAnimationFrame(() => { body.scrollTop = 0; });
  // На время отладки цветов — не используем сессионный кэш, чтобы каждый
  // открыв модалку гарантированно подтягивал свежие данные с листа.
  _vacCalCache = null;
  body.innerHTML = '<div class="vac-cal-loading">Загрузка…</div>';
  try {
    const [rows, mgrColors] = await Promise.all([
      fetchVacationsList(),
      fetchVacationManagerColors().catch(() => ({})),
    ]);
    const periods = parseVacationsList(rows);
    // Подставляем цвет из словаря, если есть
    periods.forEach(p => {
      if (mgrColors[p.name]) p.bg = mgrColors[p.name];
    });
    _vacCalCache = periods;
    try { console.log('[vac-cal] цвета менеджеров:', mgrColors); } catch(e){}
    try { console.log('[vac-cal] периоды:', periods.map(p => ({ name: p.name, bg: p.bg }))); } catch(e){}
    const blocks = buildBlocksFromPeriods(periods, 2026);
    renderVacationCalendarInto(body, blocks);
    requestAnimationFrame(() => { body.scrollTop = 0; });
  } catch (e) {
    body.innerHTML = '<div class="vac-cal-loading">Не удалось загрузить календарь</div>';
  }
}

function closeVacationCalendar() {
  const ov = document.getElementById('vac-cal-overlay');
  if (!ov) return;
  ov.classList.remove('open');
  ov.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// ESC закрывает календарь отпусков
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const ov = document.getElementById('vac-cal-overlay');
    if (ov && ov.classList.contains('open')) closeVacationCalendar();
  }
});

function closeSchedCellEditor() {
  if (_schedEditPopover) {
    _schedEditPopover.remove();
    _schedEditPopover = null;
  }
  document.querySelectorAll('.sched-cell.editing').forEach(el => el.classList.remove('editing'));
}

function openSchedCellEditor(e, sheetRow, colIdx, name, dayNum) {
  e.preventDefault();
  e.stopPropagation();
  if (!canEditScheduleName(name)) return;
  closeSchedCellEditor();

  const target = e.currentTarget;
  target.classList.add('editing');
  const rect = target.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.className = 'sched-edit-pop';
  pop.innerHTML = `
    <div class="sched-edit-pop-title">${escapeHtml(name)} · ${dayNum}</div>
    <div class="sched-edit-pop-actions" id="sched-pop-actions">
      <button onclick="saveSchedCell(${sheetRow}, ${colIdx}, 'Р')" title="Рабочий день">Р</button>
      <button onclick="saveSchedCell(${sheetRow}, ${colIdx}, 'Р*')" style="background:#4386f5;color:#fff" title="Рабочий день + проверка анкет">Р*</button>
      <button onclick="saveSchedCell(${sheetRow}, ${colIdx}, 'В')" style="background:#f50e02;color:#fff" title="Выходной день">В</button>
      <button onclick="saveSchedCell(${sheetRow}, ${colIdx}, 'В*')" style="background:#ffff00;color:#222" title="Обязательный выходной день">В*</button>
      <button onclick="saveSchedCell(${sheetRow}, ${colIdx}, 'О')" style="background:#ff9500;color:#fff" title="Отпускной день (засчитывается как выходной)">О</button>
    </div>
    <div class="sched-edit-pop-saving" id="sched-pop-saving" style="display:none">
      <svg class="sched-save-anim" xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
        <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
          <path stroke-dasharray="64" stroke-dashoffset="64" d="M3 12c0-4.97 4.03-9 9-9c4.97 0 9 4.03 9 9c0 4.97-4.03 9-9 9c-4.97 0-9-4.03-9-9Z">
            <animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="64;0"/>
          </path>
          <path stroke-dasharray="14" stroke-dashoffset="14" d="M8 12l3 3l5-5">
            <animate fill="freeze" attributeName="stroke-dashoffset" begin="0.6s" dur="0.2s" values="14;0"/>
          </path>
        </g>
      </svg>
    </div>
    <div class="sched-edit-pop-saving" id="sched-pop-error" style="display:none">
      <svg class="sched-error-anim" xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
        <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          stroke-dasharray="64" stroke-dashoffset="64" d="M12 3c4.97 0 9 4.03 9 9c0 4.97-4.03 9-9 9c-4.97 0-9-4.03-9-9c0-4.97 4.03-9 9-9Z">
          <animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="64;0"/>
        </path>
        <path fill="none" stroke="#e53535" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          stroke-dasharray="8" stroke-dashoffset="8" d="M12 12l4 4M12 12l-4-4M12 12l-4 4M12 12l4-4">
          <animate fill="freeze" attributeName="stroke-dashoffset" begin="0.6s" dur="0.2s" values="8;0"/>
        </path>
      </svg>
    </div>
  `;
  document.body.appendChild(pop);
  const left = Math.min(window.innerWidth - pop.offsetWidth - 10, Math.max(10, rect.left + rect.width / 2 - pop.offsetWidth / 2));
  const top = Math.min(window.innerHeight - pop.offsetHeight - 10, rect.bottom + 8);
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
  _schedEditPopover = pop;
  setTimeout(() => {
    document.addEventListener('pointerdown', schedEditorOutside, { once:true, capture:true });
  }, 0);
}

function schedEditorOutside(e) {
  if (_schedEditPopover && !_schedEditPopover.contains(e.target)) closeSchedCellEditor();
}

async function saveSchedCell(sheetRow, colIdx, value) {
  const actions = document.getElementById('sched-pop-actions');
  const saving  = document.getElementById('sched-pop-saving');
  const errDiv  = document.getElementById('sched-pop-error');
  if (actions) actions.style.display = 'none';
  if (saving) {
    saving.style.display = 'flex';
    saving.querySelectorAll('animate').forEach(a => a.beginElement());
  }
  try {
    await putScheduleCell(sheetRow, colIdx, value);
    if (!S.data.grafik[sheetRow - 1]) S.data.grafik[sheetRow - 1] = [];
    S.data.grafik[sheetRow - 1][colIdx] = value;
    setTimeout(() => { closeSchedCellEditor(); renderGrafik(); }, 800);
  } catch (err) {
    // Прячем спиннер успеха, показываем анимацию ошибки
    if (saving) saving.style.display = 'none';
    if (errDiv) {
      errDiv.style.display = 'flex';
      errDiv.querySelectorAll('animate').forEach(a => a.beginElement());
      // Через 1.2s (0.8s анимация + пауза) — возвращаем кнопки и показываем тост
      setTimeout(() => {
        errDiv.style.display = 'none';
        if (actions) actions.style.display = '';
        toast(err.message || 'Ошибка сохранения графика', 'e');
      }, 1200);
    } else {
      if (actions) actions.style.display = '';
      toast(err.message || 'Ошибка сохранения графика', 'e');
    }
  }
}

function openScheduleBulkEditor() {
  const raw = S.data.grafik || [];
  const matched = findUserInSheet();
  if (!matched) return;
  const role = matched.role || '';
  const myName = String(matched.name || '').trim().toLowerCase();
  const mo = parseInt(currentSuffix.slice(0,2));
  const yr = 2000 + parseInt(currentSuffix.slice(2,4));
  const daysInMonth = new Date(yr, mo, 0).getDate();
  const schedIndex = buildSchedIndex(raw);

  const users = S.usersData || [];
  const names = [];
  for (let i = 1; i < users.length; i++) {
    const u = users[i];
    if (!u || !u[1]) continue;
    const name = String(u[1]).trim();
    const uRole = String(u[2] || 'crm').toLowerCase().trim();
    if (isCeoLike(uRole)) continue;
    if (schedIndex[name.toLowerCase()]) names.push(name);
  }
  const longestNameLen = names.reduce((max, name) => Math.max(max, String(name || '').length), 0);
  const nameColWidth = Math.max(142, Math.min(188, Math.ceil(longestNameLen * 7.2 + 18)));

  const dayHeads = Array.from({ length: daysInMonth }, (_, i) => `<div class="sched-bulk-day">${i + 1}</div>`).join('');
  const rows = names.map(name => {
    const entry = schedIndex[name.toLowerCase()];
    const editable = isCeoLike(role) || name.toLowerCase() === myName;
    const cells = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const colIdx = findSchedDayCol(entry.daysRow, day);
      const val = colIdx >= 0 ? resolveSchedVal(entry.row[colIdx] || '', entry.sheetRow, colIdx) : '';
      const disabled = editable && colIdx >= 0 ? '' : 'disabled';
      const selBg = SCHED_CELL_BG[val] || '';
      const selFg = SCHED_CELL_FG[val] || '';
      const selStyle = selBg ? ` style="background:${selBg};color:${selFg}"` : '';
      return `<select class="sched-bulk-select" data-row="${entry.sheetRow}" data-col="${colIdx}" data-name="${escapeAttr(name)}" ${disabled}${selStyle} onchange="schedBulkSelectChanged(this)" onmousedown="schedBulkShowStars(this)" onblur="schedBulkHideStars(this)">
        <option value="" ${!val?'selected':''}>·</option>
        <option value="Р"  ${val==='Р' ?'selected':''}>Р</option>
        <option value="Р*" ${val==='Р*'?'selected':''}>Р</option>
        <option value="В"  ${val==='В' ?'selected':''}>В</option>
        <option value="В*" ${val==='В*'?'selected':''}>В</option>
        <option value="О"  ${val==='О' ?'selected':''}>О</option>
      </select>`; /* звёздочки восстанавливаются через onmousedown перед открытием */
    }).join('');
    return `<div class="sched-bulk-row${editable?'':' locked'}">
      <div class="sched-bulk-name">${escapeHtml(name)}</div>
      <div class="sched-bulk-cells" style="grid-template-columns:repeat(${daysInMonth}, minmax(30px, 1fr))">${cells}</div>
    </div>`;
  }).join('');

  const old = document.getElementById('sched-bulk-overlay');
  if (old) old.remove();
  const overlay = document.createElement('div');
  overlay.id = 'sched-bulk-overlay';
  overlay.className = 'sched-bulk-overlay open';
  overlay.style.setProperty('--sched-name-col-dynamic', `${nameColWidth}px`);
  overlay.innerHTML = `
    <div class="sched-bulk-modal">
      <div class="sched-bulk-hdr">
        <div>
          <div class="sched-bulk-title">Редактирование графика</div>
          <div class="sched-bulk-sub">${getMonthName(currentSuffix)}</div>
        </div>
        <button class="sched-bulk-close" onclick="closeScheduleBulkEditor()">×</button>
      </div>
      <div class="sched-bulk-body">
        <div class="sched-bulk-inner">
          <div class="sched-bulk-head"><div></div><div class="sched-bulk-days" style="grid-template-columns:repeat(${daysInMonth}, minmax(30px, 1fr))">${dayHeads}</div></div>
          ${rows}
        </div>
      </div>
      <div class="sched-bulk-footer">
        <span class="sched-bulk-status" id="sched-bulk-status"></span>
        <div class="sched-bulk-actions">
          <button class="sched-bulk-icon-btn" onclick="closeScheduleBulkEditor()" title="Выход из редактирования">
            <svg class="sched-bulk-svg" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5m9.954 3H2.545c-.3 0-.545.224-.545.5v1c0 .276.244.5.545.5h10.91c.3 0 .545-.224.545-.5v-1c0-.276-.244-.5-.546-.5m-6.6 5.146a.5.5 0 1 0-.708.708L7.293 10l-1.147 1.146a.5.5 0 0 0 .708.708L8 10.707l1.146 1.147a.5.5 0 0 0 .708-.708L8.707 10l1.147-1.146a.5.5 0 0 0-.708-.708L8 9.293z"/></svg>
          </button>
          <button class="sched-bulk-icon-btn" onclick="saveScheduleBulkEditor()" title="Сохранить график">
            <svg class="sched-bulk-svg" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5m9.954 3H2.545c-.3 0-.545.224-.545.5v1c0 .276.244.5.545.5h10.91c.3 0 .545-.224.545-.5v-1c0-.276-.244-.5-.546-.5m-2.6 5.854a.5.5 0 0 0-.708-.708L7.5 10.793L6.354 9.646a.5.5 0 1 0-.708.708l1.5 1.5a.5.5 0 0 0 .708 0z"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  // Скрываем звёздочки у уже выбранных значений (Р*/В* → показываем Р/В)
  overlay.querySelectorAll('.sched-bulk-select').forEach(schedBulkHideStars);
}

function closeScheduleBulkEditor() {
  document.getElementById('sched-bulk-overlay')?.remove();
  document.body.style.overflow = '';
}

async function saveScheduleBulkEditor() {
  const overlay = document.getElementById('sched-bulk-overlay');
  const status = document.getElementById('sched-bulk-status');
  if (!overlay) return;
  const selects = [...overlay.querySelectorAll('.sched-bulk-select:not(:disabled)')];
  const changes = [];
  selects.forEach(sel => {
    const row = Number(sel.dataset.row);
    const col = Number(sel.dataset.col);
    if (!row || col < 0) return;
    const next = rawSchedVal(sel.value);
    const prev = rawSchedVal(S.data.grafik?.[row - 1]?.[col]);
    if (next !== prev) changes.push({ row, col, value: next });
  });
  if (!changes.length) { if (status) status.textContent = 'Нет изменений'; return; }
  try {
    if (status) { status.className = 'sched-bulk-status saving'; status.textContent = 'Сохранение...'; }
    await Promise.all(changes.map(ch => putScheduleCell(ch.row, ch.col, ch.value)));
    changes.forEach(ch => {
      if (!S.data.grafik[ch.row - 1]) S.data.grafik[ch.row - 1] = [];
      S.data.grafik[ch.row - 1][ch.col] = ch.value;
    });
    if (status) { status.className = 'sched-bulk-status saved'; status.textContent = 'Сохранено'; }
    setTimeout(() => { closeScheduleBulkEditor(); renderGrafik(); toast('График сохранён', 's'); }, 400);
  } catch (err) {
    if (status) { status.className = 'sched-bulk-status err'; status.textContent = 'Ошибка сохранения'; }
    toast(err.message || 'Ошибка сохранения графика', 'e');
  }
}

// ==================== INSTRUKTSII ====================
function renderInstruktsii() {
  const el  = document.getElementById('c-instruktsii');
  const floatingFaq = document.getElementById('floating-faq-subtabs');
  if (floatingFaq) floatingFaq.style.display = 'none'; // вкладки убраны — управление через Dock
  if (S.faqTab === 'reglament') { el.innerHTML = renderReglamentTab(); return; }
  if (S.faqTab === 'mango') { el.innerHTML = renderMangoTab(); return; }
  if (S.faqTab === 'links') { el.innerHTML = renderLinksTab(); initLinksTab(); return; }
  if (S.faqTab === 'autopodbor') { el.innerHTML = renderAutopodborTab(); return; }
  const raw = S.data.instruktsii;
  if (!raw||!raw.length) { el.innerHTML = '<div class="empty">Нет инструкций</div>'; return; }
  function buildStatusTable(rows) {
    const ths = '<th>Статус</th><th>Критерии применения</th><th>Обязательные действия в CRM</th>';
    const trs = rows.filter(r => (r[0]||'').trim() || (r[1]||'').trim()).map(r => `<tr><td>${r[0]||'—'}</td><td>${r[1]||'—'}</td><td>${r[2]||'—'}</td></tr>`).join('');
    return `<div class="table-scroll"><table class="instr-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
  }
  const primaryRows   = raw.slice(2, 18);
  const secondaryRows = raw.slice(20, 40);
  const reglamentBody = `<div class="instr-sub" id="is-primary"><div class="instr-sub-hdr" onclick="toggleSub('is-primary')"><span>СТАТУСЫ ПЕРВИЧНОГО КОНТАКТА</span><div class="instr-sub-toggle">+</div></div><div class="instr-sub-body">${buildStatusTable(primaryRows)}</div></div><div class="instr-sub" id="is-secondary"><div class="instr-sub-hdr" onclick="toggleSub('is-secondary')"><span>СТАТУСЫ ВТОРИЧНОГО КОНТАКТА</span><div class="instr-sub-toggle">+</div></div><div class="instr-sub-body">${buildStatusTable(secondaryRows)}</div></div>`;
  const ndzRows = raw.slice(41, 57);
  const ndzHTML = ndzRows.map(r => {
    const a = (r[0]||'').trim(), b = (r[1]||'').trim();
    if (!a && !b) return '';
    const text = b ? `${a} ${b}`.trim() : a;
    const aUp = a.toUpperCase();
    if (aUp.startsWith('ЕСЛИ') && aUp.includes('ЗАЯВКА')) return `<tr class="ndz-sub-hdr"><td colspan="2">${text}</td></tr>`;
    if (aUp.startsWith('НО!') || aUp.startsWith('ЛЮБЫЕ')) return `<tr class="ndz-highlight"><td colspan="2">${text}</td></tr>`;
    if (aUp.startsWith('АЛГОРИТМ ЗВОНКОВ')) return `<tr class="ndz-highlight"><td colspan="2">${text}</td></tr>`;
    if (aUp.startsWith('ЕСЛИ')) return `<tr class="ndz-sub-hdr"><td colspan="2">${text}</td></tr>`;
    return `<tr><td colspan="2">${text}</td></tr>`;
  }).filter(Boolean).join('');
  const ndzBody = `<div class="mango-wrap"><table class="ndz-table"><tbody>${ndzHTML}</tbody></table></div>`;
  el.innerHTML = `<div class="sec-title">Инструкции</div><div class="instr-block" id="ib-reglament"><div class="instr-hdr" onclick="toggleInstr('ib-reglament')"><h3>РЕГЛАМЕНТ КОРРЕКТНОГО ЗАКРЫТИЯ CRM ЗАЯВОК (ЛИДОВ)</h3><div class="instr-toggle">+</div></div><div class="instr-body">${reglamentBody}</div></div><div class="instr-block" id="ib-ndz"><div class="instr-hdr" onclick="toggleInstr('ib-ndz')"><h3>АЛГОРИТМ РАБОТЫ С НЕДОЗВОНАМИ</h3><div class="instr-toggle">+</div></div><div class="instr-body" style="padding:12px 14px">${ndzBody}</div></div>`;
}

function renderReglamentTab() {
  return `<div class="sec-title">Регламент</div><div class="faq-under-dev">Раздел в разработке...</div>`;
}

function renderAutopodborTab() {
  return `
    <div class="sec-title">Автоподбор</div>
    <div class="autopodbor-stub">
      <div class="autopodbor-stub-title">В разработке</div>
      <div class="autopodbor-stub-text">
        Ассистент в быстрой навигации и поиску авто на официальном сайте по простому запросу.
        Например: <span class="autopodbor-stub-ex">«фольц тигуан в перми автомат»</span>
        или <span class="autopodbor-stub-ex">«лада веста до 900»</span>.
      </div>
    </div>
  `;
}

function toggleInstr(id) {
  const block = document.getElementById(id);
  block.classList.toggle('open');
  const btn = block.querySelector('.instr-toggle');
  if (btn) btn.textContent = block.classList.contains('open') ? '−' : '+';
}
function toggleSub(id) {
  const sub = document.getElementById(id);
  sub.classList.toggle('open');
  const btn = sub.querySelector('.instr-sub-toggle, .mop-sub-toggle');
  if (btn) btn.textContent = sub.classList.contains('open') ? '−' : '+';
}

// Ленивый рендер всех городов при раскрытии схлопа Детализация по городам
function toggleCitiesAll() {
  const sub = document.getElementById('mop-sub-cities');
  if (!sub) return;
  const body = sub.querySelector('.mop-sub-body');
  if (!body || body.dataset.loaded === '1') return;
  const cities = window._mopCitiesCache || [];
  if (!cities.length) {
    body.innerHTML = '<div class="mop-city-empty">Нет данных по городам</div>';
    body.dataset.loaded = '1';
    return;
  }
  const cell = (lbl, val) =>
    `<div class="modal-cell"><div class="mc-l">${lbl}</div><div class="mc-v">${val||0}</div></div>`;
  body.innerHTML = cities.map(c => `
    <div class="mop-city">
      <div class="mop-city-name">${(c.city||'—').toUpperCase()} <span class="mop-city-count">${c.vis||0}</span></div>
      <div class="modal-grid">
        ${cell('Визиты', c.vis)}
        ${cell('Кредит', c.kred)}
        ${cell('Наличные', c.nal)}
        ${cell('Обмен', c.obmen)}
        ${cell('Выкуп', c.vykup)}
        ${cell('Комиссия', c.kom)}
        ${cell('Отказ', c.otkaz)}
        ${cell('ФССП', c.fssp)}
        ${cell('Одоб. н/к', c.odobNeKupil)}
      </div>
    </div>`).join('');
  body.dataset.loaded = '1';
}

function burstConfetti(el, idx) {
  const isGold = (idx === 0), isSilver = (idx === 1);
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
  if (isGold) {
    const audio = new Audio('https://actions.google.com/sounds/v1/fireworks/firework_burst.ogg');
    audio.volume = 0.25; audio.play().catch(()=>{});
    const flash = document.createElement('div');
    flash.style.cssText = `position:fixed; left:${cx}px; top:${cy}px; width:20px; height:20px; border-radius:50%; background:radial-gradient(circle,#fff,#ffd700,#ffae00,transparent); transform:translate(-50%,-50%); pointer-events:none; z-index:9999; animation:flash 0.4s ease-out forwards;`;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 400);
  }
  const colors = isGold ? ['#FFD700','#FFC300','#FFDF00','#FFF8DC','#FFFFFF'] : isSilver ? ['#C0C0C0','#D8D8D8','#A8A8A8','#E8E8E8','#FFFFFF'] : ['#e8ff47','#ff4757','#2ed573','#1e90ff','#ffa502'];
  const count = isGold ? 140 : isSilver ? 80 : 55;
  const radius = isGold ? 280 : isSilver ? 180 : 130;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    const angle = (i / count) * 2 * Math.PI;
    const dist = radius + (Math.random() - 0.5) * (isGold ? 40 : 20);
    const tx = Math.cos(angle) * dist, ty = Math.sin(angle) * dist;
    const size = isGold ? 6 + Math.random() * 10 : 4 + Math.random() * 6;
    const dur = isGold ? 0.8 + Math.random() * 0.8 : 0.5 + Math.random() * 0.5;
    piece.style.cssText = `position:fixed; left:${cx}px; top:${cy}px; width:${size}px; height:${size}px; background:${colors[Math.floor(Math.random() * colors.length)]}; border-radius:${Math.random() > 0.5 ? '50%' : '2px'}; pointer-events:none; z-index:9999; animation:firework ${dur}s ease-out forwards; --tx:${tx}px; --ty:${ty}px;`;
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), dur * 1000);
  }
  if (isGold) setTimeout(() => burstConfetti(el, 99), 140);
}

function openMopModal(dataStr) {
  const d = JSON.parse(dataStr.replace(/&#39;/g,"'").replace(/&quot;/g,'"'));
  const rs = d.rs;
  const progPct = parseFloat(String(d.prog||'0').replace(/[^\d.,-]/g,'').replace(',','.')) || 0;
  const progVis = (d.rplan && progPct) ? Math.round(num(d.rplan) * progPct / 100) : '—';
  const factPct = d.rplan && num(d.rplan) > 0
    ? Math.min(Math.round(num(d.allV) / num(d.rplan) * 100), 100)
    : parseFloat(String(d.prc||'0').replace(/[^\d.,-]/g,'').replace(',','.')) || 0;
  const factPctRaw = parseFloat(String(d.prc||'0').replace(/[^\d.,-]/g,'').replace(',','.')) || 0;

  // Суммарные значения для "Общий результат"
  const tKred  = (num(d.kred800)  || 0) + (num(d.kred1200)  || 0);
  const tNal   = (num(d.nal800)   || 0) + (num(d.nal1200)   || 0);
  const tObmen = (num(d.td800)    || 0) + (num(d.td1200)    || 0);
  const tVykup = (num(d.vykup800) || 0) + (num(d.vykup1200) || 0);
  const tKom   = (num(d.kom800)   || 0) + (num(d.kom1200)   || 0);
  const vsaloneN = num(d.vsalone) || 0;
  const salAlarm = vsaloneN > 0;

  // Имя для drilldown-модалок (используем nameLow, escapнутый для inline-атрибутов)
  const nameLowAttr = JSON.stringify(String(d.nameLow || (d.name||'').toLowerCase())).replace(/"/g, '&quot;');

  // Бейджи "Общий результат" — основные показатели
  // 5-й элемент кортежа — onclick (для кликабельных бейджей)
  const genBadges = [
    ['План',          d.rplan],
    ['Дневной',       d.daily || '—'],
    ['Визиты',        d.allV,    '', '', `openMgrDealsModal(${nameLowAttr},'vizity')`],
    ['Остаток',       d.ost],
    ['Прогноз',       d.prog,    `color:${pctClr(progPct)}`],
    ['Прогноз',       progVis,   `color:${pctClr(progPct)}`],
    ['Факт',          d.prc,     `color:${pctClr(factPctRaw)}`],
    ['Кредит',        tKred,     '', '', `openMgrDealsModal(${nameLowAttr},'kredit')`],
    ['Наличные',      tNal,      '', '', `openMgrDealsModal(${nameLowAttr},'nal')`],
    ['Обмен',         tObmen,    '', '', `openMgrDealsModal(${nameLowAttr},'obmen')`],
    ['Выкуп',         tVykup,    '', '', `openMgrDealsModal(${nameLowAttr},'vykup')`],
    ['Комиссия',      tKom,      '', '', `openMgrDealsModal(${nameLowAttr},'komis')`],
    ['Задаток',       d.zadatok, '', '', `openMgrDealsModal(${nameLowAttr},'zadatok')`],
    ['Отказ',         d.otkaz,   '', '', `openMgrDealsModal(${nameLowAttr},'otkaz')`],
    ['ФССП',          d.vfSSP,   '', '', `openMgrDealsModal(${nameLowAttr},'fssp')`],
    ['Одоб. н/к',     d.odobNeKupil || 0, '', '', `openMgrDealsModal(${nameLowAttr},'odob_nk')`],
    ['В салоне',      vsaloneN,  '', salAlarm ? 'salon-alarm' : '', `openMgrSalonModal(${nameLowAttr})`],
    ['В КСО',         d.vkso,    '', '', `openMgrKsoModal(${nameLowAttr})`],
  ];
  const genHtml = genBadges.map(([l,v,st,cls,click]) => {
    const clickAttr = click ? ` onclick="${click}"` : '';
    const clickCls  = click ? ' modal-cell-clickable' : '';
    return `<div class="modal-cell ${cls||''}${clickCls}"${clickAttr}><div class="mc-l">${l}</div><div class="mc-v" style="${st||''}">${v}</div></div>`;
  }).join('');

  // Конверсии (общий)
  const convHtml = `
    <div class="modal-cell"><div class="mc-l"><b><i>К</i></b> визиты</div><div class="mc-v">${d.genConVis}</div></div>
    <div class="modal-cell"><div class="mc-l"><b><i>К</i></b> кредит</div><div class="mc-v">${d.genConKred}</div></div>
    <div class="modal-cell"><div class="mc-l">% целевых</div><div class="mc-v">${d.genDolya}</div></div>
    <div class="modal-cell"><div class="mc-l">Kоэфф.</div><div class="mc-v">${d.genKoef}</div></div>`;

  // CRM (кат 800)
  const crmHtml = `
    <div class="modal-cell"><div class="mc-l">Визиты</div><div class="mc-v">${d.v800}</div></div>
    <div class="modal-cell"><div class="mc-l">Кредит</div><div class="mc-v">${d.kred800}</div></div>
    <div class="modal-cell"><div class="mc-l">Наличные</div><div class="mc-v">${d.nal800}</div></div>
    <div class="modal-cell"><div class="mc-l">Обмен</div><div class="mc-v">${d.td800}</div></div>
    <div class="modal-cell"><div class="mc-l">Выкуп</div><div class="mc-v">${d.vykup800||0}</div></div>
    <div class="modal-cell"><div class="mc-l">Комиссия</div><div class="mc-v">${d.kom800}</div></div>
    <div class="modal-cell"><div class="mc-l">Задаток</div><div class="mc-v">${d.zadatok}</div></div>
    <div class="modal-cell"><div class="mc-l"><b><i>К</i></b> визиты</div><div class="mc-v">${d.crmConVis}</div></div>
    <div class="modal-cell"><div class="mc-l"><b><i>К</i></b> кредит</div><div class="mc-v">${d.crmConKred}</div></div>
    <div class="modal-cell"><div class="mc-l">% целевых</div><div class="mc-v">${d.crmDolya}</div></div>
    <div class="modal-cell"><div class="mc-l">Kоэфф.</div><div class="mc-v">${d.crmKoef}</div></div>`;

  // ТЁПЛЫЕ ЛИДЫ (кат 1200)
  const warmHtml = `
    <div class="modal-cell"><div class="mc-l">Визиты</div><div class="mc-v">${d.v1200}</div></div>
    <div class="modal-cell"><div class="mc-l">Кредит</div><div class="mc-v">${d.kred1200}</div></div>
    <div class="modal-cell"><div class="mc-l">Наличные</div><div class="mc-v">${d.nal1200}</div></div>
    <div class="modal-cell"><div class="mc-l">Обмен</div><div class="mc-v">${d.td1200}</div></div>
    <div class="modal-cell"><div class="mc-l">Выкуп</div><div class="mc-v">${d.vykup1200||0}</div></div>
    <div class="modal-cell"><div class="mc-l">Комиссия</div><div class="mc-v">${d.kom1200}</div></div>
    <div class="modal-cell"><div class="mc-l"><b><i>К</i></b> визиты</div><div class="mc-v">${d.warmConVis}</div></div>
    <div class="modal-cell"><div class="mc-l"><b><i>К</i></b> кредит</div><div class="mc-v">${d.warmConKred}</div></div>
    <div class="modal-cell"><div class="mc-l">% целевых</div><div class="mc-v">${d.warmDolya}</div></div>
    <div class="modal-cell"><div class="mc-l">Kоэфф.</div><div class="mc-v">${d.warmKoef}</div></div>`;

  // Города — стэшим в кэш, рендер откладываем до раскрытия внешнего схлопа
  const cities = Object.values(d.byCity || {}).sort((a,b) => (b.vis||0) - (a.vis||0));
  window._mopCitiesCache = cities;

  document.getElementById('mop-modal-title').innerHTML = `<span class="rank-badge" style="background:${rs.badgeBg};color:${rs.color}">${d.idx}</span><span style="font-family:'Unbounded',sans-serif">${d.name}</span>`;
  document.getElementById('mop-modal-body').innerHTML = `
    <div class="mop-modal-subtitle">ДЕТАЛЬНЫЙ KPI</div>
    <div class="prog-row"><span class="prog-l" style="color:${pctClr(factPctRaw)}">${d.prc}</span><div class="prog-track"><div class="prog-fill" style="width:${factPct}%;background:${pctClr(factPctRaw)}"></div></div><span class="prog-r">100%</span></div>
    <div class="modal-sec">
      <div class="modal-sec-title">ОБЩИЙ РЕЗУЛЬТАТ</div>
      <div class="modal-grid">${genHtml}</div>
      <div class="modal-sec-title" style="margin-top:14px">КОНВЕРСИИ</div>
      <div class="modal-grid">${convHtml}</div>
    </div>
    <details class="mop-sub" id="mop-sub-crm">
      <summary class="mop-sub-hdr">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        <span>CRM</span>
      </summary>
      <div class="mop-sub-body"><div class="modal-grid">${crmHtml}</div></div>
    </details>
    <details class="mop-sub" id="mop-sub-warm">
      <summary class="mop-sub-hdr">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        <span>ТЁПЛЫЕ ЛИДЫ</span>
      </summary>
      <div class="mop-sub-body"><div class="modal-grid">${warmHtml}</div></div>
    </details>
    <details class="mop-sub" id="mop-sub-cities" ontoggle="if(this.open)toggleCitiesAll()">
      <summary class="mop-sub-hdr">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        <span>ДЕТАЛИЗАЦИЯ ПО ГОРОДАМ</span>
      </summary>
      <div class="mop-sub-body" data-loaded="0"></div>
    </details>`;
  document.getElementById('mop-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function setFaqTab(tab) {
  S.faqTab = tab;
  updateFirebasePage();
  renderInstruktsii();
}

// ==================== LINKS TAB ====================
let linksOpenInApp = true;

const LINKS_DATA = {
  "Барнаул":     { autocred:"https://barnaul.autocred1.ru/", autohouse:"https://barnaul.autohouse24.ru/", crystal:"https://barnaul.crystal-motors.ru/avtomobili_s_probegom", drom:"https://auto.drom.ru/crystalmotors-barnaul/", autoru:"https://auto.ru/diler/cars/all/crystal_motors_barnaul/", avito:"https://www.avito.ru/brands/i280950426/all/avtomobili?sellerId=e149edb207990686ae688c910d846ab0", gis:"https://2gis.ru/barnaul/geo/563585608610081", select:"https://selectauto24.ru/barnaul", addr:"Правобережный тракт 26", photo:"https://i.ibb.co/Xfk4QxpC/image.jpg" },
  "Кемерово":    { autocred:"https://kemerovo.autocred1.ru/", autohouse:"https://kemerovo.autohouse24.ru/", crystal:"https://kemerovo.crystal-motors.ru/avtomobili_s_probegom", drom:"https://auto.drom.ru/crystalmotors_kemerovo/", autoru:"https://auto.ru/diler/cars/all/crystal_motors_kemerovo/", avito:"https://www.avito.ru/brands/crystal-motors-kemerovo/all/avtomobili?sellerId=855dfcc5d6b5a0aa07927b9db17e5347", gis:"https://2gis.ru/kemerovo/firm/70000001057296192", select:"https://selectauto24.ru/kemerovo", addr:"Тухачевского 64", photo:"https://i.ibb.co/35DvZ0fg/image.jpg" },
  "Красноярск":  { autocred:"https://krasnoyarsk.autocred1.ru/", autohouse:"https://krasnoyarsk.autohouse24.ru/", crystal:"https://krasnoyarsk.crystal-motors.ru/avtomobili_s_probegom", drom:"https://auto.drom.ru/crystalmotorskr/", autoru:"https://auto.ru/diler/cars/all/crystal_motors_krasnoyarsk/", avito:"https://www.avito.ru/brands/crystal-motors-kras/all/avtomobili?sellerId=8c19b51265e7679874976435ee10bd67", gis:"https://2gis.ru/krasnoyarsk/firm/70000001067133445", select:"https://selectauto24.ru/krasnoyarsk", addr:"Караульная 47", photo:"https://i.ibb.co/1YwKcMXp/new.jpg" },
  "Новокузнецк": { autocred:"https://nkz.autocred1.ru/", autohouse:"https://nkz.autohouse24.ru/", crystal:"https://nkz.crystal-motors.ru/avtomobili_s_probegom", drom:"https://auto.drom.ru/crystalmotors-nkz/", autoru:"https://auto.ru/diler/cars/all/crystal_motors_novokuzneck/", avito:"https://www.avito.ru/brands/i194658258", gis:"https://2gis.ru/novokuznetsk/firm/70000001047205820", select:"https://selectauto24.ru/nkz", addr:"Байдаевское шоссе 22", photo:"https://i.ibb.co/t1J4rfM/image.jpg" },
  "Новосибирск": { autocred:"https://novosib.autocred1.ru/", autohouse:"https://novosib.autohouse24.ru/", crystal:"https://novosib.crystal-motors.ru/avtomobili_s_probegom", drom:"https://auto.drom.ru/crystalmotors-novosib/", autoru:"https://auto.ru/diler/cars/all/crystal_motors_novosibirsk/", avito:"https://www.avito.ru/brands/i191016697", gis:"https://2gis.ru/novosibirsk/firm/70000001101740462", select:"https://selectauto24.ru/novosib", addr:"Большевистская 276", photo:"https://i.ibb.co/dw5JjnBF/image.jpg" },
  "Омск":        { autocred:"https://omsk.autocred1.ru/", autohouse:"https://omsk.autohouse24.ru/", crystal:"https://omsk.crystal-motors.ru/avtomobili_s_probegom", drom:"https://auto.drom.ru/crystalmotors-omsk/", autoru:"https://auto.ru/diler/cars/all/crystal_motors_omsk_omsk/", avito:"https://www.avito.ru/brands/i168486683/all/avtomobili?sellerId=e82822bbd8cff3c4cb55135813d60568", gis:"https://2gis.ru/omsk/firm/70000001038741636", select:"https://selectauto24.ru/omsk", addr:"Енисейская 18/1", photo:"https://i.ibb.co/hRRGHS40/image.jpg" },
  "Оренбург":    { autocred:"https://orenburg.autocred1.ru/", autohouse:"https://orenburg.autohouse24.ru/", crystal:"https://orenburg.crystal-motors.ru/avtomobili_s_probegom", drom:"https://auto.drom.ru/dealer332635/", autoru:"https://auto.ru/diler/cars/all/crystal_motors_orenburg/", avito:"https://www.avito.ru/brands/crystal-motors-orenburg/all/avtomobili?sellerId=9e2745065a46a2cb19acbf70fa179be6", gis:"https://2gis.ru/orenburg/firm/70000001093639336", select:"https://selectauto24.ru/orenburg", addr:"Загородное шоссе 13/7", photo:"https://i.ibb.co/nsWKRw4S/image.jpg" },
  "Пермь":       { autocred:"https://perm.autocred1.ru/", autohouse:"https://perm.autohouse24.ru/", crystal:"https://perm.crystal-motors.ru/avtomobili_s_probegom", drom:"https://auto.drom.ru/dealer319811/", autoru:"https://auto.ru/diler/cars/all/crystal_motors_perm/", avito:"https://www.avito.ru/brands/crystal-motors-perm/all/avtomobili?sellerId=b16ce94a3ef65316d378527ebbfa67af", gis:"https://2gis.ru/perm/firm/70000001068737312", select:"https://selectauto24.ru/perm", addr:"Спешилова 101а", photo:"https://i.ibb.co/ynNsHBnP/image.jpg" },
  "Сургут":      { autocred:"https://surgut.autocred1.ru/cars", autohouse:"https://surgut.autohouse24.ru/", crystal:"https://surgut.crystal-motors.ru/avtomobili_s_probegom", drom:"https://auto.drom.ru/crystalmotorssr/", autoru:"https://auto.ru/diler/cars/used/crystal_motors_surgut/", avito:"https://www.avito.ru/brands/crystal-motors-surgut/all?sellerId=751017ca92a4fc11a1f76f4a9913c64f", gis:"https://2gis.ru/surgut/geo/5489397701022742", select:"https://selectauto24.ru/surgut", addr:"Производственная 6", photo:"https://i.ibb.co/PvGjvCGt/image.jpg" },
  "Томск":       { autocred:"https://tomsk.autocred1.ru/cars", autohouse:"https://tomsk.autohouse24.ru/", crystal:"https://tomsk.crystal-motors.ru/avtomobili_s_probegom", drom:"https://auto.drom.ru/crystalmotors-tomsk/", autoru:"https://auto.ru/diler/cars/all/crystal_motors_tomsk_tomsk/", avito:"https://www.avito.ru/brands/i157995801", gis:"https://2gis.ru/tomsk/firm/70000001035719426", select:"https://selectauto24.ru/tomsk", addr:"Смирнова 5и", photo:"https://i.ibb.co/0vTYBCD/image.jpg" },
  "Тюмень":      { autocred:"https://tumen.autocred1.ru/", autohouse:"https://tumen.autohouse24.ru/", crystal:"https://tumen.crystal-motors.ru/avtomobili_s_probegom", drom:"https://auto.drom.ru/crystal_motors/", autoru:"https://auto.ru/diler/cars/all/crystal_motors_tumen/", avito:"https://www.avito.ru/brands/crystal-motors-tumen", gis:"https://2gis.ru/tyumen/firm/70000001092735990", select:"https://selectauto24.ru/tumen", addr:"Республики 254 к3", photo:"https://i.ibb.co/0pLJbLCS/image.jpg" },
  "Челябинск":   { autocred:"https://chel.autocred1.ru/", autohouse:"https://autohouse24.ru/", crystal:"https://chel.crystal-motors.ru/", drom:"https://auto.drom.ru/crystalmotors-chel/", autoru:"https://auto.ru/diler/cars/all/crystal_motors_na_universitetskoy_chelyabinsk/", avito:"https://www.avito.ru/brands/crystal-motors-chel", gis:"https://2gis.ru/chelyabinsk/firm/70000001024950142", select:"https://selectauto24.ru/chel", addr:"Кузнецова 1а", photo:"https://i.ibb.co/rK9sY5Jz/image.jpg" }
};
const LINKS_BTNS = [
  { key:'autocred', label:'AUTOCRED' },
  { key:'autohouse', label:'AUTOHOUSE' },
  { key:'crystal', label:'CRYSTAL' },
  { key:'drom', label:'DROM' },
  { key:'autoru', label:'AUTO.RU' },
  { key:'avito', label:'AVITO' },
  { key:'gis', label:'2ГИС' },
  { key:'select', label:'SELECT' }
];

function renderLinksTab() {
  const opts = Object.keys(LINKS_DATA).map(c => `<option value="${c}">${c}</option>`).join('');
  return `
<div class="links-wrap">
  <div class="links-top-row">
    <div class="links-city-select-wrap">
      <span class="links-city-label">Выберите город</span>
      <select class="links-city-select" id="links-city-sel">
        <option value="" disabled selected>— Выберите город —</option>
        ${opts}
      </select>
    </div>
    <div class="links-mode-wrap">
      <span class="links-city-label">Открывать в</span>
      <div class="links-mode-toggle" id="links-mode-toggle">
        <div class="links-mode-track" id="links-mode-track">
          <div class="links-mode-thumb"></div>
        </div>
        <span class="links-mode-label" id="links-mode-label">В приложении</span>
      </div>
    </div>
  </div>
  <div id="links-content">
    <div class="links-placeholder-inner">Выберите город из списка выше</div>
  </div>
</div>`;
}

function initLinksTab() {
  const sel    = document.getElementById('links-city-sel');
  const track  = document.getElementById('links-mode-track');
  const label  = document.getElementById('links-mode-label');
  const toggle = document.getElementById('links-mode-toggle');
  if (!sel) return;

  function updateToggle() {
    if (linksOpenInApp) {
      track.classList.add('on');
      label.textContent = 'В приложении';
    } else {
      track.classList.remove('on');
      label.textContent = 'В браузере';
    }
  }
  updateToggle();

  toggle.addEventListener('click', function() {
    linksOpenInApp = !linksOpenInApp;
    updateToggle();
  });

  function openLink(url) {
    if (linksOpenInApp) {
      // открываем внутри WebView / приложения
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      // WPF WebView2 → C# WebMessageReceived → Process.Start(UseShellExecute=true)
      if (window.chrome && window.chrome.webview) {
        window.chrome.webview.postMessage(JSON.stringify({ type: 'openExternal', url: url }));
      } else {
        // fallback для обычного браузера
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
  }

  function renderCity(city) {
    const d = LINKS_DATA[city];
    if (!d) return;
    const btns = LINKS_BTNS.map(b =>
      `<button class="links-btn" data-href="${d[b.key]}">${b.label}</button>`
    ).join('');
    const photoHtml = d.photo
      ? `<div class="links-photo-wrap">
           <span class="links-photo-label">Фото автосалона — ${city}</span>
           <div class="links-photo-img-wrap" id="links-photo-wrap">
             <img src="${d.photo}" alt="Фото автосалона ${city}" onerror="this.parentElement.innerHTML='<div class=\\'links-placeholder-inner\\'>Фото временно недоступно</div>'">
           </div>
         </div>`
      : '';
    document.getElementById('links-content').innerHTML = `
      <div class="links-city-header">
        <div class="links-city-info">
          <span class="links-city-name">${city}</span>
          <span class="links-city-addr">${d.addr}</span>
        </div>
        <div class="links-weather-badge" id="links-weather-badge" style="display:none">
          <span id="links-weather-emoji"></span>
          <span id="links-weather-temp"></span>
        </div>
      </div>
      <div class="links-btns-grid">${btns}</div>
      ${photoHtml}`;

    loadLinksWeather(city);

    document.querySelectorAll('.links-btn[data-href]').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        openLink(this.dataset.href);
      });
    });

    const wrap = document.getElementById('links-photo-wrap');
    if (wrap) {
      const img = wrap.querySelector('img');
      wrap.addEventListener('mousemove', function(e) {
        const r = wrap.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width  * 100).toFixed(1);
        const y = ((e.clientY - r.top)  / r.height * 100).toFixed(1);
        img.style.transformOrigin = `${x}% ${y}%`;
      });
      wrap.addEventListener('mouseleave', function() {
        img.style.transformOrigin = 'center center';
      });
    }
  }

  sel.addEventListener('change', function() { if (this.value) renderCity(this.value); });
}

const CITY_WEATHER_COORDS = {
  "Барнаул":     { lat: 53.3474, lon: 83.7784 },
  "Кемерово":    { lat: 55.3550, lon: 86.0873 },
  "Красноярск":  { lat: 56.0184, lon: 92.8672 },
  "Новокузнецк": { lat: 53.7575, lon: 87.1361 },
  "Новосибирск": { lat: 55.0084, lon: 82.9357 },
  "Омск":        { lat: 54.9885, lon: 73.3242 },
  "Оренбург":    { lat: 51.7682, lon: 55.0970 },
  "Пермь":       { lat: 58.0105, lon: 56.2502 },
  "Сургут":      { lat: 61.2540, lon: 73.3962 },
  "Томск":       { lat: 56.5010, lon: 84.9925 },
  "Тюмень":      { lat: 57.1530, lon: 65.5343 },
  "Челябинск":   { lat: 55.1644, lon: 61.4368 }
};

function _cityWeatherEmoji(code) {
  if (code === 0) return '☀️';
  if ([1,2].includes(code)) return '🌤️';
  if (code === 3) return '☁️';
  if ([45,48].includes(code)) return '🌫️';
  if ([51,53,55,56,57].includes(code)) return '🌦️';
  if ([61,63,65,66,67,80,81,82].includes(code)) return '🌧️';
  if ([71,73,75,77,85,86].includes(code)) return '❄️';
  if ([95,96,99].includes(code)) return '⛈️';
  return '⛅';
}

async function loadLinksWeather(city) {
  const coords = CITY_WEATHER_COORDS[city];
  const badge = document.getElementById('links-weather-badge');
  if (!badge) return;
  if (!coords) { badge.style.display = 'none'; return; }
  badge.style.display = 'flex';
  const emojiEl = document.getElementById('links-weather-emoji');
  const tempEl  = document.getElementById('links-weather-temp');
  if (emojiEl) emojiEl.textContent = '…';
  if (tempEl)  tempEl.textContent  = '';
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,weather_code&timezone=auto`;
    const data = await (await fetch(url)).json();
    const temp = Math.round(data.current.temperature_2m);
    const code = data.current.weather_code;
    if (emojiEl) emojiEl.textContent = _cityWeatherEmoji(code);
    if (tempEl)  tempEl.textContent  = (temp > 0 ? '+' : '') + temp + '°';
  } catch(e) {
    if (emojiEl) emojiEl.textContent = '⚠️';
    if (tempEl)  tempEl.textContent  = '--°';
  }
}

function renderMangoTab() {
  const mangoData = [['Барнаул','##9912'],['Красноярск','##1118'],['Кемерово','##1478'],['Новокузнецк','##1213'],['Новосибирск','##1516'],['Омск','##108'],['Оренбург','##11444'],['Пермь','##974'],['Сургут','##1811'],['Томск','##1417'],['Тюмень','##1512'],['Челябинск','##1612'],['АСЦ Пермь','239-26-26']];
  const rows = mangoData.map(([c,n]) => '<tr><td>'+c+'</td><td>'+n+'</td></tr>').join('');
  const html =
    '<div class="sec-title">Добавочные номера Mango</div>' +
    '<div class="mango-wrap"><table class="mango-table"><thead><tr><th>Город</th><th>Доб.№</th></tr></thead><tbody>'+rows+'</tbody></table></div>' +
    '<div class="sec-title">Определить номер</div>' +
    '<div class="pl-wrap">' +
      '<div class="pl-inp-row">' +
        '<input class="pl-input" id="pl-inp" type="text" placeholder="+7 (___) ___-__-__" autocomplete="off"/>' +
        '<button class="pl-btn" id="pl-btn">Определить</button>' +
      '</div>' +
      '<div class="pl-result" id="pl-res"></div>' +
    '</div>';
  setTimeout(function() {
    var b = document.getElementById('pl-btn');
    var i = document.getElementById('pl-inp');
    if (b) b.addEventListener('click', phoneLookup);
    if (i) i.addEventListener('keydown', function(e) { if (e.key === 'Enter') phoneLookup(); });
  }, 0);
  return html;
}

function phoneLookup() {
  var inp = document.getElementById('pl-inp');
  var res = document.getElementById('pl-res');
  var btn = document.getElementById('pl-btn');
  if (!inp || !res || !btn) return;
  var q = inp.value.trim();
  if (!q) { res.innerHTML = '<div class="pl-err">Введите номер телефона</div>'; return; }

  btn.disabled = true;
  res.innerHTML = '<div class="pl-spin"><div class="spin"></div>Запрос…</div>';

  function render(data) {
    btn.disabled = false;
    var d = Array.isArray(data) ? data[0] : data;
    if (!d) { res.innerHTML = '<div class="pl-err">Пустой ответ</div>'; return; }
    if (d.error) { res.innerHTML = '<div class="pl-err">Ошибка: ' + d.error + '</div>'; return; }
    if (!d.phone) { res.innerHTML = '<div class="pl-err">Номер не распознан</div>'; return; }
    var qc = {0:'Верный',1:'Уточнить',2:'Не определён',3:'Неверный'};
    var qcC = {0:'var(--grn)',1:'#fbad33',2:'var(--txt3)',3:'var(--red)'};
    var rows = [];
    if (d.type)      rows.push(['Тип',            d.type]);
    if (d.provider)  rows.push(['Оператор',        d.provider]);
    if (d.country)   rows.push(['Страна',           d.country]);
    if (d.region)    rows.push(['Регион',           d.region]);
    if (d.city)      rows.push(['Город',            d.city]);
    if (d.timezone)  rows.push(['Часовой пояс',     d.timezone]);
    if (d.city_code) rows.push(['DEF / код города', d.city_code]);
    if (d.extension) rows.push(['Добавочный',       d.extension]);
    rows.push(['Качество','<span style="color:'+(qcC[d.qc]||'var(--txt2)')+'">'+( qc[d.qc]||'—')+'</span>']);
    res.innerHTML = '<div class="pl-number">'+d.phone+'</div>' +
      rows.map(function(r){return '<div class="pl-row"><span class="pl-k">'+r[0]+'</span><span class="pl-v">'+r[1]+'</span></div>';}).join('');
  }

  // WPF WebView2 → C# делает запрос (нет CORS)
  if (window.chrome && window.chrome.webview) {
    window._phoneLookupCallback = function(raw) { try { render(JSON.parse(raw)); } catch(e) { btn.disabled=false; res.innerHTML='<div class="pl-err">Ошибка разбора ответа</div>'; } };
    window.chrome.webview.postMessage(JSON.stringify({ type: 'phoneLookup', phone: q }));
    return;
  }

  // Браузер → Apps Script прокси (обходит CORS)
  fetch('https://script.google.com/macros/s/AKfycbz0VDp16YODAqjmVYL7Clv2_nD89nDaSoEvXEALnzU8gVwm8i2rZQvBnmLNtsm-qF05Gw/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ phone: q })
  })
  .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(render)
  .catch(function(err) { btn.disabled=false; res.innerHTML='<div class="pl-err">Ошибка: '+err.message+'</div>'; });
}

// ==================== PLAN EDITOR (CEO) ====================

function openPlanEditor() {
  const planData = S.data.plan || [];
  const body = document.getElementById('pe-plans-body') || document.getElementById('pe-body');
  const status = document.getElementById('pe-status');
  if (!body) return;

  if (!planData.length) {
    body.innerHTML = '<div class="empty">Лист ПЛАН не загружен. Обновите страницу.</div>';
    document.getElementById('plan-editor-overlay').style.display = 'flex';
    document.getElementById('plan-editor-overlay').classList.add('open');
    return;
  }

  const planNames = planData.slice(1).filter(r => r && r[0]);

  // Группируем по роли
  const groups = { crm: [], dozhim: [], other: [] };
  planNames.forEach((row, i) => {
    const name = String(row[0]).trim();
    const role = getRoleByName(name.toLowerCase().trim());
    const item = { name, plan: String(row[1]||'0'), salesPlan: String(row[3]||'0'), idx: i+1 };
    if (role === 'dozhim') groups.dozhim.push(item);
    else if (role === 'crm' || role === '') groups.crm.push(item);
    else groups.other.push(item);
  });

  function makeRows(items, isDozhim) {
    return items.map(it => `<div class="pe-row">
      <span class="pe-name">${it.name}</span>
      <input class="pe-input" type="number" min="0" step="1"
             data-name="${it.name}" data-idx="${it.idx}" value="${it.plan}" title="Визиты"/>
      ${isDozhim ? `<input class="pe-input pe-input-d" type="number" min="0" step="1"
             data-name="${it.name}" data-idx="${it.idx}" value="${it.salesPlan}" title="Продажи" placeholder="Прод."/>` : ''}
    </div>`).join('');
  }

  let html = '';
  if (groups.crm.length) {
    html += `<details class="pe-spoiler"><summary>CRM (${groups.crm.length} чел.)</summary><div class="pe-spoiler-body">${makeRows(groups.crm, false)}</div></details>`;
  }
  if (groups.dozhim.length) {
    html += `<details class="pe-spoiler"><summary>ДОЖИМ (${groups.dozhim.length} чел.) <small style="opacity:.6;font-size:10px">Визиты / Продажи</small></summary><div class="pe-spoiler-body">${makeRows(groups.dozhim, true)}</div></details>`;
  }
  if (groups.other.length) {
    html += `<details class="pe-spoiler"><summary>Прочие (${groups.other.length} чел.)</summary><div class="pe-spoiler-body">${makeRows(groups.other, false)}</div></details>`;
  }
  body.innerHTML = html || '<div class="empty">Нет данных</div>';
  if (status) status.textContent = '';
  document.getElementById('plan-editor-overlay').style.display = 'flex';
  document.getElementById('plan-editor-overlay').classList.add('open');
}

function closePlanEditor() {
  const overlay = document.getElementById('plan-editor-overlay');
  overlay.classList.remove('open');
  overlay.style.display = 'none';
  document.body.style.overflow = '';
}

async function savePlan() {
  const btn = document.getElementById('pe-save-btn');
  const status = document.getElementById('pe-status');
  const bInputs = document.querySelectorAll('.pe-input:not(.pe-input-d)');
  if (!bInputs.length) return;

  btn.disabled = true;
  if (status) status.textContent = 'Сохраняем…';

  // Строим map имя → план продажи из .pe-input-d
  const dMap = {};
  document.querySelectorAll('.pe-input-d').forEach(inp => {
    dMap[inp.dataset.name] = parseInt(inp.value) || 0;
  });

  // Формируем массив строк для записи в Google Sheets (A:D)
  const values = [['Менеджер', 'План', '', 'План продажи']]; // заголовок
  bInputs.forEach(inp => {
    values.push([inp.dataset.name, parseInt(inp.value) || 0, '', dMap[inp.dataset.name] || 0]);
  });

  try {
    const sheetName = SHEETS.plan;
    const range = `'${sheetName}'!A1:D${values.length}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

    const resp = await fetch(url, {
      method: 'PUT',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ range, majorDimension: 'ROWS', values })
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Sheets API: ${resp.status} — ${err}`);
    }

    // Обновляем локальный кэш
    S.data.plan = values;
    if (status) { status.style.color = 'var(--grn)'; status.textContent = '✓ Сохранено'; }
    btn.disabled = false;

    // Перерисовываем отчёт если открыт
    if (document.querySelector('.tab.on')?.dataset.tab === 'otchet') {
      setTimeout(() => { renderOtchet(); }, 300);
    }
    setTimeout(() => closePlanEditorFull(), 1200);
  } catch(e) {
    if (status) { status.style.color = 'var(--red)'; status.textContent = '✗ ' + e.message; }
    btn.disabled = false;
  }
}

// Показываем кнопку «Планы» только CEO (старый btn + hamburger)
function showPlanEditBtnIfCeo(matched) {
  const btn = document.getElementById('btn-plan-edit');
  if (btn) btn.style.display = (matched && isCeoLike(matched.role)) ? 'flex' : 'none';
  // Кнопка уведомления — только CEO
  const notifyBtn = document.getElementById('btn-notify');
  if (notifyBtn) notifyBtn.style.display = (matched && isCeoLike(matched.role)) ? 'flex' : 'none';
  const hmb = document.getElementById('hmb-plan-edit');
  const sep = document.getElementById('hmb-sep-plan');
  const isCeo = matched && isCeoLike(matched.role);
  if (hmb) hmb.style.display = isCeo ? '' : 'none';
  if (sep) sep.style.display = isCeo ? '' : 'none';
  // Кнопка экспорта отчёта — только CEO
  const hmbExp = document.getElementById('hmb-export');
  if (hmbExp) hmbExp.style.display = isCeo ? '' : 'none';
  // Кнопка «Поиск повторов» — только CEO/ROP
  const hmbRep = document.getElementById('hmb-repeats');
  if (hmbRep) hmbRep.style.display = isCeo ? '' : 'none';
  const hmbAnaliz = document.getElementById('hmb-analiz');
  if (hmbAnaliz) hmbAnaliz.style.display = isCeo ? '' : 'none';
  // Итоги — видны всем
  const itogiBtn = document.getElementById('dock-kpi-itogi');
  if (itogiBtn) itogiBtn.style.display = '';
  // Визиты и Доход popup — только CEO
  ['dock-vizity-popup','dock-dohod-popup'].forEach(pid => {
    const p = document.getElementById(pid);
    if (p) p.style.display = isCeo ? '' : 'none';
  });
  // KPI и FAQ popup — всегда видимы
  document.getElementById('dock-kpi-popup').style.display = '';
  document.getElementById('dock-faq-popup').style.display = '';
}

// ==================== END PLAN EDITOR ====================

// ==================== BIRTHDAY NOTIFICATIONS ====================

function pluralDays(n) {
  const m = n % 10, m100 = n % 100;
  if (m === 1 && m100 !== 11) return 'день';
  if (m >= 2 && m <= 4 && (m100 < 10 || m100 >= 20)) return 'дня';
  return 'дней';
}

// Склонение имени в родительный падеж (упрощённое)
function toGenitive(firstName) {
  if (!firstName) return firstName;
  const n = firstName.trim();
  if (n.endsWith('ия')) return n.slice(0,-1) + 'и';   // Анастасия → Анастасии
  if (n.endsWith('ий')) return n.slice(0,-2) + 'ия';   // Дмитрий → Дмитрия
  if (n.endsWith('ья')) return n.slice(0,-1) + 'и';    // Илья → Ильи, Наталья → Натальи
  if (n.endsWith('й'))  return n.slice(0,-1) + 'я';    // Николай → Николая, Сергей → Сергея, Андрей → Андрея
  if (n.endsWith('я'))  return n.slice(0,-1) + 'и';    // прочие на -я
  if (n.endsWith('а'))  return n.slice(0,-1) + 'ы';    // Никита → Никиты, Анна → Анны
  return n + 'а';                                        // Кирилл → Кирилла, Эдуард → Эдуарда
}

// Парсим ДР: "дд.мм" или "дд.мм.гг" → { day, month }
function parseDOB(dob) {
  if (!dob) return null;
  const parts = String(dob).trim().split('.');
  if (parts.length < 2) return null;
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  if (!day || !month || day < 1 || day > 31 || month < 1 || month > 12) return null;
  return { day, month };
}

// Количество дней до ближайшего ДР (0 = сегодня)
function daysUntilBirthday(day, month) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let bday = new Date(today.getFullYear(), month - 1, day);
  if (bday < today) bday.setFullYear(today.getFullYear() + 1);
  return Math.round((bday - today) / 86400000);
}

const BDAY_THRESHOLDS = [14, 10, 7];

function getBdayStorageKey(name, birthdayKey, threshold) {
  return 'crm_bday_' + name + '_' + birthdayKey + '_' + threshold;
}

// Получить ключ предстоящего ДР для хранения: "месяц-день-год"
function getBirthdayKey(day, month) {
  const now = new Date();
  let year = now.getFullYear();
  const bday = new Date(year, month - 1, day);
  if (bday < new Date(now.getFullYear(), now.getMonth(), now.getDate())) year++;
  return month + '-' + day + '-' + year;
}

let _bdayBannerQueue = [];
let _bdayBannerTimer = null;

function checkBirthdayNotifications() {
  if (!S.usersData || !S.user) return;
  const now = new Date();
  const hour = now.getHours();
  if (hour < 11) {
    // До 11:00 — планируем проверку на 11:00
    const msTo11 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 0, 0) - now;
    clearTimeout(_bdayBannerTimer);
    _bdayBannerTimer = setTimeout(checkBirthdayNotifications, msTo11);
    return;
  }

  const currentUserName = (S.user.email || '').toLowerCase();
  const matched = findUserInSheet();
  const myNameLow = matched ? matched.name.toLowerCase() : '';

  const toShow = []; // { name, firstName, days, threshold, storageKey }

  for (let i = 1; i < S.usersData.length; i++) {
    const row = S.usersData[i];
    if (!row || !row[1]) continue;
    const fullName = String(row[1]).trim();
    const nameLow  = fullName.toLowerCase();

    // Не показываем именнику самому себе
    if (nameLow === myNameLow) continue;

    const dob = parseDOB(row[5]); // col F = DOB
    if (!dob) continue;

    const days = daysUntilBirthday(dob.day, dob.month);
    const bdayKey = getBirthdayKey(dob.day, dob.month);

    for (const threshold of BDAY_THRESHOLDS) {
      if (days <= threshold) {
        const key = getBdayStorageKey(nameLow, bdayKey, threshold);
        if (!localStorage.getItem(key)) {
          // Имя (второе слово = имя, первое = фамилия)
          const parts = fullName.split(/\s+/);
          const firstName = parts.length >= 2 ? parts[1] : parts[0];
          toShow.push({ firstName, days, threshold, key, day: dob.day, month: dob.month });
          break; // показываем по максимальному threshold который ещё не показан
        }
      }
    }
  }

  if (toShow.length > 0) showBdayQueue(toShow);
}

function showBdayQueue(queue) {
  _bdayBannerQueue = queue;
  showNextBday();
}

// Цвета шаров
const BALLOON_COLORS = [
  '#ff6b9d','#ff9f43','#ffeaa7','#55efc4','#74b9ff',
  '#a29bfe','#fd79a8','#e17055','#00cec9','#6c5ce7',
];

function spawnBalloons() {
  const container = document.getElementById('bday-balloons');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const b = document.createElement('div');
    b.className = 'bday-balloon';
    const color = BALLOON_COLORS[i % BALLOON_COLORS.length];
    b.style.background = `radial-gradient(circle at 35% 35%, ${color}ee, ${color}88)`;
    b.style.left = (5 + Math.random() * 90) + '%';
    b.style.animationDuration = (6 + Math.random() * 8) + 's';
    b.style.animationDelay = (Math.random() * 5) + 's';
    b.style.width  = (22 + Math.random() * 14) + 'px';
    b.style.height = (28 + Math.random() * 16) + 'px';
    container.appendChild(b);
  }
}

function blowCandle(el) {
  if (el.classList.contains('out')) return;
  el.classList.add('out');
  // Дымок
  const smoke = document.createElement('div');
  smoke.className = 'velas-smoke';
  el.appendChild(smoke);
  setTimeout(() => smoke.remove(), 900);
  // Если все потушены
  const all = document.querySelectorAll('#bday-banner .velas');
  if ([...all].every(c => c.classList.contains('out'))) {
    setTimeout(() => toast('🎊 Все свечи потушены!', 's'), 300);
  }
}

function resetCandles() {
  document.querySelectorAll('#bday-banner .velas').forEach(v => {
    v.classList.remove('out');
    v.querySelectorAll('.velas-smoke').forEach(s => s.remove());
  });
}

function restartCakeAnimations() {
  // Клонируем SVG — SMIL анимации перезапускаются с нуля
  const oldSvg = document.getElementById('bday-cake-svg');
  if (oldSvg) {
    const newSvg = oldSvg.cloneNode(true);
    oldSvg.parentNode.replaceChild(newSvg, oldSvg);
  }
  // Сброс CSS-анимаций свечей через reflow
  document.querySelectorAll('#bday-banner .velas').forEach(v => {
    v.classList.remove('out');
    v.querySelectorAll('.velas-smoke').forEach(s => s.remove());
    v.style.animation = 'none';
    void v.offsetWidth;
    v.style.animation = '';
  });
  document.querySelectorAll('#bday-banner .fuego').forEach(f => {
    f.style.animation = 'none';
    void f.offsetWidth;
    f.style.animation = '';
  });
}

function showNextBday() {
  if (!_bdayBannerQueue.length) return;
  const item = _bdayBannerQueue.shift();
  const gen = toGenitive(item.firstName);
  const monthNames = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const dateStr = item.day + ' ' + (monthNames[item.month - 1] || '');
  document.getElementById('bday-msg').textContent =
    'У твоего коллеги, ' + gen + ', скоро день рождения (' + dateStr + '). Это знаменательный день! Начните уже включаться в процесс сбора средств на подарок!';
  const dateEl = document.getElementById('bday-date');
  if (dateEl) dateEl.textContent = 'До дня рождения: ' + item.days + ' ' + pluralDays(item.days);

  const banner = document.getElementById('bday-banner');
  banner.classList.remove('on');
  void banner.offsetWidth; // reflow перезапускает animation:up

  restartCakeAnimations();
  spawnBalloons();
  banner.classList.add('on');

  try {
    const audio = document.getElementById('bday-audio');
    if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }
  } catch(e) {}

  try { localStorage.setItem(item.key, '1'); } catch(e) {}
}

function closeBdayBanner() {
  document.getElementById('bday-banner').classList.remove('on');
  if (_bdayBannerQueue.length > 0) {
    setTimeout(showNextBday, 800);
  }
}

// ==================== END BIRTHDAY NOTIFICATIONS ====================

// ==================== SELF BIRTHDAY CELEBRATION ====================

function checkSelfBirthday() {
  if (!S.usersData) return;
  const matched = findUserInSheet();
  if (!matched || !matched.name) return;
  const myNameLow = matched.name.toLowerCase().trim();

  let selfDob = null;
  for (let i = 1; i < S.usersData.length; i++) {
    const row = S.usersData[i];
    if (row && (row[1]||'').toLowerCase().trim() === myNameLow) {
      selfDob = parseDOB(row[5]);
      break;
    }
  }
  if (!selfDob) return;

  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const bday  = new Date(now.getFullYear(), selfDob.month - 1, selfDob.day);
  const diff  = Math.round((today - bday) / 86400000);

  // Показываем если ДР было сегодня или до 5 дней назад (не успел зайти)
  if (diff < 0 || diff > 5) return;

  const key = 'crm_bday_self_' + myNameLow + '_' + now.getFullYear();
  if (localStorage.getItem(key)) return;
  try { localStorage.setItem(key, '1'); } catch(e) {}

  setTimeout(startBirthdayCelebration, 1200);
}

function startBirthdayCelebration() {
  const overlay = document.getElementById('bday-self');
  const canvas  = document.getElementById('bday-canvas');
  const textEl  = document.getElementById('bday-self-text');
  if (!overlay || !canvas || !textEl) return;

  // Текст — разбиваем на буквы
  const msg = 'С Днём Рождения!';
  textEl.innerHTML = msg.split('').map((ch, i) =>
    `<span class="bday-letter" style="transition-delay:${i * 40}ms">${ch === ' ' ? '&nbsp;' : ch}</span>`
  ).join('');

  overlay.classList.add('on');

  // Настраиваем canvas
  const W = canvas.width  = window.innerWidth;
  const H = canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');

  // ── КОНФЕТТИ ──────────────────────────────────────────────
  const COLORS = ['#ff6b9d','#ff9f43','#ffeaa7','#55efc4','#74b9ff',
                  '#a29bfe','#fd79a8','#e17055','#6c5ce7','#fff'];
  const pieces = [];
  for (let i = 0; i < 180; i++) {
    pieces.push({
      x:     Math.random() * W,
      y:     -Math.random() * H * 0.5,
      w:     6 + Math.random() * 8,
      h:     10 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot:   Math.random() * Math.PI * 2,
      rotV:  (Math.random() - .5) * .12,
      vx:    (Math.random() - .5) * 1.5,
      vy:    2.5 + Math.random() * 3.5,
      wave:  Math.random() * Math.PI * 2,
    });
  }

  // ── ЧАСТИЦЫ ВЗРЫВА ────────────────────────────────────────
  let particles = [];
  let exploded  = false;

  function spawnExplosion() {
    const letters = textEl.querySelectorAll('.bday-letter');
    letters.forEach(el => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top  + r.height / 2;
      for (let i = 0; i < 18; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 9;
        particles.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          size: 4 + Math.random() * 5,
          life: 1,
        });
      }
    });
  }

  let startT = null;
  let running = true;

  function frame(ts) {
    if (!running) return;
    if (!startT) startT = ts;
    const t = (ts - startT) / 1000;
    ctx.clearRect(0, 0, W, H);

    // ── Конфетти ──
    if (t < 8) {
      for (const p of pieces) {
        p.y  += p.vy;
        p.x  += p.vx + Math.sin(p.wave + t) * 0.6;
        p.rot += p.rotV;
        if (p.y > H + 20) { p.y = -20; p.x = Math.random() * W; }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
      }
    }

    // ── Текст появляется на t=3 ──
    if (t >= 3 && !textEl.classList.contains('visible') && !exploded) {
      textEl.classList.add('visible');
    }

    // ── Взрыв на t=6 ──
    if (t >= 6 && !exploded) {
      exploded = true;
      textEl.classList.add('exploding');
      spawnExplosion();
    }

    // ── Частицы взрыва ──
    for (const p of particles) {
      p.x    += p.vx;
      p.y    += p.vy;
      p.vy   += 0.2; // гравитация
      p.life -= 0.022;
      if (p.life <= 0) continue;
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── Закрываем на t=8.5 ──
    if (t >= 8.5) {
      running = false;
      overlay.style.transition = 'opacity .6s';
      overlay.style.opacity    = '0';
      setTimeout(() => {
        overlay.classList.remove('on');
        overlay.style.opacity    = '';
        overlay.style.transition = '';
        textEl.classList.remove('visible','exploding');
        particles = [];
      }, 650);
      return;
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  // Звук
  try {
    const a = document.getElementById('bday-audio');
    if (a) { a.currentTime = 0; a.play().catch(()=>{}); }
  } catch(e) {}
}

// ==================== END SELF BIRTHDAY CELEBRATION ====================

function closeMopModal(e) {
  if (e && e.target !== document.getElementById('mop-overlay')) return;
  // Возврат на список "Менеджеры в плане", если открывали оттуда
  if (window._ceoMopReturnToList) {
    window._ceoMopReturnToList = false;
    openCeoMgrsInPlanModal();
    return;
  }
  document.getElementById('mop-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ==================== MONTH DROPDOWN ====================
function showMonthDropdown() {
  const existing = document.querySelector('.month-dropdown');
  if (existing) { existing.remove(); return; } // toggle
  const dropdown = document.createElement('div');
  dropdown.className = 'month-dropdown';
  const months = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const yy = d.getFullYear().toString().slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const suffix = mm + yy;
    months.push({ suffix, name: getMonthName(suffix), num: mm, year: '20'+yy });
  }
  months.forEach(m => {
    const btn = document.createElement('button');
    const isActive = m.suffix === currentSuffix;
    btn.innerHTML = `<span style="font-family:'Unbounded',sans-serif;font-size:12px;font-weight:800;min-width:22px;text-align:center;${isActive?'color:var(--acc)':''}">${m.num}</span><span style="flex:1;${isActive?'color:var(--acc)':''}">${m.name}</span>${isActive?'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>':''}`;
    btn.style.cssText = 'display:flex;align-items:center;gap:8px;';
    btn.onclick = () => { setCurrentMonth(m.suffix); dropdown.remove(); };
    dropdown.appendChild(btn);
  });

  // Крепим к month-wrap
  const wrap = document.getElementById('month-wrap');
  if (wrap) {
    wrap.appendChild(dropdown);
  } else {
    // fallback
    const badge = document.getElementById('badge-month');
    badge.parentNode.style.position = 'relative';
    badge.parentNode.appendChild(dropdown);
  }
  dropdown.style.display = 'flex';

  const closeDropdown = (e) => {
    const badge = document.getElementById('badge-month');
    if (!dropdown.contains(e.target) && e.target !== badge) {
      dropdown.remove();
      document.removeEventListener('click', closeDropdown);
    }
  };
  setTimeout(() => document.addEventListener('click', closeDropdown), 0);
}

// ==================== PERSONAL PAGE ====================
function getCnvrsRowGlobal(name, section) {
  const cnvrs = S.data.cnvrs || [];
  const n = (name||'').toLowerCase().trim();
  let rows;
  if (section === 'crm') rows = cnvrs.slice(2, 11);
  else if (section === 'warm') rows = cnvrs.slice(16, 25);
  else rows = cnvrs.slice(30, 39);
  return rows.find(r => (r[0]||'').toLowerCase().trim() === n) || [];
}

// Возвращает rang менеджера ('manager' | 'rookie') по имени из USERS
function getRangByName(nameLow) {
  if (!S.usersData) return 'manager';
  for (let i = 1; i < S.usersData.length; i++) {
    const row = S.usersData[i];
    const name = (row[1]||'').toLowerCase().trim();
    if (name === nameLow) return (row[4]||'manager').toLowerCase().trim();
  }
  return 'manager';
}

// Возвращает role менеджера ('crm' | 'dozhim' | 'ceo') по имени из USERS
// CEO и ROP имеют одинаковые права/доступы
function isCeoLike(role) {
  const r = String(role || '').toLowerCase().trim();
  return r === 'ceo' || r === 'rop' || r === 'роп';
}

function getRoleByName(nameLow) {
  if (!S.usersData) return null;
  for (let i = 1; i < S.usersData.length; i++) {
    const row = S.usersData[i];
    const name = (row[1]||'').toLowerCase().trim();
    if (name === nameLow) return (row[2]||'crm').toLowerCase().trim();
  }
  return null; // имени нет в USERS — не управленческая роль
}

function findUserInSheet() {
  if (!S.usersData || !S.user) return null;
  const email = normalizeEmail(S.user.email);
  for (let i = 1; i < S.usersData.length; i++) {
    const row = S.usersData[i];
    const emails = splitEmails(row[0]);
    if (emails.includes(email)) {
      return {
        email: row[0],
        name:  (row[1]||'').trim(),
        role:  (row[2]||'crm').toLowerCase().trim(),
        fund:  (row[3]||'').toLowerCase().trim() === 'да',
        rang:  (row[4]||'manager').toLowerCase().trim(), // Manager или Rookie
      };
    }
  }
  return null;
}

function showAccessDenied(reason = 'Почта не найдена в USERS') {
  const email = normalizeEmail(S.user?.email) || 'email не получен';
  S.authReady = false;
  closeAllDockPopups?.();
  closePresenceModal?.();
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  markFirebaseOffline(true);
  tokenExpiresAt = 0;
  S.token = null;
  S.user = null;
  S.usersData = null;
  S.data = { otchet:null, dohod:null, grafik:null, grafikFmt:null, instruktsii:null, d_otchet:null, d_dohod:null, cnvrs:null, stavki:null, d_stavki:null, vizity:null, plan:null, d_vizity:null, vizityFmt:null, d_vizityFmt:null };
  ['crm_tok','crm_exp','crm_user'].forEach(k => localStorage.removeItem(k));
  document.getElementById('main-nav').style.display = 'none';
  document.getElementById('main-dock').style.display = 'none';
  document.getElementById('user-wrap').style.display = 'none';
  const hmbl = document.getElementById('hmb-logout'); if (hmbl) hmbl.style.display = 'none';
  const hmbsl = document.getElementById('hmb-sep-logout'); if (hmbsl) hmbsl.style.display = 'none';
  const hmbAcc = document.getElementById('hmb-account-btn'); if (hmbAcc) hmbAcc.style.display = 'none';
  const hmbAccSep = document.getElementById('hmb-sep-account'); if (hmbAccSep) hmbAccSep.style.display = 'none';
  const hmbT = document.getElementById('hmb-trophies'); if (hmbT) hmbT.style.display = 'none';
  const hmbA = document.getElementById('hmb-about-btn'); if (hmbA) hmbA.style.display = 'none';
  ['otchet','dohod','grafik','instruktsii','personal','rating','vizity','ceo','analiz','trophies','profile'].forEach(t => {
    const s = document.getElementById('scr-'+t);
    if (s) { s.classList.remove('on'); s.style.display = ''; }
  });
  closeHamburger?.();
  const ls = document.getElementById('scr-login');
  if (ls) { ls.style.display = ''; ls.classList.add('on'); }
  document.body.classList.add('login-active');
  if (window._loginLiquidInit) window._loginLiquidInit();
  toast(`${reason}: ${email}`, 'e');
}

async function loadUsersAndStart() {
  try {
    apiCacheInvalidate('USERS');
    S.usersData = await api('USERS', 'A1:P500');
  } catch(e) { S.usersData = []; showAccessDenied('Нет доступа к таблице'); return; }
  const matched = findUserInSheet();
  refreshFirebaseProfile();
  // Перерисуем имя/аватар в гамбургере, когда USERS уже загружен
  try { if (typeof renderUser === 'function') renderUser(); } catch(_) {}
  if (matched && matched.name) {
    const parts = matched.name.trim().split(/\s+/);
    const firstName = parts.length >= 2 ? parts[1] : parts[0];
    toast('Приветствую, ' + firstName + '!', 's');
    // Показываем приветствие (aurora на hdr-title уже постоянная)
    const hdrGreeting = document.getElementById('hdr-greeting');
    if (hdrGreeting) {
      hdrGreeting.textContent = 'Привет, ' + firstName + '!';
      hdrGreeting.classList.add('aurora');
      hdrGreeting.style.display = '';
    }
    showPlanEditBtnIfCeo(matched);
    startNotificationListener();
    initSverkaToggle();
    if (typeof startRemindersLoop === 'function') startRemindersLoop();
    // Проверяем режим технического обслуживания (не для CEO)
    if (!isCeoLike(matched.role) && S.svcMode) {
      showMaintenancePage();
    }
    // Иконки автора в "О проекте" — показываем после авторизации
    const authorLinks = document.getElementById('about-author-links');
    if (authorLinks) {
      const authorHtml = getMgrMessengerHtml('Бочаров Юлиан') || getMgrMessengerHtml('Юлиан Бочаров') || '';
      if (authorHtml) {
        authorLinks.innerHTML = authorHtml;
        authorLinks.style.display = 'flex';
      }
    }
    // Аватар автора
    const authorAvatar = document.getElementById('about-author-avatar');
    if (authorAvatar) {
      const id = getMgrCrmId('Бочаров Юлиан') || getMgrCrmId('Юлиан Бочаров');
      if (id) {
        const src = `logos/avatar/${id}-laughter.png`;
        const probe = new Image();
        probe.onload  = () => { authorAvatar.src = src; authorAvatar.style.display = ''; };
        probe.onerror = () => {
          const fallback = `logos/avatar/${id}-default.png`;
          const probe2 = new Image();
          probe2.onload  = () => { authorAvatar.src = fallback; authorAvatar.style.display = ''; };
          probe2.onerror = () => {};
          probe2.src = fallback;
        };
        probe.src = src;
      }
    }
    checkBirthdayNotifications();
    checkSelfBirthday();
    if (isCeoLike(matched.role)) {
      S.ratingDept = 'crm';
      S.authReady = true;
      showScr('ceo');
      loadCeoDashboard();
    } else {
      S.authReady = true;
      goPersonal();
    }
    // Фоновая предзагрузка остальных данных через 8 сек (не перегружаем API при старте)
    setTimeout(() => backgroundPrefetch(matched), 3000);
  } else {
    showAccessDenied();
    toast('Почта не найдена в USERS', 'e');
  }
}

// Фоновая предзагрузка данных всех вкладок после старта
async function backgroundPrefetch(matched) {
  const role     = matched?.role || 'crm';
  const isCeo    = isCeoLike(role);
  const isDozhim = role === 'dozhim';

  const fetches = [];
  if (!S.data.vizity)      fetches.push(api(SHEETS.vizity,      'A:N').then(d => S.data.vizity      = d).catch(()=>{}));
  if (!S.data.plan)        fetches.push(api(SHEETS.plan,        'A:D').then(d => S.data.plan        = d).catch(()=>{}));
  if (!S.data.grafik)      fetches.push(api(SHEETS.grafik,      'A1:AI25').then(d => S.data.grafik  = d).catch(()=>{}));
  if (!S.data.cnvrs)       fetches.push(api(SHEETS.cnvrs,       'A1:N40').then(d => S.data.cnvrs    = d).catch(()=>{}));
  if (!S.data.stavki)      fetches.push(api(SHEETS.stavki,      'A1:B25').then(d => S.data.stavki   = d).catch(()=>{}));
  if (!S.data.d_vizity)    fetches.push(api(SHEETS.d_vizity,    'A:N').then(d => S.data.d_vizity    = d).catch(()=>{}));
  if (!S.data.instruktsii) fetches.push(api(SHEETS.instruktsii, 'A1:C200').then(d => S.data.instruktsii = d).catch(()=>{}));

  if (!fetches.length) return;

  S.silentRefresh = true;
  try {
    await Promise.all(fetches);
    if (document.getElementById('scr-vizity')?.classList.contains('on')) return;
    const activeTab = document.querySelector('.tab.on')?.dataset.tab;
    if (activeTab) renderTab(activeTab);
    const personalOn = document.getElementById('scr-personal')?.classList.contains('on');
    if (personalOn) { const m = findUserInSheet(); if (m) renderPersonal(m); }
  } finally {
    S.silentRefresh = false;
  }
}

// ==================== ИНКОГНИТО (доход) + ВСТРЯСКА ====================
let _shakeAttached = false;
let _shakeLastX = null, _shakeLastY = null, _shakeLastZ = null;
let _shakeLastAt = 0;
const SHAKE_THRESHOLD = 14;
const SHAKE_COOLDOWN  = 1200;

function _shakeHandle(ev) {
  const a = ev.accelerationIncludingGravity || ev.acceleration;
  if (!a) return;
  if (_shakeLastX !== null) {
    const dx = Math.abs(a.x - _shakeLastX);
    const dy = Math.abs(a.y - _shakeLastY);
    const dz = Math.abs(a.z - _shakeLastZ);
    const force = dx + dy + dz;
    const now = Date.now();
    if (force > SHAKE_THRESHOLD && now - _shakeLastAt > SHAKE_COOLDOWN) {
      if (document.getElementById('scr-personal')?.classList.contains('on')) {
        _shakeLastAt = now;
        toggleIncognito();
      } else if (document.getElementById('scr-ceo')?.classList.contains('on')) {
        _shakeLastAt = now;
        toggleIncognitoCeo();
      }
    }
  }
  _shakeLastX = a.x; _shakeLastY = a.y; _shakeLastZ = a.z;
}

function attachShakeListener() {
  if (_shakeAttached) return;
  _shakeAttached = true;
  window.addEventListener('devicemotion', _shakeHandle, { passive: true });
}

async function requestShakePermission() {
  // Если уже подключено — ничего не делаем
  if (_shakeAttached) return true;
  if (typeof DeviceMotionEvent === 'undefined') return false;
  // iOS 13+
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      const state = await DeviceMotionEvent.requestPermission();
      if (state === 'granted') { attachShakeListener(); return true; }
      return false;
    } catch(e) { return false; }
  }
  // Android / другие
  attachShakeListener();
  return true;
}

function toggleIncognito() {
  const cur = localStorage.getItem('crm_incognito') === '1';
  localStorage.setItem('crm_incognito', cur ? '0' : '1');
  const panel = document.querySelector('#c-personal .kpi-income-panel');
  const btn = document.querySelector('#c-personal .kpi-incognito-btn');
  if (panel) panel.classList.toggle('kpi-incognito', !cur);
  if (btn) btn.textContent = !cur ? '👁' : '🙈';
  if (typeof toast === 'function') toast(!cur ? 'Инкогнито: ON' : 'Инкогнито: OFF', 's');
  requestShakePermission();
}

function toggleIncognitoCeo() {
  const cur = localStorage.getItem('crm_incognito') === '1';
  localStorage.setItem('crm_incognito', cur ? '0' : '1');
  const panel = document.querySelector('#c-ceo .ceo-rop-panel');
  const btn = document.querySelector('#c-ceo .ceo-rop-panel .kpi-incognito-btn');
  if (panel) panel.classList.toggle('kpi-incognito', !cur);
  if (btn) btn.textContent = !cur ? '👁' : '🙈';
  if (typeof toast === 'function') toast(!cur ? 'Инкогнито: ON' : 'Инкогнито: OFF', 's');
  requestShakePermission();
}

function openRopIncomeModal() {
  const d = window._ropIncomeData;
  if (!d) return;
  const modalTitle = document.querySelector('#income-overlay .income-modal-title');
  const mc = document.getElementById('income-modal-content');
  if (modalTitle) modalTitle.innerHTML = `Схема премирования ROP`;
  document.getElementById('income-overlay')?.classList.remove('visits-mode');
  mc.removeAttribute('data-modal');
  const koefRow = (p, k) => `<tr><td>${p}</td><td style="text-align:right;font-weight:800">×${k}</td></tr>`;
  mc.innerHTML = `
    <div class="rop-modal-block">
      <div class="rop-modal-h">Состав дохода</div>
      <div class="rop-modal-row"><span>Оклад</span><b>${fmtRub(d.oklad)}</b></div>
      <div class="rop-modal-row"><span>+ Доплата за отдел Дожим</span><b>${fmtRub(d.doplata)}</b></div>
      <div class="rop-modal-row"><span>= База</span><b>${fmtRub(d.oklad + d.doplata)}</b></div>
      <div class="rop-modal-row"><span>× Коэфф. по прогнозу плана</span><b style="color:${pctClr(d.progPct)}">×${d.koef.toFixed(2)}</b></div>
      <div class="rop-modal-row rop-modal-total"><span>Итого</span><b>${fmtRub(d.total)}</b></div>
    </div>
    <div class="rop-modal-block">
      <div class="rop-modal-h">Шкала коэффициентов</div>
      <table class="rop-modal-table">
        <tbody>
          ${koefRow('Прогноз менее 100%', '0.80')}
          ${koefRow('100% – 119%', '1.00')}
          ${koefRow('120% – 129%', '1.20')}
          ${koefRow('130% и выше', '1.30 (макс)')}
        </tbody>
      </table>
    </div>
    <div class="rop-modal-block">
      <div class="rop-modal-h">Расчёт плана ROP</div>
      <div class="rop-modal-note">План ROP = План отдела CRM × <b>0.8</b><br>Это даёт ROP запас 20% — позволяет получать ×1.20 даже когда отдел выполняет свой план ровно.</div>
      <div class="rop-modal-row"><span>План отдела CRM</span><b>${Math.round(d.crmPlanSum)} виз.</b></div>
      <div class="rop-modal-row"><span>План ROP (×0.8)</span><b>${Math.round(d.ropPlan)} виз.</b></div>
      <div class="rop-modal-row"><span>Факт CRM (сейчас)</span><b>${Math.round(d.crmFact)} виз.</b></div>
      <div class="rop-modal-row"><span>Прогноз выполнения ROP</span><b style="color:${pctClr(d.progPct)}">${d.progPct}%</b></div>
    </div>`;
  document.getElementById('income-overlay').classList.add('open', 'ceo-mode');
  document.body.style.overflow = 'hidden';
}

// На Android можно сразу прицепиться
if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission !== 'function') {
  attachShakeListener();
}

// ==================== ПРИВЕТСТВИЯ МЕНЕДЖЕРА ====================
const MGR_GREETINGS = [
  'сегодня закроешь лучший контракт','ты умеешь убеждать клиентов','вперед к новым сделкам',
  'твой результат вдохновляет команду','продажи любят твою энергию','клиенты доверяют твоему слову',
  'время покорять новые вершины','твоя уверенность приносит успех','отличный день для продаж',
  'твой настрой решает всё','будь лидером этого дня','каждая встреча ведет к успеху',
  'сегодня твой звездный час','клиенты ждут твоих предложений','продажи начинаются с улыбки',
  'ты создаешь сильные результаты','действуй смело и уверенно','твои сделки впечатляют всех',
  'энергия успеха уже рядом','вперед за новыми победами','ты магнит для клиентов',
  'сегодня отличный день побеждать','твои переговоры приносят результат','держи темп и драйв',
  'твой профессионализм вызывает уважение','сегодня всё получится идеально','успех любит твою настойчивость',
  'твоя энергия заряжает команду','клиенты ценят твою экспертизу','каждый звонок приближает победу',
  'продажи — твоя сильная сторона','сегодня время больших результатов','ты умеешь находить возможности',
  'вперед к рекордным показателям','твоя уверенность вдохновляет клиентов','новые сделки уже близко',
  'твоя харизма помогает продавать','каждый клиент — новая возможность','твой успех неизбежен сегодня',
  'действуй быстро и уверенно','ты способен на большее','твой день начинается с побед',
  'продажи идут в твои руки','ты умеешь закрывать сделки','сегодня клиенты скажут «да»',
  'твоя настойчивость приносит результаты','ты создаешь доверие с первого слова','вперед за высоким чеком',
  'твоя энергия ведет к успеху','клиенты чувствуют твою уверенность','сегодня время новых достижений',
  'ты умеешь вдохновлять покупателей','твои продажи растут ежедневно','ты работаешь на максимум',
  'сегодня всё складывается удачно','ты легко находишь общий язык','твой подход приносит прибыль',
  'продажи любят активных людей','твоя работа дает сильный результат','сегодня будет много успешных звонков',
  'твоя уверенность покоряет клиентов','каждый контакт ведет к продаже','вперед к новым рекордам',
  'ты умеешь продавать красиво','сегодня твой день успеха','твой опыт помогает побеждать',
  'ты сильный переговорщик','продажи растут благодаря тебе','сегодня будет продуктивный день',
  'твоя настойчивость впечатляет клиентов','ты создаешь возможности ежедневно','время брать новые высоты',
  'твои сделки двигают компанию вперед','ты умеешь слышать клиента','сегодня удача на твоей стороне',
  'ты работаешь как настоящий лидер','твоя энергия приносит результат','клиенты любят твой подход',
  'сегодня всё получится отлично','ты умеешь достигать целей','продажи — твоя территория успеха',
  'твой настрой ведет к победе','сегодня будут сильные результаты','ты вдохновляешь своей работой',
  'твои идеи помогают продавать','вперед к большим достижениям','ты умеешь работать эффективно',
  'сегодня будет много побед','твой успех заметен всем','ты умеешь вести за собой',
  'продажи идут благодаря твоим усилиям','твой голос внушает доверие','сегодня отличный шанс вырасти',
  'ты умеешь делать результат','твоя работа приносит прибыль','сегодня всё будет в плюс',
  'ты настоящий мастер продаж','вперед к лучшим показателям','твоя уверенность открывает двери',
  'ты создаешь успех каждый день'
];

function _getYekaterinburgDate() {
  // UTC+5 без учета DST
  const now = new Date();
  return new Date(now.getTime() + (5 * 60 + now.getTimezoneOffset()) * 60 * 1000);
}

function _getMgrSchedToday(nameLow) {
  // Возвращает { today: 'Р'|'В'|null, tomorrow: 'Р'|'В'|null }
  const raw = S.data.grafik;
  if (!raw || raw.length < 3) return { today: null, tomorrow: null };
  const ekt = _getYekaterinburgDate();
  const todayDay = ekt.getDate();
  const tomorrow = new Date(ekt.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowDay = tomorrow.getDate();
  const idx = buildSchedIndex(raw);
  const entry = idx[nameLow];
  if (!entry) return { today: null, tomorrow: null };
  const { row: mgrRow, daysRow } = entry;
  let today = null, tom = null;
  for (let c = 1; c < daysRow.length; c++) {
    const d = parseInt(daysRow[c]);
    if (d === todayDay) today = normalizeSchedVal(mgrRow[c]) || null;
    if (d === tomorrowDay) tom = normalizeSchedVal(mgrRow[c]) || null;
  }
  return { today, tomorrow: tom };
}

function getMgrGreeting(fullName) {
  const parts = (fullName || '').trim().split(/\s+/);
  const firstName = parts.length >= 2 ? parts[1] : (parts[0] || '');
  const nameLow = (fullName || '').toLowerCase().trim();
  const ekt = _getYekaterinburgDate();
  const hour = ekt.getHours();
  const sched = _getMgrSchedToday(nameLow);
  const todayR = sched.today === 'Р';
  const tomR   = sched.tomorrow === 'Р';

  let phrase = '';

  if (sched.today === 'В') {
    phrase = 'отдыхай и набирайся сил!';
  } else if (sched.today === 'О') {
    phrase = 'наслаждайся отпуском!';
  } else if (todayR && hour >= 9 && hour < 18) {
    // Рабочее время → ротация каждые 2 часа
    const dayOfYear = Math.floor((ekt - new Date(ekt.getFullYear(), 0, 0)) / 86400000);
    const bucket = Math.floor(hour / 2);
    const idx = (dayOfYear * 12 + bucket) % MGR_GREETINGS.length;
    phrase = MGR_GREETINGS[idx] + '!';
  } else if ((hour >= 18 || hour < 4) && (todayR && tomR)) {
    phrase = 'солнце уже село!';
  } else if (hour >= 4 && hour < 9 && (todayR && tomR)) {
    phrase = 'рабочий день скоро начнется!';
  } else {
    phrase = 'хорошего дня!';
  }

  const fn = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase() : '';
  const html = `${fn}, ${phrase}`;
  return { firstName: fn, phrase, html };
}

function goPersonal() {
  const matched = findUserInSheet();
  if (!matched || !matched.name) { showAccessDenied(); return; }
  if (isCeoLike(matched.role)) {
    showScr('ceo');
    loadCeoDashboard();
    return;
  }
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('on'));
  if (typeof dockSetActive === 'function') dockSetActive('home');
  showScr('personal');
  loadPersonal(matched);
}

async function loadPersonal(matched) {
  const el = document.getElementById('c-personal');
  if (!el) return;
  el.innerHTML = loader();
  const isDozhim = matched.role === 'dozhim';
  try {
    if (isDozhim) {
      const [dv, pd, gr, sd] = await Promise.all([
        S.data.d_vizity ? Promise.resolve(S.data.d_vizity) : api(SHEETS.d_vizity, 'A:N').catch(() => []),
        S.data.plan     ? Promise.resolve(S.data.plan)     : api(SHEETS.plan,     'A:D').catch(() => []),
        S.data.grafik   ? Promise.resolve(S.data.grafik)   : api(SHEETS.grafik,   'A1:AI25').catch(() => []),
        S.data.stavki   ? Promise.resolve(S.data.stavki)   : api(SHEETS.stavki,   'A1:B25').catch(() => []),
      ]);
      S.data.d_vizity = dv; S.data.plan = pd; S.data.grafik = gr; S.data.stavki = sd;
    } else {
      const [vd, pd, sd, cv, gr] = await Promise.all([
        S.data.vizity  ? Promise.resolve(S.data.vizity)  : api(SHEETS.vizity,  'A:N').catch(() => []),
        S.data.plan    ? Promise.resolve(S.data.plan)    : api(SHEETS.plan,    'A:D').catch(() => []),
        S.data.stavki  ? Promise.resolve(S.data.stavki)  : api(SHEETS.stavki,  'A1:B25').catch(() => []),
        S.data.cnvrs   ? Promise.resolve(S.data.cnvrs)   : api(SHEETS.cnvrs,   'A1:N40').catch(() => []),
        S.data.grafik  ? Promise.resolve(S.data.grafik)  : api(SHEETS.grafik,  'A1:AI25').catch(() => []),
      ]);
      S.data.vizity = vd; S.data.plan = pd; S.data.stavki = sd; S.data.cnvrs = cv; S.data.grafik = gr;
    }
  } catch(e) {
    if (e.message !== 'auth') el.innerHTML = `<div class="err">Ошибка загрузки данных: ${e.message}</div>`;
    return;
  }
  renderPersonal(matched);
}

function renderPersonal(matched) {
  const el = document.getElementById('c-personal');
  if (!el) return;
  const isDozhim = matched.role === 'dozhim';
  const name = matched.name;
  const nameLow = name.toLowerCase().trim();

  let mgrRow = null;
  let salObj = null;

  let dSalesPlanNum = 0;
  if (isDozhim) {
    const dStats = buildDozhimStats(S.data.d_vizity || []);
    const planM  = getPlanMap(S.data.plan || []);
    const dSalesM = getDSalesPlanMap(S.data.plan || []);
    const s      = dStats[nameLow] || {};
    const planVal = planM[nameLow] || 0;
    dSalesPlanNum = dSalesM[nameLow] || 0;
    const allVis  = (typeof s.vis === 'number') ? s.vis : ((s.vis800||0) + (s.vis1000||0));
    const synRow  = new Array(20).fill('');
    synRow[0] = name;
    synRow[1] = s.vis800||0;  synRow[2] = s.vis1000||0;
    synRow[3] = planVal;      synRow[4] = Math.max(0, planVal - allVis);
    synRow[7] = allVis;
    synRow[8] = s.kred800||0; synRow[9] = s.nal800||0;
    synRow[10]= s.obmen800||0; synRow[11]= s.kom800||0;
    synRow[12]= s.kred1000||0; synRow[13]= s.nal1000||0;
    synRow[14]= s.kom1000||0;  synRow[15]= s.zadatok||0;
    mgrRow = synRow;
    salObj = calcSalaryDozhimFromVizity(nameLow);
  } else {
    // Строим mgrRow из ВИЗИТЫ + ПЛАН
    const vizStats = buildCrmStats(S.data.vizity || []);
    const planM    = getPlanMap(S.data.plan || []);
    const s        = vizStats[nameLow] || {};
    const planVal  = planM[nameLow] || 0;
    const allVis   = (typeof s.vis === 'number') ? s.vis : ((s.vis800||0) + (s.vis1200||0));
    const synRow   = new Array(30).fill('');
    synRow[0] = name; synRow[1] = s.vis800||0; synRow[2] = s.vis1200||0;
    synRow[3] = planVal; synRow[4] = Math.max(0, planVal - allVis);
    synRow[7] = allVis;
    synRow[8] = s.kred800||0; synRow[9] = s.nal800||0;
    synRow[10]= s.obmen800||0; synRow[11]= s.kom800||0;
    synRow[12]= s.kred1200||0; synRow[13]= s.nal1200||0;
    synRow[14]= s.obmen1200||0; synRow[15]= s.kom1200||0;
    synRow[16]= s.zadatok||0;
    synRow[19]= s.vsalone||0;
    synRow[22]= s.vkso||0;
    synRow[23]= s.vfssп||0;
    synRow[24]= s.vbanke||0;
    synRow[25]= s.otkaz||0;
    synRow[26]= s.odobNeKupil||0;
    synRow[27]= s.byCity||{};
    mgrRow = synRow;
    salObj = calcSalary(nameLow);
  }

  if (!mgrRow) { goTab('otchet'); return; }

  const planNum  = num(mgrRow[3]);
  const factN    = num(mgrRow[7]);
  const plan     = mgrRow[3]||'—';
  const ost      = mgrRow[4]||'—';
  const progNum  = computeProgPct(factN, planNum || 1, currentSuffix);
  const factPct  = computeFactPct(factN, planNum || 1);
  const prog     = progNum + '%';
  const prc      = factPct + '%';
  const daily    = planNum ? computeDailyPlan(planNum, factN, progNum, currentSuffix, name) : '—';
  const visitsModalName = JSON.stringify(nameLow).replace(/"/g, '&quot;');

  let kred='—', nal='—', kom='—', kredSub='', nalSub='', komSub='';
  let convVis='—', convKred='—', pctTarget='—', koeff='—';
  let zadatok='—', vsaloneN=0;

  if (isDozhim) {
    kred    = (num(mgrRow[8])  + num(mgrRow[12]))                           || '—';
    // Наличные = наличные + обмен (обе категории)
    nal     = (num(mgrRow[9])  + num(mgrRow[10]) + num(mgrRow[13]))         || '—';
    kom     = (num(mgrRow[11]) + num(mgrRow[14]))                           || '—';
    zadatok = num(mgrRow[15]) || '—';
  } else {
    kred = (num(mgrRow[8]) + num(mgrRow[12])) || '—';
    kredSub = `${mgrRow[8]||'0'} / ${mgrRow[12]||'0'}`;
    nal  = (num(mgrRow[9]) + num(mgrRow[13])) || '—';
    nalSub = `${mgrRow[9]||'0'} / ${mgrRow[13]||'0'}`;
    kom  = (num(mgrRow[11]) + num(mgrRow[15])) || '—';
    komSub = `${mgrRow[11]||'0'} / ${mgrRow[15]||'0'}`;
    zadatok = num(mgrRow[16]) || '—';
    vsaloneN  = num(mgrRow[19]) || 0;
    const genRow = getCnvrsRowGlobal(name, 'general');
    convVis   = genRow[6]||'—';
    convKred  = genRow[7]||'—';
    pctTarget = genRow[8]||'—';
    koeff     = genRow[12]||'—';
  }

  // Продажи (для дожима): кред + нал + обмен обеих категорий
  const salesFactN = isDozhim
    ? (num(mgrRow[8]) + num(mgrRow[9]) + num(mgrRow[10]) + num(mgrRow[12]) + num(mgrRow[13]))
    : 0;
  const salesOst   = isDozhim ? Math.max(0, dSalesPlanNum - salesFactN) : 0;
  const salesProgNum = (isDozhim && dSalesPlanNum) ? computeProgPct(salesFactN, dSalesPlanNum, currentSuffix) : 0;
  const salesProgStr = isDozhim ? (salesProgNum + '%') : '—';

  const progVisN = (planNum && progNum) ? Math.round(planNum * progNum / 100) : '—';
  const salAlarm = vsaloneN > 0;
  const isLight = (document.body.classList.contains('light')||document.body.classList.contains('tiffany'));
  const accR = isLight ? 81 : 232, accG = isLight ? 55 : 255, accB = isLight ? 221 : 71;

  // Modal data для кнопки ! (открыть mop/dozhim модалку)
  const crmCnvrsR  = !isDozhim ? getCnvrsRowGlobal(name, 'crm')     : [];
  const warmCnvrsR = !isDozhim ? getCnvrsRowGlobal(name, 'warm')    : [];
  const genCnvrsR  = !isDozhim ? getCnvrsRowGlobal(name, 'general') : [];
  const rsP = rankStyles(0, 10);
  const _pmd = isDozhim
    ? JSON.stringify({
        type:'dozhim', name: name.toUpperCase(), nameLow,
        v800: mgrRow[1], v1000: mgrRow[2],
        rplan: mgrRow[3]||'0', ost: mgrRow[4]||'0',
        prc, prog, allV: factN,
        kred800: mgrRow[8], nal800: mgrRow[9], obmen800: mgrRow[10], kom800: mgrRow[11],
        kred1000: mgrRow[12], nal1000: mgrRow[13], kom1000: mgrRow[14], zadatok: mgrRow[15],
        sPlan: dSalesPlanNum, sFact: salesFactN, sOst: salesOst, sProg: salesProgNum,
        rs: rsP, idx: 1,
      })
    : JSON.stringify({
        name: name.toUpperCase(), nameLow,
        v800: mgrRow[1], v1200: mgrRow[2],
        rplan: mgrRow[3]||'0', ost: mgrRow[4]||'0',
        prc, prog, allV: factN, daily, progNum,
        kred800: mgrRow[8], nal800: mgrRow[9], td800: mgrRow[10], kom800: mgrRow[11],
        kred1200: mgrRow[12], nal1200: mgrRow[13], td1200: mgrRow[14], kom1200: mgrRow[15],
        zadatok: mgrRow[16], vykup800: mgrRow[17]||0, vykup1200: mgrRow[18]||0,
        vsalone: mgrRow[19], vkso: mgrRow[22]||0, vfSSP: mgrRow[23]||0, vbanke: mgrRow[24]||0, otkaz: mgrRow[25]||0,
        odobNeKupil: mgrRow[26]||0, byCity: mgrRow[27]||{},
        crmConVis: crmCnvrsR[6]||'—', crmConKred: crmCnvrsR[7]||'—',
        crmDolya: crmCnvrsR[8]||'—', crmKoef: crmCnvrsR[12]||'—',
        warmConVis: warmCnvrsR[6]||'—', warmConKred: warmCnvrsR[7]||'—',
        warmDolya: warmCnvrsR[8]||'—', warmKoef: warmCnvrsR[12]||'—',
        genConVis: genCnvrsR[6]||'—', genConKred: genCnvrsR[7]||'—',
        genDolya: genCnvrsR[8]||'—', genKoef: genCnvrsR[12]||'—',
        rs: rsP, idx: 1,
      });
  const _pmdQ = _pmd.replace(/'/g,"&#39;").replace(/"/g,"&quot;");
  const personalModalOpen = isDozhim
    ? `openDozhimModal('${_pmdQ}')`
    : `openMopModal('${_pmdQ}')`;

  const convRow = !isDozhim ? `
    <div class="kpi-badge-sep"></div>
    <div class="kpi-badges">
      <div class="kpi-badge"><div class="kb-lbl"><b><i>К</i></b> визиты</div><div class="kb-val">${convVis}</div></div>
      <div class="kpi-badge"><div class="kb-lbl"><b><i>К</i></b> кредит</div><div class="kb-val">${convKred}</div></div>
      <div class="kpi-badge"><div class="kb-lbl">% целевых</div><div class="kb-val">${pctTarget}</div></div>
      <div class="kpi-badge"><div class="kb-lbl">Коэфф</div><div class="kb-val">${koeff}</div></div>
    </div>` : '';

  let incomePanelContent = '';
  let incomePanelAttr = 'style="position:relative"';

  if (isDozhim) {
    const dSal = calcSalaryDozhimFromVizity(nameLow);
    if (dSal) {
      const incomeDetail = {
        nameLow,
        oklad: dSal.detail.oklad, baseOklad: dSal.detail.baseOklad,
        workedR: dSal.detail.workedR, totalR: dSal.detail.totalR,
        premium: dSal.detail.premium, kotel: dSal.detail.kotel,
        kotelTotal: dSal.detail.kotelTotal, fundCount: dSal.detail.fundCount,
        inFund: dSal.detail.inFund,
        ch800: dSal.detail.ch800, ch1000: dSal.detail.ch1000,
        earn800: dSal.detail.earn800, earn1000: dSal.detail.earn1000,
        fact: dSal.fact, prognoz: dSal.prognoz,
      };
      incomePanelAttr = `style="position:relative;cursor:pointer" onclick="openDozhimIncomeModal(this)" data-income='${JSON.stringify(incomeDetail).replace(/'/g,"&#39;")}' data-total=""`;
      incomePanelContent = `
        <div class="zl">Доход за месяц</div>
        <div class="zv">${fmtRub(Math.round(dSal.fact.total))}</div>
      `;
    } else {
      incomePanelContent = `<div class="zl">Доход за месяц</div><div class="zv">—</div>`;
    }
  } else if (salObj) {
    const incomeDetail = {
      crm:      salObj.detail.crm,
      warm:     salObj.detail.warm,
      oklad:    salObj.detail.oklad,
      baseOklad:salObj.detail.baseOklad,
      workedR:  salObj.detail.workedR,
      totalR:   salObj.detail.totalR,
      premium:  salObj.detail.premium,
      kotel:    salObj.detail.kotel,
      fundCount:salObj.detail.fundCount,
      inFund:   salObj.detail.inFund,
      fact:     salObj.fact,
      prognoz:  salObj.prognoz,
      nameLow,
    };
    incomePanelAttr = `style="position:relative;text-align:center;cursor:pointer" onclick="openIncomeDetail(this)" data-income='${JSON.stringify(incomeDetail).replace(/'/g,"&#39;")}' data-total=""`;
    incomePanelContent = `
      <div class="zl">Доход за месяц</div>
      <div class="zv">${fmtRub(Math.round(salObj.fact.total))}</div>
    `;
  } else {
    incomePanelContent = `<div class="zl">Доход за месяц</div><div class="zv">—</div>`;
  }

  const _greet = getMgrGreeting(name);

  // ─── ДОЖИМ: оставляем прежнюю раскладку ───
  if (isDozhim) {
    setLiveHTML(el, `
      <div class="kpi-manager-name">${_greet.html}</div>
      <div class="kpi-divider"></div>
      <div class="kpi-subtitle">Доход за месяц <button class="kpi-incognito-btn" onclick="event.stopPropagation();toggleIncognito()" title="Скрыть доход (или потряси телефон)">${localStorage.getItem('crm_incognito') === '1' ? '👁' : '🙈'}</button></div>
      <div class="kpi-income-panel ${localStorage.getItem('crm_incognito') === '1' ? 'kpi-incognito' : ''}" ${incomePanelAttr}>
        ${incomePanelContent}
        ${getMgrAvatarHtml(name, progNum)}
      </div>
      <div class="kpi-divider"></div>
      <div class="kpi-subtitle">Текущий KPI</div>
      <div class="kpi-stats-panel">
        <div class="kpi-stats-panel-hdr">
          <div class="dept-sec-lbl" style="margin:0">Ключевые показатели</div>
          <button class="mop-info-btn" onclick="${personalModalOpen}">!</button>
        </div>
        <div class="kpi-badges">
          <div class="kpi-badge kpi-core-badge"><div class="kb-lbl">План</div><div class="kb-val">${plan}</div></div>
          <div class="kpi-badge kpi-core-badge"><div class="kb-lbl">Дневной</div><div class="kb-val">${daily}</div></div>
          <div class="kpi-badge kpi-core-badge kpi-visits-drill" onclick="openVisitsDayModal(${visitsModalName},${isDozhim})" style="cursor:pointer" title="Хронология визитов"><div class="kb-lbl">Визиты</div><div class="kb-val">${factN}</div></div>
          <div class="kpi-badge kpi-core-badge"><div class="kb-lbl">Остаток</div><div class="kb-val">${ost}</div></div>
        </div>
        <div class="kpi-badges">
          <div class="kpi-badge kpi-core-badge"><div class="kb-lbl">Продажи</div><div class="kb-val" style="color:${pctClr(salesProgNum)}">${salesFactN}</div></div>
          <div class="kpi-badge kpi-core-badge"><div class="kb-lbl">План</div><div class="kb-val">${dSalesPlanNum||'—'}</div></div>
          <div class="kpi-badge kpi-core-badge"><div class="kb-lbl">Остаток</div><div class="kb-val">${salesOst}</div></div>
          <div class="kpi-badge"><div class="kb-lbl">Прогноз</div><div class="kb-val avatar-trigger" style="color:${pctClr(salesProgNum)}">${salesProgStr}</div></div>
        </div>
        <div class="dept-sec-lbl">Сделки</div>
        <div class="kpi-badges">
          <div class="kpi-badge"><div class="kb-lbl">Кредит</div><div class="kb-val">${kred}</div></div>
          <div class="kpi-badge"><div class="kb-lbl">Наличные</div><div class="kb-val">${nal}</div></div>
          <div class="kpi-badge"><div class="kb-lbl">Комиссия</div><div class="kb-val">${kom}</div></div>
          <div class="kpi-badge"><div class="kb-lbl">Задаток</div><div class="kb-val">${zadatok}</div></div>
        </div>
      </div>
    `);
    requestAnimationFrame(() => {
      const wrap = document.querySelector('#c-personal .kpi-avatar-wrap');
      if (wrap) ceoAvatarPlay(wrap);
    });
    return;
  }

  // ─── CRM: новая раскладка с спидометром и метриками в стиле CEO ───
  const _today = new Date();
  const _dayNum = _today.getDate();
  const _daysInMonth = new Date(_today.getFullYear(), _today.getMonth() + 1, 0).getDate();
  const _daysLeft = Math.max(0, _daysInMonth - _dayNum);
  const _dateShort = `${String(_dayNum).padStart(2,'0')}.${String(_today.getMonth()+1).padStart(2,'0')}`;
  const _ddTodayStr = String(_dayNum).padStart(2,'0');
  const _ydayDate = new Date(_today.getTime() - 24*60*60*1000);
  const _ddYdayStr = String(_ydayDate.getDate()).padStart(2,'0');

  // Визиты этого менеджера по дням текущего месяца
  function _visitsForDay(dayStr) {
    let n = 0;
    const rows = S.data.vizity || [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[0]) continue;
      if (String(r[8]||'').toLowerCase().trim() !== nameLow) continue;
      const d = String(r[0]).trim().split('.')[0].padStart(2,'0');
      if (d === dayStr) n++;
    }
    return n;
  }
  const _visitsToday = _visitsForDay(_ddTodayStr);
  const _visitsYday  = _visitsForDay(_ddYdayStr);
  const _dynamicsPct = _visitsYday > 0 ? Math.round((_visitsToday - _visitsYday) / _visitsYday * 100) : (_visitsToday > 0 ? 100 : 0);
  const _dynamicsArrow = _visitsToday > _visitsYday ? '↑' : (_visitsToday < _visitsYday ? '↓' : '→');
  const _dynamicsColor = _visitsToday > _visitsYday ? 'var(--grn)' : (_visitsToday < _visitsYday ? 'var(--red)' : 'var(--txt2)');

  const _hour = _today.getHours() + _today.getMinutes()/60;
  const _workStart = 9, _workEnd = 18;
  const _dayFrac = Math.max(0.01, Math.min(1, (_hour - _workStart) / (_workEnd - _workStart)));
  const _visitsEod = _dayFrac > 0 ? Math.round(_visitsToday / _dayFrac) : _visitsToday;
  const _factEod = factN - _visitsToday + _visitsEod;
  const _eodProg = planNum > 0 ? Math.round((_factEod / planNum) * (_daysInMonth / _dayNum) * 100) : 0;
  const _eodColor = _eodProg >= 100 ? 'var(--grn)' : _eodProg >= 85 ? '#ffd60a' : 'var(--red)';

  // Тренд по дням (визиты до сегодня)
  function _dailyVisits() {
    const arr = new Array(_dayNum).fill(0);
    const rows = S.data.vizity || [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[0]) continue;
      if (String(r[8]||'').toLowerCase().trim() !== nameLow) continue;
      const d = parseInt(String(r[0]).trim().split('.')[0]);
      if (d >= 1 && d <= _dayNum) arr[d-1]++;
    }
    return arr;
  }
  const _trend = _dailyVisits();
  function _deltaVisits() { return (_trend[_trend.length-1]||0) - (_trend[_trend.length-2]||0); }
  const _deltaToday = _deltaVisits();

  // Helpers (повторяют CEO-логику локально)
  function _deltaBadge(delta, label) {
    const tip = delta === 0 ? `${label}: столько же, как вчера` : delta > 0 ? `${label}: на ${delta} больше, чем вчера` : `${label}: на ${Math.abs(delta)} меньше, чем вчера`;
    const safe = tip.replace(/"/g,'&quot;');
    if (delta > 0) return `<span class="ceo-card-delta up" title="${safe}">↑+${delta}</span>`;
    if (delta < 0) return `<span class="ceo-card-delta down" title="${safe}">↓${delta}</span>`;
    return `<span class="ceo-card-delta zero" title="${safe}">→ 0</span>`;
  }
  function _sparkline(values, color, suffix) {
    if (!values.length) return '';
    const w = 100, h = 28;
    const max = Math.max(1, ...values);
    const stepX = values.length > 1 ? w / (values.length - 1) : w;
    const pts = values.map((v,i)=>[i*stepX, h - 2 - (v/max)*(h-4)]);
    function smooth(pts) {
      if (pts.length < 2) return '';
      if (pts.length === 2) return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)} L${pts[1][0].toFixed(1)},${pts[1][1].toFixed(1)}`;
      const t = 0.35;
      let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i-1] || pts[i], p1 = pts[i], p2 = pts[i+1], p3 = pts[i+2] || p2;
        const c1x = p1[0] + (p2[0]-p0[0])*t*0.5, c1y = p1[1] + (p2[1]-p0[1])*t*0.5;
        const c2x = p2[0] - (p3[0]-p1[0])*t*0.5, c2y = p2[1] - (p3[1]-p1[1])*t*0.5;
        d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
      }
      return d;
    }
    const path = smooth(pts);
    return `<svg class="ceo-sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/></svg>`;
  }

  // Сделки + штрафы из crmStats
  const _vs = (buildCrmStats(S.data.vizity || []))[nameLow] || {};
  const _kred = (num(_vs.kred800) + num(_vs.kred1200)) || 0;
  const _nalObm = (num(_vs.nal800) + num(_vs.obmen800) + num(_vs.nal1200) + num(_vs.obmen1200)) || 0;
  const _kom = (num(_vs.kom800) + num(_vs.kom1200)) || 0;
  const _vkso = num(_vs.vkso) || 0;
  const _otkazFssp = (num(_vs.otkaz) + num(_vs.vfssп)) || 0;
  const _accColor = pctClr(progNum);

  const _cachedWeather = S._ceoWeatherCache || '';
  // Подсчёты для расширенной подписи на «Нал + Обмен»: 800 / 1200
  const _nal800 = num(_vs.nal800) + num(_vs.obmen800);
  const _nal1200 = num(_vs.nal1200) + num(_vs.obmen1200);
  setLiveHTML(el, `
    <!-- Шапка: приветствие слева, дата/погода/остаток справа на одной линии -->
    <div class="personal-hdr-row">
      <div class="kpi-manager-name" style="flex:1;min-width:0">${_greet.html}</div>
      <div class="ceo-header-right">
        <div class="ceo-date-weather">
          <span class="ceo-date">${_dateShort}</span>
          <span id="ceo-weather" class="ceo-weather">${_cachedWeather || '…'}</span>
        </div>
        <div class="ceo-days-left">остаток <strong>${_daysLeft}</strong> д.</div>
      </div>
    </div>

    <!-- ДОХОД ЗА МЕСЯЦ -->
    <div class="sec-title">Доход за месяц <button class="kpi-incognito-btn" onclick="event.stopPropagation();toggleIncognito()" title="Скрыть доход (или потряси телефон)">${localStorage.getItem('crm_incognito') === '1' ? '👁' : '🙈'}</button></div>
    <div class="kpi-income-panel ${localStorage.getItem('crm_incognito') === '1' ? 'kpi-incognito' : ''}" ${incomePanelAttr}>
      ${incomePanelContent}
      ${getMgrAvatarHtml(name, progNum)}
    </div>

    <!-- ТЕКУЩИЙ KPI (без аватара в этой панели) -->
    <div class="sec-title">Текущий KPI</div>
    <div class="kpi-income-panel ceo-forecast-panel" style="background:rgba(${accR},${accG},${accB},0.15);position:relative">
      <div class="ceo-forecast-body">
        <div class="ceo-speedo">
          <svg viewBox="-10 -10 220 220">
            <path class="base-path" d="M 40 160 A 85 85 0 1 1 160 160"/>
            <path id="ceo-speed-progress" class="ceo-speed-progress" stroke="url(#ceoSpeedGradientGlobal)" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${Math.max(0, 1 - Math.min(progNum/100, 1))}" d="M 40 160 A 85 85 0 1 1 160 160"/>
          </svg>
          <div class="ceo-speedo-value mv" style="color:${pctClr(progNum)} !important">${progNum}%</div>
        </div>
        <div class="ceo-forecast-info">
          <div class="ceo-forecast-sub"><span class="mv">${factN}</span> из <span>${plan||'—'}</span> визитов</div>
          <div class="ceo-mini-badges">
            <div class="ceo-mini-badge">
              <div class="ceo-mini-lbl">Динамика за сегодня</div>
              <div class="ceo-mini-val">
                <span style="color:${_dynamicsColor}">${_dynamicsArrow}</span> <span class="mv">${Math.abs(_dynamicsPct)}</span>%
              </div>
              <div class="ceo-mini-sub">к вчера</div>
            </div>
            <div class="ceo-mini-badge ceo-mini-badge-eod">
              <div class="ceo-mini-lbl">Прогноз выполнения</div>
              <div class="ceo-mini-val">
                <span class="mv" style="color:${pctClr(_eodProg)} !important">${_eodProg}</span><span style="color:${pctClr(_eodProg)}">%</span>
              </div>
              <div class="ceo-mini-sub">к концу дня</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- КЛЮЧЕВЫЕ ПОКАЗАТЕЛИ -->
    <div class="ceo-leaders-hdr" style="margin-top:14px">
      <div class="sec-title" style="margin:0">Ключевые показатели</div>
      <button class="mop-info-btn" onclick="${personalModalOpen}" title="Детали">!</button>
    </div>

    <!-- Row 1: Визиты — 4 ячейки в строгом гриде (2 ряда), всё выровнено по линиям -->
    <div class="ceo-metrics-grid personal-metrics-vis">
      <div class="ceo-metric-card ceo-clickable personal-vis-row" onclick="openVisitsDayModal(${visitsModalName},false)">
        <div class="pv-lbl pv-lbl-main">Визиты</div>
        <div class="pv-lbl pv-lbl-split">CRM / ТЛ</div>
        <div class="pv-chart">${_sparkline(_trend, _accColor, 'p')}</div>
        <div class="pv-right-top">${_deltaBadge(_deltaToday, 'Визиты')}</div>
        <div class="pv-val pv-val-main"><span class="mv">${factN}</span><span class="pv-plan">/ ${plan||'—'}</span></div>
        <div class="pv-val pv-val-split">${mgrRow[1]||'0'} / ${mgrRow[2]||'0'}</div>
        <div class="pv-right-bot" style="color:${_accColor}">${progNum}%</div>
      </div>
    </div>

    <!-- Row 2: Кредиты, Нал+Обмен, Комиссия — клик открывает свою модалку по этому менеджеру -->
    <div class="ceo-metrics-grid" style="margin-top:8px">
      <div class="ceo-metric-card ceo-clickable" onclick="openMgrDealsModal(${visitsModalName},'kredit')">
        <div class="ceo-metric-lbl">Кредиты</div>
        <div class="ceo-metric-val mv" style="color:var(--txt)">${_kred}</div>
        <div class="ceo-metric-sub">${mgrRow[8]||'0'} / ${mgrRow[12]||'0'} (crm/тл)</div>
      </div>
      <div class="ceo-metric-card ceo-clickable" onclick="openMgrDealsModal(${visitsModalName},'nalobm')">
        <div class="ceo-metric-lbl">Нал + Обмен</div>
        <div class="ceo-metric-val mv" style="color:var(--txt)">${_nalObm}</div>
        <div class="ceo-metric-sub">${_nal800}/${_nal1200} (crm/тл)</div>
      </div>
      <div class="ceo-metric-card ceo-clickable" onclick="openMgrDealsModal(${visitsModalName},'komis')">
        <div class="ceo-metric-lbl">Комиссия</div>
        <div class="ceo-metric-val mv" style="color:var(--txt)">${_kom}</div>
        <div class="ceo-metric-sub">${num(_vs.kom800)||'0'} / ${num(_vs.kom1200)||'0'} (crm/тл)</div>
      </div>
    </div>

    <!-- Row 3: В салоне, В КСО, Отказ + ФССП — клик по первым двум открывает свою модалку по менеджеру -->
    <div class="ceo-metrics-grid" style="margin-top:8px">
      <div class="ceo-metric-card ceo-clickable${vsaloneN > 0 ? ' ceo-salon-alarm' : ''}" onclick="openMgrSalonModal(${visitsModalName})">
        <div class="ceo-metric-lbl">В салоне</div>
        <div class="ceo-metric-val mv" style="color:var(--txt)">${vsaloneN}</div>
        <div class="ceo-metric-sub">${vsaloneN > 0 ? 'клиентов сейчас' : 'никого нет'}</div>
      </div>
      <div class="ceo-metric-card ceo-clickable ceo-kso-fill" onclick="openMgrKsoModal(${visitsModalName})">
        <div class="ceo-metric-lbl">В КСО</div>
        <div class="ceo-metric-val mv" style="color:var(--txt)">${_vkso}</div>
        <div class="ceo-metric-sub">заявок в банках</div>
      </div>
      <div class="ceo-metric-card ceo-clickable personal-metric-otkaz" onclick="openMgrDealsModal(${visitsModalName},'otkazfssp')">
        <div class="ceo-metric-lbl">Отказ + ФССП</div>
        <div class="ceo-metric-val mv">${_otkazFssp}</div>
        <div class="ceo-metric-sub">не подаём / отказы</div>
      </div>
    </div>

    <!-- КОНВЕРСИИ -->
    <div class="sec-title" style="margin-top:14px">Конверсии</div>
    <div class="kpi-badges">
      <div class="kpi-badge"><div class="kb-lbl"><b><i>К</i></b> визиты</div><div class="kb-val">${convVis}</div></div>
      <div class="kpi-badge"><div class="kb-lbl"><b><i>К</i></b> кредит</div><div class="kb-val">${convKred}</div></div>
      <div class="kpi-badge"><div class="kb-lbl">% целевых</div><div class="kb-val">${pctTarget}</div></div>
    </div>
  `);

  // Анимация спидометра + аватар
  requestAnimationFrame(() => {
    const wrap = document.querySelector('#c-personal .kpi-avatar-wrap');
    if (wrap) ceoAvatarPlay(wrap);
    const path = document.getElementById('ceo-speed-progress');
    if (!path) return;
    const target = Math.max(0, 1 - Math.min(progNum/100, 1));
    // На повторных рендерах (silent refresh) — не анимируем заново, просто ставим итог
    if (path.dataset.animated === '1') {
      path.setAttribute('stroke-dashoffset', String(target));
      return;
    }
    // Стартуем с 1 (пусто), форсим layout, в следующем rAF ставим target —
    // CSS transition 1.5s сработает плавно с самого начала.
    path.setAttribute('stroke-dashoffset', '1');
    void path.getBoundingClientRect();
    requestAnimationFrame(() => {
      path.setAttribute('stroke-dashoffset', String(target));
      path.dataset.animated = '1';
    });
  });

  // Подгрузим погоду в фоне (используется shared cache S._ceoWeatherCache)
  if (typeof loadCeoWeather === 'function') {
    try { loadCeoWeather(); } catch(_) {}
  }
}

// ==================== SALARY CALC ====================
// type: 'crm' | 'dozhim'. Обратная совместимость: 'да' трактуется как 'crm'
function isInFund(nameLow, type = 'crm') {
  if (!S.usersData || S.usersData.length < 2) return true;
  for (let i = 1; i < S.usersData.length; i++) {
    const row = S.usersData[i];
    if ((row[1]||'').toLowerCase().trim() === nameLow) {
      const val = (row[3]||'').toLowerCase().trim();
      if (type === 'crm') return val === 'crm' || val === 'да';
      return val === type;
    }
  }
  return false;
}
function getFundCount(type = 'crm') {
  if (!S.usersData || S.usersData.length < 2) return 8;
  let count = 0;
  for (let i = 1; i < S.usersData.length; i++) {
    const row = S.usersData[i];
    if (!row[1]) continue;
    const val = (row[3]||'').toLowerCase().trim();
    if (type === 'crm' && (val === 'crm' || val === 'да')) count++;
    else if (type !== 'crm' && val === type) count++;
  }
  return count > 0 ? count : 1;
}
function parseRate(v) {
  return parseFloat(String(v||'0').replace(/[^\d.,-]/g,'').replace(',','.')) || 0;
}
function getKoef(pct) {
  if (pct < 80)   return 0.8;
  if (pct < 100)  return 0.9;
  if (pct <= 130) return 1.0;
  if (pct <= 150) return 1.1;
  return 1.2;
}
function koefClass(k) {
  if (k <= 0.8) return 'k08';
  if (k <= 0.9) return 'k09';
  if (k <= 1.0) return 'k10';
  if (k <= 1.1) return 'k11';
  return 'k12';
}
function getWorkedAndTotalR(nameLow) {
  const raw = S.data.grafik;
  if (!raw || raw.length < 3) return null;
  const mo = parseInt(currentSuffix.slice(0, 2));
  const yr = 2000 + parseInt(currentSuffix.slice(2, 4));
  const now = new Date();
  if (now.getFullYear() !== yr || now.getMonth() + 1 !== mo) return null;
  const today = now.getDate();
  const idx   = buildSchedIndex(raw);
  const entry = idx[nameLow];
  if (!entry) return null;
  const { row: mgrRow, daysRow } = entry;
  let totalR = 0, workedR = 0;
  for (let c = 1; c < daysRow.length; c++) {
    const dayNum = parseInt(daysRow[c]);
    if (!dayNum || dayNum < 1 || dayNum > 31) continue;
    if (normalizeSchedVal(mgrRow[c]) === 'Р') {
      totalR++;
      if (dayNum <= today) workedR++;
    }
  }
  return { totalR, workedR };
}

function calcSalary(nameLow) {
  const vizData = S.data.vizity || [];
  const stavki  = S.data.stavki || [];

  const baseOklad   = parseRate(stavki[0]?.[1]);
  const schedInfo   = getWorkedAndTotalR(nameLow);
  const oklad       = (schedInfo && schedInfo.totalR > 0)
    ? Math.round(baseOklad / schedInfo.totalR * schedInfo.workedR)
    : baseOklad;
  const rCrmVis      = parseRate(stavki[8]?.[1]);
  const rCrmKred     = parseRate(stavki[9]?.[1]);
  const rCrmNal      = parseRate(stavki[10]?.[1]);
  const rCrmObmen    = parseRate(stavki[11]?.[1]);
  const rCrmKom      = parseRate(stavki[12]?.[1]);
  // row 14 (index 13) — «Выкуп CRM». Если ставка > 0 в этом месяце — платится,
  // иначе формула вернёт 0×N = 0 (нет мотивации). Это работает на «адаптивную»
  // схему: меняешь ставку в листе — пересчёт автоматический.
  const rCrmVykup    = parseRate(stavki[13]?.[1]);
  const rWarmVis     = parseRate(stavki[14]?.[1]);
  const rWarmKred    = parseRate(stavki[15]?.[1]);
  const rWarmNal     = parseRate(stavki[16]?.[1]);
  const rWarmObmen   = parseRate(stavki[17]?.[1]);
  const rWarmKom     = parseRate(stavki[18]?.[1]);
  const rWarmVykup   = parseRate(stavki[19]?.[1]);
  const rZadatok     = parseRate(stavki[20]?.[1]);

  // Агрегируем данные менеджера из ВИЗИТЫ
  const allStats = buildCrmStats(vizData, { sverkaOnly: true });
  const mgrStat  = allStats[nameLow];
  if (!mgrStat) return null;

  const inFund = isInFund(nameLow, 'crm');

  const crm = {
    vis:    mgrStat.vis800,
    kred:   mgrStat.kred800,
    nal:    mgrStat.nal800,
    obmen:  mgrStat.obmen800,
    vykup:  mgrStat.vykup800 || 0,
    kom:    mgrStat.kom800,
    zadatok:mgrStat.zadatok,
  };
  const warm = {
    vis:   mgrStat.vis1200,
    kred:  mgrStat.kred1200,
    nal:   mgrStat.nal1200,
    obmen: mgrStat.obmen1200,
    vykup: mgrStat.vykup1200 || 0,
    kom:   mgrStat.kom1200,
  };

  const crmPureVis  = Math.max(0, crm.vis  - crm.kred - crm.nal - crm.obmen - crm.vykup - crm.kom);
  const warmPureVis = Math.max(0, warm.vis - warm.kred - warm.nal - warm.obmen - warm.vykup - warm.kom);

  const crmEarn  = crmPureVis*rCrmVis + crm.kred*rCrmKred + crm.nal*rCrmNal + crm.obmen*rCrmObmen + crm.vykup*rCrmVykup + crm.kom*rCrmKom + crm.zadatok*rZadatok;
  const warmEarn = warmPureVis*rWarmVis + warm.kred*rWarmKred + warm.nal*rWarmNal + warm.obmen*rWarmObmen + warm.vykup*rWarmVykup + warm.kom*rWarmKom;

  // Котёл — суммируем визиты тех кто не в листе ПЛАН
  const planMap  = getPlanMap(S.data.plan || []);
  const planNamesLow2 = new Set(Object.keys(planMap));
  // Агрегируем все stats для котла
  const allStats2 = allStats; // уже computed выше
  let kotelCrmAgg  = { vis:0, kred:0, nal:0, obmen:0, vykup:0, kom:0, zadatok:0 };
  let kotelWarmAgg = { vis:0, kred:0, nal:0, obmen:0, vykup:0, kom:0 };
  Object.values(allStats2).forEach(s => {
    if (!planNamesLow2.has(s.name.toLowerCase())) {
      kotelCrmAgg.vis    += s.vis800;  kotelCrmAgg.kred  += s.kred800;
      kotelCrmAgg.nal    += s.nal800;  kotelCrmAgg.obmen += s.obmen800;
      kotelCrmAgg.vykup  += s.vykup800 || 0;
      kotelCrmAgg.kom    += s.kom800;  kotelCrmAgg.zadatok += s.zadatok;
      kotelWarmAgg.vis   += s.vis1200; kotelWarmAgg.kred += s.kred1200;
      kotelWarmAgg.nal   += s.nal1200; kotelWarmAgg.obmen+= s.obmen1200;
      kotelWarmAgg.vykup += s.vykup1200 || 0;
      kotelWarmAgg.kom   += s.kom1200;
    }
  });
  const kotelCrm  = kotelCrmAgg;
  const kotelWarm = kotelWarmAgg;
  const kotelCrmPureVis  = Math.max(0, kotelCrm.vis  - kotelCrm.kred  - kotelCrm.nal  - kotelCrm.obmen  - kotelCrm.vykup  - kotelCrm.kom);
  const kotelWarmPureVis = Math.max(0, kotelWarm.vis - kotelWarm.kred - kotelWarm.nal - kotelWarm.obmen - kotelWarm.vykup - kotelWarm.kom);

  const kotelTotal = kotelCrmPureVis*rCrmVis + kotelCrm.kred*rCrmKred + kotelCrm.nal*rCrmNal + kotelCrm.obmen*rCrmObmen + kotelCrm.vykup*rCrmVykup + kotelCrm.kom*rCrmKom + kotelCrm.zadatok*rZadatok
                   + kotelWarmPureVis*rWarmVis + kotelWarm.kred*rWarmKred + kotelWarm.nal*rWarmNal + kotelWarm.obmen*rWarmObmen + kotelWarm.vykup*rWarmVykup + kotelWarm.kom*rWarmKom;
  const fundCount = getFundCount('crm');
  const kotelShare = (inFund !== false && fundCount > 0) ? kotelTotal / fundCount : 0;

  const premium = crmEarn + warmEarn + kotelShare;
  const mgrAllVis = crm.vis + warm.vis;
  const mgrPlan   = planMap[nameLow] || 0;
  const pctFact  = computeFactPct(mgrAllVis, mgrPlan || 1);
  const pctProg  = computeProgPct(mgrAllVis, mgrPlan || 1, currentSuffix);

  // Rang: rookie — без коэффициентов (всегда ×1.0)
  const mgrRang = getRangByName(nameLow);
  const isRookie = mgrRang === 'rookie';
  const koefFact = isRookie ? 1.0 : getKoef(pctFact);
  const koefProg = isRookie ? 1.0 : getKoef(pctProg);

  const totalFact = oklad + premium * koefFact;
  const totalProg = baseOklad + premium * koefProg;

  const detailCrm = {
    vis:    crmPureVis  * rCrmVis,
    kred:   crm.kred   * rCrmKred,
    nal:    crm.nal    * rCrmNal,
    obmen:  crm.obmen  * rCrmObmen,
    vykup:  crm.vykup  * rCrmVykup,
    kom:    crm.kom    * rCrmKom,
    zadatok:crm.zadatok* rZadatok,
    cnt: { vis: crmPureVis, kred: crm.kred, nal: crm.nal, obmen: crm.obmen, vykup: crm.vykup, kom: crm.kom, zadatok: crm.zadatok },
  };
  const detailWarm = {
    vis:  warmPureVis * rWarmVis,
    kred: warm.kred * rWarmKred,
    nal:  warm.nal  * rWarmNal,
    obmen:warm.obmen* rWarmObmen,
    vykup:warm.vykup* rWarmVykup,
    kom:  warm.kom  * rWarmKom,
    cnt: { vis: warmPureVis, kred: warm.kred, nal: warm.nal, obmen: warm.obmen, vykup: warm.vykup, kom: warm.kom },
  };

  return {
    fact:   { total: totalFact, koef: koefFact, pct: pctFact, premium },
    prognoz:{ total: totalProg, koef: koefProg, pct: pctProg, premium },
    detail: {
      oklad,
      baseOklad,
      workedR:  schedInfo ? schedInfo.workedR : null,
      totalR:   schedInfo ? schedInfo.totalR  : null,
      inFund,
      premium,
      crm:      detailCrm,
      warm:     detailWarm,
      kotel:    kotelShare,
      fundCount,
    }
  };
}

// ==================== SALARY CALC: ДОЖИМ ====================
function calcSalaryDozhim(nameLow) {
  const otchet = S.data.d_otchet || [];
  const stavki = S.data.d_stavki || [];
  if (!otchet.length || !stavki.length) return null;

  const baseOklad  = parseRate(stavki[12]?.[1]);
  const schedInfo  = getWorkedAndTotalR(nameLow);
  const oklad      = (schedInfo && schedInfo.totalR > 0)
    ? Math.round(baseOklad / schedInfo.totalR * schedInfo.workedR)
    : baseOklad;

  // Ставки канала 800
  const r800Vis   = parseRate(stavki[1]?.[1]);
  const r800Kred  = parseRate(stavki[2]?.[1]);
  const r800Nal   = parseRate(stavki[3]?.[1]);
  const r800Obmen = parseRate(stavki[4]?.[1]);
  const r800Kom   = parseRate(stavki[5]?.[1]);
  const rZadatok  = parseRate(stavki[6]?.[1]);
  // Ставки канала 1000
  const r1000Vis   = parseRate(stavki[8]?.[1]);
  const r1000Kred  = parseRate(stavki[9]?.[1]);
  const r1000Nal   = parseRate(stavki[10]?.[1]);
  const r1000Obmen = 0; // нет обмена в канале 1000
  const r1000Kom   = parseRate(stavki[11]?.[1]);

  const KOTEL_NAMES = ['котел','котёл','kotel'];
  const allRows = otchet.slice(3, 20).filter(r => r[0] && r[0].trim());
  const mgrRow  = allRows.find(r => (r[0]||'').toLowerCase().trim() === nameLow);
  if (!mgrRow) return null;

  const inFund = isInFund(nameLow, 'dozhim');

  // Канал 800
  const ch800 = {
    vis:    num(mgrRow[1]),
    kred:   num(mgrRow[8]),
    nal:    num(mgrRow[9]),
    obmen:  num(mgrRow[10]),
    kom:    num(mgrRow[11]),
    zadatok:num(mgrRow[15]),
  };
  // Канал 1000
  const ch1000 = {
    vis:  num(mgrRow[2]),
    kred: num(mgrRow[12]),
    nal:  num(mgrRow[13]),
    obmen:num(0), // trade-in = r[14] — обмен
    kom:  num(mgrRow[14]),
  };

  const pure800Vis  = Math.max(0, ch800.vis  - ch800.kred  - ch800.nal  - ch800.obmen - ch800.kom);
  const pure1000Vis = Math.max(0, ch1000.vis - ch1000.kred - ch1000.nal - ch1000.obmen - ch1000.kom);

  const earn800  = pure800Vis*r800Vis  + ch800.kred*r800Kred   + ch800.nal*r800Nal   + ch800.obmen*r800Obmen   + ch800.kom*r800Kom   + ch800.zadatok*rZadatok;
  const earn1000 = pure1000Vis*r1000Vis + ch1000.kred*r1000Kred + ch1000.nal*r1000Nal + ch1000.obmen*r1000Obmen + ch1000.kom*r1000Kom;

  // Котёл из Д_ОТЧЁТ (строка с именем котел)
  const kotelRow  = allRows.find(r => KOTEL_NAMES.includes((r[0]||'').toLowerCase().trim())) || [];
  const kCh800 = {
    vis:    num(kotelRow[1]),
    kred:   num(kotelRow[8]),
    nal:    num(kotelRow[9]),
    obmen:  num(kotelRow[10]),
    kom:    num(kotelRow[11]),
    zadatok:num(kotelRow[15]),
  };
  const kCh1000 = {
    vis:  num(kotelRow[2]),
    kred: num(kotelRow[12]),
    nal:  num(kotelRow[13]),
    obmen:num(0),
    kom:  num(kotelRow[14]),
  };
  const kPure800  = Math.max(0, kCh800.vis  - kCh800.kred  - kCh800.nal  - kCh800.obmen  - kCh800.kom);
  const kPure1000 = Math.max(0, kCh1000.vis - kCh1000.kred - kCh1000.nal - kCh1000.obmen - kCh1000.kom);
  const kotelTotal = kPure800*r800Vis  + kCh800.kred*r800Kred   + kCh800.nal*r800Nal   + kCh800.obmen*r800Obmen   + kCh800.kom*r800Kom   + kCh800.zadatok*rZadatok
                   + kPure1000*r1000Vis + kCh1000.kred*r1000Kred + kCh1000.nal*r1000Nal + kCh1000.obmen*r1000Obmen + kCh1000.kom*r1000Kom;

  const fundCount  = getFundCount('dozhim');
  const kotelShare = (inFund && fundCount > 0) ? kotelTotal / fundCount : 0;

  const premium  = earn800 + earn1000 + kotelShare;
  const pctFact  = computeFactPct(num(mgrRow[7]), num(mgrRow[3]) || 1);
  const pctProg  = computeProgPct(num(mgrRow[7]), num(mgrRow[3]) || 1, currentSuffix);

  const totalFact = oklad + premium;
  const totalProg = baseOklad + premium;

  return {
    fact:    { total: totalFact, koef: null, pct: pctFact, premium },
    prognoz: { total: totalProg, koef: null, pct: pctProg, premium },
    detail: {
      oklad, baseOklad,
      workedR:  schedInfo ? schedInfo.workedR : null,
      totalR:   schedInfo ? schedInfo.totalR  : null,
      inFund, premium,
      kotel:     kotelShare,
      kotelTotal,
      fundCount,
      metrics: {
        vis:     { count: pure800Vis + pure1000Vis,   earn: Math.round(pure800Vis*r800Vis + pure1000Vis*r1000Vis) },
        kred:    { count: ch800.kred + ch1000.kred,   earn: Math.round(ch800.kred*r800Kred + ch1000.kred*r1000Kred) },
        nal:     { count: ch800.nal + ch1000.nal,     earn: Math.round(ch800.nal*r800Nal + ch1000.nal*r1000Nal) },
        obmen:   { count: ch800.obmen,                earn: Math.round(ch800.obmen*r800Obmen) },
        kom:     { count: ch800.kom + ch1000.kom,     earn: Math.round(ch800.kom*r800Kom + ch1000.kom*r1000Kom) },
        zadatok: { count: ch800.zadatok,              earn: Math.round(ch800.zadatok*rZadatok) },
      },
    },
  };
}

// ==================== DOZHIM INCOME MODAL ====================
function openDozhimIncomeModal(btn) {
  const d = JSON.parse(btn.dataset.income.replace(/&#39;/g,"'"));
  function n(v) { return parseFloat(String(v||'0').replace(/[^\d.,-]/g,'').replace(',','.')) || 0; }
  function subtotal(lbl, sum) {
    return `<div class="income-subtotal"><span class="ist-lbl">${lbl}</span><span class="ist-val">${fmtRub(sum)}</span></div>`;
  }
  function dzBadge(lbl, count, earn) {
    if (!count && !earn) return '';
    return `<div class="dz-badge"><div class="dzb-lbl">${lbl}</div><div class="dzb-count">${count}</div><div class="dzb-earn">${fmtRub(earn)}</div></div>`;
  }

  const R = DOZHIM_RATES;
  const oklad      = n(d.oklad);
  const kotel      = n(d.kotel);
  const kotelTotal = n(d.kotelTotal);
  const fundCount  = d.fundCount || '—';

  // Пересчитываем премию из ch800/ch1000
  const ch8  = d.ch800  || {};
  const ch10 = d.ch1000 || {};
  const p8   = Math.max(0, n(ch8.vis)  - n(ch8.kred)  - n(ch8.nal)  - n(ch8.obmen) - n(ch8.kom));
  const p10  = Math.max(0, n(ch10.vis) - n(ch10.kred) - n(ch10.nal) - n(ch10.kom));

  const earn8  = n(d.earn800)  || (p8*R.r800Vis   + n(ch8.kred)*R.r800Kred  + n(ch8.nal)*R.r800Nal  + n(ch8.obmen)*R.r800Obmen  + n(ch8.kom)*R.r800Kom  + n(ch8.zadatok)*R.rZadatok);
  const earn10 = n(d.earn1000) || (p10*R.r1000Vis + n(ch10.kred)*R.r1000Kred + n(ch10.nal)*R.r1000Nal + n(ch10.kom)*R.r1000Kom);

  const okladLbl = d.workedR != null ? `Оклад (${d.workedR}/${d.totalR} дн.)` : 'Оклад';

  const kotelRow = (d.inFund && kotel > 0) ? `
    <div class="income-sec-title">Котёл</div>
    <div style="font-size:10px;color:var(--txt2);margin-bottom:6px">
      ${fmtRub(Math.round(kotelTotal))} ÷ ${fundCount} участников = ${fmtRub(Math.round(kotel))}
    </div>
    ${subtotal('Доля котла', Math.round(kotel))}` : '';

  const mc = document.getElementById('income-modal-content');
  document.getElementById('income-overlay')?.classList.remove('visits-mode');
  const title = document.querySelector('#income-overlay .income-modal-title');
  if (title) title.innerHTML = 'Детализация дохода';
  mc.setAttribute('data-modal', 'dozhim');
  mc.innerHTML = `
    <div class="income-sec-title">Оклад</div>
    ${subtotal(okladLbl, oklad)}
    <div class="income-sec-title">КАТ 800</div>
    <div class="dz-badges">
      ${dzBadge('Визиты',   p8,              Math.round(p8*R.r800Vis))}
      ${dzBadge('Кредит',   n(ch8.kred),     Math.round(n(ch8.kred)*R.r800Kred))}
      ${dzBadge('Наличка',  n(ch8.nal),      Math.round(n(ch8.nal)*R.r800Nal))}
      ${dzBadge('Обмен',    n(ch8.obmen),    Math.round(n(ch8.obmen)*R.r800Obmen))}
      ${dzBadge('Комиссия', n(ch8.kom),      Math.round(n(ch8.kom)*R.r800Kom))}
      ${dzBadge('Задаток',  n(ch8.zadatok),  Math.round(n(ch8.zadatok)*R.rZadatok))}
    </div>
    ${subtotal('Итого КАТ 800', Math.round(earn8))}
    <div class="income-sec-title">КАТ 1000</div>
    <div class="dz-badges">
      ${dzBadge('Визиты',   p10,             Math.round(p10*R.r1000Vis))}
      ${dzBadge('Кредит',   n(ch10.kred),    Math.round(n(ch10.kred)*R.r1000Kred))}
      ${dzBadge('Наличка',  n(ch10.nal),     Math.round(n(ch10.nal)*R.r1000Nal))}
      ${dzBadge('Комиссия', n(ch10.kom),     Math.round(n(ch10.kom)*R.r1000Kom))}
    </div>
    ${subtotal('Итого КАТ 1000', Math.round(earn10))}
    ${kotelRow}
    <div class="income-sec-title">Итого</div>
    ${subtotal('Фактический доход', Math.round(n(d.fact?.total)))}
    ${buildDayCalendar(d.nameLow||'', S.data.d_vizity||[], DOZHIM_RATES, true)}
  `;
  document.getElementById('income-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => scheduleAnimatedValues(mc));
}

// ==================== INCOME DETAIL MODAL ====================
function openIncomeDetail(btn) {
  const raw = btn.dataset.income.replace(/&#39;/g,"'");
  const d = JSON.parse(raw);
  function n(v) { return parseFloat(String(v||'0').replace(/[^\d.,-]/g,'').replace(',','.')) || 0; }
  function badge(lbl, val, cnt) {
    const cntHtml = (cnt != null && cnt > 0) ? `<div class="ib-cnt">${cnt} шт</div>` : '';
    return `<div class="income-badge"><div class="ib-lbl">${lbl}</div>${cntHtml}<div class="ib-val">${fmtRub(val)}</div></div>`;
  }
  function subtotal(lbl, sum) {
    return `<div class="income-subtotal"><span class="ist-lbl">${lbl}</span><span class="ist-val">${fmtRub(sum)}</span></div>`;
  }
  const crmSum  = n(d.crm.vis)+n(d.crm.kred)+n(d.crm.nal)+n(d.crm.obmen)+n(d.crm.vykup||0)+n(d.crm.kom)+n(d.crm.zadatok);
  const warmSum = n(d.warm.vis)+n(d.warm.kred)+n(d.warm.nal)+n(d.warm.obmen)+n(d.warm.vykup||0)+n(d.warm.kom);
  const oklad      = n(d.oklad);
  const baseOklad  = n(d.baseOklad) || oklad;
  const kotel      = n(d.kotel);
  const premium    = n(d.premium) || (crmSum + warmSum + kotel);
  const fundCount  = d.fundCount || '—';

  const okladRow = oklad > 0 ? `<div class="income-sec-title">Оклад</div>${subtotal(d.workedR != null ? `Оклад (${d.workedR}/${d.totalR} дн.)` : 'Оклад', oklad)}` : '';
  const kotelRow = (d.inFund && kotel > 0) ? `<div class="income-sec-title">Котёл</div><div style="font-size:10px;color:var(--txt2);margin-bottom:6px">Участников котла: ${fundCount}</div>${subtotal('Доля котла', kotel)}` : '';
  const noKoefTotal = Math.round(baseOklad + crmSum + warmSum + kotel);
  const factKoef = d.fact ? d.fact.koef : null;
  const progKoef = d.prognoz ? d.prognoz.koef : null;
  // Дельта от коэффициента: premium × (koef − 1). Показываем сумму потерь
  // при понижающем (<1.0) или прироста при повышающем (>1.0).
  function koefDeltaRow(lbl, koef) {
    if (koef == null || !isFinite(koef)) return '';
    const delta = Math.round(premium * (koef - 1));
    if (!delta) return '';
    const sign = delta > 0 ? '+' : '−';
    const colorCls = delta > 0 ? 'income-delta-pos' : 'income-delta-neg';
    const verb = delta > 0 ? 'прирост' : 'потеря';
    return `<div class="income-subtotal ${colorCls}">
      <span class="ist-lbl">${lbl} ×${koef.toFixed(1)} · ${verb}</span>
      <span class="ist-val">${sign}${fmtRub(Math.abs(delta))}</span>
    </div>`;
  }
  const deltaRowsHtml = (factKoef != null || progKoef != null) ? `
    ${koefDeltaRow('Коэфф. ФАКТ', factKoef)}
    ${koefDeltaRow('Коэфф. ПРОГНОЗ', progKoef)}` : '';
  const noKoefRow = `<div class="income-sec-title">Без коэффициентов</div>${subtotal('Оклад 100% + Премия + Котёл', noKoefTotal)}${deltaRowsHtml}`;
  const okladFormula = d.workedR != null
    ? `(${fmtRub(d.baseOklad)}÷${d.totalR}×${d.workedR}) + (${fmtRub(Math.round(premium))} × ${factKoef ? factKoef.toFixed(1) : '—'}) = ${fmtRub(Math.round(d.fact ? d.fact.total : 0))}`
    : `${fmtRub(oklad)} + (${fmtRub(Math.round(premium))} × ${factKoef ? factKoef.toFixed(1) : '—'}) = ${fmtRub(Math.round(d.fact ? d.fact.total : 0))}`;
  const koefRow = (factKoef !== null) ? `
    <div class="income-sec-title">Коэффициент</div>
    <div class="income-cols" style="margin-bottom:8px">
      <div class="income-col fact" style="${pctToneStyle(d.fact.pct)}">
        <span class="ic-koef ${koefClass(factKoef)}">×${factKoef.toFixed(1)}</span>
        <div class="ic-lbl">ФАКТ</div>
        <div class="ic-val" style="color:${pctClr(d.fact.pct)}">${fmtRub(Math.round(d.fact.total))}</div>
      </div>
      <div class="income-col prog" style="${pctToneStyle(d.prognoz.pct)}">
        <span class="ic-koef ${koefClass(progKoef)}">×${progKoef.toFixed(1)}</span>
        <div class="ic-lbl">ПРОГНОЗ</div>
        <div class="ic-val" style="color:${pctClr(d.prognoz.pct)}">${fmtRub(Math.round(d.prognoz.total))}</div>
      </div>
    </div>
    <div style="font-size:10px;color:var(--txt2);margin-bottom:4px;line-height:1.5">
      Оклад + (Премия × К) = Итог<br>
      ${okladFormula}
    </div>` : '';

  const mc = document.getElementById('income-modal-content');
  document.getElementById('income-overlay')?.classList.remove('visits-mode');
  const title = document.querySelector('#income-overlay .income-modal-title');
  if (title) title.innerHTML = 'Детализация дохода';
  mc.removeAttribute('data-modal');
  mc.innerHTML = `
    ${koefRow}
    ${okladRow}
    <div class="income-sec-title">CRM</div>
    <div class="income-badges">
      ${badge('Визиты',   d.crm.vis,     d.crm.cnt?.vis)}
      ${badge('Кредит',   d.crm.kred,    d.crm.cnt?.kred)}
      ${badge('Наличка',  d.crm.nal,     d.crm.cnt?.nal)}
    </div>
    <div class="income-badges">
      ${badge('Обмен',    d.crm.obmen,   d.crm.cnt?.obmen)}
      ${badge('Комиссия', d.crm.kom,     d.crm.cnt?.kom)}
      ${badge('Задаток',  d.crm.zadatok, d.crm.cnt?.zadatok)}
    </div>
    ${n(d.crm.vykup) > 0 ? `<div class="income-badges" style="grid-template-columns:repeat(1,1fr)">${badge('Выкуп', d.crm.vykup, d.crm.cnt?.vykup)}</div>` : ''}
    ${subtotal('Итого CRM', crmSum)}
    <div class="income-sec-title">Тёплые лиды</div>
    <div class="income-badges">
      ${badge('Визиты',   d.warm.vis,   d.warm.cnt?.vis)}
      ${badge('Кредит',   d.warm.kred,  d.warm.cnt?.kred)}
      ${badge('Наличка',  d.warm.nal,   d.warm.cnt?.nal)}
    </div>
    <div class="income-badges" style="grid-template-columns:repeat(2,1fr)">
      ${badge('Обмен',    d.warm.obmen, d.warm.cnt?.obmen)}
      ${badge('Комиссия', d.warm.kom,   d.warm.cnt?.kom)}
    </div>
    ${n(d.warm.vykup) > 0 ? `<div class="income-badges" style="grid-template-columns:repeat(1,1fr)">${badge('Выкуп', d.warm.vykup, d.warm.cnt?.vykup)}</div>` : ''}
    ${subtotal('Итого Тёплые лиды', warmSum)}
    ${kotelRow}
    ${noKoefRow}
    ${buildDayCalendar(d.nameLow||'', S.data.vizity||[], {
      rCrmVis:   parseRate((S.data.stavki||[])[8]?.[1]),
      rCrmKred:  parseRate((S.data.stavki||[])[9]?.[1]),
      rCrmNal:   parseRate((S.data.stavki||[])[10]?.[1]),
      rCrmObmen: parseRate((S.data.stavki||[])[11]?.[1]),
      rCrmKom:   parseRate((S.data.stavki||[])[12]?.[1]),
      rCrmVykup: parseRate((S.data.stavki||[])[13]?.[1]),
      rWarmVis:  parseRate((S.data.stavki||[])[14]?.[1]),
      rWarmKred: parseRate((S.data.stavki||[])[15]?.[1]),
      rWarmNal:  parseRate((S.data.stavki||[])[16]?.[1]),
      rWarmObmen:parseRate((S.data.stavki||[])[17]?.[1]),
      rWarmKom:  parseRate((S.data.stavki||[])[18]?.[1]),
      rWarmVykup:parseRate((S.data.stavki||[])[19]?.[1]),
      rZadatok:  parseRate((S.data.stavki||[])[20]?.[1]),
    }, false)}
  `;
  document.getElementById('income-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => scheduleAnimatedValues(mc));
}

function getVisitsByDay(nameLow, isDozhim) {
  const suffix = currentSuffix;
  const mm = parseInt(suffix.slice(0,2)), yy = 2000 + parseInt(suffix.slice(2));
  const daysInMonth = new Date(yy, mm, 0).getDate();
  const counts = Array.from({ length: daysInMonth + 1 }, () => 0);
  const rows = isDozhim ? (S.data.d_vizity || []) : (S.data.vizity || []);
  const target = String(nameLow || '').toLowerCase().trim();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const mgr = String(row[8] || '').trim().toLowerCase();
    if (mgr !== target) continue;
    if (!isSverkaRow(row)) continue;
    const parts = String(row[0] || '').trim().split('.');
    const day = parseInt(parts[0]);
    if (!day || day < 1 || day > daysInMonth) continue;
    counts[day]++;
  }

  return counts;
}

function getVisitsByDayAll(isDozhim) {
  const suffix = currentSuffix;
  const mm = parseInt(suffix.slice(0,2)), yy = 2000 + parseInt(suffix.slice(2));
  const daysInMonth = new Date(yy, mm, 0).getDate();
  const counts = Array.from({ length: daysInMonth + 1 }, () => 0);
  const sources = [];
  if (isDozhim === null || isDozhim === undefined) {
    sources.push(S.data.vizity || []);
    sources.push(S.data.d_vizity || []);
  } else {
    sources.push(isDozhim ? (S.data.d_vizity || []) : (S.data.vizity || []));
  }
  sources.forEach(rows => {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      if (!isSverkaRow(row)) continue;
      const parts = String(row[0] || '').trim().split('.');
      const day = parseInt(parts[0]);
      if (!day || day < 1 || day > daysInMonth) continue;
      counts[day]++;
    }
  });
  return counts;
}

function openVisitsDayModalAll(isDozhim) {
  const counts = getVisitsByDayAll(isDozhim);
  const max = Math.max(1, ...counts);
  const total = counts.reduce((sum, v) => sum + v, 0);
  const days = counts.slice(1).map((count, idx) => {
    const day = idx + 1;
    const h = count ? Math.max(7, Math.round(count / max * 100)) : 0;
    const title = `${day}: ${count} ${pluralVisits(count)}`;
    return `<button class="vis-step-bar${count ? ' has-visits' : ''}" style="--h:${h}%;--i:${idx}" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}">
      ${count ? '' : '<span class="vis-step-track"></span>'}
      <span class="vis-step-fill"></span>
      <span class="vis-step-tip">${count}</span>
      <span class="vis-step-day">${day}</span>
    </button>`;
  }).join('');
  const subtitle = getMonthName(currentSuffix);
  const deptLabel = (isDozhim === null || isDozhim === undefined) ? 'Все визиты' : (isDozhim ? 'Дожим' : 'CRM');

  const modalTitle = document.querySelector('#income-overlay .income-modal-title');
  const mc = document.getElementById('income-modal-content');
  if (modalTitle) modalTitle.innerHTML = `Хронология визитов<div class="visits-modal-mgr-name">${deptLabel === 'Все визиты' ? deptLabel : 'Отдел ' + deptLabel}</div>`;
  document.getElementById('income-overlay')?.classList.add('visits-mode');
  mc.removeAttribute('data-modal');
  mc.innerHTML = `
    <div class="vis-step-card" role="figure" aria-label="Визиты за ${escapeAttr(subtitle)}: ${total}">
      <div class="vis-card-total" aria-live="polite">
        <div class="vis-card-total-main">
          <span class="vis-card-total-value">${total}</span>
          <span class="vis-card-total-label">${pluralVisits(total)}</span>
        </div>
        <span class="vis-card-month-badge">${escapeHtml(subtitle)}</span>
      </div>
      <div class="vis-step-bars" aria-label="Визиты по дням">${days}</div>
    </div>
  `;
  document.getElementById('income-overlay').classList.add('open', 'ceo-mode');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => scheduleAnimatedValues(mc));
}

function openCeoKsoModal() {
  const ksoStatuses = ['подает заявку', 'в работе ксо', 'на рассмотрении банка'];
  const collected = [];
  const sources = [S.data.vizity || [], S.data.d_vizity || []];
  sources.forEach(rows => {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[8]) continue;
      if (!isSverkaRow(row)) continue;
      const status = String(row[4] || '').trim().toLowerCase();
      if (!ksoStatuses.includes(status)) continue;
      collected.push({
        date: String(row[0] || '').trim(),
        manager: String(row[8] || '').trim(),
        city: String(row[3] || '').trim() || '—',
        phone: String(row[2] || '').trim() || '—',
        comment: String(row[4] || '').trim() || '—',
      });
    }
  });
  collected.sort((a, b) => {
    const [da, ma] = a.date.split('.').map(n => parseInt(n) || 0);
    const [db, mb] = b.date.split('.').map(n => parseInt(n) || 0);
    if (ma !== mb) return ma - mb;
    return da - db;
  });

  function shortName(full) {
    const parts = full.trim().split(/\s+/);
    if (parts.length >= 2) return parts[0] + ' ' + parts[1][0].toUpperCase() + '.';
    return parts[0] || '—';
  }

  const rows = collected.length
    ? collected.map(d => `
      <tr>
        <td class="ceo-deals-date">${d.date.split('.').slice(0,2).join('.')}</td>
        <td class="ceo-deals-mgr">${shortName(d.manager)}</td>
        <td class="ceo-deals-city">${d.city}</td>
        <td class="ceo-deals-src">${d.phone}</td>
        <td class="ceo-deals-src">${d.comment}</td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="ceo-deals-empty">Нет заявок в банках</td></tr>`;

  const modalTitle = document.querySelector('#income-overlay .income-modal-title');
  const mc = document.getElementById('income-modal-content');
  if (modalTitle) modalTitle.innerHTML = `В КСО<div class="visits-modal-mgr-name">${collected.length} · ${getMonthName(currentSuffix)}</div>`;
  document.getElementById('income-overlay')?.classList.remove('visits-mode');
  mc.removeAttribute('data-modal');
  mc.innerHTML = `
    <table class="ceo-deals-table">
      <thead>
        <tr><th>Дата</th><th>Менеджер</th><th>Город</th><th>Телефон</th><th>Статус</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  document.getElementById('income-overlay').classList.add('open', 'ceo-mode');
  document.body.style.overflow = 'hidden';
}

function openCeoSalonModal() {
  const collected = [];
  const sources = [S.data.vizity || [], S.data.d_vizity || []];
  sources.forEach(rows => {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[8]) continue;
      if (!isSverkaRow(row)) continue;
      const status = String(row[4] || '').trim().toLowerCase();
      if (status !== 'в салоне') continue;
      collected.push({
        date: String(row[0] || '').trim(),
        manager: String(row[8] || '').trim(),
        city: String(row[3] || '').trim() || '—',
        phone: String(row[2] || '').trim() || '—',
        comment: String(row[4] || '').trim() || '—',
      });
    }
  });
  collected.sort((a, b) => {
    const [da, ma] = a.date.split('.').map(n => parseInt(n) || 0);
    const [db, mb] = b.date.split('.').map(n => parseInt(n) || 0);
    if (ma !== mb) return ma - mb;
    return da - db;
  });

  function shortName(full) {
    const parts = full.trim().split(/\s+/);
    if (parts.length >= 2) return parts[0] + ' ' + parts[1][0].toUpperCase() + '.';
    return parts[0] || '—';
  }

  const rows = collected.length
    ? collected.map(d => `
      <tr>
        <td class="ceo-deals-date">${d.date.split('.').slice(0,2).join('.')}</td>
        <td class="ceo-deals-mgr">${shortName(d.manager)}</td>
        <td class="ceo-deals-city">${d.city}</td>
        <td class="ceo-deals-src">${d.phone}</td>
        <td class="ceo-deals-src">${d.comment}</td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="ceo-deals-empty">Никого нет в салоне</td></tr>`;

  const modalTitle = document.querySelector('#income-overlay .income-modal-title');
  const mc = document.getElementById('income-modal-content');
  if (modalTitle) modalTitle.innerHTML = `В салоне<div class="visits-modal-mgr-name">${collected.length} · ${getMonthName(currentSuffix)}</div>`;
  document.getElementById('income-overlay')?.classList.remove('visits-mode');
  mc.removeAttribute('data-modal');
  mc.innerHTML = `
    <table class="ceo-deals-table">
      <thead>
        <tr><th>Дата</th><th>Менеджер</th><th>Город</th><th>Телефон</th><th>Коммент</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  document.getElementById('income-overlay').classList.add('open', 'ceo-mode');
  document.body.style.overflow = 'hidden';
}

function openCeoDealsModal(kind) {
  const KINDS = {
    kredit:  { title: 'Кредиты',     match: s => s === 'покупка (кредит)' },
    nalobm:  { title: 'Нал+Обмен',   match: s => s === 'покупка (наличные)' || s === 'обмен' },
    komis:   { title: 'Комиссия',    match: s => s === 'комиссия' },
  };
  const cfg = KINDS[kind];
  if (!cfg) return;
  const collected = [];
  const sources = [S.data.vizity || [], S.data.d_vizity || []];
  sources.forEach(rows => {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[8]) continue;
      if (!isSverkaRow(row)) continue;
      const status = String(row[4] || '').trim().toLowerCase();
      if (!cfg.match(status)) continue;
      collected.push({
        date: String(row[0] || '').trim(),
        manager: String(row[8] || '').trim(),
        city: String(row[3] || '').trim() || '—',
        source: String(row[5] || '').trim() || '—',
      });
    }
  });
  // Сортировка: начало месяца сверху
  collected.sort((a, b) => {
    const [da, ma] = a.date.split('.').map(n => parseInt(n) || 0);
    const [db, mb] = b.date.split('.').map(n => parseInt(n) || 0);
    if (ma !== mb) return ma - mb;
    return da - db;
  });

  function shortName(full) {
    const parts = full.trim().split(/\s+/);
    if (parts.length >= 2) return parts[0] + ' ' + parts[1][0].toUpperCase() + '.';
    return parts[0] || '—';
  }

  // Сборка строк с итогом по дню после каждой группы
  let rows = '';
  if (!collected.length) {
    rows = `<tr><td colspan="4" class="ceo-deals-empty">Нет данных</td></tr>`;
  } else {
    let curDay = null;
    let dayCount = 0;
    let buffer = '';
    function flushDay() {
      if (curDay !== null) {
        rows += buffer;
        rows += `<tr class="ceo-deals-daytotal"><td colspan="4">Итого за ${curDay}: <b>${dayCount}</b> шт.</td></tr>`;
      }
      buffer = '';
      dayCount = 0;
    }
    collected.forEach(d => {
      const dd = d.date.split('.').slice(0,2).join('.');
      if (curDay !== null && dd !== curDay) flushDay();
      curDay = dd;
      dayCount++;
      buffer += `<tr>
        <td class="ceo-deals-date">${dd}</td>
        <td class="ceo-deals-mgr">${shortName(d.manager)}</td>
        <td class="ceo-deals-city">${d.city}</td>
        <td class="ceo-deals-src">${d.source}</td>
      </tr>`;
    });
    flushDay();
  }

  const modalTitle = document.querySelector('#income-overlay .income-modal-title');
  const mc = document.getElementById('income-modal-content');
  if (modalTitle) modalTitle.innerHTML = `${cfg.title}<div class="visits-modal-mgr-name">${collected.length} · ${getMonthName(currentSuffix)}</div>`;
  document.getElementById('income-overlay')?.classList.remove('visits-mode');
  mc.removeAttribute('data-modal');
  mc.innerHTML = `
    <table class="ceo-deals-table">
      <thead>
        <tr><th>Дата</th><th>Менеджер</th><th>Город</th><th>Источник</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  document.getElementById('income-overlay').classList.add('open', 'ceo-mode');
  document.body.style.overflow = 'hidden';
}

/* ────── ПЕРСОНАЛЬНЫЕ МОДАЛКИ ПО МЕНЕДЖЕРУ ──────
   Те же таблицы, что у CEO, только отфильтровано по одному менеджеру (nameLow).
   Колонка «Менеджер» убрана как лишняя. */

function _mgrDisplayName(nameLow) {
  // Восстанавливаем нормальный регистр имени из USERS
  if (S.usersData) {
    for (let i = 1; i < S.usersData.length; i++) {
      const r = S.usersData[i];
      if ((r[1]||'').toLowerCase().trim() === nameLow) return (r[1]||'').trim();
    }
  }
  return nameLow;
}

function openMgrDealsModal(nameLow, kind) {
  const KINDS = {
    kredit:    { title: 'Кредиты',      match: s => s === 'покупка (кредит)' },
    nalobm:    { title: 'Нал+Обмен',    match: s => s === 'покупка (наличные)' || s === 'обмен' },
    nal:       { title: 'Наличные',     match: s => s === 'покупка (наличные)' },
    obmen:     { title: 'Обмен',        match: s => s === 'обмен' },
    vykup:     { title: 'Выкуп',        match: s => s === 'выкуп' },
    komis:     { title: 'Комиссия',     match: s => s === 'комиссия' },
    otkazfssp: { title: 'Отказ + ФССП', match: s => s === 'отказ' || s === 'фссп не подаем' },
    otkaz:     { title: 'Отказы',       match: s => s === 'отказ' },
    fssp:      { title: 'ФССП',         match: s => s === 'фссп не подаем' },
    odob_nk:   { title: 'Одоб. не купил', match: s => s === 'одобрено банком, но не купил' },
    vizity:    { title: 'Визиты',       match: () => true }, // все sverka-строки
    zadatok:   { title: 'Задаток',      matchRow: row => (parseFloat(String(row[9]||'0').replace(/[^\d.]/g,'')) || 0) > 1000 },
  };
  const cfg = KINDS[kind]; if (!cfg) return;
  const target = String(nameLow || '').toLowerCase().trim();
  const collected = [];
  const sources = [S.data.vizity || [], S.data.d_vizity || []];
  sources.forEach(rows => {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[8]) continue;
      if (String(row[8]).toLowerCase().trim() !== target) continue;
      if (!isSverkaRow(row)) continue;
      const status = String(row[4] || '').trim().toLowerCase();
      const ok = cfg.matchRow ? cfg.matchRow(row) : cfg.match(status);
      if (!ok) continue;
      collected.push({
        date:   String(row[0] || '').trim(),
        phone:  String(row[2] || '').trim() || '—',
        city:   String(row[3] || '').trim() || '—',
        status: String(row[4] || '').trim() || '—',
      });
    }
  });
  collected.sort((a, b) => {
    const [da, ma] = a.date.split('.').map(n => parseInt(n) || 0);
    const [db, mb] = b.date.split('.').map(n => parseInt(n) || 0);
    if (ma !== mb) return ma - mb;
    return da - db;
  });

  let rowsHtml = '';
  if (!collected.length) {
    rowsHtml = `<tr><td colspan="4" class="ceo-deals-empty">Нет сделок</td></tr>`;
  } else {
    let curDay = null, dayCount = 0, buffer = '';
    function flushDay() {
      if (curDay !== null) {
        rowsHtml += buffer;
        rowsHtml += `<tr class="ceo-deals-daytotal"><td colspan="4">Итого за ${curDay}: <b>${dayCount}</b> шт.</td></tr>`;
      }
      buffer = ''; dayCount = 0;
    }
    collected.forEach(d => {
      const dd = d.date.split('.').slice(0, 2).join('.');
      if (curDay !== null && dd !== curDay) flushDay();
      curDay = dd; dayCount++;
      buffer += `<tr>
        <td class="ceo-deals-date">${dd}</td>
        <td class="ceo-deals-city">${d.city}</td>
        <td class="ceo-deals-src">${d.phone}</td>
        <td class="ceo-deals-src">${d.status}</td>
      </tr>`;
    });
    flushDay();
  }

  const modalTitle = document.querySelector('#income-overlay .income-modal-title');
  const mc = document.getElementById('income-modal-content');
  if (modalTitle) modalTitle.innerHTML = `${cfg.title}<div class="visits-modal-mgr-name">${_mgrDisplayName(target)} · ${collected.length} · ${getMonthName(currentSuffix)}</div>`;
  document.getElementById('income-overlay')?.classList.remove('visits-mode');
  mc.removeAttribute('data-modal');
  mc.innerHTML = `
    <table class="ceo-deals-table">
      <thead><tr><th>Дата</th><th>Город</th><th>Телефон</th><th>Статус</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
  document.getElementById('income-overlay').classList.add('open', 'ceo-mode');
  document.body.style.overflow = 'hidden';
}

function openMgrSalonModal(nameLow) {
  const target = String(nameLow || '').toLowerCase().trim();
  const collected = [];
  const sources = [S.data.vizity || [], S.data.d_vizity || []];
  sources.forEach(rows => {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[8]) continue;
      if (String(row[8]).toLowerCase().trim() !== target) continue;
      if (!isSverkaRow(row)) continue;
      const status = String(row[4] || '').trim().toLowerCase();
      if (status !== 'в салоне') continue;
      collected.push({
        date:    String(row[0] || '').trim(),
        city:    String(row[3] || '').trim() || '—',
        phone:   String(row[2] || '').trim() || '—',
        comment: String(row[4] || '').trim() || '—',
      });
    }
  });
  collected.sort((a, b) => {
    const [da, ma] = a.date.split('.').map(n => parseInt(n) || 0);
    const [db, mb] = b.date.split('.').map(n => parseInt(n) || 0);
    if (ma !== mb) return ma - mb;
    return da - db;
  });
  const rowsHtml = collected.length
    ? collected.map(d => `
      <tr>
        <td class="ceo-deals-date">${d.date.split('.').slice(0,2).join('.')}</td>
        <td class="ceo-deals-city">${d.city}</td>
        <td class="ceo-deals-src">${d.phone}</td>
        <td class="ceo-deals-src">${d.comment}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="ceo-deals-empty">Никого нет в салоне</td></tr>`;

  const modalTitle = document.querySelector('#income-overlay .income-modal-title');
  const mc = document.getElementById('income-modal-content');
  if (modalTitle) modalTitle.innerHTML = `В салоне<div class="visits-modal-mgr-name">${_mgrDisplayName(target)} · ${collected.length} · ${getMonthName(currentSuffix)}</div>`;
  document.getElementById('income-overlay')?.classList.remove('visits-mode');
  mc.removeAttribute('data-modal');
  mc.innerHTML = `
    <table class="ceo-deals-table">
      <thead><tr><th>Дата</th><th>Город</th><th>Телефон</th><th>Коммент</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
  document.getElementById('income-overlay').classList.add('open', 'ceo-mode');
  document.body.style.overflow = 'hidden';
}

function openMgrKsoModal(nameLow) {
  const ksoStatuses = ['подает заявку', 'в работе ксо', 'на рассмотрении банка'];
  const target = String(nameLow || '').toLowerCase().trim();
  const collected = [];
  const sources = [S.data.vizity || [], S.data.d_vizity || []];
  sources.forEach(rows => {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[8]) continue;
      if (String(row[8]).toLowerCase().trim() !== target) continue;
      if (!isSverkaRow(row)) continue;
      const status = String(row[4] || '').trim().toLowerCase();
      if (!ksoStatuses.includes(status)) continue;
      collected.push({
        date:    String(row[0] || '').trim(),
        city:    String(row[3] || '').trim() || '—',
        phone:   String(row[2] || '').trim() || '—',
        comment: String(row[4] || '').trim() || '—',
      });
    }
  });
  collected.sort((a, b) => {
    const [da, ma] = a.date.split('.').map(n => parseInt(n) || 0);
    const [db, mb] = b.date.split('.').map(n => parseInt(n) || 0);
    if (ma !== mb) return ma - mb;
    return da - db;
  });
  const rowsHtml = collected.length
    ? collected.map(d => `
      <tr>
        <td class="ceo-deals-date">${d.date.split('.').slice(0,2).join('.')}</td>
        <td class="ceo-deals-city">${d.city}</td>
        <td class="ceo-deals-src">${d.phone}</td>
        <td class="ceo-deals-src">${d.comment}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="ceo-deals-empty">Нет заявок в банках</td></tr>`;

  const modalTitle = document.querySelector('#income-overlay .income-modal-title');
  const mc = document.getElementById('income-modal-content');
  if (modalTitle) modalTitle.innerHTML = `В КСО<div class="visits-modal-mgr-name">${_mgrDisplayName(target)} · ${collected.length} · ${getMonthName(currentSuffix)}</div>`;
  document.getElementById('income-overlay')?.classList.remove('visits-mode');
  mc.removeAttribute('data-modal');
  mc.innerHTML = `
    <table class="ceo-deals-table">
      <thead><tr><th>Дата</th><th>Город</th><th>Телефон</th><th>Статус</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
  document.getElementById('income-overlay').classList.add('open', 'ceo-mode');
  document.body.style.overflow = 'hidden';
}

window.openMgrDealsModal = openMgrDealsModal;
window.openMgrSalonModal = openMgrSalonModal;
window.openMgrKsoModal   = openMgrKsoModal;

function pluralVisits(n) {
  const v = Math.abs(Number(n) || 0) % 100;
  const v1 = v % 10;
  if (v > 10 && v < 20) return 'визитов';
  if (v1 > 1 && v1 < 5) return 'визита';
  if (v1 === 1) return 'визит';
  return 'визитов';
}

function openVisitsDayModal(nameLow, isDozhim) {
  const counts = getVisitsByDay(nameLow, isDozhim);
  const max = Math.max(1, ...counts);
  const total = counts.reduce((sum, v) => sum + v, 0);
  const days = counts.slice(1).map((count, idx) => {
    const day = idx + 1;
    const h = count ? Math.max(7, Math.round(count / max * 100)) : 0;
    const title = `${day}: ${count} ${pluralVisits(count)}`;
    return `<button class="vis-step-bar${count ? ' has-visits' : ''}" style="--h:${h}%;--i:${idx}" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}">
      ${count ? '' : '<span class="vis-step-track"></span>'}
      <span class="vis-step-fill"></span>
      <span class="vis-step-tip">${count}</span>
      <span class="vis-step-day">${day}</span>
    </button>`;
  }).join('');
  const subtitle = getMonthName(currentSuffix);

  const modalTitle = document.querySelector('#income-overlay .income-modal-title');
  const mc = document.getElementById('income-modal-content');
  const nameDisplay = nameLow
    ? nameLow.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : '';
  if (modalTitle) modalTitle.innerHTML = `Хронология визитов${nameDisplay ? `<div class="visits-modal-mgr-name">${escapeHtml(nameDisplay)}</div>` : ''}`;
  document.getElementById('income-overlay')?.classList.add('visits-mode');
  mc.removeAttribute('data-modal');
  mc.innerHTML = `
    <div class="vis-step-card" role="figure" aria-label="Визиты за ${escapeAttr(subtitle)}: ${total}">
      <div class="vis-card-total" aria-live="polite">
        <div class="vis-card-total-main">
          <span class="vis-card-total-value">${total}</span>
          <span class="vis-card-total-label">${pluralVisits(total)}</span>
        </div>
        <span class="vis-card-month-badge">${escapeHtml(subtitle)}</span>
      </div>
      <div class="vis-step-bars" aria-label="Визиты по дням">${days}</div>
    </div>
  `;
  document.getElementById('income-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => scheduleAnimatedValues(mc));
}

// ==================== DAY CALENDAR BREAKDOWN ====================
function buildDayCalendar(nameLow, vizData, ratesObj, isDozhim) {
  const DOW_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const suffix = currentSuffix;
  const mm = parseInt(suffix.slice(0,2)), yy = 2000 + parseInt(suffix.slice(2));
  const daysInMonth = new Date(yy, mm, 0).getDate();
  // Первый день недели: 0=Вс..6=Сб → смещение для ПН-старта
  const rawFirst = new Date(yy, mm-1, 1).getDay(); // 0=Sun
  const firstDow = (rawFirst + 6) % 7; // 0=Mon

  const R = ratesObj || {};

  const dayMap = {};
  const dayStats = {};
  const BUY_KREDIT = 'покупка (кредит)';
  const BUY_NAL    = 'покупка (наличные)';
  const BUY_OBMEN  = 'обмен';
  const BUY_VYKUP  = 'выкуп';
  const BUY_KOM    = 'комиссия';

  function ensureDayStats(day) {
    if (!dayStats[day]) {
      dayStats[day] = isDozhim
        ? {
            ch800:  { vis:0, kred:0, nal:0, obmen:0, vykup:0, kom:0, zadatok:0 },
            ch1000: { vis:0, kred:0, nal:0, obmen:0, vykup:0, kom:0 },
          }
        : {
            crm:  { vis:0, kred:0, nal:0, obmen:0, vykup:0, kom:0, zadatok:0 },
            warm: { vis:0, kred:0, nal:0, obmen:0, vykup:0, kom:0 },
          };
    }
    return dayStats[day];
  }

  function addDealCounters(bucket, status) {
    if (status === BUY_KREDIT) bucket.kred++;
    if (status === BUY_NAL)    bucket.nal++;
    if (status === BUY_OBMEN && Object.prototype.hasOwnProperty.call(bucket, 'obmen')) bucket.obmen++;
    if (status === BUY_VYKUP && Object.prototype.hasOwnProperty.call(bucket, 'vykup')) bucket.vykup++;
    if (status === BUY_KOM)    bucket.kom++;
  }

  if (vizData) {
    for (let i = 1; i < vizData.length; i++) {
      const row = vizData[i];
      if (!row) continue;
      const mgr = (row[8]||'').trim().toLowerCase();
      if (mgr !== nameLow) continue;
      if (!isSverkaRow(row, true)) continue;

      const dateStr = (row[0]||'').trim();
      const parts = dateStr.split('.');
      if (!parts || parts.length < 2) continue;
      const day = parseInt(parts[0]);
      if (!day || day < 1 || day > 31) continue;

      const cat  = (row[6]||'').trim().toLowerCase();
      const deal = (row[4]||'').trim().toLowerCase();
      const zadSum = parseFloat(String(row[9]||'0').replace(/[^\d.]/g,'')) || 0;

      if (!isDozhim) {
        const is800  = cat === 'кат 800';
        const is1200 = cat === 'кат 1200';
        const stat = ensureDayStats(day);
        if (is800) {
          stat.crm.vis++;
          addDealCounters(stat.crm, deal);
          if (zadSum > 1000) stat.crm.zadatok++;
        } else if (is1200) {
          stat.warm.vis++;
          addDealCounters(stat.warm, deal);
        }

      } else {
        const is800  = cat === 'кат 800';
        const is1000 = cat === 'кат 1000';
        const stat = ensureDayStats(day);
        if (is800) {
          stat.ch800.vis++;
          addDealCounters(stat.ch800, deal);
          if (zadSum >= 1000) stat.ch800.zadatok++;
        } else if (is1000) {
          stat.ch1000.vis++;
          addDealCounters(stat.ch1000, deal);
        }
      }
    }
  }

  Object.entries(dayStats).forEach(([day, stat]) => {
    let earn = 0;
    if (!isDozhim) {
      const crmPure  = Math.max(0, stat.crm.vis  - stat.crm.kred  - stat.crm.nal  - stat.crm.obmen  - (stat.crm.vykup||0)  - stat.crm.kom);
      const warmPure = Math.max(0, stat.warm.vis - stat.warm.kred - stat.warm.nal - stat.warm.obmen - (stat.warm.vykup||0) - stat.warm.kom);
      earn =
        crmPure * (R.rCrmVis || 0) +
        stat.crm.kred * (R.rCrmKred || 0) +
        stat.crm.nal * (R.rCrmNal || 0) +
        stat.crm.obmen * (R.rCrmObmen || 0) +
        (stat.crm.vykup || 0) * (R.rCrmVykup || 0) +
        stat.crm.kom * (R.rCrmKom || 0) +
        stat.crm.zadatok * (R.rZadatok || 0) +
        warmPure * (R.rWarmVis || 0) +
        stat.warm.kred * (R.rWarmKred || 0) +
        stat.warm.nal * (R.rWarmNal || 0) +
        stat.warm.obmen * (R.rWarmObmen || 0) +
        (stat.warm.vykup || 0) * (R.rWarmVykup || 0) +
        stat.warm.kom * (R.rWarmKom || 0);
    } else {
      const pure800  = Math.max(0, stat.ch800.vis  - stat.ch800.kred  - stat.ch800.nal  - stat.ch800.obmen  - stat.ch800.kom);
      const pure1000 = Math.max(0, stat.ch1000.vis - stat.ch1000.kred - stat.ch1000.nal - stat.ch1000.obmen - stat.ch1000.kom);
      earn =
        pure800 * (R.r800Vis || 0) +
        stat.ch800.kred * (R.r800Kred || 0) +
        stat.ch800.nal * (R.r800Nal || 0) +
        stat.ch800.obmen * (R.r800Obmen || 0) +
        stat.ch800.kom * (R.r800Kom || 0) +
        stat.ch800.zadatok * (R.rZadatok || 0) +
        pure1000 * (R.r1000Vis || 0) +
        stat.ch1000.kred * (R.r1000Kred || 0) +
        stat.ch1000.nal * (R.r1000Nal || 0) +
        stat.ch1000.kom * (R.r1000Kom || 0);
    }
    if (earn > 0) dayMap[day] = earn;
  });

  const fmtShort = v => Math.round(v).toLocaleString('ru');

  let cells = '';
  // Заголовки дней недели
  const headerCells = DOW_SHORT.map(d => `<div style="font-size:7px;font-family:'Unbounded',sans-serif;font-weight:800;color:var(--txt3);text-align:center;padding:3px 0">${d}</div>`).join('');

  for (let i = 0; i < firstDow; i++) {
    cells += `<div class="inc-day-blank" aria-hidden="true"></div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const sum = dayMap[d];
    const hasIncome = sum && sum > 0;
    cells += `<div class="inc-day-cell${hasIncome?' has-income':''}">
      <div class="inc-day-num">${d}</div>
      ${hasIncome ? `<div class="inc-day-sum">${fmtShort(sum)}₽</div>` : ''}
    </div>`;
  }

  return `<div class="inc-day-panel">
    <details class="inc-day-spoiler">
      <summary>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        Детализация по дням
      </summary>
      <div class="inc-day-grid">${headerCells}${cells}</div>
    </details>
  </div>`;
}

function openSalInfo(roleHint) {
  const matched = findUserInSheet();
  const role = matched?.role || 'crm';
  let effectiveRole;
  if (roleHint) {
    effectiveRole = roleHint;
  } else if (isCeoLike(role)) {
    // CEO видит инструкцию того отдела, чья вкладка сейчас открыта
    effectiveRole = S.dohodTab === 'dozhim' ? 'dozhim' : 'crm';
  } else {
    effectiveRole = role;
  }
  const isDozhim = effectiveRole === 'dozhim';

  const R = DOZHIM_RATES;
  const rub = v => fmtRub(v);

  let bodyHtml = '';

  if (isDozhim) {
    bodyHtml = `
      <div class="si-sec">Формула</div>
      <div class="si-formula">Зарплата = Оклад + Премия + Доля котла</div>
      <div class="si-note">Коэффициенты не применяются. Оклад начисляется пропорционально отработанным рабочим дням.</div>

      <div class="si-sec">Оклад</div>
      <div class="si-row"><span class="si-key">База</span><span class="si-val">${rub(R.baseOklad)}</span></div>
      <div class="si-row"><span class="si-key">Расчёт</span><span class="si-val">Оклад ÷ раб.дней × отработано</span></div>

      <div class="si-sec">Ставки — КАТ 800</div>
      <div class="si-row"><span class="si-key">Визит</span><span class="si-val">${rub(R.r800Vis)}</span></div>
      <div class="si-row"><span class="si-key">Кредит</span><span class="si-val">${rub(R.r800Kred)}</span></div>
      <div class="si-row"><span class="si-key">Наличка</span><span class="si-val">${rub(R.r800Nal)}</span></div>
      <div class="si-row"><span class="si-key">Обмен</span><span class="si-val">${rub(R.r800Obmen)}</span></div>
      <div class="si-row"><span class="si-key">Комиссия</span><span class="si-val">${rub(R.r800Kom)}</span></div>
      <div class="si-row"><span class="si-key">Задаток</span><span class="si-val">${rub(R.rZadatok)}</span></div>

      <div class="si-sec">Ставки — КАТ 1000</div>
      <div class="si-row"><span class="si-key">Визит</span><span class="si-val">${rub(R.r1000Vis)}</span></div>
      <div class="si-row"><span class="si-key">Кредит</span><span class="si-val">${rub(R.r1000Kred)}</span></div>
      <div class="si-row"><span class="si-key">Наличка</span><span class="si-val">${rub(R.r1000Nal)}</span></div>
      <div class="si-row"><span class="si-key">Комиссия</span><span class="si-val">${rub(R.r1000Kom)}</span></div>

      <div class="si-sec">Котёл</div>
      <div class="si-row"><span class="si-key">Что это</span><span class="si-val">Общий фонд отдела дожима, делится поровну</span></div>
      <div class="si-row"><span class="si-key">Доля</span><span class="si-val">Котёл ÷ кол-во участников</span></div>

      <div class="si-sec">Итого</div>
      <div class="si-formula">Оклад + Премия КАТ800 + Премия КАТ1000 + Доля котла</div>
    `;
  } else {
    const st = S.data.stavki || [];
    const parseR = v => parseFloat(String(v||'0').replace(/[^0-9.,-]/g,'').replace(',','.')) || 0;
    const rubSt = v => v ? fmtRub(v) : '—';
    const crmVis   = rubSt(parseR(st[8]?.[1]));
    const crmKred  = rubSt(parseR(st[9]?.[1]));
    const crmNal   = rubSt(parseR(st[10]?.[1]));
    const crmObmen = rubSt(parseR(st[11]?.[1]));
    const crmKom   = rubSt(parseR(st[12]?.[1]));
    const crmZad   = rubSt(parseR(st[20]?.[1]));
    const tlVis    = rubSt(parseR(st[14]?.[1]));
    const tlKred   = rubSt(parseR(st[15]?.[1]));
    const tlNal    = rubSt(parseR(st[16]?.[1]));
    const tlObmen  = rubSt(parseR(st[17]?.[1]));
    const tlKom    = rubSt(parseR(st[18]?.[1]));
    const hasRates = st.length > 0;

    bodyHtml = `
      <div class="si-sec">Формула</div>
      <div class="si-formula">Зарплата = Оклад + (Премия × Коэффициент)</div>
      <div class="si-note">Оклад начисляется пропорционально отработанным рабочим дням.<br>Премия = CRM + Тёплые лиды + Доля котла.</div>

      <div class="si-sec">Оклад</div>
      <div class="si-row"><span class="si-key">База</span><span class="si-val">Фиксированный оклад по ставке</span></div>
      <div class="si-row"><span class="si-key">Расчёт</span><span class="si-val">Оклад ÷ раб.дней × отработано</span></div>

      ${hasRates ? `
      <div class="si-sec">Премия CRM</div>
      <div class="si-row"><span class="si-key">Визит</span><span class="si-val">${crmVis}</span></div>
      <div class="si-row"><span class="si-key">Кредит</span><span class="si-val">${crmKred}</span></div>
      <div class="si-row"><span class="si-key">Наличка</span><span class="si-val">${crmNal}</span></div>
      <div class="si-row"><span class="si-key">Обмен</span><span class="si-val">${crmObmen}</span></div>
      <div class="si-row"><span class="si-key">Комиссия</span><span class="si-val">${crmKom}</span></div>
      <div class="si-row"><span class="si-key">Задаток</span><span class="si-val">${crmZad}</span></div>

      <div class="si-sec">Премия Тёплые лиды</div>
      <div class="si-row"><span class="si-key">Визит</span><span class="si-val">${tlVis}</span></div>
      <div class="si-row"><span class="si-key">Кредит</span><span class="si-val">${tlKred}</span></div>
      <div class="si-row"><span class="si-key">Наличка</span><span class="si-val">${tlNal}</span></div>
      <div class="si-row"><span class="si-key">Обмен</span><span class="si-val">${tlObmen}</span></div>
      <div class="si-row"><span class="si-key">Комиссия</span><span class="si-val">${tlKom}</span></div>` : ''}

      <div class="si-sec">Котёл</div>
      <div class="si-row"><span class="si-key">Что это</span><span class="si-val">Общий фонд отдела, делится поровну</span></div>
      <div class="si-row"><span class="si-key">Доля</span><span class="si-val">Котёл ÷ кол-во участников</span></div>
      <div class="si-row"><span class="si-key">Участие</span><span class="si-val">Только у включённых в котёл</span></div>

      <div class="si-sec">Коэффициент (×К)</div>
      <div class="si-row"><span class="si-key">×0.8</span><span class="si-val">Менее 80% плана</span></div>
      <div class="si-row"><span class="si-key">×0.9</span><span class="si-val">80% — не более 100%</span></div>
      <div class="si-row"><span class="si-key">×1.0</span><span class="si-val">100% — 130% включительно</span></div>
      <div class="si-row"><span class="si-key">×1.1</span><span class="si-val">Более 130% и до 150% включ.</span></div>
      <div class="si-row"><span class="si-key">×1.2</span><span class="si-val">Более 150% плана</span></div>
      <div class="si-note">Коэффициент применяется к премии (CRM + ТЛ + Котёл), но не к окладу.</div>

      <div class="si-sec">Фактический доход</div>
      <div class="si-formula">Оклад + (Премия × К_факт)</div>
      <div class="si-note">К_факт рассчитан по текущему % выполнения плана на сегодня.</div>

      <div class="si-sec">Прогнозируемый доход</div>
      <div class="si-formula">Оклад + (Премия × К_прогноз)</div>
      <div class="si-note">К_прогноз — экстраполяция текущего темпа до конца месяца.</div>

      <div class="si-sec">Без коэффициентов</div>
      <div class="si-formula">Оклад (100%) + Премия CRM + Премия ТЛ + Доля котла</div>
      <div class="si-note">Базовый расчёт с К=1. Показывает «чистую» сумму без поправки за план.</div>
    `;
  }

  document.getElementById('sal-info-body').innerHTML = bodyHtml;
  document.getElementById('sal-info-overlay').classList.add('open');
}
function closeSalInfo() {
  document.getElementById('sal-info-overlay').classList.remove('open');
}

function closeIncomeDetail(e) {
  if (e && e.target !== document.getElementById('income-overlay')) return;
  document.getElementById('income-overlay').classList.remove('open', 'visits-mode', 'ceo-mode');
  document.body.style.overflow = '';
}

// ==================== INIT ====================
document.getElementById('btn-refresh').addEventListener('click', reloadCurrent);
document.getElementById('btn-presence')?.addEventListener('click', e => {
  e.stopPropagation();
  const pop = document.getElementById('presence-popover');
  if (pop?.classList.contains('open')) closePresenceModal();
  else {
    openPresenceModal();
  }
});
document.addEventListener('pointerdown', e => {
  if (!e.target.closest('#presence-wrap')) closePresenceModal();
}, true);
document.addEventListener('click', e => {
  // Hamburger
  if (!e.target.closest('#hamburger-wrap')) closeHamburger();
  if (!e.target.closest('#presence-wrap')) closePresenceModal();
});
// btn-out переехал в hamburger, но слушатель оставляем для совместимости
const _btnOut = document.getElementById('btn-out');
if (_btnOut) _btnOut.addEventListener('click', onLogout);
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => goTab(b.dataset.tab)));
document.getElementById('badge-month').addEventListener('click', showMonthDropdown);
document.getElementById('center-login-btn').addEventListener('click', () => {
  if (isAndroidWebView) {
    // Google блокирует OAuth в Android WebView — открываем в Chrome
    window.open('https://frankiej13.github.io/crewcrm/', '_system');
    return;
  }
  if (!tokenClient) { toast('Загружается…','i'); return; }
  requestGoogleToken({ prompt:'consent', mode:'login', force:true }).catch(() => {
    toast('Не удалось войти через Google', 'e');
  });
});

document.addEventListener('touchmove', function(e) {
  if (e.touches.length > 1) {
    e.preventDefault();
  }
}, { passive: false });

function init() {
  syncTheme();
  initLogoRotation();

  // На Android WebView сразу показываем экран входа с подсказкой
  if (isAndroidWebView) {
    const btn = document.getElementById('center-login-btn');
    if (btn) {
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 11h8.533c.044.385.067.78.067 1.184 0 3.37-1.17 6.22-3.207 8.154C15.553 22.124 13.9 23 12 23A11 11 0 1 1 12 1c2.95 0 5.56 1.113 7.522 2.934l-3.076 3.042C15.197 5.79 13.68 5 12 5a7 7 0 1 0 0 14c3.205 0 5.542-1.916 6.27-4.987H12v-3z"/></svg>Открыть в Chrome`;
    }
    document.getElementById('scr-login').classList.add('on'); document.body.classList.add('login-active'); if(window._loginLiquidInit) window._loginLiquidInit();
    return;
  }

  // Таймаут: показываем вход если GSI не загрузился за 6 секунд
  const gsiTimeout = setTimeout(() => {
    if (!tokenClient) {
      const l = document.getElementById('silent-loader');
      if (l) l.remove();
      document.getElementById('scr-login').style.display = '';
      document.getElementById('scr-login').classList.add('on'); document.body.classList.add('login-active'); if(window._loginLiquidInit) window._loginLiquidInit();
    }
  }, 6000);

  function waitGoogle() {
    if (typeof google !== 'undefined' && google.accounts) {
      clearTimeout(gsiTimeout);
      initAuth();
      if (!tryRestore()) {
        document.getElementById('scr-login').classList.add('on'); document.body.classList.add('login-active'); if(window._loginLiquidInit) window._loginLiquidInit();
      }
    } else setTimeout(waitGoogle, 100);
  }
  waitGoogle();
}
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();

// Убираем возможные висящие оверлеи от предыдущих сессий
document.getElementById('dock-block-overlay')?.remove();

// ==================== SVERKA MODE ====================
S.sverkaMode    = localStorage.getItem('crm_sverka')    === '1';
S.vizPasteMode  = localStorage.getItem('crm_viz_paste') === '1';
S.svcMode       = false;

function getSverkaMode() {
  if (S.usersData) {
    for (let i = 1; i < S.usersData.length; i++) {
      const mode = (S.usersData[i][10]||'').trim().toLowerCase(); // колонка K
      if (mode === 'on') return true;
      if (mode === 'off') return false;
    }
  }
  return localStorage.getItem('crm_sverka') === '1';
}

function initSverkaToggle() {
  S.sverkaMode   = getSverkaMode();
  S.vizPasteMode = getVizPasteMode();
  S.svcMode      = getSvcMode();
  S.remMode      = getRemMode();
  S.autoSMode    = getAutoSMode();
  S.trophiesMode = getTrophiesMode();
  const cb  = document.getElementById('sverka-toggle-cb');
  const cb2 = document.getElementById('viz-paste-toggle-cb');
  const cb3 = document.getElementById('svc-toggle-cb');
  const cb4 = document.getElementById('reminders-toggle-cb');
  const cb5 = document.getElementById('autos-toggle-cb');
  const cb6 = document.getElementById('trophies-toggle-cb');
  if (cb)  cb.checked  = S.sverkaMode;
  if (cb2) cb2.checked = S.vizPasteMode;
  if (cb3) cb3.checked = S.svcMode;
  if (cb4) cb4.checked = S.remMode;
  if (cb5) cb5.checked = S.autoSMode;
  if (cb6) cb6.checked = S.trophiesMode;
}

function getAutoSMode() {
  if (S.usersData) {
    for (let i = 1; i < S.usersData.length; i++) {
      const mode = (S.usersData[i][14] || '').trim().toLowerCase(); // колонка O
      if (mode === 'on')  return true;
      if (mode === 'off') return false;
    }
  }
  return true; // дефолт — включён, чтобы пустая ячейка не отключала чат
}

function getTrophiesMode() {
  if (S.usersData) {
    for (let i = 1; i < S.usersData.length; i++) {
      const mode = (S.usersData[i][15] || '').trim().toLowerCase(); // колонка P
      if (mode === 'on')  return true;
      if (mode === 'off') return false;
    }
  }
  return false; // дефолт — выключено для всех кроме CEO (бета)
}

function getRemMode() {
  if (S.usersData) {
    for (let i = 1; i < S.usersData.length; i++) {
      const mode = (S.usersData[i][13] || '').trim().toLowerCase(); // колонка N
      if (mode === 'on')  return true;
      if (mode === 'off') return false;
    }
  }
  return false;
}

function getVizPasteMode() {
  if (S.usersData) {
    for (let i = 1; i < S.usersData.length; i++) {
      const mode = (S.usersData[i][11] || '').trim().toLowerCase(); // колонка L
      if (mode === 'on')  return true;
      if (mode === 'off') return false;
    }
  }
  return localStorage.getItem('crm_viz_paste') === '1';
}

function getSvcMode() {
  if (S.usersData) {
    for (let i = 1; i < S.usersData.length; i++) {
      const mode = (S.usersData[i][12] || '').trim().toLowerCase(); // колонка M
      if (mode === 'on')  return true;
      if (mode === 'off') return false;
    }
  }
  return false;
}

async function savePlanAndSverka() {
  const cb = document.getElementById('sverka-toggle-cb');
  if (cb && cb.checked !== S.sverkaMode) {
    S.sverkaMode = cb.checked;
    const newMode = S.sverkaMode ? 'On' : 'Off';
    localStorage.setItem('crm_sverka', S.sverkaMode ? '1' : '0');
    try {
      const range = encodeURIComponent('USERS!K2:K2');
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`;
      const resp = await fetch(url, {
        method: 'PUT',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ values: [[newMode]] })
      });
      if (resp.ok) {
        if (S.usersData && S.usersData[1]) S.usersData[1][10] = newMode;
        if (document.getElementById('scr-dohod')?.classList.contains('on')) renderDohod();
        if (document.getElementById('scr-personal')?.classList.contains('on')) {
          const matched = findUserInSheet();
          if (matched) renderPersonal(matched);
        }
        toast('Режим сверки: ' + (S.sverkaMode ? 'Вкл' : 'Выкл'), 's');
      } else {
        const err = await resp.text();
        console.error('sverka PUT', resp.status, err);
        toast('Ошибка сохранения сверки', 'e');
      }
    } catch(e) {
      console.error('sverka save', e);
      toast('Ошибка сохранения сверки', 'e');
    }
  }

  // Режим вставки визитов
  const cb2 = document.getElementById('viz-paste-toggle-cb');
  if (cb2 && cb2.checked !== S.vizPasteMode) {
    S.vizPasteMode = cb2.checked;
    const newMode2 = S.vizPasteMode ? 'On' : 'Off';
    localStorage.setItem('crm_viz_paste', S.vizPasteMode ? '1' : '0');
    try {
      const range2 = encodeURIComponent('USERS!L2:L2');
      const url2 = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}/values/${range2}?valueInputOption=USER_ENTERED`;
      const resp2 = await fetch(url2, {
        method: 'PUT',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ values: [[newMode2]] })
      });
      if (resp2.ok) {
        if (S.usersData && S.usersData[1]) S.usersData[1][11] = newMode2;
        toast('Режим вставки визитов: ' + (S.vizPasteMode ? 'Вкл' : 'Выкл'), 's');
        if (document.getElementById('scr-vizity')?.classList.contains('on')) renderVizity();
      } else {
        toast('Ошибка сохранения режима вставки', 'e');
      }
    } catch(e) {
      toast('Ошибка сохранения режима вставки', 'e');
    }
  }

  // Техническое обслуживание
  const cb3 = document.getElementById('svc-toggle-cb');
  if (cb3 && cb3.checked !== S.svcMode) {
    const wasOn = S.svcMode;
    S.svcMode = cb3.checked;
    const newMode3 = S.svcMode ? 'On' : 'Off';
    try {
      const range3 = encodeURIComponent('USERS!M2:M2');
      const url3 = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}/values/${range3}?valueInputOption=USER_ENTERED`;
      const resp3 = await fetch(url3, {
        method: 'PUT',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ values: [[newMode3]] })
      });
      if (resp3.ok) {
        if (S.usersData && S.usersData[1]) S.usersData[1][12] = newMode3;
        toast('Техническое обслуживание: ' + (S.svcMode ? 'Вкл' : 'Выкл'), 's');
      } else {
        toast('Ошибка сохранения режима обслуживания', 'e');
        S.svcMode = wasOn;
      }
    } catch(e) {
      toast('Ошибка сохранения режима обслуживания', 'e');
      S.svcMode = wasOn;
    }
  }

  // Уведомления (напоминания CRM/Дожим)
  const cb4 = document.getElementById('reminders-toggle-cb');
  if (cb4 && cb4.checked !== S.remMode) {
    const wasOn = S.remMode;
    S.remMode = cb4.checked;
    const newMode4 = S.remMode ? 'On' : 'Off';
    try {
      const range4 = encodeURIComponent('USERS!N2:N2');
      const url4 = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}/values/${range4}?valueInputOption=USER_ENTERED`;
      const resp4 = await fetch(url4, {
        method: 'PUT',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ values: [[newMode4]] })
      });
      if (resp4.ok) {
        if (S.usersData && S.usersData[1]) S.usersData[1][13] = newMode4;
        toast('Уведомления: ' + (S.remMode ? 'Вкл' : 'Выкл'), 's');
        if (typeof remApplyVisibility === 'function') remApplyVisibility();
      } else {
        toast('Ошибка сохранения режима уведомлений', 'e');
        S.remMode = wasOn;
      }
    } catch(e) {
      toast('Ошибка сохранения режима уведомлений', 'e');
      S.remMode = wasOn;
    }
  }

  // Автоподбор-чат (активатор страницы)
  const cb5 = document.getElementById('autos-toggle-cb');
  if (cb5 && cb5.checked !== S.autoSMode) {
    const wasOn5 = S.autoSMode;
    S.autoSMode = cb5.checked;
    const newMode5 = S.autoSMode ? 'On' : 'Off';
    try {
      const range5 = encodeURIComponent('USERS!O2:O2');
      const url5 = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}/values/${range5}?valueInputOption=USER_ENTERED`;
      const resp5 = await fetch(url5, {
        method: 'PUT',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ values: [[newMode5]] })
      });
      if (resp5.ok) {
        if (S.usersData && S.usersData[1]) S.usersData[1][14] = newMode5;
        toast('Автоподбор-чат: ' + (S.autoSMode ? 'Вкл' : 'Выкл'), 's');
      } else {
        toast('Ошибка сохранения режима автоподбора', 'e');
        S.autoSMode = wasOn5;
      }
    } catch(e) {
      toast('Ошибка сохранения режима автоподбора', 'e');
      S.autoSMode = wasOn5;
    }
  }

  // Трофеи — активатор страницы (бета у CEO при Off)
  const cb6 = document.getElementById('trophies-toggle-cb');
  if (cb6 && cb6.checked !== S.trophiesMode) {
    const wasOn6 = S.trophiesMode;
    S.trophiesMode = cb6.checked;
    const newMode6 = S.trophiesMode ? 'On' : 'Off';
    try {
      const range6 = encodeURIComponent('USERS!P2:P2');
      const url6 = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}/values/${range6}?valueInputOption=USER_ENTERED`;
      const resp6 = await fetch(url6, {
        method: 'PUT',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ values: [[newMode6]] })
      });
      if (resp6.ok) {
        if (S.usersData && S.usersData[1]) S.usersData[1][15] = newMode6;
        toast('Трофеи: ' + (S.trophiesMode ? 'Вкл' : 'Выкл'), 's');
      } else {
        toast('Ошибка сохранения режима трофеев', 'e');
        S.trophiesMode = wasOn6;
      }
    } catch(e) {
      toast('Ошибка сохранения режима трофеев', 'e');
      S.trophiesMode = wasOn6;
    }
  }

  // Сохраняем планы только если есть поля (спойлер открыт)
  const bInputs2 = document.querySelectorAll('.pe-input:not(.pe-input-d)');
  if (bInputs2.length > 0) {
    // Запускаем savePlan но перехватываем его закрытие
    const btn = document.getElementById('pe-save-btn');
    const status = document.getElementById('pe-status');
    const dMap2 = {};
    document.querySelectorAll('.pe-input-d').forEach(inp => { dMap2[inp.dataset.name] = parseInt(inp.value) || 0; });
    const values = [['Менеджер', 'План', '', 'План продажи']];
    bInputs2.forEach(inp => values.push([inp.dataset.name, parseInt(inp.value) || 0, '', dMap2[inp.dataset.name] || 0]));
    if (btn) btn.disabled = true;
    if (status) status.textContent = 'Сохраняем…';
    try {
      const sheetName = SHEETS.plan;
      const range = `'${sheetName}'!A1:D${values.length}`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
      const resp = await fetch(url, {
        method: 'PUT',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ range, majorDimension: 'ROWS', values })
      });
      if (resp.ok) {
        S.data.plan = values;
        if (status) { status.style.color = 'var(--grn)'; status.textContent = '✓ Сохранено'; }
      }
    } catch(e) {
      if (status) { status.style.color = 'var(--red)'; status.textContent = '✗ ' + e.message; }
    } finally {
      if (btn) btn.disabled = false;
    }
    setTimeout(() => closePlanEditorFull(), 800);
  } else {
    // Планы не редактировались — просто закрываем
    toast('Сохранено', 's');
    closePlanEditorFull();
  }
}

function openPlanEditorWithSverka() {
  openPlanEditor();
  initSverkaToggle();
}

function closePlanEditorFull() {
  const overlay = document.getElementById('plan-editor-overlay');
  if (overlay) { overlay.classList.remove('open'); overlay.style.display = 'none'; }
  document.body.style.overflow = '';
}
function dockSetActive(id) {
  ['home','kpi','rating','dohod','grafik','instruktsii','vizity'].forEach(k => {
    const btn = document.getElementById('dock-btn-' + k);
    if (btn) btn.classList.toggle('dock-active', k === id);
  });
}

function closeAllDockPopups() {
  ['dock-kpi-popup','dock-dohod-popup','dock-faq-popup','dock-vizity-popup'].forEach(pid => {
    document.getElementById(pid)?.classList.remove('open');
  });
}

function openDockPopup(id) {
  const isAlreadyOpen = document.getElementById(id)?.classList.contains('open');
  closeAllDockPopups();
  if (isAlreadyOpen) return; // toggle: повторный клик закрывает
  document.getElementById(id)?.classList.add('open');
}

// HOME = Отдел (для менеджеров — персональный экран)
function dockNav(id) {
  closeAllDockPopups();

  if (id === 'home') {
    const matched = findUserInSheet();
    if (matched && !isCeoLike(matched.role)) {
      goPersonal();
    } else if (matched && isCeoLike(matched.role)) {
      showScr('ceo');
      loadCeoDashboard();
    } else {
      showAccessDenied();
    }
    return;
  }

  if (id === 'rating') {
    dockSetActive('rating');
    ['otchet','dohod','grafik','instruktsii','personal','rating','vizity','ceo','analiz','trophies','profile'].forEach(t => {
      const s = document.getElementById('scr-'+t);
      if (s) s.classList.remove('on');
    });
    document.getElementById('scr-rating').classList.add('on');
    // hide floating subtabs
    const fs = document.getElementById('floating-subtabs');
    if (fs) fs.style.display = 'none';
    const fds = document.getElementById('floating-dohod-subtabs');
    if (fds) fds.style.display = 'none';
    const gs = document.getElementById('grafik-sticky');
    if (gs) gs.style.display = 'none';
    updateFirebasePage();
    loadRating();
    return;
  }

  goTab(id);
  dockSetActive(id);
}

// KPI: авто-определение роли, CEO → попап
function dockKpiToggle(e) {
  e.stopPropagation();
  openDockPopup('dock-kpi-popup');
}

function dockKpiItogi() {
  closeAllDockPopups();
  S.reportTab = 'dept';
  updateFirebasePage();
  goTab('otchet');
  dockSetActive('kpi');
}

// ==================== CEO DASHBOARD ====================

async function loadCeoDashboard() {
  const el = document.getElementById('c-ceo');
  if (!el) return;
  el.innerHTML = loader();
  try {
    const needVizity  = !S.data.vizity;
    const needDVizity = !S.data.d_vizity;
    const needPlan    = !S.data.plan;
    const needCnvrs   = !S.data.cnvrs;
    const needStavki  = !S.data.stavki;
    const needGrafik  = !S.data.grafik;
    if (needVizity || needDVizity || needPlan || needCnvrs || needStavki || needGrafik) {
      const [vd, dv, pd, cv, sd, gr] = await Promise.all([
        needVizity  ? api(SHEETS.vizity,   'A:N').catch(() => [])      : Promise.resolve(S.data.vizity),
        needDVizity ? api(SHEETS.d_vizity, 'A:N').catch(() => [])      : Promise.resolve(S.data.d_vizity),
        needPlan    ? api(SHEETS.plan,     'A:D').catch(() => [])      : Promise.resolve(S.data.plan),
        needCnvrs   ? api(SHEETS.cnvrs,    'A1:N40').catch(() => [])   : Promise.resolve(S.data.cnvrs),
        needStavki  ? api(SHEETS.stavki,   'A1:B25').catch(() => [])   : Promise.resolve(S.data.stavki),
        needGrafik  ? api(SHEETS.grafik,   'A1:AI25').catch(() => [])  : Promise.resolve(S.data.grafik),
      ]);
      if (vd?.length)  S.data.vizity   = vd;
      if (dv?.length)  S.data.d_vizity = dv;
      if (pd?.length)  S.data.plan     = pd;
      if (cv?.length)  S.data.cnvrs    = cv;
      if (sd?.length)  S.data.stavki   = sd;
      if (gr?.length)  S.data.grafik   = gr;
    }
  } catch(e) {
    if (e.message === 'auth') return;
    if (el) el.innerHTML = `<div class="err">Ошибка: ${e.message}</div>`;
    return;
  }
  renderCeoDashboard();
  loadCeoWeather();
  // Подгружаем цвета заливки колонки A у ВИЗИТЫ/Д_ВИЗИТЫ — нужны
  // чтобы исключить «запланированные но не приехавшие» визиты
  // (заливка #fee1c8) из счётчика «Без визитов сегодня».
  if (!S.data.vizityFmt || !S.data.d_vizityFmt) {
    fetchVizityFmts().then(() => {
      if (document.getElementById('scr-ceo')?.classList.contains('on')) renderCeoDashboard();
    });
  }
}

// Цвета заливки column L для ВИЗИТЫ и Д_ВИЗИТЫ — определяем «план/не приехал».
// Запрос L2:L1000 — заголовок (row 1) пропускаем; ключи карты выравниваем
// под индексы S.data.vizity (i = 1 для первой data-строки).
async function fetchVizityFmts() {
  async function _one(sheetName) {
    try {
      const range  = encodeURIComponent(`'${sheetName}'!L2:L`);
      const fields = 'sheets.data.rowData.values.userEnteredFormat.backgroundColor';
      const url    = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}`
                   + `?ranges=${range}&fields=${fields}&includeGridData=true`;
      const resp = await fetch(url, { headers: await authHeaders() });
      if (!resp.ok) return {};
      const data = await resp.json();
      const rowData = data?.sheets?.[0]?.data?.[0]?.rowData || [];
      const planned = {};
      rowData.forEach((row, ri) => {
        const bg = row?.values?.[0]?.userEnteredFormat?.backgroundColor;
        // ri=0 → sheet row 2 → S.data.vizity[1]; смещаем на +1
        if (_isPlannedColor(bg)) planned[ri + 1] = true;
      });
      return planned;
    } catch (e) { return {}; }
  }
  const [v1, v2] = await Promise.all([_one(SHEETS.vizity), _one(SHEETS.d_vizity)]);
  S.data.vizityFmt   = v1;
  S.data.d_vizityFmt = v2;
}

// Сравниваем цвет с #fee1c8 — «запланированный визит, не приехал»
function _isPlannedColor(bg) {
  if (!bg) return false;
  const r = bg.red   ?? 0;
  const g = bg.green ?? 0;
  const b = bg.blue  ?? 0;
  // #fee1c8 = 254/225/200 ≈ 0.996/0.882/0.784
  const dr = Math.abs(r - 254/255);
  const dg = Math.abs(g - 225/255);
  const db = Math.abs(b - 200/255);
  return dr < 0.04 && dg < 0.04 && db < 0.04;
}

function loadCeoWeather() {
  const lat = 56.8389, lon = 60.6057;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
  fetch(url).then(r => r.json()).then(data => {
    const temp = Math.round(data.current.temperature_2m);
    const code = data.current.weather_code;
    const txt = _cityWeatherEmoji(code) + ' ' + (temp > 0 ? '+' : '') + temp + '°';
    S._ceoWeatherCache = txt;
    const el2 = document.getElementById('ceo-weather');
    if (el2) el2.textContent = txt;
  }).catch(() => {
    if (!S._ceoWeatherCache) {
      const el2 = document.getElementById('ceo-weather');
      if (el2) el2.textContent = '';
    }
  });
}

function switchCeoLeaders(dept) {
  const prev = S.ceoLeadersDept;
  if (prev === dept) return;
  const slideOutClass = (prev === 'crm') ? 'slide-out-left' : 'slide-out-right';
  const slideInClass  = (prev === 'crm') ? 'slide-in-left'  : 'slide-in-right';
  const inner = document.getElementById('ceo-leaders-slide');
  if (!inner) { S.ceoLeadersDept = dept; renderCeoDashboard(); return; }
  inner.classList.add(slideOutClass);
  setTimeout(() => {
    S.ceoLeadersDept = dept;
    // Точечный апдейт — только блок лидеров и тумблер
    const data = _ceoComputeLeaders();
    const inn2 = document.getElementById('ceo-leaders-slide');
    const btn  = document.getElementById('ceo-leaders-toggle');
    if (inn2) {
      inn2.classList.remove(slideOutClass);
      inn2.innerHTML = `<div class="ceo-leaders-row">${data.html}</div>`;
      scheduleAnimatedValues(inn2, true);
      inn2.classList.add(slideInClass);
      requestAnimationFrame(() => inn2.classList.remove(slideInClass));
    }
    if (btn) btn.outerHTML = data.btnHtml;
  }, 220);
}

function openCeoMgrModalByName(nameLow) {
  const idx = window._ceoMgrIndex || {};
  const info = idx[nameLow];
  if (!info) return;
  if (info.isDozhim) {
    _openCeoDozhimModal(info.name);
  } else {
    _openCeoCrmModal(info.name);
  }
}

function _openCeoCrmModal(name) {
  const planData = S.data.plan || [];
  const planM = getPlanMap(planData);
  const stats = buildCrmStats(S.data.vizity || []);
  const nl = name.toLowerCase();
  const s = stats[nl] || {};
  const plan = planM[nl] || 0;
  const v800 = s.vis800 || 0, v1200 = s.vis1200 || 0;
  const allV = v800 + v1200;
  const ost = Math.max(0, plan - allV);
  const sfx = String(new Date().getMonth()+1).padStart(2,'0') + String(new Date().getFullYear()).slice(-2);
  const progNum = computeProgPct(allV, plan, sfx);
  const factNum = computeFactPct(allV, plan);
  const daily = computeDailyPlan(plan, allV, progNum, sfx, name);
  const crmCnvrs = (typeof getCnvrsRow === 'function') ? getCnvrsRow(name.toUpperCase(), 'crm') : [];
  const warmCnvrs = (typeof getCnvrsRow === 'function') ? getCnvrsRow(name.toUpperCase(), 'warm') : [];
  const genCnvrs = (typeof getCnvrsRow === 'function') ? getCnvrsRow(name.toUpperCase(), 'general') : [];
  const rs = rankStyles(0, 1);
  const data = {
    name: name.toUpperCase(), nameLow: nl,
    v800, v1200, rplan: plan, ost, prc: factNum+'%', prog: progNum+'%', allV, daily, progNum,
    kred800: s.kred800||0, nal800: s.nal800||0, td800: s.obmen800||0, kom800: s.kom800||0,
    kred1200: s.kred1200||0, nal1200: s.nal1200||0, td1200: s.obmen1200||0, kom1200: s.kom1200||0,
    zadatok: s.zadatok||0, vykup800: s.vykup800||0, vykup1200: s.vykup1200||0,
    vsalone: s.vsalone||0, vkso: s.vkso||0, vfSSP: s.vfssп||0, vbanke: s.vbanke||0, otkaz: s.otkaz||0,
    odobNeKupil: s.odobNeKupil||0, byCity: s.byCity||{},
    crmConVis: crmCnvrs[6]||'—', crmConKred: crmCnvrs[7]||'—', crmDolya: crmCnvrs[8]||'—', crmKoef: crmCnvrs[12]||'—',
    warmConVis: warmCnvrs[6]||'—', warmConKred: warmCnvrs[7]||'—', warmDolya: warmCnvrs[8]||'—', warmKoef: warmCnvrs[12]||'—',
    genConVis: genCnvrs[6]||'—', genConKred: genCnvrs[7]||'—', genDolya: genCnvrs[8]||'—', genKoef: genCnvrs[12]||'—',
    rs, idx: 1
  };
  openMopModal(JSON.stringify(data).replace(/'/g,"&#39;"));
}

function _openCeoDozhimModal(name) {
  const planData = S.data.plan || [];
  const planM = getPlanMap(planData);
  const dSalesM = (typeof getDSalesPlanMap === 'function') ? getDSalesPlanMap(planData) : {};
  const dStats = buildDozhimStats(S.data.d_vizity || []);
  const nl = name.toLowerCase();
  const s = dStats[nl] || {};
  const allVis = (s.vis800||0) + (s.vis1000||0);
  const plan = planM[nl] || 1;
  const ost = Math.max(0, plan - allVis);
  const sfx = String(new Date().getMonth()+1).padStart(2,'0') + String(new Date().getFullYear()).slice(-2);
  const progNum = computeProgPct(allVis, plan, sfx);
  const factNum = computeFactPct(allVis, plan);
  const daily = computeDailyPlan(plan, allVis, progNum, sfx, name);
  const sPlan = dSalesM[nl] || 0;
  const sFact = (s.kred800||0)+(s.nal800||0)+(s.obmen800||0)+(s.kred1000||0)+(s.nal1000||0);
  const sOst = Math.max(0, sPlan - sFact);
  const sProg = sPlan ? computeProgPct(sFact, sPlan, sfx) : 0;
  const rs = rankStyles(0, 1);
  const data = {
    type: 'dozhim', name: name.toUpperCase(), nameLow: nl,
    v800: s.vis800||0, v1000: s.vis1000||0,
    rplan: plan, ost, prc: factNum+'%', prog: progNum+'%', allV: allVis,
    kred800: s.kred800||0, nal800: s.nal800||0, obmen800: s.obmen800||0, kom800: s.kom800||0,
    kred1000: s.kred1000||0, nal1000: s.nal1000||0, kom1000: s.kom1000||0, zadatok: s.zadatok||0,
    sPlan, sFact, sOst, sProg,
    rs, idx: 1
  };
  openDozhimModal(JSON.stringify(data).replace(/'/g,"&#39;"));
}

function openCeoMgrsInPlanModal() {
  const idx = window._ceoMgrIndex || {};
  const inPlan = window._ceoMgrsInPlan || [];
  if (!inPlan.length) return;
  const items = inPlan.map(m => `
    <li class="ceo-mgrs-list-item" onclick="window._ceoMopReturnToList=true;openCeoMgrModalByName('${m.name.toLowerCase().replace(/'/g,"&#39;")}')">
      <span class="ceo-mgrs-list-name">${m.name}</span>
      <span class="ceo-mgrs-list-prog" style="color:${pctClr(m.progPct)}">${m.progPct}%</span>
    </li>`).join('');
  const body = document.getElementById('mop-modal-body');
  const title = document.getElementById('mop-modal-title');
  if (title) title.textContent = 'Менеджеры в плане';
  if (body) body.innerHTML = `<ul class="ceo-mgrs-list">${items}</ul>`;
  const overlay = document.getElementById('mop-overlay');
  if (overlay) overlay.classList.add('open');
}

function _ceoComputeLeaders() {
  const vizData = S.data.vizity || [];
  const dvData  = S.data.d_vizity || [];
  const planData = S.data.plan || [];
  const planMap = getPlanMap(planData);
  const crmStats = buildCrmStats(vizData);
  const dozhimStats = (typeof buildDozhimStats === 'function') ? buildDozhimStats(dvData) : {};
  const allPlanNames = (planData || []).slice(1).filter(r => r && r[0]).map(r => String(r[0]).trim());
  const today = new Date();
  const sfx = String(today.getMonth()+1).padStart(2,'0') + String(today.getFullYear()).slice(-2);
  function buildMgr(name, stats) {
    const nl = name.toLowerCase();
    const s = stats[nl] || {};
    const plan = planMap[nl] || 0;
    const vis = (typeof s.vis === 'number') ? s.vis : ((s.vis800 || 0) + (s.vis1200 || 0) + (s.vis1000 || 0));
    return { name, firstName: name.split(' ').slice(-1)[0] || name, progPct: computeProgPct(vis, plan, sfx) };
  }
  const crmNames = allPlanNames.filter(n => { const r = getRoleByName(n.toLowerCase().trim()); return r === 'crm' || r === ''; });
  const dozhimNames = allPlanNames.filter(n => getRoleByName(n.toLowerCase().trim()) === 'dozhim');
  const crmMgrs = crmNames.map(n => buildMgr(n, crmStats));
  const dozhimMgrs = dozhimNames.map(n => buildMgr(n, dozhimStats));
  const dept = S.ceoLeadersDept || 'crm';
  const leaders = (dept === 'crm' ? crmMgrs : dozhimMgrs)
    .filter(m => m.progPct >= 100).sort((a,b) => b.progPct - a.progPct).slice(0,3);
  const medals = ['🥇','🥈','🥉'];
  const html = leaders.length
    ? leaders.map((m,i) => {
        const c = pctClr(m.progPct);
        const nl = m.name.toLowerCase().replace(/'/g, "&#39;");
        const id = getMgrCrmId(m.name);
        const emo = getMgrAvatarEmotion(m.progPct);
        const aSrc = id ? `logos/avatar/${id}-${emo}.png` : '';
        const showAv = aSrc && (window._avatarCache?.[aSrc] !== 'fail');
        if (aSrc) _avatarPreload(aSrc);
        const avHtml = showAv ? `<img class="ceo-leader-avatar" src="${aSrc}" alt="" onerror="this.remove()">` : '';
        return `<div class="ceo-leader-badge" style="cursor:pointer" onclick="openCeoMgrModalByName('${nl}')"><span class="ceo-medal">${medals[i]}</span><div class="ceo-leader-name">${m.firstName}</div><div class="ceo-leader-prog"><span class="mv" style="color:${c} !important">${m.progPct}</span><span style="color:${c}">%</span></div>${avHtml}</div>`;
      }).join('')
    : `<div class="ceo-no-leaders">Нет менеджеров с прогнозом ≥ 100%</div>`;
  const nextDept = dept === 'crm' ? 'dozhim' : 'crm';
  const btnHtml = `<button id="ceo-leaders-toggle" class="rating-toggle-pill" onclick="switchCeoLeaders('${nextDept}')">${
    dept === 'crm'
      ? `CRM <span class="rating-toggle-arrow right"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`
      : `<span class="rating-toggle-arrow left"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11 7H3M6.5 3.5L3 7l3.5 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span> ДОЖИМ`
  }</button>`;
  return { html, btnHtml };
}

function renderCeoDashboard() {
  const el = document.getElementById('c-ceo');
  if (!el) return;

  try {

  const today = new Date();
  const dayNum = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - dayNum;
  const dd = String(dayNum).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dateShort = `${dd}.${mm}`;

  const GREETINGS = {
    1:'сегодня будет хороший день!', 2:'ты уже отлично справляешься!',
    3:'вперёд к маленьким победам!', 4:'всё получится, шаг за шагом!',
    5:'рад видеть тебя снова!', 6:'время сделать что-то классное!',
    7:'ты ближе к цели!', 8:'новый день — новые возможности!',
    9:'спокойно, у тебя всё под контролем!', 10:'сегодня можно чуть лучше!',
    11:'хороший момент начать!', 12:'мир ждёт твоих идей!',
    13:'пусть день будет лёгким!', 14:'ты умеешь удивлять!',
    15:'ещё один шаг вперёд!', 16:'настройся на хороший ритм!',
    17:'маленький прогресс тоже прогресс!', 18:'сильное начало дня!',
    19:'сделаем этот день приятным!', 20:'отличный день для роста!',
    21:'всё важное получится!', 22:'ты сегодня в ударе!',
    23:'время сиять понемногу!', 24:'пусть всё складывается удачно!',
    25:'хорошие вещи уже рядом!', 26:'ты двигаешься в верном направлении!',
    27:'день начинается отлично!', 28:'улыбнись, ты молодец!',
    29:'сегодня точно что-то получится!', 30:'главное — не останавливаться!',
    31:'добро пожаловать в продуктивность!'
  };
  const greeting = GREETINGS[dayNum] || 'отличного дня!';

  // Имя CEO из профиля — формат "Фамилия Имя Отчество"
  const matched = findUserInSheet();
  const _parts = (matched?.name || '').trim().split(/\s+/);
  const ceoFirstName = _parts.length >= 2 ? _parts[1] : (_parts[0] || 'Руководитель');

  // ---- Данные ----
  const vizData = S.data.vizity || [];
  const dvData  = S.data.d_vizity || [];
  const planData = S.data.plan || [];
  const planMap = getPlanMap(planData);

  const crmStats = buildCrmStats(vizData);
  const dozhimStats = (typeof buildDozhimStats === 'function') ? buildDozhimStats(dvData) : {};

  // Имена менеджеров из ПЛАН, фильтр по ролям
  const allPlanNames = (planData || []).slice(1).filter(r => r && r[0]).map(r => String(r[0]).trim());
  const crmNames = allPlanNames.filter(n => {
    const role = getRoleByName(n.toLowerCase().trim());
    return role === 'crm' || role === '';
  });
  const dozhimNames = allPlanNames.filter(n => {
    const role = getRoleByName(n.toLowerCase().trim());
    return role === 'dozhim';
  });

  function buildMgr(name, stats, suffix, isDozhim) {
    const nl = name.toLowerCase();
    const s = stats[nl] || {};
    const plan = planMap[nl] || 0;
    const vis = (typeof s.vis === 'number') ? s.vis : ((s.vis800 || 0) + (s.vis1200 || 0) + (s.vis1000 || 0));
    const factPct = computeFactPct(vis, plan);
    const progPct = computeProgPct(vis, plan, suffix);
    const vsalone = s.vsalone || 0;
    return { name, firstName: name.split(' ').slice(-1)[0] || name, vis, plan, factPct, progPct, vsalone, isDozhim, _stats: s };
  }

  // Текущий месяц для suffix (MMYY)
  const sfx = String(today.getMonth()+1).padStart(2,'0') + String(today.getFullYear()).slice(-2);

  const crmMgrs = crmNames.map(n => buildMgr(n, crmStats, sfx, false));
  const dozhimMgrs = dozhimNames.map(n => buildMgr(n, dozhimStats, sfx, true));

  // Карта данных по менеджерам для модалок (по nameLow)
  window._ceoMgrIndex = {};
  [...crmMgrs, ...dozhimMgrs].forEach(m => {
    window._ceoMgrIndex[m.name.toLowerCase()] = { name: m.name, isDozhim: m.isDozhim };
  });

  // ---- Агрегаты ----
  // Суммируем визиты так же, как модалка «Хронология» (getVisitsByDayAll) —
  // все строки с валидной датой и сверкой, без фильтра по принадлежности
  // менеджера к ПЛАН. Это устраняет расхождение карточек с хронологией.
  const _sumChrono = (rows) => {
    if (!Array.isArray(rows)) return 0;
    let n = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      if (!isSverkaRow(r)) continue;
      const d = parseInt(String(r[0]||'').trim().split('.')[0]);
      if (!d || d < 1) continue;
      n++;
    }
    return n;
  };
  const crmFact    = _sumChrono(vizData);
  const dozhimFact = _sumChrono(dvData);
  const crmPlanSum = crmMgrs.reduce((s,m) => s + m.plan, 0);
  const dozhimPlanSum = dozhimMgrs.reduce((s,m) => s + m.plan, 0);
  const crmProg    = computeProgPct(crmFact,    crmPlanSum,    sfx);
  const dozhimProg = computeProgPct(dozhimFact, dozhimPlanSum, sfx);

  // Всего в салоне (CRM + Дожим)
  const totalVsalone = [...crmMgrs, ...dozhimMgrs].reduce((s,m) => s + m.vsalone, 0);
  // В КСО (подает заявку + в работе КСО + на рассмотрении банка)
  const totalVkso = Object.values(crmStats).reduce((s,x) => s + (x.vkso||0), 0)
                  + Object.values(dozhimStats).reduce((s,x) => s + (x.vkso||0), 0);

  // Суммарно сделки (CRM + Дожим)
  function sumStat(field) {
    let n = 0;
    Object.values(crmStats).forEach(s => { n += (s[field] || 0); });
    Object.values(dozhimStats).forEach(s => { n += (s[field] || 0); });
    return n;
  }
  // Раздельные суммы по отделам — для подписей «CRM N / Дожим M»
  function sumCrm(...fields) {
    let n = 0;
    Object.values(crmStats).forEach(s => { fields.forEach(f => { n += (s[f] || 0); }); });
    return n;
  }
  function sumDoz(...fields) {
    let n = 0;
    Object.values(dozhimStats).forEach(s => { fields.forEach(f => { n += (s[f] || 0); }); });
    return n;
  }
  const kreditCrm = sumCrm('kred800', 'kred1200');
  const kreditDoz = sumDoz('kred800', 'kred1000');
  const nalObmCrm = sumCrm('nal800', 'nal1200', 'obmen800', 'obmen1200');
  const nalObmDoz = sumDoz('nal800', 'nal1000', 'obmen800');
  const komisCrm  = sumCrm('kom800', 'kom1200');
  const komisDoz  = sumDoz('kom800', 'kom1000');
  const totalKredit = kreditCrm + kreditDoz;
  const totalNalObm = nalObmCrm + nalObmDoz;
  const totalKomis  = komisCrm + komisDoz;

  // Менеджеры в плане
  const allMgrs = [...crmMgrs, ...dozhimMgrs];
  const mgrsInPlan = allMgrs.filter(m => m.progPct >= 100).sort((a,b) => b.progPct - a.progPct);
  window._ceoMgrsInPlan = mgrsInPlan;

  const totalFact = crmFact + dozhimFact;
  const totalPlan = crmPlanSum + dozhimPlanSum;
  const companyProg = computeProgPct(totalFact, totalPlan, sfx);
  const progColor = companyProg >= 100 ? 'var(--grn)' : companyProg >= 85 ? '#ffd60a' : 'var(--red)';

  // Динамика за сегодня (сегодня vs вчера по визитам, по обоим листам)
  const ddTodayStr = String(today.getDate()).padStart(2,'0');
  const ydayDate = new Date(today.getTime() - 24*60*60*1000);
  const ddYdayStr = String(ydayDate.getDate()).padStart(2,'0');
  function countVisitsOnDay(dayStr) {
    let n = 0;
    [vizData, dvData].forEach(rows => {
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[0]) continue;
        if (!isSverkaRow(r)) continue;
        const d = String(r[0]).trim().split('.')[0].padStart(2,'0');
        if (d === dayStr) n++;
      }
    });
    return n;
  }
  const visitsToday = countVisitsOnDay(ddTodayStr);
  const visitsYday  = countVisitsOnDay(ddYdayStr);
  const dynamicsPct = visitsYday > 0 ? Math.round((visitsToday - visitsYday) / visitsYday * 100) : (visitsToday > 0 ? 100 : 0);
  const dynamicsArrow = visitsToday > visitsYday ? '↑' : (visitsToday < visitsYday ? '↓' : '→');
  const dynamicsColor = visitsToday > visitsYday ? 'var(--grn)' : (visitsToday < visitsYday ? 'var(--red)' : 'var(--txt2)');

  // Прогноз выполнения к концу дня
  const hourNow = today.getHours() + today.getMinutes()/60;
  const workStart = 9, workEnd = 18;
  const dayFraction = Math.max(0.01, Math.min(1, (hourNow - workStart) / (workEnd - workStart)));
  const visitsEod = dayFraction > 0 ? Math.round(visitsToday / dayFraction) : visitsToday;
  const factEod = totalFact - visitsToday + visitsEod;
  const eodProg = totalPlan > 0 ? Math.round((factEod / totalPlan) * (daysInMonth / dayNum) * 100) : 0;
  const eodColor = eodProg >= 100 ? 'var(--grn)' : eodProg >= 85 ? '#ffd60a' : 'var(--red)';

  // ===== ROP DOXOD =====
  const ROP_OKLAD = 250000;
  const ROP_DOPLATA = 100000;
  const isRop = (matched?.role || '').toLowerCase().trim() === 'rop' ||
                (matched?.role || '').toLowerCase().trim() === 'роп';
  const ropPlan = crmPlanSum * 0.8;
  const ropFactPct = ropPlan > 0 ? Math.round((crmFact / ropPlan) * 100) : 0;
  const ropProgPct = computeProgPct(crmFact, ropPlan, sfx);
  function ropKoefFn(p) {
    if (p < 100) return 0.8;
    if (p < 120) return 1.0;
    if (p < 130) return 1.2;
    return 1.3;
  }
  const ropKoef = ropKoefFn(ropProgPct);
  // Коэффициент применяется к сумме (оклад + доплата за Дожим)
  const ropIncomeBase = ROP_OKLAD + ROP_DOPLATA;
  const ropIncomeTotal = ropIncomeBase * ropKoef;
  const ropIncognito = localStorage.getItem('crm_incognito') === '1';
  window._ropIncomeData = { oklad: ROP_OKLAD, doplata: ROP_DOPLATA, koef: ropKoef, base: ropIncomeBase, total: ropIncomeTotal, factPct: ropFactPct, progPct: ropProgPct, ropPlan, crmFact, crmPlanSum };

  // Тренд по дням до текущего: визиты за каждый день месяца
  function dailyVisits(scope) {
    const arr = new Array(dayNum).fill(0);
    const lists = scope === 'crm' ? [vizData] : scope === 'dozhim' ? [dvData] : [vizData, dvData];
    lists.forEach(rows => {
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[0]) continue;
        if (!isSverkaRow(r)) continue;
        const d = parseInt(String(r[0]).trim().split('.')[0]);
        if (d >= 1 && d <= dayNum) arr[d-1]++;
      }
    });
    return arr;
  }
  const trendAll = dailyVisits('all');
  const trendCrm = dailyVisits('crm');
  const trendDoz = dailyVisits('dozhim');

  // Дельта сегодня vs вчера для каждого scope
  function deltaForScope(scope) {
    const arr = dailyVisits(scope);
    const today = arr[arr.length - 1] || 0;
    const yday  = arr[arr.length - 2] || 0;
    return today - yday;
  }
  const deltaAll = deltaForScope('all');
  const deltaCrm = deltaForScope('crm');
  const deltaDoz = deltaForScope('dozhim');

  function deltaBadge(delta, label = '') {
    const lbl = label ? `${label}: ` : '';
    const tip = delta === 0
      ? `${lbl}столько же, как вчера`
      : delta > 0
        ? `${lbl}на ${delta} больше, чем вчера`
        : `${lbl}на ${Math.abs(delta)} меньше, чем вчера`;
    const safe = tip.replace(/"/g, '&quot;');
    if (delta > 0) return `<span class="ceo-card-delta up" title="${safe}">↑+${delta}</span>`;
    if (delta < 0) return `<span class="ceo-card-delta down" title="${safe}">↓${delta}</span>`;
    return `<span class="ceo-card-delta zero" title="${safe}">→ 0</span>`;
  }

  // Дельта сделок по типу за сегодня vs вчера
  function dealDeltaByDay(matcher) {
    let today = 0, yday = 0;
    [vizData, dvData].forEach(rows => {
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[0]) continue;
        if (!isSverkaRow(r)) continue;
        const status = String(r[4]||'').trim().toLowerCase();
        if (!matcher(status)) continue;
        const d = String(r[0]).trim().split('.')[0].padStart(2,'0');
        if (d === ddTodayStr) today++;
        else if (d === ddYdayStr) yday++;
      }
    });
    return today - yday;
  }
  const deltaKredit = dealDeltaByDay(s => s === 'покупка (кредит)');
  const deltaNalObm = dealDeltaByDay(s => s === 'покупка (наличные)' || s === 'обмен');
  const deltaKomis  = dealDeltaByDay(s => s === 'комиссия');

  function sparkline(values, color, idSuffix) {
    if (!values.length) return '';
    const w = 100, h = 28;
    const max = Math.max(1, ...values);
    const stepX = values.length > 1 ? w / (values.length - 1) : w;
    const pts = values.map((v, i) => [i * stepX, h - 2 - (v / max) * (h - 4)]);

    // Сглаживание Catmull-Rom → bezier cubics
    function smoothPath(pts) {
      if (pts.length < 2) return '';
      if (pts.length === 2) return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)} L${pts[1][0].toFixed(1)},${pts[1][1].toFixed(1)}`;
      const tension = 0.35;
      let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] || p2;
        const cp1x = p1[0] + (p2[0] - p0[0]) * tension * 0.5;
        const cp1y = p1[1] + (p2[1] - p0[1]) * tension * 0.5;
        const cp2x = p2[0] - (p3[0] - p1[0]) * tension * 0.5;
        const cp2y = p2[1] - (p3[1] - p1[1]) * tension * 0.5;
        d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
      }
      return d;
    }
    const linePath = smoothPath(pts);
    const areaPath = linePath + ` L ${w} ${h} L 0 ${h} Z`;
    const gid = `spark-grad-${idSuffix}`;
    return `<svg class="ceo-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="${h}">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.35"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      <path d="${areaPath}" fill="url(#${gid})"/>
      <path d="${linePath}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  // Лидеры (прогноз >= 100)
  const crmLeaders = [...crmMgrs].filter(m => m.progPct >= 100).sort((a,b) => b.progPct - a.progPct).slice(0,3);
  const dozhimLeaders = [...dozhimMgrs].filter(m => m.progPct >= 100).sort((a,b) => b.progPct - a.progPct).slice(0,3);
  const medals = ['🥇','🥈','🥉'];

  const activeLeadersDept = S.ceoLeadersDept || 'crm';
  const activeLeaders = activeLeadersDept === 'crm' ? crmLeaders : dozhimLeaders;
  const nextLeadersDept = activeLeadersDept === 'crm' ? 'dozhim' : 'crm';

  function leaderAvatarImg(name, progNum) {
    const id = getMgrCrmId(name);
    if (!id) return '';
    const emo = getMgrAvatarEmotion(progNum);
    const src = `logos/avatar/${id}-${emo}.png`;
    if (window._avatarCache && window._avatarCache[src] === 'fail') return '';
    _avatarPreload(src);
    return `<img class="ceo-leader-avatar" src="${src}" alt="" onerror="this.remove()">`;
  }

  function leaderBadge(leaders) {
    if (!leaders.length) return `<div class="ceo-no-leaders">Нет менеджеров с прогнозом ≥ 100%</div>`;
    return leaders.map((m, i) => {
      const c = pctClr(m.progPct);
      const nl = m.name.toLowerCase().replace(/'/g, "&#39;");
      return `
      <div class="ceo-leader-badge" style="cursor:pointer" onclick="openCeoMgrModalByName('${nl}')">
        <span class="ceo-medal">${medals[i]}</span>
        <div class="ceo-leader-name">${m.firstName}</div>
        <div class="ceo-leader-prog"><span class="mv" style="color:${c} !important">${m.progPct}</span><span style="color:${c}">%</span></div>
        ${leaderAvatarImg(m.name, m.progPct)}
      </div>`;
    }).join('');
  }

  // Алерты — с кликабельными именами.
  // Считаем визиты сегодня по каждому менеджеру (раздельно по обоим листам).
  // Строки с заливкой ячейки даты #fee1c8 — это «план/не приехал», их не учитываем.
  const _today_dd = today.getDate();
  const _plannedFmt = [S.data.vizityFmt || {}, S.data.d_vizityFmt || {}];
  function _visitsTodayForMgr(name) {
    const nl = String(name).toLowerCase();
    let n = 0;
    [vizData, dvData].forEach((rows, srcIdx) => {
      const planned = _plannedFmt[srcIdx] || {};
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[8]) continue;
        if (!isSverkaRow(r)) continue;
        if (String(r[8]).toLowerCase().trim() !== nl) continue;
        if (planned[i]) continue; // запланирован, по факту не приехал — пропускаем
        const d = parseInt(String(r[0]||'').trim().split('.')[0]);
        if (d === _today_dd) n++;
      }
    });
    return n;
  }
  // Индекс графика — чтобы исключить из алерта тех, у кого сегодня «В» (выходной)
  const _grafikIdx = (S.data.grafik && S.data.grafik.length >= 3)
    ? (function() { try { return buildSchedIndex(S.data.grafik); } catch (_) { return {}; } })()
    : {};
  function _isOffToday(name) {
    const entry = _grafikIdx[String(name).toLowerCase()];
    if (!entry) return false; // нет в графике — не считаем что выходной
    const { row: mgrRow, daysRow } = entry;
    const day = _today_dd;
    for (let c = 1; c < daysRow.length; c++) {
      if (parseInt(daysRow[c]) === day) {
        const v = normalizeSchedVal(mgrRow[c]);
        return v === 'В' || v === 'О' || v === ''; // выходной / отпуск / пустая
      }
    }
    return false;
  }
  // «Без визитов сегодня» — у кого 0 визитов сегодня, в этом месяце
  // визиты были (активный), И сегодня в смене «Р» (не выходной).
  const noVisitsTodayList = [...crmMgrs, ...dozhimMgrs]
    .filter(m => m.vis > 0 && !_isOffToday(m.name) && _visitsTodayForMgr(m.name) === 0);
  // «Низкий прогноз» — прогноз меньше 50% (явно отстают от плана)
  const lowProgList = [...crmMgrs, ...dozhimMgrs]
    .filter(m => m.plan > 0 && m.progPct > 0 && m.progPct < 50);
  // «На грани плана» — 85–99% (нужен ещё небольшой толчок)
  const onEdgeList = [...crmMgrs, ...dozhimMgrs]
    .filter(m => m.progPct >= 85 && m.progPct < 100);

  const _clickMgr = m => `<span class="ceo-alert-name" onclick="openCeoMgrModalByName('${m.name.toLowerCase().replace(/'/g,"&#39;")}')">${m.firstName} <strong>${m.progPct}%</strong></span>`;
  const noVisitsToday = noVisitsTodayList.map(_clickMgr);
  const lowProg       = lowProgList.map(_clickMgr);
  const onEdge        = onEdgeList.map(_clickMgr);

  // accent rgb
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#5137dd';
  const accR = parseInt(accent.slice(1,3),16) || 81;
  const accG = parseInt(accent.slice(3,5),16) || 55;
  const accB = parseInt(accent.slice(5,7),16) || 221;

  const cachedWeather = S._ceoWeatherCache || '';
  setLiveHTML(el, `
    <div class="ceo-dash">

      <!-- HEADER -->
      <div class="ceo-header">
        <div class="ceo-greeting">
          ${ceoFirstName}, ${greeting}
        </div>
        <div class="ceo-header-right">
          <div class="ceo-date-weather">
            <span class="ceo-date">${dateShort}</span>
            <span id="ceo-weather" class="ceo-weather">${cachedWeather || '…'}</span>
          </div>
          <div class="ceo-days-left">остаток <strong>${daysLeft}</strong> д.</div>
        </div>
      </div>

      ${isRop ? `
      <!-- ДОХОД ROP (под схлопом, по умолчанию свёрнут) -->
      <details class="rop-income-spoiler">
        <summary class="rop-income-summary">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          <span class="sec-title" style="margin:0;display:inline">Доход</span>
        </summary>
        <div class="kpi-income-panel ceo-rop-panel ${ropIncognito ? 'kpi-incognito' : ''}" style="background:rgba(${accR},${accG},${accB},0.15);position:relative">
          <button class="ceo-metric-info-btn" onclick="event.stopPropagation();openRopIncomeModal()" title="Схема премирования">!</button>
          <button class="kpi-incognito-btn ceo-rop-incognito-btn" onclick="event.stopPropagation();toggleIncognitoCeo()" title="Скрыть доход (или потряси телефон)">${ropIncognito ? '👁' : '🙈'}</button>
          <div class="ceo-rop-total mv">${fmtRub(ropIncomeTotal)}</div>
          <div class="ceo-rop-formula">
            <span class="ceo-rop-dim">(</span>
            <span>${fmtRub(ROP_OKLAD)}</span>
            <span class="ceo-rop-dim">+</span>
            <span>${fmtRub(ROP_DOPLATA)}</span>
            <span class="ceo-rop-dim">)</span>
            <span class="ceo-rop-dim">×</span>
            <span style="color:${pctClr(ropProgPct)}">${ropKoef.toFixed(2)}</span>
          </div>
          <div class="ceo-rop-sub">прогноз CRM: <strong style="color:${pctClr(ropProgPct)}">${ropProgPct}%</strong> · план ROP <strong>${Math.round(ropPlan)}</strong> виз.</div>
        </div>
      </details>` : ''}

      <!-- ТЕКУЩИЙ KPI -->
      <div class="sec-title">Текущий KPI <span style="font-size:9px;color:var(--txt3);font-weight:600;letter-spacing:0.04em">· CRM</span></div>
      ${(() => {
        const _fact = crmFact;
        const _plan = crmPlanSum;
        const _prog = crmProg;
        const _progColor = _prog >= 100 ? 'var(--grn)' : _prog >= 85 ? '#ffd60a' : 'var(--red)';
        return `
      <div class="kpi-income-panel ceo-forecast-panel" style="background:rgba(${accR},${accG},${accB},0.15);position:relative">
        ${getMgrAvatarHtml ? getMgrAvatarHtml(matched?.name || '', _prog) : ''}
        <div class="ceo-forecast-body">
          <div class="ceo-speedo">
            <svg viewBox="-10 -10 220 220">
              <path class="base-path" d="M 40 160 A 85 85 0 1 1 160 160"/>
              <path id="ceo-speed-progress" class="ceo-speed-progress" stroke="url(#ceoSpeedGradientGlobal)" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${Math.max(0, 1 - Math.min(_prog/100, 1))}" d="M 40 160 A 85 85 0 1 1 160 160"/>
            </svg>
            <div class="ceo-speedo-value mv avatar-trigger">${_prog}%</div>
          </div>
          <div class="ceo-forecast-info">
            <div class="ceo-forecast-sub"><span class="mv">${_fact}</span> из <span>${_plan||'—'}</span> визитов</div>
            <div class="ceo-mini-badges">
              <div class="ceo-mini-badge">
                <div class="ceo-mini-lbl">Динамика за сегодня</div>
                <div class="ceo-mini-val">
                  <span style="color:${dynamicsColor}">${dynamicsArrow}</span> <span class="mv">${Math.abs(dynamicsPct)}</span>%
                </div>
                <div class="ceo-mini-sub">к вчера</div>
              </div>
              <div class="ceo-mini-badge ceo-mini-badge-eod">
                <div class="ceo-mini-lbl">Прогноз выполнения</div>
                <div class="ceo-mini-val">
                  <span class="mv" style="color:${eodColor} !important">${eodProg}</span><span style="color:${eodColor}">%</span>
                </div>
                <div class="ceo-mini-sub">к концу дня</div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
      })()}

      <!-- МЕТРИКИ -->
      <div class="sec-title">Ключевые показатели</div>
      <div class="ceo-metrics-grid">
        <!-- Row 1: Итого, CRM, Дожим -->
        <div class="ceo-metric-card ceo-clickable" onclick="openVisitsDayModalAll(null)">
          ${deltaBadge(deltaAll, 'Визиты')}
          <div class="ceo-metric-lbl">Итого</div>
          <div class="ceo-metric-val"><span class="mv">${totalFact}</span> <span class="ceo-metric-plan">/ ${totalPlan||'—'}</span></div>
          <div class="ceo-progress-bar"><div class="ceo-progress-fill" style="width:${Math.min(100, totalPlan ? Math.round(totalFact/totalPlan*100) : 0)}%;background:${pctClr(companyProg)}"></div></div>
          <div class="ceo-metric-pct">прогноз <span class="mv" style="color:${pctClr(companyProg)} !important">${companyProg}</span><span style="color:${pctClr(companyProg)}">%</span></div>
          ${sparkline(trendAll, pctClr(companyProg), 'all')}
        </div>
        <div class="ceo-metric-card ceo-clickable" onclick="openVisitsDayModalAll(false)">
          ${deltaBadge(deltaCrm, 'Визиты CRM')}
          <div class="ceo-metric-lbl">CRM</div>
          <div class="ceo-metric-val"><span class="mv">${crmFact}</span> <span class="ceo-metric-plan">/ ${crmPlanSum||'—'}</span></div>
          <div class="ceo-progress-bar"><div class="ceo-progress-fill" style="width:${Math.min(100, crmPlanSum ? Math.round(crmFact/crmPlanSum*100) : 0)}%;background:${pctClr(crmProg)}"></div></div>
          <div class="ceo-metric-pct">прогноз <span class="mv" style="color:${pctClr(crmProg)} !important">${crmProg}</span><span style="color:${pctClr(crmProg)}">%</span></div>
          ${sparkline(trendCrm, pctClr(crmProg), 'crm')}
        </div>
        <div class="ceo-metric-card ceo-clickable" onclick="openVisitsDayModalAll(true)">
          ${deltaBadge(deltaDoz, 'Визиты Дожим')}
          <div class="ceo-metric-lbl">Дожим</div>
          <div class="ceo-metric-val"><span class="mv">${dozhimFact}</span> <span class="ceo-metric-plan">/ ${dozhimPlanSum||'—'}</span></div>
          <div class="ceo-progress-bar"><div class="ceo-progress-fill" style="width:${Math.min(100, dozhimPlanSum ? Math.round(dozhimFact/dozhimPlanSum*100) : 0)}%;background:${pctClr(dozhimProg)}"></div></div>
          <div class="ceo-metric-pct">прогноз <span class="mv" style="color:${pctClr(dozhimProg)} !important">${dozhimProg}</span><span style="color:${pctClr(dozhimProg)}">%</span></div>
          ${sparkline(trendDoz, pctClr(dozhimProg), 'doz')}
        </div>

        <!-- Row 2: Кредиты, Нал+Обмен, Комиссия -->
        <div class="ceo-metric-card ceo-clickable" onclick="openCeoDealsModal('kredit')">
          ${deltaBadge(deltaKredit, 'Кредиты')}
          <div class="ceo-metric-lbl">Кредиты</div>
          <div class="ceo-metric-val mv" style="color:var(--txt)">${totalKredit}</div>
          <div class="ceo-metric-sub">${kreditCrm}/${kreditDoz} (CRM/Дожим)</div>
        </div>
        <div class="ceo-metric-card ceo-clickable" onclick="openCeoDealsModal('nalobm')">
          ${deltaBadge(deltaNalObm, 'Нал+Обмен')}
          <div class="ceo-metric-lbl">Нал+Обмен</div>
          <div class="ceo-metric-val mv" style="color:var(--txt)">${totalNalObm}</div>
          <div class="ceo-metric-sub">${nalObmCrm}/${nalObmDoz} (CRM/Дожим)</div>
        </div>
        <div class="ceo-metric-card ceo-clickable" onclick="openCeoDealsModal('komis')">
          ${deltaBadge(deltaKomis, 'Комиссия')}
          <div class="ceo-metric-lbl">Комиссия</div>
          <div class="ceo-metric-val mv" style="color:var(--txt)">${totalKomis}</div>
          <div class="ceo-metric-sub">${komisCrm}/${komisDoz} (CRM/Дожим)</div>
        </div>
      </div>

      <!-- Row 3: К цели, В салоне, В КСО -->
      <div class="ceo-metrics-grid" style="margin-top:8px">
        <div class="ceo-metric-card ceo-clickable" onclick="openCeoMgrsInPlanModal()">
          <div class="ceo-metric-lbl">К цели</div>
          <div class="ceo-metric-val mv" style="color:var(--txt)">${mgrsInPlan.length}</div>
          <div class="ceo-metric-sub">из ${allMgrs.length}</div>
        </div>
        <div class="ceo-metric-card ceo-clickable${totalVsalone > 0 ? ' ceo-salon-alarm' : ''}" onclick="openCeoSalonModal()">
          <div class="ceo-metric-lbl">В салоне</div>
          <div class="ceo-metric-val mv" style="color:var(--txt)">${totalVsalone}</div>
          <div class="ceo-metric-sub">${totalVsalone > 0 ? 'клиентов сейчас' : 'никого нет'}</div>
        </div>
        <div class="ceo-metric-card ceo-clickable ceo-kso-fill" onclick="openCeoKsoModal()">
          <div class="ceo-metric-lbl">В КСО</div>
          <div class="ceo-metric-val mv" style="color:var(--txt)">${totalVkso}</div>
          <div class="ceo-metric-sub">заявок в банках</div>
        </div>
      </div>

      <!-- ЛИДЕРЫ -->
      <div class="ceo-leaders-hdr">
        <div class="sec-title" style="margin:0">Лидеры</div>
        <button id="ceo-leaders-toggle" class="rating-toggle-pill" onclick="switchCeoLeaders('${nextLeadersDept}')">
          ${activeLeadersDept === 'crm'
            ? `CRM <span class="rating-toggle-arrow right"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`
            : `<span class="rating-toggle-arrow left"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11 7H3M6.5 3.5L3 7l3.5 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span> ДОЖИМ`}
        </button>
      </div>
      <div class="rating-slide-wrap">
        <div class="rating-slide-inner" id="ceo-leaders-slide">
          <div class="ceo-leaders-row">${leaderBadge(activeLeaders)}</div>
        </div>
      </div>

      <!-- АЛЕРТЫ -->
      <div class="sec-title" style="margin-top:18px">Внимание</div>
      <div class="ceo-alerts">
        ${noVisitsToday.length ? `<div class="ceo-alert ceo-alert-red"><span class="ceo-alert-icon">🔴</span><div><div class="ceo-alert-title">Без визитов сегодня</div><div class="ceo-alert-sub">${noVisitsToday.join(' ')}</div></div></div>` : ''}
        ${lowProg.length ? `<div class="ceo-alert ceo-alert-red"><span class="ceo-alert-icon">⚠️</span><div><div class="ceo-alert-title">Прогноз ниже 50%</div><div class="ceo-alert-sub">${lowProg.join(' ')}</div></div></div>` : ''}
        ${onEdge.length ? `<div class="ceo-alert ceo-alert-yellow"><span class="ceo-alert-icon">📊</span><div><div class="ceo-alert-title">На грани плана (85–99%)</div><div class="ceo-alert-sub">${onEdge.join(' ')}</div></div></div>` : ''}
        ${!noVisitsToday.length && !lowProg.length && !onEdgeList.length ? `<div class="ceo-alert-ok">✅ Всё в порядке</div>` : ''}
      </div>

    </div>`);

  // Анимация/восстановление аватара после каждого рендера
  requestAnimationFrame(() => ceoAvatarInitOnRender());

  // Спидометр: на первом рендере анимируем dashoffset от 1 (пусто) к нужному значению
  requestAnimationFrame(() => {
    const path = document.getElementById('ceo-speed-progress');
    if (!path) return;
    const targetOffset = Math.max(0, 1 - Math.min(companyProg/100, 1));
    if (path.dataset.animated === '1') {
      path.setAttribute('stroke-dashoffset', String(targetOffset));
      return;
    }
    // Стартуем с 1 (пусто), затем через rAF меняем — сработает CSS transition
    path.setAttribute('stroke-dashoffset', '1');
    requestAnimationFrame(() => {
      path.setAttribute('stroke-dashoffset', String(targetOffset));
      path.dataset.animated = '1';
    });
  });

  } catch(e) {
    console.error('CEO dashboard render error:', e);
    el.innerHTML = `<div class="err">Ошибка рендера CEO: ${e.message}</div>`;
  }
}

// ==================== END CEO DASHBOARD ====================

function dockKpi(dept) {
  closeAllDockPopups();
  S.reportTab = dept === 'dozhim' ? 'dozhim' : 'mgr';
  updateFirebasePage();
  goTab('otchet');
  dockSetActive('kpi');
  // Если дожим и нет данных — loadTab это обработает через setReportTab
  if (dept === 'dozhim' && !S.data.d_vizity) {
    setReportTab('dozhim');
  }
}

// ДОХОД: менеджер → прямо, CEO → попап
function dockDohodToggle(e) {
  e.stopPropagation();
  const matched = findUserInSheet();
  if (!matched || !isCeoLike(matched.role)) {
    closeAllDockPopups();
    goTab('dohod');
    dockSetActive('dohod');
    return;
  }
  openDockPopup('dock-dohod-popup');
}

function dockDohod(dept) {
  closeAllDockPopups();
  S.dohodTab = dept;
  updateFirebasePage();
  goTab('dohod');
  dockSetActive('dohod');
}

// Закрываем попапы при клике вне дока
document.addEventListener('click', (e) => {
  if (!e.target.closest('#main-dock')) closeAllDockPopups();
});

// ==================== RATING SCREEN ====================
async function loadRating() {
  const el = document.getElementById('c-rating');
  if (!el) return;

  // Подтягиваем трофеи в фоне — нужно для бейджа кол-ва в карточках
  try { loadTrophiesCatalog(); } catch(_) {}
  try { await loadTrophyAwards(); } catch(_) {}

  const matched = findUserInSheet();
  const role = matched?.role || 'crm';
  const isCeo = isCeoLike(role);

  // Определяем какой отдел показывать
  // S.ratingDept: 'crm' | 'dozhim' (только для CEO)
  if (!S.ratingDept) S.ratingDept = isCeo ? 'crm' : role === 'dozhim' ? 'dozhim' : 'crm';
  updateFirebasePage();

  if (!S.data.vizity || !S.data.plan) {
    el.innerHTML = loader();
    try {
      const [vd, pd, sd] = await Promise.all([
        S.data.vizity  ? Promise.resolve(S.data.vizity)  : api(SHEETS.vizity,  'A:N'),
        S.data.plan    ? Promise.resolve(S.data.plan)    : api(SHEETS.plan,    'A:D'),
        S.data.stavki  ? Promise.resolve(S.data.stavki)  : api(SHEETS.stavki,  'A1:B25').catch(()=>[]),
      ]);
      S.data.vizity = vd; S.data.plan = pd; S.data.stavki = sd;
    } catch(e) {
      if (e.message !== 'auth') el.innerHTML = `<div class="err">Ошибка: ${e.message}</div>`;
      return;
    }
  } else if (!S.data.stavki) {
    try { S.data.stavki = await api(SHEETS.stavki, 'A1:B25'); } catch(e) { S.data.stavki = []; }
  }
  if (S.ratingDept === 'dozhim' && !S.data.d_vizity) {
    el.innerHTML = loader();
    try {
      const [dv, ds] = await Promise.all([
        api(SHEETS.d_vizity, 'A:N'),
        S.data.d_stavki ? Promise.resolve(S.data.d_stavki) : api(SHEETS.d_stavki, 'A1:B25').catch(()=>[]),
      ]);
      S.data.d_vizity = dv; S.data.d_stavki = ds;
    } catch(e) { S.data.d_vizity = []; }
  } else if (S.ratingDept === 'dozhim' && !S.data.d_stavki) {
    try { S.data.d_stavki = await api(SHEETS.d_stavki, 'A1:B25'); } catch(e) { S.data.d_stavki = []; }
  }
  renderRating();
}

function renderRating() {
  const el = document.getElementById('c-rating');
  if (!el) return;
  const matched = findUserInSheet();
  const isCeo = isCeoLike(matched?.role);
  const dept = S.ratingDept || 'crm';

  const isLight = document.body.classList.contains('light') || document.body.classList.contains('tiffany');
  const planData = S.data.plan || [];
  const planM    = getPlanMap(planData);

  // Собираем данные по выбранному отделу
  let managers = [];
  if (dept === 'dozhim') {
    const dStats = buildDozhimStats(S.data.d_vizity || []);
    managers = planData.slice(1)
      .filter(r => r && r[0] && getRoleByName(String(r[0]).trim().toLowerCase()) === 'dozhim')
      .map(r => {
        const name = String(r[0]).trim();
        const nl   = name.toLowerCase();
        const s    = dStats[nl] || {};
        const vis  = (s.vis800||0) + (s.vis1000||0);
        const plan = planM[nl] || 0;
        const kred = (s.kred800||0) + (s.kred1000||0);
        const nal  = (s.nal800||0)  + (s.nal1000||0);
        const kom  = (s.kom800||0)  + (s.kom1000||0);
        return { name, vis, plan, kred, nal, kom,
          progNum: computeProgPct(vis, plan||1, currentSuffix),
          factNum: computeFactPct(vis, plan||1) };
      });
  } else {
    const crmStats = buildCrmStats(S.data.vizity || []);
    managers = planData.slice(1)
      .filter(r => r && r[0] && (getRoleByName(String(r[0]).trim().toLowerCase()) === 'crm' || getRoleByName(String(r[0]).trim().toLowerCase()) === ''))
      .map(r => {
        const name = String(r[0]).trim();
        const nl   = name.toLowerCase();
        const s    = crmStats[nl] || {};
        const vis  = (s.vis800||0) + (s.vis1200||0);
        const plan = planM[nl] || 0;
        const kred = (s.kred800||0) + (s.kred1200||0);
        const nal  = (s.nal800||0)  + (s.nal1200||0);
        const kom  = (s.kom800||0)  + (s.kom1200||0);
        return { name, vis, plan, kred, nal, kom,
          progNum: computeProgPct(vis, plan||1, currentSuffix),
          factNum: computeFactPct(vis, plan||1) };
      });
  }

  managers.sort((a, b) => b.progNum - a.progNum);
  const allManagers = [...managers];
  managers = managers.filter(m => m.vis > 0 || m.plan > 0);
  if (!managers.length) managers = allManagers;
  const total    = managers.length;
  const totalVis  = managers.reduce((s, m) => s + m.vis, 0);
  const totalPlan = managers.reduce((s, m) => s + m.plan, 0);
  const avgProg   = total > 0 ? Math.round(managers.reduce((s,m) => s+m.progNum,0)/total) : 0;
  const maxProg   = total > 0 ? Math.max(...managers.map(m => m.progNum)) : 1;

  const myName = (matched?.name || '').toLowerCase();

  // Доход менеджера (CRM only — dozhim calcSalaryDozhimFromVizity)
  function getMgrSalary(nameLow) {
    try {
      let sal;
      if (dept === 'dozhim') {
        sal = calcSalaryDozhimFromVizity(nameLow);
        return sal ? Math.round(sal.fact.total) : null;
      }
      sal = calcSalary(nameLow);
      return sal ? Math.round(sal.fact.total) : null;
    } catch(e) { return null; }
  }

  function blurSalary(v) {
    const s = String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `<span style="filter:blur(4px);user-select:none;-webkit-user-select:none;pointer-events:none;letter-spacing:1px;color:var(--txt3)">${s} ₽</span>`;
  }

  // Toggle для CEO — единый тумблер
  const nextDept = dept === 'crm' ? 'dozhim' : 'crm';
  const deptToggle = isCeo ? `
    <button class="rating-toggle-pill" onclick="switchRatingDept('${nextDept}')">
      ${dept === 'crm'
        ? `CRM <span class="rating-toggle-arrow right"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`
        : `<span class="rating-toggle-arrow left"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11 7H3M6.5 3.5L3 7l3.5 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span> ДОЖИМ`
      }
    </button>` : `<div style="font-family:'Unbounded',sans-serif;font-size:9px;font-weight:800;letter-spacing:.1em;color:var(--txt3)">${dept === 'dozhim' ? 'ДОЖИМ' : 'CRM'}</div>`;

  const summaryHTML = `
    <div class="rating-summary">
      <div class="rating-sum-cell">
        <div class="rating-sum-lbl">План</div>
        <div class="rating-sum-val">${totalPlan || '—'}</div>
      </div>
      <div class="rating-sum-cell rating-sum-visits">
        <div class="rating-sum-lbl">Визиты</div>
        <div class="rating-sum-val accent">${totalVis || '—'}</div>
      </div>
      <div class="rating-sum-cell">
        <div class="rating-sum-lbl">Прогноз</div>
        <div class="rating-sum-val" style="color:${pctClr(avgProg)}">${avgProg}%</div>
      </div>
    </div>`;

  function getMgrLinks(nameLow) {
    if (!S.usersData) return { tg: null, max: null };
    for (let i = 1; i < S.usersData.length; i++) {
      const row = S.usersData[i];
      if ((row[1]||'').toLowerCase().trim() === nameLow) {
        return { tg: (row[7]||'').trim() || null, max: (row[8]||'').trim() || null };
      }
    }
    return { tg: null, max: null };
  }

  function messengerIcons(links, mgrName) {
    let html = '';
    if (links.tg) html += `<a href="${links.tg}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Telegram" style="display:inline-flex;text-decoration:none;opacity:0.6;transition:opacity .15s" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'"><svg width="20" height="20" viewBox="0 0 24 24" fill="#2CA5E0"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8l-1.68 7.93c-.12.55-.44.69-.9.43l-2.48-1.83-1.2 1.16c-.13.13-.25.25-.5.25l.18-2.52 4.56-4.12c.2-.18-.04-.27-.3-.1L7.92 14.45l-2.42-.75c-.52-.17-.53-.52.11-.77l9.48-3.66c.43-.16.82.11.55.53z"/></svg></a>`;
    if (links.max) html += `<a href="${links.max}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="MAX" class="max-icon-link" style="display:inline-flex;text-decoration:none;margin-left:2px">${maxIconSvg(18)}</a>`;
    if (mgrName && typeof _profileTriggerIconHtml === 'function') html += _profileTriggerIconHtml(mgrName);
    return html ? `<span style="display:inline-flex;align-items:center;gap:3px;margin-left:5px">${html}</span>` : '';
  }
  const rankColors = [
    { strip:'#FFD700', stripEnd:'rgba(255,215,0,0)', bg:'rgba(255,215,0,0.12)', num:'rgba(255,215,0,0.2)', numTxt:'#FFD700' },
    { strip:'#C0C0C0', stripEnd:'rgba(192,192,192,0)', bg:'rgba(192,192,192,0.08)', num:'rgba(192,192,192,0.15)', numTxt:'#C0C0C0' },
    { strip:'#cd7f32', stripEnd:'rgba(205,127,50,0)',  bg:'rgba(205,127,50,0.08)', num:'rgba(205,127,50,0.15)', numTxt:'#cd7f32' },
  ];

  const rand = (a, b) => Math.round(a + Math.random() * (b - a));
  function randomizeRatingPetals(card) {
    const rect = card.getBoundingClientRect();
    const w = Math.max(rect.width || 320, 260);
    const h = Math.max(rect.height || 120, 96);
    card.querySelectorAll('.rating-petal').forEach((p, i) => {
      const nearRight = i < 7;
      const mid = i >= 7 && i < 13;
      const late = i >= 13;
      const endX = nearRight ? rand(-10, -w * .32) : mid ? rand(-w * .26, -w * .62) : rand(-w * .48, -w * .88);
      const endY = nearRight ? rand(h * .56, h * .96) : mid ? rand(h * .48, h * .94) : rand(h * .38, h * .84);
      const gust = rand(-80, 70);
      const sag = rand(18, 46);
      const size = rand(11, 22);
      const ratio = 1.38 + Math.random() * .25;
      const sc = (rand(72, 126) / 100).toFixed(2);
      p.style.width = size + 'px';
      p.style.height = Math.round(size * ratio) + 'px';
      p.style.animationDelay = (i * rand(12, 36) / 1000).toFixed(3) + 's';
      p.style.setProperty('--start-x', rand(-34, 8) + 'px');
      p.style.setProperty('--start-y', rand(-34, -8) + 'px');
      p.style.setProperty('--sc', sc);
      p.style.setProperty('--r0', rand(-80, 80) + 'deg');
      p.style.setProperty('--x1', rand(-12, 28) + 'px');
      p.style.setProperty('--y1', rand(4, 18) + 'px');
      p.style.setProperty('--x2', Math.round(endX * .22 + gust) + 'px');
      p.style.setProperty('--y2', Math.round(endY * .22 + rand(-12, 16)) + 'px');
      p.style.setProperty('--x3', Math.round(endX * .52 - gust * .42) + 'px');
      p.style.setProperty('--y3', Math.round(endY * .50 + sag) + 'px');
      p.style.setProperty('--x4', Math.round(endX * .78 + gust * .22) + 'px');
      p.style.setProperty('--y4', Math.round(endY * .78 - sag * .25) + 'px');
      p.style.setProperty('--x5', Math.round(endX) + 'px');
      p.style.setProperty('--y5', Math.round(endY) + 'px');
      p.style.setProperty('--r1', rand(20, 170) + 'deg');
      p.style.setProperty('--r2', rand(80, 320) + 'deg');
      p.style.setProperty('--r3', rand(180, 620) + 'deg');
      p.style.setProperty('--r4', rand(260, 760) + 'deg');
      p.style.setProperty('--r5', rand(340, 900) + 'deg');
      p.style.setProperty('--sk1', rand(-10, 10) + 'deg');
      p.style.setProperty('--sk2', rand(-18, 18) + 'deg');
      p.style.setProperty('--sk3', rand(-24, 24) + 'deg');
      p.style.setProperty('--sk4', rand(-18, 18) + 'deg');
      p.style.setProperty('--sk5', rand(-12, 12) + 'deg');
    });
  }
  function setupRatingPetals(root) {
    root.querySelectorAll('.rating-card.rank-1, .rating-card.rank-2, .rating-card.rank-3').forEach(card => {
      randomizeRatingPetals(card);
      card.querySelector('.rating-petal')?.addEventListener('animationiteration', () => randomizeRatingPetals(card));
    });
  }

  const cardsHTML = managers.map((m, idx) => {
    const isTop = idx < 3 && m.progNum >= 100;
    const rc = isTop ? rankColors[idx] : null;
    const stripColor = rc ? rc.strip : null;
    const stripEnd   = rc ? rc.stripEnd : null;
    const rankNumBg = isTop ? '#fff' : 'var(--bg3)';
    const rankNumColor = rc ? rc.numTxt : 'var(--txt3)';
    const pctColor = pctClr(m.progNum);
    const pctStyle = pctTextStyle(m.progNum);
    const barW = maxProg > 0 ? Math.min(Math.round(m.progNum / maxProg * 100), 100) : 0;
    const rankClass = isTop ? `rank-${idx+1}` : '';
    const petalsHtml = '';

    const nl = m.name.toLowerCase();
    const isMe = nl === myName;
    const sal = getMgrSalary(nl);
    const links = getMgrLinks(nl);
    const messengerHtml = messengerIcons(links, m.name);
    const salDisplay = sal !== null
      ? (isCeo || isMe) ? fmtRub(Math.round(sal)) : blurSalary(sal)
      : null;

    const trophyBadgeHtml = _trophyCountBadgeHtml(m.name);
    return `
      <div class="rating-card ${rankClass}">
        ${petalsHtml}
        ${stripColor ? `<div class="rating-card-strip" style="background:${stripColor}"></div>` : ''}
        ${trophyBadgeHtml}
        <div class="rating-card-top">
          <div class="rating-rank-num" style="background:${rankNumBg};color:${rankNumColor};font-size:${isTop?'16px':'10px'}">${isTop ? medalBtn(idx) : idx+1}</div>
          <div class="rating-card-name">
            <div class="rating-card-name-text" style="display:flex;align-items:center;gap:4px">${m.name.toUpperCase()}${messengerHtml}</div>
            ${salDisplay ? `<div style="font-size:10px;color:var(--acc);margin-top:2px;font-weight:700">${salDisplay}</div>` : ''}
          </div>
          <div>
            <div class="rating-card-pct" style="${pctStyle}">${m.progNum}%</div>
            <div class="rating-card-pct-sub">${m.factNum}% факт</div>
          </div>
        </div>
        <div class="rating-card-bar-track">
          <div class="rating-card-bar-fill" data-w="${barW}" style="width:0%;background:${pctColor}"></div>
        </div>
        <div class="rating-card-stats">
          <div class="rating-card-stat highlight"><span>Виз.</span><b>${m.vis}/${m.plan||'—'}</b></div>
          ${m.kred ? `<div class="rating-card-stat"><span>Кред.</span><b>${m.kred}</b></div>` : ''}
          ${m.nal  ? `<div class="rating-card-stat"><span>Нал.</span><b>${m.nal}</b></div>` : ''}
          ${m.kom  ? `<div class="rating-card-stat"><span>Ком.</span><b>${m.kom}</b></div>` : ''}
        </div>
      </div>`;
  }).join('');

  setLiveHTML(el, `
    <div class="rating-header">
      <div class="sec-title" style="margin:0">РЕЙТИНГ</div>
      ${deptToggle}
    </div>
    <div class="rating-slide-wrap"><div class="rating-slide-inner" id="rating-slide-inner">${summaryHTML}<div class="rating-chart">${cardsHTML || '<div class="empty">Нет данных</div>'}</div></div></div>
  `);

  // Анимируем бары
  requestAnimationFrame(() => {
    el.querySelectorAll('.rating-card-bar-fill').forEach((bar, i) => {
      setTimeout(() => { bar.style.width = bar.dataset.w + '%'; }, i * 80);
    });
    // Фейерверки для топ-3 с небольшой задержкой
    el.querySelectorAll('.rating-card.rank-1, .rating-card.rank-2, .rating-card.rank-3').forEach((card, i) => {
      setTimeout(() => {
        const rect = card.getBoundingClientRect();
        launchFirework(rect.left + rect.width * 0.8, rect.top + rect.height / 2);
      }, 400 + i * 300);
    });
  });
}

function switchRatingDept(dept) {
  // direction: crm→dozhim = slide left, dozhim→crm = slide right
  const prevDept = S.ratingDept;
  const slideOutClass = (prevDept === 'crm') ? 'slide-out-left' : 'slide-out-right';
  const slideInClass  = (prevDept === 'crm') ? 'slide-in-left'  : 'slide-in-right';

  const inner = document.getElementById('rating-slide-inner');
  if (inner) {
    inner.classList.add(slideOutClass);
    setTimeout(() => {
      S.ratingDept = dept;
      updateFirebasePage();
      if (dept === 'dozhim' && !S.data.d_vizity) {
        const el = document.getElementById('c-rating');
        if (el) el.innerHTML = loader();
        api(SHEETS.d_vizity, 'A:N').then(d => { S.data.d_vizity = d; renderRating(); _finishRatingSlide(slideInClass); }).catch(() => { S.data.d_vizity = []; renderRating(); _finishRatingSlide(slideInClass); });
        return;
      }
      renderRating();
      _finishRatingSlide(slideInClass);
    }, 220);
  } else {
    S.ratingDept = dept;
    updateFirebasePage();
    if (dept === 'dozhim' && !S.data.d_vizity) {
      const el = document.getElementById('c-rating');
      if (el) el.innerHTML = loader();
      api(SHEETS.d_vizity, 'A:N').then(d => { S.data.d_vizity = d; renderRating(); }).catch(() => { S.data.d_vizity = []; renderRating(); });
      return;
    }
    renderRating();
  }
}

function _finishRatingSlide(slideInClass) {
  requestAnimationFrame(() => {
    const inner = document.getElementById('rating-slide-inner');
    if (!inner) return;
    inner.classList.add(slideInClass);
    requestAnimationFrame(() => {
      inner.classList.remove(slideInClass);
    });
  });
}

// ==================== FAQ DOCK ====================
function dockFaqToggle(e) {
  e.stopPropagation();
  openDockPopup('dock-faq-popup');
}
function dockFaq(tab) {
  closeAllDockPopups();
  // АВТОПОДБОР — открывается отдельной фуллскрин-модалкой, не как таб
  if (tab === 'autopodbor') { openAutopodbor(); return; }
  S.faqTab = tab;
  updateFirebasePage();
  goTab('instruktsii');
  dockSetActive('instruktsii');
}

// Подстраиваем высоту/смещение оверлея под visualViewport — нужно
// чтобы на iOS PWA при появлении клавиатуры шелл сжимался, composer
// оставался над клавиатурой, а шапка не уезжала вверх.
function _apSyncViewport() {
  const fs = document.getElementById('autopodbor-fullscreen');
  if (!fs || !fs.classList.contains('open')) return;
  const vv = window.visualViewport;
  if (!vv) return;
  document.documentElement.style.setProperty('--ap-vh', vv.height + 'px');
  document.documentElement.style.setProperty('--ap-top', (vv.offsetTop || 0) + 'px');
}
function _apBindViewport() {
  if (!window.visualViewport || window._apVpBound) return;
  window._apVpBound = true;
  window.visualViewport.addEventListener('resize', _apSyncViewport);
  window.visualViewport.addEventListener('scroll', _apSyncViewport);
}

function openAutopodbor() {
  // Гейт: режим Off — открываем заглушку «В разработке» вместо чата
  if (S.autoSMode === false) {
    showScr('instruktsii');
    S.faqTab = 'autopodbor';
    if (typeof renderInstruktsii === 'function') renderInstruktsii();
    if (typeof dockSetActive === 'function') dockSetActive('instruktsii');
    return;
  }
  const fs = document.getElementById('autopodbor-fullscreen');
  if (!fs) return;
  fs.classList.add('open');
  fs.setAttribute('aria-hidden', 'false');
  document.body.classList.add('autopodbor-open');
  _apBindViewport();
  _apSyncViewport();
  // Lazy init CM66 BDCARS на первом открытии
  try { if (typeof window.cm66Init === 'function') window.cm66Init(); } catch(e) { console.warn('cm66Init failed', e); }
  // Фокус на инпут (после layout). На мобильных не автофокусим — клава
  // выскакивала бы сразу при открытии чата.
  if (!matchMedia('(max-width: 720px)').matches) {
    requestAnimationFrame(() => document.getElementById('chatInput')?.focus());
  }
  // Обновляем presence — текущая страница теперь «Автоподбор»
  if (typeof updateFirebasePage === 'function') updateFirebasePage();
}
function closeAutopodbor() {
  const fs = document.getElementById('autopodbor-fullscreen');
  if (!fs) return;
  fs.classList.remove('open');
  fs.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('autopodbor-open');
  // Сбрасываем CSS-переменные, чтобы они не влияли на остальной UI
  document.documentElement.style.removeProperty('--ap-vh');
  document.documentElement.style.removeProperty('--ap-top');
  if (typeof updateFirebasePage === 'function') updateFirebasePage();
}
window.openAutopodbor = openAutopodbor;
window.closeAutopodbor = closeAutopodbor;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('autopodbor-fullscreen')?.classList.contains('open')) {
    closeAutopodbor();
  }
});

// ==================== VIZITY DOCK ====================
function dockVizityToggle(e) {
  e.stopPropagation();
  const matched = findUserInSheet();
  // Попап только для CEO. Все остальные — прямо на свой отдел
  if (!matched || !isCeoLike(matched.role)) {
    closeAllDockPopups();
    const dept = matched?.role === 'dozhim' ? 'dozhim' : 'crm';
    dockVizity(dept);
    return;
  }
  openDockPopup('dock-vizity-popup');
}
function dockVizity(dept) {
  closeAllDockPopups();
  S.vizDept = dept;
  updateFirebasePage();
  dockSetActive('vizity');
  showScr('vizity');   // showScr управляет scroll-btns.visible
  loadVizity();
}

// ==================== VISITS TABLE ENGINE ====================
const VIZ_COLS = [
  { k:'date',    lbl:'Дата',           type:'date',   req:true  },
  { k:'name',    lbl:'ФИО',            type:'text',   req:true  },
  { k:'phone',   lbl:'Телефон',        type:'phone',  req:false },
  { k:'city',    lbl:'Город',          type:'select', req:false,
    opts:['Барнаул','Кемерово','Красноярск','Новокузнецк','Новосибирск','Омск','Оренбург','Пермь','Сургут','Томск','Тюмень','Челябинск'] },
  { k:'comment', lbl:'Комментарий',    type:'picker', req:false, free:true },
  { k:'source',  lbl:'Источник',       type:'picker', req:false },
  { k:'cat',     lbl:'Категория',      type:'select', req:false,
    opts:{ crm:['кат 800','кат 1200'], dozhim:['кат 800','кат 1000'] } },
  { k:'deal',    lbl:'Способ покупки', type:'picker', req:false },
  { k:'manager', lbl:'Менеджер',       type:'mgr',    req:true  },
  { k:'zadatok', lbl:'Задаток',        type:'number', req:false },
  { k:'kso',     lbl:'КСО',            type:'select', req:false,
    opts:['Был в КСО','Не был в КСО'] },
  { k:'kredit',  lbl:'Кред. рейтинг',  type:'text',   req:false },
  { k:'auto',    lbl:'Авто',           type:'text',   req:false },
  { k:'sverka',  lbl:'Сверка',         type:'select', req:false,
    opts:['Да','Нет'] },
];
const VIZ_DEAL_OPTS = [
  'покупка (кредит)','покупка (наличные)','комиссия','обмен','выкуп',
  'оценка авто','трейдин+кредит','трейдин+наличные','лизинг','не уточнили'
];
const VIZ_SOURCE_OPTS = [
  'теплый лид','рекламный (манго)','официальный сайт','рекламный (автокред)',
  'рекламный (автохаус)','рекламный (селектавто)','рекламный (аб-клаб)',
  'рекламный (автотрейд)','рекламный (автокредитс)','дром','авито','авто.ру',
  'автоброкер','рекомендация','холодный лид','БОТ','VK','Телеграм','Радио',
  'автокод','2ГИС','Я.Карты','Google Maps','Яндекс Директ',
  'Звонок с сайта СМ','Звонок с сайта АН','Звонок с сайта АК',
  'Звонок с сайта СЛ','Звонок с сайта КК'
];
const VIZ_COMMENT_OPTS = [
  'В салоне','ПОКУПКА (кредит)','ПОКУПКА (наличные)','КОМИССИЯ','ОБМЕН','ВЫКУП',
  'ФССП не подаем','ОТКАЗ','Подает заявку','В работе КСО','на рассмотрении банка',
  'Одобрено банком','Одобрено банком, но не купил','не подобрали авто',
  'не устроила оценка его авто','не устроило состояние нашего авто',
  'его автомобиль нам не интересен','Не устроила оценка','в течении дня',
  'в течении часа','в первой половине дня','во второй половине дня',
  'в пути','скоро будет','после обеда','Клиент внес задаток',
  'ожидается визит','КОМИССИЯ (визит)'
];

// State for vizity
S.vizDept = null;
S.vizRows = [];
S._vizAdding = false;
S._vizUndoTimer = null;
S._vizSaveTimers = {};
S._vizSheetIdCache = {};
S._vizPickerCallback = null;

function buildManagerList(dept) {
  const list = [];
  if (S.usersData && S.usersData.length > 1) {
    for (let i = 1; i < S.usersData.length; i++) {
      const row = S.usersData[i];
      const role = (row[2]||'').toLowerCase().trim();
      if (isCeoLike(role)) continue;
      if (dept === 'dozhim' && role !== 'dozhim') continue;
      if (dept === 'crm' && role !== 'crm' && role !== '') continue;
      const name = (row[1]||'').trim();
      if (name) list.push(name);
    }
  }
  list.push('КОТЁЛ');
  return list;
}

function formatPhone(raw) {
  if (!raw) return raw;
  const digits = raw.replace(/\D/g,'');
  if (!digits) return raw;
  if (digits.length === 10) return '7' + digits;
  if (digits.length === 11) {
    if (digits[0] === '7' || digits[0] === '8') return '7' + digits.slice(1);
    return '7' + digits.slice(-10);
  }
  if (digits.length > 11) return '7' + digits.slice(-10);
  return digits;
}

function isVizLocked() {
  const matched = findUserInSheet();
  if (isCeoLike(matched?.role)) return false;
  const mo = parseInt(currentSuffix.slice(0,2));
  const yr = 2000 + parseInt(currentSuffix.slice(2,4));
  const now = new Date();
  if (now.getFullYear() > yr || (now.getFullYear() === yr && now.getMonth()+1 > mo)) {
    return now.getDate() > 3;
  }
  return false;
}

function vizSheetName() {
  return (S.vizDept||'crm') === 'dozhim' ? SHEETS.d_vizity : SHEETS.vizity;
}

function todayStr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

function parseVizDate(str) {
  if (!str) return null;
  const m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

function vizWeekOf(d) {
  if (!d) return 4;
  const day = d.getDate();
  if (day <= 7)  return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  return 4;
}

function currentWeekNum() {
  const day = new Date().getDate();
  if (day <= 7)  return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  return 4;
}

async function loadVizity() {
  const el = document.getElementById('c-vizity');
  if (!el) return;
  const sheet = vizSheetName();
  el.innerHTML = loader('Синхронизация визитов…');
  // Жёсткий таймаут на ensureVizSheet — иначе при сетевых сбоях лоадер висит вечно
  try {
    await Promise.race([
      ensureVizSheet(sheet),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ]);
  } catch(e) { /* идём дальше — api сам проверит существование листа */ }
  let raw = [];
  try { raw = await api(sheet, 'A:N'); }
  catch(e) {
    if (e.message === 'auth') {
      el.innerHTML = `<div class="err">Сессия истекла — войдите заново</div>`;
    } else if (e.message === 'NOT_FOUND') {
      el.innerHTML = `<div class="empty">Лист «${sheet}» не найден. Проверьте доступ или дождитесь создания листа администратором.</div>`;
    } else {
      el.innerHTML = `<div class="err">Ошибка загрузки визитов: ${e.message}</div>`;
    }
    return;
  }
  S.vizRows = raw.slice(1).map((row, i) => ({
    idx: i, _sheetRow: i + 2,
    data: Array.from({length:14}, (_,c) => row[c] || '')
  }));
  try {
    renderVizity();
  } catch(e) {
    el.innerHTML = `<div class="err">Ошибка рендера визитов: ${e.message}</div>`;
    console.error('renderVizity failed:', e);
    return;
  }
  // Скроллим к последнему визиту. Используем double-rAF чтобы layout успел посчитаться
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const main = document.querySelector('main');
    if (main) main.scrollTop = main.scrollHeight;
  }));
}

async function ensureVizSheet(sheetName) {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}?fields=sheets.properties`;
    const r = await fetch(url, { headers: await authHeaders() });
    if (!r.ok) return;
    const data = await r.json();
    (data.sheets||[]).forEach(s => { S._vizSheetIdCache[s.properties.title] = s.properties.sheetId; });
    const exists = data.sheets?.some(s => s.properties.title === sheetName);
    if (!exists) await createVizSheet(sheetName);
  } catch(e) {}
}

async function createVizSheet(sheetName) {
  const headers = VIZ_COLS.map(c => c.lbl);
  try {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}:batchUpdate`, {
      method:'POST', headers: await authHeaders({ 'Content-Type':'application/json' }),
      body: JSON.stringify({ requests:[{ addSheet:{ properties:{ title:sheetName }}}] })
    });
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}/values/${encodeURIComponent(sheetName+'!A1:N1')}?valueInputOption=RAW`, {
      method:'PUT', headers: await authHeaders({ 'Content-Type':'application/json' }),
      body: JSON.stringify({ values:[headers] })
    });
    await ensureVizSheet(sheetName);
    toast('Лист создан: '+sheetName, 's');
  } catch(e) { toast('Ошибка создания листа', 'e'); }
}

async function getVizSheetId(sheetName) {
  if (S._vizSheetIdCache[sheetName] !== undefined) return S._vizSheetIdCache[sheetName];
  await ensureVizSheet(sheetName);
  return S._vizSheetIdCache[sheetName] ?? null;
}

function renderVizity() {
  const el = document.getElementById('c-vizity');
  if (!el) return;
  const dept = S.vizDept || 'crm';
  const locked = isVizLocked();
  const mo = parseInt(currentSuffix.slice(0,2));
  const yr = 2000 + parseInt(currentSuffix.slice(2,4));
  const dim = new Date(yr, mo, 0).getDate();
  const weekRanges = [[1,7],[8,14],[15,21],[22,dim]];
  const nowWeek = currentWeekNum();
  const isCurrentMonth = (new Date().getFullYear()===yr && new Date().getMonth()+1===mo);

  // Group rows by week, then sort within week by date asc (затем _sheetRow).
  // Это нужно чтобы при смене даты в существующем визите (например 29 → 25)
  // строка визуально попадала в «стопку» соответствующего дня, а не оставалась
  // в конце недели по физическому порядку в листе.
  const groups = [[],[],[],[]];
  S.vizRows.forEach(row => {
    const d = parseVizDate(row.data[0]);
    groups[d ? vizWeekOf(d)-1 : 3].push(row);
  });
  groups.forEach(g => g.sort((a, b) => {
    const da = parseVizDate(a.data[0]);
    const db = parseVizDate(b.data[0]);
    if (!da && !db) return a._sheetRow - b._sheetRow;
    if (!da) return 1;
    if (!db) return -1;
    const tA = da.getTime(), tB = db.getTime();
    if (tA !== tB) return tA - tB;
    return a._sheetRow - b._sheetRow;
  }));

  const moName = new Date(yr,mo-1,1).toLocaleString('ru',{month:'long'});

  const today = new Date();
  const todayDay = today.getDate();
  const isCurMo = isCurrentMonth;

  const weekHTML = weekRanges.map(([start, end], wi) => {
    const wk = wi+1;
    const isCurrentWk = isCurrentMonth && wk === nowWeek;
    const isPastWk = isCurrentMonth ? wk < nowWeek : true;
    // Скрываем недели которые ещё не наступили (первый день недели > сегодня)
    const weekStarted = !isCurMo || todayDay >= start;
    if (!weekStarted) return ''; // неделя ещё не началась — не показываем
    const rows = groups[wi];
    const visCount = rows.length;
    // Stats for summary
    const exactComment = (row, val) => (row.data[4]||'').trim() === val;
    const salon   = rows.filter(r => exactComment(r,'В салоне')).length;
    const kred    = rows.filter(r => exactComment(r,'ПОКУПКА (кредит)')).length;
    const nal     = rows.filter(r => exactComment(r,'ПОКУПКА (наличные)')).length;
    const kom     = rows.filter(r => exactComment(r,'КОМИССИЯ') || exactComment(r,'КОМИССИЯ (визит)')).length;
    const otk     = rows.filter(r => exactComment(r,'ОТКАЗ') || exactComment(r,'ФССП не подаем')).length;
    const kso     = rows.filter(r => exactComment(r,'В работе КСО') || exactComment(r,'Подает заявку') || exactComment(r,'на рассмотрении банка') || exactComment(r,'Одобрено банком')).length;
    const statsLine2 = visCount > 0
      ? `<div class="vt-week-sum-line2">` +
        [
          salon > 0 && `<span style="color:#ED1C24;font-weight:700">В салоне: ${salon}</span>`,
          kred  > 0 && `Кред: <b>${kred}</b>`,
          nal   > 0 && `Нал: <b>${nal}</b>`,
          kom   > 0 && `Ком: <b>${kom}</b>`,
          kso   > 0 && `КСО: <b style="color:var(--blu)">${kso}</b>`,
          otk   > 0 && `Отказы: <b>${otk}</b>`
        ].filter(Boolean).join(' · ') +
        `</div>` : '';

    const openAttr = (isCurrentWk || !isPastWk) ? 'open' : '';

    // Build insert zones + rows
    function makeInsertZone(afterRow, label='') {
      if (locked) return '';
      if (!S.vizPasteMode) return '';
      return `<div class="vt-insert-zone" onclick="vizManualInsert(${afterRow})" title="Вставить визит${label}"><div class="vt-insert-zone-btn">+</div></div>`;
    }

    let bodyHTML = '';
    const prevRows = wi > 0 ? groups[wi-1] : [];
    const beforeFirst = prevRows.length > 0 ? prevRows[prevRows.length-1]._sheetRow
                      : (rows.length > 0 ? rows[0]._sheetRow - 1 : 1);
    bodyHTML += makeInsertZone(beforeFirst);
    let lastDate = null;
    rows.forEach((row) => {
      const rowDate = (row.data[0] || '').slice(0,5);
      const isFirstOfDate = rowDate !== lastDate;
      if (rowDate) lastDate = rowDate;
      bodyHTML += renderVizRow(row, dept, locked, isFirstOfDate);
      bodyHTML += makeInsertZone(row._sheetRow);
    });

    return `<details class="vt-week" ${openAttr}>
      <summary class="vt-week-sum">
        <div class="vt-week-sum-left">
          <svg class="vt-week-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          <div>
            <div class="vt-week-sum-line1">${start}–${end} ${moName}${isCurrentWk?' <span style="color:var(--acc);font-size:8px">● сейчас</span>':''}</div>
            ${statsLine2}
          </div>
        </div>
        <div class="vt-week-sum-right vt-week-stats"><b>${visCount}</b> визитов</div>
      </summary>
      <div class="vt-week-body">${bodyHTML}</div>
    </details>`;
  }).join('');

  const lockedBadge = locked
    ? `<span class="vt-lock-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Месяц закрыт</span>` : '';
  const addBtnTop = !locked
    ? `<button class="vt-add-btn" onclick="vizAddRow()" id="vt-main-add-btn">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Добавить визит
       </button>` : '';

  el.innerHTML = `
    <div class="vt-toolbar">
      <span class="vt-dept-badge">${dept==='dozhim'?'ДОЖИМ':'CRM'}</span>
      ${lockedBadge}${addBtnTop}
    </div>
    <div class="vt-body">${weekHTML}</div>`;
}

function renderVizRow(row, dept, locked, isFirstOfDate) {
  const d = row.data;
  const comment = d[4] || '';
  const deal = d[7] || '';
  const label = comment || deal;
  const isDeal = ['ПОКУПКА','КОМИССИЯ','ОБМЕН','ВЫКУП','Кредит','Наличные','Комиссия','Обмен'].some(x=>label.includes(x));
  const isSalon = label.includes('В салоне');
  const chipTone = getVizChipTone(label, deal);
  const chipClass = `${isDeal ? 'deal' : isSalon ? 'salon' : ''} ${chipTone}`.trim();
  const chip = label
    ? `<span class="vt-status-chip ${chipClass}" title="${label}">${label.slice(0,18)}${label.length>18?'…':''}</span>` : '';
  const formHTML = locked ? '' : renderVizForm(row, dept);
  const dateStyle = isFirstOfDate ? 'font-weight:700;color:var(--txt)' : '';
  const sverkaIcon = getVizSverkaMark(d[13]);
  // Для CEO/ROP — оборачиваем иконку сверки в кликабельный попап
  const meRow = findUserInSheet();
  const isCeoView = meRow && isCeoLike(meRow.role);
  const sverkaWrap = isCeoView
    ? `<span class="vt-sverka-clickable" onclick="event.stopPropagation();openSverkaPopup(event, '${dept}', ${row._sheetRow}, ${JSON.stringify(String(d[13]||'')).replace(/"/g,'&quot;')})">${sverkaIcon}</span>`
    : sverkaIcon;
  return `
    <div class="vt-row" id="vt-row-${row._sheetRow}">
      <div class="vt-row-card" id="vt-card-${row._sheetRow}">
        <div class="vt-row-compact" onclick="vizToggleExpand(${row._sheetRow})">
          <span class="vt-row-date" style="${dateStyle}">${(d[0]||'—').slice(0,5)}</span>
          <div>
            <div class="vt-row-name">${d[1]||'—'}</div>
            <div class="vt-row-meta"><span class="vt-row-meta-text">${d[8]||''}${d[6]?' · '+d[6]:''}</span></div>
          </div>
          ${sverkaWrap}
          ${chip}
          <button class="vt-expand-btn" onclick="event.stopPropagation();vizToggleExpand(${row._sheetRow})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
        ${formHTML}
      </div>
    </div>`;
}

/* ─── Попап быстрой сверки в таблице ВИЗИТЫ (для CEO/ROP) ─── */
let _sverkaPopover = null;
function closeSverkaPopup() {
  if (_sverkaPopover) { _sverkaPopover.remove(); _sverkaPopover = null; }
}
function openSverkaPopup(e, dept, sheetRow, currentVal) {
  e.preventDefault(); e.stopPropagation();
  closeSverkaPopup();
  const sfx = currentSuffix;
  const sheetName = dept === 'dozhim' ? ('Д_ВИЗИТЫ' + sfx) : ('ВИЗИТЫ' + sfx);
  const target = e.currentTarget;
  const rect = target.getBoundingClientRect();
  const cur = String(currentVal || '').trim().toLowerCase();
  const pop = document.createElement('div');
  pop.className = 'sverka-popover';
  pop.innerHTML = `
    <div class="sverka-pop-title">Сверка</div>
    <div class="sverka-pop-actions">
      <button class="sverka-pop-btn yes${cur === 'да' ? ' active':''}" onclick="saveSverkaValue('${sheetName}', ${sheetRow}, 'Да')">Да</button>
      <button class="sverka-pop-btn no${cur === 'нет' ? ' active':''}"  onclick="saveSverkaValue('${sheetName}', ${sheetRow}, 'Нет')">Нет</button>
      <button class="sverka-pop-btn clear${!cur ? ' active':''}" onclick="saveSverkaValue('${sheetName}', ${sheetRow}, '')">—</button>
    </div>`;
  document.body.appendChild(pop);
  // Позиционируем под иконкой
  const popW = 180;
  let left = rect.left + rect.width/2 - popW/2;
  left = Math.max(8, Math.min(left, window.innerWidth - popW - 8));
  const top = rect.bottom + 6;
  pop.style.left = left + 'px';
  pop.style.top  = top + 'px';
  _sverkaPopover = pop;
  // Закрытие по клику вне
  setTimeout(() => {
    document.addEventListener('mousedown', _sverkaOutsideHandler, { capture: true });
    document.addEventListener('touchstart', _sverkaOutsideHandler, { capture: true });
  }, 0);
}
function _sverkaOutsideHandler(ev) {
  if (_sverkaPopover && !_sverkaPopover.contains(ev.target)) {
    closeSverkaPopup();
    document.removeEventListener('mousedown', _sverkaOutsideHandler, { capture: true });
    document.removeEventListener('touchstart', _sverkaOutsideHandler, { capture: true });
  }
}
async function saveSverkaValue(sheetName, sheetRow, value) {
  closeSverkaPopup();
  try {
    const range = encodeURIComponent(`'${sheetName}'!N${sheetRow}`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`;
    const resp = await fetch(url, {
      method: 'PUT',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ values: [[value]] }),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    // Обновляем локальный кеш и перерисовываем
    const isDozhim = sheetName.startsWith('Д_');
    const arr = isDozhim ? (S.data.d_vizity||[]) : (S.data.vizity||[]);
    if (arr[sheetRow-1]) arr[sheetRow-1][13] = value;
    try { toast('Сверка обновлена', 's'); } catch(_) {}
    if (typeof renderVizityScreen === 'function' && document.getElementById('scr-vizity')?.classList.contains('on')) {
      renderVizityScreen();
    } else if (typeof renderVizity === 'function') {
      try { renderVizity(); } catch(_){}
    }
  } catch (err) {
    try { toast('Ошибка сверки: ' + err.message, 'e'); } catch(_) {}
  }
}
window.openSverkaPopup  = openSverkaPopup;
window.saveSverkaValue  = saveSverkaValue;
window.closeSverkaPopup = closeSverkaPopup;

function getVizSverkaMark(value) {
  const s = String(value || '').trim().toLowerCase();
  const isCosmic = document.body.classList.contains('cosmic');
  const isFluent = document.body.classList.contains('fluent');
  if (isFluent) {
    if (s === 'да' || s === 'yes') {
      return `<span class="vt-sverka-mark yes" title="Сверено" aria-label="Сверено" style="--sverka-icon:url('${FLUENT_ICON_BASE}FluentColor-Check.svg')"><i></i></span>`;
    }
    if (s === 'нет' || s === 'no') {
      return `<span class="vt-sverka-mark no" title="Не прошел сверку" aria-label="Не прошел сверку" style="--sverka-icon:url('${FLUENT_ICON_BASE}FluentColor-Fail.svg')"><i></i></span>`;
    }
    return `<span class="vt-sverka-mark empty" title="Визит проверяется..." aria-label="Визит проверяется" style="--sverka-icon:url('${FLUENT_ICON_BASE}FluentColor-Revise.svg')"><i></i></span>`;
  }
  const iconBase = isCosmic ? COSMIC_ICON_BASE : DEFAULT_ICON_BASE;
  const iconPrefix = isCosmic ? 'cosmic-' : '';
  const cls = isCosmic ? ' cosmic-native' : '';
  if (s === 'да' || s === 'yes') {
    return `<span class="vt-sverka-mark yes${cls}" title="Сверено" aria-label="Сверено" style="--sverka-icon:url('${iconBase}${iconPrefix}s_verified.svg')"><i></i></span>`;
  }
  if (s === 'нет' || s === 'no') {
    return `<span class="vt-sverka-mark no${cls}" title="Не прошел сверку" aria-label="Не прошел сверку" style="--sverka-icon:url('${iconBase}${iconPrefix}s_not-verified.svg')"><i></i></span>`;
  }
  return `<span class="vt-sverka-mark empty${cls}" title="Визит проверяется..." aria-label="Визит проверяется" style="--sverka-icon:url('${iconBase}${iconPrefix}s_check.svg')"><i></i></span>`;
}

function getVizChipTone(label, dealValue = '') {
  const s = String(label || '').toLowerCase();
  const deal = String(dealValue || '').toLowerCase().trim();
  if (!s) return '';
  if (s.includes('отказ') || s.includes('фссп')) return 'vt-chip-red';
  if (s.includes('одобрено')) return 'vt-chip-yellow';
  if (s.includes('подает заявку') || s.includes('подаёт заявку') || s.includes('в работе ксо') || s.includes('на рассмотрении банка')) {
    return 'vt-chip-purple';
  }
  const greenDeals = new Set([
    'покупка (кредит)',
    'покупка (наличные)',
    'кредит',
    'наличные',
    'обмен',
    'выкуп',
    'комиссия'
  ]);
  if (greenDeals.has(deal)) {
    return 'vt-chip-green';
  }
  return '';
}

function renderVizForm(row, dept) {
  const d = row.data;
  const catOpts = VIZ_COLS[6].opts[dept] || VIZ_COLS[6].opts.crm;
  const mgrList = buildManagerList(dept);

  const isCeoRole = isCeoLike(findUserInSheet()?.role);

  function field(idx, gridClass='') {
    const col = VIZ_COLS[idx];
    const val = d[idx] || '';
    const lblCls = col.req ? 'vt-field-lbl required' : 'vt-field-lbl';
    let input = '';

    // Сверка (col 13) — только CEO может менять
    if (idx === 13 && !isCeoRole) {
      const displayVal = val || '—';
      input = `<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--bg3);border-radius:var(--r);border:1px solid var(--line);opacity:.7">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span style="font-size:12px;color:var(--txt2)">${displayVal}</span>
      </div>`;
      return `<div class="vt-field ${gridClass}"><label class="${lblCls}">${col.lbl}</label>${input}</div>`;
    }

    if (col.type === 'date') {
      let dateVal = '';
      const m = val.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (m) dateVal = `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
      else if (/^\d{4}-\d{2}-\d{2}/.test(val)) dateVal = val;
      input = `<input type="date" value="${dateVal}" data-row="${row._sheetRow}" data-col="${idx}" oninput="vizOnChange(this)" class="${!val?'invalid':''}">`;

    } else if (col.type === 'phone') {
      input = `<input type="tel" value="${val}" placeholder="79000000000" data-row="${row._sheetRow}" data-col="${idx}"
        oninput="vizOnChange(this)" onblur="vizFormatPhone(this)">`;

    } else if (col.type === 'select' && Array.isArray(col.opts)) {
      const opts = col.opts;
      input = `<select data-row="${row._sheetRow}" data-col="${idx}" onchange="vizOnChange(this)">
        <option value=""></option>
        ${opts.map(o=>`<option${val===o?' selected':''}>${o}</option>`).join('')}
      </select>`;

    } else if (col.type === 'select' && typeof col.opts === 'object') {
      input = `<select data-row="${row._sheetRow}" data-col="${idx}" onchange="vizOnChange(this)">
        <option value=""></option>
        ${catOpts.map(o=>`<option${val===o?' selected':''}>${o}</option>`).join('')}
      </select>`;

    } else if (col.type === 'picker') {
      const displayVal = val ? `<span>${val}</span>` : `<span style='color:var(--txt3)'>Выбрать…</span>`;
      input = `<button class="vt-status-trigger" onclick="openVizPicker(${row._sheetRow},${idx},this)"
        id="vtpick-${row._sheetRow}-${idx}">
        ${displayVal}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>`;

    } else if (col.type === 'mgr') {
      input = `<select data-row="${row._sheetRow}" data-col="${idx}" onchange="vizOnChange(this)">
        <option value=""></option>
        ${mgrList.map(o=>`<option${val===o?' selected':''}>${o}</option>`).join('')}
      </select>`;

    } else if (col.type === 'number') {
      input = `<input type="number" value="${val}" placeholder="0" data-row="${row._sheetRow}" data-col="${idx}" oninput="vizOnChange(this)">`;

    } else {
      input = `<input type="text" value="${val}" placeholder="${col.lbl}" data-row="${row._sheetRow}" data-col="${idx}" oninput="vizOnChange(this)" class="${col.req&&!val?'invalid':''}">`;
    }
    return `<div class="vt-field ${gridClass}"><label class="${lblCls}">${col.lbl}</label>${input}</div>`;
  }

  return `<div class="vt-row-form">
    <div class="vt-form-grid">
      ${field(0)}${field(8)}
      ${field(1,'vt-field-full')}
      ${field(2)}${field(3)}
      ${field(6)}${field(7)}
      ${field(5)}${field(9)}
      ${field(4,'vt-field-full')}
      ${field(10)}${field(13)}
      ${field(11)}${field(12)}
    </div>
    <div class="vt-form-actions">
      <span class="vt-save-status" id="vt-status-${row._sheetRow}"></span>
      <button class="vt-del-btn" onclick="vizDeleteRow(${row._sheetRow})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        Удалить
      </button>
    </div>
  </div>`;
}

function vizToggleExpand(sheetRow) {
  document.getElementById('vt-card-'+sheetRow)?.classList.toggle('vt-expanded');
}

function vizFormatPhone(el) {
  const formatted = formatPhone(el.value);
  if (formatted !== el.value) {
    el.value = formatted;
    const sheetRow = +el.dataset.row;
    const col = +el.dataset.col;
    const row = S.vizRows.find(r => r._sheetRow === sheetRow);
    if (row) {
      row.data[col] = formatted;
      const statusEl = document.getElementById('vt-status-'+sheetRow);
      if (statusEl) { statusEl.className='vt-save-status saving'; statusEl.textContent='Сохранение…'; }
      clearTimeout(S._vizSaveTimers[sheetRow]);
      S._vizSaveTimers[sheetRow] = setTimeout(() => vizSaveRow(sheetRow, statusEl), 800);
    }
  }
}

function vizOnChange(el) {
  const sheetRow = +el.dataset.row;
  const col      = +el.dataset.col;
  let val = el.value;
  if (VIZ_COLS[col].type === 'date' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    const p = val.split('-'); val = `${p[2]}.${p[1]}.${p[0]}`;
  }
  const row = S.vizRows.find(r => r._sheetRow === sheetRow);
  if (row) {
    row.data[col] = val;
    if (col === 0) row._dateChanged = true;
    if (!row._changedCols) row._changedCols = new Set();
    row._changedCols.add(col);

    // Авто-категория при выборе источника (col=5)
    if (col === 5) {
      const autoKat = val === 'теплый лид' ? 'кат 1200' : 'кат 800';
      row.data[6] = autoKat;
      row._changedCols.add(6);
      // Обновляем select категории в DOM
      const catSel = el.closest('.vt-row-form')?.querySelector(`select[data-col="6"]`);
      if (catSel) catSel.value = autoKat;
    }
  }
  if (VIZ_COLS[col].req && !val) el.classList.add('invalid');
  else el.classList.remove('invalid');
  const statusEl = document.getElementById('vt-status-'+sheetRow);
  if (statusEl) { statusEl.className='vt-save-status saving'; statusEl.textContent='Сохранение…'; }
  clearTimeout(S._vizSaveTimers[sheetRow]);
  S._vizSaveTimers[sheetRow] = setTimeout(() => vizSaveRow(sheetRow, statusEl), 800);
}

async function vizSaveRow(sheetRow, statusEl) {
  const row = S.vizRows.find(r => r._sheetRow === sheetRow);
  if (!row) return;
  const changedCols = row._changedCols ? [...row._changedCols] : null;
  row._changedCols = new Set();
  const dateChanged = row._dateChanged;
  row._dateChanged = false;
  try {
    const sheet = vizSheetName();
    if (changedCols && changedCols.length > 0) {
      // Per-cell updates — prevents overwriting concurrent edits in other columns
      const COLS = 'ABCDEFGHIJKLMN';
      await Promise.all(changedCols.map(c => {
        const colLetter = COLS[c];
        const range = encodeURIComponent(sheet+'!'+colLetter+sheetRow+':'+colLetter+sheetRow);
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`;
        return authHeaders({ 'Content-Type':'application/json' }).then(headers =>
          fetch(url, { method:'PUT', headers, body:JSON.stringify({ values:[[row.data[c]]] }) })
        );
      }));
    } else {
      // Fallback: full row update (e.g., new row)
      await vizUpdateRow(sheet, sheetRow, row.data);
    }
    if (statusEl) { statusEl.className='vt-save-status saved'; statusEl.textContent='✓ Сохранено'; }
    setTimeout(() => { if(statusEl) { statusEl.className='vt-save-status'; statusEl.textContent=''; } }, 2500);
    if (dateChanged) {
      const expanded = new Set([...document.querySelectorAll('.vt-row-card.vt-expanded')].map(el=>+el.id.replace('vt-card-','')));
      renderVizity();
      expanded.forEach(sr => { document.getElementById('vt-card-'+sr)?.classList.add('vt-expanded'); });
    }
  } catch(e) {
    if (statusEl) { statusEl.className='vt-save-status err'; statusEl.textContent='Ошибка сохранения'; }
  }
}

async function vizUpdateRow(sheetName, sheetRow, rowData) {
  const range = encodeURIComponent(sheetName+'!A'+sheetRow+':N'+sheetRow);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`;
  const r = await fetch(url, { method:'PUT', headers: await authHeaders({ 'Content-Type':'application/json' }), body:JSON.stringify({ values:[rowData] }) });
  if (!r.ok) throw new Error('Sheets API error');
}

// Main add button — auto-sort: places new row after last row of same manager+today
async function vizAddRow() {
  if (isVizLocked() || S._vizAdding) return;
  S._vizAdding = true;
  const btn = document.getElementById('vt-main-add-btn');
  if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }

  const matched = findUserInSheet();
  const myName  = matched?.name || '';
  const today   = todayStr();
  const newData = Array(14).fill('');
  newData[0] = today;
  newData[8] = myName;

  // Find last row with same manager+date for auto-sort
  const sameRows = S.vizRows.filter(r => r.data[0] === today && r.data[8].toLowerCase() === myName.toLowerCase());
  const insertAfter = sameRows.length > 0 ? sameRows[sameRows.length-1]._sheetRow : -1;

  try {
    const newSheetRow = await vizWriteNewRow(insertAfter, newData);
    S.vizRows.sort((a,b) => a._sheetRow - b._sheetRow);
    renderVizity();
    setTimeout(() => {
      const card = document.getElementById('vt-card-'+newSheetRow);
      if (card) { card.classList.add('vt-expanded','vt-new'); card.scrollIntoView({ behavior:'smooth', block:'center' }); }
    }, 60);
  } catch(e) { toast('Ошибка добавления визита', 'e'); }
  finally { S._vizAdding = false; }
}

// Manual "+" insert at specific position
async function vizManualInsert(afterSheetRow) {
  if (isVizLocked() || S._vizAdding) return;
  S._vizAdding = true;
  const matched = findUserInSheet();
  const newData = Array(14).fill('');
  newData[0] = todayStr();
  newData[8] = matched?.name || '';
  try {
    const newSheetRow = await vizWriteNewRow(afterSheetRow, newData);
    S.vizRows.sort((a,b) => a._sheetRow - b._sheetRow);
    renderVizity();
    setTimeout(() => {
      const card = document.getElementById('vt-card-'+newSheetRow);
      if (card) { card.classList.add('vt-expanded','vt-new'); card.scrollIntoView({ behavior:'smooth', block:'center' }); }
    }, 60);
  } catch(e) { toast('Ошибка вставки строки', 'e'); }
  finally { S._vizAdding = false; }
}

// Core write: either append (afterSheetRow=-1) or insertDimension+update
async function vizWriteNewRow(afterSheetRow, newData) {
  const sheet = vizSheetName();
  let newSheetRow;
  if (afterSheetRow === -1 || afterSheetRow >= S.vizRows.reduce((mx,r)=>Math.max(mx,r._sheetRow),1)) {
    // Append
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}/values/${encodeURIComponent(sheet+'!A:N')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const r = await fetch(url, { method:'POST', headers: await authHeaders({ 'Content-Type':'application/json' }), body:JSON.stringify({ values:[newData] }) });
    if (!r.ok) throw new Error();
    const res = await r.json();
    const m = (res.updates?.updatedRange||'').match(/(\d+)$/);
    newSheetRow = m ? +m[1] : S.vizRows.length + 2;
  } else {
    // Insert at position
    const sheetId = await getVizSheetId(sheet);
    if (sheetId === null) throw new Error('Sheet ID not found');
    newSheetRow = afterSheetRow + 1;
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}:batchUpdate`, {
      method:'POST', headers: await authHeaders({ 'Content-Type':'application/json' }),
      body: JSON.stringify({ requests:[{ insertDimension:{ range:{ sheetId, dimension:'ROWS', startIndex:afterSheetRow, endIndex:afterSheetRow+1 }, inheritFromBefore:false }}] })
    });
    await vizUpdateRow(sheet, newSheetRow, newData);
    S.vizRows.forEach(r => { if (r._sheetRow >= newSheetRow) r._sheetRow++; });
  }
  S.vizRows.push({ idx: S.vizRows.length, _sheetRow: newSheetRow, data: newData });
  return newSheetRow;
}

async function vizDeleteRow(sheetRow) {
  const me = findUserInSheet();
  if (!me) return;
  const row = S.vizRows.find(r => r._sheetRow === sheetRow);
  const isCeo = isCeoLike(me.role);
  const isOwn = row && (row.data[8] || '').trim().toLowerCase() === (me.name || '').trim().toLowerCase();
  if (!isCeo && !isOwn) {
    toast('Можно удалять только свои визиты', 'e'); return;
  }
  const rowEl = document.getElementById('vt-row-'+sheetRow);
  if (!rowEl || !row) return;
  rowEl.style.opacity = '0.3'; rowEl.style.pointerEvents = 'none';
  if (S._vizUndoTimer) { clearTimeout(S._vizUndoTimer); document.getElementById('vt-undo-toast')?.remove(); }
  const toastEl = document.createElement('div');
  toastEl.id = 'vt-undo-toast'; toastEl.className = 'vt-undo-toast';
  toastEl.innerHTML = `<span>Строка удалена</span><button class="vt-undo-btn" onclick="vizUndoDelete()">ОТМЕНА</button><button class="vt-undo-btn" style="background:var(--red)" onclick="vizConfirmDelete(${sheetRow})">ОК</button><span id="vt-undo-timer" style="color:var(--txt3);font-size:11px;min-width:16px">10</span>`;
  document.body.appendChild(toastEl);
  let sec = 10;
  const tick = setInterval(() => {
    sec--; const tEl = document.getElementById('vt-undo-timer'); if (tEl) tEl.textContent = sec;
    if (sec <= 0) { clearInterval(tick); commitVizDelete(sheetRow); }
  }, 1000);
  window._vizUndoPending = { sheetRow, tick, rowEl };
}

async function vizUndoDelete() {
  const p = window._vizUndoPending; if (!p) return;
  clearInterval(p.tick);
  p.rowEl.style.opacity = ''; p.rowEl.style.pointerEvents = '';
  document.getElementById('vt-undo-toast')?.remove();
  window._vizUndoPending = null;
}

async function vizConfirmDelete(sheetRow) {
  const p = window._vizUndoPending; if (!p) return;
  clearInterval(p.tick);
  document.getElementById('vt-undo-toast')?.remove();
  window._vizUndoPending = null;
  await commitVizDelete(sheetRow);
}

async function commitVizDelete(sheetRow) {
  document.getElementById('vt-undo-toast')?.remove();
  window._vizUndoPending = null;
  S.vizRows = S.vizRows.filter(r => r._sheetRow !== sheetRow);
  const sheet = vizSheetName();
  const sheetId = await getVizSheetId(sheet);
  if (sheetId !== null) {
    try {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}:batchUpdate`, {
        method:'POST', headers: await authHeaders({ 'Content-Type':'application/json' }),
        body: JSON.stringify({ requests:[{ deleteDimension:{ range:{ sheetId, dimension:'ROWS', startIndex:sheetRow-1, endIndex:sheetRow }}}] })
      });
      S.vizRows.forEach(r => { if (r._sheetRow > sheetRow) r._sheetRow--; });
    } catch(e) { toast('Ошибка удаления', 'e'); }
  }
  renderVizity();
}

function openVizPicker(sheetRow, colIdx) {
  const curVal = S.vizRows.find(r => r._sheetRow === sheetRow)?.data[colIdx] || '';
  let opts, free = false;
  if (colIdx === 4) { opts = VIZ_COMMENT_OPTS; free = true; }
  else if (colIdx === 5) { opts = VIZ_SOURCE_OPTS; }
  else { opts = VIZ_DEAL_OPTS; }
  renderVizPicker(opts, curVal, free, sheetRow, colIdx);
}

function renderVizPicker(opts, curVal, allowFree, sheetRow, colIdx) {
  let overlay = document.getElementById('vt-picker-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'vt-picker-overlay'; overlay.className = 'vt-picker-overlay';
    overlay.onclick = e => { if (e.target === overlay) closeVizPicker(); };
    document.body.appendChild(overlay);
  }
  // Сохраняем целевую строку/колонку прямо на элементе — не в глобальной переменной
  overlay._sheetRow = sheetRow;
  overlay._colIdx = colIdx;
  overlay._opts = opts;
  overlay._allowFree = allowFree;

  const ph = allowFree ? 'Поиск или введите вручную…' : 'Поиск…';
  overlay.innerHTML = `<div class="vt-picker-modal">
    <div class="vt-picker-hdr">
      <input class="vt-picker-search" placeholder="${ph}" oninput="filterVizPicker(this.value)" id="vt-picker-search">
      <button class="vt-picker-cancel" onclick="closeVizPicker()">Отмена</button>
    </div>
    <div class="vt-picker-list" id="vt-picker-list">
      ${opts.map(o=>`<div class="vt-picker-item${o===curVal?' selected':''}" onclick="selectVizPicker('${o.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">${o}</div>`).join('')}
    </div>
  </div>`;
  overlay.classList.add('open');
  setTimeout(() => document.getElementById('vt-picker-search')?.focus(), 100);
}

function filterVizPicker(q) {
  const overlay = document.getElementById('vt-picker-overlay');
  const list = document.getElementById('vt-picker-list');
  if (!list || !overlay) return;
  const opts = overlay._opts || [];
  const af = overlay._allowFree;
  const ql = q.toLowerCase();
  const filtered = opts.filter(o => o.toLowerCase().includes(ql));
  const freeEntry = af && q && !opts.some(o => o.toLowerCase() === ql)
    ? `<div class="vt-picker-item" onclick="selectVizPicker('${q.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">✏️ «${q}»</div>` : '';
  list.innerHTML = filtered.map(o => `<div class="vt-picker-item" onclick="selectVizPicker('${o.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}' )">${o}</div>`).join('') + freeEntry;
}

function selectVizPicker(val) {
  const overlay = document.getElementById('vt-picker-overlay');
  const sheetRow = overlay?._sheetRow;
  const colIdx   = overlay?._colIdx;
  closeVizPicker();
  if (sheetRow == null || colIdx == null) return;

  // Обновляем кнопку в DOM
  const btn = document.getElementById(`vtpick-${sheetRow}-${colIdx}`);
  if (btn) {
    const sp = btn.querySelector('span');
    if (sp) sp.innerHTML = val || `<span style='color:var(--txt3)'>Выбрать…</span>`;
  }
  // Обновляем данные строки
  const row = S.vizRows.find(r => r._sheetRow === sheetRow);
  if (!row) return;
  row.data[colIdx] = val;
  if (!row._changedCols) row._changedCols = new Set();
  row._changedCols.add(colIdx);
  // Авто-категория при выборе источника
  if (colIdx === 5) {
    const autoKat = val === 'теплый лид' ? 'кат 1200' : 'кат 800';
    row.data[6] = autoKat;
    row._changedCols.add(6);
    const catSel = document.querySelector(`#vt-card-${sheetRow} select[data-col="6"]`);
    if (catSel) catSel.value = autoKat;
  }
  const statusEl = document.getElementById('vt-status-' + sheetRow);
  if (statusEl) { statusEl.className = 'vt-save-status saving'; statusEl.textContent = 'Сохранение…'; }
  clearTimeout(S._vizSaveTimers[sheetRow]);
  S._vizSaveTimers[sheetRow] = setTimeout(() => vizSaveRow(sheetRow, statusEl), 800);
}

function closeVizPicker() {
  document.getElementById('vt-picker-overlay')?.classList.remove('open');
}

function vizScrollTo(dir) {
  // Ищем реальный скролл-контейнер: main или document
  const main = document.querySelector('main');
  const target = (main && main.scrollHeight > main.clientHeight) ? main : document.scrollingElement || document.documentElement;
  if (dir === 'top') target.scrollTo({ top: 0, behavior: 'smooth' });
  else target.scrollTo({ top: target.scrollHeight, behavior: 'smooth' });
}

function hmbGoPersonal() {
  closeHamburger();
  const m = findUserInSheet();
  if (m && !isCeoLike(m.role)) goPersonal();
}

function hmbOpenProfile() {
  closeHamburger();
  showScr('profile');
  if (typeof dockSetActive === 'function') dockSetActive('home');
  renderProfile();
}

function _profileGetUserRow(name) {
  if (!S.usersData || !name) return null;
  const nl = String(name).toLowerCase().trim();
  for (let i = 1; i < S.usersData.length; i++) {
    const row = S.usersData[i];
    if ((row[1]||'').toLowerCase().trim() === nl) return row;
  }
  return null;
}

function _profilePositionLabel(role) {
  const r = String(role||'').toLowerCase().trim();
  if (r === 'crm' || r === 'dozhim' || r === 'дожим') return 'Менеджер по продажам';
  if (r === 'ceo') return 'CEO';
  if (r === 'rop' || r === 'роп') return 'Руководитель отдела продаж';
  return role || '—';
}

function _profilePhoneHref(phone) {
  const digits = String(phone||'').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : '';
}

function _profileMessengerBtns(tg, max) {
  const items = [];
  if (tg) {
    items.push(`<a class="profile-msg-btn" href="${tg}" target="_blank" rel="noopener" title="Telegram">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#2CA5E0"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8l-1.68 7.93c-.12.55-.44.69-.9.43l-2.48-1.83-1.2 1.16c-.13.13-.25.25-.5.25l.18-2.52 4.56-4.12c.2-.18-.04-.27-.3-.1L7.92 14.45l-2.42-.75c-.52-.17-.53-.52.11-.77l9.48-3.66c.43-.16.82.11.55.53z"/></svg>
      <span>Telegram</span>
    </a>`);
  }
  if (max) {
    items.push(`<a class="profile-msg-btn max-icon-link" href="${max}" target="_blank" rel="noopener" title="MAX">
      ${maxIconSvg(20)}
      <span>MAX</span>
    </a>`);
  }
  return items.length
    ? `<div class="profile-msg-row">${items.join('')}</div>`
    : `<div class="profile-msg-empty">мессенджеры не указаны</div>`;
}

function _profileBuildSectionsHtml(matched, opts = {}) {
  const statsPanelId = opts.statsPanelId || 'profile-stats-panel';
  const row = _profileGetUserRow(matched.name) || [];
  const dob   = (row[5] || '').toString().trim();
  const id    = (row[6] || '').toString().trim();
  const tg    = (row[7] || '').toString().trim();
  const max   = (row[8] || '').toString().trim();
  const phone = (row[9] || '').toString().trim(); // колонка J
  const fio   = matched.name || '—';
  const position  = _profilePositionLabel(matched.role);
  const phoneHref = _profilePhoneHref(phone);
  const avatarSrc      = id ? `logos/avatar/${id}-joy.png` : '';
  const avatarFallback = id ? `logos/avatar/${id}-default.png` : '';
  return `
    <!-- ИНФО -->
    <div class="profile-section">
      <div class="profile-sec-title"><span>Инфо</span><span class="profile-sec-line"></span></div>
      <div class="profile-panel profile-info">
        <div class="profile-avatar-wrap">
          <div class="profile-avatar-inner">
            ${id
              ? `<img class="profile-avatar" src="${avatarSrc}" alt="" width="384" height="512" decoding="async" loading="eager" onerror="if(this.dataset.fb!=='1'){this.dataset.fb='1';this.src='${avatarFallback}';}else{this.style.display='none';}">`
              : `<div class="profile-avatar profile-avatar-placeholder">👤</div>`}
          </div>
        </div>
        <div class="profile-info-rows">
          <div class="profile-info-row"><div class="profile-info-lbl">ФИО</div><div class="profile-info-val">${fio}</div></div>
          <div class="profile-info-row"><div class="profile-info-lbl">Дата рождения</div><div class="profile-info-val">${dob || '—'}</div></div>
          <div class="profile-info-row"><div class="profile-info-lbl">Должность</div><div class="profile-info-val">${position}</div></div>
          <div class="profile-info-row">
            <div class="profile-info-lbl">Телефон</div>
            <div class="profile-info-val">${phoneHref ? `<a href="${phoneHref}" class="profile-phone-link">${phone}</a>` : '—'}</div>
          </div>
          <div class="profile-info-row profile-info-row-msg">
            <div class="profile-info-lbl">Мессенджеры</div>
            <div class="profile-info-val">${_profileMessengerBtns(tg, max)}</div>
          </div>
        </div>
      </div>
    </div>
    <!-- СТАТИСТИКА -->
    <div class="profile-section">
      <div class="profile-sec-title"><span>Статистика</span><span class="profile-sec-line"></span></div>
      <div class="profile-panel" id="${statsPanelId}">
        <div class="profile-stats-loading">
          <div class="profile-stats-spinner"></div>
          <div>Собираю данные за полгода…</div>
        </div>
      </div>
    </div>
    <!-- ТРОФЕИ -->
    <div class="profile-section">
      <div class="profile-sec-title"><span>Трофеи</span><span class="profile-sec-line"></span></div>
      <div class="profile-panel" id="${(opts.trophiesPanelId || 'profile-trophies-panel')}">
        <div class="profile-trophies-loading">…</div>
      </div>
    </div>
  `;
}

function renderProfile() {
  const el = document.getElementById('c-profile');
  if (!el) return;
  const matched = findUserInSheet();
  if (!matched) {
    el.innerHTML = `<div class="trophies-stub"><div class="trophies-stub-title">Профиль</div><div class="trophies-stub-text">Не удалось определить пользователя.</div></div>`;
    return;
  }
  el.innerHTML = _profileBuildSectionsHtml(matched, { statsPanelId: 'profile-stats-panel', trophiesPanelId: 'profile-trophies-panel' });
  _profileLoadAndRenderStats(matched.name, 'profile-stats-panel');
  _profileLoadAndRenderTrophies(matched.name, 'profile-trophies-panel');
}

/* ──── PROFILE MODAL (для просмотра карточек других менеджеров) ──── */
function openProfileModalFor(name) {
  if (!name) return;
  const row = _profileGetUserRow(name);
  if (!row) return;
  const matched = {
    name: (row[1] || name).toString().trim(),
    role: String(row[2] || '').toLowerCase().trim(),
  };
  const body = document.getElementById('profile-modal-body');
  if (!body) return;
  body.innerHTML = _profileBuildSectionsHtml(matched, { statsPanelId: 'profile-modal-stats-panel', trophiesPanelId: 'profile-modal-trophies-panel' });
  document.getElementById('profile-modal-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  _profileLoadAndRenderStats(matched.name, 'profile-modal-stats-panel');
  _profileLoadAndRenderTrophies(matched.name, 'profile-modal-trophies-panel');
  _attachScrollFadeUI(body);
  // Сохраняем имя просматриваемого профиля для presence-лейбла «Чекает стр. {имя}»
  S.viewingProfileOf = matched.name;
  if (typeof updateFirebasePage === 'function') updateFirebasePage();
}

// Скроллбар виден только во время активного скролла
function _attachScrollFadeUI(el) {
  if (!el || el._scrollFadeBound) return;
  el._scrollFadeBound = true;
  let timer = null;
  el.addEventListener('scroll', () => {
    el.classList.add('scrolling');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('scrolling'), 700);
  }, { passive: true });
}
function closeProfileModal() {
  document.getElementById('profile-modal-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
  S.viewingProfileOf = null;
  if (typeof updateFirebasePage === 'function') updateFirebasePage();
}
window.openProfileModalFor = openProfileModalFor;
window.closeProfileModal = closeProfileModal;

// HTML для иконки «Профиль» в строке мессенджеров рейтинга.
// Три варианта картинки сразу в DOM, переключение чисто через CSS body.*.
// Бейдж кол-ва трофеев у менеджера для карточки в рейтинге
// (число + тема-зависимая иконка трофеев из гамбургера).
function _trophyTotalForManager(name) {
  if (!Array.isArray(S.trophyAwards) || !name) return 0;
  const nl = String(name).toLowerCase().trim();
  let total = 0;
  for (let i = 1; i < S.trophyAwards.length; i++) {
    const row = S.trophyAwards[i];
    if (!row) continue;
    const code = String(row[0] || '').trim();
    const mgr  = String(row[1] || '').toLowerCase().trim();
    const status = String(row[5] || 'active').toLowerCase().trim();
    if (!code || mgr !== nl) continue;
    if (status === 'locked') continue;
    total++;
  }
  return total;
}

function _trophyCountBadgeHtml(name) {
  const count = _trophyTotalForManager(name);
  if (!count) return '';
  // 3 варианта иконки трофея под темы дашборда (как в гамбургере),
  // переключаются CSS-правилами body.fluent / body.cosmic.
  return `<div class="rating-trophy-badge" title="Трофеев: ${count}">
    <span class="rt-badge-num">${count}</span>
    <img class="rt-badge-ico rt-badge-ico-fluent" src="logos/Fluent/FluentColor-Trophies.svg" alt="" loading="lazy">
    <img class="rt-badge-ico rt-badge-ico-cosmic" src="logos/cosmic/cosmic-trophies.svg" alt="" loading="lazy">
    <span class="rt-badge-ico rt-badge-ico-default" style="background:currentColor;-webkit-mask:url('logos/default/trophies.svg') center/contain no-repeat;mask:url('logos/default/trophies.svg') center/contain no-repeat"></span>
  </div>`;
}

function _profileTriggerIconHtml(name) {
  const safe = String(name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  return `<a class="profile-modal-trigger" onclick="event.stopPropagation();openProfileModalFor('${safe}')" title="Профиль" style="cursor:pointer;display:inline-flex;align-items:center;text-decoration:none;margin-left:2px;opacity:0.7;transition:opacity .15s" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
    <img class="pmt-ico pmt-ico-fluent" src="logos/Fluent/FluentColor-profile.svg" alt="" style="width:18px;height:18px;display:none">
    <img class="pmt-ico pmt-ico-cosmic" src="logos/cosmic/cosmic-profile.svg" alt="" style="width:18px;height:18px;display:none">
    <span class="pmt-ico pmt-ico-default" style="display:none;width:18px;height:18px;background:currentColor;-webkit-mask:url('logos/default/profile.svg') center/contain no-repeat;mask:url('logos/default/profile.svg') center/contain no-repeat"></span>
  </a>`;
}

/* ──── PROFILE STATS (последние 6 месяцев) ──── */
function _profileSuffixes() {
  const list = [];
  const now = new Date();
  const MONTH_ABBR = ['ЯНВ','ФЕВ','МАР','АПР','МАЙ','ИЮН','ИЮЛ','АВГ','СЕН','ОКТ','НОЯ','ДЕК'];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const label = MONTH_ABBR[d.getMonth()];
    list.push({ sfx: mm + yy, label, year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return list.reverse(); // от старого к новому
}

function _profileAggMonth(rows, nameLow) {
  const r = { vis:0, kred:0, nal:0, kom:0, otkaz:0, fssp:0 };
  if (!Array.isArray(rows) || rows.length < 2) return r;
  // Статусы из колонки E (row[4]) — комментарий итоговой сделки/состояния
  const KRED  = 'покупка (кредит)';
  const NAL   = 'покупка (наличные)';
  const OBMEN = 'обмен';
  const KOM   = 'комиссия';
  const OTKAZ = 'отказ';
  const FSSP  = 'фссп не подаем';
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const mgr = String(row[8]||'').toLowerCase().trim();
    if (mgr !== nameLow) continue;
    r.vis++; // общее кол-во визитов = все строки менеджера за месяц
    const st = String(row[4]||'').toLowerCase().trim();
    if      (st === KRED)                  r.kred++;
    else if (st === NAL || st === OBMEN)   r.nal++;
    else if (st === KOM)                   r.kom++;
    else if (st === OTKAZ)                 r.otkaz++;
    else if (st === FSSP)                  r.fssp++;
  }
  return r;
}

async function _profileLoadAndRenderStats(name, panelId) {
  const panel = document.getElementById(panelId || 'profile-stats-panel');
  if (!panel) return;
  const nameLow = String(name||'').toLowerCase().trim();
  const months = _profileSuffixes();

  // Параллельно тянем по два листа на каждый месяц, ошибки → пустой массив
  const monthly = await Promise.all(months.map(async m => {
    const [crm, doz] = await Promise.all([
      api('ВИЗИТЫ'   + m.sfx, 'A:N').catch(() => null),
      api('Д_ВИЗИТЫ' + m.sfx, 'A:N').catch(() => null),
    ]);
    const aC = _profileAggMonth(crm, nameLow);
    const aD = _profileAggMonth(doz, nameLow);
    return {
      ...m,
      hasData: !!(crm || doz),
      vis:   aC.vis   + aD.vis,
      kred:  aC.kred  + aD.kred,
      nal:   aC.nal   + aD.nal,
      kom:   aC.kom   + aD.kom,
      otkaz: aC.otkaz + aD.otkaz,
      fssp:  aC.fssp  + aD.fssp,
    };
  }));

  // Если ни один месяц не доступен
  if (!monthly.some(m => m.hasData)) {
    panel.innerHTML = `<div class="profile-stats-error">Данные не удалось загрузить ни за один месяц.</div>`;
    return;
  }

  const METRICS = [
    { key:'vis',   label:'Визиты',     accent:'var(--acc)',
      ico:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' },
    { key:'kred',  label:'Кредиты',    accent:'#16a34a',
      ico:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>' },
    { key:'nal',   label:'Нал + Обмен', accent:'#0ea5e9',
      ico:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 6v12M9 9h4.5a2.5 2.5 0 0 1 0 5H9m0 0h5.5a2.5 2.5 0 0 1 0 5H9"/></svg>' },
    { key:'kom',   label:'Комиссия',   accent:'#a855f7',
      ico:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5L5 19M9 5h0M19 15h0"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>' },
    { key:'otkaz', label:'Отказ',      accent:'#ef4444',
      ico:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' },
    { key:'fssp',  label:'ФССП',       accent:'#f59e0b',
      ico:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-12V5l-8-3-8 3v5c0 8 8 12 8 12z"/></svg>' },
  ];

  // Общий total и max-значение для нормализации мини-баров
  const totals = {};
  METRICS.forEach(m => totals[m.key] = monthly.reduce((s,x)=>s+x[m.key],0));
  const failedCount = monthly.filter(m => !m.hasData).length;

  const cardHtml = METRICS.map(m => {
    const total = totals[m.key];
    const max   = Math.max(1, ...monthly.map(x => x[m.key]));
    const bars  = monthly.map(x => {
      const h = x.hasData ? Math.max(2, Math.round((x[m.key] / max) * 100)) : 0;
      const isMissing = !x.hasData;
      return `<div class="ps-bar-col" title="${x.label} ${x.year}: ${isMissing ? 'нет данных' : x[m.key]}">
        <div class="ps-bar-wrap"><div class="ps-bar ${isMissing?'ps-bar-missing':''}" style="height:${h}%;background:${m.accent}"></div></div>
        <div class="ps-bar-lbl">${x.label}</div>
      </div>`;
    }).join('');
    return `
      <div class="ps-card" style="--ps-accent:${m.accent}">
        <div class="ps-card-top">
          <div class="ps-card-hdr">
            <div class="ps-card-ico">${m.ico}</div>
            <div class="ps-card-lbl">${m.label}</div>
          </div>
          <div class="ps-card-right">
            <div class="ps-card-val mv">${total}</div>
            <div class="ps-card-sub">за полгода</div>
          </div>
        </div>
        <div class="ps-bars">${bars}</div>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="ps-hdr-note">${failedCount ? `Загружено ${6-failedCount} из 6 месяцев` : 'Данные за последние 6 месяцев'}</div>
    <div class="ps-grid">${cardHtml}</div>
  `;
}
/* ──── END PROFILE STATS ──── */

function openAbout() {
  const overlay = document.getElementById('about-overlay');
  if (overlay) { overlay.style.display = 'flex'; }
  // НЕ трогаем body.overflow — это ломает position:fixed на iOS
}
function openTrophies() {
  showScr('trophies');
  if (typeof dockSetActive === 'function') dockSetActive('home');
  // Гейт: если режим Off — все кроме CEO видят заглушку (бета у CEO).
  const matched = (typeof findUserInSheet === 'function') ? findUserInSheet() : null;
  const role = String(matched?.role || '').toLowerCase().trim();
  const isCEO = role === 'ceo';
  if (S.trophiesMode === false && !isCEO) {
    _renderTrophiesStub();
    return;
  }
  renderTrophiesPage();
}

function _renderTrophiesStub() {
  const el = document.getElementById('c-trophies');
  if (!el) return;
  el.innerHTML = `
    <div class="trophies-stub">
      <div class="trophies-stub-ico">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
          <path d="M4 22h16"/>
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
        </svg>
      </div>
      <div class="trophies-stub-title">Трофеи</div>
      <div class="trophies-stub-text">Раздел в разработке…</div>
    </div>`;
}

/* ════════════════════ ТРОФЕИ ════════════════════ */

// Кеш справочника (грузим один раз за сессию).
// Используем абсолютный URL через document.baseURI + retry один раз.
let _trophiesCatalogPromise = null;
function loadTrophiesCatalog() {
  if (S.trophies) return Promise.resolve(S.trophies);
  if (_trophiesCatalogPromise) return _trophiesCatalogPromise;
  const url = new URL('data/trophies.json?v=' + Date.now(), document.baseURI).href;
  const fetchOnce = () => fetch(url, { cache: 'no-store' })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)));
  _trophiesCatalogPromise = fetchOnce()
    .catch(() => new Promise(res => setTimeout(res, 500)).then(fetchOnce)) // 1 retry
    .then(j => { S.trophies = j; return j; })
    .catch(e => { _trophiesCatalogPromise = null; throw e; });
  return _trophiesCatalogPromise;
}

// Факты выдачи из листа TrophyAwards
// Столбцы (0-based): A=trophy_code, B=manager_name, C=awarded_at,
//   D=awarded_by, E=source(auto/manual), F=status(active/override/locked), G=note
function loadTrophyAwards() {
  if (S.trophyAwards) return Promise.resolve(S.trophyAwards);
  return api(SHEETS.trophyAwards, 'A:G')
    .then(rows => { S.trophyAwards = rows || []; return S.trophyAwards; })
    .catch(() => { S.trophyAwards = []; return S.trophyAwards; });
}

// Группировка выдач по trophy_code для конкретного менеджера
function _trophyAwardsForManager(name) {
  const nl = String(name || '').toLowerCase().trim();
  if (!nl || !Array.isArray(S.trophyAwards)) return {};
  const map = {};
  for (let i = 1; i < S.trophyAwards.length; i++) {
    const row = S.trophyAwards[i];
    if (!row) continue;
    const code = String(row[0] || '').trim();
    const mgr  = String(row[1] || '').toLowerCase().trim();
    const status = String(row[5] || 'active').toLowerCase().trim();
    if (!code || mgr !== nl) continue;
    if (status === 'locked') continue; // locked не показываем как полученные
    if (!map[code]) map[code] = { count: 0, items: [], lastDate: null };
    map[code].count++;
    const at = (row[2] || '').toString().trim();
    const item = {
      date:  at,
      by:    (row[3] || '').toString().trim(),
      src:   (row[4] || 'manual').toString().toLowerCase().trim(),
      stat:  status,
      note:  (row[6] || '').toString().trim(),
    };
    map[code].items.push(item);
    if (at && (!map[code].lastDate || at > map[code].lastDate)) map[code].lastDate = at;
  }
  return map;
}

function _trophyFormatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function _trophyTypeBadge(type) {
  if (type === 'positive') return '<span class="trophy-badge trophy-badge-pos">+</span>';
  if (type === 'negative') return '<span class="trophy-badge trophy-badge-neg">−</span>';
  return '<span class="trophy-badge trophy-badge-neu">·</span>';
}

async function renderTrophiesPage() {
  const el = document.getElementById('c-trophies');
  if (!el) return;
  el.innerHTML = loader();

  // Грузим независимо: каталог критичен, awards — нет (пустой лист или offline ОК).
  // Если каталог уже в S.trophies — отрисуемся даже при network-error.
  try { await loadTrophiesCatalog(); } catch (e) { /* fallback ниже */ }
  try { await loadTrophyAwards(); } catch (e) { S.trophyAwards = S.trophyAwards || []; }

  const catalog = (S.trophies && Array.isArray(S.trophies.trophies)) ? S.trophies.trophies : [];
  if (!catalog.length) {
    el.innerHTML = `<div class="empty">Не удалось загрузить справочник трофеев.<br><span style="font-size:11px;color:var(--txt3)">Проверьте подключение и обновите страницу.</span></div>`;
    return;
  }

  const matched = findUserInSheet();
  const myName = matched?.name || '';
  const isCeoLikeRole = isCeoLike(matched?.role);

  // Определяем режим отображения:
  //   CEO/ROP, view='catalog' (дефолт)  → весь каталог, без awards-привязки
  //   CEO/ROP, view='Имя'              → перечень полученных у этого менеджера
  //   обычный менеджер                 → только полученные у себя
  if (isCeoLikeRole) {
    if (!S.trophiesView || S.trophiesView === 'self') S.trophiesView = 'catalog';
  } else {
    S.trophiesView = myName;
  }
  const isCatalogMode = isCeoLikeRole && S.trophiesView === 'catalog';
  const viewName = isCatalogMode ? '' : (isCeoLikeRole ? S.trophiesView : myName);
  const awardsByCode = isCatalogMode ? {} : _trophyAwardsForManager(viewName);

  // Список менеджеров для селектора (только CEO/ROP)
  let mgrPicker = '';
  if (isCeoLikeRole && S.usersData) {
    const mgrs = [];
    for (let i = 1; i < S.usersData.length; i++) {
      const r = S.usersData[i];
      const nm = (r[1] || '').trim();
      const rl = (r[2] || '').toLowerCase().trim();
      if (!nm) continue;
      if (rl === 'crm' || rl === 'dozhim') mgrs.push(nm);
    }
    mgrs.sort((a, b) => a.localeCompare(b, 'ru'));
    // Считаем количество выданных трофеев у каждого менеджера (для подписи в селекторе)
    const _trophyCnt = (typeof _trophyTotalForManager === 'function')
      ? (n => _trophyTotalForManager(n))
      : () => 0;
    const opts = [`<option value="catalog"${isCatalogMode ? ' selected' : ''}>— Каталог (все трофеи) —</option>`]
      .concat(mgrs.map(n => {
        const cnt = _trophyCnt(n);
        const cntLbl = cnt > 0 ? ` · 🏆 ${cnt}` : '';
        return `<option value="${escapeHtml(n)}"${n === viewName ? ' selected' : ''}>${escapeHtml(n)}${cntLbl}</option>`;
      }));
    mgrPicker = `<div class="trophies-picker">
      <label class="trophies-picker-lbl">Просмотр:</label>
      <select class="trophies-picker-sel" onchange="trophiesSelectView(this.value)">${opts.join('')}</select>
    </div>`;
  }

  const _typeOrder = { positive: 0, neutral: 1, negative: 2 };

  // Карта быстрого поиска базы каталога по коду
  const _byCode = {};
  catalog.forEach(t => { _byCode[t.code] = t; });

  // Источник карточек:
  //   - catalog mode: все базовые трофеи (без годовых суффиксов).
  //   - manager mode: каждая выдача = карточка. Если код имеет
  //     суффикс года (hb_2026_annual), резолвим базовую запись
  //     из каталога и подменяем имя/иконку под этот год.
  const sourceList = isCatalogMode
    ? catalog.slice()
    : Object.keys(awardsByCode).map(code => _resolveTrophyCode(code, _byCode)).filter(Boolean);

  // Сортировка единым списком:
  //   - режим менеджера: по дате последнего получения, свежие → старые
  //   - каталог-режим (CEO): по типу (позитив → нейтрал → негатив), потом алфавит
  if (isCatalogMode) {
    sourceList.sort((a, b) =>
      (_typeOrder[(a.type||'neutral').toLowerCase()] - _typeOrder[(b.type||'neutral').toLowerCase()])
      || String(a.name||a.code).localeCompare(String(b.name||b.code), 'ru')
    );
  } else {
    sourceList.sort((a, b) => {
      const da = awardsByCode[a.code]?.lastDate || '';
      const db = awardsByCode[b.code]?.lastDate || '';
      if (db !== da) return db.localeCompare(da);
      return String(a.name||a.code).localeCompare(String(b.name||b.code), 'ru');
    });
    // Добавляем «инкогнито»-карточки нерасполученных трофеев в конец списка.
    // База для аннуальных — без года (hb_annual), у пользователя могут быть
    // hb_2025_annual / hb_2026_annual — считаем такой трофей полученным.
    const earnedBaseCodes = new Set();
    Object.keys(awardsByCode).forEach(code => {
      const m = String(code).match(/^(.+?)_(\d{4})_annual$/);
      earnedBaseCodes.add(m ? `${m[1]}_annual` : code);
    });
    const lockedCatalog = catalog
      .filter(t => !earnedBaseCodes.has(t.code))
      .sort((a, b) =>
        (_typeOrder[(a.type||'neutral').toLowerCase()] - _typeOrder[(b.type||'neutral').toLowerCase()])
        || String(a.name||a.code).localeCompare(String(b.name||b.code), 'ru')
      );
    sourceList.push(...lockedCatalog);
  }

  const earnedCount    = Object.values(awardsByCode).reduce((a, b) => a + (b.count || 0), 0);
  const earnedDistinct = Object.keys(awardsByCode).length;

  const renderCard = (t) => {
    const award = awardsByCode[t.code];
    const earned = !!award;
    const type = (t.type || 'neutral').toLowerCase();
    const iconSrc = `logos/trophies/${t.icon || ''}`;
    const dateLbl  = earned ? _trophyFormatDate(award.lastDate) : '';
    const countLbl = (earned && award.count > 1) ? ` ×${award.count}` : '';
    // Чип «авто/вручную» — только для CEO/ROP, остальным не показываем.
    let srcChip = '';
    if (isCeoLikeRole) {
      srcChip = earned
        ? `<span class="trophy-src trophy-src-${award.items[0]?.src || 'manual'}">${award.items[0]?.src === 'auto' ? 'авто' : 'вручную'}</span>`
        : (t.auto ? '<span class="trophy-src trophy-src-auto trophy-src-mute">авто</span>'
                  : '<span class="trophy-src trophy-src-manual trophy-src-mute">вручную</span>');
    }
    return `
      <div class="trophy-card trophy-card-${type} ${earned ? 'trophy-earned' : (isCatalogMode ? '' : 'trophy-locked')}">
        <div class="trophy-card-ico">
          <img src="${iconSrc}" alt="" loading="lazy" onerror="this.style.display='none'">
        </div>
        <div class="trophy-card-body">
          <div class="trophy-card-hdr">
            ${_trophyTypeBadge(type)}
            <div class="trophy-card-name">${escapeHtml(t.name || t.code)}${countLbl}</div>
            ${srcChip}
          </div>
          <div class="trophy-card-desc">${escapeHtml(t.description || t.script || '')}</div>
          ${isCeoLikeRole && t.script ? `<div class="trophy-card-script" title="Сценарий выдачи (виден только CEO/ROP)">${escapeHtml(t.script)}</div>` : ''}
          ${dateLbl ? `<div class="trophy-card-date">получен: ${dateLbl}</div>` : ''}
        </div>
      </div>`;
  };

  const renderFlatGrid = (list) => {
    if (!list.length) return '';
    return `<div class="trophies-grid">${list.map(renderCard).join('')}</div>`;
  };

  // Шапка / счётчик
  let headerTitle, counterHtml;
  if (isCatalogMode) {
    headerTitle = 'Каталог трофеев';
    counterHtml = `<div class="trophies-counter">всего <span class="mv">${catalog.length}</span> трофеев</div>`;
  } else {
    headerTitle = viewName || 'Трофеи';
    // У CEO/ROP остаётся «N из M», у менеджера CRM/Дожим — только «всего трофеев N»
    counterHtml = isCeoLikeRole
      ? `<div class="trophies-counter"><span class="mv">${earnedDistinct}</span> из ${catalog.length}<span class="trophies-counter-sub"> · всего трофеев ${earnedCount}</span></div>`
      : `<div class="trophies-counter">всего трофеев <span class="mv">${earnedCount}</span></div>`;
  }

  // Пустое состояние для менеджера: получено пока ноль
  const emptyHint = (!isCatalogMode && !sourceList.length)
    ? `<div class="empty" style="margin-top:18px">Пока нет полученных трофеев.</div>`
    : '';

  const awardBtn = isCeoLikeRole
    ? `<button class="trophies-award-btn" onclick="openAwardTrophyModal()" title="Выдать трофей вручную">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
         <span>Выдать трофей</span>
       </button>`
    : '';

  el.innerHTML = `
    <div class="trophies-page">
      <div class="trophies-hdr">
        <div class="trophies-title-row">
          <div class="trophies-title">${escapeHtml(headerTitle)}</div>
          ${counterHtml}
        </div>
        ${mgrPicker}
        ${awardBtn}
      </div>
      ${renderFlatGrid(sourceList)}
      ${emptyHint}
    </div>
  `;
}

function trophiesSelectView(v) {
  S.trophiesView = v;
  renderTrophiesPage();
}
window.trophiesSelectView = trophiesSelectView;

/* ──────── ВЫДАЧА ТРОФЕЯ ВРУЧНУЮ (CEO/ROP) ──────── */
function _awardEnsureOverlay() {
  let ov = document.getElementById('award-trophy-overlay');
  if (ov) return ov;
  ov = document.createElement('div');
  ov.id = 'award-trophy-overlay';
  ov.className = 'award-trophy-overlay';
  ov.innerHTML = `
    <div class="award-trophy-shell">
      <div class="award-trophy-hdr">
        <div class="award-trophy-title">Выдать трофей</div>
        <button class="award-trophy-close" onclick="closeAwardTrophyModal()" aria-label="Закрыть">×</button>
      </div>
      <div class="award-trophy-body" id="award-trophy-body"></div>
    </div>`;
  document.body.appendChild(ov);
  return ov;
}

async function openAwardTrophyModal() {
  const ov = _awardEnsureOverlay();
  const body = document.getElementById('award-trophy-body');
  ov.classList.add('open');
  document.body.style.overflow = 'hidden';
  body.innerHTML = `<div class="award-loading">Загрузка…</div>`;
  try {
    await Promise.all([loadTrophiesCatalog(), loadTrophyAwards()]);
  } catch (e) {}
  const catalog = (S.trophies && Array.isArray(S.trophies.trophies)) ? S.trophies.trophies : [];
  if (!catalog.length) {
    body.innerHTML = `<div class="award-loading">Не удалось загрузить каталог трофеев</div>`;
    return;
  }
  // Список менеджеров
  const mgrs = [];
  if (S.usersData) {
    for (let i = 1; i < S.usersData.length; i++) {
      const r = S.usersData[i];
      const nm = (r[1]||'').trim();
      const rl = (r[2]||'').toLowerCase().trim();
      if (!nm) continue;
      if (rl === 'crm' || rl === 'dozhim') mgrs.push(nm);
    }
    mgrs.sort((a,b) => a.localeCompare(b, 'ru'));
  }
  // Сортируем каталог: тип → имя
  const order = { positive: 0, neutral: 1, negative: 2 };
  const cat = catalog.slice().sort((a,b) =>
    (order[(a.type||'neutral').toLowerCase()] - order[(b.type||'neutral').toLowerCase()])
    || String(a.name||a.code).localeCompare(String(b.name||b.code), 'ru')
  );
  const trophyOpts = cat.map(t =>
    `<option value="${escapeAttr(t.code)}">${escapeHtml(t.name||t.code)} · ${escapeHtml((t.type||'neutral'))}${t.category?' · '+escapeHtml(t.category):''}</option>`
  ).join('');
  const mgrOpts = mgrs.map(n => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join('');
  const today = new Date().toISOString().slice(0,10);
  body.innerHTML = `
    <div class="award-form">
      <div class="award-field">
        <label class="award-label">Трофей</label>
        <select class="award-input" id="award-code" required>
          <option value="">— Выберите трофей —</option>
          ${trophyOpts}
        </select>
      </div>
      <div class="award-field">
        <label class="award-label">Менеджер</label>
        <select class="award-input" id="award-mgr" required>
          <option value="">— Выберите менеджера —</option>
          ${mgrOpts}
        </select>
      </div>
      <div class="award-field">
        <label class="award-label">Дата выдачи</label>
        <input type="date" class="award-input" id="award-date" value="${today}">
      </div>
      <div class="award-field">
        <label class="award-label">Примечание <span class="award-hint">(необязательно)</span></label>
        <input type="text" class="award-input" id="award-note" placeholder="например: 2026-05 · ручная выдача">
      </div>
      <div class="award-actions">
        <button class="award-cancel" onclick="closeAwardTrophyModal()">Отмена</button>
        <button class="award-submit" id="award-submit-btn" onclick="submitAwardTrophy()">Выдать</button>
      </div>
      <div class="award-msg" id="award-msg"></div>
    </div>`;
}

function closeAwardTrophyModal() {
  const ov = document.getElementById('award-trophy-overlay');
  if (!ov) return;
  ov.classList.remove('open');
  document.body.style.overflow = '';
}

async function submitAwardTrophy() {
  const code = document.getElementById('award-code')?.value || '';
  const mgr  = document.getElementById('award-mgr')?.value || '';
  const date = document.getElementById('award-date')?.value || new Date().toISOString().slice(0,10);
  const note = (document.getElementById('award-note')?.value || '').trim();
  const msg = document.getElementById('award-msg');
  const btn = document.getElementById('award-submit-btn');
  if (!code || !mgr) { if (msg) { msg.textContent = 'Выберите трофей и менеджера'; msg.className = 'award-msg award-err'; } return; }
  if (btn) btn.disabled = true;
  if (msg) { msg.textContent = 'Сохраняю…'; msg.className = 'award-msg'; }
  try {
    const me = findUserInSheet();
    const awardedBy = me?.name || 'system';
    const row = [[code, mgr, date, awardedBy, 'manual', 'active', note]];
    const sheetName = SHEETS.trophyAwards || 'TrophyAwards';
    const range = encodeURIComponent(`'${sheetName}'!A:G`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ values: row }),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    // Сбрасываем кеш и обновляем страницу трофеев
    S.trophyAwards = null;
    if (msg) { msg.textContent = '✓ Трофей выдан'; msg.className = 'award-msg award-ok'; }
    try { toast('Трофей выдан: ' + code + ' → ' + mgr, 's'); } catch(_) {}
    setTimeout(() => {
      closeAwardTrophyModal();
      if (document.getElementById('scr-trophies')?.classList.contains('on')) renderTrophiesPage();
    }, 700);
  } catch (e) {
    if (msg) { msg.textContent = 'Ошибка: ' + e.message; msg.className = 'award-msg award-err'; }
    if (btn) btn.disabled = false;
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const ov = document.getElementById('award-trophy-overlay');
  if (ov && ov.classList.contains('open')) closeAwardTrophyModal();
});

window.openAwardTrophyModal  = openAwardTrophyModal;
window.closeAwardTrophyModal = closeAwardTrophyModal;
window.submitAwardTrophy     = submitAwardTrophy;

// Резолвим выдачу с возможным годовым суффиксом (hb_2026_annual)
// к базовой записи каталога (hb_annual) + подменяем имя/иконку под этот год.
function _resolveTrophyCode(code, byCode) {
  if (!code) return null;
  if (byCode[code]) return byCode[code];
  const m = String(code).match(/^(.+)_(\d{4})_annual$/);
  if (m) {
    const base = byCode[m[1] + '_annual'];
    if (base) {
      return Object.assign({}, base, {
        code: code,
        icon: `${m[1]}_${m[2]}_annual.png`,
        name: `${base.name} ${m[2]}`,
      });
    }
  }
  return null;
}
window._resolveTrophyCode = _resolveTrophyCode;

// Маленькая панель трофеев внутри профиля: только иконки полученных трофеев,
// без описаний и подписей. Грузит каталог + TrophyAwards если ещё не подгружены.
async function _profileLoadAndRenderTrophies(name, panelId) {
  const panel = document.getElementById(panelId || 'profile-trophies-panel');
  if (!panel) return;
  try {
    await Promise.all([loadTrophiesCatalog(), loadTrophyAwards()]);
  } catch (e) {
    panel.innerHTML = `<div class="profile-trophies-empty">Не удалось загрузить трофеи</div>`;
    return;
  }
  const catalog = (S.trophies && Array.isArray(S.trophies.trophies)) ? S.trophies.trophies : [];
  const byCode = {};
  catalog.forEach(t => { byCode[t.code] = t; });
  const awards = _trophyAwardsForManager(name);
  const codes = Object.keys(awards);

  // Заголовок секции — обновляем «Трофеи · N шт» (или просто «Трофеи»)
  const sectionTitleSpan = panel.parentElement?.querySelector('.profile-sec-title > span:first-child');

  if (!codes.length) {
    if (sectionTitleSpan) sectionTitleSpan.textContent = 'Трофеи';
    panel.innerHTML = `<div class="profile-trophies-empty">Пока нет трофеев</div>`;
    return;
  }
  // Сортируем: по дате последней выдачи (свежие первыми), затем алфавит
  codes.sort((a, b) => {
    const da = awards[a].lastDate || '', db = awards[b].lastDate || '';
    if (db !== da) return db.localeCompare(da);
    return String(byCode[a]?.name || a).localeCompare(String(byCode[b]?.name || b), 'ru');
  });
  // Общее число всех трофеев (с учётом ×N) — для заголовка секции
  const totalAwards = codes.reduce((sum, code) => sum + (awards[code].count || 0), 0);
  if (sectionTitleSpan) sectionTitleSpan.textContent = `Трофеи · ${totalAwards} шт`;
  // Показываем последние 6 (сортировка уже по lastDate desc)
  const slice = codes.slice(0, 6);
  const items = slice.map(code => {
    const t = _resolveTrophyCode(code, byCode);
    const award = awards[code];
    const icon = t?.icon || '';
    const title = (t?.name || code) + (award.count > 1 ? ` ×${award.count}` : '');
    const countBadge = award.count > 1 ? `<span class="profile-trophy-count">×${award.count}</span>` : '';
    return `<div class="profile-trophy" title="${escapeAttr(title)}">
      ${icon ? `<img src="logos/trophies/${escapeHtml(icon)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
      ${countBadge}
    </div>`;
  }).join('');
  panel.innerHTML = `<div class="profile-trophies-grid">${items}</div>`;
}
window._profileLoadAndRenderTrophies = _profileLoadAndRenderTrophies;
/* ════════════════════ END ТРОФЕИ ════════════════════ */
function closeAbout() {
  const overlay = document.getElementById('about-overlay');
  if (overlay) { overlay.style.display = 'none'; }
}

// ==================== HAMBURGER MENU ====================
function toggleHamburger(e) {
  e.stopPropagation();
  const dd = document.getElementById('hamburger-dropdown');
  const bd = document.getElementById('hamburger-backdrop');
  dd.classList.toggle('open');
  const isOpen = dd.classList.contains('open');
  if (bd) bd.classList.toggle('open', isOpen);
  document.body.classList.toggle('hamburger-open', isOpen);
  if (isOpen) {
    setTimeout(() => {
      document.addEventListener('click', closeHamburgerOutside);
      document.addEventListener('touchstart', closeHamburgerOutside, {passive:true});
    }, 0);
  }
}
function closeHamburgerOutside(e) {
  const wrap = document.getElementById('hamburger-wrap');
  if (wrap && !wrap.contains(e.target)) {
    closeHamburger();
  }
}
function closeHamburger() {
  document.getElementById('hamburger-dropdown')?.classList.remove('open');
  document.getElementById('hamburger-backdrop')?.classList.remove('open');
  document.body.classList.remove('hamburger-open');
  const themeSub = document.getElementById('hmb-theme-sub');
  const monthSub = document.getElementById('hmb-month-sub');
  const themeTrigger = document.querySelector('.hmb-theme-trigger');
  const monthTrigger = document.getElementById('hmb-month-trigger');
  if (themeSub) { themeSub.style.display = 'none'; themeSub.classList.remove('open'); }
  if (monthSub) { monthSub.style.display = 'none'; }
  if (themeTrigger) themeTrigger.classList.remove('expanded');
  if (monthTrigger) monthTrigger.classList.remove('expanded');
  document.removeEventListener('click', closeHamburgerOutside);
  document.removeEventListener('touchstart', closeHamburgerOutside);
}
function toggleHmbTheme(e) {
  e.stopPropagation();
  const sub = document.getElementById('hmb-theme-sub');
  const trigger = e.currentTarget;
  if (!sub) return;
  const isOpen = sub.style.display === 'flex';
  if (isOpen) {
    sub.style.display = 'none';
    trigger.classList.remove('expanded');
  } else {
    // Закрываем месяц если открыт
    const mSub = document.getElementById('hmb-month-sub');
    const mTrig = document.getElementById('hmb-month-trigger');
    if (mSub && mSub.style.display === 'flex') {
      mSub.style.display = 'none';
      if (mTrig) mTrig.classList.remove('expanded');
    }
    sub.style.display = 'flex';
    sub.style.flexDirection = 'column';
    trigger.classList.add('expanded');
  }
}

// ==================== LOGIN LIQUID GRADIENT ====================
(function() {
  let _app = null;

  function isLightTheme() {
    return document.body.classList.contains('light') || document.body.classList.contains('tiffany') || document.body.classList.contains('cosmic') || document.body.classList.contains('fluent');
  }

  function initLiquid() {
    if (!window.THREE) return;
    const canvas = document.getElementById('login-liquid-canvas');
    if (!canvas) return;
    if (_app) { _app.cleanup(); _app = null; }

    // Show canvas
    canvas.style.display = 'block';

    const T = window.THREE;
    const W = window.innerWidth, H = window.innerHeight;

    // ---- Touch texture ----
    const ttC = document.createElement('canvas');
    ttC.width = ttC.height = 64;
    const ttCtx = ttC.getContext('2d');
    ttCtx.fillStyle='black'; ttCtx.fillRect(0,0,64,64);
    const ttTex = new T.Texture(ttC);
    let trail=[], ttLast=null;

    function ttDraw(p) {
      const px=p.x*64, py=(1-p.y)*64;
      let inten = p.age<19.2 ? Math.sin((p.age/19.2)*(Math.PI/2))
        : -((1-(p.age-19.2)/44.8)*((1-(p.age-19.2)/44.8)-2));
      inten *= p.force;
      const col=`${((p.vx+1)/2)*255},${((p.vy+1)/2)*255},${inten*255}`;
      ttCtx.shadowOffsetX=ttCtx.shadowOffsetY=320; ttCtx.shadowBlur=6.4;
      ttCtx.shadowColor=`rgba(${col},${0.2*inten})`;
      ttCtx.beginPath(); ttCtx.fillStyle='rgba(255,0,0,1)';
      ttCtx.arc(px-320,py-320,6.4,0,Math.PI*2); ttCtx.fill();
    }

    function ttUpdate() {
      ttCtx.fillStyle='black'; ttCtx.fillRect(0,0,64,64);
      for(let i=trail.length-1;i>=0;i--){
        const p=trail[i], f=p.force*(1/64)*(1-p.age/64);
        p.x+=p.vx*f; p.y+=p.vy*f; p.age++;
        if(p.age>64) trail.splice(i,1); else ttDraw(p);
      }
      ttTex.needsUpdate=true;
    }

    function addTouch(pt) {
      let force=0,vx=0,vy=0;
      if(ttLast){
        const dx=pt.x-ttLast.x, dy=pt.y-ttLast.y;
        if(!dx&&!dy) return;
        const d=Math.sqrt(dx*dx+dy*dy); vx=dx/d; vy=dy/d;
        force=Math.min((dx*dx+dy*dy)*20000,2);
      }
      ttLast={x:pt.x,y:pt.y};
      trail.push({x:pt.x,y:pt.y,age:0,force,vx,vy});
    }

    // ---- Three.js ----
    const renderer = new T.WebGLRenderer({canvas, antialias:true, alpha:false});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer.setSize(W,H);

    const camera = new T.PerspectiveCamera(45,W/H,0.1,10000);
    camera.position.z=50;
    const scene = new T.Scene();

    function getVS() {
      const fov=(camera.fov*Math.PI)/180;
      const h=Math.abs(camera.position.z*Math.tan(fov/2)*2);
      return {width:h*camera.aspect,height:h};
    }

    function getColors() {
      const lm = isLightTheme();
      return lm
        ? {c1:[1.0,0.5,0.35],c2:[0.9,0.95,1.0],navy:[0.95,0.97,1.0],bg:0xf5f7ff}
        : {c1:[0.945,0.353,0.133],c2:[0.039,0.055,0.153],navy:[0.039,0.055,0.153],bg:0x0a0e27};
    }

    const cols=getColors();
    const uniforms={
      uTime:{value:0}, uResolution:{value:new T.Vector2(W,H)},
      uColor1:{value:new T.Vector3(...cols.c1)}, uColor2:{value:new T.Vector3(...cols.c2)},
      uColor3:{value:new T.Vector3(...cols.c1)}, uColor4:{value:new T.Vector3(...cols.c2)},
      uColor5:{value:new T.Vector3(...cols.c1)}, uColor6:{value:new T.Vector3(...cols.c2)},
      uDarkNavy:{value:new T.Vector3(...cols.navy)},
      uSpeed:{value:1.2}, uIntensity:{value:1.8},
      uGrainIntensity:{value:0.06}, uGradientSize:{value:0.45},
      uColor1Weight:{value:0.5}, uColor2Weight:{value:1.8},
      uTouchTexture:{value:ttTex}
    };
    scene.background=new T.Color(cols.bg);

    const vs=`varying vec2 vUv;void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);vUv=uv;}`;
    const fs=`
      uniform float uTime,uSpeed,uIntensity,uGrainIntensity,uGradientSize,uColor1Weight,uColor2Weight;
      uniform vec2 uResolution;
      uniform vec3 uColor1,uColor2,uColor3,uColor4,uColor5,uColor6,uDarkNavy;
      uniform sampler2D uTouchTexture;
      varying vec2 vUv;
      float grain(vec2 uv,float t){return fract(sin(dot(uv*uResolution*0.5+t,vec2(12.9898,78.233)))*43758.5453)*2.0-1.0;}
      vec3 getGrad(vec2 uv,float time){
        vec2 c1=vec2(0.5+sin(time*uSpeed*0.4)*0.4,0.5+cos(time*uSpeed*0.5)*0.4);
        vec2 c2=vec2(0.5+cos(time*uSpeed*0.6)*0.5,0.5+sin(time*uSpeed*0.45)*0.5);
        vec2 c3=vec2(0.5+sin(time*uSpeed*0.35)*0.45,0.5+cos(time*uSpeed*0.55)*0.45);
        vec2 c4=vec2(0.5+cos(time*uSpeed*0.5)*0.4,0.5+sin(time*uSpeed*0.4)*0.4);
        vec2 c5=vec2(0.5+sin(time*uSpeed*0.7)*0.35,0.5+cos(time*uSpeed*0.6)*0.35);
        vec2 c6=vec2(0.5+cos(time*uSpeed*0.45)*0.5,0.5+sin(time*uSpeed*0.65)*0.5);
        float i1=1.0-smoothstep(0.0,uGradientSize,length(uv-c1));
        float i2=1.0-smoothstep(0.0,uGradientSize,length(uv-c2));
        float i3=1.0-smoothstep(0.0,uGradientSize,length(uv-c3));
        float i4=1.0-smoothstep(0.0,uGradientSize,length(uv-c4));
        float i5=1.0-smoothstep(0.0,uGradientSize,length(uv-c5));
        float i6=1.0-smoothstep(0.0,uGradientSize,length(uv-c6));
        vec3 col=vec3(0.0);
        col+=uColor1*i1*(0.55+0.45*sin(time*uSpeed))*uColor1Weight;
        col+=uColor2*i2*(0.55+0.45*cos(time*uSpeed*1.2))*uColor2Weight;
        col+=uColor3*i3*(0.55+0.45*sin(time*uSpeed*0.8))*uColor1Weight;
        col+=uColor4*i4*(0.55+0.45*cos(time*uSpeed*1.3))*uColor2Weight;
        col+=uColor5*i5*(0.55+0.45*sin(time*uSpeed*1.1))*uColor1Weight;
        col+=uColor6*i6*(0.55+0.45*cos(time*uSpeed*0.9))*uColor2Weight;
        col=clamp(col,vec3(0.0),vec3(1.0))*uIntensity;
        float lum=dot(col,vec3(0.299,0.587,0.114));
        col=mix(vec3(lum),col,1.35); col=pow(col,vec3(0.92));
        col=mix(uDarkNavy,col,max(length(col)*1.2,0.15));
        return col;
      }
      void main(){
        vec2 uv=vUv;
        vec4 tt=texture2D(uTouchTexture,uv);
        uv.x-=(tt.r*2.0-1.0)*0.8*tt.b; uv.y-=(tt.g*2.0-1.0)*0.8*tt.b;
        float ripple=sin(length(uv-vec2(0.5))*20.0-uTime*3.0)*0.04*tt.b;
        uv+=vec2(ripple);
        vec3 col=getGrad(uv,uTime);
        col+=grain(uv,uTime)*uGrainIntensity;
        gl_FragColor=vec4(clamp(col,vec3(0.0),vec3(1.0)),1.0);
      }
    `;

    const vs_=getVS();
    let mesh=new T.Mesh(new T.PlaneGeometry(vs_.width,vs_.height,1,1),
      new T.ShaderMaterial({uniforms,vertexShader:vs,fragmentShader:fs}));
    scene.add(mesh);

    let animId=null, lastTime=performance.now();
    function tick(){
      animId=requestAnimationFrame(tick);
      const now=performance.now(), delta=Math.min((now-lastTime)/1000,0.1); lastTime=now;
      uniforms.uTime.value+=delta;
      ttUpdate();
      renderer.render(scene,camera);
    }
    tick();

    // Interaction
    const scrEl=document.getElementById('scr-login');
    function onMove(x,y){addTouch({x:x/window.innerWidth,y:1-y/window.innerHeight});}
    const mvH=e=>{const r=scrEl.getBoundingClientRect();onMove(e.clientX-r.left,e.clientY-r.top);};
    const tmH=e=>{const r=scrEl.getBoundingClientRect();onMove(e.touches[0].clientX-r.left,e.touches[0].clientY-r.top);};
    document.addEventListener('mousemove',mvH);
    document.addEventListener('touchmove',tmH,{passive:true});

    // Resize
    function onResize(){
      const nW=window.innerWidth,nH=window.innerHeight;
      camera.aspect=nW/nH; camera.updateProjectionMatrix();
      renderer.setSize(nW,nH); uniforms.uResolution.value.set(nW,nH);
      const vs2=getVS(); scene.remove(mesh); mesh.geometry.dispose();
      mesh=new T.Mesh(new T.PlaneGeometry(vs2.width,vs2.height,1,1),mesh.material);
      scene.add(mesh);
    }
    window.addEventListener('resize',onResize);

    // Theme watcher
    const thObs=new MutationObserver(()=>{
      const c2=getColors();
      ['uColor1','uColor3','uColor5'].forEach(k=>uniforms[k].value.set(...c2.c1));
      ['uColor2','uColor4','uColor6'].forEach(k=>uniforms[k].value.set(...c2.c2));
      uniforms.uDarkNavy.value.set(...c2.navy);
      scene.background=new T.Color(c2.bg);
    });
    thObs.observe(document.body,{attributes:true,attributeFilter:['class']});

    _app={
      cleanup(){
        if(animId) cancelAnimationFrame(animId);
        document.removeEventListener('mousemove',mvH);
        document.removeEventListener('touchmove',tmH);
        window.removeEventListener('resize',onResize);
        thObs.disconnect();
        renderer.dispose(); ttTex.dispose();
        canvas.style.display='none';
        trail=[]; ttLast=null;
      }
    };
  }

  window._loginLiquidInit    = initLiquid;
  window._loginLiquidCleanup = function(){ if(_app){_app.cleanup();_app=null;} };
})();



// ==================== BACKGROUND CANVAS ====================
(function() {
  const canvas2d = document.getElementById('bg-canvas');
  if (!canvas2d) return;

  // ── WebGL canvas for shader-based themes (cosmic + tiffany) ──────────
  const glCanvas = document.createElement('canvas');
  glCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;display:none';
  document.body.insertBefore(glCanvas, canvas2d);

  const gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');

  // Per-theme config: 6 RGB colors, distortion, swirl, speed, offsetX, veil (RGBA), vignette, grid
  const GL_THEMES = {
    cosmic: {
      cols:[[0,0,0],[0.024,0.714,0.831],[0.086,0.306,0.388],[0.976,0.451,0.086],[0.031,0.569,0.698],[0,0,0]],
      dist:2.8, swirl:0.0, speed:0.13, offX:0,
      veil:[0,0,0,0], vig:1.0, grid:1.0
    },
    tiffany: {
      cols:[[0.447,0.725,0.733],[0.710,0.851,0.851],[1,0.820,0.741],[1,0.922,0.878],[0.549,0.773,0.722],[0.859,0.957,0.643]],
      dist:1.2, swirl:0.5, speed:0.18, offX:0.08,
      veil:[1,1,1,0.18], vig:0.0, grid:0.0
    }
  };

  let glReady = false, uLocs = {}, lastTheme = null;

  if (gl) {
    const VS = `attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos,0.,1.);}`;
    const FS = `
      precision highp float;
      uniform float u_time,u_dist,u_swirl,u_speed,u_offX,u_vig,u_grid;
      uniform vec2  u_res;
      uniform vec3  u_c[6];
      uniform vec4  u_veil;

      float hash(vec2 p){p=fract(p*vec2(234.34,435.345));p+=dot(p,p+34.23);return fract(p.x*p.y);}
      float vn(vec2 p){
        vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }

      void main(){
        vec2 uv=gl_FragCoord.xy/u_res;
        float ar=u_res.x/u_res.y;
        vec2 p=vec2((uv.x+u_offX)*ar,uv.y);
        float t=u_time*u_speed;

        /* swirl around centre */
        vec2 ctr=vec2(ar*.5,.5);
        vec2 dv=p-ctr;
        float ang=atan(dv.y,dv.x)+u_swirl*length(dv)*2.5;
        p=ctr+length(dv)*vec2(cos(ang),sin(ang));

        /* two-layer domain warp (distortion strength via u_dist) */
        vec2 q=vec2(vn(p*1.6+t*.28),vn(p*1.6+vec2(5.2,1.3)+t*.22));
        vec2 r=vec2(vn(p*1.4+u_dist*q+vec2(1.7,9.2)+t*.14),vn(p*1.4+u_dist*q+vec2(8.3,2.8)+t*.11));
        float f =vn(p*1.8+(u_dist+1.)*r+t*.09);
        float f2=vn(p*2.2+ u_dist   *r+vec2(4.1,7.6)+t*.07);
        float h=clamp(f*.6+f2*.4,0.,1.);

        /* sequential 6-colour palette — each zone is 1/6 of 0..1 */
        float s=h*6.; float seg=floor(s); float fr=smoothstep(0.,1.,fract(s));
        vec3 ca=seg<1.?u_c[0]:seg<2.?u_c[1]:seg<3.?u_c[2]:seg<4.?u_c[3]:seg<5.?u_c[4]:u_c[5];
        vec3 cb=seg<1.?u_c[1]:seg<2.?u_c[2]:seg<3.?u_c[3]:seg<4.?u_c[4]:seg<5.?u_c[5]:u_c[0];
        vec3 col=mix(ca,cb,fr);

        /* white/colour veil */
        col=mix(col,u_veil.rgb,u_veil.a);

        /* wireframe grid (cosmic) */
        vec2 g=fract(uv*vec2(16.,10.));float lw=.018;
        float lines=smoothstep(lw,0.,g.x)+smoothstep(1.-lw,1.,g.x)+smoothstep(lw,0.,g.y)+smoothstep(1.-lw,1.,g.y);
        col=mix(col,vec3(.024,.714,.831),clamp(lines,0.,1.)*.06*u_grid);

        /* vignette (cosmic) */
        float vig=1.-dot(uv-.5,uv-.5)*1.6;
        col*=mix(1.,clamp(vig,0.,1.),u_vig);

        gl_FragColor=vec4(col,1.);
      }
    `;
    function mkShader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);return s;}
    const prog=gl.createProgram();
    gl.attachShader(prog,mkShader(gl.VERTEX_SHADER,VS));
    gl.attachShader(prog,mkShader(gl.FRAGMENT_SHADER,FS));
    gl.linkProgram(prog);
    if(gl.getProgramParameter(prog,gl.LINK_STATUS)){
      gl.useProgram(prog);
      const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      const aPos=gl.getAttribLocation(prog,'a_pos');
      gl.enableVertexAttribArray(aPos);gl.vertexAttribPointer(aPos,2,gl.FLOAT,false,0,0);
      uLocs={
        time:gl.getUniformLocation(prog,'u_time'), res:gl.getUniformLocation(prog,'u_res'),
        dist:gl.getUniformLocation(prog,'u_dist'), swirl:gl.getUniformLocation(prog,'u_swirl'),
        speed:gl.getUniformLocation(prog,'u_speed'),offX:gl.getUniformLocation(prog,'u_offX'),
        veil:gl.getUniformLocation(prog,'u_veil'), vig:gl.getUniformLocation(prog,'u_vig'),
        grid:gl.getUniformLocation(prog,'u_grid'),
        cols:Array.from({length:6},(_,i)=>gl.getUniformLocation(prog,`u_c[${i}]`))
      };
      glReady=true;
    }
  }

  function applyTheme(name){
    const c=GL_THEMES[name];
    c.cols.forEach(([r,g,b],i)=>gl.uniform3f(uLocs.cols[i],r,g,b));
    gl.uniform1f(uLocs.dist,c.dist); gl.uniform1f(uLocs.swirl,c.swirl);
    gl.uniform1f(uLocs.speed,c.speed);gl.uniform1f(uLocs.offX,c.offX);
    gl.uniform4f(uLocs.veil,...c.veil);
    gl.uniform1f(uLocs.vig,c.vig);  gl.uniform1f(uLocs.grid,c.grid);
  }

  function resizeGL(){glCanvas.width=window.innerWidth;glCanvas.height=window.innerHeight;if(gl)gl.viewport(0,0,glCanvas.width,glCanvas.height);}
  resizeGL();

  // ── Canvas 2D orbs (all other themes) ────────────────────────────────
  const ctx=canvas2d.getContext('2d');
  function resize2d(){canvas2d.width=window.innerWidth;canvas2d.height=window.innerHeight;}
  resize2d();
  window.addEventListener('resize',()=>{resize2d();resizeGL();});

  class Orb{
    constructor(){this.reset();}
    reset(){
      this.x=Math.random()*canvas2d.width; this.y=Math.random()*canvas2d.height;
      this.baseRadius=60+Math.random()*120; this.radius=0; this.alpha=0;
      this.vx=(Math.random()-.5)*.5; this.vy=(Math.random()-.5)*.5;
    }
    update(){
      this.x+=this.vx; this.y+=this.vy;
      if(this.alpha<1)this.alpha+=.01;
      if(this.radius<this.baseRadius)this.radius+=this.baseRadius*.02;
      if(this.x<-500||this.x>canvas2d.width+500||this.y<-500||this.y>canvas2d.height+500)this.reset();
    }
    draw(){
      const isLight=document.body.classList.contains('light');
      const color=isLight?'232,255,71':'50,0,85';
      const g=ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,this.radius);
      g.addColorStop(0,`rgba(${color},${.35*this.alpha})`);g.addColorStop(1,`rgba(${color},0)`);
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(this.x,this.y,this.radius,0,Math.PI*2);ctx.fill();
    }
  }
  const orbs=Array.from({length:20},()=>new Orb());

  let t0=null;
  function animate(ts){
    if(!document.hidden){
      const body=document.body;
      const glTheme=body.classList.contains('cosmic')?'cosmic':body.classList.contains('tiffany')?'tiffany':null;
      if(glTheme){
        glCanvas.style.display=''; canvas2d.style.display='none';
        if(glReady){
          if(t0===null)t0=ts;
          if(glTheme!==lastTheme){applyTheme(glTheme);lastTheme=glTheme;}
          gl.uniform1f(uLocs.time,(ts-t0)*.001);
          gl.uniform2f(uLocs.res,glCanvas.width,glCanvas.height);
          gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        }
      } else {
        glCanvas.style.display='none'; canvas2d.style.display='';
        ctx.clearRect(0,0,canvas2d.width,canvas2d.height);
        orbs.forEach(o=>{o.update();o.draw();});
      }
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
})();

// ==================== MATRIX TEXT EFFECT ====================
(function() {
    const target = document.getElementById("author");
    if (!target) return;
    const originalText = "© Бочаров Ю.С., 2026";
    const letters = "日ハミヒーヘホマミムメモヤユヨラリルレロワン0123456789$+-*/=%";
    let interval = null;
    function startMatrixAnimation() {
        let iteration = 0;
        clearInterval(interval);
        interval = setInterval(() => {
            target.innerText = originalText
                .split("")
                .map((char, index) => {
                    if (index < iteration) return originalText[index];
                    if (char === " " || char === ",") return char;
                    return letters[Math.floor(Math.random() * letters.length)];
                })
                .join("");
            if (iteration >= originalText.length) clearInterval(interval);
            iteration += 1 / 2;
        }, 60);
    }
    setInterval(startMatrixAnimation, 10000);
    window.addEventListener("load", startMatrixAnimation);
})();

/* ════════════════════════════════════════════════════════════════════
 * EXPORT REPORT (CEO) — Excel/xlsx export of monthly CRM stats
 * Все функции и переменные имеют префикс exp_ для изоляции.
 * Не модифицирует существующие S.data.* — фетчит данные отдельно.
 * ═══════════════════════════════════════════════════════════════════ */

const EXP_EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
let _expLibLoading = null;

function exp_loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve();
  if (_expLibLoading) return _expLibLoading;
  _expLibLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = EXP_EXCELJS_URL;
    s.onload  = () => resolve();
    s.onerror = () => { _expLibLoading = null; reject(new Error('Не удалось загрузить ExcelJS')); };
    document.head.appendChild(s);
  });
  return _expLibLoading;
}

function exp_openModal() {
  const ov = document.getElementById('export-modal-overlay');
  const sel = document.getElementById('exp-month-sel');
  if (!ov || !sel) return;
  // Заполняем список месяцев (6 последних)
  sel.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const yy = d.getFullYear().toString().slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const suffix = mm + yy;
    const opt = document.createElement('option');
    opt.value = suffix;
    opt.textContent = getMonthName(suffix);
    if (suffix === currentSuffix) opt.selected = true;
    sel.appendChild(opt);
  }
  const status = document.getElementById('exp-status');
  if (status) { status.textContent = ''; status.className = 'export-status'; }
  const btn = document.getElementById('exp-go-btn');
  if (btn) btn.disabled = false;
  ov.style.display = 'flex';
}

function exp_closeModal() {
  const ov = document.getElementById('export-modal-overlay');
  if (ov) ov.style.display = 'none';
}

function exp_setStatus(text, kind) {
  const el = document.getElementById('exp-status');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'export-status' + (kind ? ' ' + kind : '');
}

// Парс DD.MM.YYYY → {y,m,d} или null
function exp_parseDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  return { y: +m[3], m: +m[2], d: +m[1] };
}

// Возвращает Map(nameLow → plan number) из массива plan-листа
function exp_getPlanMap(planData) {
  const map = {};
  if (!planData || planData.length < 2) return map;
  for (let i = 1; i < planData.length; i++) {
    const row = planData[i];
    if (!row || !row[0]) continue;
    const name = String(row[0]).trim().toLowerCase();
    const plan = parseFloat(String(row[1]||'0').replace(/[^\d.]/g,'')) || 0;
    if (name) map[name] = plan;
  }
  return map;
}

// Список CRM-менеджеров (имя в исходном регистре) из USERS — без CEO, без dozhim
function exp_getCrmManagers() {
  const out = [];
  const users = S.usersData || [];
  for (let i = 1; i < users.length; i++) {
    const u = users[i];
    if (!u || !u[1]) continue;
    const role = String(u[2]||'crm').toLowerCase().trim();
    if (role === 'crm') out.push(String(u[1]).trim());
  }
  return out;
}

// Базовая ячейка статистики
function exp_emptyMgr(name) {
  return {
    name,
    visTotal: 0, visCrm: 0, visTl: 0,
    kredit: 0, nal: 0, obmen: 0, vykup: 0, kom: 0,
    otkaz: 0, fssp: 0, odobNeKupil: 0,
  };
}

const EXP_STATUS = {
  KREDIT: 'покупка (кредит)',
  NAL:    'покупка (наличные)',
  OBMEN:  'обмен',
  VYKUP:  'выкуп',
  KOM:    'комиссия',
  OTKAZ:  'отказ',
  FSSP:   'фссп не подаем',
  ODOB:   'одобрено банком, но не купил',
};
const EXP_CAT_CRM = 'кат 800';
const EXP_CAT_TL  = 'кат 1200';

// Применяет инкременты статуса к объекту stat
function exp_applyRow(stat, cat, st) {
  if (cat === EXP_CAT_CRM) stat.visCrm++;
  if (cat === EXP_CAT_TL)  stat.visTl++;
  stat.visTotal++;
  if (st === EXP_STATUS.KREDIT) stat.kredit++;
  else if (st === EXP_STATUS.NAL)   stat.nal++;
  else if (st === EXP_STATUS.OBMEN) stat.obmen++;
  else if (st === EXP_STATUS.VYKUP) stat.vykup++;
  else if (st === EXP_STATUS.KOM)   stat.kom++;
  else if (st === EXP_STATUS.OTKAZ) stat.otkaz++;
  else if (st === EXP_STATUS.FSSP)  stat.fssp++;
  else if (st === EXP_STATUS.ODOB)  stat.odobNeKupil++;
}

// Главная: возвращает { managers, total, byCity, daily, dailyByMgr }
// dailyByMgr: Map(nameLow → Array<31>) — визиты по дням для каждого менеджера
function exp_aggregate(vizData, crmNamesList) {
  const allowed = new Set(crmNamesList.map(n => n.toLowerCase()));
  const managers = {};
  const byCity   = {}; // city → { _total: stat, mgrs: { nameLow: stat } }
  const daily    = {}; // day(int) → count
  const dailyByMgr = {}; // nameLow → { day(int) → count }
  for (const n of crmNamesList) {
    managers[n.toLowerCase()] = exp_emptyMgr(n);
    dailyByMgr[n.toLowerCase()] = {};
  }

  if (!vizData || vizData.length < 2) {
    return {
      managers: Object.values(managers),
      total: exp_emptyMgr('ИТОГО'),
      byCity, daily, dailyByMgr
    };
  }

  for (let i = 1; i < vizData.length; i++) {
    const row = vizData[i];
    if (!row || !row[8]) continue;
    const mgr  = String(row[8]).trim();
    const mgrL = mgr.toLowerCase();
    if (!allowed.has(mgrL)) continue; // только CRM-менеджеры из USERS
    const cat  = String(row[6]||'').trim().toLowerCase();
    const st   = String(row[4]||'').trim().toLowerCase();
    const city = String(row[3]||'').trim() || '—';

    exp_applyRow(managers[mgrL], cat, st);

    if (!byCity[city]) byCity[city] = { _total: exp_emptyMgr('Город: ' + city), mgrs: {} };
    if (!byCity[city].mgrs[mgrL]) byCity[city].mgrs[mgrL] = exp_emptyMgr(mgr);
    exp_applyRow(byCity[city].mgrs[mgrL], cat, st);
    exp_applyRow(byCity[city]._total, cat, st);

    const d = exp_parseDate(row[0]);
    if (d) {
      daily[d.d] = (daily[d.d] || 0) + 1;
      dailyByMgr[mgrL][d.d] = (dailyByMgr[mgrL][d.d] || 0) + 1;
    }
  }

  // ИТОГО
  const total = exp_emptyMgr('ИТОГО');
  Object.values(managers).forEach(m => {
    total.visTotal    += m.visTotal;
    total.visCrm      += m.visCrm;
    total.visTl       += m.visTl;
    total.kredit      += m.kredit;
    total.nal         += m.nal;
    total.obmen       += m.obmen;
    total.vykup       += m.vykup;
    total.kom         += m.kom;
    total.otkaz       += m.otkaz;
    total.fssp        += m.fssp;
    total.odobNeKupil += m.odobNeKupil;
  });

  // daily в массив 1..31
  const dailyArr = [];
  for (let d = 1; d <= 31; d++) dailyArr.push({ day: d, count: daily[d] || 0 });

  // managers в массив, сортируем по убыванию визитов
  const mgrsArr = Object.values(managers).sort((a,b) => b.visTotal - a.visTotal);

  // dailyByMgr → объект { nameLow: { name, perDay: Array<31> } }
  const dailyByMgrArr = {};
  for (const m of mgrsArr) {
    const nl = m.name.toLowerCase();
    const arr = [];
    for (let d = 1; d <= 31; d++) arr.push(dailyByMgr[nl][d] || 0);
    dailyByMgrArr[nl] = { name: m.name, perDay: arr, total: m.visTotal };
  }

  return { managers: mgrsArr, total, byCity, daily: dailyArr, dailyByMgr: dailyByMgrArr };
}

// Рисуем chart: столбики по 31 дню → возвращает base64 PNG
function exp_drawTimelineChart(dailyArr, monthLabel) {
  const W = 980, H = 360;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Фон
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Заголовок
  ctx.fillStyle = '#222';
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Хронология визитов — ' + monthLabel, 24, 30);

  // Область графика
  const padL = 50, padR = 24, padT = 60, padB = 50;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxVal = Math.max(1, ...dailyArr.map(d => d.count));
  const niceMax = Math.ceil(maxVal / 5) * 5 || 5;

  // Сетка и Y-оси
  ctx.strokeStyle = '#e8e8e8';
  ctx.fillStyle   = '#888';
  ctx.font = '11px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padT + plotH - (plotH * i / 5);
    const v = Math.round(niceMax * i / 5);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillText(String(v), padL - 6, y + 4);
  }

  // Bars
  const barGap = 4;
  const barW = (plotW - barGap * (dailyArr.length - 1)) / dailyArr.length;
  dailyArr.forEach((d, i) => {
    const h = plotH * (d.count / niceMax);
    const x = padL + i * (barW + barGap);
    const y = padT + plotH - h;
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#5e8def');
    grad.addColorStop(1, '#3a6bd6');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barW, h);
    // X-метка (день)
    ctx.fillStyle = '#666';
    ctx.font = '10px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(d.day), x + barW/2, H - padB + 14);
    // Значение над столбиком, если > 0
    if (d.count > 0) {
      ctx.fillStyle = '#333';
      ctx.font = 'bold 10px Arial, sans-serif';
      ctx.fillText(String(d.count), x + barW/2, y - 4);
    }
  });

  // Подпись оси X
  ctx.fillStyle = '#888';
  ctx.font = '11px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('День месяца', W / 2, H - 8);

  return canvas.toDataURL('image/png');
}

// Палитра цветов для линий менеджеров на мульти-чарте
const EXP_PALETTE = [
  '#3a6bd6', '#e74c3c', '#27ae60', '#f39c12', '#9b59b6',
  '#16a085', '#e84393', '#2c3e50', '#d35400', '#1abc9c',
  '#c0392b', '#7f8c8d', '#2980b9', '#8e44ad', '#f1c40f',
  '#34495e', '#00b894', '#fd79a8', '#6c5ce7', '#e17055',
];

// Мульти-линейный чарт: каждый менеджер = своя цветная линия
function exp_drawTimelineByMgrChart(dailyByMgrObj, monthLabel) {
  const mgrs = Object.values(dailyByMgrObj).filter(m => m.total > 0);
  if (mgrs.length === 0) return null;

  // Адаптируем высоту под количество менеджеров (легенда)
  const legendCols = 3;
  const legendRows = Math.ceil(mgrs.length / legendCols);
  const legendH = legendRows * 20 + 10;

  const W = 980, H = 420 + legendH;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Заголовок
  ctx.fillStyle = '#222';
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Хронология визитов по менеджерам — ' + monthLabel, 24, 30);

  // Plot area
  const padL = 50, padR = 24, padT = 60, padB = 50 + legendH;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Макс по любому менеджеру в любой день
  let maxVal = 1;
  mgrs.forEach(m => m.perDay.forEach(v => { if (v > maxVal) maxVal = v; }));
  const niceMax = Math.ceil(maxVal / 5) * 5 || 5;

  // Сетка и Y-метки
  ctx.strokeStyle = '#e8e8e8';
  ctx.fillStyle   = '#888';
  ctx.font = '11px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padT + plotH - (plotH * i / 5);
    const v = Math.round(niceMax * i / 5);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillText(String(v), padL - 6, y + 4);
  }

  // X-разметка (дни 1..31)
  const stepX = plotW / 30;
  ctx.fillStyle = '#666';
  ctx.font = '10px Arial, sans-serif';
  ctx.textAlign = 'center';
  for (let d = 1; d <= 31; d++) {
    const x = padL + (d - 1) * stepX;
    if (d === 1 || d % 5 === 0 || d === 31) {
      ctx.fillText(String(d), x, padT + plotH + 14);
    }
  }

  // Линии менеджеров
  mgrs.forEach((m, idx) => {
    const color = EXP_PALETTE[idx % EXP_PALETTE.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.fillStyle = color;
    ctx.beginPath();
    let started = false;
    m.perDay.forEach((v, di) => {
      const x = padL + di * stepX;
      const y = padT + plotH - (plotH * v / niceMax);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // Точки
    m.perDay.forEach((v, di) => {
      if (v === 0) return;
      const x = padL + di * stepX;
      const y = padT + plotH - (plotH * v / niceMax);
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // Подпись оси X
  ctx.fillStyle = '#888';
  ctx.font = '11px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('День месяца', padL + plotW / 2, padT + plotH + 32);

  // Легенда
  const legendStartY = H - legendH + 4;
  const legendColW = (W - 40) / legendCols;
  mgrs.forEach((m, idx) => {
    const color = EXP_PALETTE[idx % EXP_PALETTE.length];
    const col = idx % legendCols;
    const row = Math.floor(idx / legendCols);
    const lx = 24 + col * legendColW;
    const ly = legendStartY + row * 20;
    ctx.fillStyle = color;
    ctx.fillRect(lx, ly + 4, 12, 4);
    ctx.fillStyle = '#333';
    ctx.font = '11px Arial, sans-serif';
    ctx.textAlign = 'left';
    const label = m.name + ' (' + m.total + ')';
    const maxTxtW = legendColW - 20;
    let txt = label;
    if (ctx.measureText(txt).width > maxTxtW) {
      while (ctx.measureText(txt + '…').width > maxTxtW && txt.length > 4) txt = txt.slice(0, -1);
      txt += '…';
    }
    ctx.fillText(txt, lx + 18, ly + 12);
  });

  return canvas.toDataURL('image/png');
}

// Хелперы стиля для ExcelJS
function exp_styleHeader(cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3A6BD6' } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = {
    top:    { style: 'thin', color: { argb: 'FFCCCCCC' } },
    left:   { style: 'thin', color: { argb: 'FFCCCCCC' } },
    bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    right:  { style: 'thin', color: { argb: 'FFCCCCCC' } },
  };
}
function exp_styleData(cell, opts) {
  cell.font = { size: 10 };
  cell.alignment = { vertical: 'middle', horizontal: (opts && opts.left) ? 'left' : 'center' };
  cell.border = {
    top:    { style: 'hair', color: { argb: 'FFDDDDDD' } },
    left:   { style: 'hair', color: { argb: 'FFDDDDDD' } },
    bottom: { style: 'hair', color: { argb: 'FFDDDDDD' } },
    right:  { style: 'hair', color: { argb: 'FFDDDDDD' } },
  };
  if (opts && opts.bg) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } };
  }
}
function exp_styleTotal(cell) {
  cell.font = { bold: true, size: 10, color: { argb: 'FF222222' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE9A8' } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  cell.border = {
    top:    { style: 'thin', color: { argb: 'FF999999' } },
    left:   { style: 'thin', color: { argb: 'FFDDDDDD' } },
    bottom: { style: 'thin', color: { argb: 'FF999999' } },
    right:  { style: 'thin', color: { argb: 'FFDDDDDD' } },
  };
}

function exp_pct(num, den) {
  if (!den) return 0;
  return num / den;
}

// Главная: формирует workbook
async function exp_buildWorkbook(opts) {
  const { suffix, monthLabel, agg, plans, sections } = opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CRM Crew Dashboard';
  wb.created = new Date();

  /* === ЛИСТ 1: СВОДНАЯ === */
  const ws = wb.addWorksheet('Сводный отчёт', {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
  });

  // Заголовок
  ws.mergeCells('A1:R1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'ИТОГОВЫЙ ОТЧЁТ ЗА ' + monthLabel.toUpperCase();
  titleCell.font = { bold: true, size: 16, color: { argb: 'FF1A1A1A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 28;
  ws.getRow(2).height = 6;

  // Определяем колонки в зависимости от sections
  const cols = [{ key: 'name', label: 'Менеджер', width: 28, left: true }];
  if (sections.summary) {
    cols.push({ key: 'visTotal', label: 'Всего\nвизитов', width: 11 });
    cols.push({ key: 'visCrm',   label: 'CRM\n(кат 800)', width: 11 });
    cols.push({ key: 'visTl',    label: 'ТЛ\n(кат 1200)', width: 11 });
    cols.push({ key: 'plan',     label: 'План',           width: 9 });
    cols.push({ key: 'pctFact',  label: '% факта',        width: 10, pct: true });
  }
  if (sections.sales) {
    cols.push({ key: 'kredit', label: 'Кредит',   width: 9 });
    cols.push({ key: 'nal',    label: 'Наличные', width: 10 });
    cols.push({ key: 'obmen',  label: 'Обмен',    width: 9 });
    cols.push({ key: 'vykup',  label: 'Выкуп',    width: 9 });
    cols.push({ key: 'kom',    label: 'Комиссия', width: 10 });
  }
  if (sections.refus) {
    cols.push({ key: 'otkaz',       label: 'Отказ',          width: 9 });
    cols.push({ key: 'fssp',        label: 'ФССП\nне подаём',width: 11 });
    cols.push({ key: 'odobNeKupil', label: 'Одобрено,\nно не купил', width: 13 });
  }
  if (sections.pct) {
    cols.push({ key: 'pOtkaz',  label: '% отказ',  width: 10, pct: true });
    cols.push({ key: 'pFssp',   label: '% ФССП',   width: 10, pct: true });
    cols.push({ key: 'pKredit', label: '% кредит', width: 10, pct: true });
  }

  // Section header row (3)
  ws.mergeCells(3, 1, 3, cols.length);
  const secCell = ws.getCell(3, 1);
  secCell.value = 'СВОДНАЯ ПО МЕНЕДЖЕРАМ';
  secCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  secCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } };
  secCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(3).height = 22;

  // Header row (4)
  cols.forEach((c, i) => {
    const cell = ws.getCell(4, i + 1);
    cell.value = c.label;
    exp_styleHeader(cell);
    ws.getColumn(i + 1).width = c.width;
  });
  ws.getRow(4).height = 36;

  // Data rows
  const allRows = agg.managers.slice();
  let r = 5;
  for (const m of allRows) {
    const planVal = plans[m.name.toLowerCase()] || 0;
    const pctFact = exp_pct(m.visTotal, planVal);
    const pOtkaz  = exp_pct(m.otkaz, m.visTotal);
    const pFssp   = exp_pct(m.fssp,  m.visTotal);
    const pKredit = exp_pct(m.kredit, m.visTotal);
    cols.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      let v;
      if      (c.key === 'plan')    v = planVal || '';
      else if (c.key === 'pctFact') v = planVal ? pctFact : '';
      else if (c.key === 'pOtkaz')  v = pOtkaz;
      else if (c.key === 'pFssp')   v = pFssp;
      else if (c.key === 'pKredit') v = pKredit;
      else                          v = m[c.key];
      cell.value = (typeof v === 'number' && v === 0 && c.key !== 'pOtkaz' && c.key !== 'pFssp' && c.key !== 'pKredit' && c.key !== 'pctFact') ? 0 : v;
      exp_styleData(cell, { left: c.left, bg: (r % 2 === 1) ? 'FFF7F9FC' : 'FFFFFFFF' });
      if (c.pct) cell.numFmt = '0.0%';
    });
    r++;
  }

  // Итого
  {
    const t = agg.total;
    const planSum = Object.values(plans).reduce((s, v) => s + (v||0), 0);
    cols.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      let v = '';
      if      (c.key === 'name')    v = 'ИТОГО';
      else if (c.key === 'plan')    v = planSum || '';
      else if (c.key === 'pctFact') v = planSum ? exp_pct(t.visTotal, planSum) : '';
      else if (c.key === 'pOtkaz')  v = exp_pct(t.otkaz,  t.visTotal);
      else if (c.key === 'pFssp')   v = exp_pct(t.fssp,   t.visTotal);
      else if (c.key === 'pKredit') v = exp_pct(t.kredit, t.visTotal);
      else                          v = t[c.key];
      cell.value = v;
      exp_styleTotal(cell);
      if (c.pct) cell.numFmt = '0.0%';
    });
    r++;
  }

  /* === ЛИСТ 2: ПО ГОРОДАМ === */
  if (sections.city) {
    const wsC = wb.addWorksheet('По городам', {
      views: [{ state: 'frozen', ySplit: 3 }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
    });
    const cityCols = [
      { label: 'Город',     w: 18 },
      { label: 'Менеджер',  w: 26 },
      { label: 'Визиты',    w: 10 },
      { label: 'Кредит',    w: 9 },
      { label: 'Наличные',  w: 10 },
      { label: 'Обмен',     w: 9 },
      { label: 'Выкуп',     w: 9 },
      { label: 'Комиссия',  w: 10 },
      { label: 'Отказ',     w: 9 },
      { label: 'ФССП',      w: 9 },
      { label: 'Одобр./не куп.', w: 14 },
    ];
    wsC.mergeCells(1, 1, 1, cityCols.length);
    const t = wsC.getCell(1, 1);
    t.value = 'РАЗБИВКА ПО ГОРОДАМ — ' + monthLabel.toUpperCase();
    t.font = { bold: true, size: 14 };
    t.alignment = { vertical: 'middle', horizontal: 'center' };
    wsC.getRow(1).height = 26;
    wsC.getRow(2).height = 6;

    cityCols.forEach((c, i) => {
      const cell = wsC.getCell(3, i + 1);
      cell.value = c.label;
      exp_styleHeader(cell);
      wsC.getColumn(i + 1).width = c.w;
    });
    wsC.getRow(3).height = 28;

    let cr = 4;
    const cityNames = Object.keys(agg.byCity).sort((a, b) => a.localeCompare(b, 'ru'));
    for (const cityName of cityNames) {
      const cityBlock = agg.byCity[cityName];
      const mgrsLow = Object.keys(cityBlock.mgrs).sort((a,b) =>
        cityBlock.mgrs[b].visTotal - cityBlock.mgrs[a].visTotal
      );
      for (const mLow of mgrsLow) {
        const m = cityBlock.mgrs[mLow];
        const row = [cityName, m.name, m.visTotal, m.kredit, m.nal, m.obmen, m.vykup, m.kom, m.otkaz, m.fssp, m.odobNeKupil];
        row.forEach((v, i) => {
          const cell = wsC.getCell(cr, i + 1);
          cell.value = v;
          exp_styleData(cell, { left: i < 2, bg: (cr % 2 === 0) ? 'FFF7F9FC' : 'FFFFFFFF' });
        });
        cr++;
      }
      // Итого по городу
      const ct = cityBlock._total;
      const totalRow = [cityName, 'ИТОГО по городу', ct.visTotal, ct.kredit, ct.nal, ct.obmen, ct.vykup, ct.kom, ct.otkaz, ct.fssp, ct.odobNeKupil];
      totalRow.forEach((v, i) => {
        const cell = wsC.getCell(cr, i + 1);
        cell.value = v;
        exp_styleTotal(cell);
      });
      cr++;
    }
    // Общий итог
    {
      const t2 = agg.total;
      const totalRow = ['ВСЕ ГОРОДА', 'ОБЩИЙ ИТОГ', t2.visTotal, t2.kredit, t2.nal, t2.obmen, t2.vykup, t2.kom, t2.otkaz, t2.fssp, t2.odobNeKupil];
      totalRow.forEach((v, i) => {
        const cell = wsC.getCell(cr, i + 1);
        cell.value = v;
        cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
    }
  }

  /* === ЛИСТ 3: ХРОНОЛОГИЯ === */
  if (sections.timeline) {
    const wsT = wb.addWorksheet('Хронология', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
    });
    wsT.mergeCells('A1:F1');
    const t = wsT.getCell('A1');
    t.value = 'ХРОНОЛОГИЯ ВИЗИТОВ — ' + monthLabel.toUpperCase();
    t.font = { bold: true, size: 14 };
    t.alignment = { vertical: 'middle', horizontal: 'center' };
    wsT.getRow(1).height = 26;

    // === Чарт 1: общая хронология по отделу ===
    const pngDataUrl = exp_drawTimelineChart(agg.daily, monthLabel);
    const pngB64 = pngDataUrl.replace(/^data:image\/png;base64,/, '');
    const imageId = wb.addImage({ base64: pngB64, extension: 'png' });
    wsT.addImage(imageId, { tl: { col: 0, row: 2 }, ext: { width: 980, height: 360 } });

    // === Чарт 2: по менеджерам (мульти-линии) ===
    const mgrChartUrl = exp_drawTimelineByMgrChart(agg.dailyByMgr, monthLabel);
    let nextAnchorRow = 24;
    if (mgrChartUrl) {
      const mgrChartH = 420 + Math.ceil(
        Object.values(agg.dailyByMgr).filter(m => m.total > 0).length / 3
      ) * 20 + 10;
      const mgrPngB64 = mgrChartUrl.replace(/^data:image\/png;base64,/, '');
      const mgrImgId = wb.addImage({ base64: mgrPngB64, extension: 'png' });
      wsT.addImage(mgrImgId, { tl: { col: 0, row: 23 }, ext: { width: 980, height: mgrChartH } });
      // Каждая строка в Excel ≈ 20px, оценим высоту в строках
      nextAnchorRow = 24 + Math.ceil(mgrChartH / 20) + 2;
    }

    // === Таблица: день × менеджер (широкая) ===
    const mgrsWithData = Object.values(agg.dailyByMgr).filter(m => m.total > 0);
    const hasMgrTable = mgrsWithData.length > 0;

    const tableStart = nextAnchorRow;
    // Заголовок: День | Менеджер1 | Менеджер2 | ... | ИТОГО
    wsT.getCell(tableStart, 1).value = 'День';
    exp_styleHeader(wsT.getCell(tableStart, 1));
    wsT.getColumn(1).width = 8;

    if (hasMgrTable) {
      mgrsWithData.forEach((m, idx) => {
        const col = 2 + idx;
        const cell = wsT.getCell(tableStart, col);
        cell.value = m.name;
        exp_styleHeader(cell);
        wsT.getColumn(col).width = Math.max(11, Math.min(22, m.name.length + 2));
      });
      const totalCol = 2 + mgrsWithData.length;
      wsT.getCell(tableStart, totalCol).value = 'Отдел';
      exp_styleHeader(wsT.getCell(tableStart, totalCol));
      wsT.getColumn(totalCol).width = 10;
    } else {
      wsT.getCell(tableStart, 2).value = 'Визитов';
      exp_styleHeader(wsT.getCell(tableStart, 2));
      wsT.getColumn(2).width = 12;
    }
    wsT.getRow(tableStart).height = 32;

    // Тело таблицы
    agg.daily.forEach((d, di) => {
      const rowIdx = tableStart + 1 + di;
      const bg = (di % 2 === 0) ? 'FFF7F9FC' : 'FFFFFFFF';
      const dayCell = wsT.getCell(rowIdx, 1);
      dayCell.value = d.day;
      exp_styleData(dayCell, { bg });

      if (hasMgrTable) {
        mgrsWithData.forEach((m, mi) => {
          const cell = wsT.getCell(rowIdx, 2 + mi);
          const v = m.perDay[di] || 0;
          cell.value = v;
          exp_styleData(cell, { bg });
          if (v === 0) cell.font = { size: 10, color: { argb: 'FFCCCCCC' } };
        });
        const totCell = wsT.getCell(rowIdx, 2 + mgrsWithData.length);
        totCell.value = d.count;
        exp_styleData(totCell, { bg });
        totCell.font = { size: 10, bold: true };
      } else {
        const cell = wsT.getCell(rowIdx, 2);
        cell.value = d.count;
        exp_styleData(cell, { bg });
      }
    });

    // ИТОГО внизу
    let totalCount = 0;
    agg.daily.forEach(d => totalCount += d.count);
    const totalRowIdx = tableStart + 1 + agg.daily.length;
    wsT.getCell(totalRowIdx, 1).value = 'Итого';
    exp_styleTotal(wsT.getCell(totalRowIdx, 1));
    if (hasMgrTable) {
      mgrsWithData.forEach((m, mi) => {
        const cell = wsT.getCell(totalRowIdx, 2 + mi);
        cell.value = m.total;
        exp_styleTotal(cell);
      });
      const totCell = wsT.getCell(totalRowIdx, 2 + mgrsWithData.length);
      totCell.value = totalCount;
      exp_styleTotal(totCell);
    } else {
      wsT.getCell(totalRowIdx, 2).value = totalCount;
      exp_styleTotal(wsT.getCell(totalRowIdx, 2));
    }
  }

  return wb;
}

async function exp_run() {
  const btn = document.getElementById('exp-go-btn');
  const sel = document.getElementById('exp-month-sel');
  if (!btn || !sel) return;
  btn.disabled = true;
  try {
    const suffix = sel.value;
    if (!suffix) throw new Error('Не выбран месяц');
    const monthLabel = getMonthName(suffix);
    const fmtRadio = document.querySelector('input[name="exp-fmt"]:checked');
    const fmt = fmtRadio ? fmtRadio.value : 'xlsx';

    const sections = {
      summary:  document.getElementById('exp-s-summary').checked,
      sales:    document.getElementById('exp-s-sales').checked,
      refus:    document.getElementById('exp-s-refus').checked,
      pct:      document.getElementById('exp-s-pct').checked,
      city:     document.getElementById('exp-s-city').checked,
      timeline: document.getElementById('exp-s-timeline').checked,
    };
    if (!Object.values(sections).some(Boolean)) {
      exp_setStatus('Выберите хотя бы один раздел', 'err');
      btn.disabled = false;
      return;
    }

    if (fmt === 'xlsx') {
      exp_setStatus('Загружаем библиотеку…');
      await exp_loadExcelJS();
    }

    exp_setStatus('Получаем данные за ' + monthLabel + '…');
    const vizName  = 'ВИЗИТЫ' + suffix;
    const planName = 'ПЛАН'   + suffix;
    let vizData, planData;
    try {
      [vizData, planData] = await Promise.all([
        api(vizName,  'A:N'),
        api(planName, 'A:B').catch(() => []),
      ]);
    } catch (e) {
      exp_setStatus('Нет данных за выбранный месяц', 'err');
      btn.disabled = false;
      return;
    }

    exp_setStatus('Считаем статистику…');
    const crmMgrs = exp_getCrmManagers();
    const agg     = exp_aggregate(vizData, crmMgrs);
    const plans   = exp_getPlanMap(planData);

    if (fmt === 'pdf') {
      exp_setStatus('Открываем окно отчёта…');
      exp_runPdf({ suffix, monthLabel, agg, plans, sections });
      exp_setStatus('✓ Готово — нажмите «Печать / PDF» в окне', 'ok');
      toast('Отчёт открыт в новом окне', 's');
      setTimeout(() => exp_closeModal(), 1200);
      return;
    }

    exp_setStatus('Формируем файл…');
    const wb = await exp_buildWorkbook({ suffix, monthLabel, agg, plans, sections });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = 'Итоговый отчёт — ' + monthLabel + '.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    exp_setStatus('✓ Готово', 'ok');
    toast('Отчёт сформирован', 's');
    setTimeout(() => exp_closeModal(), 800);
  } catch (e) {
    console.error('export error', e);
    exp_setStatus('Ошибка: ' + (e.message || 'не удалось сформировать'), 'err');
    toast('Ошибка экспорта', 'e');
  } finally {
    btn.disabled = false;
  }
}

// ==================== PDF EXPORT ====================
function exp_escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function exp_pctStr(num, den, digits) {
  if (!den) return '—';
  const v = (num / den) * 100;
  return v.toFixed(digits == null ? 1 : digits) + '%';
}

function exp_pdfBuildSummaryTable(agg, plans, sections) {
  const cols = [{ key: 'name', label: 'Менеджер', cls: 'left' }];
  if (sections.summary) {
    cols.push({ key: 'visTotal', label: 'Всего' });
    cols.push({ key: 'visCrm',   label: 'CRM' });
    cols.push({ key: 'visTl',    label: 'ТЛ' });
    cols.push({ key: 'plan',     label: 'План' });
    cols.push({ key: 'pctFact',  label: '% факта' });
  }
  if (sections.sales) {
    cols.push({ key: 'kredit', label: 'Кредит' });
    cols.push({ key: 'nal',    label: 'Нал.' });
    cols.push({ key: 'obmen',  label: 'Обмен' });
    cols.push({ key: 'vykup',  label: 'Выкуп' });
    cols.push({ key: 'kom',    label: 'Комис.' });
  }
  if (sections.refus) {
    cols.push({ key: 'otkaz',       label: 'Отказ' });
    cols.push({ key: 'fssp',        label: 'ФССП' });
    cols.push({ key: 'odobNeKupil', label: 'Одоб. н/к' });
  }
  if (sections.pct) {
    cols.push({ key: 'pOtkaz',  label: '% отказ' });
    cols.push({ key: 'pFssp',   label: '% ФССП' });
    cols.push({ key: 'pKredit', label: '% кредит' });
  }

  const mkRow = (m, isTotal) => {
    const planVal = isTotal
      ? Object.values(plans).reduce((s,v) => s + (v||0), 0)
      : (plans[m.name.toLowerCase()] || 0);
    const tds = cols.map(c => {
      let v;
      if      (c.key === 'name')    v = m.name;
      else if (c.key === 'plan')    v = planVal || '—';
      else if (c.key === 'pctFact') v = planVal ? exp_pctStr(m.visTotal, planVal) : '—';
      else if (c.key === 'pOtkaz')  v = exp_pctStr(m.otkaz,  m.visTotal);
      else if (c.key === 'pFssp')   v = exp_pctStr(m.fssp,   m.visTotal);
      else if (c.key === 'pKredit') v = exp_pctStr(m.kredit, m.visTotal);
      else                          v = m[c.key];
      const cls = (c.cls || '') + (isTotal ? ' total' : '');
      return '<td class="' + cls + '">' + exp_escHtml(v) + '</td>';
    }).join('');
    return '<tr' + (isTotal ? ' class="tr-total"' : '') + '>' + tds + '</tr>';
  };

  const thead = '<thead><tr>' + cols.map(c => '<th>' + exp_escHtml(c.label) + '</th>').join('') + '</tr></thead>';
  const tbody = '<tbody>' +
    agg.managers.map(m => mkRow(m, false)).join('') +
    mkRow(agg.total, true) +
    '</tbody>';

  return '<table class="rpt-table">' + thead + tbody + '</table>';
}

function exp_pdfBuildCitySection(agg) {
  const cityNames = Object.keys(agg.byCity).sort((a,b) => a.localeCompare(b, 'ru'));
  if (cityNames.length === 0) return '<p class="empty">Нет данных по городам.</p>';

  const headers = ['Город','Менеджер','Визиты','Кредит','Нал.','Обмен','Выкуп','Комис.','Отказ','ФССП','Одоб. н/к'];
  let rows = '';
  for (const cityName of cityNames) {
    const block = agg.byCity[cityName];
    const mgrsLow = Object.keys(block.mgrs).sort((a,b) =>
      block.mgrs[b].visTotal - block.mgrs[a].visTotal
    );
    mgrsLow.forEach(mLow => {
      const m = block.mgrs[mLow];
      rows += '<tr>' +
        '<td class="left">' + exp_escHtml(cityName) + '</td>' +
        '<td class="left">' + exp_escHtml(m.name) + '</td>' +
        '<td>' + m.visTotal + '</td>' +
        '<td>' + m.kredit + '</td>' +
        '<td>' + m.nal + '</td>' +
        '<td>' + m.obmen + '</td>' +
        '<td>' + m.vykup + '</td>' +
        '<td>' + m.kom + '</td>' +
        '<td>' + m.otkaz + '</td>' +
        '<td>' + m.fssp + '</td>' +
        '<td>' + m.odobNeKupil + '</td>' +
        '</tr>';
    });
    const ct = block._total;
    rows += '<tr class="tr-subtotal">' +
      '<td class="left">' + exp_escHtml(cityName) + '</td>' +
      '<td class="left"><i>Итого по городу</i></td>' +
      '<td>' + ct.visTotal + '</td>' +
      '<td>' + ct.kredit + '</td>' +
      '<td>' + ct.nal + '</td>' +
      '<td>' + ct.obmen + '</td>' +
      '<td>' + ct.vykup + '</td>' +
      '<td>' + ct.kom + '</td>' +
      '<td>' + ct.otkaz + '</td>' +
      '<td>' + ct.fssp + '</td>' +
      '<td>' + ct.odobNeKupil + '</td>' +
      '</tr>';
  }
  // Общий итог
  const t = agg.total;
  rows += '<tr class="tr-total">' +
    '<td class="left">ВСЕ ГОРОДА</td>' +
    '<td class="left">ОБЩИЙ ИТОГ</td>' +
    '<td>' + t.visTotal + '</td>' +
    '<td>' + t.kredit + '</td>' +
    '<td>' + t.nal + '</td>' +
    '<td>' + t.obmen + '</td>' +
    '<td>' + t.vykup + '</td>' +
    '<td>' + t.kom + '</td>' +
    '<td>' + t.otkaz + '</td>' +
    '<td>' + t.fssp + '</td>' +
    '<td>' + t.odobNeKupil + '</td>' +
    '</tr>';

  return '<table class="rpt-table">' +
    '<thead><tr>' + headers.map(h => '<th>' + exp_escHtml(h) + '</th>').join('') + '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table>';
}

function exp_pdfBuildTimelineSection(agg, monthLabel) {
  const deptPng  = exp_drawTimelineChart(agg.daily, monthLabel);
  const mgrPng   = exp_drawTimelineByMgrChart(agg.dailyByMgr, monthLabel);
  const mgrsWithData = Object.values(agg.dailyByMgr).filter(m => m.total > 0);

  let html = '<div class="chart-wrap"><img src="' + deptPng + '" alt="Хронология по отделу"/></div>';
  if (mgrPng) {
    html += '<div class="page-break"></div>';
    html += '<h2 class="rpt-sec">Хронология по менеджерам</h2>';
    html += '<div class="chart-wrap"><img src="' + mgrPng + '" alt="Хронология по менеджерам"/></div>';
  }

  // Таблица день × менеджер
  if (mgrsWithData.length > 0) {
    html += '<div class="page-break"></div>';
    html += '<h2 class="rpt-sec">Таблица: день × менеджер</h2>';
    const headerCells =
      '<th>День</th>' +
      mgrsWithData.map(m => '<th>' + exp_escHtml(m.name) + '</th>').join('') +
      '<th>Отдел</th>';
    let bodyRows = '';
    agg.daily.forEach((d, di) => {
      bodyRows += '<tr>' +
        '<td>' + d.day + '</td>' +
        mgrsWithData.map(m => {
          const v = m.perDay[di] || 0;
          return '<td' + (v === 0 ? ' class="dim"' : '') + '>' + v + '</td>';
        }).join('') +
        '<td class="bold">' + d.count + '</td>' +
        '</tr>';
    });
    let totalCount = 0;
    agg.daily.forEach(d => totalCount += d.count);
    bodyRows += '<tr class="tr-total">' +
      '<td>Итого</td>' +
      mgrsWithData.map(m => '<td>' + m.total + '</td>').join('') +
      '<td>' + totalCount + '</td>' +
      '</tr>';
    html += '<table class="rpt-table small">' +
      '<thead><tr>' + headerCells + '</tr></thead>' +
      '<tbody>' + bodyRows + '</tbody>' +
      '</table>';
  } else {
    // Если по менеджерам пусто — обычная таблица по отделу
    html += '<h2 class="rpt-sec">Визиты по дням</h2>';
    let bodyRows = '';
    let totalCount = 0;
    agg.daily.forEach(d => {
      bodyRows += '<tr><td>' + d.day + '</td><td>' + d.count + '</td></tr>';
      totalCount += d.count;
    });
    bodyRows += '<tr class="tr-total"><td>Итого</td><td>' + totalCount + '</td></tr>';
    html += '<table class="rpt-table small narrow">' +
      '<thead><tr><th>День</th><th>Визитов</th></tr></thead>' +
      '<tbody>' + bodyRows + '</tbody>' +
      '</table>';
  }
  return html;
}

function exp_runPdf({ suffix, monthLabel, agg, plans, sections }) {
  const css = `
    /* margin:0 у @page — у браузера нет места под автоматический URL/заголовок */
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      color: #1a1a1a;
      font-size: 10pt;
      padding: 10mm 10mm 14mm 10mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1.rpt-title {
      font-size: 18pt; font-weight: 800; margin: 0 0 4mm 0;
      letter-spacing: 0.02em; text-align: center;
      border-bottom: 2px solid #1a1a1a; padding-bottom: 3mm;
    }
    h2.rpt-sec {
      font-size: 12pt; font-weight: 700; margin: 4mm 0 2mm 0;
      background: #1a1a1a; color: #fff; padding: 2mm 3mm; border-radius: 1mm;
    }
    .rpt-meta {
      font-size: 9pt; color: #666; text-align: center; margin-bottom: 4mm;
    }
    table.rpt-table {
      width: 100%; border-collapse: collapse; margin-bottom: 4mm;
      font-size: 9pt;
    }
    table.rpt-table.small { font-size: 8pt; }
    table.rpt-table.narrow { width: 40%; margin-left: auto; margin-right: auto; }
    /* Повторяем шапку на каждой странице, если таблица растянулась */
    table.rpt-table thead { display: table-header-group; }
    table.rpt-table tfoot { display: table-footer-group; }
    table.rpt-table tbody tr { page-break-inside: avoid; }
    table.rpt-table thead th {
      background: #3a6bd6; color: #fff; font-weight: 700;
      padding: 2mm 2mm; text-align: center; border: 1px solid #ccc;
      font-size: 8.5pt;
    }
    table.rpt-table tbody td {
      padding: 1.5mm 2mm; border: 1px solid #e0e0e0; text-align: center;
      vertical-align: middle;
    }
    table.rpt-table tbody td.left { text-align: left; }
    table.rpt-table tbody td.dim  { color: #c8c8c8; }
    table.rpt-table tbody td.bold { font-weight: 700; }
    table.rpt-table tbody tr:nth-child(even) td { background: #f7f9fc; }
    table.rpt-table tbody tr.tr-subtotal td {
      background: #fff4d6; font-weight: 600;
    }
    table.rpt-table tbody tr.tr-total td {
      background: #ffe9a8; font-weight: 800; border-top: 2px solid #999;
    }
    .chart-wrap {
      width: 100%; text-align: center; margin: 3mm 0;
      page-break-inside: avoid;
    }
    .chart-wrap img { max-width: 100%; height: auto; }
    .page-break { page-break-after: always; }
    .empty { color: #999; font-style: italic; text-align: center; margin: 4mm 0; }
    /* Старый end-of-doc футер больше не используем (см. .print-footer) */
    .footer { display: none; }

    /* Фиксированный футер на каждой печатной странице — слева внизу */
    .print-footer {
      display: none;
    }
    @media print {
      .print-footer {
        display: block;
        position: fixed;
        bottom: 4mm;
        left: 10mm;
        right: 10mm;
        color: #555;
        font-size: 9pt;
        font-style: italic;
        font-weight: 600;
        text-align: left;
      }
    }

    /* Подсказка для пользователя — только на экране */
    .rpt-hint {
      background: #fff8d6;
      border: 1px solid #f0d572;
      color: #7a5500;
      padding: 8px 14px;
      font-size: 11pt;
      border-radius: 6px;
      margin: 0 0 6mm 0;
      display: flex; align-items: center; gap: 10px;
    }
    .rpt-hint b { color: #4a3300; font-weight: 700; }
    @media print { .rpt-hint { display: none !important; } }

    /* ===== Верхняя панель (только на экране, скрыта при печати) ===== */
    .rpt-toolbar {
      position: sticky; top: 0;
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; padding: 10px 14px;
      background: #1a1a1a; color: #fff;
      box-shadow: 0 2px 12px rgba(0,0,0,0.18);
      margin: -10mm -10mm 6mm -10mm;
      z-index: 999;
      font-family: 'Helvetica Neue', Arial, sans-serif;
    }
    .rpt-toolbar-title {
      font-size: 12pt; font-weight: 700; letter-spacing: 0.02em;
    }
    .rpt-toolbar-actions { display: flex; gap: 8px; }
    .rpt-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 14px; border-radius: 8px;
      font-family: inherit; font-size: 11pt; font-weight: 600;
      cursor: pointer; border: none; outline: none;
      transition: background 0.15s, color 0.15s;
    }
    .rpt-btn-back {
      background: rgba(255,255,255,0.12); color: #fff;
    }
    .rpt-btn-back:hover { background: rgba(255,255,255,0.22); }
    .rpt-btn-print {
      background: #3a6bd6; color: #fff;
    }
    .rpt-btn-print:hover { background: #4d7be0; }
    @media print {
      .rpt-toolbar { display: none !important; }
      body { padding-top: 10mm !important; }
    }
  `;

  // Сборка тела
  let body = '';
  // Верхняя панель — только на экране, в PDF не попадёт
  body +=
    '<div class="rpt-toolbar">' +
      '<button class="rpt-btn rpt-btn-back" onclick="window.close()" title="Вернуться в приложение">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>' +
        '<span>Закрыть</span>' +
      '</button>' +
      '<div class="rpt-toolbar-title">Итоговый отчёт — ' + exp_escHtml(monthLabel) + '</div>' +
      '<button class="rpt-btn rpt-btn-print" onclick="window.print()" title="Печать / Сохранить как PDF">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>' +
        '<span>Печать / PDF</span>' +
      '</button>' +
    '</div>';
  // Подсказка по настройке диалога печати (только на экране)
  body +=
    '<div class="rpt-hint">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
      '<span>В диалоге печати: <b>«Дополнительные настройки» → «Поля» → «Без полей»</b> и снимите галку <b>«Колонтитулы»</b> — тогда URL/дата/номера страниц не попадут в PDF.</span>' +
    '</div>';
  body += '<h1 class="rpt-title">ИТОГОВЫЙ ОТЧЁТ ЗА ' + exp_escHtml(monthLabel.toUpperCase()) + '</h1>';
  body += '<div class="rpt-meta">Отдел CRM · Сформировано ' +
          new Date().toLocaleString('ru', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) +
          '</div>';

  const hasSummaryCols = sections.summary || sections.sales || sections.refus || sections.pct;
  if (hasSummaryCols) {
    body += '<h2 class="rpt-sec">Сводная по менеджерам</h2>';
    body += exp_pdfBuildSummaryTable(agg, plans, sections);
  }

  if (sections.city) {
    body += '<div class="page-break"></div>';
    body += '<h2 class="rpt-sec">Разбивка по городам</h2>';
    body += exp_pdfBuildCitySection(agg);
  }

  if (sections.timeline) {
    body += '<div class="page-break"></div>';
    body += '<h2 class="rpt-sec">Хронология визитов — отдел</h2>';
    body += exp_pdfBuildTimelineSection(agg, monthLabel);
  }

  // Фиксированный футер — печатается на КАЖДОЙ странице (CSS position:fixed @media print)
  body += '<div class="print-footer">Отчёт подготовил Бочаров Ю.С.</div>';

  const fullHtml =
    '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">' +
    '<title>Итоговый отчёт — ' + exp_escHtml(monthLabel) + '</title>' +
    '<style>' + css + '</style></head>' +
    '<body>' + body + '</body></html>';

  // Открываем в новом окне и запускаем печать
  const win = window.open('', '_blank', 'width=1100,height=800');
  if (!win) {
    throw new Error('Браузер заблокировал всплывающее окно. Разрешите popup для этого сайта.');
  }
  win.document.open();
  win.document.write(fullHtml);
  win.document.close();
  win.document.title = 'Итоговый отчёт — ' + monthLabel;
  // Не вызываем print() автоматически — у пользователя есть кнопки
  // «Закрыть» и «Печать / PDF» в верхней панели окна.
  try { win.focus(); } catch(e) { /* noop */ }
}
/* ════════════════════ END EXPORT REPORT ════════════════════ */

/* ════════════════════ REMINDERS (CRM/Дожим) ════════════════════ */
const REM_DEFS = [
  { id: 'morning', startMin:  9*60+15, endMin: 10*60+ 0, text: 'Актуализируй визиты за прошлые дни в таблице' },
  { id: 'noon',    startMin: 11*60+30, endMin: 12*60+ 0, text: 'Проверить в amoCRM сделки без задач' },
  { id: 'evening', startMin: 14*60+ 0, endMin: 15*60+ 0, text: 'Посмотри, есть ли пропущенные MANGO звонки, которые не распределились' },
];
const REM_STORAGE_KEY = 'rem_state_v1';
const REM_WORK_START_MIN = 9 * 60;
const REM_WORK_END_MIN   = 18 * 60;
let _remCheckTimer = null;
let _remEnsuredHeader = false;

function _remTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function _remNowMin() {
  const d = new Date();
  return d.getHours()*60 + d.getMinutes();
}
function _remLoadState() {
  try {
    const s = JSON.parse(localStorage.getItem(REM_STORAGE_KEY) || 'null');
    if (s && s.date === _remTodayStr()) return s;
  } catch(e) {}
  return null;
}
function _remSaveState(state) { localStorage.setItem(REM_STORAGE_KEY, JSON.stringify(state)); }
function _remResetForToday() {
  const items = {};
  REM_DEFS.forEach(d => {
    const fireMin = d.startMin + Math.floor(Math.random() * (d.endMin - d.startMin + 1));
    items[d.id] = { fireMin, shown: false, done: false };
  });
  const state = { date: _remTodayStr(), items };
  _remSaveState(state);
  return state;
}
function _remGetOrInit() {
  return _remLoadState() || _remResetForToday();
}

// Проверка: пользователь сегодня по графику работает «Р»
// Fail-CLOSED: уведомление шлём ТОЛЬКО когда точно знаем, что сегодня «Р».
// Если график не загружен / имени нет / колонка дня не найдена / стоит «В» —
// тик пропускается. Это исключает ложные срабатывания у выходных.
function _remIsInShiftToday() {
  const matched = findUserInSheet();
  if (!matched) return false;
  const raw = S.data.grafik;
  if (!raw || raw.length < 3) return false; // график не загружен → подождём
  let idx;
  try { idx = buildSchedIndex(raw); } catch(e) { return false; }
  const entry = idx?.[matched.name.toLowerCase()];
  if (!entry) return false; // имени нет в графике — не дёргаем
  const { row: mgrRow, daysRow } = entry;
  const today = new Date().getDate();
  for (let c = 1; c < daysRow.length; c++) {
    if (parseInt(daysRow[c]) === today) {
      return normalizeSchedVal(mgrRow[c]) === 'Р';
    }
  }
  return false; // колонка сегодняшнего дня не найдена → не дёргаем
}

function _remIsManagerRole() {
  const matched = findUserInSheet();
  if (!matched) return false;
  const role = String(matched.role || '').toLowerCase();
  return role === 'crm' || role === 'dozhim';
}

function _remEligibleUser() {
  // Для срабатывания уведомлений: роль + режим включён
  return _remIsManagerRole() && S.remMode === true;
}

function remApplyVisibility() {
  const wrap = document.getElementById('rem-wrap');
  if (!wrap) return;
  // Иконка видна всегда у CRM/Дожим (вне зависимости от режима)
  wrap.style.display = _remIsManagerRole() ? '' : 'none';
  remUpdateCounter();
}

function remUpdateCounter() {
  const cnt = document.getElementById('rem-count');
  const btn = document.getElementById('btn-rem');
  if (!cnt || !btn) return;
  const state = _remGetOrInit();
  // Активные = показанные (хотя бы раз прозвучали) и не выполненные
  const active = Object.entries(state.items).filter(([id, it]) => it.shown && !it.done).length;
  if (active > 0) {
    cnt.style.display = 'flex';
    cnt.textContent = String(active);
    btn.classList.add('has-active');
  } else {
    cnt.style.display = 'none';
    btn.classList.remove('has-active');
  }
}

function _remFormatTime(min) {
  return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;
}

function renderRemPanel() {
  const body = document.getElementById('rem-body');
  if (!body) return;
  const state = _remGetOrInit();
  const items = REM_DEFS.map(d => ({ ...d, ...state.items[d.id] }));
  const shownItems = items.filter(i => i.shown);
  if (!shownItems.length) {
    body.innerHTML = `<div class="rem-empty">Сегодня пока нет напоминаний.<br>Жди свой первый сигнал в течение рабочего дня.</div>`;
    return;
  }
  // Сортировка: сначала активные, потом выполненные
  shownItems.sort((a,b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.fireMin - b.fireMin;
  });
  body.innerHTML = shownItems.map(it => `
    <div class="rem-item ${it.done ? 'done' : ''}">
      <div class="rem-item-time"><span class="dot"></span>${_remFormatTime(it.fireMin)}${it.done ? ' · выполнено' : ' · активно'}</div>
      <div class="rem-item-text">${it.text}</div>
      ${it.done ? '' : `<button class="rem-item-btn" onclick="remMarkDone('${it.id}')">Выполнено</button>`}
    </div>`).join('');
}

function toggleRemPanel(e) {
  if (e) e.stopPropagation();
  const pop = document.getElementById('rem-popover');
  if (!pop) return;
  if (pop.classList.contains('open')) { closeRemPanel(); return; }
  renderRemPanel();
  pop.classList.add('open');
  document.getElementById('rem-backdrop')?.classList.add('on');
}
function closeRemPanel() {
  const pop = document.getElementById('rem-popover');
  if (pop) pop.classList.remove('open');
  document.getElementById('rem-backdrop')?.classList.remove('on');
}

function remMarkDone(id) {
  const state = _remGetOrInit();
  if (!state.items[id]) return;
  state.items[id].done = true;
  _remSaveState(state);
  remUpdateCounter();
  renderRemPanel();
}

function showRemBanner(id, text) {
  const ov = document.getElementById('rem-banner-overlay');
  const tx = document.getElementById('rem-banner-text');
  if (!ov || !tx) return;
  tx.textContent = text;
  ov.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeRemBanner() {
  const ov = document.getElementById('rem-banner-overlay');
  if (ov) ov.classList.remove('open');
  document.body.style.overflow = '';
}

function _remTick() {
  if (!_remEligibleUser()) return;
  // День сменился — сбросить
  const cur = _remLoadState();
  if (!cur) _remResetForToday();

  const nowMin = _remNowMin();
  if (nowMin < REM_WORK_START_MIN || nowMin > REM_WORK_END_MIN) return;

  // Если график ещё не подгружен — подтягиваем и выходим (fail-closed).
  // Следующий тик через 30с проверит уже с реальным графиком.
  const raw = S.data.grafik;
  if (!raw || raw.length < 3) {
    if (!window._remGrafikFetching) {
      window._remGrafikFetching = true;
      api(SHEETS.grafik, 'A1:AI25')
        .then(d => { S.data.grafik = d; })
        .catch(() => {})
        .finally(() => { window._remGrafikFetching = false; });
    }
    return;
  }
  if (!_remIsInShiftToday()) return;

  const state = _remGetOrInit();
  let changed = false;
  REM_DEFS.forEach(d => {
    const it = state.items[d.id];
    if (!it || it.done || it.shown) return;
    if (nowMin >= it.fireMin) {
      it.shown = true;
      changed = true;
      // Покажем баннер только если не открыт другой
      const ov = document.getElementById('rem-banner-overlay');
      if (ov && !ov.classList.contains('open')) {
        showRemBanner(d.id, d.text);
      }
    }
  });
  if (changed) {
    _remSaveState(state);
    remUpdateCounter();
    if (document.getElementById('rem-popover')?.classList.contains('open')) {
      renderRemPanel();
    }
  }
}

async function _remEnsureHeader() {
  if (_remEnsuredHeader) return;
  if (S.usersData && S.usersData[0] && (S.usersData[0][13] || '').toString().trim()) {
    _remEnsuredHeader = true; return;
  }
  try {
    const r = encodeURIComponent('USERS!N1:N1');
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CFG.SHEET_ID}/values/${r}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ values: [['Notifications']] }),
    });
    if (S.usersData && S.usersData[0]) S.usersData[0][13] = 'Notifications';
    _remEnsuredHeader = true;
  } catch(e) { /* noop */ }
}

function startRemindersLoop() {
  remApplyVisibility();
  if (_remCheckTimer) clearInterval(_remCheckTimer);
  // Проверяем каждые 30 секунд
  _remCheckTimer = setInterval(_remTick, 30 * 1000);
  // Сразу один тик
  _remTick();
  _remEnsureHeader();
  // Подгрузим график (если ещё не загружен), чтобы _remIsInShiftToday работал
  if (_remIsManagerRole() && (!S.data.grafik || (S.data.grafik || []).length < 3)) {
    try {
      api(SHEETS.grafik, 'A1:AI25')
        .then(d => { S.data.grafik = d; })
        .catch(() => {});
    } catch(e) {}
  }
}

// Диагностика в консоли: window.remDebug()
window.remDebug = function() {
  const matched = findUserInSheet();
  const state = _remLoadState();
  const info = {
    nowMin: _remNowMin(),
    today: _remTodayStr(),
    role: matched?.role,
    isManagerRole: _remIsManagerRole(),
    remMode: S.remMode,
    eligible: _remEligibleUser(),
    grafikLoaded: !!(S.data.grafik && S.data.grafik.length >= 3),
    inShift: _remIsInShiftToday(),
    workWindow: [REM_WORK_START_MIN, REM_WORK_END_MIN],
    state: state,
  };
  console.table(info);
  return info;
};

// Запускаем после старта приложения
document.addEventListener('DOMContentLoaded', () => {
  // Дадим базовой инициализации завершиться
  setTimeout(startRemindersLoop, 3000);
});
/* ════════════════════ END REMINDERS ════════════════════ */

/* ════════════════════════════════════════════════════════════════════
 * REPEAT SEARCH — поиск повторных визитов одного клиента (по телефону)
 * за последние N месяцев. Отчёт показывается в модалке и экспортируется
 * в XLSX (использует ExcelJS, который грузится для экспорта отчёта).
 * ═══════════════════════════════════════════════════════════════════ */

const RS_COL_DEFS = [
  { key: 'date',    idx: 0, label: 'ДАТА' },
  { key: 'name',    idx: 1, label: 'ФИО' },
  { key: 'phone',   idx: 2, label: 'ТЕЛЕФОН' },
  { key: 'city',    idx: 3, label: 'ГОРОД' },
  { key: 'comment', idx: 4, label: 'КОММЕНТАРИЙ' },
  { key: 'source',  idx: 5, label: 'ИСТОЧНИК' },
  { key: 'cat',     idx: 6, label: 'КАТЕГОРИЯ' },
  { key: 'buy',     idx: 7, label: 'СПОСОБ ПОКУПКИ' },
];
const RS_MGR_COL = 8; // I — менеджер

let _rsLastReport = null;

function _rsEnsureOverlay() {
  let ov = document.getElementById('repeats-overlay');
  if (ov) return ov;
  ov = document.createElement('div');
  ov.id = 'repeats-overlay';
  ov.className = 'repeats-overlay';
  ov.innerHTML = `
    <div class="repeats-shell">
      <div class="repeats-hdr" id="repeats-hdr">
        <div class="repeats-title">Поиск повторов</div>
        <div class="repeats-hdr-stats" id="repeats-hdr-stats" aria-hidden="true"></div>
        <div class="repeats-hdr-actions">
          <button class="repeats-icon-btn repeats-hdr-back" onclick="_rsBackToConfig()" aria-label="Настройки" title="Настройки">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <button class="repeats-icon-btn repeats-hdr-export" onclick="repeatSearchExportXlsx()" aria-label="Скачать XLSX" title="Скачать XLSX">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button class="repeats-close" onclick="closeRepeatSearchModal()" aria-label="Закрыть">×</button>
        </div>
      </div>
      <div class="repeats-body" id="repeats-body"></div>
    </div>`;
  document.body.appendChild(ov);
  return ov;
}

// Обновляем компактную сводку и видимость кнопок в шапке модалки
let _rsToolbarObserver = null;
let _rsStuckObserver = null;
function _rsBindHdrScrollState(perMgrCount, crossCount) {
  const hdr = document.getElementById('repeats-hdr');
  const body = document.getElementById('repeats-body');
  const stats = document.getElementById('repeats-hdr-stats');
  if (!hdr || !body) return;

  // Сводка: 83к./52с./31м.
  if (stats) {
    const total = perMgrCount + crossCount;
    stats.textContent = total
      ? `${total}к./${perMgrCount}с./${crossCount}м.`
      : '';
  }

  // Сбрасываем предыдущий observer
  if (_rsToolbarObserver) { _rsToolbarObserver.disconnect(); _rsToolbarObserver = null; }
  if (_rsStuckObserver)   { _rsStuckObserver.disconnect();   _rsStuckObserver = null; }
  hdr.classList.remove('scrolled');

  // Toolbar — если за пределами viewport, показываем компактные действия в шапке
  const tb = body.querySelector('.rs-toolbar');
  if (tb) {
    _rsToolbarObserver = new IntersectionObserver(([e]) => {
      hdr.classList.toggle('scrolled', !e.isIntersecting);
    }, { root: body, threshold: 0 });
    _rsToolbarObserver.observe(tb);
  }

  // Stuck-state для шапок менеджеров — через sentinel 1px перед каждой шапкой.
  // Если sentinel НЕ в viewport И прошёл выше — соответствующая шапка приклеилась.
  _rsStuckObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const block = e.target.parentElement;
      if (!block || !block.classList.contains('rs-mgr-block')) return;
      const stuck = !e.isIntersecting && e.boundingClientRect.top < 0;
      block.classList.toggle('rs-stuck', stuck);
    });
  }, { root: body, threshold: 0 });
  body.querySelectorAll('.rs-sentinel').forEach(s => _rsStuckObserver.observe(s));
}

function openRepeatSearchModal() {
  const ov = _rsEnsureOverlay();
  const body = document.getElementById('repeats-body');
  ov.classList.add('open');
  document.body.style.overflow = 'hidden';
  body.innerHTML = _rsRenderConfigHtml();
}

function closeRepeatSearchModal() {
  const ov = document.getElementById('repeats-overlay');
  if (!ov) return;
  ov.classList.remove('open');
  document.body.style.overflow = '';
  const hdr = document.getElementById('repeats-hdr');
  if (hdr) hdr.classList.remove('scrolled');
  if (_rsToolbarObserver) { _rsToolbarObserver.disconnect(); _rsToolbarObserver = null; }
  if (_rsStuckObserver)   { _rsStuckObserver.disconnect();   _rsStuckObserver = null; }
}

function _rsRenderConfigHtml() {
  const colsHtml = RS_COL_DEFS.map(c =>
    `<label class="rs-col-chip"><input type="checkbox" data-col="${c.key}" ${c.key==='phone'?'checked disabled':'checked'}> ${escapeHtml(c.label)}</label>`
  ).join('');
  const pills = [2,3,4,5,6].map(n =>
    `<button class="rs-pill${n===3?' on':''}" data-months="${n}" onclick="_rsSelectMonths(${n})">${n}</button>`
  ).join('');
  return `
    <div class="rs-config">
      <div class="rs-section">
        <div class="rs-label">Период (последние N месяцев)</div>
        <div class="rs-pills" id="rs-months-pills">${pills}</div>
      </div>
      <div class="rs-section">
        <div class="rs-label">Столбцы в отчёте</div>
        <div class="rs-cols">${colsHtml}</div>
        <div class="rs-hint">Телефон обязателен — по нему ищутся повторы.</div>
      </div>
      <button class="rs-run-btn" onclick="runRepeatSearchReport()">Сформировать отчёт</button>
    </div>`;
}

function _rsSelectMonths(n) {
  document.querySelectorAll('#rs-months-pills .rs-pill').forEach(b => b.classList.toggle('on', +b.dataset.months === n));
}

function _rsCleanPhone(s) {
  let d = String(s||'').replace(/\D/g,'');
  if (d.length === 11 && (d[0] === '7' || d[0] === '8')) d = d.slice(1);
  return d.length === 10 ? d : '';
}

function _rsDateMs(s) {
  const m = String(s||'').match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (!m) return 0;
  const yr = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return new Date(yr, +m[2]-1, +m[1]).getTime();
}

async function runRepeatSearchReport() {
  const body = document.getElementById('repeats-body');
  if (!body) return;
  const monthsBtn = document.querySelector('#rs-months-pills .rs-pill.on');
  const months = monthsBtn ? +monthsBtn.dataset.months : 3;
  const enabledCols = RS_COL_DEFS.filter(c => {
    const cb = document.querySelector(`input[data-col="${c.key}"]`);
    return cb ? cb.checked : false;
  });

  body.innerHTML = `
    <div class="rs-loading">
      <div class="rs-spinner" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="44" height="20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <circle cx="4" cy="12" r="0"><animate fill="freeze" attributeName="r" begin="0;SVGUppsBdVN.end" calcMode="spline" dur="0.5s" keySplines=".36,.6,.31,1" values="0;3"/><animate fill="freeze" attributeName="cx" begin="SVGqCgsydxJ.end" calcMode="spline" dur="0.5s" keySplines=".36,.6,.31,1" values="4;12"/><animate fill="freeze" attributeName="cx" begin="SVG3PwDNd6F.end" calcMode="spline" dur="0.5s" keySplines=".36,.6,.31,1" values="12;20"/><animate id="SVG3V8yEdYE" fill="freeze" attributeName="r" begin="SVG6wCQhd9Q.end" calcMode="spline" dur="0.5s" keySplines=".36,.6,.31,1" values="3;0"/><animate id="SVGUppsBdVN" fill="freeze" attributeName="cx" begin="SVG3V8yEdYE.end" dur="0.001s" values="20;4"/></circle>
          <circle cx="4" cy="12" r="3"><animate fill="freeze" attributeName="cx" begin="0;SVGUppsBdVN.end" calcMode="spline" dur="0.5s" keySplines=".36,.6,.31,1" values="4;12"/><animate fill="freeze" attributeName="cx" begin="SVGqCgsydxJ.end" calcMode="spline" dur="0.5s" keySplines=".36,.6,.31,1" values="12;20"/><animate id="SVG4PgJdbds" fill="freeze" attributeName="r" begin="SVG3PwDNd6F.end" calcMode="spline" dur="0.5s" keySplines=".36,.6,.31,1" values="3;0"/><animate id="SVG6wCQhd9Q" fill="freeze" attributeName="cx" begin="SVG4PgJdbds.end" dur="0.001s" values="20;4"/><animate fill="freeze" attributeName="r" begin="SVG6wCQhd9Q.end" calcMode="spline" dur="0.5s" keySplines=".36,.6,.31,1" values="0;3"/></circle>
          <circle cx="12" cy="12" r="3"><animate fill="freeze" attributeName="cx" begin="0;SVGUppsBdVN.end" calcMode="spline" dur="0.5s" keySplines=".36,.6,.31,1" values="12;20"/><animate id="SVG38aCdcdI" fill="freeze" attributeName="r" begin="SVGqCgsydxJ.end" calcMode="spline" dur="0.5s" keySplines=".36,.6,.31,1" values="3;0"/><animate id="SVG3PwDNd6F" fill="freeze" attributeName="cx" begin="SVG38aCdcdI.end" dur="0.001s" values="20;4"/><animate fill="freeze" attributeName="r" begin="SVG3PwDNd6F.end" calcMode="spline" dur="0.5s" keySplines=".36,.6,.31,1" values="0;3"/><animate fill="freeze" attributeName="cx" begin="SVG6wCQhd9Q.end" calcMode="spline" dur="0.5s" keySplines=".36,.6,.31,1" values="4;12"/></circle>
          <circle cx="20" cy="12" r="3"><animate id="SVGwaWzveSq" fill="freeze" attributeName="r" begin="0;SVGUppsBdVN.end" calcMode="spline" dur="0.5s" keySplines=".36,.6,.31,1" values="3;0"/><animate id="SVGqCgsydxJ" fill="freeze" attributeName="cx" begin="SVGwaWzveSq.end" dur="0.001s" values="20;4"/><animate fill="freeze" attributeName="r" begin="SVGqCgsydxJ.end" calcMode="spline" dur="0.5s" keySplines=".36,.6,.31,1" values="0;3"/><animate fill="freeze" attributeName="cx" begin="SVG3PwDNd6F.end" calcMode="spline" dur="0.5s" keySplines=".36,.6,.31,1" values="4;12"/><animate fill="freeze" attributeName="cx" begin="SVG6wCQhd9Q.end" calcMode="spline" dur="0.5s" keySplines=".36,.6,.31,1" values="12;20"/></circle>
        </svg>
      </div>
      <div class="rs-loading-lbl">Загрузка визитов за ${months} мес…</div>
    </div>`;

  // Генерим суффиксы за последние N месяцев (включая текущий)
  const suffixes = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    suffixes.push(mm + yy);
  }

  let allRows = [];
  try {
    const arrays = await Promise.all(suffixes.map(sfx =>
      api('ВИЗИТЫ' + sfx, 'A2:I2000').catch(() => [])
    ));
    arrays.forEach(rows => (rows||[]).forEach(r => { if (r && r[2]) allRows.push(r); }));
  } catch (e) {
    body.innerHTML = `<div class="rs-loading">Не удалось загрузить визиты</div>`;
    return;
  }

  // Группируем по чистому телефону
  const byPhone = {};
  allRows.forEach(r => {
    const ph = _rsCleanPhone(r[2]);
    if (!ph) return;
    const mgr = String(r[RS_MGR_COL]||'').trim();
    if (!mgr) return;
    (byPhone[ph] = byPhone[ph] || []).push({ row: r, mgr, date: r[0], name: r[1] });
  });

  // Отбираем телефоны с 2+ визитами
  const duplicates = {};
  Object.entries(byPhone).forEach(([ph, visits]) => {
    if (visits.length >= 2) duplicates[ph] = visits;
  });

  // Сортируем визиты каждого клиента по дате asc
  Object.values(duplicates).forEach(visits => {
    visits.sort((a, b) => _rsDateMs(a.date) - _rsDateMs(b.date));
  });

  // Разделяем: один менеджер vs несколько
  const perMgr = {}; // mgrName → [{ phone, visits }]
  const cross = [];  // [{ phone, visits }]
  Object.entries(duplicates).forEach(([phone, visits]) => {
    const mgrs = new Set(visits.map(v => v.mgr));
    if (mgrs.size === 1) {
      const m = visits[0].mgr;
      (perMgr[m] = perMgr[m] || []).push({ phone, visits });
    } else {
      cross.push({ phone, visits });
    }
  });

  // Сортируем клиентов внутри каждой секции по первой дате
  Object.values(perMgr).forEach(arr => arr.sort((a, b) => _rsDateMs(a.visits[0].date) - _rsDateMs(b.visits[0].date)));
  cross.sort((a, b) => _rsDateMs(a.visits[0].date) - _rsDateMs(b.visits[0].date));

  _rsLastReport = { perMgr, cross, enabledCols, months };
  body.innerHTML = _rsRenderResultHtml(perMgr, cross, enabledCols);
  const totalPerMgr = Object.values(perMgr).reduce((a, arr) => a + arr.length, 0);
  _rsBindHdrScrollState(totalPerMgr, cross.length);
}

function _rsRenderResultHtml(perMgr, cross, cols) {
  const totalPerMgr = Object.values(perMgr).reduce((a, arr) => a + arr.length, 0);
  const totalCross = cross.length;
  let html = `<div class="rs-toolbar">
    <button class="rs-back" onclick="_rsBackToConfig()">← Настройки</button>
    <div class="rs-stats">${totalPerMgr + totalCross} клиент(ов) с повторами · своих ${totalPerMgr} · между менеджерами ${totalCross}</div>
    <button class="rs-export" onclick="repeatSearchExportXlsx()">Скачать XLSX</button>
  </div>`;
  if (!totalPerMgr && !totalCross) {
    html += `<div class="rs-empty">Повторных визитов не найдено</div>`;
    return html;
  }

  const mgrSorted = Object.keys(perMgr).sort((a, b) => a.localeCompare(b, 'ru'));
  mgrSorted.forEach(mgr => {
    html += `<div class="rs-mgr-block"><div class="rs-sentinel"></div><div class="rs-mgr-hdr">${escapeHtml(mgr.toUpperCase())}</div>`;
    perMgr[mgr].forEach(({ phone, visits }) => {
      html += `<div class="rs-client-hdr">Клиент: ${escapeHtml(visits[0].name||'—')}, ${escapeHtml(phone)}</div>`;
      html += _rsRowsTable(visits, cols, false);
    });
    html += `</div>`;
  });

  if (cross.length) {
    html += `<div class="rs-mgr-block"><div class="rs-sentinel"></div><div class="rs-mgr-hdr">ПО ВСЕМ МЕНЕДЖЕРАМ СОВПАДЕНИЯ</div>`;
    cross.forEach(({ phone, visits }) => {
      html += `<div class="rs-client-hdr">Клиент: ${escapeHtml(visits[0].name||'—')}, ${escapeHtml(phone)}</div>`;
      html += _rsRowsTable(visits, cols, true);
    });
    html += `</div>`;
  }
  return html;
}

function _rsRowsTable(visits, cols, withMgr) {
  const headers = cols.map(c => `<th>${escapeHtml(c.label)}</th>`).join('') + (withMgr ? '<th>МЕНЕДЖЕР</th>' : '');
  const rows = visits.map(v => {
    const cells = cols.map(c =>
      `<td data-label="${escapeAttr(c.label)}">${escapeHtml(String(v.row[c.idx]||''))}</td>`
    ).join('') + (withMgr ? `<td data-label="МЕНЕДЖЕР">${escapeHtml(v.mgr)}</td>` : '');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<table class="rs-tbl"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

function _rsBackToConfig() {
  const body = document.getElementById('repeats-body');
  if (body) body.innerHTML = _rsRenderConfigHtml();
  const hdr = document.getElementById('repeats-hdr');
  if (hdr) hdr.classList.remove('scrolled');
  const stats = document.getElementById('repeats-hdr-stats');
  if (stats) stats.textContent = '';
  if (_rsToolbarObserver) { _rsToolbarObserver.disconnect(); _rsToolbarObserver = null; }
  if (_rsStuckObserver)   { _rsStuckObserver.disconnect();   _rsStuckObserver = null; }
}

async function repeatSearchExportXlsx() {
  if (!_rsLastReport) return;
  const { perMgr, cross, enabledCols } = _rsLastReport;
  try { await exp_loadExcelJS(); }
  catch (e) { toast('Не удалось загрузить ExcelJS', 'e'); return; }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Повторы');
  const teal  = 'FF4FD0D6';
  const green = 'FFCDE9C4';
  const grey  = 'FFE8E8E8';
  let rowI = 1;
  const baseCols = enabledCols.length;

  function setRow(values, fillArgb, bold, mergeWidth) {
    const row = ws.getRow(rowI++);
    values.forEach((v, i) => { row.getCell(i+1).value = v; });
    if (fillArgb) {
      const width = mergeWidth || values.length;
      for (let i = 1; i <= width; i++) {
        row.getCell(i).fill = { type:'pattern', pattern:'solid', fgColor:{ argb: fillArgb } };
        if (bold) row.getCell(i).font = { bold: true };
      }
      if (mergeWidth && mergeWidth > 1) {
        ws.mergeCells(rowI-1, 1, rowI-1, mergeWidth);
      }
    } else if (bold) {
      values.forEach((_, i) => row.getCell(i+1).font = { bold: true });
    }
    return row;
  }

  function emitTableHeader(extraHeaders) {
    const all = [...enabledCols.map(c => c.label), ...(extraHeaders||[])];
    setRow(all, grey, true);
  }
  function emitDataRow(visit, extraVals) {
    const row = ws.getRow(rowI++);
    enabledCols.forEach((c, i) => row.getCell(i+1).value = String(visit.row[c.idx]||''));
    (extraVals||[]).forEach((v, i) => row.getCell(baseCols + i + 1).value = v);
  }

  const mgrSorted = Object.keys(perMgr).sort((a, b) => a.localeCompare(b, 'ru'));
  mgrSorted.forEach(mgr => {
    setRow([mgr.toUpperCase()], teal, true, Math.max(baseCols, 1));
    perMgr[mgr].forEach(({ phone, visits }) => {
      setRow([`Клиент: ${visits[0].name||'—'}, ${phone}`], green, true, Math.max(baseCols, 1));
      emitTableHeader();
      visits.forEach(v => emitDataRow(v));
    });
    rowI++; // отступ между менеджерами
  });

  if (cross.length) {
    setRow(['ПО ВСЕМ МЕНЕДЖЕРАМ СОВПАДЕНИЯ'], teal, true, Math.max(baseCols + 1, 1));
    cross.forEach(({ phone, visits }) => {
      setRow([`Клиент: ${visits[0].name||'—'}, ${phone}`], green, true, Math.max(baseCols + 1, 1));
      emitTableHeader(['МЕНЕДЖЕР']);
      visits.forEach(v => emitDataRow(v, [v.mgr]));
    });
  }

  // Авто-ширины
  ws.columns.forEach(col => {
    let max = 10;
    col.eachCell({ includeEmpty: false }, c => {
      const len = String(c.value||'').length;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 2, 50);
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const ts = new Date().toISOString().slice(0,10);
  a.download = `Повторы-${ts}.xlsx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 500);
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const ov = document.getElementById('repeats-overlay');
  if (ov && ov.classList.contains('open')) closeRepeatSearchModal();
});

window.openRepeatSearchModal = openRepeatSearchModal;
window.closeRepeatSearchModal = closeRepeatSearchModal;
window.runRepeatSearchReport  = runRepeatSearchReport;
window.repeatSearchExportXlsx = repeatSearchExportXlsx;
window._rsSelectMonths        = _rsSelectMonths;
window._rsBackToConfig        = _rsBackToConfig;
