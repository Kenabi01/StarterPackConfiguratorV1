// Client-side PNG splitting by alpha-connected components
// Exports: clientSplitPng(dataUrl, options?) -> [{ id, url }]
// Uses MASK_ALPHA_THRESHOLD from settings for default alpha cutoff.

import { MASK_ALPHA_THRESHOLD } from "../settings.js";

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export async function clientSplitPng(dataUrl, options = {}) {
  const alphaThreshold = options.alphaThreshold ?? MASK_ALPHA_THRESHOLD;
  const minPixels = options.minPixels ?? 250; // ignore tiny specks

  const img = await loadImageFromDataUrl(dataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return [];

  const src = document.createElement("canvas");
  src.width = w; src.height = h;
  const sctx = src.getContext("2d");
  sctx.drawImage(img, 0, 0);
  const idata = sctx.getImageData(0, 0, w, h);
  const data = idata.data;

  // Label map: 0 = background/unvisited, >0 = component id
  const labels = new Uint32Array(w * h);
  let compId = 0;

  const inBounds = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const aAt = (x, y) => data[(y * w + x) * 4 + 3];

  const components = [];

  // Flood fill (BFS) for each unvisited opaque pixel
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (labels[idx] !== 0) continue;
      if (aAt(x, y) < alphaThreshold) continue;

      // Start a new component
      compId += 1;
      let count = 0;
      let minX = x, minY = y, maxX = x, maxY = y;
      const qx = new Int32Array(w * h);
      const qy = new Int32Array(w * h);
      let qs = 0, qe = 0;
      qx[qe] = x; qy[qe] = y; qe++;
      labels[idx] = compId;

      while (qs < qe) {
        const cx = qx[qs];
        const cy = qy[qs];
        qs++;
        count++;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;

        // 4-neighborhood
        const nx = cx + 1; if (inBounds(nx, cy)) {
          const nIdx = cy * w + nx;
          if (labels[nIdx] === 0 && aAt(nx, cy) >= alphaThreshold) { labels[nIdx] = compId; qx[qe] = nx; qy[qe] = cy; qe++; }
        }
        const px = cx - 1; if (inBounds(px, cy)) {
          const nIdx = cy * w + px;
          if (labels[nIdx] === 0 && aAt(px, cy) >= alphaThreshold) { labels[nIdx] = compId; qx[qe] = px; qy[qe] = cy; qe++; }
        }
        const ny = cy + 1; if (inBounds(cx, ny)) {
          const nIdx = ny * w + cx;
          if (labels[nIdx] === 0 && aAt(cx, ny) >= alphaThreshold) { labels[nIdx] = compId; qx[qe] = cx; qy[qe] = ny; qe++; }
        }
        const py = cy - 1; if (inBounds(cx, py)) {
          const nIdx = py * w + cx;
          if (labels[nIdx] === 0 && aAt(cx, py) >= alphaThreshold) { labels[nIdx] = compId; qx[qe] = cx; qy[qe] = py; qe++; }
        }
      }

      if (count >= minPixels) {
        components.push({ id: compId, minX, minY, maxX, maxY, count });
      } else {
        // Mark tiny component back to 0 to not extract it later
        for (let yy = minY; yy <= maxY; yy++) {
          for (let xx = minX; xx <= maxX; xx++) {
            const li = yy * w + xx;
            if (labels[li] === compId) labels[li] = 0;
          }
        }
        compId -= 1;
      }
    }
  }

  if (!components.length) return [];
  // Sort by size descending
  components.sort((a,b)=>b.count - a.count);

  const out = [];
  for (const c of components) {
    const cw = c.maxX - c.minX + 1;
    const ch = c.maxY - c.minY + 1;
    const can = document.createElement("canvas");
    can.width = cw; can.height = ch;
    const ctx = can.getContext("2d");
    const part = ctx.createImageData(cw, ch);
    const pd = part.data;
    for (let yy = 0; yy < ch; yy++) {
      for (let xx = 0; xx < cw; xx++) {
        const sx = c.minX + xx;
        const sy = c.minY + yy;
        const sIdx = sy * w + sx;
        if (labels[sIdx] === c.id) {
          const si = sIdx * 4;
          const di = (yy * cw + xx) * 4;
          pd[di    ] = data[si    ];
          pd[di + 1] = data[si + 1];
          pd[di + 2] = data[si + 2];
          pd[di + 3] = data[si + 3];
        }
        // else leave transparent
      }
    }
    ctx.putImageData(part, 0, 0);
    out.push({ id: `split_${Date.now().toString(36)}_${c.id}`, url: can.toDataURL("image/png") });
  }
  return out;
}

