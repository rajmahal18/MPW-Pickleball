import Link from "next/link";
import { getTeamBranding, teamBrandingStyle, type TeamBrandingSource } from "@/lib/team-branding";
import { formatPlayerCompactName, type PlayerNameParts } from "@/lib/player-name";

export type TeamIdentityTeam = TeamBrandingSource & {
  id?: string;
  name: string;
  shortName: string;
  pairs?: Array<{ playerA: PlayerNameParts; playerB: PlayerNameParts }>;
};

export type TeamIdentityVariant = "micro" | "compact" | "standard" | "hero";
export type TeamLogoVariant = TeamIdentityVariant | "match";

export function TeamLogo({ team, variant, size, className = "" }: { team: TeamIdentityTeam; variant?: TeamLogoVariant; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  const branding = getTeamBranding(team);
  const resolved = variant ?? (size === "xs" ? "micro" : size === "sm" ? "compact" : size === "lg" ? "hero" : "standard");
  const sizes = resolved === "micro" ? "h-5 w-8 text-[7px]" : resolved === "compact" ? "h-8 w-12 text-[9px]" : resolved === "match" ? "h-10 w-16 text-[10px]" : resolved === "hero" ? "h-[4.5rem] w-28 text-base" : "h-11 w-[4.5rem] text-xs";
  const pixels = resolved === "micro" ? [32, 20] : resolved === "compact" ? [48, 32] : resolved === "match" ? [64, 40] : resolved === "hero" ? [112, 72] : [72, 44];
  const shared = `${sizes} shrink-0 overflow-hidden rounded-md border bg-white object-cover font-black shadow-sm ${className}`;
  return branding.logoUrl
    ? <img src={branding.logoUrl} alt={`${team.name} logo`} width={pixels[0]} height={pixels[1]} loading="lazy" decoding="async" className={shared} style={{ borderColor: branding.accent }} />
    : <span className={`${shared} grid place-items-center`} style={{ borderColor: branding.accent, color: branding.primary }} aria-label={`${team.name} initials`}>{team.shortName.slice(0, 2).toUpperCase()}</span>;
}

export function TeamIdentity({ team, variant = "compact", compact, link = true, className = "", meta, fullName = false, pairMode = false, forceTeamName = false }: { team: TeamIdentityTeam; variant?: TeamIdentityVariant; compact?: boolean; link?: boolean; className?: string; meta?: React.ReactNode; fullName?: boolean; pairMode?: boolean; forceTeamName?: boolean }) {
  const resolved = compact ? "micro" : variant;
  const nameClass = resolved === "hero" ? "text-3xl font-black leading-tight tracking-tight md:text-5xl" : resolved === "standard" ? "text-base font-black" : resolved === "micro" ? "text-xs font-bold" : "text-sm font-bold";
  const pair = !forceTeamName && (pairMode || team.pairs?.length) ? team.pairs?.[0] : null;
  const displayName = pair
    ? `${formatPlayerCompactName(pair.playerA)} / ${formatPlayerCompactName(pair.playerB)}`
    : resolved === "micro" && !fullName ? team.shortName : team.name;
  const content = <span className={`inline-flex min-w-0 items-center ${resolved === "hero" ? "gap-4" : "gap-2"} ${className}`} style={teamBrandingStyle(team)}><TeamLogo team={team} variant={resolved}/><span className="min-w-0"><span className={`block truncate ${nameClass}`} title={pair ? team.name : undefined}>{displayName}</span>{meta && <span className="mt-0.5 block truncate text-[10px] font-semibold opacity-[.65]">{meta}</span>}</span></span>;
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
