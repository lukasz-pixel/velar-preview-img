(function () {
  const COLOR_CONTROL_SELECTOR = 'h-color-swatches-control[control-id="24"]';
  const MATERIAL_ROOT_SELECTOR = 'select-variant-option[option-id="27"]';

  const CANVAS_ID = 'my-fixed-preview-canvas';
  const BACKGROUND_FILL = '#fdf2e8';

  const COLOR_LAYER_MAP = {
    'Biel': 'https://res.cloudinary.com/wltazehk/image/upload/v1783882733/biale_transparentne_ymhkpb.png',
    'Czerwień': 'https://res.cloudinary.com/wltazehk/image/upload/v1783882734/czerwone_transparentne_hrnqqp.png',
    'Jasny róż': 'https://res.cloudinary.com/wltazehk/image/upload/v1783882733/rozowe_transparentne_bkrf9j.png',
    'Szmaragd': 'https://res.cloudinary.com/wltazehk/image/upload/v1783882733/zielone_transparentne_pf02xd.png'
  };

  const MATERIAL_LAYER_MAP = {
    'Pudrowe kwiaty': 'https://res.cloudinary.com/wltazehk/image/upload/v1783882733/materac_pudroweKwiaty_cn6qtk.png',
    'Misiowa krateczka': 'https://res.cloudinary.com/wltazehk/image/upload/v1783882732/materac_misiowaKrateczka_y4lgis.png',
    'Misiowe marzenie': 'https://res.cloudinary.com/wltazehk/image/upload/v1783882732/materac_misioweMarzenie_dymabq.png'
    // 'Cytrynowy sad': TODO — no confirmed asset yet
  };

  // ---------- DOM lookups (unchanged logic from your version) ----------

  function getActiveSlide() {
    return document.querySelector('.splide__slide.is-active.is-visible')
      || document.querySelector('.splide__slide.is-active')
      || document.querySelector('.splide__slide');
  }

  function getMainImage() {
    return getActiveSlide()?.querySelector('img.product-gallery__main-image') || null;
  }

  function getSelectedColor() {
    const control = document.querySelector(COLOR_CONTROL_SELECTOR);
    if (!control) return null;
    return control.querySelector('h-color-item[selected], h-color-item[aria-checked="true"]');
  }

  function getColorOverlayUrl() {
    const selected = getSelectedColor();
    if (!selected) return null;
    const name = selected.getAttribute('data-option-name')?.trim();
    return COLOR_LAYER_MAP[name] || null;
  }

  function getSelectedMaterialName() {
    const root = document.querySelector(MATERIAL_ROOT_SELECTOR);
    if (!root) return null;

    const selectors = [
      '.select-toggler__name',
      '#value-label',
      '[id="value-label"]',
      '.select-toggler__values',
      '.select-toggler__layout'
    ];

    for (const selector of selectors) {
      const text = root.querySelector(selector)?.textContent?.trim();
      if (text) return text;
    }

    const fallbackText = root.textContent?.trim() || null;
    if (!fallbackText) return null;

    const materialNames = Object.keys(MATERIAL_LAYER_MAP);
    return materialNames.find(name => fallbackText.includes(name)) || null;
  }

  // No material overlay until the user has actually interacted with the
  // material control at least once — even if it starts with some default
  // option selected, we don't want to render it unprompted.
  let materialSelectedByUser = false;

  function getMaterialOverlayUrl() {
    if (!materialSelectedByUser) return null;
    const materialName = getSelectedMaterialName();
    if (!materialName) return null;
    return MATERIAL_LAYER_MAP[materialName] || null;
  }

  // ---------- Image cache (avoid re-downloading on every redraw) ----------

  const imageCache = new Map();
  function loadImage(url) {
    if (imageCache.has(url)) return imageCache.get(url);
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load ' + url));
      img.src = url;
    });
    imageCache.set(url, promise);
    return promise;
  }

  // Canvas has no object-fit — replicate contain/cover manually so the
  // overlay lines up with the main image the same way it used to.
  function drawImageWithFit(ctx, img, cw, ch, fit) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) {
      ctx.drawImage(img, 0, 0, cw, ch);
      return;
    }
    const scale = fit === 'cover' ? Math.max(cw / iw, ch / ih) : Math.min(cw / iw, ch / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  // ---------- Single canvas, positioned like the old fixed layers ----------

  let canvas = null;
  function getCanvas() {
    if (canvas && document.body.contains(canvas)) return canvas;
    canvas = document.createElement('canvas');
    canvas.id = CANVAS_ID;
    canvas.style.position = 'fixed';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '1100';
    canvas.style.display = 'none';
    document.body.appendChild(canvas);
    return canvas;
  }

  // Updates position/size to match the main image. Returns true if the
  // backing pixel size changed (meaning content needs to be redrawn).
  function positionCanvas(rect) {
    const cv = getCanvas();
    cv.style.left = rect.left + 'px';
    cv.style.top = rect.top + 'px';
    cv.style.width = rect.width + 'px';
    cv.style.height = rect.height + 'px';

    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);

    if (cv.width !== targetW || cv.height !== targetH) {
      cv.width = targetW;
      cv.height = targetH;
      return true;
    }
    return false;
  }

  let lastState = null; // { signature, colorUrl, materialUrl }

  async function draw(rect, mainImage, colorUrl, materialUrl) {
    const cv = getCanvas();
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.fillStyle = BACKGROUND_FILL;
    ctx.fillRect(0, 0, rect.width, rect.height);

    const fit = getComputedStyle(mainImage).objectFit || 'contain';

    try {
      if (colorUrl) {
        const img = await loadImage(colorUrl);
        drawImageWithFit(ctx, img, rect.width, rect.height, fit);
        console.log('Color overlay drawn:', colorUrl);
      }
      if (materialUrl) {
        const img = await loadImage(materialUrl);
        drawImageWithFit(ctx, img, rect.width, rect.height, fit);
        console.log('Material overlay drawn:', materialUrl);
      } else {
        console.log('No material overlay found for selected material name');
      }
      cv.style.display = 'block';
    } catch (err) {
      console.log('Preview overlay image failed to load:', err);
    }
  }

  // Cheap path: only re-syncs position/size on scroll/resize. Only redraws
  // pixel content if the backing canvas size actually changed.
  function reposition() {
    const mainImage = getMainImage();
    if (!mainImage) {
      if (canvas) canvas.style.display = 'none';
      return;
    }
    const rect = mainImage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const sizeChanged = positionCanvas(rect);
    if (sizeChanged && lastState) {
      draw(rect, mainImage, lastState.colorUrl, lastState.materialUrl);
    }
  }

  // Expensive path: recomputes selected color/material and redraws — but
  // only if the selection actually changed since the last render.
  function renderIfChanged() {
    const mainImage = getMainImage();
    if (!mainImage) {
      console.log('No mainImage');
      if (canvas) canvas.style.display = 'none';
      return;
    }

    const rect = mainImage.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      console.log('Image rect empty');
      return;
    }

    const colorUrl = getColorOverlayUrl();
    const materialUrl = getMaterialOverlayUrl();
    const signature = colorUrl + '|' + materialUrl;

    if (lastState && lastState.signature === signature) {
      reposition(); // selection unchanged — just keep it glued in place
      return;
    }

    lastState = { signature, colorUrl, materialUrl };
    positionCanvas(rect);
    draw(rect, mainImage, colorUrl, materialUrl);
  }

  // ---------- Event wiring ----------

  let renderTimer = null;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderIfChanged, 80);
  }

  // Position updates just move the canvas via style.left/top — cheap, so
  // this tracks continuously during scroll (one update per frame) instead
  // of debouncing, which is what caused the "snap after scroll stops" lag.
  let positionScheduled = false;
  function schedulePosition() {
    if (positionScheduled) return;
    positionScheduled = true;
    requestAnimationFrame(() => {
      positionScheduled = false;
      reposition();
    });
  }

  // Only fire a full render when the click/change actually happened inside
  // the color swatches control or the material select control — not on
  // every click anywhere on the page.
  function isColorTarget(target) {
    return !!target.closest?.(COLOR_CONTROL_SELECTOR);
  }

  function isMaterialTarget(target) {
    return !!target.closest?.(MATERIAL_ROOT_SELECTOR);
  }

  function handleControlEvent(e) {
    if (isMaterialTarget(e.target)) {
      materialSelectedByUser = true;
      scheduleRender();
    } else if (isColorTarget(e.target)) {
      scheduleRender();
    }
  }

  document.addEventListener('click', handleControlEvent, true);
  document.addEventListener('change', handleControlEvent, true);
  document.addEventListener('input', handleControlEvent, true);

  // Resize/scroll only need to keep the canvas glued to the image; they
  // don't imply a new color/material selection.
  window.addEventListener('resize', schedulePosition);
  window.addEventListener('scroll', schedulePosition, true);

  window.addEventListener('load', renderIfChanged);
  renderIfChanged();
})();
