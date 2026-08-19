import type { CSSProperties } from "react";

export type TeamBrandingSource = {
  id?: string;
  name?: string;
  shortName?: string;
  logoUrl?: string | null;
  brandingPrimary?: string | null;
  brandingSecondary?: string | null;
  brandingAccent?: string | null;
  brandingText?: string | null;
  brandingSurface?: string | null;
};

export type TeamBranding = {
  logoUrl: string | null;
  primary: string;
  secondary: string;
  accent: string;
  text: "#ffffff" | "#111827";
  surface: string;
  generated: boolean;
};

export const DEFAULT_TEAM_BRANDING: TeamBranding = {
  logoUrl: null,
  primary: "#12233f",
  secondary: "#087f5b",
  accent: "#f4b942",
  text: "#ffffff",
  surface: "#eef8f4",
  generated: false,
};

const HEX = /^#[0-9a-f]{6}$/i;

export function getTeamBranding(team?: TeamBrandingSource | null): TeamBranding {
  const values = [team?.brandingPrimary, team?.brandingSecondary, team?.brandingAccent, team?.brandingText, team?.brandingSurface];
  if (!values.every((value) => typeof value === "string" && HEX.test(value))) {
    return { ...DEFAULT_TEAM_BRANDING, logoUrl: safeLogoUrl(team?.logoUrl) };
  }
  return {
    logoUrl: safeLogoUrl(team?.logoUrl),
    primary: values[0]!.toLowerCase(),
    secondary: values[1]!.toLowerCase(),
    accent: values[2]!.toLowerCase(),
    text: values[3]!.toLowerCase() === "#111827" ? "#111827" : "#ffffff",
    surface: values[4]!.toLowerCase(),
    generated: true,
  };
}

function safeLogoUrl(value?: string | null) {
  if (!value || (!(value.startsWith("/") && !value.startsWith("//")) && !/^https:\/\//i.test(value))) return null;
  return value;
}

export function teamBrandingStyle(team?: TeamBrandingSource | null): CSSProperties {
  const branding = getTeamBranding(team);
  return {
    "--team-primary": branding.primary,
    "--team-secondary": branding.secondary,
    "--team-accent": branding.accent,
    "--team-text": branding.text,
    "--team-surface": branding.surface,
  } as CSSProperties;
}

export function teamHeroStyle(team?: TeamBrandingSource | null): CSSProperties {
  const branding = getTeamBranding(team);
  return {
    ...teamBrandingStyle(team),
    color: branding.text,
    backgroundColor: branding.primary,
    backgroundImage: [
      `linear-gradient(90deg, ${withAlpha(branding.primary, 0.98)} 0%, ${withAlpha(branding.primary, 0.88)} 42%, ${withAlpha(branding.primary, 0.5)} 72%, ${withAlpha(branding.primary, 0.76)} 100%)`,
      `radial-gradient(circle at 78% 25%, ${withAlpha(branding.accent, 0.32)}, transparent 38%)`,
      `radial-gradient(circle at 30% 110%, ${withAlpha(branding.secondary, 0.8)}, transparent 55%)`,
      `linear-gradient(135deg, ${branding.primary}, ${branding.secondary})`,
    ].join(", "),
  } as CSSProperties;
}

export function teamCardStyle(team?: TeamBrandingSource | null): CSSProperties {
  const branding = getTeamBranding(team);
  return {
    ...teamBrandingStyle(team),
    borderColor: withAlpha(branding.primary, 0.2),
    backgroundColor: "#ffffff",
    backgroundImage: `radial-gradient(circle at 7% 20%, ${withAlpha(branding.accent, 0.11)}, transparent 32%), linear-gradient(90deg, ${branding.surface} 0, #ffffff 42%)`,
    boxShadow: `inset 3px 0 0 ${withAlpha(branding.accent, 0.72)}`,
  } as CSSProperties;
}

function withAlpha(hex: string, alpha: number) {
  return `${hex}${Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, "0")}`;
}
