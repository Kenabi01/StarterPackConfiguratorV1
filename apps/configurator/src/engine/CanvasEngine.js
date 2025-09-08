// CanvasEngine: verwaltet Items, Zeichnung, Interaktionen, Snapping, Nicht-Überlappung
import { GRID_SIZE, SNAP_THRESHOLD, SHOW_GRID_DEFAULT, OUTLINE_WIDTH, OUTLINE_COLOR, GUIDE_COLOR, SLIDE_ON_COLLISION, SLIDE_MAX_PIXELS, SLIDE_STEP_PIXELS, DRAG_USE_POINTER_CAPTURE, DRAG_PREVENT_DEFAULT, APPLY_SNAP_ON_DROP, ALLOW_OVERLAP_DURING_DRAG, ANIMATE_DROP, DROP_ANIM_DURATION_MS, BOUNDS_ENABLED, BOUNDS_RECT, BOUNDS_STYLE, ARRANGE_MODE, SMART_ARRANGE_MIN_GAP, SMART_ARRANGE_MAX_ITER, SMART_ARRANGE_RESTARTS, SMART_ARRANGE_JITTER, SMART_ARRANGE_STEP, SMART_ARRANGE_MAX_STEP, SMART_ARRANGE_CENTER_PULL, SMART_ARRANGE_REPULSION_K, SMART_ARRANGE_EDGE_PADDING, SMART_ARRANGE_SNAP_TO_GRID, SMART_ARRANGE_INCLUDE_TEXT, SMART_ARRANGE_MASK_CHECK, DROP_SEARCH_MAX_RADIUS, DROP_SEARCH_STEP_RADIUS, DROP_SEARCH_ANGLE_STEP_DEG, DROP_FALLBACK_TO_LAST_FREE, DROP_REVERT_TO_START_IF_ALL_FAIL, HISTORY_LIMIT } from "../settings.js";
import { loadImage, computeMaskFromImage, masksOverlap, hitTestImage, tintedCanvasFromAlpha, strokeBandFrom, solidOffsetFrom } from "./MaskCollision.js";

export class CanvasEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.items = []; // z-ordered ascending by z
    this.showGrid = SHOW_GRID_DEFAULT;
    this.selectedId = null;
    this.dragState = null;
    this.guides = [];
    // Render-Invalidierung und Frame-Steuerung
    this._needsRender = true;
    this._rafHandle = null;
    // Gecachter Grid-Layer
    this._gridCache = { canvas: null, width: 0, height: 0, gridSize: GRID_SIZE };
    // Unterstützung für mehrere gleichzeitige Drop-Animationen
    // Map: id -> { fromX, fromY, toX, toY, t0, dur }
    this.dropAnims = new Map();
    // Outline-Konfiguration (UI-steuerbar)
    this.outline = { width: OUTLINE_WIDTH, color: OUTLINE_COLOR };
    // Rendering: Shapes wahlweise ausblendbar (nur Konturen anzeigen)
    this.renderShapes = true;
    // Laufzeit-konfigurierbare Begrenzungsbox (per UI konfigurierbar)
    this._boundsEnabled = BOUNDS_ENABLED;
    this._boundsRect = (BOUNDS_RECT && typeof BOUNDS_RECT.x === 'number') ? { ...BOUNDS_RECT } : null;
    this._bindEvents();
    // Erstes Frame rendern
    this._scheduleFrame();

    // Undo-Verlauf
    this._history = [];
    this._historyLimit = Number.isFinite(HISTORY_LIMIT) ? HISTORY_LIMIT : 50;
    this._isRestoring = false;
  }

  // Public API
  requestRender(){ this._invalidate(); }
  setShowGrid(b) { this.showGrid = !!b; this._invalidate(); }
  getSelected() { return this.items.find(i => i.id === this.selectedId) || null; }
  setOutlineWidth(w) {
    const v = Number(w);
    if (Number.isFinite(v) && v >= 0) {
      this.outline.width = v;
      // Caches invalidieren und Kollisionsmasken ggf. entfernen
      for (const it of this.items) {
        if (it._outlineCache) delete it._outlineCache;
        if (v <= 0) { delete it._colMask; delete it._colMaskExtraPx; }
        // AABB-Cache invalidieren
        if (it._aabbCache) delete it._aabbCache;
      }
      this._invalidate();
    }
  }
  setOutlineColor(c) {
    if (typeof c === 'string' && c) {
      this.outline.color = c;
      // Farbcache invalidieren
      for (const it of this.items) { if (it._outlineCache) delete it._outlineCache; }
      this._invalidate();
    }
  }
  setRenderShapes(show) { this.renderShapes = !!show; this._invalidate(); }

  // Verlauf
  _snapshot() {
    if (this._isRestoring) return;
    try {
      const snap = this.serialize();
      this._history.push(snap);
      if (this._history.length > this._historyLimit) this._history.shift();
    } catch {}
  }
  canUndo() { return this._history.length > 0; }
  async undo() {
    if (!this.canUndo()) return false;
    const snap = this._history.pop();
    await this.applySerialized(snap);
    return true;
  }
  async applySerialized(doc) {
    // Stellt den Zustand exakt aus einer Serialisierung wieder her
    this._isRestoring = true;
    try {
      this.items = [];
      this.selectedId = null;
      this.dropAnims?.clear?.();
      const zsorted = [...(doc?.items || [])].sort((a,b)=>a.z-b.z);
      for (const it of zsorted) {
        if (it.url) await this.addImageItem(it);
        else this.addTextItem(it);
        // transform exakt übernehmen
        this.updateTransform(it.id, it.transform);
      }
    } finally {
      this._isRestoring = false;
      this._invalidate();
    }
  }

  // Bounds API: exakte Position/Größe der Box setzen
  setBoundsEnabled(enabled) {
    this._boundsEnabled = !!enabled;
    if (this._boundsEnabled) this._clampAllItemsInBounds();
    this._invalidate();
  }
  setBoundsRect(rect) {
    if (rect && typeof rect.x === 'number' && typeof rect.y === 'number' && typeof rect.width === 'number' && typeof rect.height === 'number') {
      this._boundsRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    } else {
      this._boundsRect = null; // kein explizites Bounds-Rechteck gesetzt
    }
    if (this._boundsEnabled) this._clampAllItemsInBounds();
    this._invalidate();
  }
  getBoundsRect() { return this._getBoundsRect(); }

  hasItem(id) { return this.items.some(i => i.id === id); }

  async placeImageItem({ id, url, category, startX = null, startY = null }) {
    this._snapshot();
    // Lädt ein Bild, platziert es zunächst normal und löst anschließend wie ein Drop auf.
    const img = await loadImage(url);
    const mask = computeMaskFromImage(img);
    const item = {
      id, url, category,
      z: this.items.length ? Math.max(...this.items.map(i=>i.z))+1 : 1,
      transform: { x: this.canvas.width/2, y: this.canvas.height/2, scale: 0.4, rotation: 0 },
      _img: img, mask,
      tint: null
    };

    // Wunschstartposition: Mittelpunkt der Bounds oder angegeben
    const r = this._getBoundsRect() || { x: 0, y: 0, width: this.canvas.width, height: this.canvas.height };
    const prefX = startX != null ? startX : (r.x + r.width/2);
    const prefY = startY != null ? startY : (r.y + r.height/2);

    // Kollisionsmaske für das neue Item vorbereiten (abhängig von Outline-Breite und Scale)
    const owCanvas = Math.max(0, Number(this.outline.width) || 0);
    if (owCanvas > 0) {
      const extra = Math.max(0, Math.round((owCanvas / 2) / Math.max(0.001, item.transform.scale)));
      const solid = solidOffsetFrom(item.mask, extra);
      item._colMask = solid;
      item._colMaskExtraPx = extra;
    }

    // 1) Zunächst normal an die gewünschte Position setzen (inkl. Bounds)
    let startPos = { x: prefX, y: prefY };
    if (this._boundsEnabled) { startPos = this._clampXYForItem(item, prefX, prefY); }
    item.transform = { ...item.transform, x: startPos.x, y: startPos.y };
    this.items.push(item);
    this._updateAabbCache(item);
    this._sort();
    this.selectedId = item.id;

    // 2) Wie ein Drop behandeln
    let targetX = item.transform.x;
    let targetY = item.transform.y;
    if (APPLY_SNAP_ON_DROP) {
      const sx = this._snap(targetX), sy = this._snap(targetY);
      if (Math.abs(sx-targetX) <= SNAP_THRESHOLD) targetX = sx;
      if (Math.abs(sy-targetY) <= SNAP_THRESHOLD) targetY = sy;
    }

    // Für Personen kein Ausweichen: an Ziel setzen und andere Objekte wegdrücken
    if (category === 'person') {
      if (this._boundsEnabled) {
        const c = this._clampXYForItem(item, targetX, targetY);
        targetX = c.x; targetY = c.y;
      }
      item.transform = { ...item.transform, x: targetX, y: targetY };
      // Danach andere Gegenstände wegdrücken
      this._pushOthersAwayFrom(item);
    } else {
      // Hilfsfunktion: prüft Overlap an (tx,ty) mit Bounds-Klammerung
      const wouldOverlapAt = (tx, ty) => {
        const bak = item.transform;
        if (this._boundsEnabled) {
          const c = this._clampXYForItem(item, tx, ty);
          item.transform = { ...item.transform, x: c.x, y: c.y };
        } else {
          item.transform = { ...item.transform, x: tx, y: ty };
        }
        const ov = this._hasOverlap(item);
        item.transform = bak;
        return ov;
      };

      // Prüfen, ob aktuell oder am Zielpunkt eine Überlappung vorliegt; falls ja, freie Position suchen
      if (this._hasOverlap(item) || wouldOverlapAt(targetX, targetY)) {
        const prev = { ...item.transform };
        let found = null;
        // 2.1) Lokale Achsen-Suche rund um die momentane Position
        for (let off = 0; off <= SLIDE_MAX_PIXELS && !found; off += Math.max(1, SLIDE_STEP_PIXELS)) {
          const cands = off === 0 ? [[0,0]] : [[off,0],[-off,0],[0,off],[0,-off]];
          for (const [dx,dy] of cands) {
            const tx = prev.x + dx, ty = prev.y + dy;
            if (!wouldOverlapAt(tx, ty)) { found = { x: tx, y: ty }; break; }
          }
        }
        // 2.2) Radiale Suche um das gesnapte Ziel
        if (!found) {
          const angleStep = Math.max(1e-3, (DROP_SEARCH_ANGLE_STEP_DEG * Math.PI) / 180);
          const ox = targetX, oy = targetY;
          for (let rad = Math.max(1, SLIDE_STEP_PIXELS); rad <= DROP_SEARCH_MAX_RADIUS && !found; rad += Math.max(1, DROP_SEARCH_STEP_PIXELS)) {
            for (let a = 0; a < Math.PI * 2; a += angleStep) {
              const tx = ox + Math.cos(a) * rad;
              const ty = oy + Math.sin(a) * rad;
              if (!wouldOverlapAt(tx, ty)) { found = { x: tx, y: ty }; break; }
            }
          }
        }

        // 2.3) Fallbacks
        if (found) { targetX = found.x; targetY = found.y; }
        else if (DROP_REVERT_TO_START_IF_ALL_FAIL) { targetX = prev.x; targetY = prev.y; }

        // 2.4) Bounds anwenden und optional animieren
        if (this._boundsEnabled) {
          const c = this._clampXYForItem(item, targetX, targetY);
          targetX = c.x; targetY = c.y;
        }
        // Beim Einfügen sofort setzen (ohne Animation), um direktes Ausweichen zu garantieren
        item.transform = { ...item.transform, x: targetX, y: targetY };
        this._updateAabbCache(item);
      }
    }

    return item;
  }

  _ensureCollisionMasks() {
    const owCanvas = Math.max(0, Number(this.outline.width) || 0);
    for (const it of this.items) {
      if (!it.url) continue;
      if (owCanvas > 0) {
        const r = Math.max(0, Math.round((owCanvas / 2) / Math.max(0.001, it.transform.scale)));
        if (!it._colMask || it._colMaskExtraPx !== r) {
          const solid = solidOffsetFrom(it.mask, r);
          it._colMask = solid; // solide Offset-Maske für Kollision und Hit-Test
          it._colMaskExtraPx = r;
          if (it._outlineCache && it._outlineCache.radius !== r) delete it._outlineCache;
        }
      } else {
        delete it._colMask; delete it._colMaskExtraPx;
      }
    }
  }

  // Personen drücken andere Gegenstände weg (nicht umgekehrt)
  _pushOthersAwayFrom(anchor) {
    // Optimiertes Wegdrücken: plant Ziele für alle betroffenen Gegenstände kollisionsfrei
    this._ensureCollisionMasks();
    if (!anchor || !anchor.url) return;
    const step = Math.max(2, SLIDE_STEP_PIXELS);
    const maxRad = Math.max(step, DROP_SEARCH_MAX_RADIUS);
    const angleStep = Math.max(1e-3, (DROP_SEARCH_ANGLE_STEP_DEG * Math.PI) / 180);

    // Hilfsfunktionen für temporäre Prüfungen
    const withPlanned = (plannedMap, fn) => {
      const backups = new Map();
      for (const [id, pos] of plannedMap.entries()) {
        const obj = this.items.find(i=>i.id===id);
        if (!obj) continue;
        backups.set(id, { ...obj.transform });
        const c = this._boundsEnabled ? this._clampXYForItem(obj, pos.x, pos.y) : pos;
        obj.transform = { ...obj.transform, x: c.x, y: c.y };
      }
      const res = fn();
      for (const [id, prev] of backups.entries()) {
        const obj = this.items.find(i=>i.id===id);
        if (obj) obj.transform = prev;
      }
      return res;
    };

    const overlapsAnyAt = (it, tx, ty, plannedMap) => {
      // prüft Overlap an (tx,ty) gegen alle Bild-Items unter Berücksichtigung geplanter Ziele
      const trialMap = new Map(plannedMap || []);
      trialMap.set(it.id, { x: tx, y: ty });
      return withPlanned(trialMap, () => {
        for (const other of this.items) {
          if (!other.url) continue;
          if (other.id === it.id) continue;
          if (masksOverlap(it, other, 3)) return true;
        }
        return false;
      });
    };

    // Betroffene Gegenstände sammeln (die aktuell mit der Person kollidieren), nach Nähe sortiert
    const affected = [];
    for (const it of this.items) {
      if (!it.url) continue;
      if (it.id === anchor.id) continue;
      if (it.category !== 'object') continue;
      if (!masksOverlap(anchor, it, 3)) continue;
      affected.push(it);
    }
    affected.sort((a,b)=>{
      const da = Math.hypot(a.transform.x - anchor.transform.x, a.transform.y - anchor.transform.y);
      const db = Math.hypot(b.transform.x - anchor.transform.x, b.transform.y - anchor.transform.y);
      return da - db;
    });

    const planned = new Map(); // id -> {x,y}

    // Erste Phase: für jedes Objekt kollisionsfreie Zielposition finden (unter Berücksichtigung bereits geplanter Ziele)
    for (const it of affected) {
      let dx = it.transform.x - anchor.transform.x;
      let dy = it.transform.y - anchor.transform.y;
      if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) { dx = 1; dy = 0; }
      const d = Math.hypot(dx, dy) || 1; const ux = dx / d, uy = dy / d;

      // Kandidatenrichtungen: Haupt- und tangentiale Richtungen (radiale Suche um Objektmittelpunkt)
      const dirAngles = [0];
      for (let a = angleStep; a <= Math.PI; a += angleStep) { dirAngles.push(a, -a); }

      let found = null;
      outer_obj: for (let k = 0; k < dirAngles.length; k++) {
        const a = dirAngles[k];
        const ca = Math.cos(a), sa = Math.sin(a);
        const rx = ux * ca - uy * sa;
        const ry = ux * sa + uy * ca;
        for (let rad = step; rad <= maxRad; rad += step) {
          const px = it.transform.x + rx * rad;
          const py = it.transform.y + ry * rad;
          if (!overlapsAnyAt(it, px, py, planned)) { found = { x: px, y: py }; break outer_obj; }
        }
      }

      // Fallback: ringförmige Suche um die Person (Anker), um aus Zwicklagen an Wänden auszubrechen
      if (!found) {
        const baseR = Math.hypot(it.transform.x - anchor.transform.x, it.transform.y - anchor.transform.y);
        const angleStep2 = angleStep; // gleiche Winkelauflösung
        outer_anchor: for (let rad = Math.max(step, baseR + step); rad <= baseR + maxRad; rad += step) {
          for (let a = 0; a < Math.PI * 2; a += angleStep2) {
            const px = anchor.transform.x + Math.cos(a) * rad;
            const py = anchor.transform.y + Math.sin(a) * rad;
            if (!overlapsAnyAt(it, px, py, planned)) { found = { x: px, y: py }; break outer_anchor; }
          }
        }
      }

      // Wenn weiterhin nichts frei ist: wähle die maximal mögliche Verschiebung weg vom Anker (geklammert)
      // So wird wenigstens der Abstand maximiert; echte Überlappung wird in der zweiten Phase weiter reduziert.
      if (!found) {
        const farX = it.transform.x + ux * maxRad;
        const farY = it.transform.y + uy * maxRad;
        const clFar = this._boundsEnabled ? this._clampXYForItem(it, farX, farY) : { x: farX, y: farY };
        found = clFar;
      }

      const cl = this._boundsEnabled ? this._clampXYForItem(it, found.x, found.y) : found;
      planned.set(it.id, { x: cl.x, y: cl.y });
    }

    // Zweite Phase: kurze Verfeinerung, um Restüberschneidungen zwischen geplanten Zielen zu eliminieren
    let changed = true; let guard = 0;
    while (changed && guard++ < 30) {
      changed = false;
      for (let i = 0; i < affected.length; i++) {
        for (let j = i+1; j < affected.length; j++) {
          const a = affected[i], b = affected[j];
          const ax = (planned.get(a.id)?.x) ?? a.transform.x;
          const ay = (planned.get(a.id)?.y) ?? a.transform.y;
          const bx = (planned.get(b.id)?.x) ?? b.transform.x;
          const by = (planned.get(b.id)?.y) ?? b.transform.y;
          const overlap = withPlanned(new Map([[a.id,{x:ax,y:ay}],[b.id,{x:bx,y:by}]]), () => masksOverlap(a, b, 2));
          if (!overlap) continue;
          // Trenne minimal entlang Verbindungsrichtung
          let dx = (ax - bx); let dy = (ay - by);
          if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) { dx = (Math.random()-0.5); dy = (Math.random()-0.5); }
          const dd = Math.hypot(dx, dy) || 1; const ux2 = dx/dd, uy2 = dy/dd;
          const stepSep = 1;
          const aTry = { x: ax + ux2*stepSep, y: ay + uy2*stepSep };
          const bTry = { x: bx - ux2*stepSep, y: by - uy2*stepSep };
          const aOk = !overlapsAnyAt(a, aTry.x, aTry.y, new Map([[b.id,bTry], ...planned]));
          const bOk = !overlapsAnyAt(b, bTry.x, bTry.y, new Map([[a.id,aTry], ...planned]));
          if (aOk && bOk) {
            const aCl = this._boundsEnabled ? this._clampXYForItem(a, aTry.x, aTry.y) : aTry;
            const bCl = this._boundsEnabled ? this._clampXYForItem(b, bTry.x, bTry.y) : bTry;
            planned.set(a.id, aCl); planned.set(b.id, bCl);
            changed = true;
          }
        }
      }
    }

    // Ziele animieren/setzen
    for (const it of affected) {
      const pos = planned.get(it.id);
      if (!pos) continue;
      const fromX = it.transform.x, fromY = it.transform.y;
      const dx = pos.x - fromX, dy = pos.y - fromY;
      const dist2 = dx*dx + dy*dy;
      if (dist2 > 0.25) this._startDropAnim(it.id, fromX, fromY, pos.x, pos.y, DROP_ANIM_DURATION_MS);
      else it.transform = { ...it.transform, x: pos.x, y: pos.y };
    }
  }

  // "Ordnen" — smartes, iteratives Layout mit optimalen Abständen (oder klassisches Grid je nach Einstellung)
  arrangeItemsEvenly() {
    this._snapshot();
    this._ensureCollisionMasks();
    if (ARRANGE_MODE === 'grid') {
      // Altes, einfaches Grid-Verhalten als Fallback
      const items = [...this.items];
      if (!items.length) return;
      const r = this._getBoundsRect() || { x: 0, y: 0, width: this.canvas.width, height: this.canvas.height };
      const n = items.length;
      const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
      const rows = Math.max(1, Math.ceil(n / cols));
      const cellW = r.width / cols;
      const cellH = r.height / rows;
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const cx = r.x + (col + 0.5) * cellW;
        const cy = r.y + (row + 0.5) * cellH;
        const it = items[i];
        const c = this._clampXYForItem(it, cx, cy);
        it.transform = { ...it.transform, x: c.x, y: c.y };
      }
      return;
    }
    this._arrangeSmart();
  }

  _arrangeSmart() {
    const all = this.items;
    if (!all.length) return;
    // Auswahl der zu arrangierenden Elemente (Bilder + optional Texte)
    const items = all.filter(it => SMART_ARRANGE_INCLUDE_TEXT ? true : !!it.url);
    if (!items.length) return;
    const r = this._getBoundsRect() || { x: 0, y: 0, width: this.canvas.width, height: this.canvas.height };
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;

    // Vorab: Begrenzen + Start-Jitter
    for (const it of items) {
      const c = this._clampXYForItem(it, it.transform.x, it.transform.y);
      let jx = 0, jy = 0;
      if (SMART_ARRANGE_JITTER > 0) {
        jx = (Math.random() - 0.5) * 2 * SMART_ARRANGE_JITTER;
        jy = (Math.random() - 0.5) * 2 * SMART_ARRANGE_JITTER;
      }
      it.transform = { ...it.transform, x: c.x + jx, y: c.y + jy };
    }

    const n = items.length;
    const rad = new Map();
    const centers = new Map();
    const computeRadius = (it) => {
      // Umschließender Kreis (halb Diagonale der AABB bei Rotation/Scale)
      const a = this._aabbForItemAt(it, it.transform.x, it.transform.y);
      const w = Math.max(1, a.maxX - a.minX), h = Math.max(1, a.maxY - a.minY);
      return 0.5 * Math.hypot(w, h);
    };
    for (const it of items) { rad.set(it.id, computeRadius(it)); centers.set(it.id, { x: it.transform.x, y: it.transform.y }); }

    const left = r.x + SMART_ARRANGE_EDGE_PADDING;
    const right = r.x + r.width - SMART_ARRANGE_EDGE_PADDING;
    const top = r.y + SMART_ARRANGE_EDGE_PADDING;
    const bottom = r.y + r.height - SMART_ARRANGE_EDGE_PADDING;

    const clampToBounds = (it, x, y) => {
      // Nutzt präzise Begrenzung via AABB, nicht nur Kreis – vermeidet Clipping
      const c = this._clampXYForItem(it, x, y);
      return { x: c.x, y: c.y };
    };

    const restartIfNeeded = () => {
      // zufällige kleine Neuverteilung innerhalb Bounds
      const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
      const rows = Math.max(1, Math.ceil(n / cols));
      const cellW = r.width / cols;
      const cellH = r.height / rows;
      for (let i = 0; i < n; i++) {
        const it = items[i];
        const row = Math.floor(i / cols), col = i % cols;
        const tx = r.x + (col + 0.5) * cellW + (Math.random()-0.5)*cellW*0.3;
        const ty = r.y + (row + 0.5) * cellH + (Math.random()-0.5)*cellH*0.3;
        const c = clampToBounds(it, tx, ty);
        it.transform = { ...it.transform, x: c.x, y: c.y };
        centers.set(it.id, { x: c.x, y: c.y });
      }
    };

    const circleOverlapMetric = () => {
      let maxPenetration = 0;
      for (let i = 0; i < n; i++) {
        const a = items[i]; const ca = centers.get(a.id); const ra = rad.get(a.id);
        for (let j = i+1; j < n; j++) {
          const b = items[j]; const cb = centers.get(b.id); const rb = rad.get(b.id);
          const dx = ca.x - cb.x, dy = ca.y - cb.y; const dist = Math.hypot(dx, dy) + 1e-6;
          const need = ra + rb + SMART_ARRANGE_MIN_GAP;
          const pen = need - dist; if (pen > maxPenetration) maxPenetration = pen;
        }
      }
      return maxPenetration;
    };

    let bestCenters = null;
    let bestScore = Infinity;
    let restarts = SMART_ARRANGE_RESTARTS;

    for (let attempt = 0; attempt <= restarts; attempt++) {
      if (attempt > 0) restartIfNeeded();
      // Iterative Relaxation
      for (let iter = 0; iter < SMART_ARRANGE_MAX_ITER; iter++) {
        // Kräfte zurücksetzen
        const force = new Map();
        for (const it of items) force.set(it.id, { x: 0, y: 0 });

        // Paarweise Abstoßung bei Überschneidung (inkl. gewünschtem Mindestabstand)
        for (let i = 0; i < n; i++) {
          const a = items[i]; const ca = centers.get(a.id); const ra = rad.get(a.id);
          for (let j = i+1; j < n; j++) {
            const b = items[j]; const cb = centers.get(b.id); const rb = rad.get(b.id);
            let dx = ca.x - cb.x, dy = ca.y - cb.y; const dist = Math.hypot(dx, dy) || 1e-6;
            const need = ra + rb + SMART_ARRANGE_MIN_GAP;
            const overlap = need - dist; // >0 bedeutet zu nah/überlappend
            if (overlap > 0) {
              dx /= dist; dy /= dist; // Richtung von b nach a
              const f = SMART_ARRANGE_REPULSION_K * overlap;
              const fa = force.get(a.id), fb = force.get(b.id);
              fa.x += dx * f; fa.y += dy * f;
              fb.x -= dx * f; fb.y -= dy * f;
            }
          }
        }

        // Sanfter Zug zur Mitte vermeidet Randstau
        if (SMART_ARRANGE_CENTER_PULL > 0) {
          for (const it of items) {
            const c = centers.get(it.id);
            const fx = (cx - c.x) * SMART_ARRANGE_CENTER_PULL;
            const fy = (cy - c.y) * SMART_ARRANGE_CENTER_PULL;
            const f = force.get(it.id); f.x += fx; f.y += fy;
          }
        }

        // Anwenden der Bewegung (gedeckelt) + Bounds-Korrektur
        let moved = 0;
        for (const it of items) {
          const c = centers.get(it.id); const f = force.get(it.id);
          let mx = f.x * SMART_ARRANGE_STEP; let my = f.y * SMART_ARRANGE_STEP;
          const m = Math.hypot(mx, my);
          if (m > SMART_ARRANGE_MAX_STEP && m > 0) { const s = SMART_ARRANGE_MAX_STEP / m; mx *= s; my *= s; }
          let nx = c.x + mx, ny = c.y + my;
          // Grobe Kreisbegrenzung als zusätzliche Stabilisierung
          const ri = rad.get(it.id);
          nx = Math.min(Math.max(nx, left + ri), right - ri);
          ny = Math.min(Math.max(ny, top + ri), bottom - ri);
          const cl = clampToBounds(it, nx, ny);
          centers.set(it.id, { x: cl.x, y: cl.y });
          moved = Math.max(moved, Math.hypot(cl.x - c.x, cl.y - c.y));
        }

        // Abbruch, wenn nichts Relevantes mehr passiert und Kreis-Kriterium erfüllt
        const maxPen = circleOverlapMetric();
        if (maxPen <= 0.5 && moved < 0.5) break;
      }

      // Score bewerten: maximale Kreis-Penetration (je kleiner desto besser)
      const score = circleOverlapMetric();
      if (score < bestScore) {
        bestScore = score;
        bestCenters = new Map(centers);
      }
      if (bestScore <= 0.5) break; // gut genug
    }

    // Beste gefundenen Zentren übernehmen
    if (bestCenters) {
      for (const it of items) {
        const c = bestCenters.get(it.id) || centers.get(it.id);
        let fx = c.x, fy = c.y;
        if (SMART_ARRANGE_SNAP_TO_GRID) {
          const sx = this._snap(fx), sy = this._snap(fy);
          // kein hartes Threshold nötig – leichtes Runden
          fx = sx; fy = sy;
        }
        const cl = clampToBounds(it, fx, fy);
        it.transform = { ...it.transform, x: cl.x, y: cl.y };
      }
    }

    // Optional: pixelgenaue Maskenprüfung und feines Ausweichen, falls noch Berührungen
    if (SMART_ARRANGE_MASK_CHECK) {
      const imgs = items.filter(i => !!i.url);
      const wouldOverlap = (a, b) => masksOverlap(a, b);
      // kleine Auflösungsschleife
      let changed = true;
      let guard = 0;
      while (changed && guard++ < 40) {
        changed = false;
        for (let i = 0; i < imgs.length; i++) {
          for (let j = i+1; j < imgs.length; j++) {
            const a = imgs[i], b = imgs[j];
            if (!wouldOverlap(a, b)) continue;
            // minimale Trennung entlang Verbindungsrichtung
            const dx = (a.transform.x - b.transform.x) || (Math.random()-0.5);
            const dy = (a.transform.y - b.transform.y) || (Math.random()-0.5);
            const d = Math.hypot(dx, dy) || 1e-6; const ux = dx/d, uy = dy/d;
            const step = 1.0; // feiner Schritt
            const aTry = clampToBounds(a, a.transform.x + ux*step, a.transform.y + uy*step);
            const bTry = clampToBounds(b, b.transform.x - ux*step, b.transform.y - uy*step);
            const aBak = { ...a.transform }, bBak = { ...b.transform };
            a.transform = { ...a.transform, x: aTry.x, y: aTry.y };
            b.transform = { ...b.transform, x: bTry.x, y: bTry.y };
            if (wouldOverlap(a, b)) {
              // revert, versuche orthogonal
              a.transform = aBak; b.transform = bBak;
              const ox = -uy * step, oy = ux * step;
              const aTry2 = clampToBounds(a, a.transform.x + ox, a.transform.y + oy);
              const bTry2 = clampToBounds(b, b.transform.x - ox, b.transform.y - oy);
              a.transform = { ...a.transform, x: aTry2.x, y: aTry2.y };
              b.transform = { ...b.transform, x: bTry2.x, y: bTry2.y };
              if (wouldOverlap(a, b)) {
                // revert wieder
                a.transform = aBak; b.transform = bBak;
              } else { changed = true; }
            } else { changed = true; }
          }
        }
      }
      // optional leichte Rasterung am Ende
      if (SMART_ARRANGE_SNAP_TO_GRID) {
        for (const it of items) {
          const sx = this._snap(it.transform.x), sy = this._snap(it.transform.y);
          const cl = clampToBounds(it, sx, sy);
          it.transform = { ...it.transform, x: cl.x, y: cl.y };
        }
      }
    }
  }

  async addImageItem({ id, url, category, z }) {
    if (!this._isRestoring) this._snapshot();
    const img = await loadImage(url);
    const mask = computeMaskFromImage(img);
    const item = {
      id, url, category, z: z ?? (this.items.length ? Math.max(...this.items.map(i=>i.z))+1 : 1),
      transform: { x: this.canvas.width/2, y: this.canvas.height/2, scale: 0.4, rotation: 0 },
      _img: img, mask,
      tint: null
    };
    this.items.push(item);
    this._clampItemInBounds(item);
    this._updateAabbCache(item);
    this._sort();
    // Neu eingefügte Items direkt selektieren, damit Kontur sichtbar ist
    this.selectedId = item.id;
    this._invalidate();
    return item;
  }

  addTextItem({ id, text, fontFamily, fontSize, color, z }) {
    if (!this._isRestoring) this._snapshot();
    const item = {
      id, text, fontFamily, fontSize, color, z: z ?? (this.items.length ? Math.max(...this.items.map(i=>i.z))+1 : 1),
      transform: { x: this.canvas.width/2, y: this.canvas.height/2, scale: 1, rotation: 0 }
    };
    this.items.push(item);
    this._clampItemInBounds(item);
    this._updateAabbCache(item);
    this._sort();
    // Neu eingefügte Items direkt selektieren, damit Kontur sichtbar ist
    this.selectedId = item.id;
    this._invalidate();
    return item;
  }

  removeItem(id) { this._snapshot(); this.items = this.items.filter(i => i.id !== id); if (this.selectedId === id) this.selectedId = null; this._invalidate(); }
  bringToFront(id) { const it = this.items.find(i=>i.id===id); if (!it) return; this._snapshot(); it.z = Math.max(...this.items.map(i=>i.z))+1; this._sort(); this._invalidate(); }
  sendToBack(id) { const it = this.items.find(i=>i.id===id); if (!it) return; this._snapshot(); it.z = Math.min(...this.items.map(i=>i.z))-1; this._sort(); this._invalidate(); }

  updateTransform(id, next) {
    if (!this._isRestoring) this._snapshot();
    const it = this.items.find(i=>i.id===id); if (!it) return;
    const prev = { ...it.transform };
    it.transform = { ...it.transform, ...next };
    // Begrenzungsbox berücksichtigen (auch bei Scale/Rotation)
    if (this._boundsEnabled) {
      const clamped = this._clampXYForItem(it, it.transform.x, it.transform.y);
      it.transform = { ...it.transform, x: clamped.x, y: clamped.y };
    }
    if (this._hasOverlap(it)) {
      it.transform = prev; // revert if overlaps
    } else {
      this._updateAabbCache(it);
      this._invalidate();
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
    const opts = { passive: !DRAG_PREVENT_DEFAULT };
    c.addEventListener("pointerdown", (e)=>this._onDown(e), opts);
    c.addEventListener("pointermove", (e)=>this._onMove(e), opts);
    window.addEventListener("pointerup", (e)=>this._onUp(e), opts);
  }

  _pos(e){
    const r = this.canvas.getBoundingClientRect();
    // Auflösung von CSS-Pixeln auf Canvas-Koordinaten abbilden, falls CSS-Skalierung aktiv ist
    const sx = this.canvas.width / r.width;
    const sy = this.canvas.height / r.height;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  }

  _findTopItemAt(gx, gy) {
    // Sicherstellen, dass Konturmasken aktuell sind (für Hit auf Kontur)
    this._ensureCollisionMasks();
    for (let i=this.items.length-1; i>=0; i--) {
      const it = this.items[i];
      if (it.url) { if (hitTestImage(it, gx, gy)) return it; }
      else {
        // Präziserer Test: Inverse Transform der Pointer-Position in lokale Text-Koordinaten
        const rad = (it.transform.rotation * Math.PI) / 180;
        const cos = Math.cos(-rad), sin = Math.sin(-rad);
        const dx = gx - it.transform.x, dy = gy - it.transform.y;
        const lx = (dx * cos - dy * sin) / it.transform.scale;
        const ly = (dx * sin + dy * cos) / it.transform.scale;
        const fontSize = it.fontSize || 16;
        // Textbreite approximieren; draw verwendet center alignment
        const w = Math.max(1, (it.text?.length || 0) * fontSize * 0.6);
        const h = fontSize;
        if (lx >= -w/2 && lx <= w/2 && ly >= -h/2 && ly <= h/2) return it;
      }
    }
    return null;
  }

  _snap(val){ return Math.round(val/GRID_SIZE)*GRID_SIZE; }

  _onDown(e){
    if (DRAG_PREVENT_DEFAULT) try { e.preventDefault(); } catch {}
    // Animation ggf. abbrechen, wenn direkt neu gezogen wird
    this._cancelDropAnim();
    const { x, y } = this._pos(e);
    const hit = this._findTopItemAt(x,y);
    if (hit) {
      // Snapshot vor Beginn einer Manipulation
      this._snapshot();
      this.selectedId = hit.id;
      // Grab-Offset merken, um das Objekt unter dem Cursor zu halten
      const grabDX = x - hit.transform.x;
      const grabDY = y - hit.transform.y;
      this.dragState = { id: hit.id, grabDX, grabDY, lastX: x, lastY: y, pointerId: e.pointerId, startTransform: { ...hit.transform }, lastFree: { x: hit.transform.x, y: hit.transform.y } };
      if (DRAG_USE_POINTER_CAPTURE && this.canvas.setPointerCapture) {
        try { this.canvas.setPointerCapture(e.pointerId); } catch {}
      }
    } else {
      this.selectedId = null; this.dragState = null;
    }
  }

  _onMove(e){
    if (DRAG_PREVENT_DEFAULT) try { e.preventDefault(); } catch {}
    if (!this.dragState) return;
    if (this.dragState.pointerId != null && e.pointerId != null && e.pointerId !== this.dragState.pointerId) return; // anderer Pointer
    const { x, y } = this._pos(e);
    const it = this.items.find(i=>i.id===this.dragState.id);
    if (!it) return;
    // Zielposition: Cursor minus Grab-Offset, damit das Objekt unter der Maus bleibt
    const prev = { ...it.transform };
    let nx = x - this.dragState.grabDX;
    let ny = y - this.dragState.grabDY;
    // optionales Snapping während des Drags
    if (!APPLY_SNAP_ON_DROP) {
      const sx = this._snap(nx), sy = this._snap(ny);
      if (Math.abs(sx-nx) <= SNAP_THRESHOLD) nx = sx;
      if (Math.abs(sy-ny) <= SNAP_THRESHOLD) ny = sy;
    }
    // Helper: angewandte Position übernehmen und letzte Pointer-Position aktualisieren
    const commitTransform = (tx, ty) => {
      if (this._boundsEnabled) {
        const c = this._clampXYForItem(it, tx, ty);
        it.transform = { ...it.transform, x: c.x, y: c.y };
      } else {
        it.transform = { ...it.transform, x: tx, y: ty };
      }
      this.dragState.lastX = x;
      this.dragState.lastY = y;
      this._updateAabbCache(it);
      this._invalidate();
    };

    // Versuch: Zielposition setzen
    if (this._boundsEnabled) {
      const c = this._clampXYForItem(it, nx, ny);
      it.transform = { ...it.transform, x: c.x, y: c.y };
    } else {
      it.transform = { ...it.transform, x: nx, y: ny };
    }
    if (ALLOW_OVERLAP_DURING_DRAG) {
      // Position anwenden (oben bereits gesetzt) und letzte freie Position merken
      if (!this._hasOverlap(it)) {
        if (this.dragState) this.dragState.lastFree = { x: it.transform.x, y: it.transform.y };
      }
      commitTransform(nx, ny);
      return;
    }
    if (!this._hasOverlap(it)) { commitTransform(nx, ny); return; } // frei, alles gut

    // Kollision: ggf. Slide-Strategie anwenden, sonst zurücksetzen
    if (!SLIDE_ON_COLLISION) { it.transform = prev; this._updateAabbCache(it); this._invalidate(); return; }

    // Helper zum Testen ohne Zustand zu verlieren
    const wouldOverlapAt = (tx, ty) => {
      const bak = it.transform;
      if (this._boundsEnabled) {
        const c = this._clampXYForItem(it, tx, ty);
        it.transform = { ...it.transform, x: c.x, y: c.y };
      } else {
        it.transform = { ...it.transform, x: tx, y: ty };
      }
      const ov = this._hasOverlap(it);
      it.transform = bak;
      return ov;
    };

    // 1) Primärachse bestimmen anhand der letzten Pointerbewegung
    const dxp = x - this.dragState.lastX;
    const dyp = y - this.dragState.lastY;
    const primary = Math.abs(dxp) >= Math.abs(dyp) ? "x" : "y";

    // 2) Entlang der freien Achse ausweichen: suche die nächste y (bzw. x), die frei ist
    const trySlidePerp = () => {
      if (primary === "x") {
        for (let off = 0; off <= SLIDE_MAX_PIXELS; off += SLIDE_STEP_PIXELS) {
          // zuerst nahe bei 0, dann ±off
          const cands = off === 0 ? [0] : [off, -off];
          for (const d of cands) {
            const ty = prev.y + d;
            if (!wouldOverlapAt(nx, ty)) { return { x: nx, y: ty }; }
          }
        }
      } else {
        for (let off = 0; off <= SLIDE_MAX_PIXELS; off += SLIDE_STEP_PIXELS) {
          const cands = off === 0 ? [0] : [off, -off];
          for (const d of cands) {
            const tx = prev.x + d;
            if (!wouldOverlapAt(tx, ny)) { return { x: tx, y: ny }; }
          }
        }
      }
      return null;
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
        if (lastFreeY !== prev.y) { return { x: prev.x, y: lastFreeY }; }
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
        if (lastFreeX !== prev.x) { return { x: lastFreeX, y: prev.y }; }
      }
      return null;
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
        if (lastFreeX !== prev.x) { return { x: lastFreeX, y: prev.y }; }
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
        if (lastFreeY !== prev.y) { return { x: prev.x, y: lastFreeY }; }
      }
      return null;
    };

    // Reihenfolge: erst ausweichen, dann teilweise entlang freier Achse, dann teilweise entlang Primärachse; wenn nichts geht: revert
    const p1 = trySlidePerp();
    if (p1) { commitTransform(p1.x, p1.y); return; }
    const p2 = tryPartialPerp();
    if (p2) { commitTransform(p2.x, p2.y); return; }
    const p3 = tryPartialPrimary();
    if (p3) { commitTransform(p3.x, p3.y); return; }
    // nichts möglich: Position beibehalten; Pointer-Position trotzdem mitschreiben für korrekte Primärachse
    it.transform = prev;
    this.dragState.lastX = x;
    this.dragState.lastY = y;
  }

  _onUp(e){
    if (DRAG_PREVENT_DEFAULT) try { e.preventDefault(); } catch {}
    const ds = this.dragState;
    if (!ds) return;
    const it = this.items.find(i=>i.id===ds.id);
    if (it) {
      // Errechne Zielposition (snap + optionale Kollisionsauflösung), ohne sofort zu springen
      let targetX = it.transform.x;
      let targetY = it.transform.y;
      if (APPLY_SNAP_ON_DROP) {
        const sx = this._snap(targetX), sy = this._snap(targetY);
        if (Math.abs(sx-targetX) <= SNAP_THRESHOLD) targetX = sx;
        if (Math.abs(sy-targetY) <= SNAP_THRESHOLD) targetY = sy;
      }
      // Kollisionsauflösung beim Loslassen, falls während Drag erlaubt war
      if (ALLOW_OVERLAP_DURING_DRAG && this._hasOverlap(it) && it.category !== 'person') {
        const prev = { ...it.transform };
        // Test-Helfer: berücksichtigt Begrenzungen beim Prüfen
        const wouldOverlapAt = (tx, ty) => {
          const bak = it.transform;
          if (this._boundsEnabled) {
            const c = this._clampXYForItem(it, tx, ty);
            it.transform = { ...it.transform, x: c.x, y: c.y };
          } else {
            it.transform = { ...it.transform, x: tx, y: ty };
          }
          const ov = this._hasOverlap(it);
          it.transform = bak;
          return ov;
        };

        let found = null;
        // 1) Lokale Achsen-Suche rund um die momentane Position
        for (let off = 0; off <= SLIDE_MAX_PIXELS && !found; off += SLIDE_STEP_PIXELS) {
          const cands = off === 0 ? [[0,0]] : [[off,0],[-off,0],[0,off],[0,-off]];
          for (const [dx,dy] of cands) {
            const tx = prev.x + dx, ty = prev.y + dy;
            if (!wouldOverlapAt(tx, ty)) { found = { x: tx, y: ty }; break; }
          }
        }

        // 2) Radiale Suche um den Drop-Punkt (nach Snap), falls nötig
        if (!found) {
          const angleStep = Math.max(1e-3, (DROP_SEARCH_ANGLE_STEP_DEG * Math.PI) / 180);
          const ox = targetX, oy = targetY;
          for (let r = SLIDE_STEP_PIXELS; r <= DROP_SEARCH_MAX_RADIUS && !found; r += Math.max(1, DROP_SEARCH_STEP_RADIUS)) {
            for (let a = 0; a < Math.PI * 2; a += angleStep) {
              const tx = ox + Math.cos(a) * r;
              const ty = oy + Math.sin(a) * r;
              if (!wouldOverlapAt(tx, ty)) { found = { x: tx, y: ty }; break; }
            }
          }
        }

        // 3) Fallback: letzte freie Drag-Position verwenden, wenn vorhanden
        if (!found && DROP_FALLBACK_TO_LAST_FREE && ds.lastFree) {
          const tx = ds.lastFree.x, ty = ds.lastFree.y;
          if (!wouldOverlapAt(tx, ty)) found = { x: tx, y: ty };
        }

        // 4) Letzter Fallback: ggf. zur Startposition zurück
        if (found) { targetX = found.x; targetY = found.y; }
        else if (DROP_REVERT_TO_START_IF_ALL_FAIL) { targetX = ds.startTransform.x; targetY = ds.startTransform.y; }
        // sonst: bleibt bei targetX/targetY (auch wenn noch overlappt) und wird danach ggf. durch Bounds geklammert
      }

      // Begrenzungsbox anwenden
      if (this._boundsEnabled) {
        const c = this._clampXYForItem(it, targetX, targetY);
        targetX = c.x; targetY = c.y;
      }
      // Personen: direkt setzen und andere Gegenstände wegdrücken (kein Ausweichen der Person)
      if (it.category === 'person') {
        it.transform = { ...it.transform, x: targetX, y: targetY };
        this._pushOthersAwayFrom(it);
      } else {
        // Animation zum Ziel
        const fromX = it.transform.x, fromY = it.transform.y;
        const dx = targetX - fromX, dy = targetY - fromY;
        const dist2 = dx*dx + dy*dy;
        if (ANIMATE_DROP && dist2 > 0.25) {
          this._startDropAnim(it.id, fromX, fromY, targetX, targetY, DROP_ANIM_DURATION_MS);
        } else {
          it.transform = { ...it.transform, x: targetX, y: targetY };
        }
      }
    }
    if (DRAG_USE_POINTER_CAPTURE && this.canvas.releasePointerCapture) {
      try { this.canvas.releasePointerCapture(ds.pointerId); } catch {}
    }
    this.dragState = null;
    this._invalidate();
  }

  _startDropAnim(id, fromX, fromY, toX, toY, dur){
    this.dropAnims.set(id, { fromX, fromY, toX, toY, dur, t0: performance.now() });
    this._scheduleFrame();
  }

  _cancelDropAnim(id){
    if (id != null) { this.dropAnims.delete(id); return; }
    this.dropAnims.clear();
  }

  _tickDropAnim(now){
    if (!this.dropAnims.size) return;
    const finished = [];
    for (const [id, a] of this.dropAnims.entries()) {
      const it = this.items.find(i=>i.id===id);
      if (!it) { finished.push(id); continue; }
      const t = Math.min(1, (now - a.t0) / Math.max(1, a.dur));
      const k = 1 - Math.pow(1 - t, 3); // easeOutCubic
      let x = a.fromX + (a.toX - a.fromX) * k;
      let y = a.fromY + (a.toY - a.fromY) * k;
      if (this._boundsEnabled) { const c = this._clampXYForItem(it, x, y); x = c.x; y = c.y; }
      it.transform = { ...it.transform, x, y };
      if (t >= 1) {
        let fx = a.toX, fy = a.toY;
        if (this._boundsEnabled) { const c = this._clampXYForItem(it, fx, fy); fx = c.x; fy = c.y; }
        it.transform = { ...it.transform, x: fx, y: fy };
        finished.push(id);
      }
      this._updateAabbCache(it);
      this._needsRender = true;
    }
    for (const id of finished) this.dropAnims.delete(id);
  }

  _hasOverlap(it){
    this._ensureCollisionMasks();
    if (!it.url) return false; // texts can overlap
    // AABB-Caches sicherstellen
    for (const obj of this.items) this._updateAabbCache(obj);
    for (const other of this.items) {
      if (other.id === it.id) continue;
      if (!other.url) continue;
      if (masksOverlap(it, other)) return true;
    }
    return false;
  }

  _drawGrid() {
    const { ctx } = this; const w=this.canvas.width, h=this.canvas.height;
    // Grid-Layer bei Größenänderung neu aufbauen
    if (!this._gridCache.canvas || this._gridCache.width !== w || this._gridCache.height !== h || this._gridCache.gridSize !== GRID_SIZE) {
      const off = document.createElement('canvas');
      off.width = w; off.height = h;
      const octx = off.getContext('2d');
      octx.strokeStyle = "#eee"; octx.lineWidth = 1;
      for (let x=0; x<=w; x+=GRID_SIZE) { octx.beginPath(); octx.moveTo(x,0); octx.lineTo(x,h); octx.stroke(); }
      for (let y=0; y<=h; y+=GRID_SIZE) { octx.beginPath(); octx.moveTo(0,y); octx.lineTo(w,y); octx.stroke(); }
      this._gridCache = { canvas: off, width: w, height: h, gridSize: GRID_SIZE };
    }
    ctx.drawImage(this._gridCache.canvas, 0, 0);
  }

  _getBoundsRect(){
    if (!this._boundsEnabled) return null;
    if (this._boundsRect && typeof this._boundsRect.x === "number") return { ...this._boundsRect };
    // Ohne definiertes Rechteck: keine Begrenzung aktiv
    return null;
  }

  _drawBounds(){
    if (!this._boundsEnabled) return;
    const r = this._getBoundsRect(); if (!r) return;
    const { ctx } = this;
    ctx.save();
    if (BOUNDS_STYLE.fill) { ctx.fillStyle = BOUNDS_STYLE.fill; ctx.fillRect(r.x, r.y, r.width, r.height); }
    ctx.lineWidth = BOUNDS_STYLE.lineWidth ?? 2;
    ctx.strokeStyle = BOUNDS_STYLE.stroke ?? "#333";
    if (Array.isArray(BOUNDS_STYLE.dash)) ctx.setLineDash(BOUNDS_STYLE.dash);
    ctx.strokeRect(r.x, r.y, r.width, r.height);
    ctx.restore();
  }

  _textSize(it){
    const fontSize = it.fontSize || 16;
    const fontFamily = it.fontFamily || 'Arial, sans-serif';
    this.ctx.save();
    this.ctx.font = `${fontSize}px ${fontFamily}`;
    const w = Math.max(1, this.ctx.measureText(String(it.text ?? '')).width);
    this.ctx.restore();
    return { w, h: fontSize };
  }

  _aabbForItemAt(it, x, y){
    // Stelle sicher, dass Kollisionsmasken (inkl. Konturbreite) aktuell sind
    this._ensureCollisionMasks();
    const scale = it.transform.scale;
    const rad = (it.transform.rotation * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const outlinePx = Math.max(0, Number(this.outline.width) || 0);
    let iw, ih, offLocalX = 0, offLocalY = 0;
    if (it._img) {
      // Enge Silhouette verwenden (tight bounds) + optionaler Outline-Offset in lokalen Pixeln
      const tight = it.mask?.tight;
      const extraPx = Math.max(0, it._colMaskExtraPx || 0);
      const baseW = Math.max(1, (tight?.width ?? it._img.width));
      const baseH = Math.max(1, (tight?.height ?? it._img.height));
      iw = baseW + 2 * extraPx;
      ih = baseH + 2 * extraPx;
      offLocalX = (tight?.centerOffsetX ?? 0);
      offLocalY = (tight?.centerOffsetY ?? 0);
      // Outline-Offset ändert den Mittelpunkt nicht (zentrisch erweitert), daher kein Zusatz-Offset nötig
    } else {
      const s = this._textSize(it); iw = s.w; ih = s.h;
      // Wichtig: Text-Kontur berücksichtigen, sonst wird die Outline an den Rändern abgeschnitten.
      // Die Stroke-Breite ist in Canvas-Pixeln gegeben, lokal muss sie durch den Scale geteilt werden.
      if (outlinePx > 0) {
        const localPad = outlinePx / Math.max(0.001, scale);
        iw += 2 * localPad;
        ih += 2 * localPad;
      }
    }
    const w = iw * scale, h = ih * scale;
    const hw = w/2, hh = h/2;
    // Verschobenen Mittelpunkt berücksichtigen (enge Maske ist evtl. nicht im Bildzentrum)
    const offX = offLocalX * scale;
    const offY = offLocalY * scale;
    const cx = x + offX * cos - offY * sin;
    const cy = y + offX * sin + offY * cos;
    const corners = [
      { x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }
    ].map(p=>({ x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos }));
    const xs = corners.map(c=>c.x), ys = corners.map(c=>c.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }

  _clampXYForItem(it, x, y){
    const r = this._getBoundsRect(); if (!r) return { x, y };
    const a = this._aabbForItemAt(it, x, y);
    let dx = 0, dy = 0;
    if (a.minX < r.x) dx += (r.x - a.minX);
    if (a.maxX > r.x + r.width) dx += ((r.x + r.width) - a.maxX);
    if (a.minY < r.y) dy += (r.y - a.minY);
    if (a.maxY > r.y + r.height) dy += ((r.y + r.height) - a.maxY);
    return { x: x + dx, y: y + dy };
  }

  _clampItemInBounds(it){
    if (!this._boundsEnabled) return;
    const c = this._clampXYForItem(it, it.transform.x, it.transform.y);
    it.transform = { ...it.transform, x: c.x, y: c.y };
    this._updateAabbCache(it);
  }

  _clampAllItemsInBounds(){
    if (!this._boundsEnabled) return;
    for (const it of this.items) this._clampItemInBounds(it);
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

  _scheduleFrame(){
    if (this._rafHandle != null) return;
    this._rafHandle = requestAnimationFrame((ts)=>this._raf(ts));
  }

  _invalidate(){
    this._needsRender = true;
    this._scheduleFrame();
  }

  _raf(ts){
    this._rafHandle = null;
    this._tickDropAnim(ts);
    if (this._needsRender || this.dropAnims.size) {
      this._render();
      this._needsRender = false;
      // Weiter rendern, solange Animationen laufen
      if (this.dropAnims.size) this._scheduleFrame();
    }
  }

  _render(){
    const { ctx } = this; const w=this.canvas.width, h=this.canvas.height;
    ctx.clearRect(0,0,w,h);
    if (this.showGrid) this._drawGrid();
    this._drawBounds();

    for (const it of this.items) {
      if (it.url) {
        ctx.save();
        ctx.translate(it.transform.x, it.transform.y);
        ctx.rotate((it.transform.rotation*Math.PI)/180);
        ctx.scale(it.transform.scale, it.transform.scale);
        // Silhouetten-Offset (gefüllt, ohne Löcher) via Masken-Dilatation
        const owCanvas = Math.max(0, Number(this.outline.width) || 0);
        if (owCanvas > 0) {
          const radiusImgPx = Math.max(0, Math.round((owCanvas / 2) / Math.max(0.001, it.transform.scale)));
          // Cache für Offset-Bitmap und Kollisionsmaske
          const needRebuild = !it._outlineCache || it._outlineCache.color !== this.outline.color || it._outlineCache.radius !== radiusImgPx;
          if (needRebuild) {
            const solid = solidOffsetFrom(it.mask, radiusImgPx);
            const oc = tintedCanvasFromAlpha(solid.data, this.outline.color);
            it._outlineCache = { color: this.outline.color, radius: radiusImgPx, canvas: oc };
            // Solide Offset-Maske auch für Kollision/Hit-Tests
            it._colMask = solid;
            it._colMaskExtraPx = radiusImgPx;
          }
          const oc = it._outlineCache.canvas;
          const ocw = oc.width, och = oc.height;
          ctx.drawImage(oc, -ocw/2, -och/2);
        }
        // Originalbild oben drauf
        if (this.renderShapes) ctx.drawImage(it._img, -it._img.width/2, -it._img.height/2);
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(it.transform.x, it.transform.y);
        ctx.rotate((it.transform.rotation*Math.PI)/180);
        ctx.scale(it.transform.scale, it.transform.scale);
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = `${it.fontSize}px ${it.fontFamily}`;
        // Textkontur außen (immer sichtbar)
        const owText = Math.max(0, Number(this.outline.width) || 0);
        if (owText > 0) {
          const localW = Math.max(0.5, owText / Math.max(0.001, it.transform.scale));
          ctx.strokeStyle = this.outline.color;
          ctx.lineWidth = localW; // zentrierte Kontur: entspricht owText in Canvas-Pixeln
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.strokeText(it.text, 0, 0);
        }
        // Text-Füllung optional
        if (this.renderShapes) { ctx.fillStyle = it.color; ctx.fillText(it.text, 0, 0); }
        ctx.restore();
      }
    }

    this._drawGuides();
  }

  _updateAabbCache(it){
    if (!it) return;
    if (!it.url && !it._img) { if (it._aabbCache) delete it._aabbCache; return; }
    // Nutzt ähnliche Logik wie _aabbForItemAt, cacht aber nur aktuelle Position
    const scale = it.transform.scale;
    const rad = (it.transform.rotation * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const outlinePx = Math.max(0, Number(this.outline.width) || 0);
    let iw, ih, offLocalX = 0, offLocalY = 0;
    if (it._img) {
      iw = it.mask?.tight?.width ?? it._img.width;
      ih = it.mask?.tight?.height ?? it._img.height;
      offLocalX = (it.mask?.tight?.centerOffsetX ?? 0);
      offLocalY = (it.mask?.tight?.centerOffsetY ?? 0);
      if (outlinePx > 0) {
        const localPad = outlinePx / Math.max(0.001, scale);
        iw += 2 * localPad; ih += 2 * localPad;
      }
    } else {
      const s = this._textSize(it); iw = s.w; ih = s.h;
      if (outlinePx > 0) {
        const localPad = outlinePx / Math.max(0.001, scale);
        iw += 2 * localPad; ih += 2 * localPad;
      }
    }
    const w = iw * scale, h = ih * scale;
    const hw = w/2, hh = h/2;
    const offX = offLocalX * scale;
    const offY = offLocalY * scale;
    const cx = it.transform.x + offX * cos - offY * sin;
    const cy = it.transform.y + offX * sin + offY * cos;
    const corners = [
      { x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }
    ].map(p=>({ x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos }));
    const xs = corners.map(c=>c.x), ys = corners.map(c=>c.y);
    it._aabbCache = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), rot: it.transform.rotation, x: it.transform.x, y: it.transform.y, scale: it.transform.scale, outline: outlinePx };
  }
}
