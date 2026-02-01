import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Play, Search, Sparkles, Truck, X } from "lucide-react";

import { Button } from "./ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/Card";
import { Input } from "./ui/Input";
import { Select } from "./ui/Select";
import { cn } from "../lib/cn";
import {
  completeTask,
  createTask,
  getRobot,
  listTasks,
  startTask,
  assignTask,
  scheduleNextTask,
  overrideSwapTask
} from "../lib/api";

const ZONES = [
  { id: "ZONE_A", label: "Zone A (Receiving)" },
  { id: "ZONE_B", label: "Zone B (Storage)" },
  { id: "ZONE_C", label: "Zone C (Packing)" },
  { id: "ZONE_D", label: "Zone D (Shipping)" },
  { id: "ZONE_E", label: "Zone E (QA)" },
];

function fmtTime(d) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return String(d);
  }
}

function badgeClass(status) {
  switch (status) {
    case "PENDING":
      return "border-white/10 bg-white/5 text-slate-200";
    case "ASSIGNED":
      return "border-cyan-500/30 bg-cyan-500/10 text-cyan-100";
    case "IN_PROGRESS":
      return "border-amber-500/30 bg-amber-500/10 text-amber-100";
    case "COMPLETED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
    case "REJECTED":
      return "border-rose-500/30 bg-rose-500/10 text-rose-100";
    default:
      return "border-white/10 bg-white/5 text-slate-200";
  }
}

export default function TaskPanel({ token, isAdmin }) {
  const [pickup_zone, setPickupZone] = useState("ZONE_A");
  const [drop_zone, setDropZone] = useState("ZONE_B");
  const [weight, setWeight] = useState(5);
  const [priority, setPriority] = useState("MEDIUM");

  const [adminManualMode, setAdminManualMode] = useState(() => {
    try {
      return localStorage.getItem("taskpanel.adminManualMode") === "true";
    } catch {
      return false;
    }
  });

  const [tab, setTab] = useState(() => {
    try {
      return localStorage.getItem("taskpanel.tab") || "PENDING";
    } catch {
      return "PENDING";
    }
  });
  const [search, setSearch] = useState("");
  const [allViewMode, setAllViewMode] = useState(() => {
    try {
      return localStorage.getItem("taskpanel.allViewMode") || "ALL";
    } catch {
      return "ALL";
    }
  });
  const [allLastN, setAllLastN] = useState(() => {
    try {
      return Number(localStorage.getItem("taskpanel.allLastN") || 50);
    } catch {
      return 50;
    }
  });

  const [completedHistory, setCompletedHistory] = useState(() => {
    try {
      return localStorage.getItem("taskpanel.completedHistory") || "COUNT_50";
    } catch {
      return "COUNT_50";
    }
  });

  const [completedLimit, setCompletedLimit] = useState(50);
  const [pendingJumpId, setPendingJumpId] = useState(null);

  const [tasks, setTasks] = useState([]);
  const [robot, setRobot] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [actingId, setActingId] = useState(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [schedulerInfo, setSchedulerInfo] = useState(null);

  const robotIsIdle = (robot?.currentState || "") === "IDLE";
  const shouldAutoAssign = !isAdmin || !adminManualMode;

  const autoScheduleInFlightRef = useRef(false);
  const rowRefs = useRef({});

  useEffect(() => {
    if (!isAdmin) return;
    try {
      localStorage.setItem("taskpanel.adminManualMode", String(adminManualMode));
    } catch {
      // ignore
    }
  }, [isAdmin, adminManualMode]);

  useEffect(() => {
    try {
      localStorage.setItem("taskpanel.tab", String(tab));
    } catch {
      // ignore
    }
  }, [tab]);

  useEffect(() => {
    try {
      localStorage.setItem("taskpanel.allViewMode", String(allViewMode));
    } catch {
      // ignore
    }
  }, [allViewMode]);

  useEffect(() => {
    try {
      localStorage.setItem("taskpanel.allLastN", String(allLastN));
    } catch {
      // ignore
    }
  }, [allLastN]);

  useEffect(() => {
    try {
      localStorage.setItem("taskpanel.completedHistory", String(completedHistory));
    } catch {
      // ignore
    }
  }, [completedHistory]);

  const activeTask = useMemo(() => {
    return tasks.find((t) => t.status === "IN_PROGRESS") || tasks.find((t) => t.status === "ASSIGNED") || null;
  }, [tasks]);


  const tasksSortedNewestFirst = useMemo(() => {
    return tasks
      .slice()
      .sort((a, b) => {
        const ta = new Date(a.createdAt).getTime();
        const tb = new Date(b.createdAt).getTime();
        return tb - ta;
      });
  }, [tasks]);

  const pendingTasks = useMemo(() => tasksSortedNewestFirst.filter((t) => t.status === "PENDING"), [tasksSortedNewestFirst]);
  const completedTasksAll = useMemo(
    () => tasksSortedNewestFirst.filter((t) => t.status === "COMPLETED" || t.status === "REJECTED"),
    [tasksSortedNewestFirst]
  );

  const completedTasks = useMemo(() => {
    const all = completedTasksAll;

    if (completedHistory === "DAYS_7" || completedHistory === "DAYS_30") {
      const days = completedHistory === "DAYS_7" ? 7 : 30;
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      return all.filter((t) => {
        const ts = new Date(t.createdAt).getTime();
        return Number.isFinite(ts) && ts >= cutoff;
      });
    }

    // Count-based (default)
    const limit = completedLimit || 50;
    return all.slice(0, limit);
  }, [completedTasksAll, completedHistory, completedLimit]);

  const activeTasks = useMemo(
    () => tasksSortedNewestFirst.filter((t) => t.status === "ASSIGNED" || t.status === "IN_PROGRESS"),
    [tasksSortedNewestFirst]
  );

  const visibleTasks = useMemo(() => {
    const query = (search || "").trim().toLowerCase();
    const matchesSearch = (t) => {
      if (!query) return true;
      const haystack = `${t.id || ""} ${t._id || ""} ${t.pickup_zone || ""} ${t.drop_zone || ""} ${t.status || ""} ${t.priority || ""} ${t.weight || ""}`.toLowerCase();
      return haystack.includes(query);
    };

    const isCompleted = (t) => t.status === "COMPLETED" || t.status === "REJECTED";

    // If the user is actively searching, prioritize correct results over history limiting.
    // Still cap to keep the UI snappy.
    if (query) {
      const MAX = 200;
      if (tab === "ACTIVE") return activeTasks.filter(matchesSearch).slice(0, MAX);
      if (tab === "PENDING") return pendingTasks.filter(matchesSearch).slice(0, MAX);
      if (tab === "COMPLETED") return completedTasksAll.filter(matchesSearch).slice(0, MAX);
      if (tab === "ALL") return tasksSortedNewestFirst.filter(matchesSearch).slice(0, MAX);
      return pendingTasks.filter(matchesSearch).slice(0, MAX);
    }

    if (tab === "ACTIVE") return activeTasks;
    if (tab === "PENDING") return pendingTasks;
    if (tab === "COMPLETED") return completedTasks;
    if (tab === "ALL") {
      if (allViewMode === "LAST_N") {
        const n = Number.isFinite(allLastN) ? allLastN : 50;
        return tasksSortedNewestFirst.slice(0, Math.max(1, n));
      }
      return tasksSortedNewestFirst;
    }

    return pendingTasks;
  }, [tab, search, tasksSortedNewestFirst, activeTasks, pendingTasks, completedTasks, completedLimit, allViewMode, allLastN]);


  const skippedCompletedCount = useMemo(() => {
    if (tab !== "ALL") return 0;
    return 0;
  }, [tab]);

  function jumpToActive() {
    if (!activeTask?.id) return;

    // The active row might not be rendered in the current tab.
    // Switch to ACTIVE so the row exists, then scroll after render.
    if (tab !== "ACTIVE" && tab !== "ALL") {
      setTab("ACTIVE");
    }
    setPendingJumpId(activeTask.id);
  }

  useEffect(() => {
    if (!pendingJumpId) return;
    const row = rowRefs.current?.[pendingJumpId];
    if (!row) return;
    // Force scrolling the PAGE (window), not any nested scroll container.
    // This prevents the "scroll feels separate" issue when the browser chooses a scroll ancestor.
    try {
      const headerOffset = 110;
      const top = row.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    } catch {
      // fallback
      row.scrollIntoView?.({ behavior: "auto", block: "start" });
    }
    setPendingJumpId(null);
  }, [pendingJumpId, visibleTasks]);

  async function refreshAll({ silent = false } = {}) {
    if (!token) return;
    if (!silent) setLoading(true);
    setError("");

    try {
      const [taskRes, robotRes] = await Promise.all([listTasks(token), getRobot(token)]);
      setTasks(taskRes?.tasks || []);
      setRobot(robotRes || null);
    } catch (e) {
      setError(e.message || "Failed to refresh tasks.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
    const t = setInterval(() => refreshAll({ silent: true }), 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);


  // In auto mode, ensure the system keeps moving: if robot is IDLE and there are PENDING tasks,
  // trigger a single schedule call (no visible button) and refresh.
  useEffect(() => {
    if (!token) return;
    if (!shouldAutoAssign) return;
    if (!robotIsIdle) return;
    if (activeTask) return;

    const hasPending = tasks.some((t) => t.status === "PENDING");
    if (!hasPending) return;

    if (autoScheduleInFlightRef.current) return;
    autoScheduleInFlightRef.current = true;

    (async () => {
      try {
        await scheduleNextTask(token);
      } catch {
        // ignore; backend may reject if another client scheduled first
      } finally {
        autoScheduleInFlightRef.current = false;
        refreshAll({ silent: true });
      }
    })();
  }, [token, shouldAutoAssign, robotIsIdle, activeTask, tasks]);

  async function onCreate(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setCreating(true);

    try {
      const res = await createTask(
        token,
        { pickup_zone, drop_zone, weight, priority },
        { auto: shouldAutoAssign }
      );
      setNotice(`Task created: ${res?.task?.id}`);
      if (res?.auto?.decision) setSchedulerInfo(res.auto.decision);
      await refreshAll({ silent: true });
    } catch (e2) {
      setError(e2.message || "Failed to create task.");
    } finally {
      setCreating(false);
    }
  }

  function onChangePickup(next) {
    setPickupZone(next);
    if (next === drop_zone) {
      const fallback = ZONES.find((z) => z.id !== next)?.id;
      if (fallback) setDropZone(fallback);
    }
  }

  function onChangeDrop(next) {
    setDropZone(next);
    if (next === pickup_zone) {
      const fallback = ZONES.find((z) => z.id !== next)?.id;
      if (fallback) setPickupZone(fallback);
    }
  }

  async function onAssign(id) {
    setError("");
    setNotice("");
    setActingId(id);

    try {
      const canSwapAssigned =
        isAdmin &&
        adminManualMode &&
        (robot?.currentState || "") === "ASSIGNED" &&
        activeTask?.status === "ASSIGNED";

      const res = canSwapAssigned ? await overrideSwapTask(token, id) : await assignTask(token, id);
      if (res?.decision) setSchedulerInfo(res.decision);
      setNotice(res?.decision?.reason || (canSwapAssigned ? "Override applied." : "Assigned."));
      await refreshAll({ silent: true });
    } catch (e) {
      setError(e.message || "Assign failed.");
      if (e.data?.decision) setSchedulerInfo(e.data.decision);
    } finally {
      setActingId(null);
    }
  }

  async function onStart() {
    if (!activeTask) return;
    setError("");
    setNotice("");
    setActingId(activeTask.id);
    try {
      await startTask(token, activeTask.id);
      setNotice("Task started → robot MOVING");
      await refreshAll({ silent: true });
    } catch (e) {
      setError(e.message || "Start failed.");
    } finally {
      setActingId(null);
    }
  }

  async function onComplete() {
    if (!activeTask) return;
    setError("");
    setNotice("");
    setActingId(activeTask.id);
    try {
      const res = await completeTask(token, activeTask.id, { auto: shouldAutoAssign });
      if (isAdmin && adminManualMode) {
        setNotice("Task completed → robot IDLE (manual override mode)");
      } else {
        setNotice("Task completed → robot IDLE");
        if (res?.next?.decision) setSchedulerInfo(res.next.decision);

        // Fallback: in auto mode, if backend did not schedule next in the same response,
        // trigger scheduling once (without showing a button).
        if (shouldAutoAssign && !res?.next && tasks.some((t) => t.status === "PENDING")) {
          try {
            const scheduled = await scheduleNextTask(token);
            if (scheduled?.decision) setSchedulerInfo(scheduled.decision);
          } catch {
            // ignore; polling will reflect eventual state
          }
        }
      }
      await refreshAll({ silent: true });
    } catch (e) {
      setError(e.message || "Complete failed.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Task creation</CardTitle>
              <CardDescription>Create pickup/drop tasks (operator allowed).</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onCreate} className="grid gap-3">
                <div>
                  <div className="mb-1 text-xs font-semibold text-slate-300">Pickup zone</div>
                  <Select value={pickup_zone} onChange={(e) => onChangePickup(e.target.value)}>
                    {ZONES.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.label}
                      </option>
                    ))}
                  </Select>
                </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-300">Drop zone</div>
                <Select value={drop_zone} onChange={(e) => onChangeDrop(e.target.value)}>
                  {ZONES.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-300">Weight</div>
                <Input type="number" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-300">Priority</div>
                <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </Select>
              </div>

                <Button type="submit" disabled={creating} className="w-full justify-center">
                  <Truck className="h-4 w-4" />
                  {creating ? "Creating…" : "Create task"}
                </Button>

                <div className="grid gap-2">
                  {error ? (
                    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                      </div>
                    </div>
                  ) : null}

                  {notice ? (
                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        {notice}
                      </div>
                    </div>
                  ) : null}

                  {schedulerInfo?.reason ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                      <div className="flex items-center gap-2 font-semibold">
                        <Sparkles className="h-4 w-4 text-cyan-300" />
                        Scheduler decision
                      </div>
                      <div className="mt-1 text-xs text-slate-300">
                        {schedulerInfo.reason}
                        {typeof schedulerInfo.effective_priority === "number" ? (
                          <span className="text-slate-400"> (effective_priority={schedulerInfo.effective_priority})</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="lg:col-span-3">
        <Card>
          <CardHeader>
            <CardTitle>Task queue & scheduler</CardTitle>
            <CardDescription>Fair aging scheduler (HIGH/MEDIUM/LOW + waiting time).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {error ? (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              </div>
            ) : null}

            {notice ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {notice}
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              {isAdmin ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    Scheduling is{" "}
                    <span className="font-bold text-white">{adminManualMode ? "manual" : "automatic"}</span>{" "}
                    for admins.
                    {!robotIsIdle ? (
                      <span className="text-slate-400"> (Robot is currently {robot?.currentState || "—"})</span>
                    ) : null}
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-200 select-none">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/20 bg-white/10"
                      checked={adminManualMode}
                      onChange={(e) => setAdminManualMode(e.target.checked)}
                    />
                    Manual override mode
                  </label>
                </div>
              ) : (
                <>
                  Scheduling is <span className="font-bold text-white">automatic</span> when the robot becomes{" "}
                  <span className="font-bold text-white">IDLE</span>.
                  {!robotIsIdle ? (
                    <span className="text-slate-400"> (Robot is currently {robot?.currentState || "—"})</span>
                  ) : null}
                </>
              )}
            </div>

            {/* Pinned active task (so highlight stays useful even with long history) */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-base font-extrabold text-white">Active task</div>
                    {activeTask ? (
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-3 py-1 text-xs font-extrabold",
                          badgeClass(activeTask.status)
                        )}
                      >
                        {activeTask.status}
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-slate-300">
                        NONE
                      </span>
                    )}
                  </div>

                  {!activeTask ? (
                    <div className="mt-2 text-sm text-slate-400">No task is currently assigned or in progress.</div>
                  ) : (
                    <div className="mt-3 grid gap-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Task ID</div>
                        <div className="mt-1 font-mono text-sm text-slate-100 break-all">{activeTask.id}</div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Pickup</div>
                          <div className="mt-1 text-sm font-bold text-slate-100">{activeTask.pickup_zone}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Drop</div>
                          <div className="mt-1 text-sm font-bold text-slate-100">{activeTask.drop_zone}</div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Priority</div>
                          <div className="mt-1 text-sm font-bold text-slate-100">{activeTask.priority}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Weight</div>
                          <div className="mt-1 text-sm font-bold text-slate-100">{activeTask.weight}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="w-full lg:w-[280px]">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Robot</div>
                    <div className="mt-1 text-sm font-bold text-slate-100">{robot?.name || "—"}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      state: <span className="text-slate-200 font-semibold">{robot?.currentState || "—"}</span>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2">
                    <Button variant="secondary" onClick={() => jumpToActive()} disabled={!activeTask} className="w-full justify-center">
                      <Clock className="h-4 w-4" />
                      Jump to active in list
                    </Button>

                    <div className="text-xs text-slate-400">Tip: no auto-scroll during polling.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              {/* Tabs row (single line) */}
              <div className="min-w-0">
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {[
                      { key: "ACTIVE", label: "Active", count: activeTasks.length },
                      { key: "PENDING", label: "Pending", count: pendingTasks.length },
                      { key: "COMPLETED", label: "Completed", count: completedTasks.length },
                      { key: "ALL", label: "All", count: tasks.length },
                    ].map((t) => {
                      const selected = tab === t.key;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => {
                            setTab(t.key);
                            // reset default history limit when switching views
                            if (completedHistory === "COUNT_20") setCompletedLimit(20);
                            else if (completedHistory === "COUNT_100") setCompletedLimit(100);
                            else setCompletedLimit(50);
                          }}
                          className={cn(
                            "shrink-0 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-extrabold transition",
                            selected
                              ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-100"
                              : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:border-white/20"
                          )}
                          aria-pressed={selected}
                        >
                          {t.label}
                          <span
                            className={cn(
                              "inline-flex min-w-[28px] items-center justify-center rounded-full px-2 py-0.5 text-xs font-extrabold",
                              selected ? "bg-cyan-500/20 text-cyan-100" : "bg-white/10 text-slate-200"
                            )}
                          >
                            {t.count}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Actions row (buttons on left, history selector on right) */}
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  

                  
                </div>

                {tab === "COMPLETED" ? (
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-semibold text-slate-300">Completed history</div>
                    <Select
                      value={completedHistory}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCompletedHistory(v);
                        if (v === "COUNT_20") setCompletedLimit(20);
                        else if (v === "COUNT_100") setCompletedLimit(100);
                        else setCompletedLimit(50);
                      }}
                    >
                      <option value="COUNT_20">Last 20</option>
                      <option value="COUNT_50">Last 50</option>
                      <option value="COUNT_100">Last 100</option>
                      <option value="DAYS_7">Last 7 days</option>
                      <option value="DAYS_30">Last 30 days</option>
                    </Select>
                  </div>
                ) : null}

                {tab === "ALL" ? (
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-semibold text-slate-300">All view</div>
                    <Select value={allViewMode} onChange={(e) => setAllViewMode(e.target.value)}>
                      <option value="ALL">All tasks</option>
                      <option value="LAST_N">Last N tasks</option>
                    </Select>

                    {allViewMode === "LAST_N" ? (
                      <Select value={String(allLastN)} onChange={(e) => setAllLastN(Number(e.target.value))}>
                        <option value="20">20</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                        <option value="200">200</option>
                      </Select>
                    ) : null}
                  </div>
                ) : null}

                <div className="text-xs text-slate-400 sm:whitespace-nowrap">
                  Showing <span className="text-slate-200 font-semibold">{visibleTasks.length}</span>
                  {search ? <span> · filtered</span> : null}
                </div>
              </div>

              {/* Search row (placed AFTER actions so it doesn't look stuck between buttons) */}
              <div className="relative mt-3 pt-3 border-t border-white/10">
                <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10">
                  <Search className="h-4 w-4" />
                </div>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by id, pickup, drop, status…"
                  className="pl-10"
                />
                {search ? (
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 z-10"
                    onClick={() => setSearch("")}
                    title="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-bold text-slate-300 border-b border-white/10">
                <div className="col-span-3">Task ID</div>
                <div className="col-span-2">Pickup</div>
                <div className="col-span-2">Drop</div>
                <div className="col-span-1">Wt</div>
                <div className="col-span-2">Priority</div>
                <div className="col-span-2">Status</div>
              </div>

              <div className="">
                {tasks.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-slate-400 text-center">No tasks yet.</div>
                ) : visibleTasks.length === 0 ? (
                  <div className="px-4 py-10 text-sm text-slate-400 text-center">
                    No matching tasks.
                    {search ? (
                      <div className="mt-2">
                        <button className="text-cyan-200 font-semibold hover:underline" onClick={() => setSearch("")}>
                          Clear search
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  visibleTasks.map((t) => {
                      const isActive = t.id === activeTask?.id;
                      const isSelected = t.id === selectedTaskId;
                      return (
                        <div
                          ref={(node) => {
                            if (node) rowRefs.current[t.id] = node;
                          }}
                          key={t.id}
                          onClick={() => setSelectedTaskId(t.id)}
                          className={cn(
                            "grid grid-cols-12 gap-2 px-4 py-4 text-sm border-t border-white/5 cursor-pointer",
                            isActive ? "bg-cyan-500/10" : "",
                            isSelected ? "ring-1 ring-cyan-400/50 bg-cyan-500/5" : "",
                            "hover:bg-white/[0.03]"
                          )}
                        >
                          <div className="col-span-3 font-mono text-xs text-slate-200 truncate">
                            {t.id}
                            {isActive ? (
                              <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-100">
                                <Clock className="h-3 w-3" />
                                ACTIVE
                              </span>
                            ) : null}
                          </div>
                          <div className="col-span-2 text-slate-200 truncate">{t.pickup_zone}</div>
                          <div className="col-span-2 text-slate-200 truncate">{t.drop_zone}</div>
                          <div className="col-span-1 text-slate-200">{t.weight}</div>
                          <div className="col-span-2">
                            <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs font-bold text-slate-100">
                              {t.priority}
                            </span>
                          </div>
                          <div className="col-span-2 flex flex-col items-end gap-2">
                            <span className={cn("inline-flex rounded-full border px-2 py-1 text-xs font-bold", badgeClass(t.status))}>
                              {t.status}
                            </span>

                            {t.status === "REJECTED" && t.rejection_reason ? (
                              <div className="max-w-full text-right text-[11px] font-semibold text-rose-200">
                                {t.rejection_reason}
                              </div>
                            ) : null}

                            {(() => {
                              const canOverrideNow =
                                isAdmin &&
                                adminManualMode &&
                                t.status === "PENDING" &&
                                (robotIsIdle || ((robot?.currentState || "") === "ASSIGNED" && activeTask?.status === "ASSIGNED"));

                              if (!canOverrideNow) return null;

                              const label = robotIsIdle ? "Assign next" : "Swap";
                              return (
                                <Button
                                  variant="ghost"
                                  className="px-2 py-1 text-xs whitespace-nowrap shrink-0 border border-white/10 bg-white/5 hover:bg-white/10"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onAssign(t.id);
                                  }}
                                  disabled={actingId === t.id}
                                  title={
                                    robotIsIdle
                                      ? "Admin override: assign this pending task next"
                                      : "Admin override: swap currently assigned task (not started)"
                                  }
                                >
                                  {label}
                                </Button>
                              );
                            })()}
                          </div>
                          <div className="col-span-12 mt-1 text-[11px] text-slate-500">
                            Created: {fmtTime(t.createdAt)}
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>

            {tab === "COMPLETED" && (completedHistory === "COUNT_20" || completedHistory === "COUNT_50" || completedHistory === "COUNT_100") ? (
              <div className="flex items-center justify-center">
                <div className="text-xs text-slate-400">
                  Tip: adjust <span className="text-slate-200 font-semibold">Completed history</span> to see more.
                </div>
              </div>
            ) : null}

            <div className="text-xs text-slate-400">
              Tip: use <span className="text-slate-200 font-semibold">Active</span> tab (or “Jump to active”) to focus; completed history is limited unless you search.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
