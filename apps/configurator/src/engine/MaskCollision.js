// Alpha-Masken und Kollisionsprüfung basierend auf PNG-Transparenz
import { OUTLINE_COLOR, MASK_ALPHA_THRESHOLD, COLLISION_SAMPLE_MIN_STEP, OUTLINE_FILL_HOLES } from "../settings.js";

export function createOffscreenCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

export async function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export function computeMaskFromImage(img, alphaThreshold = MASK_ALPHA_THRESHOLD) {
  const c = createOffscreenCanvas(img.naturalWidth, img.naturalHeight);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);

  // Ermittele enge Umgrenzung (tight bounds) nur entlang der tatsächlich opaken Pixel
  const w = c.width, h = c.height;
  const src = data.data;
  const thr = Math.max(1, alphaThreshold || 1);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = src[(y * w + x) * 4 + 3];
      if (a >= thr) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  // Falls keine opaken Pixel vorhanden sind, fallback: gesamte Bildfläche
  if (maxX < 0 || maxY < 0) { minX = 0; minY = 0; maxX = w - 1; maxY = h - 1; }
  const tightWidth = Math.max(1, (maxX - minX + 1));
  const tightHeight = Math.max(1, (maxY - minY + 1));
  const tightCenterX = (minX + maxX) / 2;
  const tightCenterY = (minY + maxY) / 2;
  // Offset des Tight-Zentrums relativ zum Bildmittelpunkt (in lokalen Pixelkoordinaten)
  const imgCenterX = w / 2;
  const imgCenterY = h / 2;
  const centerOffsetX = tightCenterX - imgCenterX;
  const centerOffsetY = tightCenterY - imgCenterY;

  return {
    width: w,
    height: h,
    data,
    alphaThreshold,
    tight: {
      minX, minY, maxX, maxY,
      width: tightWidth,
      height: tightHeight,
      centerOffsetX,
      centerOffsetY
    }
  };
}

// Erstellt eine getönte Version des Bildes (volle Deckkraft, Form via Alpha der PNG)
export function tintImage(img, color) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = createOffscreenCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.clearRect(0,0,w,h);
  // Bild zeichnen, dann Farbe per source-in anwenden
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

// Erzeugt eine binäre Dilatation der Alpha-Maske um radiusPx mit kreisförmigem Structuring-Element (Disk).
// Liefert eine vergrößerte Maske (w+2r x h+2r), damit die Kontur über das PNG hinaus nicht abgeschnitten wird.
export function dilateMask(mask, radiusPx) {
  const w = mask.width, h = mask.height;
  const src = mask.data.data; // Uint8ClampedArray RGBA
  const r = Math.max(0, Math.floor(radiusPx || 0));
  const w2 = w + 2 * r, h2 = h + 2 * r;
  // Binäre Ausgangsmaske
  const inBin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4 + 3;
      if (src[i] >= (mask.alphaThreshold || 1)) inBin[y * w + x] = 1;
    }
  }
  const outBin = new Uint8Array(w2 * h2);
  if (r === 0) {
    // direkt zentriert kopieren
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        outBin[(y + r) * w2 + (x + r)] = inBin[y * w + x];
      }
    }
  } else {
    // Kreis-Kernel vorbereiten
    const kernel = [];
    const rr = r * r;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= rr) kernel.push([dx, dy]);
      }
    }
    // Dilation: für jedes Quellpixel, das 1 ist, alle Kernel-Offsets setzen
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!inBin[y * w + x]) continue;
        const cx = x + r, cy = y + r;
        for (let k = 0; k < kernel.length; k++) {
          const dx = kernel[k][0], dy = kernel[k][1];
          const tx = cx + dx, ty = cy + dy;
          if (tx >= 0 && ty >= 0 && tx < w2 && ty < h2) outBin[ty * w2 + tx] = 1;
        }
      }
    }
  }
  const out = new ImageData(w2, h2);
  for (let i = 0; i < w2 * h2; i++) { const a = outBin[i] ? 255 : 0; const j = i * 4; out.data[j] = 0; out.data[j+1] = 0; out.data[j+2] = 0; out.data[j+3] = a; }
  return { width: w2, height: h2, data: out, alphaThreshold: 1 };
}

// Erosion mit kreisförmigem Structuring-Element (Disk): behält nur Pixel, deren gesamte Nachbarschaft im Radius r innerhalb der Maske liegt.
export function erodeMask(mask, radiusPx) {
  const w = mask.width, h = mask.height;
  const src = mask.data.data; // Uint8ClampedArray RGBA
  const r = Math.max(0, Math.floor(radiusPx || 0));
  const inBin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4 + 3;
      if (src[i] >= (mask.alphaThreshold || 1)) inBin[y * w + x] = 1;
    }
  }
  if (r === 0) {
    const out0 = new ImageData(w, h);
    for (let i = 0; i < w * h; i++) { const a = inBin[i] ? 255 : 0; const j = i * 4; out0.data[j] = 0; out0.data[j+1] = 0; out0.data[j+2] = 0; out0.data[j+3] = a; }
    return { width: w, height: h, data: out0, alphaThreshold: 1 };
  }
  const rr = r * r;
  const outBin = new Uint8Array(w * h);
  // Erosion: Pixel bleibt nur erhalten, wenn alle Punkte im Kreis-Radius innerhalb sind
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ok = 1;
      // Frühabbruch: wenn Zentrum schon 0 ist, kann Ergebnis ebenfalls 0 sein
      if (!inBin[y * w + x]) { outBin[y * w + x] = 0; continue; }
      for (let dy = -r; dy <= r && ok; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) { ok = 0; break; }
        for (let dx = -r; dx <= r; dx++) {
          if (dx*dx + dy*dy > rr) continue;
          const xx = x + dx; if (xx < 0 || xx >= w) { ok = 0; break; }
          if (!inBin[yy * w + xx]) { ok = 0; break; }
        }
      }
      outBin[y * w + x] = ok ? 1 : 0;
    }
  }
  const out = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) { const a = outBin[i] ? 255 : 0; const j = i * 4; out.data[j] = 0; out.data[j+1] = 0; out.data[j+2] = 0; out.data[j+3] = a; }
  return { width: w, height: h, data: out, alphaThreshold: 1 };
}

// Färbt eine gegebene Alpha-Maske (ImageData) ein und liefert ein Canvas.
export function tintedCanvasFromAlpha(alphaImageData, color) {
  const w = alphaImageData.width, h = alphaImageData.height;
  const c = createOffscreenCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.putImageData(alphaImageData, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

// Füllt Löcher innerhalb einer binären Alpha-Maske.
// Idee: Flood-Fill der Hintergrund-Nullen vom Rand; alles, was nicht erreicht wird, ist ein "Loch" und wird gefüllt.
export function fillMaskHoles(mask) {
  const w = mask.width, h = mask.height;
  const src = mask.data.data; // RGBA
  const alphaThr = (mask.alphaThreshold || 1);
  // Binärmaske extrahieren
  const solid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4 + 3;
      if (src[i] >= alphaThr) solid[y * w + x] = 1; // 1 = Form
    }
  }
  // Besuchte Hintergrundpixel (0 = unbekannt, 1 = Hintergrund, 2 = Loch -> wird später 1)
  const bg = new Uint8Array(w * h);
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  let qh = 0, qt = 0;
  const push = (x, y) => { qx[qt] = x; qy[qt] = y; qt++; };
  const pop = () => { const x = qx[qh]; const y = qy[qh]; qh++; return [x, y]; };
  const markBg = (x, y) => { if (x<0||y<0||x>=w||y>=h) return; const idx = y*w+x; if (bg[idx]||solid[idx]) return; bg[idx] = 1; push(x,y); };
  // Starte Flood-Fill von allen Randpositionen, die Hintergrund (solid=0) sind
  for (let x = 0; x < w; x++) { markBg(x, 0); markBg(x, h-1); }
  for (let y = 0; y < h; y++) { markBg(0, y); markBg(w-1, y); }
  while (qh < qt) {
    const [x, y] = pop();
    const idx = y * w + x;
    // 4er-Nachbarschaft
    if (x > 0) markBg(x-1, y);
    if (x+1 < w) markBg(x+1, y);
    if (y > 0) markBg(x, y-1);
    if (y+1 < h) markBg(x, y+1);
  }
  // Erzeuge Ergebnis: alle Pixel, die nicht als Hintergrund markiert sind, gelten als Form (Löcher werden gefüllt)
  const out = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const isSolid = solid[i] || !bg[i];
    const a = isSolid ? 255 : 0;
    const j = i * 4; out.data[j] = 0; out.data[j+1] = 0; out.data[j+2] = 0; out.data[j+3] = a;
  }
  return { width: w, height: h, data: out, alphaThreshold: 1 };
}

// Erzeugt eine zentrierte Kontur mit Breite ~ 2*radiusPx (außen und innen),
// indem eine Dilatation minus eine Erosion der Grundmaske gebildet wird.
export function strokeBandFrom(baseMask, radiusPx) {
  // Vorverarbeitung: Löcher optional füllen, damit Konturen keine "Innenlöcher" erzeugen
  const filled = OUTLINE_FILL_HOLES ? fillMaskHoles(baseMask) : baseMask;
  // Konturband als Differenz einer runden (Disk) Dilatation minus Erosion
  const r = Math.max(0, Math.floor(radiusPx || 0));
  const dil = dilateMask(filled, r); // (w+2r) x (h+2r)
  const ero = erodeMask(filled, r);  // w x h
  const w2 = dil.width, h2 = dil.height;
  const w = filled.width, h = filled.height;
  const out = new ImageData(w2, h2);
  const srcDil = dil.data.data;
  const srcEro = ero.data.data;
  for (let y = 0; y < h2; y++) {
    for (let x = 0; x < w2; x++) {
      const i = (y * w2 + x) * 4 + 3;
      const aDil = srcDil[i] >= (dil.alphaThreshold || 1) ? 255 : 0;
      // Erodierte Alpha an korrespondierter Position (ohne Padding)
      const bx = x - r, by = y - r;
      let aEro = 0;
      if (bx >= 0 && by >= 0 && bx < w && by < h) {
        const j = (by * w + bx) * 4 + 3;
        aEro = srcEro[j] >= (ero.alphaThreshold || 1) ? 255 : 0;
      }
      const a = (aDil && !aEro) ? 255 : 0;
      out.data[i] = a;
    }
  }
  return { width: w2, height: h2, data: out, alphaThreshold: 1 };
}

// Liefert eine „solide“ Offset-Maske ohne Ring (keine Löcher):
// Basis ggf. lochfrei füllen, anschließend dilatieren. Ergebnis ist eine volle Silhouette.
export function solidOffsetFrom(baseMask, radiusPx) {
  const filled = OUTLINE_FILL_HOLES ? fillMaskHoles(baseMask) : baseMask;
  const r = Math.max(0, Math.floor(radiusPx || 0));
  // Reine Dilatation ergibt eine größere, volle Silhouette (inkl. Originalfläche)
  const dil = dilateMask(filled, r);
  return dil; // gleiche Struktur wie andere Maskenfunktionen
}

export function drawOutline(ctx, item, color = OUTLINE_COLOR, width = null) {
  ctx.save();
  ctx.translate(item.transform.x, item.transform.y);
  ctx.rotate((item.transform.rotation * Math.PI)/180);
  ctx.scale(item.transform.scale, item.transform.scale);
  ctx.strokeStyle = color;
  if (width != null) ctx.lineWidth = width; // Falls gesetzt, nutze explizite Breite
  if (item._img) {
    // Image item: use intrinsic image dimensions
    ctx.strokeRect(-0.5*item._img.width, -0.5*item._img.height, item._img.width, item._img.height);
  } else {
    // Text item: approximate bbox via measured text width and font size
    const fontSize = item.fontSize || 16;
    const fontFamily = item.fontFamily || 'Arial, sans-serif';
    ctx.font = `${fontSize}px ${fontFamily}`;
    const w = Math.max(1, ctx.measureText(String(item.text ?? '')).width);
    const h = fontSize;
    ctx.strokeRect(-0.5*w, -0.5*h, w, h);
  }
  ctx.restore();
}

function pointInLocal(item, gx, gy) {
  const { x, y, scale, rotation } = item.transform;
  const rad = (rotation*Math.PI)/180;
  const cos = Math.cos(-rad), sin = Math.sin(-rad);
  const dx = gx - x, dy = gy - y;
  const lx = (dx * cos - dy * sin) / scale;
  const ly = (dx * sin + dy * cos) / scale;
  return { lx: lx + item._img.width/2, ly: ly + item._img.height/2 };
}

export function hitTestImage(item, gx, gy) {
  // Benutzerinteraktion: Fläche ODER Kontur (falls vorhanden) treffen
  const { x, y, scale, rotation } = item.transform;
  const rad = (rotation*Math.PI)/180;
  const cos = Math.cos(-rad), sin = Math.sin(-rad);
  const dx = gx - x, dy = gy - y;
  const lx = (dx * cos - dy * sin) / scale; // lokale Pixelkoordinaten relativ zur Bildmitte
  const ly = (dx * sin + dy * cos) / scale;
  // 1) Test gegen Basismaske (Füllfläche)
  const m = item.mask;
  let mx = Math.floor(lx + m.width/2);
  let my = Math.floor(ly + m.height/2);
  if (mx >= 0 && my >= 0 && mx < m.width && my < m.height) {
    const i = (my * m.width + mx) * 4 + 3;
    if (m.data.data[i] >= (m.alphaThreshold || 1)) return true;
  }
  // 2) Falls vorhanden, zusätzlich gegen Konturband testen
  const ring = item._colMask; // kann Stroke-Band sein
  if (ring) {
    const rx = Math.floor(lx + ring.width/2);
    const ry = Math.floor(ly + ring.height/2);
    if (rx >= 0 && ry >= 0 && rx < ring.width && ry < ring.height) {
      const j = (ry * ring.width + rx) * 4 + 3;
      if (ring.data.data[j] >= (ring.alphaThreshold || 1)) return true;
    }
  }
  return false;
}

function orientedAABB(item) {
  // Nutze ggf. vorab berechneten Cache vom CanvasEngine
  if (item._aabbCache && typeof item._aabbCache.minX === 'number') {
    return { minX: item._aabbCache.minX, maxX: item._aabbCache.maxX, minY: item._aabbCache.minY, maxY: item._aabbCache.maxY };
  }
  // Fallback: lokal berechnen
  const extraPx = item._colMaskExtraPx || 0;
  const tight = item.mask?.tight;
  const localW = Math.max(1, (tight?.width ?? item._img.width) + 2 * extraPx);
  const localH = Math.max(1, (tight?.height ?? item._img.height) + 2 * extraPx);
  const offX = (tight?.centerOffsetX ?? 0) * item.transform.scale;
  const offY = (tight?.centerOffsetY ?? 0) * item.transform.scale;
  const w = localW * item.transform.scale;
  const h = localH * item.transform.scale;
  const rad = (item.transform.rotation * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const hw = w / 2, hh = h / 2;
  const cx = item.transform.x + offX * cos - offY * sin;
  const cy = item.transform.y + offX * sin + offY * cos;
  const corners = [
    { x: -hw, y: -hh },
    { x:  hw, y: -hh },
    { x:  hw, y:  hh },
    { x: -hw, y:  hh }
  ].map(p => ({
    x: cx + p.x * cos - p.y * sin,
    y: cy + p.x * sin + p.y * cos
  }));
  const xs = corners.map(c=>c.x), ys = corners.map(c=>c.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export function masksOverlap(a, b, sampleStep) {
  // 1) Schneller AABB-Reject
  const A = orientedAABB(a);
  const B = orientedAABB(b);
  if (A.maxX < B.minX || B.maxX < A.minX || A.maxY < B.minY || B.maxY < A.minY) return false;

  // 2) Sampling-basierte Alpha-Maskenprüfung (aus Sicht von a)
  const ma = a._colMask || a.mask;
  const mb = b._colMask || b.mask;
  const aw = ma.width, ah = ma.height;
  const rad = (a.transform.rotation * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const step = Math.max(COLLISION_SAMPLE_MIN_STEP, sampleStep || Math.max(1, Math.round(1 / Math.max(0.001, a.transform.scale))))
  for (let y = 0; y < ah; y += step) {
    for (let x = 0; x < aw; x += step) {
      const i = (y*aw + x)*4 + 3;
      if (ma.data.data[i] < (ma.alphaThreshold || 1)) continue;
      const lx = (x - aw/2) * a.transform.scale;
      const ly = (y - ah/2) * a.transform.scale;
      const gx = a.transform.x + lx * cos - ly * sin;
      const gy = a.transform.y + lx * sin + ly * cos;
      // Direkter Test auf b mit dessen effektiver Maske (ohne Clipping durch Originalgröße)
      const brad = (b.transform.rotation * Math.PI) / 180;
      const bcos = Math.cos(-brad), bsin = Math.sin(-brad);
      const bdx = gx - b.transform.x, bdy = gy - b.transform.y;
      const blx = (bdx * bcos - bdy * bsin) / b.transform.scale;
      const bly = (bdx * bsin + bdy * bcos) / b.transform.scale;
      const bx = Math.floor(blx + mb.width/2);
      const by = Math.floor(bly + mb.height/2);
      if (bx >= 0 && by >= 0 && bx < mb.width && by < mb.height) {
        const j = (by * mb.width + bx) * 4 + 3;
        if (mb.data.data[j] >= (mb.alphaThreshold || 1)) return true;
      }
    }
  }
  return false;
}
