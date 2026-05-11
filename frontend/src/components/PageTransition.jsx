import { cn } from "../lib/cn";

export function PageTransition({ className, children }) {
  return <div className={cn("animate-fade-in-up", className)}>{children}</div>;
}
