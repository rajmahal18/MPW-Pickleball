import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const allowed = new Map([
  ["image/jpeg", { extension: "jpg", signature: (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
  ["image/png", { extension: "png", signature: (bytes: Uint8Array) => bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 }],
  ["image/webp", { extension: "webp", signature: (bytes: Uint8Array) => String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" }],
]);

function storageRoot() {
  return process.env.AVATAR_STORAGE_DIR || (process.env.NODE_ENV === "production" ? "" : "/tmp/mpw-pickleball-avatars");
}

async function saveImage(file: File, label: string, maxBytes: number) {
  const root = storageRoot();
  if (!root) throw new Error("AVATAR_STORAGE_DIR is required for image uploads in production.");
  if (file.size <= 0 || file.size > maxBytes) throw new Error(`${label} must be between 1 byte and ${Math.floor(maxBytes / (1024 * 1024))} MB.`);
  const rule = allowed.get(file.type);
  if (!rule) throw new Error(`Only JPEG, PNG, and WebP ${label.toLowerCase()} files are allowed.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!rule.signature(bytes)) throw new Error(`The uploaded ${label.toLowerCase()} signature does not match its declared image type.`);
  await mkdir(root, { recursive: true });
  const filename = `${randomUUID()}.${rule.extension}`;
  await writeFile(path.join(root, filename), bytes, { flag: "wx", mode: 0o640 });
  return { filename, url: `/api/public/avatars/${filename}` };
}

export async function saveAvatar(file: File) {
  return saveImage(file, "Avatar", 10 * 1024 * 1024);
}

export async function saveChampionImage(file: File) {
  return saveImage(file, "Champion image", 10 * 1024 * 1024);
}

export async function readAvatar(filename: string) {
  const root = storageRoot();
  if (!root || !/^[a-f0-9-]+\.(jpg|png|webp)$/.test(filename)) throw new Error("Invalid avatar path.");
  const extension = filename.split(".").pop();
  const contentType = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
  return { bytes: await readFile(path.join(root, filename)), contentType };
}
