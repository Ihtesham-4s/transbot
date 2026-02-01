import { cn } from "../../lib/cn";

export function Input({ className, ...props }) {
  return (
    <div className="relative group">
      <input
        className={cn(
          "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white placeholder:text-slate-400 shadow-lg backdrop-blur-sm transition-all duration-300",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900",
          "focus-visible:border-blue-500/50 focus-visible:bg-white/10 hover:border-white/20 hover:bg-white/10",
          "autofill:bg-white/5 autofill:text-white",
          className
        )}
        {...props}
      />
      {/* Glow effect on focus */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-cyan-500/20 opacity-0 blur-xl group-focus-within:opacity-100 transition-opacity duration-300 -z-10" />
    </div>
  );
}

