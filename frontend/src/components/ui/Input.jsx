import { cn } from "../../lib/cn";

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border border-slate-700/60 bg-slate-950/70 px-4 text-sm text-slate-100 placeholder:text-slate-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] backdrop-blur-xl transition-all duration-200 ease-out hover:border-slate-600 focus:border-cyan-400 focus:bg-slate-900 focus:outline-none focus:ring-4 focus:ring-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
