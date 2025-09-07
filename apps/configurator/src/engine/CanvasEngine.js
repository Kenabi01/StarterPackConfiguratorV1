// CanvasEngine: verwaltet Items, Zeichnung, Interaktionen, Snapping, Nicht-Überlappung
import { GRID_SIZE, SNAP_THRESHOLD, SHOW_GRID_DEFAULT, OUTLINE_WIDTH, OUTLINE_COLOR, GUIDE_COLOR, SLIDE_ON_COLLISION, SLIDE_MAX_PIXELS, SLIDE_STEP_PIXELS } from "../settings.js";
import { loadImage, computeMaskFromImage, drawOutline, masksOverlap, hitTestImage } from "./MaskCollision.js";

export class CanvasEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.items = []; // z-ordered ascending by z
    this.showGrid = SHOW_GRID_DEFAULT;
    this.selectedId = null;
    this.dragState = null;
    this.guides = [];
    this._bindEvents();
    this._raf();
  }

  // Public API
  setShowGrid(b) { this.showGrid = !!b; }
  getSelected() { return this.items.find(i => i.id === this.selectedId) || null; }

  async addImageItem({ id, url, category, z }) {
    const img = await loadImage(url);
    const mask = computeMaskFromImage(img);
    const item = {
      id, url, category, z: z ?? (this.items.length ? Math.max(...this.items.map(i=>i.z))+1 : 1),
      transform: { x: this.canvas.width/2, y: this.canvas.height/2, scale: 0.4, rotation: 0 },
      _img: img, mask,
      tint: null
    };
    this.items.push(item);
    this._sort();
    return item;
  }

  addTextItem({ id, text, fontFamily, fontSize, color, z }) {
    const item = {
      id, text, fontFamily, fontSize, color, z: z ?? (this.items.length ? Math.max(...this.items.map(i=>i.z))+1 : 1),
      transform: { x: this.canvas.width/2, y: this.canvas.height/2, scale: 1, rotation: 0 }
    };
    this.items.push(item);
    this._sort();
    return item;
  }

  removeItem(id) { this.items = this.items.filter(i => i.id !== id); if (this.selectedId === id) this.selectedId = null; }
  bringToFront(id) { const it = this.items.find(i=>i.id===id); if (!it) return; it.z = Math.max(...this.items.map(i=>i.z))+1; this._sort(); }
  sendToBack(id) { const it = this.items.find(i=>i.id===id); if (!it) return; it.z = Math.min(...this.items.map(i=>i.z))-1; this._sort(); }

  updateTransform(id, next) {
    const it = this.items.find(i=>i.id===id); if (!it) return;
    const prev = { ...it.transform };
    it.transform = { ...it.transform, ...next };
    if (this._hasOverlap(it)) {
      it.transform = prev; // revert if overlaps
    }
  }

  serialize() {
    return {
      id: `cfg_${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      canvas: { width: this.canvas.width, height: this.canvas.height, background: "#ffffff" },
      items: this.items.map(it => {
        if (it.url) {
          return { id: it.id, category: it.category, url: it.url, z: it.z, transform: it.transform, tint: it.tint };
        }
        return { id: it.id, text: it.text, fontFamily: it.fontFamily, fontSize: it.fontSize, color: it.color, z: it.z, transform: it.transform };
      })
    };
  }

  // Internal
  _sort() { this.items.sort((a,b)=>a.z-b.z); }

  _bindEvents() {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e)=>this._onDown(e));
    c.addEventListener("pointermove", (e)=>this._onMove(e));
    window.addEventListener("pointerup", (e)=>this._onUp(e));
  }

  _pos(e){ const r=this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  _findTopItemAt(gx, gy) {
    for (let i=this.items.length-1; i>=0; i--) {
      const it = this.items[i];
      if (it.url) { if (hitTestImage(it, gx, gy)) return it; }
      else {
        // rough bbox for text
        const w = it.text.length * it.fontSize * 0.6, h = it.fontSize;
        const dx = Math.abs(gx - it.transform.x), dy = Math.abs(gy - it.transform.y);
        if (dx < w/2 && dy < h/2) return it;
      }
    }
    return null;
  }

  _snap(val){ return Math.round(val/GRID_SIZE)*GRID_SIZE; }

  _onDown(e){
    const { x, y } = this._pos(e);
    const hit = this._findTopItemAt(x,y);
    if (hit) {
      this.selectedId = hit.id;
      this.dragState = { id: hit.id, startX: x, startY: y, orig: { ...hit.transform } };
    } else {
      this.selectedId = null; this.dragState = null;
    }
  }

  _onMove(e){
    if (!this.dragState) return;
    const { x, y } = this._pos(e);
    const it = this.items.find(i=>i.id===this.dragState.id);
    if (!it) return;
    const dx = x - this.dragState.startX; const dy = y - this.dragState.startY;
    let nx = this.dragState.orig.x + dx;
    let ny = this.dragState.orig.y + dy;
    // snapping
    const sx = this._snap(nx), sy = this._snap(ny);
    if (Math.abs(sx-nx) <= SNAP_THRESHOLD) nx = sx;
    if (Math.abs(sy-ny) <= SNAP_THRESHOLD) ny = sy;
    const prev = { ...it.transform };
    // Versuch: Zielposition setzen
    it.transform = { ...it.transform, x: nx, y: ny };
    if (!this._hasOverlap(it)) return; // frei, alles gut

    // Kollision: ggf. Slide-Strategie anwenden, sonst zurücksetzen
    if (!SLIDE_ON_COLLISION) { it.transform = prev; return; }

    // Helper zum Testen ohne Zustand zu verlieren
    const wouldOverlapAt = (tx, ty) => {
      const bak = it.transform;
      it.transform = { ...it.transform, x: tx, y: ty };
      const ov = this._hasOverlap(it);
      it.transform = bak;
      return ov;
    };

    // 1) Primärachse bestimmen (wohin der Nutzer überwiegend zieht)
    const primary = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";

    // 2) Entlang der freien Achse ausweichen: suche die nächste y (bzw. x), die frei ist
    const trySlidePerp = () => {
      if (primary === "x") {
        for (let off = 0; off <= SLIDE_MAX_PIXELS; off += SLIDE_STEP_PIXELS) {
          // zuerst nahe bei 0, dann ±off
          const cands = off === 0 ? [0] : [off, -off];
          for (const d of cands) {
            const ty = prev.y + d;
            if (!wouldOverlapAt(nx, ty)) { it.transform = { ...it.transform, x: nx, y: ty }; return true; }
          }
        }
      } else {
        for (let off = 0; off <= SLIDE_MAX_PIXELS; off += SLIDE_STEP_PIXELS) {
          const cands = off === 0 ? [0] : [off, -off];
          for (const d of cands) {
            const tx = prev.x + d;
            if (!wouldOverlapAt(tx, ny)) { it.transform = { ...it.transform, x: tx, y: ny }; return true; }
          }
        }
      }
      return false;
    };

    // 3) Falls kein Ausweichen möglich, versuche entlang der freien Achse in Richtung Ziel zu bewegen
    const tryPartialPerp = () => {
      if (primary === "x") {
        const target = ny;
        const dir = Math.sign(target - prev.y) || 0;
        if (dir === 0) return false;
        let lastFreeY = prev.y;
        for (let ty = prev.y + dir * SLIDE_STEP_PIXELS;
             (dir > 0 ? ty <= target : ty >= target);
             ty += dir * SLIDE_STEP_PIXELS) {
          if (wouldOverlapAt(prev.x, ty)) break;
          lastFreeY = ty;
        }
        if (lastFreeY !== prev.y) { it.transform = { ...it.transform, x: prev.x, y: lastFreeY }; return true; }
      } else {
        const target = nx;
        const dir = Math.sign(target - prev.x) || 0;
        if (dir === 0) return false;
        let lastFreeX = prev.x;
        for (let tx = prev.x + dir * SLIDE_STEP_PIXELS;
             (dir > 0 ? tx <= target : tx >= target);
             tx += dir * SLIDE_STEP_PIXELS) {
          if (wouldOverlapAt(tx, prev.y)) break;
          lastFreeX = tx;
        }
        if (lastFreeX !== prev.x) { it.transform = { ...it.transform, x: lastFreeX, y: prev.y }; return true; }
      }
      return false;
    };

    // 4) Falls kein Ausweichen möglich, bewege so weit wie möglich entlang der Primärachse
    const tryPartialPrimary = () => {
      if (primary === "x") {
        const dir = Math.sign(nx - prev.x) || 0; // -1, 0, 1
        if (dir === 0) return false;
        let lastFreeX = prev.x;
        for (let tx = prev.x + dir * SLIDE_STEP_PIXELS;
             (dir > 0 ? tx <= nx : tx >= nx);
             tx += dir * SLIDE_STEP_PIXELS) {
          if (wouldOverlapAt(tx, prev.y)) break;
          lastFreeX = tx;
        }
        if (lastFreeX !== prev.x) { it.transform = { ...it.transform, x: lastFreeX, y: prev.y }; return true; }
      } else {
        const dir = Math.sign(ny - prev.y) || 0;
        if (dir === 0) return false;
        let lastFreeY = prev.y;
        for (let ty = prev.y + dir * SLIDE_STEP_PIXELS;
             (dir > 0 ? ty <= ny : ty >= ny);
             ty += dir * SLIDE_STEP_PIXELS) {
          if (wouldOverlapAt(prev.x, ty)) break;
          lastFreeY = ty;
        }
        if (lastFreeY !== prev.y) { it.transform = { ...it.transform, x: prev.x, y: lastFreeY }; return true; }
      }
      return false;
    };

    // Reihenfolge: erst ausweichen, dann teilweise entlang freier Achse, dann teilweise entlang Primärachse; wenn nichts geht: revert
    if (trySlidePerp()) return;
    if (tryPartialPerp()) return;
    if (tryPartialPrimary()) return;
    it.transform = prev; // nichts möglich
  }

  _onUp(_e){ this.dragState = null; }

  _hasOverlap(it){
    if (!it.url) return false; // texts can overlap
    for (const other of this.items) {
      if (other.id === it.id) continue;
      if (!other.url) continue;
      if (masksOverlap(it, other)) return true;
    }
    return false;
  }

  _drawGrid() {
    const { ctx } = this; const w=this.canvas.width, h=this.canvas.height;
    ctx.save();
    ctx.strokeStyle = "#eee"; ctx.lineWidth = 1;
    for (let x=0; x<=w; x+=GRID_SIZE) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    for (let y=0; y<=h; y+=GRID_SIZE) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    ctx.restore();
  }

  _drawGuides(){
    const { ctx } = this;
    if (!this.guides.length) return;
    ctx.save();
    ctx.strokeStyle = GUIDE_COLOR; ctx.setLineDash([4,4]);
    for (const g of this.guides) {
      ctx.beginPath();
      if (g.type === "v") { ctx.moveTo(g.pos,0); ctx.lineTo(g.pos,this.canvas.height); }
      else { ctx.moveTo(0,g.pos); ctx.lineTo(this.canvas.width,g.pos); }
      ctx.stroke();
    }
    ctx.restore();
  }

  _raf(){
    requestAnimationFrame(()=>this._raf());
    this._render();
  }

  _render(){
    const { ctx } = this; const w=this.canvas.width, h=this.canvas.height;
    ctx.clearRect(0,0,w,h);
    if (this.showGrid) this._drawGrid();

    for (const it of this.items) {
      if (it.url) {
        ctx.save();
        ctx.translate(it.transform.x, it.transform.y);
        ctx.rotate((it.transform.rotation*Math.PI)/180);
        ctx.scale(it.transform.scale, it.transform.scale);
        ctx.drawImage(it._img, -it._img.width/2, -it._img.height/2);
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(it.transform.x, it.transform.y);
        ctx.rotate((it.transform.rotation*Math.PI)/180);
        ctx.scale(it.transform.scale, it.transform.scale);
        ctx.fillStyle = it.color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = `${it.fontSize}px ${it.fontFamily}`;
        ctx.fillText(it.text, 0, 0);
        ctx.restore();
      }
    }

    // outline selection
    if (this.selectedId) {
      const sel = this.items.find(i=>i.id===this.selectedId);
      if (sel) {
        ctx.save();
        ctx.lineWidth = OUTLINE_WIDTH;
        drawOutline(ctx, sel, OUTLINE_COLOR);
        ctx.restore();
      }
    }

    this._drawGuides();
  }
}
