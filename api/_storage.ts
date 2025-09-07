import { promises as fs } from "fs";
import path from "path";
import { DIR_ASSETS, DIR_GENERATED, DIR_CONFIGS, STORAGE_PROVIDER } from "./_settings";

export type SavedFile = { id: string; path: string; url: string };

export interface StorageAdapter {
  ensureDirs(): Promise<void>;
  saveBuffer(dir: "assets"|"generated"|"configs", id: string, buf: Buffer, ext: string): Promise<SavedFile>;
  saveJSON<T>(dir: "configs", id: string, data: T): Promise<SavedFile>;
  readJSON<T>(dir: "configs", id: string): Promise<T>;
  fileURL(dir: "assets"|"generated"|"configs", id: string, ext: string): string;
  readFile(dir: "assets"|"generated"|"configs", id: string, ext: string): Promise<Buffer>;
}

export class LocalStorageAdapter implements StorageAdapter {
  rootFor(dir: string) {
    if (dir === "assets") return DIR_ASSETS;
    if (dir === "generated") return DIR_GENERATED;
    return DIR_CONFIGS;
  }

  async ensureDirs(): Promise<void> {
    await fs.mkdir(DIR_ASSETS, { recursive: true });
    await fs.mkdir(DIR_GENERATED, { recursive: true });
    await fs.mkdir(DIR_CONFIGS, { recursive: true });
  }

  async saveBuffer(dir: "assets"|"generated"|"configs", id: string, buf: Buffer, ext: string): Promise<SavedFile> {
    const folder = this.rootFor(dir);
    const filePath = path.join(folder, `${id}.${ext}`);
    await fs.writeFile(filePath, buf);
    return { id, path: filePath, url: this.fileURL(dir, id, ext) };
  }

  async saveJSON<T>(dir: "configs", id: string, data: T): Promise<SavedFile> {
    const json = Buffer.from(JSON.stringify(data, null, 2));
    return this.saveBuffer("configs", id, json, "json");
  }

  async readJSON<T>(dir: "configs", id: string): Promise<T> {
    const folder = this.rootFor(dir);
    const filePath = path.join(folder, `${id}.json`);
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  }

  fileURL(dir: "assets"|"generated"|"configs", id: string, ext: string): string {
    // Vercel statisch: Dateien liegen nicht automatisch öffentlich.
    // Für Dev liefern wir pseudo-URLs; im Prod besser auf Cloud-Storage ausweichen.
    return `/api/files/${dir}/${id}.${ext}`;
  }

  async readFile(dir: "assets"|"generated"|"configs", id: string, ext: string): Promise<Buffer> {
    const folder = this.rootFor(dir);
    const filePath = path.join(folder, `${id}.${ext}`);
    return fs.readFile(filePath);
  }
}

export class S3StorageAdapter implements StorageAdapter {
  // Platzhalter — hier später S3/Blob-Storage implementieren
  async ensureDirs(): Promise<void> { /* no-op */ }
  async saveBuffer(dir: "assets"|"generated"|"configs", id: string, buf: Buffer, ext: string): Promise<SavedFile> {
    throw new Error("S3StorageAdapter not implemented");
  }
  async saveJSON<T>(dir: "configs", id: string, data: T): Promise<SavedFile> {
    throw new Error("S3StorageAdapter not implemented");
  }
  async readJSON<T>(dir: "configs", id: string): Promise<T> { throw new Error("Not implemented"); }
  fileURL(dir: "assets"|"generated"|"configs", id: string, ext: string): string { return ""; }
  async readFile(dir: "assets"|"generated"|"configs", id: string, ext: string): Promise<Buffer> { throw new Error("Not implemented"); }
}

export function getStorage(): StorageAdapter {
  if (STORAGE_PROVIDER === "s3") return new S3StorageAdapter();
  return new LocalStorageAdapter();
}

