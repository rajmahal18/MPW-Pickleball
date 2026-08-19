import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { getTeamBranding } from "../lib/team-branding";
import { extractTeamBranding } from "../lib/team-branding-server";

async function image(background: { r: number; g: number; b: number; alpha?: number }, format: "png" | "jpeg" = "png", accent?: { r: number; g: number; b: number }) {
  let pipeline = sharp({ create: { width: 80, height: 80, channels: 4, background: { ...background, alpha: background.alpha ?? 1 } } });
  if (accent) {
    const overlay = await sharp({ create: { width: 34, height: 80, channels: 4, background: { ...accent, alpha: 1 } } }).png().toBuffer();
    pipeline = pipeline.composite([{ input: overlay, left: 23, top: 0 }]);
  }
  return format === "jpeg" ? pipeline.jpeg().toBuffer() : pipeline.png().toBuffer();
}

test("extracts a complete safe palette from a colorful transparent PNG", async () => {
  const bytes = await image({ r: 0, g: 0, b: 0, alpha: 0 }, "png", { r: 10, g: 110, b: 210 });
  const palette = await extractTeamBranding(bytes);
  for (const value of Object.values(palette)) assert.match(value, /^#[0-9a-f]{6}$/i);
  assert.ok(["#ffffff", "#111827"].includes(palette.brandingText));
  assert.ok(contrast(palette.brandingPrimary, palette.brandingText) >= 4.5);
  assert.ok(contrast(palette.brandingSecondary, palette.brandingText) >= 4.5);
});

function contrast(first: string, second: string) {
  const luminance = (hex: string) => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("ignores a white JPG background when distinctive artwork exists", async () => {
  const palette = await extractTeamBranding(await image({ r: 250, g: 250, b: 250 }, "jpeg", { r: 190, g: 25, b: 45 }));
  assert.notEqual(palette.brandingPrimary, "#fafafa");
});

test("falls back cleanly for white, black, and neutral monochrome logos", async () => {
  for (const color of [{ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 }, { r: 100, g: 100, b: 100 }]) {
    const bytes = await image(color);
    await assert.rejects(() => extractTeamBranding(bytes));
  }
  const branding = getTeamBranding({ logoUrl: "/api/public/avatars/abc.png" });
  assert.equal(branding.generated, false);
  assert.match(branding.primary, /^#[0-9a-f]{6}$/);
});

test("rejects invalid persisted CSS and unsafe logo URLs", () => {
  const branding = getTeamBranding({ logoUrl: "javascript:alert(1)", brandingPrimary: "red" });
  assert.equal(branding.logoUrl, null);
  assert.equal(branding.generated, false);
});
