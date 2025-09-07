import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ok, error, withCORS } from "./_responses";
import { getStorage } from "./_storage";
import { makeId } from "./_ids";
import { ensureCredits } from "./_credits";
import { CREDITS_PER_SPLIT_OPERATION } from "./_settings";

type RGBA = Uint8Array;

function idx(x: number, y: number, width: number) { return (y * width + x) * 4; }

async function loadRGBA(buf: Buffer): Promise<{ data: RGBA; width: number; height: number }>{
  // @ts-ignore
  const sharp = (await import("sharp")).default;
  const image = sharp(buf).ensureAlpha();
  const meta = await image.metadata();
  const { width = 0, height = 0 } = meta;
  const raw = await image.raw().toBuffer();
  return { data: raw, width, height };
}

function connectedComponents(data: RGBA, width: number, height: number, alphaThreshold = 10) {
  const visited = new Uint8Array(width * height);
  const components: { pixels: [number, number][]; minX: number; maxX: number; minY: number; maxY: number }[] = [];
  const neighbors = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]; // 8-connected

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (visited[p]) continue;
      const a = data[idx(x,y,width)+3];
      if (a < alphaThreshold) { visited[p] = 1; continue; }
      // BFS
      const q: [number,number][] = [[x,y]];
      visited[p] = 1;
      let minX = x, maxX = x, minY = y, maxY = y;
      const pixels: [number,number][] = [];
      while (q.length) {
        const [cx, cy] = q.pop()!;
        pixels.push([cx, cy]);
        if (cx<minX) minX=cx; if (cx>maxX) maxX=cx;
        if (cy<minY) minY=cy; if (cy>maxY) maxY=cy;
        for (const [dx,dy] of neighbors) {
          const nx = cx+dx, ny = cy+dy;
          if (nx<0||ny<0||nx>=width||ny>=height) continue;
          const np = ny*width+nx;
          if (visited[np]) continue;
          const na = data[idx(nx,ny,width)+3];
          if (na < alphaThreshold) { visited[np]=1; continue; }
          visited[np] = 1;
          q.push([nx,ny]);
        }
      }
      components.push({ pixels, minX, maxX, minY, maxY });
    }
  }
  return components;
}

async function cropComponent(buf: Buffer, comp: { minX: number; maxX: number; minY: number; maxY: number }) {
  // @ts-ignore
  const sharp = (await import("sharp")).default;
  const w = comp.maxX - comp.minX + 1;
  const h = comp.maxY - comp.minY + 1;
  const out = await sharp(buf).extract({ left: comp.minX, top: comp.minY, width: w, height: h }).png().toBuffer();
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  withCORS(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return error(res, 405, "Method not allowed");
  try {
    const storage = getStorage();
    await storage.ensureDirs();
    const { imageBase64, userId = "demo" } = req.body || {} as { imageBase64?: string; userId?: string };
    if (!imageBase64) return error(res, 400, "imageBase64 required (data URL or base64)");

    const creditOk = await ensureCredits(userId, CREDITS_PER_SPLIT_OPERATION);
    if (!creditOk) return error(res, 402, "Not enough credits");

    const base64 = imageBase64.startsWith("data:") ? imageBase64.substring(imageBase64.indexOf(",")+1) : imageBase64;
    const buf = Buffer.from(base64, "base64");
    const { data, width, height } = await loadRGBA(buf);
    const comps = connectedComponents(data, width, height);

    const groupId = makeId("grp");
    const results: { id: string; url: string; bbox: { x:number; y:number; w:number; h:number } }[] = [];
    let partIdx = 1;
    for (const c of comps) {
      // Skip tiny components (noise)
      const w = c.maxX - c.minX + 1;
      const h = c.maxY - c.minY + 1;
      if (w*h < 25) continue;
      const out = await cropComponent(buf, c);
      const pid = `${groupId}__p${String(partIdx).padStart(3,"0")}`;
      const saved = await storage.saveBuffer("generated", pid, out, "png");
      results.push({ id: pid, url: saved.url, bbox: { x: c.minX, y: c.minY, w, h } });
      partIdx++;
    }

    return ok(res, { groupId, parts: results });
  } catch (e: any) {
    return error(res, 500, e.message || "Server error");
  }
}

