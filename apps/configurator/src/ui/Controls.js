import { API_BASE, DEFAULT_FONTS, DEFAULT_TEXT_COLOR, DEMO_MODE, OUTLINE_COLOR, OUTLINE_WIDTH, MAX_PEOPLE, MAX_OBJECTS, LIBRARY_COLUMNS, LIBRARY_GAP_PX, LIBRARY_THUMB_RADIUS, PLACEHOLDER_PNG, PERSON_PLACEHOLDER_PNG } from "../settings.js";
import { generatePlaceholderPng } from "../utils/PlaceholderPng.js";
import { clientSplitPng } from "../utils/ClientSplit.js";

export class Controls {
  constructor(host, engine, configManager) {
    this.host = host; this.engine = engine; this.cm = configManager;
    this.userId = "demo";
    this.library = { person: [], object: [] }; // {id,url,category,placed}
    this._render();
    this._tickCredits();
    // Sync Library-Badges, falls Items außerhalb der Bibliothek entfernt/platziert werden
    this._libSyncTimer = setInterval(()=>this._syncLibraryPlaced(), 500);
  }

  _el(html) { const d=document.createElement("div"); d.innerHTML=html.trim(); return d.firstChild; }

  _render() {
    const container = document.createElement("div");
    container.appendChild(this._historyTool());
    container.appendChild(this._genPerson());
    container.appendChild(this._genObject());
    container.appendChild(this._librarySection());
    container.appendChild(this._splitTool());
    container.appendChild(this._textTool());
    container.appendChild(this._layoutTool());
    container.appendChild(this._selectionTool());
    container.appendChild(this._outlineTool());
    container.appendChild(this._viewTool());
    container.appendChild(this._saveLoad());
    container.appendChild(this._creditsPanel());
    this.host.appendChild(container);
  }

  _historyTool() {
    const el = this._el(`
      <section class="row">
        <h4>Verlauf</h4>
        <button id="undo_btn">Rückgängig</button>
      </section>
    `);
    const btn = el.querySelector('#undo_btn');
    const tick = async () => {
      try { btn.disabled = !this.engine.canUndo || !this.engine.canUndo(); } catch { btn.disabled = false; }
    };
    // einfache periodische Aktivierung/Deaktivierung (keine Events vorhanden)
    tick();
    setInterval(tick, 500);
    btn.addEventListener('click', async ()=>{
      await this.engine.undo();
      // Bibliothek-Status mit Canvas syncen
      this._syncLibraryPlaced();
    });
    return el;
  }

  _genPerson() {
    const el = this._el(`
      <section class="row">
        <h4>Person generieren</h4>
        <label>Prompt</label>
        <input type="text" id="p_prompt" placeholder="z.B. sportlicher Mann mit Baseballcap" />
        <label>Referenzbild (optional PNG/JPG)</label>
        <input type="file" id="p_img" accept="image/*" />
        <button id="p_run">Generieren</button>
      </section>
    `);
    el.querySelector('#p_run').addEventListener('click', async () => {
      const prompt = el.querySelector('#p_prompt').value.trim();
      if (!prompt) return alert('Bitte Prompt eingeben');
      if (DEMO_MODE) {
        const id = `demo_person_${Date.now().toString(36)}`;
        // Personen: andere Formen, 2× so breit und 4× so hoch wie Gegenstände
        const base = PLACEHOLDER_PNG.size;
        const width = Math.max(2, Math.round(base * (PERSON_PLACEHOLDER_PNG.widthFactor || 2)));
        const height = Math.max(2, Math.round(base * (PERSON_PLACEHOLDER_PNG.heightFactor || 4)));
        const url = generatePlaceholderPng({
          width,
          height,
          shapes: PERSON_PLACEHOLDER_PNG.shapes,
          colors: PERSON_PLACEHOLDER_PNG.colors || PLACEHOLDER_PNG.colors,
          stroke: PERSON_PLACEHOLDER_PNG.stroke ?? PLACEHOLDER_PNG.stroke,
          glossy: PERSON_PLACEHOLDER_PNG.glossy ?? PLACEHOLDER_PNG.glossy,
          jitterRotationDeg: PERSON_PLACEHOLDER_PNG.jitterRotationDeg ?? PLACEHOLDER_PNG.jitterRotationDeg
        });
        this._addToLibrary({ id, url, category: 'person' });
        return;
      }
      const file = el.querySelector('#p_img').files?.[0];
      let baseImage = null;
      if (file) baseImage = await this._fileToDataURL(file);
      const res = await fetch(`${API_BASE}/generate-image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: 'person', prompt, baseImage, userId: this.userId })});
      const j = await res.json();
      if (!j.ok) return alert(j.error || 'Fehler');
      this._addToLibrary({ id: j.id, url: j.url, category: 'person' });
      this._tickCredits();
    });
    return el;
  }

  _genObject() {
    const el = this._el(`
      <section class="row">
        <h4>Gegenstand generieren</h4>
        <label>Prompt</label>
        <input type="text" id="o_prompt" placeholder="z.B. rote Wasserflasche" />
        <button id="o_run">Generieren</button>
      </section>
    `);
    el.querySelector('#o_run').addEventListener('click', async () => {
      const prompt = el.querySelector('#o_prompt').value.trim();
      if (!prompt) return alert('Bitte Prompt eingeben');
      if (DEMO_MODE) {
        const id = `demo_obj_${Date.now().toString(36)}`;
        const url = generatePlaceholderPng(); // transparentes PNG mit Random-Form/-Farbe
        this._addToLibrary({ id, url, category: 'object' });
        return;
      }
      const res = await fetch(`${API_BASE}/generate-image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: 'object', prompt, userId: this.userId })});
      const j = await res.json();
      if (!j.ok) return alert(j.error || 'Fehler');
      this._addToLibrary({ id: j.id, url: j.url, category: 'object' });
      this._tickCredits();
    });
    return el;
  }

  _librarySection() {
    const el = this._el(`
      <section class="row">
        <h4>Bibliothek</h4>
        <div style="font-size:12px;color:#666;margin-bottom:6px">Tippe ein Icon zum Platzieren/Entfernen.</div>
        <div>
          <div style="font-size:12px;color:#444;margin:6px 0">Personen</div>
          <div id="lib_person" class="lib-grid"></div>
        </div>
        <div>
          <div style="font-size:12px;color:#444;margin:6px 0">Gegenstände</div>
          <div id="lib_object" class="lib-grid"></div>
        </div>
      </section>
    `);
    this._libPersonEl = el.querySelector('#lib_person');
    this._libObjectEl = el.querySelector('#lib_object');
    // Fallback: Grid-Styles inline setzen, falls globales CSS nicht greift
    try {
      for (const host of [this._libPersonEl, this._libObjectEl]) {
        const s = host.style;
        s.display = 'grid';
        s.gridTemplateColumns = `repeat(${LIBRARY_COLUMNS}, 1fr)`;
        s.gap = `${LIBRARY_GAP_PX}px`;
      }
    } catch {}
    this._renderLibrary();
    return el;
  }

  _addToLibrary(entry) {
    const cat = entry.category === 'person' ? 'person' : 'object';
    this.library[cat].unshift({ ...entry, placed: false, ts: Date.now() });
    const limit = cat === 'person' ? MAX_PEOPLE : MAX_OBJECTS;
    if (Number.isFinite(limit) && limit > 0 && this.library[cat].length > limit) {
      this.library[cat].length = limit;
    }
    this._renderLibrary();
  }

  async _toggleLibraryItem(item) {
    if (item.placed) {
      this.engine.removeItem(item.id);
      item.placed = false;
      this._renderLibrary();
      return;
    }
    // Falls Item bereits anderswie im Canvas ist (ID-Kollision), zuerst entfernen
    if (this.engine.hasItem(item.id)) this.engine.removeItem(item.id);
    await this.engine.placeImageItem({ id: item.id, url: item.url, category: item.category });
    item.placed = true;
    this._renderLibrary();
  }

  _renderLibrary() {
    if (!this._libPersonEl || !this._libObjectEl) return;
    const render = (host, list) => {
      host.innerHTML = '';
      const items = [...list].sort((a,b)=> (b.ts||0) - (a.ts||0));
      for (const it of items) {
        const cell = document.createElement('div');
        cell.className = 'thumb' + (it.placed ? ' placed' : '');
        // Inline-Fallback-Stile für kompakte, nebeneinander stehende Thumbs
        Object.assign(cell.style, {
          position: 'relative', width: '100%', aspectRatio: '1 / 1', border: '1px solid #ddd',
          borderRadius: `${LIBRARY_THUMB_RADIUS}px`, background: '#fafafa', cursor: 'pointer', overflow: 'hidden'
        });
        cell.title = it.placed ? 'Im Canvas – tippen zum Entfernen' : 'Tippen zum Platzieren';
        const img = document.createElement('img');
        img.src = it.url; img.alt = it.id; img.loading = 'lazy';
        const inset = Math.max(1, Math.floor(LIBRARY_GAP_PX / 2));
        Object.assign(img.style, {
          position: 'absolute', top: `${inset}px`, left: `${inset}px`, right: `${inset}px`, bottom: `${inset}px`,
          width: `calc(100% - ${inset*2}px)`, height: `calc(100% - ${inset*2}px)`, objectFit: 'contain', background: 'transparent'
        });
        cell.appendChild(img);
        const badge = document.createElement('div');
        badge.className = 'badge';
        badge.textContent = it.placed ? '✓' : '+';
        Object.assign(badge.style, {
          position: 'absolute', top: '1px', right: '1px', background: '#0008', color: '#fff',
          fontSize: '9px', lineHeight: '12px', padding: '0 4px', borderRadius: '999px'
        });
        cell.appendChild(badge);
        cell.addEventListener('click', ()=>this._toggleLibraryItem(it));
        host.appendChild(cell);
      }
    };
    render(this._libPersonEl, this.library.person);
    render(this._libObjectEl, this.library.object);
  }

  _syncLibraryPlaced() {
    let changed = false;
    const sync = (arr) => {
      for (const it of arr) {
        const now = this.engine.hasItem(it.id);
        if (now !== it.placed) { it.placed = now; changed = true; }
      }
    };
    sync(this.library.person);
    sync(this.library.object);
    if (changed) this._renderLibrary();
  }

  _splitTool() {
    const el = this._el(`
      <section class="row">
        <h4>PNG aufteilen</h4>
        <input type="file" id="s_img" accept="image/png" />
        <button id="s_run">Splitten</button>
      </section>
    `);
    el.querySelector('#s_run').addEventListener('click', async () => {
      const file = el.querySelector('#s_img').files?.[0];
      const btn = el.querySelector('#s_run');
      if (DEMO_MODE) {
        // Simuliere 3 Teile als PNGs mit unterschiedlicher Form/Farbe
        for (let i=1;i<=3;i++) {
          const id = `demo_split_p${i}_${Date.now().toString(36)}`;
          const url = generatePlaceholderPng();
          await this.engine.placeImageItem({ id, url, category: 'object' });
        }
        return;
      }
      if (!file) return alert('PNG wählen');
      try {
        btn.disabled = true; const prev = btn.textContent; btn.textContent = 'Splitte…';
        const dataUrl = await this._fileToDataURL(file);
        const res = await fetch(`${API_BASE}/split-png`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: dataUrl, userId: this.userId })});
        let j;
        const text = await res.text();
        try { j = JSON.parse(text); } catch { j = { ok: false, error: `HTTP ${res.status}`, raw: text }; }
        if (!res.ok || !j.ok) {
          // Fallback: client-side split for 404 or missing backend
          if (res.status === 404) {
            const parts = await clientSplitPng(dataUrl);
            if (!parts.length) { alert('Keine separaten Teile erkannt (Client-Split).'); return; }
            for (const p of parts) await this.engine.placeImageItem({ id: p.id, url: p.url, category: 'object' });
            return;
          }
          const msg = (j && j.error) ? j.error : `Fehler beim Splitten (Status ${res.status})`;
          alert(msg);
          return;
        }
        if (!j.parts || j.parts.length === 0) {
          // Fallback: try client-side if server found nothing
          const parts = await clientSplitPng(dataUrl);
          if (!parts.length) { alert('Keine separaten Teile erkannt (Transparenz prüfen).'); return; }
          for (const p of parts) await this.engine.placeImageItem({ id: p.id, url: p.url, category: 'object' });
          return;
        }
        for (const p of j.parts) await this.engine.placeImageItem({ id: p.id, url: p.url, category: 'object' });
        this._tickCredits();
      } catch (e) {
        alert(`Netzwerk-/API-Fehler: ${e?.message || e}`);
      } finally {
        btn.disabled = false; btn.textContent = 'Splitten';
      }
    });
    return el;
  }

  _textTool() {
    const el = this._el(`
      <section class="row">
        <h4>Text einfügen</h4>
        <label>Text</label>
        <input id="t_text" type="text" placeholder="Dein Text" />
        <label>Schrift</label>
        <select id="t_font"></select>
        <label>Größe</label>
        <input id="t_size" type="number" value="32" />
        <label>Farbe</label>
        <input id="t_color" type="color" value="${DEFAULT_TEXT_COLOR}" />
        <button id="t_add">Hinzufügen</button>
      </section>
    `);
    const sel = el.querySelector('#t_font');
    DEFAULT_FONTS.forEach(f=>{ const o=document.createElement('option'); o.value=f; o.textContent=f; sel.appendChild(o); });
    el.querySelector('#t_add').addEventListener('click', ()=>{
      const text = el.querySelector('#t_text').value || 'Text';
      const fontFamily = el.querySelector('#t_font').value;
      const fontSize = parseInt(el.querySelector('#t_size').value,10) || 32;
      const color = el.querySelector('#t_color').value || DEFAULT_TEXT_COLOR;
      const id = `txt_${Date.now().toString(36)}`;
      this.engine.addTextItem({ id, text, fontFamily, fontSize, color });
    });
    return el;
  }

  _selectionTool() {
    const el = this._el(`
      <section class="row">
        <h4>Auswahl</h4>
        <div><button id="sel_front">Nach vorn</button> <button id="sel_back">Nach hinten</button></div>
        <label>Skalierung</label>
        <input id="sel_scale" type="range" min="0.1" max="2" step="0.01" value="1" />
        <label>Rotation</label>
        <input id="sel_rot" type="range" min="-180" max="180" step="1" value="0" />
        <div style="margin-top:6px"><button id="sel_del">Löschen</button></div>
      </section>
    `);
    const upd = () => {
      const it = this.engine.getSelected();
      if (!it) return;
      el.querySelector('#sel_scale').value = String(it.transform.scale);
      el.querySelector('#sel_rot').value = String(it.transform.rotation);
    };
    setInterval(upd, 200);
    el.querySelector('#sel_front').addEventListener('click', ()=>{ const it=this.engine.getSelected(); if (it) this.engine.bringToFront(it.id); });
    el.querySelector('#sel_back').addEventListener('click', ()=>{ const it=this.engine.getSelected(); if (it) this.engine.sendToBack(it.id); });
    el.querySelector('#sel_scale').addEventListener('input', (e)=>{ const it=this.engine.getSelected(); if (it) this.engine.updateTransform(it.id, { scale: parseFloat(e.target.value) }); });
    el.querySelector('#sel_rot').addEventListener('input', (e)=>{ const it=this.engine.getSelected(); if (it) this.engine.updateTransform(it.id, { rotation: parseFloat(e.target.value) }); });
    el.querySelector('#sel_del').addEventListener('click', ()=>{ const it=this.engine.getSelected(); if (it) this.engine.removeItem(it.id); });
    return el;
  }

  _outlineTool() {
    const el = this._el(`
      <section class="row">
        <h4>Kontur</h4>
        <label>Farbe</label>
        <input id="ol_color" type="color" value="${OUTLINE_COLOR}" />
        <label>Breite (px)</label>
        <input id="ol_width" type="number" min="0" max="64" step="1" value="${OUTLINE_WIDTH}" />
      </section>
    `);
    const colorEl = el.querySelector('#ol_color');
    const widthEl = el.querySelector('#ol_width');
    colorEl.addEventListener('input', (e)=>{
      const val = e.target.value;
      this.engine.setOutlineColor(val);
    });
    widthEl.addEventListener('input', (e)=>{
      const n = parseInt(e.target.value, 10);
      this.engine.setOutlineWidth(Number.isFinite(n) ? n : OUTLINE_WIDTH);
    });
    return el;
  }

  _viewTool() {
    const el = this._el(`
      <section class="row">
        <h4>Ansicht</h4>
        <label style="display:flex; gap:8px; align-items:center">
          <input id="view_only_outline" type="checkbox" /> Nur Konturen anzeigen
        </label>
      </section>
    `);
    const cb = el.querySelector('#view_only_outline');
    cb.addEventListener('change', ()=>{
      this.engine.setRenderShapes(!cb.checked);
    });
    return el;
  }

  // Arbeitsbereich (Box) wurde aus der UI entfernt. Bounds werden über settings festgelegt.

  _layoutTool() {
    const el = this._el(`
      <section class="row">
        <h4>Anordnen</h4>
        <button id="arrange_even">Ordnen</button>
      </section>
    `);
    el.querySelector('#arrange_even').addEventListener('click', ()=>{
      this.engine.arrangeItemsEvenly();
    });
    return el;
  }

  _saveLoad() {
    const el = this._el(`
      <section class="row">
        <h4>Speichern / Laden</h4>
        <div style="display:flex; gap:6px">
          <button id="cfg_save">Speichern</button>
          <input id="cfg_id" type="text" placeholder="Config-ID" />
          <button id="cfg_load">Laden</button>
        </div>
      </section>
    `);
    el.querySelector('#cfg_save').addEventListener('click', async ()=>{
      const j = await this.cm.save();
      el.querySelector('#cfg_id').value = j.id;
      alert('Gespeichert als ' + j.id);
    });
    el.querySelector('#cfg_load').addEventListener('click', async ()=>{
      const id = el.querySelector('#cfg_id').value.trim();
      if (!id) return alert('ID angeben');
      await this.cm.load(id);
    });
    return el;
  }

  _creditsPanel() {
    const el = this._el(`
      <section class="row">
        <h4>Credits</h4>
        <div>Verfügbar: <strong id="cr_val">…</strong></div>
      </section>
    `);
    this._crEl = el.querySelector('#cr_val');
    return el;
  }

  async _tickCredits() {
    try {
      if (DEMO_MODE) { this._crEl.textContent = '∞ (Demo)'; return; }
      const res = await fetch(`${API_BASE}/credits?userId=${encodeURIComponent(this.userId)}`);
      const j = await res.json();
      if (j.ok) this._crEl.textContent = String(j.credits);
    } catch {}
  }

  async _fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file);
    });
  }

  _placeholderSVG(w, h, text, color='#e8e8e8') {
    const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const lines = esc(text).split('\n');
    const lh = 18;
    const cy = (h - (lines.length-1)*lh)/2;
    const tspans = lines.map((ln,i)=>`<tspan x="${w/2}" dy="${i===0?0:lh}">${ln}</tspan>`).join('');
    const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${color}"/><rect x="5" y="5" width="${w-10}" height="${h-10}" rx="12" ry="12" fill="white" stroke="#bbb"/><text x="${w/2}" y="${cy}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#333">${tspans}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
}
