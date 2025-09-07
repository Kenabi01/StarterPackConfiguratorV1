import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getStorage } from "./_storage";
import { makeId } from "./_ids";
import { ok, error, withCORS } from "./_responses";

const storage = getStorage();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  withCORS(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    await storage.ensureDirs();
    if (req.method === "POST") {
      const body = req.body || {};
      const id = body.id || makeId("cfg");
      const record = {
        id,
        createdAt: new Date().toISOString(),
        payload: body.payload || body,
      };
      await storage.saveJSON("configs", id, record);
      return ok(res, { id, url: storage.fileURL("configs", id, "json") });
    }
    if (req.method === "GET") {
      const id = (req.query.id as string) || "";
      if (!id) return error(res, 400, "id missing");
      const record = await storage.readJSON<any>("configs", id);
      return ok(res, { record });
    }
    return error(res, 405, "Method not allowed");
  } catch (e: any) {
    return error(res, 500, e.message || "Server error");
  }
}

