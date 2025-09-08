# Zweck
Ein Online-Konfigurator wird per iFrame in eine Website eingebettet und ist für Smartphones optimiert. Nutzer können Produkte mit Bildern und Texten individuell gestalten, speichern und später wieder aufrufen. Ein Creditsystem und die Shop-Anbindung regeln Kosten und Verkauf.

# Kernprinzip
	•	Einbettung per iFrame in eine Website, optimiert für Smartphones
	•	Individuelle Produktgestaltung mit Bildern und Texten
	•	Speicherung und exakte Wiederherstellung jeder Konfiguration
	•	Creditsystem zur Kostenkontrolle
	•	Shop-Anbindung für direkte Vermarktung

# Struktur
		•	EINSTELLUNGEN-Block: Alle veränderbaren Werte zentral und kommentiert am Anfang. Keine Hardcodings, sondern Konstanten, ENV-Variablen oder Config-Dateien.
	•	Trennung: Frontend/Backend strikt getrennt. Daten und Logik, interne Details und Schnittstellen sauber kapseln.
	•	Code-Qualität: Modular, verständliche Namen, PEP8, keine magischen Zahlen, DRY-Prinzip, klare Schnittstellen.
	•	Wiederverwendbarkeit & Erweiterbarkeit: Kleine, unabhängige Module/Funktionen, flexible Schnittstellen, einfache Erweiterung.
	•	Testbarkeit: Unit-Tests von Anfang an, automatisiert mit pytest/unittest.
	•	Dokumentation: Prägnante Kommentare/Docstrings mit Fokus auf Zweck.
	•	Fehler- & Performancebewusstsein: Robuste Fehlerbehandlung, effiziente Datenstrukturen, unnötige Wiederholungen vermeiden.
	•	Organisation: Eindeutige IDs für Dateien/Konfigs, Versionskontrolle mit Git, schrittweise Entwicklung.