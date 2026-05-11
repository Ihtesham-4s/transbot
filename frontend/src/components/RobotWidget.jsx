import { useEffect, useState } from "react";
import { AlertCircle, Bot, RefreshCw } from "lucide-react";

import { Button } from "./ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/Card";
import { cn } from "../lib/cn";
import { getRobot, robotTransition } from "../lib/api";

function formatWhen(dateLike) {
  const d = dateLike ? new Date(dateLike) : null;
  if (!d || Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString();
}

export default function RobotWidget({ token }) {
  const [robot, setRobot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState("");

  const state = robot?.currentState || "IDLE";

  const stateColors = {
    IDLE: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50",
    BUSY: "bg-blue-500/20 text-blue-300 border-blue-500/50",
    ERROR: "bg-rose-500/20 text-rose-300 border-rose-500/50"
  };
  const badgeClass = stateColors[state] ?? stateColors.IDLE;

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
            Physical Robot Status
          </span>
          <Button variant="secondary" onClick={() => refresh()} disabled={loading || transitioning}>
            <RefreshCw className={cn("h-4 w-4", loading ? "animate-spin" : "")} />
            Refresh
          </Button>
        </CardTitle>
        <CardDescription>Live physical robot state and fallback controls.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200">
            {error}
          </div>
        ) : null}

        {!robot ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-slate-400">
            {loading ? "Loading robot..." : "Robot not available."}
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-white">{robot.name}</div>
                <div className="mt-1 text-xs font-medium text-slate-400">
                  Location: <span className="text-slate-200 font-semibold">{robot.location || "--"}</span> | Updated:{" "}
                  <span className="text-slate-200 font-semibold">{formatWhen(robot.updatedAt)}</span>
                </div>
              </div>
              <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-bold", badgeClass)}>
                {state}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              {state === "ERROR" ? (
                <Button
                  variant="secondary"
                  className="mb-2 w-full border-emerald-500/40 text-emerald-100 hover:border-emerald-500/60 hover:bg-emerald-500/15"
                  onClick={() => transition("IDLE")}
                  disabled={transitioning}
                >
                  <RefreshCw className="h-4 w-4" />
                  Clear fault (Set to IDLE)
                </Button>
              ) : null}
              {state !== "ERROR" ? (
                <Button
                  variant="secondary"
                  className="w-full border-rose-500/50 text-rose-200 hover:border-rose-500/70 hover:bg-rose-500/20"
                  onClick={() => transition("ERROR")}
                  disabled={transitioning}
                >
                  <AlertCircle className="h-4 w-4" />
                  Force error state
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
