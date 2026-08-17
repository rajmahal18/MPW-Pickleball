import type { SexCategory } from "@prisma/client";

export default function GenderIndicator({ sex, className = "" }: { sex: SexCategory | "MALE" | "FEMALE"; className?: string }) {
  const male = sex === "MALE";
  return <span
    aria-label={male ? "Male" : "Female"}
    title={male ? "Male" : "Female"}
    className={`inline-block shrink-0 font-black leading-none ${male ? "text-blue-600" : "text-pink-500"} ${className}`}
  >{male ? "♂" : "♀"}</span>;
}
