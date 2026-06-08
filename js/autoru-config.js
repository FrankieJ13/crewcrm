// Фронт читает cars.json (компактный формат: header + массив массивов).
// CSV остаётся для импорта в Sheets через IMPORTDATA.
window.AUTORU_CONFIG = {
  dataUrl: "data/autoru-cars.json",
  pageSize: 24,
};
