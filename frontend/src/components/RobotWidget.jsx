import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Bot, Pause, Play, RefreshCw } from "lucide-react";

import { Button } from "./ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/Card";
import { cn } from "../lib/cn";
import { getRobot, robotTransition } from "../lib/api";
import { ROBOT_STATES, ROBOT_STATE_BADGE_CLASSES, ROBOT_STATE_LABELS } from "../constants/robotStates";

function formatWhen(dateLike) {
  const d = dateLike ? new Date(dateLike) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function RobotWidget({ token, role }) {
  const [robot, setRobot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = role === "admin";

  const state = robot?.currentState || ROBOT_STATES.IDLE;
  const stateLabel = ROBOT_STATE_LABELS[state] ?? state;
  const badgeClass = ROBOT_STATE_BADGE_CLASSES[state] ?? ROBOT_STATE_BADGE_CLASSES[ROBOT_STATES.IDLE];

  const canPause = state === ROBOT_STATES.MOVING;
  const canResume = state === ROBOT_STATES.PAUSED;
  const canClearFault = isAdmin && state === ROBOT_STATES.ERROR;
  const canForceError = isAdmin && state !== ROBOT_STATES.ERROR;

  const battery = typeof robot?.batteryLevel === "number" ? robot.batteryLevel : null;

  const batteryTone = useMemo(() => {
    if (battery == null) return "border-white/10 bg-white/5";
    if (battery <= 15) return "border-rose-500/40 bg-rose-500/10";
    if (battery <= 40) return "border-amber-500/40 bg-amber-500/10";
    return "border-emerald-500/30 bg-emerald-500/10";
  }, [battery]);

  async function refresh({ silent = false } = {}) {
    if (!token) return;
    if (!silent) setLoading(true);
    setError("");

    try {
      const res = await getRobot(token);
      setRobot(res || null);
    } catch (e) {
      setRobot(null);
      setError(e.message || "Failed to load robot.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function transition(nextState) {
    if (!token) return;
    setTransitioning(true);
    setError("");
    try {
      const updated = await robotTransition(token, nextState);
      setRobot((prev) => ({ ...(prev || {}), ...(updated || {}) }));
    } catch (e) {
      setError(e.message || "Transition failed.");
    } finally {
      setTransitioning(false);
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(() => refresh({ silent: true }), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-200" />
            Robot
          </span>
          <Button variant="secondary" onClick={() => refresh()} disabled={loading || transitioning}>
            <RefreshCw className={cn("h-4 w-4", loading ? "animate-spin" : "")} />
            Refresh
          </Button>
        </CardTitle>
        <CardDescription>Live robot state and controls.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200">
            {error}
          </div>
        ) : null}

        {!robot ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-slate-400">
            {loading ? "Loading robot…" : "Robot not available."}
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-white">{robot.name}</div>
                <div className="mt-1 text-xs font-medium text-slate-400">
                  Location: <span className="text-slate-200 font-semibold">{robot.location || "—"}</span> · Updated:{" "}
                  <span className="text-slate-200 font-semibold">{formatWhen(robot.updatedAt)}</span>
                </div>
              </div>
              <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-bold", badgeClass)}>
                {stateLabel}
              </span>
            </div>

            <div className={cn("flex items-center justify-between rounded-2xl border px-4 py-3", batteryTone)}>
              <span className="text-sm font-semibold text-slate-300">Battery</span>
              <span className="text-sm font-bold text-white">{battery == null ? "—" : `${battery}%`}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canPause ? (
                <Button variant="secondary" onClick={() => transition(ROBOT_STATES.PAUSED)} disabled={transitioning}>
                  <Pause className="h-4 w-4" />
                  Pause
                </Button>
              ) : null}
              {canResume ? (
                <Button variant="secondary" onClick={() => transition(ROBOT_STATES.MOVING)} disabled={transitioning}>
                  <Play className="h-4 w-4" />
                  Resume
                </Button>
              ) : null}
              {canClearFault ? (
                <Button
                  variant="secondary"
                  className="border-emerald-500/40 text-emerald-100 hover:bg-emerald-500/15 hover:border-emerald-500/60"
                  onClick={() => transition(ROBOT_STATES.IDLE)}
                  disabled={transitioning}
                >
                  <RefreshCw className="h-4 w-4" />
                  Clear fault
                </Button>
              ) : null}
              {canForceError ? (
                <Button
                  variant="secondary"
                  className="border-rose-500/50 text-rose-200 hover:bg-rose-500/20 hover:border-rose-500/70"
                  onClick={() => transition(ROBOT_STATES.ERROR)}
                  disabled={transitioning}
                >
                  <AlertCircle className="h-4 w-4" />
                  Force error
                </Button>
              ) : null}

              <Link
                to="/robots"
                className={cn(
                  "ml-auto inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                )}
              >
                Open Robot Page
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
