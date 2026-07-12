(function () {
  const COLOR_CONTROL_SELECTOR = 'h-color-swatches-control[control-id="24"]';
  const MATERIAL_ROOT_SELECTOR = 'select-variant-option[option-id="27"]';

  const CANVAS_ID = 'my-fixed-preview-canvas';
  const BACKGROUND_COLOR = '#fdf2e8';
  const CANVAS_Z_INDEX = 1100;

  // Filenames confirm these map to color NAMES, not the 1/2/3/4 ids from
  // the earlier version — biale=white=Biel, czerwone=red=Czerwień,
  // rozowe=pink=Jasny róż, zielone=green=Szmaragd.
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

  const imageCache = new Map(); // url -> Promise<HTMLImageElement>

  function loadImage(url) {
    if (imageCache.has(url)) return imageCache.get(url);
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    imageCache.set(url, promise);
    return promise;
  }

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

  function getSelectedColorName() {
    return getSelectedColor()?.getAttribute('data-option-name')?.trim() || null;
  }

  function getColorOverlayUrl(colorName) {
    if (!colorName) return null;
    return COLOR_LAYER_MAP[colorName] || null;
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

    const fallbackText = root.textContent?.trim();
    if (!fallbackText) return null;

    const materialNames = Object.keys(MATERIAL_LAYER_MAP);
    return materialNames.find(name => fallbackText.includes(name)) || null;
  }

  function getMaterialOverlayUrl(materialName) {
    if (!materialName) return null;
    return MATERIAL_LAYER_MAP[materialName] || null;
  }

  // --- canvas compositing -----------------------------------------------

  function getOrCreateCanvas() {
    let canvas = document.getElementById(CANVAS_ID);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = CANVAS_ID;
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.position = 'fixed';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = String(CANVAS_Z_INDEX);
      canvas.style.display = 'none';
      document.body.appendChild(canvas);
    }
    return canvas;
  }

  function positionCanvas(canvas, rect) {
    canvas.style.left = rect.left + 'px';
    canvas.style.top = rect.top + 'px';
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.max(1, Math.round(rect.width * dpr));
    const targetHeight = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
  }

  function parsePositionComponent(token, boxSize, drawSize) {
    switch (token) {
      case 'left':
      case 'top':
        return 0;
      case 'right':
      case 'bottom':
        return boxSize - drawSize;
      case 'center':
        return (boxSize - drawSize) / 2;
      default:
        if (token && token.endsWith('%')) {
          const pct = parseFloat(token) / 100;
          return (boxSize - drawSize) * pct;
        }
        if (token && token.endsWith('px')) {
          return parseFloat(token);
        }
        return (boxSize - drawSize) / 2;
    }
  }

  function drawWithObjectFit(ctx, img, boxWidth, boxHeight, fit, position) {
    let drawWidth;
    let drawHeight;

    switch (fit) {
      case 'cover': {
        const scale = Math.max(boxWidth / img.width, boxHeight / img.height);
        drawWidth = img.width * scale;
        drawHeight = img.height * scale;
        break;
      }
      case 'fill':
        drawWidth = boxWidth;
        drawHeight = boxHeight;
        break;
      case 'none':
        drawWidth = img.width;
        drawHeight = img.height;
        break;
      case 'contain':
      default: {
        const scale = Math.min(boxWidth / img.width, boxHeight / img.height);
        drawWidth = img.width * scale;
        drawHeight = img.height * scale;
      }
    }

    if (fit === 'fill') {
      ctx.drawImage(img, 0, 0, drawWidth, drawHeight);
      return;
    }

    const [posX, posY] = (position || 'center center').split(/\s+/);
    const dx = parsePositionComponent(posX, boxWidth, drawWidth);
    const dy = parsePositionComponent(posY, boxHeight, drawHeight);
    ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
  }

  let renderToken = 0;

  async function paint(mainImage, rect) {
    const canvas = getOrCreateCanvas();
    positionCanvas(canvas, rect);

    const colorName = getSelectedColorName();
    const materialName = getSelectedMaterialName();
    const colorOverlayUrl = getColorOverlayUrl(colorName);
    const materialOverlayUrl = getMaterialOverlayUrl(materialName);

    const token = ++renderToken;
    const [colorImg, materialImg] = await Promise.all([
      colorOverlayUrl ? loadImage(colorOverlayUrl).catch(() => null) : Promise.resolve(null),
      materialOverlayUrl ? loadImage(materialOverlayUrl).catch(() => null) : Promise.resolve(null)
    ]);

    // A newer render started while these images were loading — drop this one.
    if (token !== renderToken) return;

    const ctx = canvas.getContext('2d');
    const fit = getComputedStyle(mainImage).objectFit || 'contain';
    const position = getComputedStyle(mainImage).objectPosition || 'center center';

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (colorImg) drawWithObjectFit(ctx, colorImg, canvas.width, canvas.height, fit, position);
    if (materialImg) drawWithObjectFit(ctx, materialImg, canvas.width, canvas.height, fit, position);

    canvas.style.display = 'block';
  }

  function render() {
    const mainImage = getMainImage();
    if (!mainImage) {
      document.getElementById(CANVAS_ID)?.style.setProperty('display', 'none');
      return;
    }

    const rect = mainImage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    paint(mainImage, rect);
  }

  function reposition() {
    const mainImage = getMainImage();
    const canvas = document.getElementById(CANVAS_ID);
    if (!mainImage || !canvas) return;

    const rect = mainImage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    positionCanvas(canvas, rect);
  }

  // --- trigger only on an actual color/material selection change --------

  let lastColorName = null;
  let lastMaterialName = null;

  function captureSelectionBaseline() {
    lastColorName = getSelectedColorName();
    lastMaterialName = getSelectedMaterialName();
  }

  function selectionChanged() {
    const colorName = getSelectedColorName();
    const materialName = getSelectedMaterialName();
    const changed = colorName !== lastColorName || materialName !== lastMaterialName;
    lastColorName = colorName;
    lastMaterialName = materialName;
    return changed;
  }

  function isWithinTrackedControls(target) {
    if (!(target instanceof Element)) return false;
    return !!(target.closest(COLOR_CONTROL_SELECTOR) || target.closest(MATERIAL_ROOT_SELECTOR));
  }

  let debounceTimer = null;
  function scheduleRenderIfSelectionChanged() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (selectionChanged()) render();
    }, 80);
  }

  function onDelegatedEvent(event) {
    if (isWithinTrackedControls(event.target)) {
      scheduleRenderIfSelectionChanged();
    }
  }

  // Backstop for frameworks that flip [selected]/[aria-checked] or swap
  // label text without the change reaching a click/change listener.
  let controlsObserver = null;
  function ensureControlsObserved() {
    const colorControl = document.querySelector(COLOR_CONTROL_SELECTOR);
    const materialRoot = document.querySelector(MATERIAL_ROOT_SELECTOR);
    if (!colorControl && !materialRoot) return;

    if (!controlsObserver) {
      controlsObserver = new MutationObserver(() => scheduleRenderIfSelectionChanged());
    }

    const options = { attributes: true, attributeFilter: ['selected', 'aria-checked', 'class'], childList: true, subtree: true, characterData: true };
    if (colorControl) controlsObserver.observe(colorControl, options);
    if (materialRoot) controlsObserver.observe(materialRoot, options);
  }

  let repositionScheduled = false;
  function scheduleReposition() {
    if (repositionScheduled) return;
    repositionScheduled = true;
    requestAnimationFrame(() => {
      repositionScheduled = false;
      reposition();
    });
  }

  document.addEventListener('click', (e) => { onDelegatedEvent(e); ensureControlsObserved(); }, true);
  document.addEventListener('change', (e) => { onDelegatedEvent(e); ensureControlsObserved(); }, true);
  window.addEventListener('resize', scheduleReposition);
  window.addEventListener('scroll', scheduleReposition, true);
  window.addEventListener('load', () => {
    captureSelectionBaseline();
    ensureControlsObserved();
    render();
  });

  captureSelectionBaseline();
  ensureControlsObserved();
  render();
})();
