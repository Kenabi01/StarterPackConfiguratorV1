import { API_BASE, DEFAULT_FONTS, DEFAULT_TEXT_COLOR, DEMO_MODE } from "../settings.js";
import { generatePlaceholderPng } from "../utils/PlaceholderPng.js";

export class Controls {
  constructor(host, engine, configManager) {
    this.host = host; this.engine = engine; this.cm = configManager;
    this.userId = "demo";
    this._render();
    this._tickCredits();
  }

  _el(html) { const d=document.createElement("div"); d.innerHTML=html.trim(); return d.firstChild; }

  _render() {
    const container = document.createElement("div");
    container.appendChild(this._genPerson());
    container.appendChild(this._genObject());
    container.appendChild(this._splitTool());
    container.appendChild(this._textTool());
    container.appendChild(this._selectionTool());
    container.appendChild(this._saveLoad());
    container.appendChild(this._creditsPanel());
    this.host.appendChild(container);
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
        const url = generatePlaceholderPng(); // transparentes PNG mit Random-Form/-Farbe
        await this.engine.addImageItem({ id, url, category: 'person' });
        return;
      }
      const file = el.querySelector('#p_img').files?.[0];
      let baseImage = null;
      if (file) baseImage = await this._fileToDataURL(file);
      const res = await fetch(`${API_BASE}/generate-image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: 'person', prompt, baseImage, userId: this.userId })});
      const j = await res.json();
      if (!j.ok) return alert(j.error || 'Fehler');
      await this.engine.addImageItem({ id: j.id, url: j.url, category: 'person' });
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
        await this.engine.addImageItem({ id, url, category: 'object' });
        return;
      }
      const res = await fetch(`${API_BASE}/generate-image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: 'object', prompt, userId: this.userId })});
      const j = await res.json();
      if (!j.ok) return alert(j.error || 'Fehler');
      await this.engine.addImageItem({ id: j.id, url: j.url, category: 'object' });
      this._tickCredits();
    });
    return el;
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
      if (DEMO_MODE) {
        // Simuliere 3 Teile als PNGs mit unterschiedlicher Form/Farbe
        for (let i=1;i<=3;i++) {
          const id = `demo_split_p${i}_${Date.now().toString(36)}`;
          const url = generatePlaceholderPng();
          await this.engine.addImageItem({ id, url, category: 'object' });
        }
        return;
      }
      if (!file) return alert('PNG wählen');
      const dataUrl = await this._fileToDataURL(file);
      const res = await fetch(`${API_BASE}/split-png`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: dataUrl, userId: this.userId })});
      const j = await res.json();
      if (!j.ok) return alert(j.error || 'Fehler');
      for (const p of j.parts) {
        await this.engine.addImageItem({ id: p.id, url: p.url, category: 'object' });
      }
      this._tickCredits();
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
