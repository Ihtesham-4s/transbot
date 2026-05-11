export default function AppFooter() {
  return (
    <footer className="mt-10 rounded-3xl border border-white/10 bg-white/5 px-6 py-4 text-xs text-slate-300 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">TransBot Command Layer</div>
          <div className="mt-1 text-sm font-semibold text-slate-100">Warehouse Automation System</div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
            Live telemetry
          </span>
          <span className="text-[11px] text-slate-400">Secure access</span>
        </div>
      </div>
    </footer>
  );
}
