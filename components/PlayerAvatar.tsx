export default function PlayerAvatar({
  firstName,
  lastName,
  displayName,
  avatarUrl,
  size = "md",
}: {
  firstName: string;
  lastName: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const name = displayName || `${firstName} ${lastName}`;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  const classes = size === "lg" ? "h-20 w-20 text-xl" : size === "sm" ? "h-9 w-9 text-xs" : "h-12 w-12 text-sm";
  return avatarUrl ? <img className={`${classes} rounded-full border border-line object-cover`} src={avatarUrl} alt={name} loading="lazy" /> : <span className={`${classes} grid shrink-0 place-items-center rounded-full border border-court/25 bg-court/10 font-black text-court`} aria-label={`${name} initials avatar`}>{initials || "?"}</span>;
}
