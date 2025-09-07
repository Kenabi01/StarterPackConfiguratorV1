import crypto from "crypto";

export function makeId(prefix: string = "id"): string {
  const rand = crypto.randomBytes(6).toString("hex");
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`;
}

