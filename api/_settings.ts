// EINSTELLUNGEN — Anpassen erlaubt: Werte sind bewusst ganz oben platziert
// Kategorie‑Limits (änderbar)
export const MAX_PEOPLE = 6; // Max. Personen-Bilder in der Vorschau
export const MAX_OBJECTS = 12; // Max. Gegenstands-Bilder in der Vorschau

// Credits (änderbar)
export const CREDITS_PER_PERSON_GENERATION = 5; // Kosten je Personen-Generierung
export const CREDITS_PER_OBJECT_GENERATION = 3; // Kosten je Gegenstands-Generierung
export const CREDITS_PER_SPLIT_OPERATION = 1; // Kosten je Split-Vorgang pro Bild

// Speicher-Provider (änderbar): "local" (Dev) oder "s3" (Prod)
export const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || "local";

// Verzeichnisse (änderbar, bei local)
export const DATA_ROOT = process.env.DATA_ROOT || ".data"; // Basisordner für lokale Speicherung
export const DIR_ASSETS = process.env.DIR_ASSETS || `${DATA_ROOT}/assets`;
export const DIR_GENERATED = process.env.DIR_GENERATED || `${DATA_ROOT}/generated`;
export const DIR_CONFIGS = process.env.DIR_CONFIGS || `${DATA_ROOT}/configs`;

// OpenAI (änderbar via ENV)
export const OPENAI_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1"; // Bildmodell
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ""; // in Vercel als Secret setzen

// Shopify (änderbar via ENV)
export const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || "";
export const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || "";
export const DEFAULT_PRICE_TABLE: Record<string, number> = {
  // Preisdefinitionen pro Konfigurationstyp (änderbar)
  basic: 9.9,
  pro: 19.9,
  enterprise: 49.0
};

// Sicherheit / CORS (änderbar)
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map(s => s.trim());

