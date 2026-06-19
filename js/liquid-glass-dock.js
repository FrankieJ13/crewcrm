/* ============================================================
   Liquid Glass dock — перетаскиваемый glass-pill с эффектом лупы
   (дисторсия/аберрация через SVG-displacement backdrop-filter),
   магнификация иконки под pill, клик-увеличение. Активен только в теме
   liquid-glass; навигация переиспользует штатные кнопки дока (button.click()).
   Стиль перенесён с образца «dock liquid glass».
   ============================================================ */
(function () {
  'use strict';

  const isLG = () => document.body.classList.contains('liquid-glass');

  let dock = null, pill = null, iconWrap = null, btns = [];
  let curX = 0, targetX = 0, raf = 0;
  let dragging = false, holding = false, moved = false;
  let activeIdx = 0, pendingClick = -1;
  let mo = null, vo = null, built = false;

  const IDLE = 46, HELD = 54;          // размер pill (квадрат, px)

  const el = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function centers() {                  // x-центры кнопок относительно дока (CSS px)
    if (!dock) return [];
    const dr = dock.getBoundingClientRect();
    return btns.map(b => { const r = b.getBoundingClientRect(); return r.left - dr.left + r.width / 2; });
  }
  function rowY() { const dr = dock.getBoundingClientRect(); return dr.height / 2; }
  function nearest(x) {
    const c = centers(); let bi = 0, bd = Infinity;
    c.forEach((cx, i) => { const d = Math.abs(cx - x); if (d < bd) { bd = d; bi = i; } });
    return bi;
  }
  function activeButtonIdx() {
    const i = btns.findIndex(b => b.classList.contains('dock-active'));
    return i < 0 ? 0 : i;
  }
  const iconEls = (b) => b ? b.querySelectorAll('img.app-icon, svg') : [];
  function cloneIcon(i) {                 // клонируем видимую иконку (приоритет цветной .app-icon)
    iconWrap.innerHTML = '';
    const b = btns[i]; if (!b) return;
    const src = b.querySelector('img.app-icon') || b.querySelector('svg');
    if (src) { const c = src.cloneNode(true); c.style.opacity = ''; c.style.display = ''; iconWrap.appendChild(c); }
  }
  function coverBtn(i) {                  // прячем «родную» иконку под pill, остальные показываем
    btns.forEach((b, j) => iconEls(b).forEach(ic => ic.style.opacity = (j === i ? '0' : '')));
  }
  function place() {
    if (!pill) return;
    pill.style.left = curX + 'px';
    pill.style.top = rowY() + 'px';
  }
  function visible() {                  // #main-dock fixed → offsetParent ненадёжен; проверяем display+ширину
    const md = document.getElementById('main-dock');
    if (!md || getComputedStyle(md).display === 'none') return false;
    return !!dock && dock.getBoundingClientRect().width > 4;
  }

  function tick() {
    if (!pill) { raf = 0; return; }
    curX += (targetX - curX) * 0.35;
    const w = holding ? HELD : IDLE;
    pill.style.width = w + 'px'; pill.style.height = w + 'px';
    place();
    const ni = nearest(curX);
    if (ni !== activeIdx) { activeIdx = ni; cloneIcon(ni); coverBtn(ni); }
    if (dragging || Math.abs(targetX - curX) > 0.5) {
      raf = requestAnimationFrame(tick);
    } else {
      raf = 0; curX = targetX; place();
      if (!holding && pendingClick >= 0) finishSnap();
    }
  }
  function kick() { if (!raf) raf = requestAnimationFrame(tick); }

  function finishSnap() {
    const i = pendingClick; pendingClick = -1;
    if (i < 0 || !btns[i]) return;
    const item = btns[i].closest('.dock-item');
    const hasPopup = item && item.querySelector('.dock-popup');
    if (i !== activeButtonIdx() || hasPopup) {
      try { btns[i].click(); } catch (e) {}
    }
    coverBtn(nearest(curX));
    // клик слегка «выстреливает» иконку (увеличение)
    if (iconWrap) { iconWrap.classList.remove('lg-pop'); void iconWrap.offsetWidth; iconWrap.classList.add('lg-pop'); }
  }

  function localX(e) { const dr = dock.getBoundingClientRect(); return clamp(e.clientX - dr.left, centers()[0], centers()[btns.length - 1]); }

  function onDown(e) {
    if (!isLG() || !visible()) return;
    holding = true; dragging = true; moved = false; pendingClick = -1;
    dock.classList.add('lg-holding');
    targetX = localX(e);
    try { pill.setPointerCapture && pill.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
    kick();
  }
  function onMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const nx = localX(e);
    if (Math.abs(nx - targetX) > 1) moved = true;
    targetX = nx;
    kick();
  }
  function onUp() {
    if (!dragging) return;
    dragging = false; holding = false;
    dock.classList.remove('lg-holding');
    const i = nearest(targetX);          // снап к месту отпускания (а не к отстающей позиции pill)
    pendingClick = i;
    targetX = centers()[i];
    kick();
  }

  function positionToActive() {
    if (!pill || dragging || holding) return;
    const i = activeButtonIdx();
    activeIdx = i;
    const c = centers();
    if (!c.length || !c[i]) return;
    curX = targetX = c[i];
    cloneIcon(i); coverBtn(i); place();
  }

  function build() {
    if (built) { positionToActive(); return; }
    dock = document.querySelector('#main-dock .dock-container');
    if (!dock) return;
    btns = Array.from(dock.querySelectorAll('.dock-btn'));
    if (!btns.length) return;
    built = true;

    pill = el('lg-pill');
    iconWrap = el('lg-pill-icon');
    pill.appendChild(iconWrap);
    dock.appendChild(pill);

    pill.addEventListener('pointerdown', onDown);
    dock.addEventListener('pointerdown', (e) => { if (e.target !== pill && !pill.contains(e.target)) onDown(e); });
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('resize', positionToActive);

    // следим за сменой активного экрана (класс dock-active) → pill переезжает
    mo = new MutationObserver(() => positionToActive());
    btns.forEach(b => mo.observe(b, { attributes: true, attributeFilter: ['class'] }));

    // дождаться видимости дока (он display:none до входа) и спозиционировать
    if (visible()) positionToActive();
    else {
      vo = new MutationObserver(() => { if (visible()) { positionToActive(); } });
      const md = document.getElementById('main-dock');
      if (md) vo.observe(md, { attributes: true, attributeFilter: ['style', 'class'] });
    }
  }

  function teardown() {
    if (!built) return;
    built = false;
    if (mo) { mo.disconnect(); mo = null; }
    if (vo) { vo.disconnect(); vo = null; }
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('resize', positionToActive);
    if (pill) pill.remove();
    btns.forEach(b => iconEls(b).forEach(ic => ic.style.opacity = ''));
    pill = null; dock = null; btns = [];
  }

  function sync() { if (isLG()) build(); else teardown(); }
  window.lgDockSync = sync;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
})();
