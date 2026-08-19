import Link from "next/link";
import { getTeamBranding, teamBrandingStyle, type TeamBrandingSource } from "@/lib/team-branding";

export type TeamIdentityTeam = TeamBrandingSource & { id?: string; name: string; shortName: string };

export type TeamIdentityVariant = "micro" | "compact" | "standard" | "hero";

export function TeamLogo({ team, size = "md", className = "" }: { team: TeamIdentityTeam; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  const branding = getTeamBranding(team);
  const sizes = size === "xs" ? "h-6 w-6 text-[8px]" : size === "sm" ? "h-9 w-9 text-[10px]" : size === "lg" ? "h-20 w-20 text-lg" : "h-12 w-12 text-xs";
  const shared = `${sizes} shrink-0 rounded-lg border bg-white object-contain p-1 font-black shadow-sm ${className}`;
  return branding.logoUrl
    ? <img src={branding.logoUrl} alt={`${team.name} logo`} width={size === "lg" ? 80 : size === "md" ? 48 : size === "sm" ? 36 : 24} height={size === "lg" ? 80 : size === "md" ? 48 : size === "sm" ? 36 : 24} loading="lazy" decoding="async" className={shared} style={{ borderColor: branding.accent }} />
    : <span className={`${shared} grid place-items-center`} style={{ borderColor: branding.accent, color: branding.primary }} aria-label={`${team.name} initials`}>{team.shortName.slice(0, 2).toUpperCase()}</span>;
}

export function TeamIdentity({ team, variant = "compact", compact, link = true, className = "", meta, fullName = false }: { team: TeamIdentityTeam; variant?: TeamIdentityVariant; compact?: boolean; link?: boolean; className?: string; meta?: React.ReactNode; fullName?: boolean }) {
  const resolved = compact ? "micro" : variant;
  const logoSize = resolved === "micro" ? "xs" : resolved === "compact" ? "sm" : resolved === "hero" ? "lg" : "md";
  const nameClass = resolved === "hero" ? "text-3xl font-black leading-tight tracking-tight md:text-5xl" : resolved === "standard" ? "text-base font-black" : resolved === "micro" ? "text-xs font-bold" : "text-sm font-bold";
  const content = <span className={`inline-flex min-w-0 items-center ${resolved === "hero" ? "gap-3" : "gap-2"} ${className}`} style={teamBrandingStyle(team)}><TeamLogo team={team} size={logoSize}/><span className="min-w-0"><span className={`block truncate ${nameClass}`}>{resolved === "micro" && !fullName ? team.shortName : team.name}</span>{meta && <span className="mt-0.5 block truncate text-[10px] font-semibold opacity-[.65]">{meta}</span>}</span></span>;
  return link && team.id ? <Link href={`/teams/${team.id}`} className="min-w-0 hover:opacity-80">{content}</Link> : content;
}

export function TeamHeroArtwork({ team, className = "" }: { team: TeamIdentityTeam; className?: string }) {
  const branding = getTeamBranding(team);
  if (!branding.logoUrl) return null;
  return <div className={`pointer-events-none absolute inset-y-0 right-0 w-[58%] overflow-hidden ${className}`} aria-hidden="true">
    <img src={branding.logoUrl} alt="" className="absolute inset-0 h-full w-full scale-110 object-contain object-right opacity-[0.18] saturate-[.72] contrast-110 sm:scale-105 sm:opacity-[0.24]" style={{ WebkitMaskImage: "radial-gradient(ellipse 68% 78% at 72% 50%, #000 20%, rgba(0,0,0,.88) 42%, transparent 78%)", maskImage: "radial-gradient(ellipse 68% 78% at 72% 50%, #000 20%, rgba(0,0,0,.88) 42%, transparent 78%)" }}/>
    <span className="absolute inset-0" style={{ background: `linear-gradient(90deg, var(--team-primary) 0%, transparent 58%, color-mix(in srgb, var(--team-primary) 48%, transparent) 100%)` }}/>
  </div>;
}
