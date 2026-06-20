/* ============================================================
   Liquid Glass dock — полный перенос образца «dock liquid glass».
   Canvas-иконки + перетаскиваемый pill с лупой (бочкообразная дисторсия +
   хроматическая аберрация), снап к месту отпускания, попап при оседании.
   Активен только в теме liquid-glass; навигация/попапы — штатные кнопки дока.
   ============================================================ */
(function () {
  'use strict';

  const isLG = () => document.body.classList.contains('liquid-glass');
  const DPR = Math.min(window.devicePixelRatio || 1, 3);
  const SS = 2;                          // суперсэмплинг лупы
  const ICON_PADV = 30, ICON_PADH = 40;  // запас источника для лупы

  let dock = null, btns = [], wrap = null, iconLayer = null, iconCtx = null;
  let pill = null, lens = null, lensCtx = null;
  let srcCanvas = null, srcCtx = null;
  let built = false, mo = null, vo = null, raf = 0;

  let N = 0, layout = [], ICON = 24, PILL_IDLE = 42, PILL_HELD = 48;
  let pillX = 0, targetX = 0, holding = false, gliding = false, pressIdx = -1, activeIdx = 0;
  const iconImg = [];
  let popupEl = null, popupIdx = -1, lastSettled = -1;

  const el = (t, c) => { const d = document.createElement(t); if (c) d.className = c; return d; };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function visible() {
    const md = document.getElementById('main-dock');
    if (!md || getComputedStyle(md).display === 'none') return false;
    return !!dock && dock.getBoundingClientRect().width > 4;
  }

  /* ---------- источники иконок (img.app-icon или сериализованный svg) ---------- */
  function iconSrc(btn) {
    const img = btn.querySelector('img.app-icon');
    if (img && img.getAttribute('src')) return img.getAttribute('src');
    const svg = btn.querySelector('svg');
    if (svg) {
      const s = svg.cloneNode(true);
      s.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      s.setAttribute('width', '32'); s.setAttribute('height', '32');
      // .dock-btn svg{fill:none;stroke:currentColor} живёт во внешнем CSS — запекаем в сам svg
      s.setAttribute('style', 'fill:none;stroke:#2b2e38;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round');
      const xml = new XMLSerializer().serializeToString(s);
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    }
    return '';
  }
  function loadIcons() {
    btns.forEach((b, i) => {
      const im = new Image();
      im.onload = () => { drawSource(); drawIconLayer(); drawLensRest(); };
      im.src = iconSrc(b);
      iconImg[i] = im;
    });
  }
  function drawIcon(ctx, i, cx, cy, size, shadow) {
    const im = iconImg[i];
    if (!im || !im.complete || !im.naturalWidth) return;
    if (shadow) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.26)'; ctx.shadowBlur = size * 0.2; ctx.shadowOffsetY = size * 0.08;
      ctx.drawImage(im, cx - size / 2, cy - size / 2, size, size);
      ctx.restore();
    } else {
      ctx.drawImage(im, cx - size / 2, cy - size / 2, size, size);
    }
  }

  /* ---------- геометрия ---------- */
  function computeLayout() {
    const dr = dock.getBoundingClientRect();
    layout = btns.map(b => { const r = b.getBoundingClientRect(); return { cx: r.left - dr.left + r.width / 2, cy: dr.height / 2 }; });
    N = layout.length;
    const h = dr.height;
    PILL_HELD = Math.round(h * 0.78);
    PILL_IDLE = Math.round(PILL_HELD * 0.92);
    ICON = Math.round(PILL_IDLE * 0.74);
  }
  function iconCX(i) { return layout[i] ? layout[i].cx : 0; }
  function nearest(x) { let bi = 0, bd = Infinity; layout.forEach((p, i) => { const d = Math.abs(p.cx - x); if (d < bd) { bd = d; bi = i; } }); return bi; }
  function clampX(x) { return layout.length ? clamp(x, iconCX(0), iconCX(N - 1)) : x; }
  function activeButtonIdx() { const i = btns.findIndex(b => b.classList.contains('dock-active')); return i < 0 ? 0 : i; }

  /* ---------- источник для лупы (полный, без дырки) ---------- */
  function drawSource() {
    if (!dock) return;
    const dr = dock.getBoundingClientRect();
    const w = dr.width, h = dr.height;
    const SRC = DPR * 2;
    srcCanvas.width = Math.round((w + ICON_PADH * 2) * SRC);
    srcCanvas.height = Math.round((h + ICON_PADV * 2) * SRC);
    srcCtx.setTransform(SRC, 0, 0, SRC, 0, 0);
    srcCtx.imageSmoothingEnabled = true; srcCtx.imageSmoothingQuality = 'high';
    srcCtx.clearRect(0, 0, w + ICON_PADH * 2, h + ICON_PADV * 2);
    layout.forEach((p, i) => drawIcon(srcCtx, i, p.cx + ICON_PADH, p.cy + ICON_PADV, ICON));
  }

  /* ---------- видимый слой иконок (+ дырка под лупой при активной лупе) ---------- */
  function drawIconLayer() {
    if (!dock) return;
    const dr = dock.getBoundingClientRect();
    const w = dr.width, h = dr.height;
    if (iconLayer.width !== Math.round(w * DPR) || iconLayer.height !== Math.round(h * DPR)) {
      iconLayer.width = Math.round(w * DPR); iconLayer.height = Math.round(h * DPR);
      iconLayer.style.width = w + 'px'; iconLayer.style.height = h + 'px';
    }
    iconCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
    iconCtx.clearRect(0, 0, w, h);
    layout.forEach((p, i) => drawIcon(iconCtx, i, p.cx, p.cy, ICON, true));
    // дырку под pill вырезаем ВСЕГДА — её заполняет лупа (в покое — чёткая иконка,
    // не размытая backdrop-blur'ом стекла)
    const r = pill.getBoundingClientRect();
    const cx = (r.left - dr.left) + r.width / 2, cy = (r.top - dr.top) + r.height / 2;
    iconCtx.globalCompositeOperation = 'destination-out';
    roundRect(iconCtx, cx - r.width / 2, cy - r.height / 2, r.width, r.height, Math.round(Math.min(r.width, r.height) * 0.26));
    iconCtx.fill();
    iconCtx.globalCompositeOperation = 'source-over';
  }
  // чёткая иконка 1:1 в покое (без искажений и блюра стекла)
  function drawLensRest() {
    if (!lens || !lensCtx) return;
    const { w, h } = sizeLens();
    lensCtx.setTransform(SS, 0, 0, SS, 0, 0);
    lensCtx.clearRect(0, 0, w, h);
    drawIcon(lensCtx, nearest(pillX), w / 2, h / 2, ICON);
  }

  /* ---------- лупа (бочка + хром. аберрация), порт образца ---------- */
  function sizeLens() {
    const pr = pill.getBoundingClientRect();
    const w = pr.width, h = pr.height;
    lens.width = Math.round(w * SS); lens.height = Math.round(h * SS);
    lens.style.width = w + 'px'; lens.style.height = h + 'px';
    return { w, h };
  }
  function drawLens() {                  // вызывается только при удержании/проезде (лупа активна)
    const { w, h } = sizeLens();
    const cx = w / 2, cy = h / 2;
    const radius = Math.sqrt(w * w + h * h) / 2;
    drawSource();
    const dr = dock.getBoundingClientRect();
    const off = Math.abs(pillX - iconCX(nearest(pillX)));
    const maxOff = Math.max(1, w * 0.6);
    const distortAmt = Math.max(0, Math.min(1, off / maxOff));
    const srcCX = pillX + ICON_PADH, srcCY = (dr.height / 2) + ICON_PADV;

    const img = lensCtx.createImageData(lens.width, lens.height);
    const data = img.data;
    const SRC = DPR * 2, pad = 8;
    const bw = Math.ceil(w + pad * 2), bh = Math.ceil(h + pad * 2);
    const rawSX = (srcCX - w / 2 - pad) * SRC, rawSY = (srcCY - h / 2 - pad) * SRC;
    const readX = Math.max(0, Math.min(srcCanvas.width - 1, Math.round(rawSX)));
    const readY = Math.max(0, Math.min(srcCanvas.height - 1, Math.round(rawSY)));
    let sample;
    try {
      sample = srcCtx.getImageData(readX, readY,
        Math.min(srcCanvas.width - readX, Math.round(bw * SRC)),
        Math.min(srcCanvas.height - readY, Math.round(bh * SRC)));
    } catch (e) { return; }
    const sData = sample.data, sW = sample.width, sH = sample.height;
    const offX = rawSX - readX, offY = rawSY - readY;
    function samp(fx, fy, ch) {
      const bx = (fx + pad) * SRC - offX, by = (fy + pad) * SRC - offY;
      const x0 = Math.floor(bx), y0 = Math.floor(by), tx = bx - x0, ty = by - y0;
      const cx0 = Math.max(0, Math.min(sW - 1, x0)), cy0 = Math.max(0, Math.min(sH - 1, y0));
      const cx1 = Math.max(0, Math.min(sW - 1, x0 + 1)), cy1 = Math.max(0, Math.min(sH - 1, y0 + 1));
      const i00 = (cy0 * sW + cx0) * 4 + ch, i10 = (cy0 * sW + cx1) * 4 + ch;
      const i01 = (cy1 * sW + cx0) * 4 + ch, i11 = (cy1 * sW + cx1) * 4 + ch;
      const top = sData[i00] + (sData[i10] - sData[i00]) * tx;
      const bot = sData[i01] + (sData[i11] - sData[i01]) * tx;
      return top + (bot - top) * ty;
    }
    const wob = Math.sin(performance.now() * 0.002) * 0.6;
    const baseMag = 0.0579, barrel = 0.1879 + 0.273 * distortAmt, abAmt = 0.545 + 0.84 * distortAmt;
    for (let py = 0; py < lens.height; py++) {
      for (let px = 0; px < lens.width; px++) {
        const x = px / SS, y = py / SS;
        const dx = (x - cx) / radius, dy = (y - cy) / radius;
        let dist = Math.sqrt(dx * dx + dy * dy); if (dist > 1) dist = 1;
        const di = (py * lens.width + px) * 4;
        const distort = baseMag + barrel * dist * dist;
        const ox = cx + (x - cx) * (1 - distort), oy = cy + (y - cy) * (1 - distort);
        const ab = dist * abAmt * (1 + wob * 0.12), ax = dx * ab, ay = dy * ab;
        const r = samp(ox + ax, oy + ay, 0), g = samp(ox, oy, 1), b = samp(ox - ax, oy - ay, 2);
        const aR = samp(ox + ax, oy + ay, 3), aG = samp(ox, oy, 3), aB = samp(ox - ax, oy - ay, 3);
        let a = Math.max(aR, aG, aB);
        if (aG < 40 && (aR > 40 || aB > 40)) a *= 0.5;
        data[di] = r; data[di + 1] = g; data[di + 2] = b; data[di + 3] = a;
      }
    }
    lensCtx.setTransform(1, 0, 0, 1, 0, 0);
    lensCtx.putImageData(img, 0, 0);
  }

  /* ---------- pill ---------- */
  function placePill() {
    const w = (holding || gliding) ? PILL_HELD : PILL_IDLE;
    pill.style.width = w + 'px'; pill.style.height = w + 'px';
    pill.style.borderRadius = Math.round(w * 0.28) + 'px';
    pill.style.left = pillX + 'px'; pill.style.top = '50%';
  }

  /* ---------- попап ---------- */
  function appPopupFor(i) { const it = btns[i] && btns[i].closest('.dock-item'); return it ? it.querySelector('.dock-popup') : null; }
  function hidePopup() { if (popupEl) { popupEl.classList.remove('show'); } popupIdx = -1; }
  function showPopup(i) {
    const ap = appPopupFor(i);
    if (!ap) { hidePopup(); return; }
    if (popupIdx === i && popupEl.classList.contains('show')) return;
    popupIdx = i;
    popupEl.innerHTML = '';
    ap.querySelectorAll('.dock-popup-btn').forEach(srcBtn => {
      const it = el('div', 'lg-pop-item');
      it.textContent = srcBtn.textContent.trim();
      it.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
      it.addEventListener('click', (e) => { e.stopPropagation(); hidePopup(); lastSettled = -1; try { srcBtn.click(); } catch (_) {} });
      popupEl.appendChild(it);
    });
    popupEl.classList.add('show');
    // позиция: по центру слота, над доком
    const dr = dock.getBoundingClientRect();
    const pw = popupEl.offsetWidth, ph = popupEl.offsetHeight;
    let left = dr.left + iconCX(i) - pw / 2;
    left = Math.max(8, Math.min(window.innerWidth - pw - 8, left));
    popupEl.style.left = Math.round(left) + 'px';
    popupEl.style.top = Math.round(dr.top - ph - 8) + 'px';
  }

  /* ---------- интеракция ---------- */
  function localX(e) { const dr = dock.getBoundingClientRect(); return clampX(e.clientX - dr.left); }
  function onDown(e) {
    if (!isLG() || !visible()) return;
    holding = true; gliding = false; hidePopup();
    pressIdx = nearest(e.clientX - dock.getBoundingClientRect().left);
    targetX = clampX(iconCX(pressIdx));
    try { pill.setPointerCapture && pill.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
    kick();
  }
  function onMove(e) {
    if (!holding) return;
    e.preventDefault();
    targetX = localX(e);
    pressIdx = -1;                 // началось перетаскивание — не тап
    hidePopup();
    kick();
  }
  function onUp() {
    if (!holding) return;
    holding = false;
    const i = pressIdx >= 0 ? pressIdx : nearest(targetX);  // тап → тапнутая; ведение → ближайшая к месту отпускания
    targetX = clampX(iconCX(i));
    gliding = true;                // лупа продолжается на проезде
    kick();
  }

  function settle() {
    const i = nearest(pillX);
    if (Math.abs(iconCX(i) - pillX) >= 1) return;
    if (lastSettled === i) return;
    lastSettled = i;
    activeIdx = i;
    if (appPopupFor(i)) { showPopup(i); }
    else { hidePopup(); if (i !== activeButtonIdx()) { try { btns[i].click(); } catch (_) {} } }
  }

  function loop() {
    pillX += (targetX - pillX) * 0.35;
    if (gliding && Math.abs(targetX - pillX) < 0.6) { gliding = false; pillX = targetX; }
    const active = holding || gliding;
    dock.classList.toggle('lg-holding', active);
    placePill();
    drawIconLayer();
    if (active) drawLens(); else drawLensRest();
    if (!active) settle();
    if (active || Math.abs(targetX - pillX) > 0.4) raf = requestAnimationFrame(loop);
    else raf = 0;       // финальный кадр уже отрисовал чёткую иконку в покое
  }
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }

  function reflow() {
    if (!built || !visible()) return;
    computeLayout();
    if (!holding && !gliding) { const i = activeButtonIdx(); activeIdx = i; pillX = targetX = clampX(iconCX(i)); lastSettled = i; }
    drawSource(); drawIconLayer(); placePill(); drawLensRest();
  }

  function build() {
    if (built) { reflow(); return; }
    dock = document.querySelector('#main-dock .dock-container');
    if (!dock) return;
    btns = Array.from(dock.querySelectorAll('.dock-btn'));
    if (!btns.length) return;
    built = true;
    dock.classList.add('lg-dock');

    iconLayer = el('canvas', 'lg-icons'); dock.appendChild(iconLayer); iconCtx = iconLayer.getContext('2d');
    pill = el('div', 'lg-pill'); lens = el('canvas', 'lg-lens'); pill.appendChild(lens); dock.appendChild(pill); lensCtx = lens.getContext('2d');
    srcCanvas = document.createElement('canvas'); srcCtx = srcCanvas.getContext('2d');
    popupEl = el('div', 'lg-popup'); document.body.appendChild(popupEl);

    pill.addEventListener('pointerdown', onDown);
    dock.addEventListener('pointerdown', (e) => { if (e.target !== pill && !pill.contains(e.target)) onDown(e); });
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('resize', reflow);
    document.addEventListener('pointerdown', (e) => { if (popupIdx !== -1 && !popupEl.contains(e.target) && !dock.contains(e.target)) { hidePopup(); lastSettled = -1; } }, true);

    // наведение курсора на пункт дока → показать его попап (только мышь)
    if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
      let hoverHide = 0;
      const cancelHide = () => { clearTimeout(hoverHide); };
      const scheduleHide = () => { clearTimeout(hoverHide); hoverHide = setTimeout(hidePopup, 160); };
      btns.forEach((b, i) => b.addEventListener('mouseenter', () => {
        if (holding || gliding) return;
        cancelHide();
        if (appPopupFor(i)) showPopup(i); else hidePopup();
      }));
      dock.addEventListener('mouseleave', scheduleHide);
      dock.addEventListener('mouseenter', cancelHide);
      popupEl.addEventListener('mouseenter', cancelHide);
      popupEl.addEventListener('mouseleave', scheduleHide);
    }

    loadIcons();
    computeLayout();
    activeIdx = activeButtonIdx();
    pillX = targetX = clampX(iconCX(activeIdx));
    lastSettled = activeIdx;
    placePill();

    mo = new MutationObserver(() => { if (!holding && !gliding) { const i = activeButtonIdx(); if (i !== activeIdx) { activeIdx = i; targetX = clampX(iconCX(i)); lastSettled = i; kick(); } } });
    btns.forEach(b => mo.observe(b, { attributes: true, attributeFilter: ['class'] }));

    if (visible()) reflow();
    else { vo = new MutationObserver(() => { if (visible()) reflow(); }); const md = document.getElementById('main-dock'); if (md) vo.observe(md, { attributes: true, attributeFilter: ['style', 'class'] }); }
  }

  function teardown() {
    if (!built) return;
    built = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (mo) { mo.disconnect(); mo = null; }
    if (vo) { vo.disconnect(); vo = null; }
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('resize', reflow);
    if (dock) dock.classList.remove('lg-dock', 'lg-holding');
    [iconLayer, pill, popupEl].forEach(n => n && n.remove());
    iconLayer = pill = lens = popupEl = srcCanvas = null; dock = null; btns = [];
  }

  function sync() { if (isLG()) build(); else teardown(); }
  window.lgDockSync = sync;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
})();
