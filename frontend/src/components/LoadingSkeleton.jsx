import { cn } from "../lib/cn";

export function LoadingSkeleton({ className }) {
  return <div className={cn("loading-shimmer rounded-3xl", className)} />;
}
