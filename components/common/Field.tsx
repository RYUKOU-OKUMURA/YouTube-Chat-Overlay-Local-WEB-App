import type { ReactNode } from "react";
import { cn } from "./cn";

type Props = {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
};

export function Field({ label, hint, className, children }: Props) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
      {hint ? <span className="text-[11px] leading-4 text-slate-500">{hint}</span> : null}
    </label>
  );
}
