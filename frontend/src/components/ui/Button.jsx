import { cn } from "../../lib/cn";

export function Button({ className, variant = "primary", ...props }) {
  return (
    <button
      className={cn(
        "group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl px-6 py-3.5 text-sm font-bold transition-all duration-300 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed",
        variant === "primary" &&
          "bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 text-white shadow-lg shadow-blue-500/50 hover:shadow-xl hover:shadow-blue-500/60 hover:scale-[1.02]",
        variant === "secondary" &&
          "bg-white/10 text-white border border-white/20 shadow-lg hover:bg-white/20 hover:border-white/30 backdrop-blur-sm",
        variant === "ghost" &&
          "bg-transparent text-slate-300 hover:bg-white/5 hover:text-white",
        className
      )}
      {...props}
    >
      {/* Shine effect */}
      {variant === "primary" && (
        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:translate-x-full transition-transform duration-700" />
      )}
      <span className="relative z-10 flex items-center gap-2">{props.children}</span>
    </button>
  );
}

