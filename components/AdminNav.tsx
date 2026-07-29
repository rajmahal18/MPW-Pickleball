import Link from "next/link";

const links = [
  ["Control", "/admin"],
  ["Simulation", "/admin/simulation"],
  ["Voting codes", "/admin/voting"],
  ["Player avatars", "/admin/players"],
  ["Checkpoints", "/admin/checkpoints"],
  ["Reset data", "/admin/reset"],
  ["Audit logs", "/admin/audit"],
] as const;

export default function AdminNav() {
  return <nav className="mb-6 flex gap-2 overflow-x-auto pb-1">{links.map(([label, href]) => <Link key={href} href={href} className="btn-ghost whitespace-nowrap px-3 py-2 text-xs">{label}</Link>)}</nav>;
}
