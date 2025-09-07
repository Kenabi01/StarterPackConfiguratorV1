import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ok, error, withCORS } from "./_responses";
import { getStorage } from "./_storage";
import { makeId } from "./_ids";
import { ensureCredits } from "./_credits";
import { OPENAI_API_KEY, OPENAI_MODEL, CREDITS_PER_OBJECT_GENERATION, CREDITS_PER_PERSON_GENERATION } from "./_settings";

type Category = "person" | "object";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  withCORS(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return error(res, 405, "Method not allowed");
  try {
    const storage = getStorage();
    await storage.ensureDirs();

    const { category, prompt, baseImage, userId = "demo" } = req.body || {} as { category: Category; prompt: string; baseImage?: string; userId?: string };
    if (!category || !prompt) return error(res, 400, "category and prompt required");

    const cost = category === "person" ? CREDITS_PER_PERSON_GENERATION : CREDITS_PER_OBJECT_GENERATION;
    const has = await ensureCredits(userId, cost);
    if (!has) return error(res, 402, "Not enough credits");

    if (!OPENAI_API_KEY) return error(res, 500, "OPENAI_API_KEY missing");

    // Lazy import to avoid bundler issues
    // @ts-ignore
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    // For persons we could use the provided baseImage as a reference.
    // The Images API currently accepts prompt; for reference blending we'd need edits/variations endpoints.
    // Here we use a simple prompt for both categories to keep it generic.
    const result = await client.images.generate({
      model: OPENAI_MODEL,
      prompt: category === "person" && baseImage ? `${prompt}. Photographic portrait blended with the provided reference.` : prompt,
      size: "1024x1024",
      response_format: "b64_json"
    } as any);

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) return error(res, 500, "Image generation failed");
    const buf = Buffer.from(b64, "base64");
    const imageId = makeId(category === "person" ? "person" : "obj");
    const saved = await storage.saveBuffer("generated", imageId, buf, "png");

    return ok(res, {
      id: imageId,
      url: saved.url,
      category,
      creditsDeducted: cost
    });
  } catch (e: any) {
    return error(res, 500, e.message || "Server error");
  }
}

