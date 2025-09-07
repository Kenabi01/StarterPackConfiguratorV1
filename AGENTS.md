# Zweck
Der Konfigurator dient dazu, visuelle Inhalte flexibel zu kombinieren, anzupassen und wiederherstellbar zu speichern.
Er ermöglicht eine interaktive Vorschau und dokumentiert alle Konfigurationen strukturiert.
Konfigurator wird per iFrame in die Vercel Website eingefügt. 

# Kernprinzip
	•	Interaktive Kombination von Bildern von Menschen, Gegenständen und Texten in einer Live-Vorschau
	•	Einheitliche Verwaltung und Wiederherstellbarkeit aller Konfigurationen über strukturierte Dateien (z. B. JSON)
	•	Klare Trennung und Verarbeitung von Eingaben (Text, Bild) je nach Kategorie
	•	Flexible Anpassung von Position, Größe, Rotation, Farbe und Schrift
	•	Automatische Organisation und eindeutige Identifizierung aller erzeugten Inhalte
	•	Mechanismen zur Objekttrennung bei komplexen Bildern
	•	Technische Basis: modularer, erweiterbarer Code mit Backend-Anbindung
	•	Transparente Nutzung über Credit-System und direkte Shop-Integration

# Struktur
	•	EINSTELLUNGEN-Block: Alle veränderbaren Werte (Limits, Farben, API-Keys, Verzeichnisse etc.) ganz oben sammeln, klar kommentieren, sodass Laien sie anpassen können.
	•	Modularität: Jede Funktion oder Klasse hat nur eine klar abgegrenzte Aufgabe. Keine monolithischen Dateien.
	•	Erweiterbarkeit: Code so strukturieren, dass neue Kategorien, Eingabearten oder APIs ohne tiefen Eingriff ergänzt werden können.
	•	Klare Trennung: Frontend (UI, Vorschau, Interaktion) und Backend (API-Anbindung, Dateiverwaltung, Speicherung) strikt getrennt halten.
	•	Konfigurierbarkeit: Alle Hardcodings vermeiden. Stattdessen Konstanten, ENV-Variablen oder Config-Dateien verwenden.
	•	Dokumentation im Code: Kommentare nur da, wo für spätere Änderungen nötig. Kein Fließtext, sondern präzise Hinweise.
	•	IDs und Dateien: Alle generierten Dateien mit eindeutigen IDs versehen. IDs auch in JSON-Konfigurationsdateien speichern.

⸻
