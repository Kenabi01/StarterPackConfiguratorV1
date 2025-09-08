import { API_BASE, DEMO_MODE } from "../settings.js";

export class ConfigManager {
  constructor(engine) { this.engine = engine; }

  toJSON() { return this.engine.serialize(); }

  async save() {
    const payload = this.toJSON();
    // Fallback: LocalStorage in Demo-Modus oder bei API-Fehler
    if (DEMO_MODE) {
      const id = payload.id || `cfg_${Date.now().toString(36)}`;
      try { localStorage.setItem(`starterpack_cfg_${id}`, JSON.stringify(payload)); } catch {}
      return { ok: true, id, storage: 'local' };
    }
    try {
      const res = await fetch(`${API_BASE}/configs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload })
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Save failed");
      return j;
    } catch (e) {
      // Netzwerk/404-Fallback
      const id = payload.id || `cfg_${Date.now().toString(36)}`;
      try { localStorage.setItem(`starterpack_cfg_${id}`, JSON.stringify(payload)); } catch {}
      return { ok: true, id, storage: 'local', warning: e?.message };
    }
  }

  async load(id) {
    // LocalStorage zuerst versuchen, um schnelle Wiederherstellung zu ermöglichen
    try {
      const raw = localStorage.getItem(`starterpack_cfg_${id}`);
      if (raw) {
        const doc = JSON.parse(raw);
        await this.engine.applySerialized(doc);
        return { ok: true, id, storage: 'local' };
      }
    } catch {}
    if (DEMO_MODE) return { ok: false, error: 'Nicht gefunden (Demo-Storage leer)' };
    const res = await fetch(`${API_BASE}/configs?id=${encodeURIComponent(id)}`);
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || "Load failed");
    const doc = j.record.payload || j.record;
    await this.engine.applySerialized(doc);
    return j;
  }
}
