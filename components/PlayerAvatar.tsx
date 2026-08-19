"use client";

import { useState } from "react";
import { formatPlayerDisplayName } from "@/lib/player-name";
import { getTeamBranding, type TeamBrandingSource } from "@/lib/team-branding";

export default function PlayerAvatar({
  firstName,
  middleInitial,
  lastName,
  displayName,
  avatarUrl,
  team,
  size = "md",
}: {
  firstName: string;
  middleInitial?: string | null;
  lastName: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  team?: TeamBrandingSource | null;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const name = formatPlayerDisplayName({ firstName, middleInitial, lastName, displayName });
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  const classes = size === "xl"
    ? "h-28 w-28 text-2xl"
    : size === "lg"
      ? "h-20 w-20 text-xl"
      : size === "sm"
        ? "h-10 w-10 text-xs"
        : "h-14 w-14 text-base";
  const pixels = size === "xl" ? 112 : size === "lg" ? 80 : size === "sm" ? 40 : 56;
  const branding = getTeamBranding(team);
  const shared = `${classes} shrink-0 rounded-full border-2 border-white ring-1 ring-court/20 shadow-panel`;
  return avatarUrl && !imageFailed
    ? <img className={`${shared} object-cover`} style={team ? { boxShadow: `0 0 0 3px ${branding.accent}` } : undefined} src={avatarUrl} alt={name} width={pixels} height={pixels} loading="lazy" decoding="async" onError={() => setImageFailed(true)} />
    : <span className={`${shared} grid place-items-center bg-court/10 font-black text-court`} style={team ? { color: branding.primary, backgroundColor: branding.surface, boxShadow: `0 0 0 3px ${branding.accent}` } : undefined} aria-label={`${name} initials avatar`}>{initials || "?"}</span>;
}
