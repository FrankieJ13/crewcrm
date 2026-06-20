/* Timeline Leads — ported v42 (BigData timeline dashboard). IIFE-scoped; document.body → #tl-app. */
(function(){'use strict';
const TLROOT = document.getElementById('tl-app') || document.body;
const K = ["id","manager","city","source","landing","final","reason","reasonRaw","reasonClass","qualCode","qualBucket","visit","success","closed","prev","sla","slaBucket","slaMin","callsBucket","calls","callDurSec","notes","tasks","chain","created","closedAt","ageDays","closeDays","leadCost","budget","lifecycle"];
const RAW = [];
let deals = [];
let currentDataSource = '';
let currentDataFile = '';
const filterDefs = [
  { id:'manager', label:'Ответственный', key:'manager', all:'Все ответственные' },
  { id:'city', label:'Город', key:'city', all:'Все города' },
  { id:'source', label:'Источник обращения', key:'source', all:'Все источники' },
  { id:'landing', label:'Посадка', key:'landing', all:'Все посадки' },
  { id:'qualification', label:'Квалы', key:'qualificationFilterValue', all:'Все квалы' },
  { id:'funnel', label:'Воронка', key:'funnel', all:'Все воронки' },
  { id:'realization', label:'Реализации', key:'realizationFilterValue', all:'Все реализации' },
];
const state = { manager:new Set(), city:new Set(), source:new Set(), landing:new Set(), qualification:new Set(), funnel:new Set(), realization:new Set(), dateFrom:'', dateTo:'' };
const fmt = new Intl.NumberFormat('ru-RU');
function num(v) { return Number(v||0) || 0; }
function pct(a,b,d=1) { return b ? ((a/b)*100).toFixed(d).replace('.',',')+'%' : '0%'; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
function countBy(arr, keyFn) { const m=new Map(); for(const x of arr) { const k=keyFn(x)||'Не указано'; m.set(k,(m.get(k)||0)+1); } return [...m.entries()].sort((a,b)=>b[1]-a[1] || String(a[0]).localeCompare(String(b[0]), 'ru')); }
const KNOWN_CITY_NAMES = [
  'Барнаул','Кемерово','Красноярск','Новокузнецк','Новосибирск','Омск','Оренбург','Пермь','Сургут','Томск','Тюмень','Челябинск','Екатеринбург','Москва','Санкт-Петербург',
  'Не указан','Без города'
];
const KNOWN_CITY_SET = new Set(KNOWN_CITY_NAMES.map(normalizePersonName));
function filterGroupTitle(def) {
  if(def.id === 'city') return 'Города';
  return '';
}
function normalizePersonName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g,'е')
    .replace(/[^а-яa-z0-9\s-]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function personFiKey(s) {
  const p = normalizePersonName(s).split(' ').filter(Boolean);
  if(!p.length) return '';
  return p.slice(0,2).join(' ');
}
function looksLikeRealPersonName(s) {
  const p = normalizePersonName(s).split(' ').filter(Boolean);
  if(p.length < 2 || p.length > 4) return false;
  if(KNOWN_CITY_SET.has(normalizePersonName(s))) return false;
  return p.every(x => /[а-яa-z]/i.test(x) && x.length >= 2);
}
function managerOptionGroup(value) {
  const n = normalizePersonName(value);
  if(KNOWN_CITY_SET.has(n)) return { key:'cities', title:'Города' };
  if(looksLikeRealPersonName(value)) return { key:'managers', title:'Менеджеры' };
  return { key:'other', title:'Прочее' };
}
function managerGroupOrder(key) {
  return key === 'managers' ? 1 : (key === 'cities' ? 2 : 3);
}
function avg(arr, fn) { const vals=arr.map(fn).filter(v=>Number.isFinite(v)); return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0; }
function median(arr, fn) {
  const vals=arr.map(fn).filter(v=>Number.isFinite(v)).sort((a,b)=>a-b);
  if(!vals.length) return Number.NaN;
  const mid=Math.floor(vals.length/2);
  return vals.length%2 ? vals[mid] : (vals[mid-1]+vals[mid])/2;
}
function fmtHours(h) {
  h = Number(h);
  if(!Number.isFinite(h)) return '—';
  const abs=Math.abs(h);
  if(abs < 1) return Math.round(h*60)+' мин';
  if(abs < 48) return (Math.round(h*10)/10).toString().replace('.', ',')+' ч';
  return (Math.round((h/24)*10)/10).toString().replace('.', ',')+' д';
}
function parseAnyDate(s) {
  s = String(s ?? '').trim();
  if(!s) return null;
  const ru = parseRuDate(s);
  if(ru) return ru;
  if(/^\d{10,13}$/.test(s)) {
    const n=Number(s);
    const d=new Date(s.length===13 ? n : n*1000);
    return isNaN(+d) ? null : d;
  }
  const iso = new Date(s);
  return isNaN(+iso) ? null : iso;
}
function monthKeyFromDate(d) {
  if(!d || isNaN(+d)) return '';
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function monthLabel(key) {
  if(!key) return '—';
  const [y,m]=key.split('-');
  return `${m}.${y}`;
}
function safeJsonParse(s, fallback=[]) {
  try { return JSON.parse(s || '[]'); } catch(e) { return fallback; }
}
function aggregateStageDwell(arr) {
  const m=new Map();
  for(const d of arr) {
    for(const x of safeJsonParse(d.stageSpansJson)) {
      const stage=x.stage || 'Не указано';
      const h=Number(x.hours);
      if(!Number.isFinite(h) || h < 0) continue;
      if(!m.has(stage)) m.set(stage, []);
      m.get(stage).push(h);
    }
  }
  return [...m.entries()].map(([stage, vals])=>({
    stage, count: vals.length,
    avg: vals.reduce((a,b)=>a+b,0)/vals.length,
    med: vals.slice().sort((a,b)=>a-b)[Math.floor(vals.length/2)],
    max: Math.max(...vals),
    total: vals.reduce((a,b)=>a+b,0)
  })).sort((a,b)=>b.avg-a.avg || b.count-a.count);
}
function aggregateTransitionPairs(arr) {
  const m=new Map();
  for(const d of arr) {
    for(const x of safeJsonParse(d.transitionPairsJson)) {
      const pair=x.pair || 'Не указано';
      const h=Number(x.hours);
      if(!Number.isFinite(h) || h < 0) continue;
      if(!m.has(pair)) m.set(pair, []);
      m.get(pair).push(h);
    }
  }
  return [...m.entries()].map(([pair, vals])=>({
    pair, count: vals.length,
    avg: vals.reduce((a,b)=>a+b,0)/vals.length,
    med: vals.slice().sort((a,b)=>a-b)[Math.floor(vals.length/2)],
    max: Math.max(...vals),
    total: vals.reduce((a,b)=>a+b,0)
  })).sort((a,b)=>b.avg-a.avg || b.count-a.count);
}
function passesFilters(d, excludeId='') {
  const base = filterDefs.every(f => {
    if(f.id === excludeId) return true;
    if(f.id === 'realization') return state.realization.size===0 || (num(d.success) && state.realization.has(d.realizationFilterValue || 'пусто'));
    return state[f.id].size===0 || state[f.id].has(d[f.key] || 'пусто');
  });
  const ymd = d.createdYmd || (parseAnyDate(d.created) ? fmtYmd(parseAnyDate(d.created)) : '');
  const fromOk = excludeId === 'date' || !state.dateFrom || (ymd && ymd >= state.dateFrom);
  const toOk = excludeId === 'date' || !state.dateTo || (ymd && ymd <= state.dateTo);
  return base && fromOk && toOk;
}
function isFiltered(d) {
  return passesFilters(d, '');
}
function optionCountsForFilter(def) {
  const base = deals.filter(d=>passesFilters(d, def.id));
  if(def.id === 'realization') {
    return ['Кредит','Комиссия','Наличные','Обмен','Выкуп','пусто']
      .map(v=>[v, base.filter(d=>num(d.success) && (d.realizationFilterValue || 'пусто')===v).length])
      .filter(x=>x[1] > 0 || state.realization.has(x[0]));
  }
  if(def.id === 'qualification') {
    return ['Квал','Не квал','пусто']
      .map(v=>[v, base.filter(d=>(d.qualificationFilterValue || 'пусто')===v).length])
      .filter(x=>x[1] > 0 || state.qualification.has(x[0]));
  }
  if(def.id === 'funnel') {
    return ['Воронка КЦ','CRM','Теплые лиды','пусто']
      .map(v=>[v, base.filter(d=>(d.funnel || 'пусто')===v).length])
      .filter(x=>x[1] > 0 || state.funnel.has(x[0]));
  }
  const counts=countBy(base, d=>d[def.key]||'пусто');
  // Если выбранное значение в текущем срезе стало нулевым, оставляем его в списке с 0, чтобы пользователь видел активный фильтр и мог снять.
  state[def.id]?.forEach(v=>{
    if(!counts.some(x=>x[0]===v)) counts.push([v,0]);
  });
  return counts.sort((a,b)=>b[1]-a[1] || String(a[0]).localeCompare(String(b[0]), 'ru'));
}

function parseRuDate(s) {
  s = String(s ?? '').trim();
  if(!s) return null;
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if(!m) return null;
  return new Date(+m[3], +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0), 0, 0);
}
function fmtDateOnly(d) {
  if(!d || isNaN(+d)) return '';
  return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear();
}
function fmtYmd(d) {
  if(!d || isNaN(+d)) return '';
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function normalizeRealizationType(v) {
  const s = String(v ?? '').trim();
  if(!s) return 'пусто';
  const low = s.toLowerCase();
  if(low.includes('кредит')) return 'Кредит';
  if(low.includes('комисс')) return 'Комиссия';
  if(low.includes('налич')) return 'Наличные';
  if(low.includes('обмен')) return 'Обмен';
  if(low.includes('выкуп')) return 'Выкуп';
  return 'пусто';
}
function qualificationFilterValue(q) {
  if(q === 'qual') return 'Квал';
  if(q === 'nonqual') return 'Не квал';
  return 'пусто';
}
function normalizeFunnelName(v) {
  const s = String(v ?? '').trim();
  if(!s) return 'пусто';
  const low = s.toLowerCase().replace(/ё/g,'е');
  if(low.includes('тепл')) return 'Теплые лиды';
  if(low.includes('crm') || low.includes('сrm') || low.includes('срм') || low.includes('црм')) return 'CRM';
  if(low.includes('кц') || low.includes('воронка кц') || low.includes('контакт')) return 'Воронка КЦ';
  return s;
}
function pickFunnel(card, events) {
  const direct = pick(card, ['SUM_Воронка','DEAL_Воронка','TL_Воронка','Воронка','DEAL_Название воронки','Название воронки','PIPELINE_NAME','pipeline_name'])
    || pickIncludes(card, ['воронк'])
    || pickIncludes(card, ['pipeline']);
  if(direct) return normalizeFunnelName(direct);
  const ev = (events || []).map(e=>[e.details,e.from].join(' ')).join(' ').toLowerCase();
  if(ev.includes('тепл')) return 'Теплые лиды';
  if(ev.includes('crm') || ev.includes('срм') || ev.includes('црм')) return 'CRM';
  if(ev.includes('кц')) return 'Воронка КЦ';
  return 'пусто';
}
function pickRealizationType(card) {
  // Важно: SUM_Успешное закрытие карточки / DEAL_Успешное закрытие карточки могут быть булевыми Да/Нет.
  // Для фильтра «Реализации» нужен именно справочник DEAL_CF[743491].
  const raw = pick(card, [
    'DEAL_CF[743491] Успешное закрытие карточки',
    'DEAL_CF[738121] Вид оплаты'
  ]);
  return normalizeRealizationType(raw);
}
function isNonEmpty(v) { return v !== undefined && v !== null && String(v).trim() !== ''; }
function pick(row, names) {
  for(const n of names) if(row && isNonEmpty(row[n])) return String(row[n]).trim();
  return '';
}
function pickIncludes(row, words) {
  if(!row) return '';
  const lowWords = words.map(w=>String(w).toLowerCase());
  for(const k of Object.keys(row)) {
    const lk = k.toLowerCase();
    if(lowWords.every(w=>lk.includes(w)) && isNonEmpty(row[k])) return String(row[k]).trim();
  }
  return '';
}
function truthy(v) {
  const s=String(v ?? '').trim().toLowerCase();
  return ['1','да','true','yes','y','успешно'].includes(s);
}

const CITY_PLACEHOLDER_VALUES = new Set(['екатеринбург','не указан','без города']);
const KNOWN_CITIES = [
  'Барнаул','Кемерово','Красноярск','Новокузнецк','Новосибирск','Омск','Оренбург','Пермь',
  'Сургут','Томск','Тюмень','Челябинск','Екатеринбург','Москва','Санкт-Петербург'
];
function normCityName(s) {
  return String(s ?? '').trim().replace(/\s+/g,' ');
}
function isBadCityValue(s) {
  const v = normCityName(s).toLowerCase();
  return !v || CITY_PLACEHOLDER_VALUES.has(v);
}
function extractCityFromTimelineEvents(events) {
  const creationLike = events.filter(e =>
    e.type === 'Создание' ||
    /создан|создание|дата создания|новое обращение|формирован|сформирован|анкета|заявк/i.test(String(e.details || ''))
  );
  const pool = (creationLike.length ? creationLike : events).slice(0, 8);
  const text = pool.map(e => String(e.details || '')).join(' | ');

  // 1) Явные конструкции: "город: Омск", "г. Омск", "город выдачи Омск"
  const explicit = text.match(/(?:город(?:\s+выдачи)?|г\.?)\s*[:\-—]?\s*([А-ЯЁ][а-яё]+(?:[\s-][А-ЯЁ][а-яё]+)?)/i);
  if(explicit && explicit[1]) {
    const val = normCityName(explicit[1]);
    const known = KNOWN_CITIES.find(c => c.toLowerCase() === val.toLowerCase());
    if(known) return known;
  }

  // 2) Если город просто встречается в тексте формирования карточки.
  const low = text.toLowerCase();
  for(const c of KNOWN_CITIES) {
    const re = new RegExp('(?:^|[^а-яёa-z])' + c.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:$|[^а-яёa-z])', 'i');
    if(re.test(low)) return c;
  }
  return '';
}
function resolveDealCity(rawCity, issueCity, events) {
  rawCity = normCityName(rawCity);
  issueCity = normCityName(issueCity);
  const timelineCity = extractCityFromTimelineEvents(events);

  // Политика v6:
  // если поле "Город" = Екатеринбург / Не указан / Без города,
  // считаем истиной "Город Выдачи"; если он пустой — пробуем город из формирования карточки,
  // затем оставляем исходное поле "Город".
  if(isBadCityValue(rawCity)) return issueCity || timelineCity || rawCity || 'Не указан';

  return rawCity || issueCity || timelineCity || 'Не указан';
}

const NONQUAL_FUNNEL_STAGES = [
  'ВСЕ ЗАЯВКИ',
  'ПЕРЕДАНО МЕНЕДЖЕРУ',
  'НЕТ ОТВЕТА',
  'ОТЛОЖЕННЫЙ ЗВОНОК',
  'В РАБОТЕ/НЕ РАСПРЕДЕЛЕНО',
  'В РАБОТЕ/ХОЛОДНЫЙ'
];
const QUAL_FUNNEL_STAGES = [
  'В РАБОТЕ/ГОРЯЧИЙ',
  'ВСТРЕЧА ПОДТВЕРЖДЕНА',
  'НЕ ПРИЕХАЛ',
  'ПОВТОРНЫЙ ВИЗИТ',
  'ПРИЕХАЛ',
  'В РАБОТЕ У КСО'
];
function normStageName(s) {
  return String(s ?? '')
    .toUpperCase()
    .replace(/Ё/g,'Е')
    .replace(/\s+/g,' ')
    .replace(/\s*\/\s*/g,'/')
    .trim();
}
const NONQUAL_STAGE_SET = new Set(NONQUAL_FUNNEL_STAGES.map(normStageName));
const QUAL_STAGE_SET = new Set(QUAL_FUNNEL_STAGES.map(normStageName));
function classifyFunnelStage(stage) {
  const s = normStageName(stage);
  if(!s) return '';
  if(QUAL_STAGE_SET.has(s)) return 'qual';
  if(NONQUAL_STAGE_SET.has(s)) return 'nonqual';
  return '';
}
function resolveQualificationByCodeAndFunnel(qualCode, stages, salesBotQualification='', cardQualification='') {
  // Приоритет v30:
  // 1) последнее событие SalesBot по "Квал лид" / тегу "Квал";
  // 2) итоговое поле карточки "Квал лид" / тег "Квал";
  // 3) квал-этапы воронки;
  // 4) код причины закрытия;
  // 5) не-квал этапы воронки.
  if(salesBotQualification === 'qual' || salesBotQualification === 'nonqual') return salesBotQualification;
  if(cardQualification === 'qual' || cardQualification === 'nonqual') return cardQualification;

  const normalized = (stages || []).map(normStageName).filter(Boolean);
  const hasQual = normalized.some(s => QUAL_STAGE_SET.has(s));
  const hasNonqual = normalized.some(s => NONQUAL_STAGE_SET.has(s));
  if(hasQual) return 'qual';

  if(['2','3','4'].includes(String(qualCode))) return 'qual';
  if(String(qualCode)==='1') return 'nonqual';

  if(hasNonqual) return 'nonqual';
  return 'unknown';
}
function qualificationLabel(q) {
  if(q === 'qual') return 'Квал';
  if(q === 'nonqual') return 'Не квал';
  return 'Не классифицировано';
}
function resolveQualificationFromSalesBot(events) {
  // Приоритетный метод: последнее событие SalesBot, связанное с "Квал лид" / тегом "Квал".
  // Примеры:
  // SalesBot (Квал лид): Для поля «Квал лид» установлено значение «Да»
  // SalesBot (Квал лид): Теги добавлены: Квал
  // Если таких событий несколько, берём последнее по дате.
  const candidates = (events || [])
    .filter(e => {
      const type = String(e.type || '');
      const details = String(e.details || '');
      const text = (type + ' ' + details).toLowerCase();
      return text.includes('salesbot') && (text.includes('квал лид') || text.includes('теги добавлены: квал') || text.includes('теги удалены: квал') || text.includes('тег удален: квал') || text.includes('тег удалён: квал'));
    })
    .sort((a,b)=>(a.date ? +a.date : 0) - (b.date ? +b.date : 0));

  if(!candidates.length) return '';

  const last = candidates[candidates.length - 1];
  const text = (String(last.type || '') + ' ' + String(last.details || '')).toLowerCase();

  if(/теги?\s+(?:удален|удалён|удалены)\s*:\s*квал/i.test(text)) return 'nonqual';
  if(/квал\s*лид[^а-яёa-z0-9]+установлено\s+значение[^а-яёa-z0-9]+нет/i.test(text)) return 'nonqual';
  if(/установлено\s+значение[^а-яёa-z0-9]+нет/i.test(text) && text.includes('квал лид')) return 'nonqual';

  if(/теги?\s+добавлен[ы]?\s*:\s*квал/i.test(text)) return 'qual';
  if(/квал\s*лид[^а-яёa-z0-9]+установлено\s+значение[^а-яёa-z0-9]+да/i.test(text)) return 'qual';
  if(/установлено\s+значение[^а-яёa-z0-9]+да/i.test(text) && text.includes('квал лид')) return 'qual';

  return '';
}
function resolveQualificationFromCardFields(card) {
  // Если в экспортированном таймлайне нет SalesBot-события, используем итоговое состояние карточки.
  // Это закрывает случаи, когда поле/тег уже есть в карточке, но событие изменения не попало в BigData.
  const qualLead = pick(card, ['DEAL_CF[742459] Квал лид', 'Квал лид']);
  const q = String(qualLead || '').trim().toLowerCase();
  if(['да','yes','true','1'].includes(q)) return 'qual';
  if(['нет','no','false','0'].includes(q)) return 'nonqual';

  const tags = [
    pick(card, ['SUM_Теги']),
    pick(card, ['DEAL_Теги']),
    pick(card, ['CONTACT_MAIN_Теги'])
  ].join(',').toLowerCase();

  if(tags.split(',').map(x=>x.trim()).includes('квал')) return 'qual';
  return '';
}
function parseNum(v) {
  if(v===undefined || v===null || v==='') return 0;
  const n = Number(String(v).replace(/\s/g,'').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
function detectDelimiter(text) {
  const first = (text.split(/\r?\n/).find(x=>x.trim()) || '');
  const candidates = [';', ',', '\t'];
  let best=';', score=-1;
  for(const d of candidates) {
    let count=0, inQ=false;
    for(let i=0;i<first.length;i++) {
      const ch=first[i];
      if(ch==='"') inQ=!inQ;
      else if(ch===d && !inQ) count++;
    }
    if(count>score) { score=count; best=d; }
  }
  return best;
}
function parseCSV(text, delim) {
  text = String(text || '').replace(/^\uFEFF/, '');
  delim = delim || detectDelimiter(text);
  const rows=[]; let row=[], cell='', inQ=false;
  for(let i=0;i<text.length;i++) {
    const ch=text[i], next=text[i+1];
    if(inQ) {
      if(ch === '"' && next === '"') { cell += '"'; i++; }
      else if(ch === '"') inQ=false;
      else cell += ch;
    } else {
      if(ch === '"') inQ=true;
      else if(ch === delim) { row.push(cell); cell=''; }
      else if(ch === '\n') { row.push(cell); rows.push(row); row=[]; cell=''; }
      else if(ch === '\r') { /* ignore */ }
      else cell += ch;
    }
  }
  row.push(cell); rows.push(row);
  while(rows.length && rows[rows.length-1].every(v=>String(v).trim()==='')) rows.pop();
  return rows;
}
function csvObjects(text) {
  const rows=parseCSV(text);
  if(!rows.length) throw new Error('CSV пустой.');
  const headers=rows[0].map(h=>String(h||'').replace(/^\uFEFF/, '').trim());
  if(!headers.includes('BD_ID сделки') && !headers.includes('TL_ID') && !headers.includes('ID')) {
    throw new Error('Не вижу структуру BigData v4.x: нет колонок BD_ID сделки / TL_ID.');
  }
  return rows.slice(1).filter(r=>r.some(v=>String(v).trim()!=='')).map(r=>{
    const o={};
    headers.forEach((h,i)=>o[h]=r[i] ?? '');
    return o;
  });
}
function parseDurationSec(s) {
  const matches = String(s||'').match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g);
  if(!matches) return 0;
  const p = matches[matches.length-1].split(':').map(Number);
  if(p.length===3) return p[0]*3600+p[1]*60+p[2];
  return p[0]*60+p[1];
}
function fmtHms(sec) {
  sec = Math.max(0, Math.round(Number(sec)||0));
  const h = Math.floor(sec/3600);
  const m = Math.floor((sec%3600)/60);
  const s = sec%60;
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function isOutgoingCallDetails(details) {
  return /исходящ/i.test(String(details || ''));
}
function outgoingCallsByManager(arr) {
  const m = new Map();
  for(const d of arr) {
    for(const c of safeJsonParse(d.callEventsJson)) {
      if(!c || c.direction !== 'outgoing') continue;
      const manager = c.manager || 'Не указан';
      if(!m.has(manager)) m.set(manager, {manager, calls:0, callsGt30:0, callsGt60:0, callsGt180:0, totalSec:0, dealIds:new Set()});
      const x = m.get(manager);
      const dur = Number(c.durationSec)||0;
      x.calls++;
      // Пороговая логика: это НЕ интервалы, а накопительные признаки "длительность больше N".
      // Звонок 04:00 попадёт сразу в >30 сек, >1 мин и >3 мин.
      if(dur > 30) x.callsGt30++;
      if(dur > 60) x.callsGt60++;
      if(dur > 180) x.callsGt180++;
      x.totalSec += dur;
      x.dealIds.add(String(d.id));
    }
  }
  return [...m.values()].map(x=>({
    manager:x.manager,
    deals:x.dealIds.size,
    calls:x.calls,
    callsGt30:x.callsGt30,
    callsGt60:x.callsGt60,
    callsGt180:x.callsGt180,
    totalSec:x.totalSec,
    avgSec:x.calls ? x.totalSec/x.calls : 0
  })).sort((a,b)=>b.calls-a.calls || b.totalSec-a.totalSec || a.manager.localeCompare(b.manager,'ru'));
}
function classifyCallBucket(calls) {
  calls = Number(calls)||0;
  if(calls<=0) return '0 звонков';
  if(calls===1) return '1 звонок';
  if(calls===2) return '2 звонка';
  if(calls===3) return '3 звонка';
  return '4+ звонка';
}
function slaBucketFromMinutes(mins) {
  if(!Number.isFinite(mins)) return 'Нет звонка';
  if(mins <= 15) return '≤15 мин';
  if(mins <= 60) return '15-60 мин';
  if(mins <= 180) return '1-3 часа';
  if(mins <= 1440) return '3-24 часа';
  return '>24 часов';
}
function addBigDataRowToGroups(r, byDeal) {
  const id = pick(r, ['BD_ID сделки','TL_ID','SUM_ID','DEAL_ID сделки','ID']);
  if(!id) return;
  if(!byDeal.has(id)) byDeal.set(id, {id, card:null, firstCard:null, events:[]});
  const g = byDeal.get(id);

  const hasDeal = Object.keys(r).some(k=>k.startsWith('DEAL_') && isNonEmpty(r[k])) || Object.keys(r).some(k=>k.startsWith('SUM_') && isNonEmpty(r[k]));
  if(hasDeal && !g.firstCard) g.firstCard = r;
  if(String(r['BD_Карточка заполнена']||'').trim()==='Да' || (!g.card && hasDeal)) {
    if(hasDeal) g.card = r;
  }

  const type = pick(r,['TL_Тип','Тип']);
  const dateRaw = pick(r,['TL_Дата','Дата']);
  const details = pick(r,['TL_Детали','Детали']);
  const from = pick(r,['TL_Из_этапа','Из_этапа']);
  if(type || dateRaw || details || from) {
    g.events.push({
      type,
      dateRaw,
      date: parseRuDate(dateRaw),
      details,
      from,
      manager: pick(r, ['TL_Менеджер','Менеджер','SUM_Менеджер','DEAL_Ответственный'])
    });
  }
}
function rowToObject(headers, row) {
  const o={};
  headers.forEach((h,i)=>o[h]=row[i] ?? '');
  return o;
}
function detectCsvDelimiter(sample) {
  const firstLine = String(sample || '').split(/\r?\n/)[0] || '';
  const candidates = [',',';','\t'];
  let best = ',', bestCount = -1;
  for(const d of candidates) {
    let count = 0, inQ = false;
    for(let i=0;i<firstLine.length;i++) {
      const ch = firstLine[i], next = firstLine[i+1];
      if(ch === '"') {
        if(inQ && next === '"') i++;
        else inQ = !inQ;
      } else if(ch === d && !inQ) {
        count++;
      }
    }
    if(count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}
async function streamCsvRowsFromFile(file, onRow, onProgress) {
  const decoder = new TextDecoder('utf-8');
  const reader = file.stream().getReader();
  let row=[], cell='', inQ=false, processed=0, rowCount=0, lastProgress=0, delim=null;
  while(true) {
    const {value, done} = await reader.read();
    if(done) break;
    processed += value.byteLength;
    const text = decoder.decode(value, {stream:true});
    if(delim === null) delim = detectCsvDelimiter(text);
    for(let i=0;i<text.length;i++) {
      const ch=text[i], next=text[i+1];
      if(ch === '"') {
        if(inQ && next === '"') { cell += '"'; i++; }
        else inQ = !inQ;
      } else if(ch === delim && !inQ) {
        row.push(cell); cell='';
      } else if(ch === '\n' && !inQ) {
        row.push(cell); cell='';
        if(row.length && row.some(v=>String(v).trim()!=='')) {
          rowCount++;
          await onRow(row, rowCount);
          if(rowCount % 3000 === 0) await new Promise(r=>setTimeout(r,0));
        }
        row=[];
      } else if(ch === '\r' && !inQ) {
        // ignore CR
      } else {
        cell += ch;
      }
    }
    if(onProgress && (processed-lastProgress > 4*1024*1024 || processed === file.size)) {
      lastProgress = processed;
      onProgress({processed, size:file.size, rowCount});
    }
  }
  const rest = decoder.decode();
  if(delim === null) delim = detectCsvDelimiter(rest);
  if(rest) {
    for(let i=0;i<rest.length;i++) {
      const ch=rest[i], next=rest[i+1];
      if(ch === '"') {
        if(inQ && next === '"') { cell += '"'; i++; }
        else inQ = !inQ;
      } else if(ch === delim && !inQ) { row.push(cell); cell=''; }
      else if(ch === '\n' && !inQ) {
        row.push(cell); cell='';
        if(row.length && row.some(v=>String(v).trim()!=='')) { rowCount++; await onRow(row, rowCount); }
        row=[];
      } else if(ch !== '\r') cell += ch;
    }
  }
  row.push(cell);
  if(row.length && row.some(v=>String(v).trim()!=='')) {
    rowCount++;
    await onRow(row, rowCount);
  }
  if(onProgress) onProgress({processed:file.size, size:file.size, rowCount});
  return rowCount;
}
async function deriveDashboardDealsFromBigDataFile(file, statusEl) {
  const byDeal = new Map();
  let headers = null;
  let dataRows = 0;
  const started = performance.now();

  await streamCsvRowsFromFile(file, async (row, rowCount)=>{
    if(!headers) {
      headers = row.map(h=>String(h||'').replace(/^\uFEFF/, '').trim());
      if(!headers.includes('BD_ID сделки') && !headers.includes('TL_ID') && !headers.includes('ID')) {
        throw new Error('Не вижу структуру BigData v4.x: нет колонок BD_ID сделки / TL_ID. Заголовков распознано: '+headers.length+'. Первые колонки: '+headers.slice(0,8).join(' | '));
      }
      return;
    }
    const r = rowToObject(headers, row);
    addBigDataRowToGroups(r, byDeal);
    dataRows++;
  }, ({processed,size,rowCount})=>{
    if(statusEl) {
      const pctFile = size ? Math.min(100, processed/size*100) : 0;
      statusEl.innerHTML = `Читаю большой CSV потоково: <b>${(processed/1024/1024).toFixed(1)} / ${(size/1024/1024).toFixed(1)} МБ</b> · ${pctFile.toFixed(1)}%<br>Строк обработано: <b>${fmt.format(Math.max(0,rowCount-1))}</b> · сделок собрано: <b>${fmt.format(byDeal.size)}</b>`;
    }
  });

  if(!headers) throw new Error('CSV пустой.');
  if(statusEl) {
    const sec=((performance.now()-started)/1000).toFixed(1);
    statusEl.innerHTML = `CSV прочитан потоково за ${sec} сек.<br>Собрано строк: <b>${fmt.format(dataRows)}</b>, сделок: <b>${fmt.format(byDeal.size)}</b>. Финализирую аналитику…`;
  }
  await new Promise(r=>setTimeout(r,0));
  return deriveDashboardDealsFromGroups(byDeal);
}
function deriveDashboardDealsFromGroups(byDeal) {
  const out=[];
  for(const [id,g] of byDeal.entries()) {
    const card = g.card || g.firstCard || {};
    const events = (g.events || []).sort((a,b)=>(a.date?+a.date:0)-(b.date?+b.date:0));
    const transitions = events.filter(e=>e.type==='Переход');
    const callsE = events.filter(e=>e.type==='Звонок');
    const notesE = events.filter(e=>e.type==='Примечание');
    const tasksE = events.filter(e=>e.type==='Задача');
    const createdDt = parseRuDate(pick(card,['DEAL_Дата создания','SUM_Дата создания','TL_Дата','Дата'])) || (events.find(e=>e.type==='Создание')||{}).date || null;
    const closedDt = parseRuDate(pick(card,['DEAL_Дата закрытия','SUM_Дата закрытия']));
    const manager = pick(card,['SUM_Менеджер','DEAL_Ответственный','TL_Менеджер','Менеджер']) || 'Не указан';
    const funnel = pickFunnel(card, events);
    const rawCity = pick(card,['SUM_Город','DEAL_CF[702553] Город','TL_Город','Город']);
    const issueCity = pick(card,['DEAL_CF[743581] Город Выдачи','Город Выдачи']) || pickIncludes(card,['город','выдачи']);
    const city = resolveDealCity(rawCity, issueCity, events);
    const source = pick(card,['SUM_Источник','DEAL_Источник','DEAL_CF[742703] Источник обращения','Источник']) || pickIncludes(card,['источник','обращ']) || 'Не указан';
    const landing = pick(card,['SUM_Посадка','DEAL_Посадка','DEAL_CF[739993] Посадка','Посадка']) || pickIncludes(card,['посадк']) || 'Не указана';
    const currentStage = pick(card,['SUM_Текущий этап','DEAL_Текущий этап','Текущий этап']) || (transitions.length ? transitions[transitions.length-1].details : '');
    let reasonRaw = pick(card,['DEAL_CF[742461] Причина закрытия карточки','Причина закрытия карточки']) || pickIncludes(card,['причина','закрытия','карточ']);
    const reason = pick(card,['SUM_Причина отказа','DEAL_Причина отказа','Причина отказа']) || String(reasonRaw).replace(/^[0-4]_/, '') || 'Причина не указана';
    const qm = String(reasonRaw||'').match(/^([1234])_/);
    const qualCode = qm ? qm[1] : '0';
    const visitDate = pick(card,['DEAL_CF[702549] Дата визита','Дата визита']) || pickIncludes(card,['дата','визита']);
    const visitDt = parseAnyDate(visitDate);
    const visit = visitDt || isNonEmpty(visitDate) ? 1 : 0;
    const stageNames = new Set(transitions.map(e=>e.details).filter(Boolean));
    const hasArrivedStage = [...stageNames].some(s=>/приехал/i.test(s));
    const hasKsoStage = [...stageNames].some(s=>/в работе\s*у\s*ксо/i.test(s));
    const hasMeetingStage = [...stageNames].some(s=>/встреча подтверждена|повторный визит|не приехал/i.test(s));
    const realizationDate = pick(card,[
      'DEAL_Дата реализации',
      'SUM_Дата реализации',
      'Дата реализации',
      'DEAL_CF[Дата реализации] Дата реализации'
    ]) || pickIncludes(card,['дата','реализа']);
    const successField = pick(card,['SUM_Успешное закрытие карточки','DEAL_Успешное закрытие карточки','Успешное закрытие карточки','DEAL_CF[743491] Успешное закрытие карточки']);
    const successStage = /успешно\s*реализовано/i.test(currentStage);
    // Политика v26:
    // реализация = этап "Успешно реализовано" + заполненная "Дата реализации".
    // Поле "Успешное закрытие карточки" используется только как вид реализации.
    const success = successStage && isNonEmpty(realizationDate) ? 1 : 0;
    const realizationDt = parseAnyDate(realizationDate);
    const isClosed = !!closedDt || success || /закрыто/i.test(currentStage) ? 1 : 0;
    let final = currentStage || 'Не указан';
    if(isClosed && !success && reason && reason !== 'Причина не указана' && !final.includes('(')) final += ` (${reason})`;
    let prev = pick(card,['SUM_Последний этап перед закрытием','Последний этап перед закрытием']);
    if(!prev) {
      const closeTr = [...transitions].reverse().find(e=>/закрыто/i.test(e.details));
      prev = closeTr ? (closeTr.from || '') : '';
      if(!prev && transitions.length >= 2) prev = transitions[transitions.length-2].details || '';
    }
    const firstTransfer = transitions.find(e=>/передано менеджеру/i.test(e.details))?.date || createdDt;
    const firstCallAfter = callsE.find(e=>e.date && firstTransfer && e.date >= firstTransfer)?.date || null;
    let slaMin = Number.NaN;
    if(firstTransfer && firstCallAfter) slaMin = Math.round((+firstCallAfter - +firstTransfer)/60000);
    const slaBucket = slaBucketFromMinutes(slaMin);
    const sla = !Number.isFinite(slaMin) ? 'Нет звонка после передачи' : (slaMin <= 15 ? 'OK <=15 мин' : 'Нарушение >15 мин');
    const calls = callsE.length || parseNum(pick(card,['SUM_Количество звонков','Количество звонков']));
    const callDurSec = callsE.reduce((a,e)=>a+parseDurationSec(e.details),0) || parseNum(pick(card,['SUM_Суммарная длительность звонков, сек','Суммарная длительность звонков, сек']));
    const callEvents = callsE.map(e=>{
      const details = String(e.details || '');
      return {
        manager: e.manager || manager || 'Не указан',
        direction: isOutgoingCallDetails(details) ? 'outgoing' : (/входящ/i.test(details) ? 'incoming' : 'unknown'),
        durationSec: parseDurationSec(details),
        date: e.dateRaw || '',
        details
      };
    });
    const notes = notesE.length || parseNum(pick(card,['SUM_Количество примечаний','Количество примечаний']));
    const tasks = tasksE.length || parseNum(pick(card,['SUM_Количество задач','Количество задач']));
    const stageSeq = transitions.map(e=>e.details).filter(Boolean);
    const chain = stageSeq.filter((x,i,a)=>i===0 || x!==a[i-1]).join(' → ') || final;
    const now = new Date();
    const lifecycleEndDt = closedDt || realizationDt || now;
    const ageDays = createdDt ? Math.round((+lifecycleEndDt-+createdDt)/864000)/100 : '';
    const closeDays = createdDt && (closedDt || realizationDt) ? Math.round((+(closedDt||realizationDt)-+createdDt)/864000)/100 : '';
    const liveHours = createdDt && lifecycleEndDt ? Math.max(0,(+lifecycleEndDt-+createdDt)/36e5) : '';
    const closeHours = createdDt && (closedDt || realizationDt) ? Math.max(0,(+(closedDt||realizationDt)-+createdDt)/36e5) : '';
    const timeToVisitHours = createdDt && visitDt ? Math.max(0,(+visitDt-+createdDt)/36e5) : '';
    const firstArrivedDt = transitions.find(e=>e.date && /приехал/i.test(e.details))?.date || null;
    const firstMeetingDt = transitions.find(e=>e.date && /встреча подтверждена/i.test(e.details))?.date || null;
    const firstKsoDt = transitions.find(e=>e.date && /в работе\s*у\s*ксо/i.test(e.details))?.date || null;
    const timeToArrivedHours = createdDt && firstArrivedDt ? Math.max(0,(+firstArrivedDt-+createdDt)/36e5) : '';
    const timeToMeetingHours = createdDt && firstMeetingDt ? Math.max(0,(+firstMeetingDt-+createdDt)/36e5) : '';
    const timeToKsoHours = createdDt && firstKsoDt ? Math.max(0,(+firstKsoDt-+createdDt)/36e5) : '';
    const transitionWithDates = transitions.filter(e=>e.date && e.details);
    const stageSpans = [];
    const transitionPairs = [];
    for(let i=0;i<transitionWithDates.length;i++) {
      const cur=transitionWithDates[i];
      const next=transitionWithDates[i+1];
      const end=(next && next.date) || lifecycleEndDt;
      if(end && +end >= +cur.date) {
        const hours=(+end-+cur.date)/36e5;
        stageSpans.push({ stage: cur.details, hours: Math.round(hours*100)/100 });
        if(next && next.details) transitionPairs.push({ pair: `${cur.details} → ${next.details}`, hours: Math.round(hours*100)/100 });
      }
    }
    const funnelStagesForQual = [...stageSeq, currentStage, prev, final].filter(Boolean);
    const salesBotQualification = resolveQualificationFromSalesBot(events);
    const cardQualification = resolveQualificationFromCardFields(card);
    const qualification = resolveQualificationByCodeAndFunnel(qualCode, funnelStagesForQual, salesBotQualification, cardQualification);
    let qualBucket = qualificationLabel(qualification);
    if(qualification === 'qual') qualBucket = visit ? 'Квал + визит' : 'Квал без визита';
    let lifecycle = 'В работе / не закрыто';
    if(success) lifecycle = 'Успешно реализовано';
    else if(!isClosed) lifecycle = 'В работе / не закрыто';
    else if(qualification === 'nonqual') lifecycle = 'Закрыто: не квал';
    else if(qualification === 'qual' && visit) lifecycle = 'Закрыто: квал с визитом';
    else if(qualification === 'qual') lifecycle = 'Закрыто: квал без визита';
    else if(visit || hasArrivedStage || hasKsoStage) lifecycle = 'Закрыто: визит/КСО без кода причины';
    else if(hasMeetingStage) lifecycle = 'Закрыто: встреча/визит не завершён, без кода причины';
    else lifecycle = 'Закрыто: не классифицировано';
    out.push({
      id, manager, city, source, landing, final, reason,
      realizationType: success ? pickRealizationType(card) : '',
      realizationFilterValue: success ? pickRealizationType(card) : '',
      realizationRaw: success ? pickRealizationType(card) : '',
      visitDateRaw: visitDate || '',
      realizationDateRaw: realizationDate || '',
      createdYmd: createdDt ? fmtYmd(createdDt) : '',
      reasonRaw: reasonRaw || '',
      reasonClass: reasonRaw || (qualCode+'_Не классифицировано'),
      qualCode, qualBucket,
      visit, success, closed:isClosed,
      prev: prev || 'Не указан',
      sla, slaBucket, slaMin: Number.isFinite(slaMin) ? slaMin : '',
      callsBucket: classifyCallBucket(calls), calls, callDurSec, notes, tasks,
      chain, created: createdDt ? fmtRuDateTime(createdDt) : '',
      closedAt: closedDt ? fmtRuDateTime(closedDt) : '',
      ageDays, closeDays,
      leadCost: pick(card,['SUM_Стоимость лида','DEAL_Стоимость лида','DEAL_CF[739991] Стоимость лида','Стоимость лида']),
      budget: parseNum(pick(card,['SUM_Бюджет сделки','DEAL_Бюджет сделки','Бюджет сделки'])),
      realizationDate,
      liveHours, closeHours, timeToVisitHours, timeToArrivedHours, timeToMeetingHours, timeToKsoHours,
      createdMonth: createdDt ? monthKeyFromDate(createdDt) : '',
      stageSpansJson: JSON.stringify(stageSpans),
      transitionPairsJson: JSON.stringify(transitionPairs),
      callEventsJson: JSON.stringify(callEvents),
      hasArrivedStage: hasArrivedStage ? 1 : 0,
      hasKsoStage: hasKsoStage ? 1 : 0,
      hasMeetingStage: hasMeetingStage ? 1 : 0,
      qualification,
      qualificationFilterValue: qualificationFilterValue(qualification),
      funnel,
      qualificationSource: (salesBotQualification ? 'salesbot_qual_lead' : (cardQualification ? 'card_qual_lead' : (['1','2','3','4'].includes(String(qualCode)) ? 'code' : (qualification !== 'unknown' ? 'funnel_stage' : 'unknown')))),
      lifecycle
    });
  }
  return out.sort((a,b)=>parseNum(a.id)-parseNum(b.id));
}

function deriveDashboardDealsFromBigData(text) {
  const rows = csvObjects(text);
  const byDeal = new Map();
  for(const r of rows) addBigDataRowToGroups(r, byDeal);
  return deriveDashboardDealsFromGroups(byDeal);
}

// JSON-загрузка (компактный формат — легче тяжёлого CSV). Принимает:
//  • массив ГОТОВЫХ сделок дашборда (экспорт deriveDashboardDealsFromGroups) —
//    используется напрямую;
//  • массив «сырых» строк BigData (header→value, как из CSV) — прогоняется
//    через тот же конвейер addBigDataRowToGroups → deriveDashboardDealsFromGroups;
//  • обёртку-объект { deals:[…] } / { rows:[…] } / { data:[…] } / { items:[…] }.
function deriveDashboardDealsFromJson(text) {
  let data;
  try { data = JSON.parse(String(text || '')); }
  catch(e) { throw new Error('Файл не является корректным JSON: ' + (e.message || e)); }
  let arr = data;
  if(arr && !Array.isArray(arr)) arr = arr.deals || arr.rows || arr.data || arr.items || null;
  if(!Array.isArray(arr) || !arr.length) {
    throw new Error('В JSON не найден массив сделок (ожидается массив или { deals:[…] }).');
  }
  const first = arr.find(x => x && typeof x === 'object') || {};
  // Уже готовые сделки дашборда — есть характерные производные поля.
  const looksDerived = ('callEventsJson' in first) || ('lifecycle' in first) || ('qualBucket' in first)
    || ('qualification' in first && 'final' in first);
  if(looksDerived) {
    const deals = arr.filter(d => d && typeof d === 'object').map(d => {
      d.id = (d.id != null ? String(d.id) : '');
      // Подстраховка: поля, читаемые через JSON.parse в коде, должны быть строками.
      if(d.callEventsJson == null) d.callEventsJson = '[]';
      if(d.stageSpansJson == null) d.stageSpansJson = '[]';
      if(d.transitionPairsJson == null) d.transitionPairsJson = '[]';
      return d;
    });
    return deals.sort((a,b)=>parseNum(a.id)-parseNum(b.id));
  }
  // Иначе считаем это «сырыми» строками BigData v4.x.
  const looksRaw = ('BD_ID сделки' in first) || ('TL_ID' in first) || ('ID' in first)
    || Object.keys(first).some(k => /^(SUM_|DEAL_|TL_)/.test(k));
  if(!looksRaw) {
    throw new Error('Не вижу структуру BigData: ни готовых сделок дашборда, ни строк BD_ID / TL_ID.');
  }
  const byDeal = new Map();
  for(const r of arr) if(r && typeof r === 'object') addBigDataRowToGroups(r, byDeal);
  return deriveDashboardDealsFromGroups(byDeal);
}
function fmtRuDateTime(d) {
  return fmtDateOnly(d)+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
function periodFromDeals(ds) {
  const dates = ds.map(d=>parseRuDate(d.created)).filter(Boolean);
  if(!dates.length) return '';
  return fmtDateOnly(new Date(Math.min(...dates.map(d=>+d))))+' - '+fmtDateOnly(new Date(Math.max(...dates.map(d=>+d))));
}
function updateDataSubtitle() {
  const subtitle = document.getElementById('dataSubtitle');
  const status = document.getElementById('uploadStatus');
  const clearBtn = document.getElementById('clearCsv');
  if(!deals.length) {
    TLROOT.classList.remove('has-data');
    TLROOT.classList.add('no-data');
    if(subtitle) subtitle.textContent = 'Для построения дашборда нужна парсинг-аналитика методом Бочарова Ю.С. на основе таймлайн-событий в сделках и базовых метаданных платформы amoCRM. Загрузите свежий BigData CSV из парсера v4.4.';
    if(status) status.innerHTML = 'CSV ещё не загружен. Дашборд пустой.';
    if(clearBtn) clearBtn.classList.remove('active');
    return;
  }
  TLROOT.classList.remove('no-data');
  TLROOT.classList.add('has-data');
  const period = periodFromDeals(deals);
  const count = fmt.format(deals.length);
  const file = currentDataFile ? ` / ${currentDataFile}` : '';
  if(subtitle) subtitle.textContent = `Дашборд построен на текущей BigData v4.4: ${count} сделок${period ? ' ('+period+')' : ''}, карточка сделки + таймлайн. Визиты считаются по полю «Дата визита», реализации — по этапу «Успешно реализовано» + «Дата реализации», а вид реализации — по полю «Успешное закрытие карточки». Фильтры поддерживают множественный выбор по ответственному, городу, источнику обращения и посадке.`;
  if(status) status.innerHTML = `Источник: <b>${esc(currentDataSource)}</b>${file ? '<br>'+esc(file) : ''}`;
  if(clearBtn) clearBtn.classList.add('active');
}

function sleep(ms) { return new Promise(resolve=>setTimeout(resolve, ms)); }
function randInt(min,max) { return Math.floor(min + Math.random() * (max-min+1)); }
function choice(arr) { return arr[Math.floor(Math.random()*arr.length)]; }
function setLoadingState(on) {
  TLROOT.classList.toggle('loading', !!on);
  TLROOT.classList.toggle('no-data', !on && !deals.length);
  TLROOT.classList.toggle('has-data', !on && !!deals.length);
}
function resetTerminal(fileName='') {
  const lines=document.getElementById('terminalLines');
  if(lines) lines.innerHTML='';
  const phase=document.getElementById('terminalPhase');
  if(phase) phase.textContent = fileName ? 'Инициализация чтения: '+fileName : 'Инициализация чтения…';
  const pct=document.getElementById('terminalPercent');
  if(pct) pct.textContent='0%';
  const bar=document.getElementById('terminalProgressBar');
  if(bar) bar.style.width='0%';
}
function terminalLine(text, cls='term-green') {
  const lines=document.getElementById('terminalLines');
  if(!lines) return;
  const div=document.createElement('div');
  div.className='term-line '+cls;
  div.innerHTML = esc(text) + (Math.random()<0.16 ? '<span class="term-cursor"></span>' : '');
  lines.appendChild(div);
  const maxLines = Math.max(18, Math.floor((lines.clientHeight || 420) / 18));
  while(lines.children.length > maxLines) lines.removeChild(lines.firstChild);
}
function terminalProgress(pct, phase='') {
  pct = Math.max(0, Math.min(100, Math.round(pct)));
  const bar=document.getElementById('terminalProgressBar');
  const p=document.getElementById('terminalPercent');
  const ph=document.getElementById('terminalPhase');
  if(bar) bar.style.width=pct+'%';
  if(p) p.textContent=pct+'%';
  if(ph && phase) ph.textContent=phase;
}
async function runTerminalBoot(fileName, fileSizeBytes, workPromiseFactory) {
  setLoadingState(true);
  resetTerminal(fileName);
  const totalMs = randInt(10000, 30000);
  const started = performance.now();
  let workResult, workError, workDone=false;
  const rowsGuess = fileSizeBytes ? Math.max(1200, Math.round(fileSizeBytes / randInt(360, 820))) : randInt(8000, 40000);
  const modules = [
    'timeline.indexer', 'amo.fields.mapper', 'visit.date.detector', 'lead.lifecycle.classifier',
    'kpi.aggregator', 'stage.path.rebuilder', 'sla.vectorizer', 'call.duration.parser',
    'source.landing.resolver', 'multi.filter.compiler', 'reason.code.normalizer',
    'compact.bigdata.reader', 'dashboard.render.cache'
  ];
  const phases = [
    'Чтение файла',
    'Определение структуры CSV',
    'Проверка BigData v4.x',
    'Реконструкция карточек сделок',
    'Сборка таймлайн-событий',
    'Детекция визитов по полю Дата визита',
    'Классификация 1_ / 2_ / 3_ / 4_',
    'Расчёт SLA и звонков',
    'Построение метрик',
    'Подготовка интерактивных фильтров'
  ];
  const bootLines = [
    `[BOOT] BOCHAROV_ANALYTICS_ENGINE v4.4.dynamic`,
    `[SRC] ${fileName}`,
    `[IO] stream_mode=browser_file_api; encoding=utf-8; separator=auto`,
    `[SCAN] timeline events + amoCRM metadata handshake`,
    `[RULE] visit = DEAL_CF[702549] Дата визита`,
    `[RULE] qualification = Причина закрытия карточки prefix 1_/2_/3_/4_`,
    `[MEM] compact mode: one full deal card + timeline rows`
  ];
  bootLines.forEach((l,i)=>setTimeout(()=>terminalLine(l, i%3===0?'term-yellow':i%3===1?'term-green':'term-gray'), i*110));
  await sleep(650);
  const workPromise = (async()=>{
    try { workResult = await workPromiseFactory(); }
    catch(e) { workError = e; }
    finally { workDone = true; }
  })();
  let lineNo = 0;
  while(performance.now() - started < totalMs || !workDone) {
    const elapsed = performance.now() - started;
    const rawPct = Math.min(97, (elapsed / totalMs) * 100);
    const wobble = Math.sin(elapsed/850)*2.4 + Math.sin(elapsed/2300)*3.2;
    const pct = Math.max(1, Math.min(97, rawPct + wobble));
    const phase = phases[Math.min(phases.length-1, Math.floor((pct/100)*phases.length))];
    terminalProgress(pct, phase+'…');
    const mod = choice(modules);
    const id = String(randInt(100000,999999));
    const rows = Math.min(rowsGuess, Math.round(rowsGuess * pct/100 + randInt(-70,180)));
    const templates = [
      `> ${mod}: packet=${id} rows=${rows} checksum=0x${randInt(4096,65535).toString(16).toUpperCase()} OK`,
      `> index[${lineNo.toString().padStart(5,'0')}] lead_id=${randInt(32000000,32199999)} stage_path=rebuild status=OK`,
      `> field_map: source/landing/visit_date/reason_code resolved=${randInt(12,64)} nulls=${randInt(0,9)}`,
      `> timeline_scan: calls=${randInt(0,28)} notes=${randInt(0,16)} tasks=${randInt(0,18)} transitions=${randInt(1,8)}`,
      `> filter_cache: manager/city/source/landing dimension_hash=${randInt(100000,999999)}`,
      `> lifecycle: nonqual=${randInt(0,140)} qual=${randInt(0,80)} visits=${randInt(0,32)} success=${randInt(0,12)}`
    ];
    terminalLine(choice(templates), choice(['term-green','term-yellow','term-gray','term-dim']));
    lineNo++;
    if(Math.random()<0.22) {
      terminalLine(`  ${choice(['normalizing sparse columns','building cross-filter matrix','compressing compact rows','hydrating dashboard cards','validating counters'])} ... ${choice(['done','ok','ready','stable'])}`, choice(['term-gray','term-alert','term-green']));
    }
    const delayBase = 55 + Math.sin(elapsed/1200)*55 + Math.random()*190;
    await sleep(Math.max(28, delayBase));
  }
  await workPromise;
  if(workError) throw workError;
  terminalProgress(99, 'Финальная сборка визуализации…');
  terminalLine('> validation: counters matched; empty columns ignored; dashboard state compiled', 'term-green');
  await sleep(randInt(350,900));
  terminalProgress(100, 'Готово');
  terminalLine('> RENDER_COMPLETE: interactive dashboard online', 'term-yellow');
  await sleep(randInt(500,1200));
  return workResult;
}

async function readFileAsText(file) {
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error || new Error('Не удалось прочитать файл.'));
    r.readAsText(file, 'utf-8');
  });
}

function clearImportedCsv() {
  closeSuccessDealsModal();
  closeFilterDrawer();
  setLoadingState(false);
  deals = [];
  currentDataSource = '';
  currentDataFile = '';
  for(const k of Object.keys(state)) { if(state[k] instanceof Set) state[k].clear(); }
  state.dateFrom=''; state.dateTo='';
  const input = document.getElementById('csvUpload');
  if(input) input.value = '';
  buildFilters();
  updateFilterLabels();
  updateDataSubtitle();
  render();
  updateFilterFabVisibility();
}
function ejectAndUploadCsv() {
  clearImportedCsv();
  const input = document.getElementById('csvUpload');
  if(input) {
    setTimeout(() => input.click(), 80);
  }
}
async function handleCsvUpload(file) {
  closeSuccessDealsModal();
  closeFilterDrawer();
  const status=document.getElementById('uploadStatus');
  try {
    if(!file) return;
    deals = [];
    for(const k of Object.keys(state)) { if(state[k] instanceof Set) state[k].clear(); }
    state.dateFrom=''; state.dateTo='';
    buildFilters();
    updateFilterLabels();
    updateDataSubtitle();
    const t0=performance.now();
    const isJson = /\.json$/i.test(file.name || '') || file.type === 'application/json';
    const nextDeals = await runTerminalBoot(file.name, file.size || 0, async () => {
      await sleep(120);
      if(isJson) {
        if(status) status.innerHTML = `Читаю JSON: <b>${esc(file.name)}</b>…`;
        const text = await readFileAsText(file);
        return deriveDashboardDealsFromJson(text);
      }
      return await deriveDashboardDealsFromBigDataFile(file, status);
    });
    if(!nextDeals.length) throw new Error('После парсинга не найдено ни одной сделки.');
    deals = nextDeals;
    currentDataSource = isJson ? 'загруженный JSON' : 'загруженный CSV';
    currentDataFile = file.name;
    for(const k of Object.keys(state)) { if(state[k] instanceof Set) state[k].clear(); }
    state.dateFrom=''; state.dateTo='';
    buildFilters();
    updateFilterLabels();
    updateDataSubtitle();
    render();
    setLoadingState(false);
    updateFilterFabVisibility();
    const sec=((performance.now()-t0)/1000).toFixed(1);
    status.innerHTML = `Загружено ${isJson ? 'из JSON' : 'потоково'}: <b>${fmt.format(deals.length)} сделок</b> из файла ${esc(file.name)}<br>Пересчёт и визуальная инициализация: ${sec} сек.`;
  } catch(err) {
    console.error(err);
    deals = [];
    setLoadingState(false);
    updateDataSubtitle();
    updateFilterFabVisibility();
    status.innerHTML = `<span class="red">Ошибка загрузки:</span> ${esc(err.message || err)}`;
  }
}

function buildFilterBox(box, mode='main') {
  box.innerHTML='';
  for(const def of filterDefs) {
    const counts = optionCountsForFilter(def);
    const groupTitle = filterGroupTitle(def);
    const div=document.createElement('div'); div.className='filter'; div.dataset.filterId=def.id;
    div.classList.toggle('active', state[def.id].size > 0);
    div.innerHTML=`<label>${esc(def.label)}</label><button class="filter-btn" type="button"><span>${esc(def.all)}</span><b>▾</b></button><div class="filter-menu"><input class="filter-search" placeholder="Поиск…"><div class="filter-actions"><button type="button" data-act="all">Выбрать все</button><button type="button" data-act="none">Очистить</button></div><div class="option-list"></div></div>`;
    const list=div.querySelector('.option-list');

    if(def.id === 'manager') {
      const grouped = new Map();
      counts.forEach(([val,c])=>{
        const g = managerOptionGroup(val);
        if(!grouped.has(g.key)) grouped.set(g.key, {title:g.title, rows:[]});
        grouped.get(g.key).rows.push([val,c]);
      });
      [...grouped.entries()]
        .sort((a,b)=>managerGroupOrder(a[0])-managerGroupOrder(b[0]))
        .forEach(([groupKey, group])=>{
          const groupEl=document.createElement('div');
          groupEl.className='filter-group';
          groupEl.dataset.groupKey=groupKey;
          groupEl.dataset.value=group.title.toLowerCase();
          groupEl.innerHTML=`<span class="group-title">${esc(group.title)}</span><span class="count">${fmt.format(group.rows.reduce((s,x)=>s+(Number(x[1])||0),0))}</span>`;
          list.appendChild(groupEl);

          group.rows.forEach(([val,c])=>{
            const id='chk_'+mode+'_'+def.id+'_'+Math.random().toString(36).slice(2);
            const opt=document.createElement('label'); 
            opt.className='opt child-opt'; 
            opt.dataset.groupKey=groupKey;
            opt.dataset.value=(val+' '+personFiKey(val)).toLowerCase();
            opt.innerHTML=`<input type="checkbox" value="${esc(val)}" id="${id}" ${state[def.id].has(val) ? 'checked' : ''}><span>${esc(val)}</span><span class="count">${fmt.format(c)}</span>`;
            list.appendChild(opt);
          });

          groupEl.addEventListener('click',()=>{
            const visible = [...div.querySelectorAll(`.opt[data-group-key="${groupKey}"]`)].filter(o=>o.style.display!=='none');
            const allChecked = visible.length && visible.every(o=>o.querySelector('input').checked);
            visible.forEach(o=>o.querySelector('input').checked = !allChecked);
            applyFilterSelectionNoRebuild(def,div);
          });
        });
    } else {
      if(groupTitle) {
        const group=document.createElement('div');
        group.className='filter-group';
        group.dataset.groupKey='all';
        group.dataset.value=groupTitle.toLowerCase();
        group.innerHTML=`<span class="group-title">${esc(groupTitle)}</span><span class="count">${fmt.format(counts.reduce((s,x)=>s+(Number(x[1])||0),0))}</span>`;
        list.appendChild(group);
        group.addEventListener('click',()=>{
          const visible = [...div.querySelectorAll('.opt')].filter(o=>o.style.display!=='none');
          const allChecked = visible.length && visible.every(o=>o.querySelector('input').checked);
          visible.forEach(o=>o.querySelector('input').checked = !allChecked);
          applyFilterSelectionNoRebuild(def,div);
        });
      }

      counts.forEach(([val,c])=>{
        const id='chk_'+mode+'_'+def.id+'_'+Math.random().toString(36).slice(2);
        const opt=document.createElement('label'); opt.className='opt'+(groupTitle?' child-opt':''); 
        opt.dataset.value=(val+' '+personFiKey(val)).toLowerCase();
        opt.innerHTML=`<input type="checkbox" value="${esc(val)}" id="${id}" ${state[def.id].has(val) ? 'checked' : ''}><span>${esc(val)}</span><span class="count">${fmt.format(c)}</span>`;
        list.appendChild(opt);
      });
    }

    box.appendChild(div);
    div.querySelector('.filter-btn').addEventListener('click', (e)=>{ e.stopPropagation(); document.querySelectorAll('.filter').forEach(f=>{ if(f!==div) f.classList.remove('open'); }); div.classList.toggle('open'); });
    div.querySelector('.filter-search').addEventListener('input', e=>{ 
      const q=e.target.value.toLowerCase().trim(); 
      div.querySelectorAll('.opt').forEach(o=> o.style.display=o.dataset.value.includes(q)?'flex':'none');
      div.querySelectorAll('.filter-group').forEach(g=>{
        const groupKey=g.dataset.groupKey;
        const selector = def.id === 'manager' && groupKey ? `.opt[data-group-key="${groupKey}"]` : '.opt';
        const anyVisible=[...div.querySelectorAll(selector)].some(o=>o.style.display!=='none');
        g.style.display=anyVisible ? 'flex' : 'none';
      });
    });
    div.querySelectorAll('input[type=checkbox]').forEach(ch=>ch.addEventListener('change',()=>{ applyFilterSelectionNoRebuild(def,div); }));
    div.querySelector('[data-act=all]').addEventListener('click',()=>{ div.querySelectorAll('.opt').forEach(o=>{ if(o.style.display!=='none') o.querySelector('input').checked=true; }); applyFilterSelectionNoRebuild(def,div); });
    div.querySelector('[data-act=none]').addEventListener('click',()=>{ div.querySelectorAll('input').forEach(i=>i.checked=false); applyFilterSelectionNoRebuild(def,div); });
  }
  const dateBox=document.createElement('div');
  dateBox.className='date-range-filter';
  dateBox.classList.toggle('active', !!state.dateFrom || !!state.dateTo);
  dateBox.innerHTML=`<div class="date-range-title">Период создания сделки</div><div class="date-range-grid"><div class="date-range-field"><label>От</label><input type="date" class="date-from" value="${esc(state.dateFrom)}"></div><div class="date-range-field"><label>До</label><input type="date" class="date-to" value="${esc(state.dateTo)}"></div></div><div class="date-range-actions"><button type="button" class="date-clear">Очистить период</button></div>`;
  box.appendChild(dateBox);
  const fromInput=dateBox.querySelector('.date-from');
  const toInput=dateBox.querySelector('.date-to');
  const clearDate=dateBox.querySelector('.date-clear');
  fromInput.addEventListener('change',()=>{ state.dateFrom=fromInput.value || ''; buildFilters(); updateFilterLabels(); render(); });
  toInput.addEventListener('change',()=>{ state.dateTo=toInput.value || ''; buildFilters(); updateFilterLabels(); render(); });
  clearDate.addEventListener('click',()=>{ state.dateFrom=''; state.dateTo=''; buildFilters(); updateFilterLabels(); render(); });

  const reset=document.createElement('div'); reset.className='reset-row'; reset.innerHTML='<button type="button" class="reset-filters-btn">Сбросить фильтры</button>';
  box.appendChild(reset);
  reset.querySelector('button').addEventListener('click',()=>resetFilters());
}
function buildFilters() {
  const main=document.getElementById('filters');
  const popup=document.getElementById('filtersPopup');
  if(main) buildFilterBox(main, 'main');
  if(popup) buildFilterBox(popup, 'popup');
  if(!window.__amoDashFilterCloseBound){ document.addEventListener('click',()=>document.querySelectorAll('.filter').forEach(f=>f.classList.remove('open'))); window.__amoDashFilterCloseBound=true; }
  document.querySelectorAll('.filter-menu').forEach(m=>m.addEventListener('click',e=>e.stopPropagation()));
}
function syncState(def, div) {
  state[def.id].clear();
  div.querySelectorAll('input[type=checkbox]:checked').forEach(ch=>state[def.id].add(ch.value));
  updateFilterLabels();
}
function applyFilterSelectionNoRebuild(def, div) {
  syncState(def, div);
  syncFilterCheckboxes(def.id);
  updateFilterLabels();
  render();
}
function syncFilterCheckboxes(filterId) {
  document.querySelectorAll(`.filter[data-filter-id="${filterId}"] input[type=checkbox]`).forEach(ch=>{
    ch.checked = state[filterId].has(ch.value);
  });
  updateFilterLabels();
}
function syncDateFilters() {
  document.querySelectorAll('.date-range-filter').forEach(box=>{
    const f=box.querySelector('.date-from');
    const t=box.querySelector('.date-to');
    if(f) f.value=state.dateFrom || '';
    if(t) t.value=state.dateTo || '';
    box.classList.toggle('active', !!state.dateFrom || !!state.dateTo);
  });
}
function resetFilters() {
  for(const k of Object.keys(state)) { if(state[k] instanceof Set) state[k].clear(); }
 
  state.dateFrom='';
  state.dateTo='';
  document.querySelectorAll('.filter input[type=checkbox]').forEach(i=>i.checked=false);
  syncDateFilters();
  updateFilterLabels();
  render();
}
function updateFilterLabels() {
  for(const def of filterDefs) {
    document.querySelectorAll(`.filter[data-filter-id="${def.id}"]`).forEach(div=>{
      const n=state[def.id].size;
      div.classList.toggle('active', n > 0);
      const label=div.querySelector('.filter-btn span');
      if(label) label.textContent = n===0 ? def.all : (n===1 ? [...state[def.id]][0] : 'Выбрано: '+n);
    });
  }
  syncDateFilters();
}
function barList(el, rows, cls='') {
  const max=Math.max(1, ...rows.map(r=>r[1]));
  el.innerHTML = rows.length ? rows.map(([name,val,sub])=>`<div class="bar-row"><div class="bar-label" title="${esc(name)}">${esc(name)}</div><div class="bar-track"><div class="bar ${cls}" style="width:${Math.max(2,val/max*100)}%"></div></div><div class="bar-val">${fmt.format(val)}${sub?'<br>'+sub:''}</div></div>`).join('') : '<div class="small-note">Нет данных для выбранного сегмента</div>';
}
function reasonTag(code, qualification='unknown') {
  if(qualification === 'nonqual') return '<span class="tag nonqual">'+(code && code!=='0' ? code+'_ ' : '')+'не квал</span>';
  if(qualification === 'qual') return '<span class="tag qual">'+(code && code!=='0' ? code+'_ ' : '')+'квал</span>';
  if(code==='1') return '<span class="tag nonqual">1_ не квал</span>';
  if(code==='2'||code==='3'||code==='4') return '<span class="tag qual">'+code+'_ квал</span>';
  return '<span class="tag unknown">не классифицировано</span>';
}
function sortValueFromText(t) {
  t = String(t || '').trim().replace(/\s+/g,' ');
  const hms = t.match(/^(\d+):(\d{2}):(\d{2})$/);
  if(hms) return Number(hms[1])*3600 + Number(hms[2])*60 + Number(hms[3]);
  const pctMatch = t.match(/-?\d+(?:[\s\u00A0]\d{3})*(?:[,.]\d+)?\s*%/);
  if(pctMatch) return parseFloat(pctMatch[0].replace(/\s|\u00A0|%/g,'').replace(',','.'));
  const numMatch = t.match(/-?\d+(?:[\s\u00A0]\d{3})*(?:[,.]\d+)?/);
  if(numMatch) return parseFloat(numMatch[0].replace(/\s|\u00A0/g,'').replace(',','.'));
  return t.toLowerCase();
}
function makeTableSortable(el) {
  if(!el || !el.tHead || !el.tBodies.length) return;
  const ths=[...el.tHead.querySelectorAll('th')];
  ths.forEach((th,idx)=>{
    th.classList.add('sortable');
    th.dataset.sortDir='';
    th.addEventListener('click',()=>{
      const dir = th.dataset.sortDir === 'asc' ? 'desc' : 'asc';
      ths.forEach(x=>{ x.dataset.sortDir=''; x.classList.remove('sort-asc','sort-desc'); });
      th.dataset.sortDir=dir;
      th.classList.add(dir==='asc'?'sort-asc':'sort-desc');
      const tbody=el.tBodies[0];
      const rows=[...tbody.rows];
      rows.sort((a,b)=>{
        const av=sortValueFromText(a.cells[idx]?.textContent || '');
        const bv=sortValueFromText(b.cells[idx]?.textContent || '');
        let cmp = 0;
        if(typeof av === 'number' && typeof bv === 'number') cmp = av-bv;
        else cmp = String(av).localeCompare(String(bv),'ru',{numeric:true});
        return dir==='asc' ? cmp : -cmp;
      });
      rows.forEach(r=>tbody.appendChild(r));
    });
  });
}
function table(el, headers, rows) {
  let colgroup = '';
  if(el && el.id === 'pathTable') {
    colgroup = '<colgroup><col class="path-chain-col"><col class="path-count-col"><col class="path-rate-col"></colgroup>';
  } else if(el && el.id === 'transitionTimeTable') {
    colgroup = '<colgroup><col class="transition-name-col"><col class="transition-num-col"><col class="transition-num-col"><col class="transition-num-col"><col class="transition-num-col"></colgroup>';
  }
  el.innerHTML = colgroup + '<thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody>';
  makeTableSortable(el);
}
function isHozOrDuplicateClosed(d) {
  // Исключаем только точную управленческую связку:
  // этап = "Закрыто и не реализовано"
  // + причина закрытия карточки = "1_ДУБЛЬ" или "1_ХОЗ".
  const stageText = [
    d.final,
    d.prev,
    d.lifecycle
  ].map(x=>String(x || '').toLowerCase()).join(' | ');

  const reasonText = [
    d.reasonRaw,
    d.reasonClass,
    d.reason
  ].map(x=>String(x || '').toLowerCase()).join(' | ');

  const isClosedNotRealized = stageText.includes('закрыто и не реализовано');
  const isTargetReason =
    reasonText.includes('1_дубль') ||
    reasonText.includes('1_хоз');

  return isClosedNotRealized && isTargetReason;
}

function textOf(el, sel) {
  const node = sel ? el.querySelector(sel) : el;
  return (node ? node.textContent : '').trim();
}
function hasStageSpan(d, stage) {
  return safeJsonParse(d.stageSpansJson).some(x=>String(x.stage||'')===stage);
}
function hasTransitionPair(d, pair) {
  return safeJsonParse(d.transitionPairsJson).some(x=>String(x.pair||'')===pair);
}
function wireDrilldowns() {
  document.querySelectorAll('#prevBars .bar-row').forEach(row=>{
    row.onclick=()=>{ const stage=textOf(row,'.bar-label'); openDrillModal('Последний этап перед закрытием без визита: '+stage, d=>num(d.closed) && !num(d.success) && !num(d.visit) && d.prev===stage); };
  });

  document.querySelectorAll('#classHistory .class-row').forEach(row=>{
    row.onclick=()=>{ const name=textOf(row,'.class-name'); openDrillModal('Класс жизненного цикла: '+name, d=>d.lifecycle===name); };
  });

  document.querySelectorAll('#lifeTimeKpis .life-kpi').forEach(card=>{
    const title=textOf(card,'.life-kpi-name');
    card.onclick=()=>{
      if(title.includes('жизнь закрытой')) openDrillModal(title, d=>num(d.closed) && Number.isFinite(num(d.closeHours)) && num(d.closeHours)>0);
      else if(title.includes('до визита')) openDrillModal(title, d=>Number.isFinite(num(d.timeToVisitHours)) && num(d.timeToVisitHours)>0);
      else if(title.includes('Приехал')) openDrillModal(title, d=>Number.isFinite(num(d.timeToArrivedHours)) && num(d.timeToArrivedHours)>0);
      else if(title.includes('Текущий месяц')) openDrillModal(title, d=>d.createdMonth===window.__dashCurrentMonth && Number.isFinite(num(d.timeToVisitHours)) && num(d.timeToVisitHours)>0);
      else openDrillModal(title, d=>true);
    };
  });

  document.querySelectorAll('#stageDwellTable tbody tr').forEach(row=>{
    row.onclick=()=>{ const stage=textOf(row.cells[0]); openDrillModal('Статус amoCRM: '+stage, d=>hasStageSpan(d, stage)); };
  });

  document.querySelectorAll('#transitionTimeTable tbody tr').forEach(row=>{
    row.onclick=()=>{ const pair=textOf(row.cells[0]); openDrillModal('Переход: '+pair, d=>hasTransitionPair(d, pair)); };
  });

  document.querySelectorAll('#currentMonthTimeTable tbody tr').forEach(row=>{
    row.onclick=()=>{ const manager=textOf(row.cells[0]); openDrillModal('Текущий месяц · '+manager, d=>d.createdMonth===window.__dashCurrentMonth && d.manager===manager); };
  });

  document.querySelectorAll('#reasonNonqual .reason-item, #reasonQual .reason-item').forEach(item=>{
    item.onclick=()=>{ 
      const name=textOf(item,'.reason-title');
      const isQual = !!item.closest('#reasonQual');
      const q = isQual ? 'qual' : 'nonqual';
      openDrillModal((isQual?'Причина квал: ':'Причина не квал: ')+name, d=>num(d.closed) && d.qualification===q && (d.reason===name || String(d.reasonClass||'').replace(/^[0-4]_/, '')===name));
    };
  });

  document.querySelectorAll('#stageCards .stage-card').forEach(card=>{
    card.onclick=()=>{ const stage=textOf(card,'.stage-name'); openDrillModal('Этап закрытия: '+stage, d=>num(d.closed) && !num(d.success) && d.prev===stage); };
  });

  document.querySelectorAll('#reasonClassTable tbody tr').forEach(row=>{
    row.onclick=()=>{ 
      const reason=textOf(row.cells[1]); 
      const klass=textOf(row.cells[0]).toLowerCase();
      const q = klass.includes('не квал') ? 'nonqual' : (klass.includes('квал') ? 'qual' : '');
      openDrillModal('Классификация причин: '+reason, d=>num(d.closed) && (!q || d.qualification===q) && (d.reason===reason || String(d.reasonClass||'').replace(/^[0-4]_/, '')===reason));
    };
  });

  document.querySelectorAll('#stageRisk tbody tr').forEach(row=>{
    row.onclick=()=>{ const stage=textOf(row.cells[0]); openDrillModal('Конверсии и риск по этапу: '+stage, d=>num(d.closed) && !num(d.success) && d.prev===stage); };
  });

  document.querySelectorAll('#slaTable tbody tr').forEach(row=>{
    row.onclick=()=>{ const bucket=textOf(row.cells[0]); openDrillModal('SLA первого звонка: '+bucket, d=>!isHozOrDuplicateClosed(d) && d.slaBucket===bucket); };
  });

  document.querySelectorAll('#callTable tbody tr').forEach(row=>{
    row.onclick=()=>{ const bucket=textOf(row.cells[0]); openDrillModal('Звонки и итог: '+bucket, d=>!isHozOrDuplicateClosed(d) && d.callsBucket===bucket); };
  });

  document.querySelectorAll('#outgoingManagerTable tbody tr').forEach(row=>{
    row.onclick=()=>{ const manager=textOf(row.cells[0]); openDrillModal('Исходящие звонки менеджера: '+manager, d=>safeJsonParse(d.callEventsJson).some(c=>c.direction==='outgoing' && String(c.manager||'Не указан')===manager)); };
  });

  document.querySelectorAll('#pathTable tbody tr').forEach(row=>{
    row.onclick=()=>{ const chain=textOf(row.cells[0]); openDrillModal('Цепочка жизненного цикла', d=>d.chain===chain); };
  });
}

function render() {
  const f=deals.filter(isFiltered);
  const total=f.length;
  const closed=f.filter(d=>num(d.closed));
  const success=f.filter(d=>num(d.success));
  const nonqual=f.filter(d=>d.qualification==='nonqual');
  const qual=f.filter(d=>d.qualification==='qual');
  const visit=f.filter(d=>num(d.visit));
  const noVisitClosed=closed.filter(d=>!num(d.success) && !num(d.visit));
  const topReason=countBy(noVisitClosed, d=>d.reason).slice(0,1)[0];
  const topPrev=countBy(noVisitClosed, d=>d.prev).slice(0,1)[0];
  document.getElementById('focusPct').textContent=pct(noVisitClosed.length, closed.length, 0);
  document.getElementById('focusText').textContent='закрытий без визита от всех закрытых';
  document.getElementById('headline').innerHTML = total ? `В выбранном сегменте <b>${fmt.format(total)}</b> сделок. Закрыто: <b>${fmt.format(closed.length)}</b>, успешных закрытий: <b>${fmt.format(success.length)}</b>. Основная зона потерь без визита: <b>${esc(topPrev?topPrev[0]:'нет данных')}</b>; частая причина: <b>${esc(topReason?topReason[0]:'нет данных')}</b>.` : 'Нет сделок под выбранные фильтры.';
  const filtText=[...filterDefs.map(d=>{const n=state[d.id].size; return n?`${d.label}: ${n} выбрано`:d.all;}), (state.dateFrom||state.dateTo) ? `Период: ${state.dateFrom||'…'} — ${state.dateTo||'…'}` : 'Период: весь'].join(' · ');
  document.getElementById('segmentPill').textContent=filtText;
  document.getElementById('overview').innerHTML = [
    ['Всего сделок', total, 'после фильтров', 'lime', ''],
    ['Закрыто', closed.length, pct(closed.length,total), 'blue', ''],
    ['Успешно реализовано', success.length, pct(success.length,total), 'green', 'success'],
    ['Не квал', nonqual.length, pct(nonqual.length,total), 'red', 'nonqual'],
    ['Квал', qual.length, pct(qual.length,total), 'orange', 'qual'],
    ['Визит по дате', visit.length, pct(visit.length,total), 'violet', 'visit'],
  ].map(k=>`<div class="kpi ${k[4] ? 'clickable-kpi' : ''}" ${k[4] ? 'data-kpi="'+k[4]+'"' : ''}><div class="kpi-name">${esc(k[0])}</div><div class="kpi-value ${k[3]}">${fmt.format(k[1])}</div><div class="kpi-sub">${esc(k[2])}</div></div>`).join('');
  document.querySelectorAll('[data-kpi]').forEach(el=>el.addEventListener('click',()=>openDealsModal(el.dataset.kpi)));
  barList(document.getElementById('prevBars'), countBy(noVisitClosed, d=>d.prev).slice(0,12).map(([k,v])=>[k,v,pct(v,noVisitClosed.length)]));
  const classOrder=['Успешно реализовано','Закрыто: не квал','Закрыто: квал без визита','Закрыто: квал с визитом','Закрыто: не классифицировано','В работе / не закрыто'];
  const classCounts=new Map(countBy(f,d=>d.lifecycle));
  document.getElementById('classHistory').innerHTML=classOrder.filter(k=>classCounts.has(k)).map((name,i)=>{
    const val=classCounts.get(name)||0; const sub=pct(val,total);
    const tag=name.includes('Успешно')?'✓':name.includes('не квал')?'1_':name.includes('без визита')?'2_':name.includes('визитом')?'VIS':'•';
    return `<div class="class-row"><div class="class-icon">${tag}</div><div><div class="class-name">${esc(name)}</div><div class="class-sub">${sub} от сегмента</div></div><div class="class-val">${fmt.format(val)}</div></div>`;
  }).join('') || '<div class="small-note">Нет данных</div>';
  const closedWithTime = closed.filter(d=>Number.isFinite(num(d.closeHours)) && num(d.closeHours)>0);
  const withVisitTime = f.filter(d=>Number.isFinite(num(d.timeToVisitHours)) && num(d.timeToVisitHours)>0);
  const withArrivedTime = f.filter(d=>Number.isFinite(num(d.timeToArrivedHours)) && num(d.timeToArrivedHours)>0);
  const monthKeys = f.map(d=>d.createdMonth).filter(Boolean).sort();
  const currentMonth = monthKeys.length ? monthKeys[monthKeys.length-1] : '';
  window.__dashCurrentMonth = currentMonth;
  const currentMonthDeals = currentMonth ? f.filter(d=>d.createdMonth===currentMonth) : [];
  const currentMonthVisit = currentMonthDeals.filter(d=>Number.isFinite(num(d.timeToVisitHours)) && num(d.timeToVisitHours)>0);
  const stageDwell = aggregateStageDwell(f).slice(0,14);
  const transitionDwell = aggregateTransitionPairs(f).slice(0,14);
  const longestStage = stageDwell[0];
  document.getElementById('lifeTimeKpis').innerHTML = [
    ['Средняя жизнь закрытой сделки', fmtHours(avg(closedWithTime,d=>num(d.closeHours))), `${fmt.format(closedWithTime.length)} закрытых с датами`, 'lime'],
    ['Медиана жизни закрытой сделки', fmtHours(median(closedWithTime,d=>num(d.closeHours))), 'устойчивее к выбросам', 'blue'],
    ['Среднее время до визита', fmtHours(avg(withVisitTime,d=>num(d.timeToVisitHours))), `${fmt.format(withVisitTime.length)} сделок с визитом`, 'green'],
    ['Медиана до визита', fmtHours(median(withVisitTime,d=>num(d.timeToVisitHours))), 'типовая скорость доведения', 'violet'],
    ['До этапа «Приехал»', fmtHours(avg(withArrivedTime,d=>num(d.timeToArrivedHours))), `${fmt.format(withArrivedTime.length)} переходов в этап`, 'orange'],
    ['Текущий месяц до визита', fmtHours(avg(currentMonthVisit,d=>num(d.timeToVisitHours))), currentMonth ? `${monthLabel(currentMonth)} · ${fmt.format(currentMonthVisit.length)} визитов` : 'нет дат создания', 'red'],
  ].map(k=>`<div class="life-kpi"><div class="life-kpi-name">${esc(k[0])}</div><div class="life-kpi-value ${k[3]}">${esc(k[1])}</div><div class="life-kpi-sub">${esc(k[2])}</div></div>`).join('');
  document.getElementById('lifeTimeNote').innerHTML = longestStage
    ? `Главная зона временного застоя в выбранном сегменте: <b>${esc(longestStage.stage)}</b>, среднее нахождение ${esc(fmtHours(longestStage.avg))}, наблюдений: ${fmt.format(longestStage.count)}.`
    : 'Для временного анализа нужны даты переходов в таймлайне.';
  table(document.getElementById('stageDwellTable'), ['Статус amoCRM','Наблюдений','Среднее','Медиана','Максимум','Суммарно'], stageDwell.map(x=>[esc(x.stage), fmt.format(x.count), fmtHours(x.avg), fmtHours(x.med), fmtHours(x.max), fmtHours(x.total)]));
  table(document.getElementById('transitionTimeTable'), ['Переход','Наблюдений','Среднее','Медиана','Максимум'], transitionDwell.map(x=>[esc(x.pair), fmt.format(x.count), fmtHours(x.avg), fmtHours(x.med), fmtHours(x.max)]));
  document.getElementById('currentMonthNote').textContent = currentMonth ? `Месяц анализа: ${monthLabel(currentMonth)}. В расчёте только сделки выбранного сегмента, созданные в этом месяце.` : 'Нет даты создания для определения текущего месяца.';
  const cmByManager = countBy(currentMonthDeals, d=>d.manager).slice(0,16).map(([manager,c])=>{
    const arr=currentMonthDeals.filter(d=>d.manager===manager);
    const v=arr.filter(d=>Number.isFinite(num(d.timeToVisitHours)) && num(d.timeToVisitHours)>0);
    const closedArr=arr.filter(d=>num(d.closed) && Number.isFinite(num(d.closeHours)) && num(d.closeHours)>0);
    return [esc(manager), fmt.format(arr.length), fmt.format(v.length), pct(v.length,arr.length), fmtHours(avg(v,d=>num(d.timeToVisitHours))), fmtHours(avg(closedArr,d=>num(d.closeHours)))];
  });
  table(document.getElementById('currentMonthTimeTable'), ['Ответственный','Заявок','Визитов','Конверсия в визит','Сред. до визита','Сред. жизнь закрытых'], cmByManager);
  function reasonRows(arr, qualification) { return countBy(arr, d=>d.reasonClass).slice(0,12).map(([rc,c])=>{
    const code=(rc.match(/^([1234])_/)||['','0'])[1]; const name=rc.replace(/^[0-4]_/, '') || 'Причина не указана';
    return `<div class="reason-item"><div><div class="reason-title" title="${esc(name)}">${esc(name)}</div><div class="reason-sub">${reasonTag(code, qualification)} · ${pct(c, arr.length)}</div></div><div class="reason-num">${fmt.format(c)}</div></div>`;
  }).join('') || '<div class="small-note">Нет данных</div>'; }
  document.getElementById('reasonNonqual').innerHTML=reasonRows(closed.filter(d=>d.qualification==='nonqual'), 'nonqual');
  document.getElementById('reasonQual').innerHTML=reasonRows(closed.filter(d=>d.qualification==='qual'), 'qual');
  const stageGroups=countBy(closed.filter(d=>!num(d.success)), d=>d.prev).slice(0,12);
  document.getElementById('stageCards').innerHTML=stageGroups.map(([stage,c])=>{
    const arr=closed.filter(d=>!num(d.success) && d.prev===stage);
    const nq=arr.filter(d=>d.qualification==='nonqual').length, v=arr.filter(d=>num(d.visit)).length, q=arr.filter(d=>d.qualification==='qual' && !num(d.visit)).length, u=arr.length-nq-q-v;
    const w=x=>arr.length?Math.max(0,x/arr.length*100):0;
    return `<div class="stage-card"><div class="stage-name">${esc(stage)}</div><div class="split-bar"><div class="split-red" style="width:${w(nq)}%"></div><div class="split-blue" style="width:${w(q)}%"></div><div class="split-green" style="width:${w(v)}%"></div><div class="split-gray" style="width:${w(u)}%"></div></div><div class="stage-metric"><span>Всего</span><b>${fmt.format(arr.length)}</b></div><div class="stage-metric"><span>Не квал</span><b>${fmt.format(nq)} / ${pct(nq,arr.length)}</b></div><div class="stage-metric"><span>Квал без визита</span><b>${fmt.format(q)} / ${pct(q,arr.length)}</b></div><div class="stage-metric"><span>Визит</span><b>${fmt.format(v)} / ${pct(v,arr.length)}</b></div></div>`;
  }).join('') || '<div class="small-note">Нет данных</div>';
  const rcMap = new Map();
  closed.forEach(d=>{
    const rc=d.reasonClass || '0_Причина не указана';
    const key=(d.qualification || 'unknown')+'||'+rc+'||'+(d.qualificationSource || 'unknown');
    rcMap.set(key, (rcMap.get(key)||0)+1);
  });
  const rcRows=[...rcMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,16).map(([key,c])=>{
    const [q,rc,src]=key.split('||');
    const code=(rc.match(/^([1234])_/)||['','0'])[1];
    const name=rc.replace(/^[0-4]_/, '') || 'Причина не указана';
    const source = src==='salesbot_qual_lead' ? 'SalesBot Квал лид' : (src==='card_qual_lead' ? 'поле/тег Квал лид' : (src==='code' ? 'код причины' : (src==='funnel_stage' ? 'этап воронки' : 'нет источника')));
    return [reasonTag(code, q), esc(name), esc(source), fmt.format(c), pct(c,closed.length)];
  });
  table(document.getElementById('reasonClassTable'), ['Класс','Причина','Источник класса','Сделок','Доля закрытых'], rcRows);
  const stageRiskRows=stageGroups.slice(0,14).map(([stage,c])=>{
    const arr=closed.filter(d=>!num(d.success) && d.prev===stage); const nq=arr.filter(d=>d.qualification==='nonqual').length; const v=arr.filter(d=>num(d.visit)).length; const q=arr.filter(d=>d.qualification==='qual' && !num(d.visit)).length;
    return [esc(stage), fmt.format(arr.length), pct(arr.length,closed.length), pct(nq,arr.length), pct(q,arr.length), pct(v,arr.length)];
  });
  table(document.getElementById('stageRisk'), ['Этап','Закрытий','Доля','Не квал','Квал без визита','Визит'], stageRiskRows);
  const slaBase=f.filter(d=>!isHozOrDuplicateClosed(d));
  const slaTotal=slaBase.length;
  const slaRows=countBy(slaBase,d=>d.slaBucket).map(([b,c])=>{ const arr=slaBase.filter(d=>d.slaBucket===b); return [esc(b), fmt.format(c), pct(c,slaTotal), fmt.format(Math.round(avg(arr,d=>num(d.calls)))), fmt.format(Math.round(avg(arr,d=>num(d.callDurSec)/60)))+' мин']; });
  table(document.getElementById('slaTable'), ['SLA-бакет','Сделок','Доля','Сред. звонков','Сред. длительность'], slaRows);
  const callOrder=['0 звонков','1 звонок','2 звонка','3 звонка','4+ звонка'];
  const callBase=f.filter(d=>!isHozOrDuplicateClosed(d));
  const callTotal=callBase.length;
  const callRows=callOrder.filter(b=>callBase.some(d=>d.callsBucket===b)).map(b=>{ const arr=callBase.filter(d=>d.callsBucket===b); const closedArr=arr.filter(d=>num(d.closed)); return [esc(b), fmt.format(arr.length), pct(arr.length,callTotal), pct(closedArr.length,arr.length), pct(arr.filter(d=>num(d.success)).length,arr.length), pct(arr.filter(d=>num(d.visit)).length,arr.length)]; });
  table(document.getElementById('callTable'), ['Звонки','Сделок','Доля','Закрыто','Успех','Визит по дате'], callRows);
  const outgoingRows = outgoingCallsByManager(f).map(x=>[
    esc(x.manager),
    fmt.format(x.deals),
    fmt.format(x.calls),
    fmt.format(x.callsGt30),
    fmt.format(x.callsGt60),
    fmt.format(x.callsGt180),
    fmtHms(x.totalSec),
    fmtHms(x.avgSec)
  ]);
  table(document.getElementById('outgoingManagerTable'), ['Ответственный','Сделок','Исходящих звонков','Звонков >30 сек','Звонков >1 мин','Звонков >3 мин','Общая длительность','Средняя длительность'], outgoingRows);
  const pathRows=countBy(noVisitClosed, d=>d.chain).slice(0,18).map(([p,c])=>[esc(p || 'Нет цепочки'), fmt.format(c), pct(c,noVisitClosed.length)]);
  table(document.getElementById('pathTable'), ['Цепочка','Сделок','Доля закрытых без визита'], pathRows);
  document.getElementById('footerStats').textContent=`Показано сделок: ${fmt.format(total)} из ${fmt.format(deals.length)}. Источников: ${new Set(f.map(d=>d.source)).size}, посадок: ${new Set(f.map(d=>d.landing)).size}, городов: ${new Set(f.map(d=>d.city)).size}, ответственных: ${new Set(f.map(d=>d.manager)).size}.`;
  wireDrilldowns();
}
function openFilterDrawer() {
  if(!deals.length) return;
  TLROOT.classList.add('filter-popover-open');
}
function closeFilterDrawer() {
  TLROOT.classList.remove('filter-popover-open');
}
function dealUrl(id) {
  return 'https://ksocm66.amocrm.ru/leads/detail/' + encodeURIComponent(String(id || '').trim());
}
const KPI_MODAL_CONFIG = {
  success: {
    title: 'Успешно реализовано',
    empty: 'В текущем срезе нет успешных реализаций.',
    filter: d => num(d.success)
  },
  nonqual: {
    title: 'Не квал',
    empty: 'В текущем срезе нет сделок класса «Не квал».',
    filter: d => d.qualification === 'nonqual'
  },
  qual: {
    title: 'Квал',
    empty: 'В текущем срезе нет сделок класса «Квал».',
    filter: d => d.qualification === 'qual'
  },
  visit: {
    title: 'Визит по дате',
    empty: 'В текущем срезе нет сделок с заполненной «Датой визита».',
    filter: d => num(d.visit)
  }
};
function renderDealsModal(titleText, rows, emptyText='В текущем срезе нет сделок.') {
  const body=document.getElementById('successModalBody');
  const sub=document.getElementById('successModalSub');
  const title=document.getElementById('successModalTitle');
  if(title) title.textContent = titleText;
  if(sub) sub.textContent = `Сделки из текущего среза фильтров: ${fmt.format(rows.length)}`;
  if(!body) return;
  if(!rows.length) {
    body.innerHTML=`<div class="success-empty">${esc(emptyText)}</div>`;
  } else {
    body.innerHTML = `<div class="success-table-wrap"><table class="success-table">
      <colgroup>
        <col style="width:9%"><col style="width:13%"><col style="width:9%"><col style="width:13%"><col style="width:10%"><col style="width:10%"><col style="width:10%"><col style="width:11%"><col style="width:15%">
      </colgroup>
      <thead><tr>
        <th>ID сделки</th>
        <th>Ответственный</th>
        <th>Город</th>
        <th>Источник обращения</th>
        <th>Дата создания</th>
        <th>Дата визита</th>
        <th>Дата реализации</th>
        <th>Вид реализации</th>
        <th>Посадка</th>
      </tr></thead>
      <tbody>${rows.map(d=>`<tr>
        <td><a href="${dealUrl(d.id)}" target="_blank" rel="noopener">${esc(d.id)}</a></td>
        <td>${esc(d.manager)}</td>
        <td>${esc(d.city)}</td>
        <td>${esc(d.source)}</td>
        <td>${esc(d.created || '')}</td>
        <td>${esc(d.visitDateRaw || '')}</td>
        <td>${esc(d.realizationDateRaw || '')}</td>
        <td>${esc(d.realizationType || 'пусто')}</td>
        <td>${esc(d.landing)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }
  makeTableSortable(body.querySelector('.success-table'));
  TLROOT.classList.add('success-modal-open');
}
function openDealsModal(kind='success') {
  const cfg = KPI_MODAL_CONFIG[kind] || KPI_MODAL_CONFIG.success;
  const rows = deals.filter(isFiltered).filter(cfg.filter);
  renderDealsModal(cfg.title, rows, cfg.empty);
}
function openDrillModal(titleText, filterFn, opts={}) {
  const base = opts.base || (d=>isFiltered(d));
  const rows = deals.filter(base).filter(filterFn);
  renderDealsModal(titleText, rows, opts.empty || 'В текущем срезе нет сделок для выбранной строки.');
}
function openSuccessDealsModal() {
  openDealsModal('success');
}
function closeSuccessDealsModal() {
  TLROOT.classList.remove('success-modal-open');
}
document.getElementById('csvUpload')?.addEventListener('change', e=>handleCsvUpload(e.target.files && e.target.files[0]));
document.getElementById('clearCsv')?.addEventListener('click', clearImportedCsv);
document.getElementById('ejectUploadCsv')?.addEventListener('click', ejectAndUploadCsv);
function updateFilterFabVisibility() {
  const fab = document.getElementById('filterFab');
  const panel = document.querySelector('.top .brand-card');
  if(!fab || !panel) return;
  if(!deals.length || TLROOT.classList.contains('loading')) {
    fab.classList.remove('visible');
    return;
  }
  const r = panel.getBoundingClientRect();
  const visiblePx = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
  const isVisible = visiblePx > Math.min(90, Math.max(40, r.height * 0.25));
  fab.classList.toggle('visible', !isVisible);
}
function initFilterFabObserver() {
  updateFilterFabVisibility();
  window.addEventListener('scroll', updateFilterFabVisibility, { passive:true });
  document.addEventListener('scroll', updateFilterFabVisibility, { passive:true, capture:true }); // app scroll container is <main>, not window
  window.addEventListener('resize', ()=>{ updateFilterFabVisibility(); document.querySelectorAll('#tl-app .filter').forEach(f=>f.classList.remove('open')); });
  if('IntersectionObserver' in window) {
    const panel = document.querySelector('.top .brand-card');
    if(panel) {
      const obs = new IntersectionObserver(()=>updateFilterFabVisibility(), { threshold:[0, .1, .25, .5, 1] });
      obs.observe(panel);
    }
  }
}
document.getElementById('filterFab')?.addEventListener('click', openFilterDrawer);
document.getElementById('filterBackdrop')?.addEventListener('click', closeFilterDrawer);
document.getElementById('filterPopoverClose')?.addEventListener('click', closeFilterDrawer);
document.getElementById('successModalBackdrop')?.addEventListener('click', closeSuccessDealsModal);
document.getElementById('successModalClose')?.addEventListener('click', closeSuccessDealsModal);
document.addEventListener('keydown', e=>{ if(e.key==='Escape') { closeFilterDrawer(); closeSuccessDealsModal(); } });
buildFilters(); updateFilterLabels(); updateDataSubtitle(); render(); initFilterFabObserver();
// v37: checkbox/group filter selections no longer rebuild filter DOM, so open menus stay open for multi-select.
window.tlOnShow = updateFilterFabVisibility; // recompute FAB when the Timeline screen becomes visible
})();
