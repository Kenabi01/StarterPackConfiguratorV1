// Alpha-Masken und Kollisionsprüfung basierend auf PNG-Transparenz
import { OUTLINE_COLOR, MASK_ALPHA_THRESHOLD, COLLISION_SAMPLE_MIN_STEP } from "../settings.js";

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
  return { width: c.width, height: c.height, data, alphaThreshold };
}

export function drawOutline(ctx, item, color = OUTLINE_COLOR) {
  ctx.save();
  ctx.translate(item.transform.x, item.transform.y);
  ctx.rotate((item.transform.rotation * Math.PI)/180);
  ctx.scale(item.transform.scale, item.transform.scale);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
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
  const { lx, ly } = pointInLocal(item, gx, gy);
  const x = Math.floor(lx), y = Math.floor(ly);
  if (x < 0 || y < 0 || x >= item.mask.width || y >= item.mask.height) return false;
  const i = (y * item.mask.width + x) * 4 + 3;
  const a = item.mask.data.data[i];
  return a >= item.mask.alphaThreshold;
}

function orientedAABB(item) {
  // Axis-aligned bounding box of the rotated rectangle
  const w = item._img.width * item.transform.scale;
  const h = item._img.height * item.transform.scale;
  const rad = (item.transform.rotation * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const hw = w / 2, hh = h / 2;
  const corners = [
    { x: -hw, y: -hh },
    { x:  hw, y: -hh },
    { x:  hw, y:  hh },
    { x: -hw, y:  hh }
  ].map(p => ({
    x: item.transform.x + p.x * cos - p.y * sin,
    y: item.transform.y + p.x * sin + p.y * cos
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
  const aw = a.mask.width, ah = a.mask.height;
  const rad = (a.transform.rotation * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const step = Math.max(COLLISION_SAMPLE_MIN_STEP, sampleStep || Math.max(1, Math.round(1 / Math.max(0.001, a.transform.scale))))
  for (let y = 0; y < ah; y += step) {
    for (let x = 0; x < aw; x += step) {
      const i = (y*aw + x)*4 + 3;
      if (a.mask.data.data[i] < a.mask.alphaThreshold) continue;
      const lx = (x - aw/2) * a.transform.scale;
      const ly = (y - ah/2) * a.transform.scale;
      const gx = a.transform.x + lx * cos - ly * sin;
      const gy = a.transform.y + lx * sin + ly * cos;
      if (hitTestImage(b, gx, gy)) return true;
    }
  }
  return false;
}
