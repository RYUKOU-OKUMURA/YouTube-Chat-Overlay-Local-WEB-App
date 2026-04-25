import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "slate" | "green" | "amber" | "rose" | "blue";

const toneStyles: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700 border-slate-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  blue: "bg-sky-50 text-sky-700 border-sky-200"
};

export function Badge({ tone = "slate", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold", toneStyles[tone], className)}>
      {children}
    </span>
  );
}
