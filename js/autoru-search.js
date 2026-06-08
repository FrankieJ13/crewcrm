// Парсер запросов: достаёт из строки бренд/модель/город/кузов/КПП/привод/цвет/
// диапазоны цены/года/пробега/мест, остаток считает свободным текстом.
// Опирается на window.AUTO_ASSISTANT_DICTIONARY (тот же словарь, что в CM66-BDCARS).
window.AutoSearch = (function () {
  "use strict";

  const dict = window.AUTO_ASSISTANT_DICTIONARY || {};
  const BODY_TYPES = [
    { name: "седан",         aliases: ["седан", "сидан", "sedan"] },
    { name: "хэтчбек",       aliases: ["хэтчбек", "хетчбек", "хетч", "хеч", "хэч", "хэтч", "hatchback", "hatch"] },
    { name: "лифтбек",       aliases: ["лифтбек", "лифтбэк", "liftback"] },
    { name: "универсал",     aliases: ["универсал", "вагон", "wagon", "estate"] },
    { name: "купе",          aliases: ["купе", "coupe"] },
    { name: "кроссовер",     aliases: ["кроссовер", "кросовер", "паркетник", "crossover"] },
    { name: "внедорожник",   aliases: ["внедорожник", "джип", "вездеход", "suv", "offroad"] },
    { name: "пикап",         aliases: ["пикап", "pickup"] },
    { name: "минивэн",       aliases: ["минивэн", "минивен", "minivan", "van"] },
    { name: "фургон",        aliases: ["фургон"] },
    { name: "кабриолет",     aliases: ["кабриолет", "cabriolet", "convertible"] },
    { name: "родстер",       aliases: ["родстер", "roadster"] },
    { name: "лимузин",       aliases: ["лимузин", "limousine"] },
    { name: "микроавтобус",  aliases: ["микроавтобус", "минибус", "minibus"] },
  ];
  const TRANSMISSIONS = {
    "автоматическая": ["автомат", "автоматическая", "акпп", "ат", "auto", "a/t", "automatic"],
    "механическая":   ["механика", "механическая", "мкпп", "мт", "manual"],
    "робот":          ["робот", "роботизированная", "ркпп", "dsg", "дсг", "powershift", "типтроник"],
    "вариатор":       ["вариатор", "cvt"],
  };
  const DRIVES = {
    "полный":   ["полный", "4wd", "awd", "4x4", "4 wd"],
    "передний": ["передний", "fwd", "fronwd", "перед"],
    "задний":   ["задний", "rwd", "зад"],
  };
  const FUELS = {
    "бензин":  ["бензин", "бензе", "petrol", "gasoline", "газ"],
    "дизель":  ["дизель", "diesel", "тдi", "tdi"],
    "электро": ["электро", "электрич", "electric", "ev", "электр"],
    "гибрид":  ["гибрид", "hybrid", "phev", "hev"],
  };
  const COLORS = ["чёрный","черный","белый","синий","серый","серебристый","красный","зелёный","зеленый","жёлтый","желтый","оранжевый","бежевый","фиолетовый","коричневый","голубой","золотистый","розовый"];

  // ===== нормализация =====
  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[,.;:!?()\[\]{}«»"']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ===== числа =====
  // "1.2", "1,2", "1 200" → число
  function parseNumber(s) {
    return Number(String(s).replace(/\s/g, "").replace(",", "."));
  }
  // 1.2 млн, 800 тыс, 600к, 1.5m, 200000 → рублей
  function parseMoneyToken(num, unit) {
    const n = parseNumber(num);
    if (!Number.isFinite(n)) return null;
    const u = unit && unit.toLowerCase();
    if (!u) return n >= 10000 ? n : null;
    if (/^(млн|мил(л|лион)?|m|м)$/.test(u)) return n * 1e6;
    if (/^(тыс|т|тр|к|k)$/.test(u))         return n * 1e3;
    return null;
  }

  // ===== извлечение диапазона ЦЕНЫ =====
  // примеры: "до 1.2 млн", "от 3 млн", "до 900к", "600-900 тыс", "1млн", "до 800000"
  function extractPrice(q) {
    const unit = "(?:млн|мил(?:лион(?:а|ов)?)?|м|тыс(?:яч)?|т|тр|к|k|m)";
    const num  = "(\\d+(?:[.,]\\d+)?)";
    const out = { min: null, max: null };

    // "от X" / "до Y" с единицей
    const reFrom = new RegExp(`(?:от|>=?|дороже|не\\s+дешевле|начиная\\s+с)\\s+${num}\\s*${unit}?`, "gi");
    const reTo   = new RegExp(`(?:до|<=?|дешевле|не\\s+дороже|меньше|бюджет(?:ом)?|цена\\s+до|стоимость\\s+до)\\s+${num}\\s*${unit}?`, "gi");
    const reRange= new RegExp(`${num}\\s*${unit}?\\s*[-—–]\\s*${num}\\s*${unit}`, "gi");

    let m;
    if ((m = reRange.exec(q))) {
      const v1 = parseMoneyToken(m[1], m[3]) || parseMoneyToken(m[1], "");
      const v2 = parseMoneyToken(m[2], m[3]);
      if (v1 && v2) { out.min = Math.min(v1, v2); out.max = Math.max(v1, v2); return out; }
    }
    while ((m = reFrom.exec(q))) { const v = parseMoneyToken(m[1], m[2] || ""); if (v) out.min = v; }
    while ((m = reTo.exec(q)))   { const v = parseMoneyToken(m[1], m[2] || ""); if (v) out.max = v; }

    // "1.2 млн" / "800 тыс" без префикса — трактуем как максимум
    if (out.min === null && out.max === null) {
      const reBare = new RegExp(`\\b${num}\\s*${unit}\\b`, "gi");
      while ((m = reBare.exec(q))) { const v = parseMoneyToken(m[1], m[2]); if (v) out.max = v; }
    }
    return out;
  }

  // ===== ГОД =====
  // "2018", "от 2018", "до 2020", "2018-2020"
  function extractYear(q) {
    const yr = "((?:19|20)\\d{2})";
    const out = { min: null, max: null };
    let m;
    const reRange = new RegExp(`${yr}\\s*[-—–]\\s*${yr}`, "g");
    if ((m = reRange.exec(q))) { out.min = +m[1]; out.max = +m[2]; if (out.min > out.max) [out.min, out.max] = [out.max, out.min]; return out; }
    const reFrom = new RegExp(`(?:от|с|начиная\\s+с|после|не\\s+старше|моложе|свежее)\\s+${yr}`, "gi");
    const reTo   = new RegExp(`(?:до|по|раньше|старше|не\\s+новее)\\s+${yr}`, "gi");
    while ((m = reFrom.exec(q))) out.min = +m[1];
    while ((m = reTo.exec(q)))   out.max = +m[1];
    if (out.min === null && out.max === null) {
      const reBare = new RegExp(`\\b${yr}\\s*(?:г|год|года|году)?\\b`, "g");
      while ((m = reBare.exec(q))) { out.min = +m[1]; out.max = +m[1]; }
    }
    return out;
  }

  // ===== ПРОБЕГ =====
  // "до 50 тыс км", "до 100к", "до 80000 км"
  function extractMileageMax(q) {
    const num = "(\\d+(?:[.,]\\d+)?)";
    const unit = "(?:тыс|т|к|k)?";
    const km = "(?:\\s*км)?";
    const re = new RegExp(`до\\s+${num}\\s*${unit}${km}|пробег(?:ом)?\\s+до\\s+${num}\\s*${unit}${km}`, "gi");
    let m, max = null;
    while ((m = re.exec(q))) {
      const n = parseNumber(m[1] || m[2]);
      const u = (m[1] ? m[0] : m[0]).toLowerCase();
      if (!Number.isFinite(n)) continue;
      if (/(тыс|\bт\b|\bк\b|\bk\b)/.test(u)) max = n * 1000;
      else if (n < 1000) max = n * 1000;
      else max = n;
    }
    return max;
  }

  // ===== КОЛИЧЕСТВО МЕСТ =====
  function extractSeats(q) {
    let m;
    if ((m = /(\d+)\s*[\- ]?\s*мест(?:ный|ная|ное|ный|а|ов)?/i.exec(q))) return +m[1];
    if ((m = /\bна\s+(\d+)\s+мест/i.exec(q))) return +m[1];
    return null;
  }

  // ===== АЛИАСНЫЕ СЛОВАРНЫЕ МАТЧИ =====
  function buildAliasMatchers() {
    const idx = new Map();
    const add = (type, item) => {
      const variants = new Set();
      [item.name, item.slug, ...(item.aliases || [])].forEach(v => {
        const n = normalize(v);
        if (n) variants.add(n);
      });
      variants.forEach(v => {
        if (!idx.has(v)) idx.set(v, []);
        idx.get(v).push({ type, name: item.name });
      });
    };
    (dict.brands || []).forEach(b => add("brand", b));
    (dict.models || []).forEach(m => add("model", m));
    (dict.cities || []).forEach(c => add("city", c));
    BODY_TYPES.forEach(b => add("body", { name: b.name, aliases: b.aliases }));
    Object.entries(TRANSMISSIONS).forEach(([name, al]) => add("transmission", { name, aliases: al }));
    Object.entries(DRIVES).forEach(([name, al])         => add("drive", { name, aliases: al }));
    Object.entries(FUELS).forEach(([name, al])          => add("fuel", { name, aliases: al }));
    COLORS.forEach(c => add("color", { name: c, aliases: [c] }));
    return idx;
  }

  const aliasIdx = buildAliasMatchers();
  // Список одно-словных ключей для префиксного поиска: ["карнивал", "carnival", ...]
  const singleWordKeys = Array.from(aliasIdx.keys()).filter(k => !k.includes(" "));

  function findAliasMatches(q) {
    const tokens = normalize(q).split(" ").filter(Boolean);
    const used = new Array(tokens.length).fill(false);
    const found = { brand: [], model: [], city: [], body: [], transmission: [], drive: [], fuel: [], color: [] };

    // 1) точные матчи: bigram → unigram
    for (let n = 2; n >= 1; n--) {
      for (let i = 0; i + n <= tokens.length; i++) {
        if (used.slice(i, i + n).some(Boolean)) continue;
        const phrase = tokens.slice(i, i + n).join(" ");
        const hits = aliasIdx.get(phrase);
        if (!hits) continue;
        hits.forEach(h => { if (!found[h.type].includes(h.name)) found[h.type].push(h.name); });
        for (let j = i; j < i + n; j++) used[j] = true;
      }
    }

    // 2) префиксное угадывание: если оставшийся токен >= 2 символов и
    //    есть только одна уникальная цель (type+name) по префиксу — применяем.
    for (let i = 0; i < tokens.length; i++) {
      if (used[i]) continue;
      const t = tokens[i];
      if (t.length < 2) continue;
      const targets = new Map();   // key: type+name
      for (const key of singleWordKeys) {
        if (!key.startsWith(t)) continue;
        for (const hit of aliasIdx.get(key)) {
          targets.set(hit.type + "::" + hit.name, hit);
        }
        if (targets.size > 3) break; // слишком неоднозначно, бросаем
      }
      if (targets.size === 1) {
        const h = targets.values().next().value;
        if (!found[h.type].includes(h.name)) found[h.type].push(h.name);
        used[i] = true;
      }
    }

    const rest = tokens.filter((_, i) => !used[i]).join(" ");
    return { found, rest };
  }

  // ===== ОЧИСТКА ФРАЗ ОТ УЖЕ РАСПОЗНАННОГО =====
  // Удаляем то, что вынули в фильтры — иначе "7 мест", "до 1.2 млн" и т.п.
  // утекают в free-text и ломают матчинг.
  function stripPhrases(q) {
    const unit = "(?:млн|мил(?:лион(?:а|ов)?)?|м|тыс(?:яч)?|т|тр|к|k|m)";
    const num  = "\\d+(?:[.,]\\d+)?";
    return q
      // ценовые диапазоны и точечные суммы
      .replace(new RegExp(`(?:от|до|<=?|>=?|дороже|дешевле|не\\s+дороже|не\\s+дешевле|бюджет(?:ом)?|цена\\s+до|стоимость\\s+до|начиная\\s+с|меньше)\\s+${num}\\s*${unit}?`, "gi"), " ")
      .replace(new RegExp(`${num}\\s*${unit}\\s*[-—–]\\s*${num}\\s*${unit}`, "gi"), " ")
      .replace(new RegExp(`\\b${num}\\s*${unit}\\b`, "gi"), " ")
      // года
      .replace(/\b(?:19|20)\d{2}\s*[-—–]\s*(?:19|20)\d{2}\b/g, " ")
      .replace(/(?:от|с|до|по|после|раньше|старше|моложе|не\s+(?:старше|новее)|свежее|начиная\s+с)\s+(?:19|20)\d{2}/gi, " ")
      .replace(/\b(?:19|20)\d{2}(?:\s*г(?:од|ода|оду)?\.?)?\b/g, " ")
      // места
      .replace(/\d+\s*[\- ]?\s*мест(?:ный|ная|ное|а|ов)?/gi, " ")
      .replace(/\bна\s+\d+\s+мест/gi, " ")
      // пробег
      .replace(/до\s+\d+(?:[.,]\d+)?\s*(?:тыс|т|к|k)?\s*км?/gi, " ")
      .replace(/пробег(?:ом)?\s+до\s+\d+(?:[.,]\d+)?\s*(?:тыс|т|к|k)?\s*км?/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ===== ПАРСЕР =====
  // ===== ИНТЕНТЫ (паттерны взяты из autopodbor-chat.js для единообразия) =====
  // CHEAP: «ведро», «корыто», «развалюха», «убитая», «дешман» и т.п. → priceMax 500k
  const CHEAP_INTENT = /(?:ржав(?:ое|ую|ый|ые|ого|еньк(?:ое|ую|ий|ие))?|ржавая|ржавчина|корыто|корытце|тазик|таз|ведро|ведра|дрова|дровишки|груда\s+металла|кусок\s+металла|металлолом|чермет|утиль|хлам|автохлам|развалюха|старье|старьё|помойка|помоечка|убит(?:ое|ую|ый|ые)|уставш(?:ее|ую|ий|ие)|сам(?:ое|ую|ый)?\s+дешев(?:ое|ую|ый)|дешман|дешманск(?:ое|ую|ий)|бомж\s*вариант|нищеброд\s*вариант|дешёвка|дешевка|дёшево|дешево|недорог(?:о|ая|ие|ой))/gi;
  // EXPENSIVE: «премиум», «лакшери», «топчик», «жирная», «царский вариант» → priceMin 2.5M
  const EXPENSIVE_INTENT = /(?:дорого\s*[- ]?\s*богато|богато\s*[- ]?\s*дорого|топ\s+за\s+свои\s+деньги|топ\s+за\s+свои|лучшее\s+за\s+свои\s+деньги|лучшее\s+за\s+свои|максимум\s+за\s+свои|надо\s+брать|надо\s+забирать|бери\s+не\s+думай|можно\s+брать|топчик|сам(?:ое|ую|ый|ые)?\s+дорог(?:ое|ую|ой|ие|их)|сам(?:ое|ую|ый|ые)?\s+жирн(?:ое|ую|ый|ые|ых)|сам(?:ое|ую|ый|ые)?\s+богат(?:ое|ую|ый|ые|ых)|дорогие\s+тачки|дорогие\s+машины|дорогой\s+вариант|богатый\s+вариант|жирный\s+вариант|царский\s+вариант|лакомый\s+вариант|для\s+босса|для\s+директора|по\s+красоте|на\s+максималках|максималка|полный\s+фарш|жир(?:ный|ная|ное|ные)?|лакшери|люкс|премиум|премиальный|премиальная|богато|все\s+деньги|все\s+лучшее|самый\s+сок|сладкий\s+вариант)/gi;
  // FRESH: «новая», «свежая», «свежак», «не битая», «топ свежак» → yearMin = current - 2
  const FRESH_INTENT = /(?:совсем\s+нов(?:ая|ое|ые)|свежак|свеж(?:ая|ее|ие)\s+тачк|нов(?:ая|ое|ые)\s+тачк)/gi;
  // OLD: «старая», «бабушкин вариант» → yearMax = 2010
  const OLD_INTENT = /(?:бабушкин\s+вариант|дедушкин\s+вариант|совсем\s+стар(?:ая|ое|ый|ые)|старичок|старушка)/gi;
  // Слова-синонимы «авто» — нужно убирать чтобы не падали в free и не ломали матч
  const NOISE_WORDS = /(?:^|\s)(?:тачка|тачку|тачки|машинка|машинку|машинки|машин(?:а|у|ы)?|автомобил(?:ь|и|я|ей)?|транспорт|агрегат|кар)(?=\s|$)/gi;

  function applyIntents(qFull, out) {
    let q = String(qFull || '').toLowerCase().replace(/ё/g,'е');
    if (CHEAP_INTENT.test(q)) {
      if (!out.priceMax) out.priceMax = 500000;
    }
    if (EXPENSIVE_INTENT.test(q)) {
      if (!out.priceMin) out.priceMin = 2500000;
    }
    if (FRESH_INTENT.test(q)) {
      if (!out.yearMin) out.yearMin = new Date().getFullYear() - 2;
    }
    if (OLD_INTENT.test(q)) {
      if (!out.yearMax) out.yearMax = 2010;
    }
    // Возвращаем строку без intent-токенов и шум-слов — иначе они утекут в free
    return q
      .replace(CHEAP_INTENT, ' ')
      .replace(EXPENSIVE_INTENT, ' ')
      .replace(FRESH_INTENT, ' ')
      .replace(OLD_INTENT, ' ')
      .replace(NOISE_WORDS, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function parse(rawQuery) {
    const qFull = normalize(rawQuery);
    const price = extractPrice(qFull);
    const year  = extractYear(qFull);
    const mileageMax = extractMileageMax(qFull);
    const seats = extractSeats(qFull);
    const out = {
      raw: rawQuery,
      free: '',
      brands: [], models: [], cities: [], bodies: [],
      transmissions: [], drives: [], fuels: [], colors: [],
      priceMin: price.min, priceMax: price.max,
      yearMin: year.min,   yearMax: year.max,
      mileageMax,
      seats,
    };
    // Сначала intent-фразы и noise-слова (ведро/премиум/тачка...) — вынимают
    // фильтры и убирают токены из запроса
    const qAfterIntents = applyIntents(qFull, out);
    const qClean = stripPhrases(qAfterIntents);
    const { found, rest } = findAliasMatches(qClean);
    out.brands = found.brand;
    out.models = found.model;
    out.cities = found.city;
    out.bodies = found.body;
    out.transmissions = found.transmission;
    out.drives = found.drive;
    out.fuels = found.fuel;
    out.colors = found.color;
    out.free = rest;
    return out;
  }

  // ===== ФИЛЬТР =====
  function match(car, p) {
    const norm = (v) => normalize(v);
    if (p.brands.length && !p.brands.some(b => norm(car.brand) === norm(b))) return false;
    if (p.models.length && !p.models.some(m => norm(car.model) === norm(m))) return false;
    if (p.cities.length && !p.cities.some(c => norm(car.city)  === norm(c))) return false;
    if (p.bodies.length && !p.bodies.some(b => norm(car.body).includes(norm(b)))) return false;
    if (p.transmissions.length && !p.transmissions.includes(car.transmission)) return false;
    if (p.drives.length && !p.drives.includes(car.drive)) return false;
    if (p.fuels.length && !p.fuels.some(f => norm(car.engine).includes(norm(f)))) return false;
    if (p.colors.length && !p.colors.some(c => norm(car.color) === norm(c))) return false;
    const price = Number(car.price);
    if (p.priceMin && !(price >= p.priceMin)) return false;
    if (p.priceMax && !(price <= p.priceMax)) return false;
    const year = Number(car.year);
    if (p.yearMin && !(year >= p.yearMin)) return false;
    if (p.yearMax && !(year <= p.yearMax)) return false;
    const mileage = Number(car.mileage);
    if (p.mileageMax && !(mileage <= p.mileageMax)) return false;
    if (p.seats && Number(car.seats) !== p.seats) return false;
    if (p.free) {
      const hay = [car.title, car.brand, car.model, car.city, car.body, car.color, car.trim, car.engine].map(norm).join(" ");
      const ok = p.free.split(" ").filter(Boolean).every(t => hay.includes(t));
      if (!ok) return false;
    }
    return true;
  }

  // ===== UI-ПОДСКАЗКА (чипсы) =====
  function chips(p) {
    const arr = [];
    p.brands.forEach(v => arr.push(["марка", v]));
    p.models.forEach(v => arr.push(["модель", v]));
    p.cities.forEach(v => arr.push(["город", v]));
    p.bodies.forEach(v => arr.push(["кузов", v]));
    p.transmissions.forEach(v => arr.push(["кпп", v]));
    p.drives.forEach(v => arr.push(["привод", v]));
    p.fuels.forEach(v => arr.push(["топливо", v]));
    p.colors.forEach(v => arr.push(["цвет", v]));
    if (p.seats)      arr.push(["мест", p.seats]);
    if (p.priceMin)   arr.push(["цена от", fmtMoney(p.priceMin)]);
    if (p.priceMax)   arr.push(["цена до", fmtMoney(p.priceMax)]);
    if (p.yearMin)    arr.push(["год от", p.yearMin]);
    if (p.yearMax)    arr.push(["год до", p.yearMax]);
    if (p.mileageMax) arr.push(["пробег до", fmtMoney(p.mileageMax) + " км"]);
    return arr;
  }
  function fmtMoney(n) { return Number(n).toLocaleString("ru-RU"); }

  return { parse, match, chips };
})();
