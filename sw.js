const CACHE_NAME = 'crm-crew-dashboard-v179';
const STATIC_ASSETS = [
  './manifest.json',
  './logos/pwa-192.png',
  './logos/pwa-512.png',
  // Fluent theme icons
  './logos/Fluent/FluentColor-About.svg',
  './logos/Fluent/FluentColor-Alert.svg',
  './logos/Fluent/FluentColor-Analysis.svg',
  './logos/Fluent/FluentColor-Archive.svg',
  './logos/Fluent/FluentColor-Cash.svg',
  './logos/Fluent/FluentColor-Check.svg',
  './logos/Fluent/FluentColor-Close.svg',
  './logos/Fluent/FluentColor-Exit.svg',
  './logos/Fluent/FluentColor-FAQ.svg',
  './logos/Fluent/FluentColor-Fail.svg',
  './logos/Fluent/FluentColor-Grafik.svg',
  './logos/Fluent/FluentColor-GrafikEdit.svg',
  './logos/Fluent/FluentColor-GrafikExit.svg',
  './logos/Fluent/FluentColor-GrafikSave.svg',
  './logos/Fluent/FluentColor-Home.svg',
  './logos/Fluent/FluentColor-Inform.svg',
  './logos/Fluent/FluentColor-KPI.svg',
  './logos/Fluent/FluentColor-Left.svg',
  './logos/Fluent/FluentColor-Lock.svg',
  './logos/Fluent/FluentColor-Menu.svg',
  './logos/Fluent/FluentColor-Online.svg',
  './logos/Fluent/FluentColor-profile.svg',
  './logos/Fluent/FluentColor-Rang.svg',
  './logos/Fluent/FluentColor-Refresh.svg',
  './logos/Fluent/FluentColor-Report.svg',
  './logos/Fluent/FluentColor-Revise.svg',
  './logos/Fluent/FluentColor-Right.svg',
  './logos/Fluent/FluentColor-Settings.svg',
  './logos/Fluent/FluentColor-Themes.svg',
  './logos/Fluent/FluentColor-FindDuble.svg',
  './logos/Fluent/FluentColor-Trophies.svg',
  './logos/Fluent/FluentColor-Vacation.svg',
  './logos/Fluent/FluentColor-Vizity.svg',
  // Cosmic theme icons
  './logos/cosmic/cosmic-alert.svg',
  './logos/cosmic/cosmic-profile.svg',
  './logos/cosmic/cosmic-s_check.svg',
  './logos/cosmic/cosmic-s_not-verified.svg',
  './logos/cosmic/cosmic-s_verified.svg',
  './logos/cosmic/cosmic-send-noti.svg',
  './logos/cosmic/cosmic-trophies.svg',
  './logos/cosmic/cosmic_about.svg',
  './logos/cosmic/cosmic_base.svg',
  './logos/cosmic/cosmic_config.svg',
  './logos/cosmic/cosmic_cube.svg',
  './logos/cosmic/cosmic_exit.svg',
  './logos/cosmic/cosmic_faq.svg',
  './logos/cosmic/cosmic_grafik.svg',
  './logos/cosmic/cosmic_home.svg',
  './logos/cosmic/cosmic_kpi.svg',
  './logos/cosmic/cosmic_lock.svg',
  './logos/cosmic/cosmic_menu.svg',
  './logos/cosmic/cosmic_money.svg',
  './logos/cosmic/cosmic_online.svg',
  './logos/cosmic/cosmic_rang.svg',
  './logos/cosmic/cosmic_refresh.svg',
  './logos/cosmic/cosmic_find_duble.svg',
  './logos/cosmic/cosmic_themes.svg',
  './logos/cosmic/cosmic_vacation.svg',
  './logos/cosmic/cosmic_vizity.svg',
  // Default theme icons
  './logos/default/about.svg',
  './logos/default/base.svg',
  './logos/default/config.svg',
  './logos/default/edit.svg',
  './logos/default/exit.svg',
  './logos/default/faq.svg',
  './logos/default/grafik-cancel.svg',
  './logos/default/grafik-save.svg',
  './logos/default/grafik.svg',
  './logos/default/home.svg',
  './logos/default/kpi.svg',
  './logos/default/left.svg',
  './logos/default/menu.svg',
  './logos/default/money.svg',
  './logos/default/online.svg',
  './logos/default/profile.svg',
  './logos/default/rang.svg',
  './logos/default/refresh.svg',
  './logos/default/right.svg',
  './logos/default/s_check.svg',
  './logos/default/s_not-verified.svg',
  './logos/default/s_verified.svg',
  './logos/default/send-noti.svg',
  './logos/default/theme.svg',
  './logos/default/find-duble.svg',
  './logos/default/trophies.svg',
  './logos/default/vacation.svg',
  './logos/default/vizity.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // .addAll() — атомарно: одна 404 уронит всё кеширование. Кешируем по одной с .catch().
      .then(cache => Promise.all(STATIC_ASSETS.map(url =>
        cache.add(url).catch(err => console.warn('sw: failed to cache', url, err))
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  if (url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(fetch(req));
    return;
  }

  // Для .json (data/trophies.json и подобных) — network-first с fallback на cache.
  // Это спасает от Failed to fetch при сетевых блипах и iOS PWA-офлайне.
  if (url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(req).then(resp => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return resp;
      }).catch(() => caches.match(req).then(cached => cached || Promise.reject(new Error('offline'))))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      return resp;
    }))
  );
});
