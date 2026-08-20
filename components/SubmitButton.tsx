"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export default function SubmitButton({
  children,
  pendingLabel = "Submitting...",
  className = "btn-primary",
  type = "submit",
  disabled = false,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  type?: "submit" | "button";
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return <button type={type} className={className} disabled={pending || disabled} aria-disabled={pending || disabled}>
    {pending ? pendingLabel : children}
  </button>;
}
