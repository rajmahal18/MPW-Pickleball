"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, UserRound } from "lucide-react";
import PlayerAvatar from "@/components/PlayerAvatar";

export type AvatarPlayerOption = {
  id: string;
  label: string;
  meta?: string;
  disabled?: boolean;
  tone?: "default" | "available" | "blocked";
  avatar: {
    firstName: string;
    middleInitial?: string | null;
    lastName: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
};

export default function AvatarPlayerSelect({
  name,
  value,
  options,
  placeholder = "Select player…",
  disabled = false,
  autoSubmit = false,
  onValueChange,
  triggerTone = "default",
  className = "",
}: {
  name?: string;
  value: string;
  options: AvatarPlayerOption[];
  placeholder?: string;
  disabled?: boolean;
  autoSubmit?: boolean;
  onValueChange?: (value: string) => void;
  triggerTone?: "default" | "available" | "blocked" | "warning";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);

  useEffect(() => setInternalValue(value), [value]);
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const selected = options.find((option) => option.id === internalValue);
  const toneClass = triggerTone === "available"
    ? "border-emerald-300 bg-emerald-50"
    : triggerTone === "blocked"
      ? "border-red-300 bg-red-50 text-red-800"
      : triggerTone === "warning"
        ? "border-amber-300 bg-amber-50"
        : "border-line bg-white";

  function choose(next: string) {
    setInternalValue(next);
    if (hiddenRef.current) hiddenRef.current.value = next;
    onValueChange?.(next);
    setOpen(false);
    if (autoSubmit) window.setTimeout(() => hiddenRef.current?.form?.requestSubmit(), 0);
  }

  return <div ref={rootRef} className={`relative min-w-0 ${className}`}>
    {name && <input ref={hiddenRef} type="hidden" name={name} value={internalValue} readOnly/>}
    <button
      type="button"
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={() => setOpen((current) => !current)}
      className={`flex min-h-11 w-full items-center gap-2.5 border px-3 py-2 text-left text-sm font-bold transition disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 ${toneClass}`}
    >
      {selected ? <PlayerAvatar {...selected.avatar} size="sm"/> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-paper text-gray-400"><UserRound className="h-4 w-4"/></span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{selected?.label || placeholder}</span>
        {selected?.meta && <span className="mt-0.5 block truncate text-[10px] font-semibold text-gray-500">{selected.meta}</span>}
      </span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition ${open ? "rotate-180" : ""}`}/>
    </button>

    {open && !disabled && <div role="listbox" className="absolute z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-line bg-white p-1.5 shadow-xl">
      <button type="button" role="option" aria-selected={!internalValue} onClick={() => choose("")} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-bold text-gray-500 hover:bg-paper">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-paper"><UserRound className="h-4 w-4"/></span>
        <span>{placeholder}</span>
      </button>
      {options.map((option) => {
        const blocked = Boolean(option.disabled);
        const tone = option.tone === "available" ? "hover:bg-emerald-50" : option.tone === "blocked" ? "bg-red-50/70 text-red-800" : "hover:bg-court/5";
        return <button
          key={option.id}
          type="button"
          role="option"
          aria-selected={internalValue === option.id}
          disabled={blocked}
          onClick={() => choose(option.id)}
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition ${tone} ${blocked ? "cursor-not-allowed opacity-55" : ""} ${internalValue === option.id ? "ring-1 ring-inset ring-court/30" : ""}`}
        >
          <PlayerAvatar {...option.avatar} size="sm"/>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{option.label}</span>{option.meta && <span className="mt-0.5 block truncate text-[10px] font-semibold opacity-70">{option.meta}</span>}</span>
        </button>;
      })}
    </div>}
  </div>;
}
