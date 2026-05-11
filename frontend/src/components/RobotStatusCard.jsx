import { Bot, Clock3, MapPin } from "lucide-react";
import { getRobotStateMeta } from "../lib/status";
import { formatDateTime } from "../lib/formatters";
import { RobotStateVisual } from "./RobotStateVisual";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/Card";
import { Badge } from "./ui/Badge";

export function RobotStatusCard({
  robot,
  title = "Robot Status",
  description = "Live robot state, location, and telemetry.",
  actions = null
}) {
  const stateMeta = getRobotStateMeta(robot?.currentState);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-cyan-300" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Badge className={stateMeta.badgeClass}>{stateMeta.label}</Badge>
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.9fr)]">
        <div className="surface-card-muted flex flex-col gap-4 p-5">
          <div className="flex items-center gap-4">
            <RobotStateVisual state={stateMeta.key} />
            <div>
              <div className="brand-heading text-2xl font-semibold text-white">{stateMeta.label}</div>
              <p className="mt-1 text-sm text-slate-400">{stateMeta.description}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <MapPin className="h-4 w-4" />
                Current zone
              </div>
              <div className="mt-2 text-lg font-semibold text-white">
                {robot?.location_label || robot?.location || "--"}
              </div>
              {robot?.location_label && robot?.location ? (
                <div className="mt-1 text-xs text-slate-400">{robot.location}</div>
              ) : null}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Clock3 className="h-4 w-4" />
                Last updated
              </div>
              <div className="mt-2 text-lg font-semibold text-white">
                {formatDateTime(robot?.updatedAt)}
              </div>
            </div>
          </div>
        </div>

        <div className="surface-card-muted flex flex-col justify-between gap-4 p-5">
          <div>
            <div className="text-sm text-slate-400">Robot name</div>
            <div className="mt-2 brand-heading text-xl font-semibold text-white">
              {robot?.name || "Robot unavailable"}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="text-sm text-slate-400">Operational note</div>
            <div className="mt-2 text-sm leading-6 text-white">{stateMeta.description}</div>
          </div>

          {actions}
        </div>
      </CardContent>
    </Card>
  );
}
