type StatusBadgeProps = {
  status: string;
  label?: string;
  compact?: boolean;
  pulse?: boolean;
};

const STATUS_STYLES: Record<string, string> = {
  LIVE: "border-flame/40 bg-flame/10 text-flame",
  READY: "border-emerald-300 bg-emerald-50 text-emerald-800",
  LINEUP_PENDING: "border-amber-300 bg-amber-50 text-amber-900",
  SCHEDULED: "border-line bg-gray-50 text-gray-600",
  COMPLETED: "border-court/30 bg-court/10 text-court",
  FORFEITED: "border-gold/60 bg-gold/20 text-ink",
  INTERRUPTED: "border-orange-300 bg-orange-50 text-orange-800",
};

const STATUS_LABELS: Record<string, string> = {
  LIVE: "Ongoing",
  READY: "Ready to play",
  LINEUP_PENDING: "Pending lineup",
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  FORFEITED: "Forfeited",
  INTERRUPTED: "Interrupted",
};

export function displayStatus(status: string) {
  return STATUS_LABELS[status] || status.replaceAll("_", " ");
}

export default function StatusBadge({ status, label, compact = false, pulse = false }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] || "border-line bg-white text-gray-600";
  const shouldPulse = pulse || status === "LIVE";
  return <span className={`inline-flex items-center gap-1.5 border font-black uppercase tracking-wider ${compact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-[11px]"} ${style}`}>
    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full bg-current ${shouldPulse ? "animate-pulse" : ""}`}/>
    {label || displayStatus(status)}
  </span>;
}
