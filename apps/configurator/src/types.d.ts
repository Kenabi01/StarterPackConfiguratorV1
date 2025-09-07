export type Category = "person" | "object";

export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number; // degrees
}

export interface ImageItem {
  id: string;
  category: Category;
  url: string;
  z: number;
  transform: Transform;
  tint?: string; // hex color for colorize
  mask?: ImageData; // optional precomputed mask
}

export interface TextItem {
  id: string;
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  z: number;
  transform: Transform;
}

export interface ConfigDocument {
  id: string;
  createdAt: string;
  items: Array<ImageItem | TextItem>;
  canvas: { width: number; height: number; background?: string };
}

