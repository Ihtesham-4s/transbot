import { cn } from "../../lib/cn";

export function Card({ className, children, ...props }) {
  return (
    <section className={cn("surface-card", className)} {...props}>
      <div className="relative z-10">{children}</div>
    </section>
  );
}

export function CardHeader({ className, ...props }) {
  return <div className={cn("relative z-10 border-b border-white/[0.08] px-6 py-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h2 className={cn("brand-heading text-lg font-bold tracking-tight text-white flex items-center gap-2", className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn("mt-1 text-xs leading-5 text-slate-400 font-normal", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn("relative z-10 px-6 py-5", className)} {...props} />;
}
