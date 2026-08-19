import sharp from "sharp";

type Rgb = { r: number; g: number; b: number; count: number };

export async function extractTeamBranding(bytes: Uint8Array) {
  const { data, info } = await sharp(bytes, { failOn: "warning" }).rotate().resize(72, 72, { fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bins = new Map<string, Rgb>();
  for (let index = 0; index < data.length; index += info.channels) {
    if (data[index + 3]! < 80) continue;
    const r = data[index]!, g = data[index + 1]!, b = data[index + 2]!;
    const { s, l } = rgbToHsl(r, g, b);
    if (l > 0.94 || l < 0.055) continue;
    const key = `${Math.round(r / 24)}:${Math.round(g / 24)}:${Math.round(b / 24)}`;
    const bin = bins.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    const weight = 1 + s * 2;
    bin.r += r * weight; bin.g += g * weight; bin.b += b * weight; bin.count += weight;
    bins.set(key, bin);
  }
  const colors = [...bins.values()].map((bin) => ({ r: bin.r / Math.max(1, bin.count), g: bin.g / Math.max(1, bin.count), b: bin.b / Math.max(1, bin.count), count: bin.count }))
    .map((color) => ({ ...color, ...rgbToHsl(color.r, color.g, color.b) })).filter((color) => color.s >= 0.12)
    .sort((a, b) => (b.count * (0.65 + b.s)) - (a.count * (0.65 + a.s)));
  if (!colors.length) throw new Error("Logo does not contain a distinctive usable color.");
  const dominant = colors[0]!;
  const distinct = colors.find((color) => hueDistance(color.h, dominant.h) >= 35 && color.s >= 0.25) ?? colors[1] ?? dominant;
  const rawPrimary = hslToRgb(dominant.h, Math.max(0.38, dominant.s), clamp(dominant.l, 0.20, 0.38));
  const rawSecondary = hslToRgb(distinct.h, Math.max(0.32, distinct.s), clamp(distinct.l, 0.28, 0.46));
  const { primary: primaryRgb, secondary: secondaryRgb, text } = safeGradientForeground(rawPrimary, rawSecondary);
  const accentSource = colors.slice(0, 8).sort((a, b) => b.s - a.s)[0] ?? dominant;
  const accentRgb = hslToRgb(accentSource.h, Math.max(0.58, accentSource.s), clamp(accentSource.l, 0.48, 0.64));
  return {
    brandingPrimary: rgbHex(primaryRgb), brandingSecondary: rgbHex(secondaryRgb), brandingAccent: rgbHex(accentRgb),
    brandingText: text,
    brandingSurface: rgbHex(mix(primaryRgb, { r: 255, g: 255, b: 255 }, 0.91)),
  };
}

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function hueDistance(a: number, b: number) { const difference = Math.abs(a - b); return Math.min(difference, 360 - difference); }
function rgbToHsl(r: number, g: number, b: number) { r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min; let h = 0; if (delta) h = max === r ? 60 * (((g - b) / delta) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4); if (h < 0) h += 360; const l = (max + min) / 2; return { h, s: delta ? delta / (1 - Math.abs(2 * l - 1)) : 0, l }; }
function hslToRgb(h: number, s: number, l: number) { const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }; }
function rgbHex(color: { r: number; g: number; b: number }) { return `#${[color.r, color.g, color.b].map((value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")).join("")}`; }
function rgbLuminance(color: { r: number; g: number; b: number }) { return [color.r, color.g, color.b].map((value) => { const channel = value / 255; return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0); }
function contrast(a: number, b: number) { return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
function mix(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, amount: number) { return { r: a.r + (b.r - a.r) * amount, g: a.g + (b.g - a.g) * amount, b: a.b + (b.b - a.b) * amount }; }
function safeGradientForeground(primary: { r: number; g: number; b: number }, secondary: { r: number; g: number; b: number }) {
  const dark = { r: 17, g: 24, b: 39 };
  const minimumContrast = (foreground: { r: number; g: number; b: number }) => Math.min(contrast(rgbLuminance(primary), rgbLuminance(foreground)), contrast(rgbLuminance(secondary), rgbLuminance(foreground)));
  const whiteScore = minimumContrast({ r: 255, g: 255, b: 255 });
  const darkScore = minimumContrast(dark);
  if (Math.max(whiteScore, darkScore) >= 4.5) return { primary, secondary, text: (whiteScore >= darkScore ? "#ffffff" : "#111827") as "#ffffff" | "#111827" };
  // Mixed light/dark endpoints cannot share one readable foreground. Preserve hue while
  // darkening both until white is safe across the complete gradient.
  let adjustedPrimary = primary;
  let adjustedSecondary = secondary;
  for (let step = 1; step <= 10; step += 1) {
    const amount = step / 20;
    adjustedPrimary = mix(primary, { r: 0, g: 0, b: 0 }, amount);
    adjustedSecondary = mix(secondary, { r: 0, g: 0, b: 0 }, amount);
    if (Math.min(contrast(rgbLuminance(adjustedPrimary), 1), contrast(rgbLuminance(adjustedSecondary), 1)) >= 4.5) break;
  }
  return { primary: adjustedPrimary, secondary: adjustedSecondary, text: "#ffffff" as const };
}
