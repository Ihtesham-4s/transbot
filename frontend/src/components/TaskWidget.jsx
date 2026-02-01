import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, RefreshCw } from "lucide-react";

import { Button } from "./ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/Card";
import { cn } from "../lib/cn";
import { listTasks } from "../lib/api";

function badgeClass(status) {
  switch (status) {
    case "ASSIGNED":
      return "border-cyan-500/30 bg-cyan-500/10 text-cyan-100";
    case "IN_PROGRESS":
      return "border-amber-500/30 bg-amber-500/10 text-amber-100";
    default:
      return "border-white/10 bg-white/5 text-slate-200";
  }
}

export default function TaskWidget({ token }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeTask = useMemo(() => {
    return tasks.find((t) => t.status === "IN_PROGRESS") || tasks.find((t) => t.status === "ASSIGNED") || null;
  }, [tasks]);

  const recentRejected = useMemo(() => {
    return tasks
      .filter((t) => t.status === "REJECTED")
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 2);
  }, [tasks]);

  const counts = useMemo(() => {
    let pending = 0;
    let completed = 0;
    let active = 0;

    for (const t of tasks) {
      if (t.status === "PENDING") pending += 1;
      else if (t.status === "COMPLETED" || t.status === "REJECTED") completed += 1;
      else if (t.status === "ASSIGNED" || t.status === "IN_PROGRESS") active += 1;
    }

    return { pending, active, completed };
  }, [tasks]);

  async function refresh({ silent = false } = {}) {
    if (!token) return;
    if (!silent) setLoading(true);
    setError("");

    try {
      const taskRes = await listTasks(token);
      setTasks(taskRes?.tasks || []);
    } catch (e) {
      setError(e.message || "Failed to load tasks.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(() => refresh({ silent: true }), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-cyan-200" />
            Tasks
          </span>
          <Button variant="secondary" onClick={() => refresh()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading ? "animate-spin" : "")} />
            Refresh
          </Button>
        </CardTitle>
        <CardDescription>Keep the dashboard clean; manage tasks on a dedicated page.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200">
            {error}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <span className="text-sm font-semibold text-slate-300">Pending</span>
            <span className="text-sm font-bold text-white">{counts.pending}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <span className="text-sm font-semibold text-slate-300">Active</span>
            <span className="text-sm font-bold text-white">{counts.active}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <span className="text-sm font-semibold text-slate-300">Completed</span>
            <span className="text-sm font-bold text-white">{counts.completed}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-bold text-white">Active task</div>
          </div>

          {!activeTask ? (
            <div className="mt-2 text-sm text-slate-400">No task assigned / in progress.</div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono text-xs text-slate-200 truncate">{activeTask.id}</div>
                <div className="mt-1 text-sm text-slate-200">
                  {activeTask.pickup_zone} → {activeTask.drop_zone} · {activeTask.priority}
                </div>
              </div>
              <span
                className={cn(
                  "inline-flex rounded-full border px-2.5 py-1 text-xs font-bold",
                  badgeClass(activeTask.status)
                )}
              >
                {activeTask.status}
              </span>
            </div>
          )}
        </div>

        {recentRejected.length ? (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3">
            <div className="text-sm font-bold text-white">Recent rejections</div>
            <div className="mt-2 grid gap-2">
              {recentRejected.map((t) => (
                <div key={t.id} className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2">
                  <div className="font-mono text-[11px] text-rose-100 truncate">{t.id}</div>
                  <div className="mt-1 text-xs text-slate-200">
                    {t.pickup_zone} → {t.drop_zone}
                  </div>
                  {t.rejection_reason ? (
                    <div className="mt-1 text-xs font-semibold text-rose-200">{t.rejection_reason}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <Link
          to="/tasks"
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          )}
        >
          Open Task Manager
        </Link>
      </CardContent>
    </Card>
  );
}
