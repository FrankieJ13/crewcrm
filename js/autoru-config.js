// Фронт читает cars.json (компактный формат: header + массив массивов).
// CSV остаётся для импорта в Sheets через IMPORTDATA.
window.AUTORU_CONFIG = {
  // Тянем напрямую из upstream-репо (раннер обновляет cars.json регулярно).
  // GitHub raw отдаёт CORS Access-Control-Allow-Origin:* и кешируется
  // CDN'ом ~5 мин. При ошибке (offline/блок) — fallback на локальную копию.
  dataUrl: "https://raw.githubusercontent.com/FrankieJ13/AUTORUCM66CARSDB/main/cars.json",
  fallbackUrl: "data/autoru-cars.json",
  pageSize: 24,
};
