import type { VercelRequest, VercelResponse } from "@vercel/node";
import { promises as fs } from "fs";
import path from "path";
import { LocalStorageAdapter } from "../_storage";
import { withCORS } from "../_responses";

const adapter = new LocalStorageAdapter();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  withCORS(res);
  try {
    const parts = (req.query.path as string[] | undefined) || [];
    if (parts.length < 2) return res.status(400).send("Bad path");
    const [dir, file] = parts;
    const [id, ext] = file.split(".");
    const root = adapter.rootFor(dir);
    const filePath = path.join(root, `${id}.${ext}`);
    const buf = await fs.readFile(filePath);
    const contentType = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "json" ? "application/json" : "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.status(200).send(buf);
  } catch (e: any) {
    res.status(404).send("Not found");
  }
}

