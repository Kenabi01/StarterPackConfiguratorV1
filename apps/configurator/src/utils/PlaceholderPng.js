// Utility: Generiert transparente PNGs mit zufälliger Form/Farbe
// Einstellungen: siehe PLACEHOLDER_PNG in ../settings.js

import { PLACEHOLDER_PNG } from "../settings.js";

function randOf(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max) { return Math.random() * (max - min) + min; }

function drawCircle(ctx, s) {
  const r = s * 0.42;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.closePath(); ctx.fill();
}

function drawRect(ctx, s) {
  const w = s * 0.78, h = s * 0.56, r = Math.min(w, h) * 0.18;
  const x = -w / 2, y = -h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function drawTriangle(ctx, s) {
  const r = s * 0.5;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fill();
}

function drawStar(ctx, s) {
  const outer = s * 0.48, inner = s * 0.20;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fill();
}

function drawHexagon(ctx, s) {
  const r = s * 0.46;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI * 2) / 6;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fill();
}

function drawBlob(ctx, s) {
  // Blob über zufällige Punkte + Bezier-Kurven
  const r = s * 0.42;
  const pts = [];
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = r * (0.75 + Math.random() * 0.45);
    pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
  }
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % N];
    const p2 = pts[(i + 2) % N];
    if (i === 0) ctx.moveTo(p0.x, p0.y);
    const c1 = { x: p0.x + (p1.x - pts[(i - 1 + N) % N].x) * 0.25, y: p0.y + (p1.y - pts[(i - 1 + N) % N].y) * 0.25 };
    const c2 = { x: p1.x - (p2.x - p0.x) * 0.25, y: p1.y - (p2.y - p0.y) * 0.25 };
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p1.x, p1.y);
  }
  ctx.closePath(); ctx.fill();
}

function drawGloss(ctx, s) {
  const r = s * 0.42;
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  drawCircle(ctx, s);
}

export function generatePlaceholderPng(options = {}) {
  const cfg = { ...PLACEHOLDER_PNG, ...options };
  const s = cfg.size;
  const canvas = document.createElement("canvas");
  canvas.width = s; canvas.height = s;
  const ctx = canvas.getContext("2d");
  // Transparenter Hintergrund: nichts füllen

  // Zufällige Rotation
  const rot = (rand(-cfg.jitterRotationDeg, cfg.jitterRotationDeg) * Math.PI) / 180;

  // Setup
  ctx.save();
  ctx.translate(s / 2, s / 2);
  ctx.rotate(rot);
  const fill = randOf(cfg.colors);
  ctx.fillStyle = fill;

  const shape = randOf(cfg.shapes);
  switch (shape) {
    case "circle": drawCircle(ctx, s); break;
    case "rect": drawRect(ctx, s); break;
    case "triangle": drawTriangle(ctx, s); break;
    case "star": drawStar(ctx, s); break;
    case "hexagon": drawHexagon(ctx, s); break;
    default: drawBlob(ctx, s); break;
  }

  if (cfg.stroke?.enabled) {
    ctx.lineWidth = cfg.stroke.width || 2;
    ctx.strokeStyle = cfg.stroke.color || "rgba(0,0,0,0.2)";
    ctx.stroke();
  }

  if (cfg.glossy) {
    drawGloss(ctx, s);
  }

  ctx.restore();
  return canvas.toDataURL("image/png");
}

