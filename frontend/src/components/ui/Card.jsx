import { cn } from "../../lib/cn";

export function Card({ className, children, ...props }) {
  return (
    <section className={cn("surface-card", className)} {...props}>
      <div className="relative z-10">{children}</div>
    </section>
  );
}

export function CardHeader({ className, ...props }) {
  return <div className={cn("relative z-10 border-b surface-divider px-6 py-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h2 className={cn("brand-heading text-lg font-semibold text-white", className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn("mt-1.5 text-sm leading-6 text-slate-300", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn("relative z-10 px-6 py-6", className)} {...props} />;
}
