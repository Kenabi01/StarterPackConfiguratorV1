StarterPack Konfigurator — Monorepo

Zweck: Interaktiver Konfigurator zur Kombination von Personen, Gegenständen und Text mit Live‑Vorschau, speicherbarer JSON‑Konfiguration, Credits und Shop‑Anbindung. Frontend ist iFrame‑fähig, Backend über Vercel Functions.

Verzeichnisse
- apps/configurator: Statische Web‑App (ES‑Module) mit Canvas‑Engine und UI
- api: Vercel Serverless‑Funktionen (OpenAI, Config‑Speicher, PNG‑Split, Credits, Shopify‑Stub)
- schema: JSON‑Schema für Konfigurationsdatei

Wichtige Einstellungen
- api/_settings.ts: Alle Backend‑Einstellungen (Limits, Credits, Speicher, API‑Keys)
- apps/configurator/src/settings.js: Alle Frontend‑Einstellungen (Limits, Raster, Farben, API‑Basis)

Lokale Entwicklung
1) Setze Umgebungsvariablen (OPENAI_API_KEY etc.)
2) Starte mit Vercel CLI oder beliebigem Static Server + proxy auf /api

Iframe Einbindung
<iframe src="/" style="width:100%; height:800px; border:0" allow="clipboard-write; clipboard-read"></iframe>

Hinweise
- Datei‑Speicherung ist lokal (./.data). In Produktion Storage‑Adapter (S3/Blob) implementieren.
- PNG‑Split nutzt 8‑fach Nachbarschaft und überspringt Kleinstkomponenten.
- Nicht‑Überlappung basiert auf Alpha‑Masken‑Sampling (approx.).

