import { formatDateTime } from "../lib/formatters";

export function PageHeader({ title, description, actions, lastUpdated }) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
          TransBot Command Center
        </p>
        <h1 className="brand-heading mt-2 bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-3xl font-semibold text-transparent md:text-4xl">
          {title}
        </h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-slate-400">{description}</p> : null}
      </div>

      <div className="flex flex-col items-start gap-3 lg:items-end">
        {actions}
        {lastUpdated ? (
          <span className="text-xs text-slate-400">Last synced {formatDateTime(lastUpdated)}</span>
        ) : null}
      </div>
    </div>
  );
}
