import { BadgeAlert } from "lucide-react";

export function EmptyState({ title, description, icon }) {
  const Icon = icon || BadgeAlert;

  return (
    <div className="surface-card-muted flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-gradient-to-r from-blue-500/15 via-purple-500/15 to-cyan-500/15 text-cyan-200">
        <Icon className="h-5 w-5" />
      </div>
      <div className="brand-heading text-lg font-semibold text-white">{title}</div>
      <p className="max-w-md text-sm text-slate-400">{description}</p>
    </div>
  );
}
