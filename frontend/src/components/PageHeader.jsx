import { formatDateTime } from "../lib/formatters";

export function PageHeader({ title, description, actions, lastUpdated, icon }) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">
            TransBot Command Center
          </p>
        </div>
        <h1 className="brand-heading mt-1 flex items-center gap-3 text-2xl font-bold text-white md:text-3xl">
          {icon ? <span className="text-cyan-400">{icon}</span> : null}
          {title}
        </h1>
        {description ? <p className="mt-1 max-w-2xl text-xs text-slate-400 leading-relaxed">{description}</p> : null}
      </div>

      <div className="flex flex-col items-start gap-2.5 lg:items-end">
        {actions}
        {lastUpdated ? (
          <span className="text-[11px] text-slate-500 font-mono">Last synced {formatDateTime(lastUpdated)}</span>
        ) : null}
      </div>
    </div>
  );
}
