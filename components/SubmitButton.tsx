"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export default function SubmitButton({
  children,
  pendingLabel = "Submitting...",
  className = "btn-primary",
  type = "submit",
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  type?: "submit" | "button";
}) {
  const { pending } = useFormStatus();
  return <button type={type} className={className} disabled={pending} aria-disabled={pending}>
    {pending ? pendingLabel : children}
  </button>;
}
