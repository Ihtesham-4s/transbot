import { Card, CardContent } from "./ui/Card";
import { Badge } from "./ui/Badge";

export function StatCard({ label, value, tone = "neutral", icon, helper }) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-400">{label}</div>
          <div className="brand-heading mt-3 text-3xl font-semibold text-white">{value}</div>
          {helper ? <div className="mt-2 text-xs text-slate-400">{helper}</div> : null}
        </div>
        <Badge tone={tone} className="shrink-0">
          {icon}
        </Badge>
      </CardContent>
    </Card>
  );
}
