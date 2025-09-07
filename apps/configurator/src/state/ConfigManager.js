import { API_BASE } from "../settings.js";

export class ConfigManager {
  constructor(engine) { this.engine = engine; }

  toJSON() { return this.engine.serialize(); }

  async save() {
    const payload = this.toJSON();
    const res = await fetch(`${API_BASE}/configs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload })
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || "Save failed");
    return j;
  }

  async load(id) {
    const res = await fetch(`${API_BASE}/configs?id=${encodeURIComponent(id)}`);
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || "Load failed");
    // Clear and recreate items
    this.engine.items = [];
    const doc = j.record.payload || j.record;
    const zsorted = [...doc.items].sort((a,b)=>a.z-b.z);
    for (const it of zsorted) {
      if (it.url) await this.engine.addImageItem(it);
      else this.engine.addTextItem(it);
      this.engine.updateTransform(it.id, it.transform);
    }
    return j;
  }
}

