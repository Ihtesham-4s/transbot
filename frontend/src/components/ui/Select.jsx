import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

export function Select({ className, children, ...props }) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-11 w-full appearance-none rounded-xl border border-slate-700/60 bg-slate-950/70 px-4 pr-10 text-sm font-medium text-slate-100 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] backdrop-blur-xl transition-all duration-200 ease-out hover:border-slate-600 focus:border-cyan-400 focus:bg-slate-900 focus:outline-none focus:ring-4 focus:ring-cyan-500/20 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-slate-900 [&>option]:text-slate-100 [&>option]:py-2",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-hover:text-slate-200" />
    </div>
  );
}
