"use client";

export default function PrintButton({ label = "Print code sheet", className = "btn-ghost" }: { label?: string; className?: string }) {
  return <button onClick={() => window.print()} className={className} type="button">{label}</button>;
}
