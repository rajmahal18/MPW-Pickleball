"use client";

import { useEffect, useRef } from "react";

export default function SelectAllPlayers() {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const selector = 'input[name="playerIds"][form="player-bulk-form"]';
    const sync = () => {
      const checkboxes = Array.from(document.querySelectorAll<HTMLInputElement>(selector));
      const checked = checkboxes.filter((checkbox) => checkbox.checked).length;
      if (!ref.current) return;
      ref.current.checked = checkboxes.length > 0 && checked === checkboxes.length;
      ref.current.indeterminate = checked > 0 && checked < checkboxes.length;
    };
    const checkboxes = Array.from(document.querySelectorAll<HTMLInputElement>(selector));
    checkboxes.forEach((checkbox) => checkbox.addEventListener("change", sync));
    sync();
    return () => checkboxes.forEach((checkbox) => checkbox.removeEventListener("change", sync));
  }, []);

  return <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-black">
    <input
      ref={ref}
      type="checkbox"
      aria-label="Select all players on this page"
      onChange={(event) => {
        document.querySelectorAll<HTMLInputElement>('input[name="playerIds"][form="player-bulk-form"]').forEach((checkbox) => {
          checkbox.checked = event.currentTarget.checked;
        });
      }}
    />
    All
  </label>;
}
