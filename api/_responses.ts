import { ALLOWED_ORIGINS } from "./_settings";

export function withCORS(res: any) {
  const origins = ALLOWED_ORIGINS;
  const allow = origins.includes("*") ? "*" : origins[0] || "*";
  res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export function ok(res: any, data: any) {
  withCORS(res);
  res.status(200).json({ ok: true, ...data });
}

export function error(res: any, status: number, message: string, extra?: any) {
  withCORS(res);
  res.status(status).json({ ok: false, error: message, ...extra });
}

