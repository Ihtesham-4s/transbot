import {
  AlertCircle,
  Bot,
  Clock,
  LogOut,
  MapPin,
  Battery,
  Pause,
  Play,
  Shield,
  HardHat
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useAuth } from "../context/AuthContext";
import { getRobot, robotTransition } from "../lib/api";
import {
  ROBOT_STATES,
  ROBOT_STATE_LABELS,
  ROBOT_STATE_BADGE_CLASSES
} from "../constants/robotStates";
import { useEffect, useState } from "react";
import { cn } from "../lib/cn";

export default function RobotStatusPanel() {
  const { user, token, logout } = useAuth();
  const [robot, setRobot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const isAdmin = user?.role === "admin";

  const state = robot?.currentState || ROBOT_STATES.IDLE;
  const label = ROBOT_STATE_LABELS[state] ?? state;
  const badgeClass = ROBOT_STATE_BADGE_CLASSES[state] ?? ROBOT_STATE_BADGE_CLASSES[ROBOT_STATES.IDLE];

  const canPause = state === ROBOT_STATES.MOVING;
  const canResume = state === ROBOT_STATES.PAUSED;
  const canForceError = isAdmin && state !== ROBOT_STATES.ERROR;
  const canClearFault = isAdmin && state === ROBOT_STATES.ERROR;

  function fmtWhen(dateLike) {
    const d = dateLike ? new Date(dateLike) : null;
    if (!d || Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  }

  async function fetchRobot() {
    setError("");
    setLoading(true);
    try {
      const data = await getRobot(token);
      setRobot(data || null);
    } catch (e) {
      setRobot(null);
      setError(e.message || "Failed to load robots.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRobot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => {
      fetchRobot();
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  async function handleTransition(nextState) {
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

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      <ConfirmDialog
        open={confirmLogoutOpen}
        title="Logout?"
        description="Do you want to logout from your account?"
        icon={<LogOut className="h-5 w-5 text-cyan-200" />}
        confirmText="Logout"
        cancelText="Cancel"
        destructive
        onCancel={() => setConfirmLogoutOpen(false)}
        onConfirm={() => {
          setConfirmLogoutOpen(false);
          logout();
        }}
      />
      {/* ambient background — same as Day-1 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-64 -right-64 h-[680px] w-[680px] rounded-full bg-gradient-to-br from-blue-500/25 via-purple-500/20 to-cyan-500/25 blur-3xl animate-float" />
        <div className="absolute -bottom-72 -left-72 h-[760px] w-[760px] rounded-full bg-gradient-to-br from-cyan-500/20 via-indigo-500/20 to-violet-500/20 blur-3xl animate-float-delayed" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:88px_88px] animate-grid-move" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_55%)]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-8">
        {/* top bar — same layout as Day-1 */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 blur-lg opacity-60 animate-pulse-glow" />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-600 shadow-2xl shadow-blue-500/40">
                <Bot className="h-6 w-6 text-white" />
              </div>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-blue-200 to-cyan-200 bg-clip-text text-transparent">
                  Robot State Machine
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-slate-200 backdrop-blur">
                  {isAdmin ? (
                    <>
                      <Shield className="h-3.5 w-3.5 text-blue-300" />
                      {user?.role?.toUpperCase() || "ADMIN"}
                    </>
                  ) : (
                    <>
                      <HardHat className="h-3.5 w-3.5 text-emerald-300" />
                      {user?.role?.toUpperCase() || "OPERATOR"}
                    </>
                  )}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-300">
                Signed in as <span className="font-bold text-white">{user?.name}</span>{" "}
                <span className="text-slate-400">({user?.email})</span>
              </p>
            </div>
          </div>
          <div className="flex w-full items-center gap-3 overflow-x-auto pb-1 sm:justify-end">
            <Link
              to={isAdmin ? "/admin" : "/operator"}
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              )}
            >
              Dashboard
            </Link>
            <Link
              to="/tasks"
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              )}
            >
              Task Manager
            </Link>
            <Link
              to="/simulation"
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              )}
            >
              Simulation
            </Link>
            {isAdmin ? (
              <Link
                to="/analytics"
                className={cn(
                  "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                )}
              >
                Analytics
              </Link>
            ) : null}
            <Button variant="secondary" onClick={() => setConfirmLogoutOpen(true)} className="shrink-0 px-5 py-3.5">
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>

        {/* Robot State Machine card */}
        <div className="mt-6 grid gap-4 lg:grid-cols-3 lg:items-start">
          <div className="lg:col-span-2">
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle>Robot Overview</CardTitle>
                      <CardDescription>Live robot telemetry and state.</CardDescription>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      
                      <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={autoRefresh}
                          onChange={(e) => setAutoRefresh(e.target.checked)}
                        />
                        Auto refresh
                      </label>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {error ? (
                    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200">
                      {error}
                    </div>
                  ) : null}

                  {loading ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-10 text-center text-slate-400">
                      Loading robot…
                    </div>
                  ) : !robot ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-10 text-center text-slate-400">
                      No active robot found.
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-slate-300">Current state</div>
                            <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-bold", badgeClass)}>
                              {label}
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-slate-400">Robot: <span className="text-slate-200 font-semibold">{robot.name}</span></div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300">
                              <Battery className="h-4 w-4 text-emerald-200" />
                              Battery
                            </div>
                            <div className="text-sm font-bold text-white">{robot.batteryLevel ?? 100}%</div>
                          </div>
                          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                              className={cn(
                                "h-2 rounded-full",
                                (robot.batteryLevel ?? 100) <= 15
                                  ? "bg-rose-500/70"
                                  : (robot.batteryLevel ?? 100) <= 40
                                    ? "bg-amber-500/70"
                                    : "bg-emerald-500/70"
                              )}
                              style={{ width: `${Math.min(100, Math.max(0, robot.batteryLevel ?? 100))}%` }}
                            />
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300">
                            <MapPin className="h-4 w-4 text-cyan-200" />
                            Location
                          </div>
                          <div className="mt-2 text-sm font-bold text-white">{robot.location || "—"}</div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300">
                            <Clock className="h-4 w-4 text-blue-200" />
                            Last updated
                          </div>
                          <div className="mt-2 text-sm font-bold text-white">{fmtWhen(robot.updatedAt)}</div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="inline-flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 border border-white/10">
                              <Bot className="h-6 w-6 text-cyan-300" />
                            </div>
                            <div>
                              <div className="text-base font-bold text-white">Controls</div>
                              <div className="text-xs text-slate-400">Only valid transitions are accepted by the backend.</div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {canPause ? (
                              <Button variant="secondary" onClick={() => handleTransition(ROBOT_STATES.PAUSED)} disabled={transitioning}>
                                <Pause className="h-4 w-4" />
                                Pause
                              </Button>
                            ) : null}
                            {canResume ? (
                              <Button variant="secondary" onClick={() => handleTransition(ROBOT_STATES.MOVING)} disabled={transitioning}>
                                <Play className="h-4 w-4" />
                                Resume
                              </Button>
                            ) : null}
                            {canClearFault ? (
                              <Button
                                variant="secondary"
                                className="border-emerald-500/40 text-emerald-100 hover:bg-emerald-500/15 hover:border-emerald-500/60"
                                onClick={() => handleTransition(ROBOT_STATES.IDLE)}
                                disabled={transitioning}
                              >
                                <Shield className="h-4 w-4" />
                                Clear fault
                              </Button>
                            ) : null}
                            {canForceError ? (
                              <Button
                                variant="secondary"
                                className="border-rose-500/50 text-rose-200 hover:bg-rose-500/20 hover:border-rose-500/70"
                                onClick={() => handleTransition(ROBOT_STATES.ERROR)}
                                disabled={transitioning}
                              >
                                <AlertCircle className="h-4 w-4" />
                                Force error
                              </Button>
                            ) : null}
                            {transitioning ? <span className="text-xs text-slate-400">Updating…</span> : null}
                          </div>
                        </div>
                      </div>

                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>State guide</CardTitle>
                <CardDescription>Allowed transitions (plus ERROR from any state; admin-only).</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {([
                  [ROBOT_STATES.IDLE, [ROBOT_STATES.ASSIGNED]],
                  [ROBOT_STATES.ASSIGNED, [ROBOT_STATES.MOVING]],
                  [ROBOT_STATES.MOVING, [ROBOT_STATES.IDLE, ROBOT_STATES.PAUSED]],
                  [ROBOT_STATES.PAUSED, [ROBOT_STATES.MOVING]],
                  [ROBOT_STATES.ERROR, [ROBOT_STATES.IDLE]]
                ]).map(([from, tos]) => (
                  <div key={from} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-sm font-bold text-white">{ROBOT_STATE_LABELS[from] || from}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      Can go to: <span className="text-slate-200 font-semibold">{tos.map((t) => ROBOT_STATE_LABELS[t] || t).join(", ")}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
