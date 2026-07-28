import { cn } from "../../lib/cn";

const toneClasses = {
  neutral: "border-slate-700/60 bg-slate-800/40 text-slate-300",
  primary: "border-blue-500/40 bg-blue-500/10 text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.15)]",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]",
  error: "border-rose-500/40 bg-rose-500/10 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.15)]",
  info: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.15)]"
};

export function Badge({ className, tone = "neutral", children, ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide backdrop-blur-md transition-colors",
        toneClasses[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
