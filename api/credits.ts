import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ok, error, withCORS } from "./_responses";
import { getCredits, setCredits, ensureCredits } from "./_credits";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  withCORS(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    const userId = (req.query.userId as string) || (req.body?.userId as string) || "demo";
    if (req.method === "GET") {
      const credits = await getCredits(userId);
      return ok(res, { userId, credits });
    }
    if (req.method === "POST") {
      const { cost, set } = req.body || {};
      if (typeof set === "number") {
        await setCredits(userId, set);
        const credits = await getCredits(userId);
        return ok(res, { userId, credits });
      }
      if (typeof cost === "number") {
        const okDeduct = await ensureCredits(userId, cost);
        if (!okDeduct) return error(res, 402, "Not enough credits");
        const credits = await getCredits(userId);
        return ok(res, { userId, credits });
      }
      return error(res, 400, "Invalid body");
    }
    return error(res, 405, "Method not allowed");
  } catch (e: any) {
    return error(res, 500, e.message || "Server error");
  }
}

