import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ok, error, withCORS } from "./_responses";
import { DEFAULT_PRICE_TABLE } from "./_settings";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  withCORS(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    if (req.method === "GET") {
      return ok(res, { prices: DEFAULT_PRICE_TABLE });
    }
    if (req.method === "POST") {
      const { items } = req.body || {};
      // Platzhalter: hier Shopify Checkout erstellen.
      const checkoutUrl = "https://example.com/checkout/session-placeholder";
      return ok(res, { checkoutUrl, items });
    }
    return error(res, 405, "Method not allowed");
  } catch (e: any) {
    return error(res, 500, e.message || "Server error");
  }
}

