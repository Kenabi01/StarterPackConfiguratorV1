// EINSTELLUNGEN — Anpassen erlaubt: Werte sind bewusst ganz oben platziert
// Limits (änderbar)
export const MAX_PEOPLE = 6; // Max. Personen-Bilder in der Vorschau
export const MAX_OBJECTS = 12; // Max. Gegenstands-Bilder in der Vorschau

// Raster & Snapping (änderbar)
export const GRID_SIZE = 2; // Rasterweite in px
export const SNAP_THRESHOLD = 8; // Fangschwelle in px
export const SHOW_GRID_DEFAULT = true; // Raster per Default sichtbar

// Darstellung (änderbar)
export const OUTLINE_COLOR = "#00AEEF"; // Konturfarbe der Elemente
export const OUTLINE_WIDTH = 20; // Breite der Kontur in px
// Konturen sollen keine Löcher enthalten (gefüllte Silhouette als Basis für die Kontur)
export const OUTLINE_FILL_HOLES = true;
export const GUIDE_COLOR = "#FF00AA"; // Hilfslinienfarbe

// Begrenzungsbereich (Bounds)
// Aktiviert einen sichtbaren Rahmen; Objekte dürfen diesen Bereich nicht verlassen
export const BOUNDS_ENABLED = true;
// Exaktes Rechteck in Canvas-Koordinaten (x, y, width, height) – hier direkt festlegen
export const BOUNDS_RECT = { x: 60, y: 60, width: 450, height: 480 };
// Stil des sichtbaren Rahmens
export const BOUNDS_STYLE = { stroke: "#333", lineWidth: 2, dash: [6,4], fill: null };

// Drag & Interaktion (änderbar)
// Nutzt Pointer-Capture, damit das Ziehen auch außerhalb der Canvas-Fläche stabil weiterläuft
export const DRAG_USE_POINTER_CAPTURE = true;
// Verhindert Browser-Defaultgesten (Scroll/Zoom/Select) während Drag
export const DRAG_PREVENT_DEFAULT = true;
// Snapping erst beim Loslassen anwenden (glatteres Ziehen)
export const APPLY_SNAP_ON_DROP = true;
// Während des Ziehens Kollisionen ignorieren (Auflösung erst beim Loslassen)
export const ALLOW_OVERLAP_DURING_DRAG = true;

// Drop-Animation (änderbar)
// Aktiviert sanftes Hingleiten zur Endposition beim Loslassen
export const ANIMATE_DROP = true;
// Dauer der Drop-Animation in Millisekunden
export const DROP_ANIM_DURATION_MS = 180;

// Texte (änderbar)
export const DEFAULT_FONTS = ["Inter", "Arial", "Roboto", "Georgia", "Times New Roman"]; // erlaubte Schriften
export const DEFAULT_TEXT_COLOR = "#222"; // Standard Textfarbe

// API Endpunkte (änderbar)
export const API_BASE = "/api"; // Basis-Route, bei externer Einbindung anpassen

// iFrame Herkunft (änderbar)
export const IFRAME_ALLOWED_PARENT_ORIGINS = ["*"]; // Liste erlaubter Eltern-Domains

// Demo-Modus (änderbar)
// true = Verwendet Platzhalterbilder statt Backend-APIs, ideal für lokalen Test ohne Server
// Override via URL: ?demo=0/1/true/false oder localStorage key "starterpack_demo"
export const DEMO_MODE = (() => {
  try {
    const u = new URLSearchParams(window.location.search);
    if (u.has('demo')) {
      const v = String(u.get('demo')).toLowerCase();
      return !(v === '0' || v === 'false' || v === 'no');
    }
    const ls = localStorage.getItem('starterpack_demo');
    if (ls != null) return ls === '1' || String(ls).toLowerCase() === 'true';
  } catch {}
  return true;
})();

// Kollision/Slide-Verhalten (änderbar)
// Aktiviert seitliches Ausweichen ("sliden") bei Kollision während des Ziehens
export const SLIDE_ON_COLLISION = true;
// Maximale Ausweichdistanz entlang der freien Achse (in px)
export const SLIDE_MAX_PIXELS = 64;
// Schrittweite bei der Suche nach einer freien Position (in px)
export const SLIDE_STEP_PIXELS = 1; // kleinerer Schritt = minimaler Abstand bei Kollision

// Kollisionsprüfung (änderbar)
// Alpha-Schwelle für Masken (0..255); höhere Werte = weniger empfindlich an halbdurchsichtigen Kanten
export const MASK_ALPHA_THRESHOLD = 6; // geringere Schwelle erlaubt engeres Berühren an weichen Kanten
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

// Personen-Platzhalter (änderbar)
// Eigene Formenliste und Seitenverhältnis: 2× so breit, 4× so hoch wie Gegenstände
export const PERSON_PLACEHOLDER_PNG = {
  // Faktoren relativ zu PLACEHOLDER_PNG.size
  widthFactor: 2,
  heightFactor: 4,
  // Hochformatige, personentypische Silhouetten
  shapes: ["ovalTall", "capsuleTall", "teardropTall", "beanTall"],
  // Optional frei überschreibbare Styles (fallen zurück auf PLACEHOLDER_PNG)
  colors: null,
  stroke: null,
  glossy: null,
  jitterRotationDeg: 8
};

// Ordnen / Anordnen (änderbar)
// Standard-Verhalten für den "Ordnen"-Button:
// 'smart' = iteratives, kollisionssensitives Layout mit optimierten Abständen
// 'grid'  = einfache, gleichmäßige Rasterverteilung (altes Verhalten)
export const ARRANGE_MODE = 'smart';

// Zielabstand zwischen Elementen in px (gemessen zwischen umschließenden Kreisen)
export const SMART_ARRANGE_MIN_GAP = 4;
// Iterationen pro Versuch (je höher, desto stabiler, aber langsamer)
export const SMART_ARRANGE_MAX_ITER = 200;
// Anzahl Neu-Starts mit Jitter, falls nach den Iterationen noch Überlappungen bestehen
export const SMART_ARRANGE_RESTARTS = 20;
// Start-Jitter in px (kleine Zufallsversetzung vermeidet lokale Minima)
export const SMART_ARRANGE_JITTER = 4;
// Schrittstärke der Kräfte (Skalierung der Bewegung pro Iteration)
export const SMART_ARRANGE_STEP = 0.15;
// Maximale Bewegung pro Iteration in px (Deckelung gegen Springen)
export const SMART_ARRANGE_MAX_STEP = 5;
// Leichter Zug zur Mitte, um Drift zu vermeiden (0 = aus)
export const SMART_ARRANGE_CENTER_PULL = 0.002;
// Stärke der Abstoßung bei Überschneidung (höher = schneller Trennen)
export const SMART_ARRANGE_REPULSION_K = 0.9;
// Zusätzlicher Innenabstand zu den Begrenzungen in px
export const SMART_ARRANGE_EDGE_PADDING = 6;
// Ergebnis auf Raster runden (kann Abstände minimal verändern)
export const SMART_ARRANGE_SNAP_TO_GRID = true;
// Sollen Text-Elemente mit angeordnet und auf Abstand gehalten werden?
export const SMART_ARRANGE_INCLUDE_TEXT = true;
// Am Ende pixelgenaue Masken-Kollisionsprüfung und Feinjustage
export const SMART_ARRANGE_MASK_CHECK = true;

// Drop-Platzierung (änderbar)
// Erweiterte Suche nach einer freien Position um den Ablagepunkt herum
export const DROP_SEARCH_MAX_RADIUS = 200; // maximale Suchreichweite in px (kreisförmig um die Drop-Position)
export const DROP_SEARCH_STEP_RADIUS = 8;  // radialer Schritt in px
export const DROP_SEARCH_ANGLE_STEP_DEG = 22.5; // Winkelauflösung der Kreisabtastung
// Fallback: Wenn während des Drags eine letzte freie Position existiert, dorthin springen statt zur Startposition
export const DROP_FALLBACK_TO_LAST_FREE = true;
// Letzter Fallback: Wenn keine freie Position gefunden wird, zur Startposition zurück (sonst an Overlap-Position bleiben)
export const DROP_REVERT_TO_START_IF_ALL_FAIL = true;

// Bibliothek (änderbar)
export const LIBRARY_COLUMNS = 11; // Anzahl Icons pro Reihe
export const LIBRARY_GAP_PX = 2;   // Abstand zwischen Icons in px
export const LIBRARY_THUMB_RADIUS = 4; // Eckenradius der Icons in px

// Verlauf (änderbar)
// Maximale Anzahl an Schritten für "Rückgängig"
export const HISTORY_LIMIT = 50;
