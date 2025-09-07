// EINSTELLUNGEN — Anpassen erlaubt: Werte sind bewusst ganz oben platziert
// Limits (änderbar)
export const MAX_PEOPLE = 6; // Max. Personen-Bilder in der Vorschau
export const MAX_OBJECTS = 12; // Max. Gegenstands-Bilder in der Vorschau

// Raster & Snapping (änderbar)
export const GRID_SIZE = 16; // Rasterweite in px
export const SNAP_THRESHOLD = 8; // Fangschwelle in px
export const SHOW_GRID_DEFAULT = true; // Raster per Default sichtbar

// Darstellung (änderbar)
export const OUTLINE_COLOR = "#00AEEF"; // Konturfarbe der Elemente
export const OUTLINE_WIDTH = 2; // Breite der Kontur in px
export const GUIDE_COLOR = "#FF00AA"; // Hilfslinienfarbe

// Texte (änderbar)
export const DEFAULT_FONTS = ["Inter", "Arial", "Roboto", "Georgia", "Times New Roman"]; // erlaubte Schriften
export const DEFAULT_TEXT_COLOR = "#222"; // Standard Textfarbe

// API Endpunkte (änderbar)
export const API_BASE = "/api"; // Basis-Route, bei externer Einbindung anpassen

// iFrame Herkunft (änderbar)
export const IFRAME_ALLOWED_PARENT_ORIGINS = ["*"]; // Liste erlaubter Eltern-Domains

// Demo-Modus (änderbar)
// true = Verwendet Platzhalterbilder statt Backend-APIs, ideal für lokalen Test ohne Server
export const DEMO_MODE = true;

// Kollision/Slide-Verhalten (änderbar)
// Aktiviert seitliches Ausweichen ("sliden") bei Kollision während des Ziehens
export const SLIDE_ON_COLLISION = true;
// Maximale Ausweichdistanz entlang der freien Achse (in px)
export const SLIDE_MAX_PIXELS = 64;
// Schrittweite bei der Suche nach einer freien Position (in px)
export const SLIDE_STEP_PIXELS = 4;

// Kollisionsprüfung (änderbar)
// Alpha-Schwelle für Masken (0..255); höhere Werte = weniger empfindlich an halbdurchsichtigen Kanten
export const MASK_ALPHA_THRESHOLD = 10;
// Minimaler Abtastschritt in Bildpixeln beim Masken-Sampling (1 = höchste Präzision)
export const COLLISION_SAMPLE_MIN_STEP = 1;

// Platzhalter-PNG (änderbar)
// Größe, erlaubte Formen und Farbpalette für generierte Platzhalter-Bilder (transparenter Hintergrund)
export const PLACEHOLDER_PNG = {
  size: 256, // Kantenlänge in px
  shapes: ["circle", "rect", "triangle", "star", "hexagon", "blob"],
  // Primärfarben für Füllung; wird zufällig gewählt
  colors: [
    "#FF6B6B", "#4ECDC4", "#FFD93D", "#6C5CE7", "#00C49A",
    "#FFA94D", "#74C0FC", "#B197FC", "#FF8787", "#63E6BE"
  ],
  // Optionaler Rand (Alpha zulässig)
  stroke: {
    enabled: true,
    color: "rgba(0,0,0,0.18)",
    width: 4
  },
  // Zufällige leichte Rotation (+/− Grad)
  jitterRotationDeg: 10,
  // Optionaler Glanz-Overlay (weicher Verlauf)
  glossy: true
};
