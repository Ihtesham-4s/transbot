import { LoaderCircle } from "lucide-react";
import { cn } from "../../lib/cn";

const variantClasses = {
  primary:
    "border border-white/10 bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 text-white shadow-[0_18px_48px_rgba(37,99,235,0.34)] hover:shadow-[0_22px_56px_rgba(6,182,212,0.28)] focus-visible:ring-blue-500/50",
  secondary:
    "border border-white/10 bg-white/5 text-white backdrop-blur-xl hover:border-white/15 hover:bg-white/10 focus-visible:ring-blue-500/35",
  ghost:
    "bg-transparent text-slate-300 hover:bg-white/5 hover:text-white focus-visible:ring-blue-500/25",
  danger:
    "border border-rose-400/20 bg-gradient-to-r from-rose-600 to-red-500 text-white shadow-[0_18px_48px_rgba(244,63,94,0.24)] hover:shadow-[0_22px_56px_rgba(244,63,94,0.28)] focus-visible:ring-rose-500/40"
};

const sizeClasses = {
  sm: "h-10 px-4 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-sm",
  icon: "h-10 w-10 px-0"
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  isLoading = false,
  children,
  disabled,
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      className={cn(
        "group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-2xl font-semibold tracking-[0.01em] transition-all duration-300 ease-out active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950/80 disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {variant !== "ghost" ? (
        <span className="pointer-events-none absolute inset-0 -translate-x-[120%] bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-[120%]" />
      ) : null}
      {isLoading ? <LoaderCircle className="relative z-10 h-4 w-4 animate-spin" /> : null}
      {children ? <span className="relative z-10 flex items-center gap-2 truncate">{children}</span> : null}
    </button>
  );
}
