import { cn } from "../../lib/cn";

const toneClasses = {
  neutral: "border-white/10 bg-white/5 text-slate-300",
  primary: "border-blue-500/30 bg-blue-500/15 text-blue-200",
  success: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  warning: "border-amber-500/30 bg-amber-500/15 text-amber-200",
  error: "border-rose-500/30 bg-rose-500/15 text-rose-200",
  info: "border-cyan-500/30 bg-cyan-500/15 text-cyan-200"
};

export function Badge({ className, tone = "neutral", children, ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
        toneClasses[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
