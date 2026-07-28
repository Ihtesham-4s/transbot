import { Card, CardContent } from "./ui/Card";
import { Badge } from "./ui/Badge";

export function StatCard({ label, value, tone = "neutral", icon, helper }) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full items-start justify-between gap-4 p-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</div>
          <div className="brand-heading mt-2 text-2xl font-bold text-white tracking-tight">{value}</div>
          {helper ? <div className="mt-1.5 text-xs text-slate-400 font-normal">{helper}</div> : null}
        </div>
        {icon ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-cyan-400 shadow-inner">
            {icon}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
