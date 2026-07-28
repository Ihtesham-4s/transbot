import { LoaderCircle } from "lucide-react";
import { cn } from "../../lib/cn";

const variantClasses = {
  primary:
    "border border-cyan-500/30 bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 text-white shadow-[0_4px_20px_rgba(6,182,212,0.3),inset_0_1px_0_rgba(255,255,255,0.25)] hover:border-cyan-400/60 hover:shadow-[0_6px_28px_rgba(6,182,212,0.45)] hover:brightness-110 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
  secondary:
    "border border-slate-700/60 bg-slate-900/80 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl hover:border-slate-500 hover:bg-slate-800/90 hover:text-white active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
  ghost:
    "bg-transparent text-slate-300 hover:bg-white/[0.07] hover:text-white active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-slate-400",
  danger:
    "border border-rose-500/30 bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-[0_4px_20px_rgba(244,63,94,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] hover:border-rose-400/60 hover:shadow-[0_6px_28px_rgba(244,63,94,0.45)] hover:brightness-110 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
};

const sizeClasses = {
  sm: "h-9 px-3.5 text-xs font-semibold rounded-xl",
  md: "h-11 px-5 text-sm font-semibold rounded-2xl",
  lg: "h-12 px-6 text-sm font-semibold rounded-2xl",
  icon: "h-10 w-10 px-0 rounded-xl"
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
        "group relative inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 ease-out select-none cursor-pointer focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:scale-100",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin shrink-0" /> : null}
      {children ? <span className="flex items-center gap-2 truncate">{children}</span> : null}
    </button>
  );
}
