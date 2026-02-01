import { cn } from "../../lib/cn";

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-3xl border border-white/10 shadow-2xl shadow-black/50 transition-all duration-500",
        "before:absolute before:inset-0 before:rounded-3xl before:bg-gradient-to-r before:from-blue-500/20 before:via-purple-500/20 before:to-cyan-500/20 before:opacity-0 before:blur-xl before:transition-opacity before:duration-500 hover:before:opacity-100 before:-z-10",
        className
      )}
      {...props}
    >
      {/* Background layer */}
      <div className="absolute inset-[1px] rounded-3xl bg-gradient-to-br from-slate-900/95 via-slate-800/95 to-slate-900/95 backdrop-blur-2xl -z-10" />
      
      {/* Shine effect */}
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-700 -translate-x-full group-hover:translate-x-full pointer-events-none" />
      
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function CardHeader({ className, ...props }) {
  return (
    <div className={cn("relative z-10 p-6 pb-4 border-b border-white/5", className)} {...props} />
  );
}

export function CardTitle({ className, ...props }) {
  return (
    <h1
      className={cn(
        "text-3xl font-extrabold bg-gradient-to-r from-white via-blue-200 to-cyan-200 bg-clip-text text-transparent drop-shadow-lg",
        className
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }) {
  return (
    <p className={cn("mt-2 text-base font-medium text-slate-300", className)} {...props} />
  );
}

export function CardContent({ className, ...props }) {
  return <div className={cn("relative z-10 p-6 pt-4", className)} {...props} />;
}

