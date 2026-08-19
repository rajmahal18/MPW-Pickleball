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
