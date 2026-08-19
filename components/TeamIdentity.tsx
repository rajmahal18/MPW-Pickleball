import Link from "next/link";
import { getTeamBranding, teamBrandingStyle, type TeamBrandingSource } from "@/lib/team-branding";

export type TeamIdentityTeam = TeamBrandingSource & { id?: string; name: string; shortName: string };

export function TeamLogo({ team, size = "md", className = "" }: { team: TeamIdentityTeam; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  const branding = getTeamBranding(team);
  const sizes = size === "xs" ? "h-6 w-6 text-[8px]" : size === "sm" ? "h-9 w-9 text-[10px]" : size === "lg" ? "h-20 w-20 text-lg" : "h-12 w-12 text-xs";
  const shared = `${sizes} shrink-0 rounded-full border-2 bg-white object-contain p-1 font-black shadow-sm ${className}`;
  return branding.logoUrl
    ? <img src={branding.logoUrl} alt={`${team.name} logo`} width={size === "lg" ? 80 : size === "md" ? 48 : size === "sm" ? 36 : 24} height={size === "lg" ? 80 : size === "md" ? 48 : size === "sm" ? 36 : 24} loading="lazy" decoding="async" className={shared} style={{ borderColor: branding.accent }} />
    : <span className={`${shared} grid place-items-center`} style={{ borderColor: branding.accent, color: branding.primary }} aria-label={`${team.name} initials`}>{team.shortName.slice(0, 2).toUpperCase()}</span>;
}

export function TeamIdentity({ team, compact = false, link = true, className = "" }: { team: TeamIdentityTeam; compact?: boolean; link?: boolean; className?: string }) {
  const content = <span className={`inline-flex min-w-0 items-center gap-2 ${className}`} style={teamBrandingStyle(team)}><TeamLogo team={team} size={compact ? "xs" : "sm"}/><span className="min-w-0 truncate font-bold">{compact ? team.shortName : team.name}</span></span>;
  return link && team.id ? <Link href={`/teams/${team.id}`} className="min-w-0 hover:opacity-80">{content}</Link> : content;
}
