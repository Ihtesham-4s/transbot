import { BarChart3, ClipboardList, Download, LogOut, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useAuth } from "../context/AuthContext";
import { adminGetLogs, adminGetMetrics } from "../lib/api";
import { cn } from "../lib/cn";

const EVENT_TYPES = [
  "",
  "TASK_CREATED",
  "TASK_ASSIGNED",
  "TASK_REJECTED",
  "TASK_STARTED",
  "TASK_COMPLETED",
  "ROBOT_CHARGING_TRIP"
];

function formatDuration(ms) {
  if (!ms) return "—";
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  const hours = minutes / 60;
  return `${hours.toFixed(1)}h`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function buildCsvReport(metrics, logs) {
  const lines = [];
  lines.push("Section,Metric,Value");
  if (metrics) {
    lines.push(`Summary,Total Tasks,${metrics.totalTasks ?? 0}`);
    const byStatus = metrics.byStatus || {};
    Object.keys(byStatus).forEach((status) => {
      lines.push(`Status,${status},${byStatus[status]}`);
    });
    lines.push(`Durations,Assign to Start,${metrics.avgDurationsMs?.assignToStart ?? 0}`);
    lines.push(`Durations,Start to Complete,${metrics.avgDurationsMs?.startToComplete ?? 0}`);
    lines.push(`Durations,Create to Complete,${metrics.avgDurationsMs?.createToComplete ?? 0}`);
  }
  lines.push("Logs,Timestamp,Event Type,Description");
  (logs || []).forEach((log) => {
    const safeDescription = String(log.description || "").replace(/\n/g, " ").replace(/,/g, ";");
    lines.push(`Logs,${log.timestamp},${log.event_type},${safeDescription}`);
  });
  return lines.join("\n");
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function AdminAnalytics() {
  const { user, token, logout } = useAuth();
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState("");
  const [days, setDays] = useState("7");

  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState("");
  const [eventType, setEventType] = useState("");
  const [page, setPage] = useState(1);

  async function loadMetrics() {
    setMetricsError("");
    setMetricsLoading(true);
    try {
      const res = await adminGetMetrics(token, { days: Number(days) || 7 });
      setMetrics(res);
    } catch (e) {
      setMetrics(null);
      setMetricsError(e.message || "Failed to load metrics.");
    } finally {
      setMetricsLoading(false);
    }
  }

  async function loadLogs(nextPage = page, nextType = eventType) {
    setLogsError("");
    setLogsLoading(true);
    try {
      const res = await adminGetLogs(token, {
        page: nextPage,
        limit: 10,
        eventType: nextType
      });
      setLogs(Array.isArray(res?.logs) ? res.logs : []);
    } catch (e) {
      setLogs([]);
      setLogsError(e.message || "Failed to load logs.");
    } finally {
      setLogsLoading(false);
    }
  }

  useEffect(() => {
    loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, eventType]);

  const byStatus = metrics?.byStatus || {};
  const totalTasks = Number(metrics?.totalTasks ?? 0);
  const completedCount = Number(byStatus.COMPLETED ?? 0);
  const rejectedCount = Number(byStatus.REJECTED ?? 0);
  const assignedCount = Number(byStatus.ASSIGNED ?? 0);
  const inProgressCount = Number(byStatus.IN_PROGRESS ?? 0);
  const pendingCount = Number(byStatus.PENDING ?? 0);
  const completionRate = totalTasks ? completedCount / totalTasks : 0;
  const avgPerDay = totalTasks && Number(days) ? totalTasks / Number(days) : 0;

  function handleDownloadJson() {
    const payload = {
      generatedAt: new Date().toISOString(),
      metrics,
      logs
    };
    downloadBlob(JSON.stringify(payload, null, 2), "robot-analytics-report.json", "application/json");
  }

  function handleDownloadCsv() {
    const csv = buildCsvReport(metrics, logs);
    downloadBlob(csv, "robot-analytics-report.csv", "text/csv");
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
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-64 -right-64 h-[680px] w-[680px] rounded-full bg-gradient-to-br from-blue-500/25 via-purple-500/20 to-cyan-500/25 blur-3xl animate-float" />
        <div className="absolute -bottom-72 -left-72 h-[760px] w-[760px] rounded-full bg-gradient-to-br from-cyan-500/20 via-indigo-500/20 to-violet-500/20 blur-3xl animate-float-delayed" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:88px_88px] animate-grid-move" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_55%)]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 blur-lg opacity-60 animate-pulse-glow" />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-600 shadow-2xl shadow-blue-500/40">
                <BarChart3 className="h-6 w-6 text-white" />
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-blue-200 to-cyan-200 bg-clip-text text-transparent">
                  Analytics & Logs
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-slate-200 backdrop-blur">
                  <Shield className="h-3.5 w-3.5 text-blue-300" />
                  {user?.role?.toUpperCase() || "ADMIN"}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-300">
                System performance, timeline, and exportable report.
              </p>
            </div>
          </div>

          <div className="flex w-full items-center gap-3 overflow-x-auto pb-1 sm:justify-end">
            <Link
              to="/admin"
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              )}
            >
              Admin Dashboard
            </Link>
            <Link
              to="/robots"
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              )}
            >
              Robot State Machine
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
            <Button variant="secondary" onClick={() => setConfirmLogoutOpen(true)} className="shrink-0 px-5 py-3.5">
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Performance metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="flex flex-col gap-2">
                  <div className="text-sm font-semibold text-slate-300">Window (days)</div>
                  <div className="w-40">
                    <Input
                      type="number"
                      min="1"
                      max="90"
                      value={days}
                      onChange={(e) => setDays(e.target.value)}
                    />
                  </div>
                </div>
                <Button onClick={loadMetrics} disabled={metricsLoading}>
                  {metricsLoading ? "Refreshing..." : "Refresh metrics"}
                </Button>
              </div>

              {metricsError ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-rose-200">
                  {metricsError}
                </div>
              ) : null}

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <div className="text-xs font-semibold text-slate-400">Total tasks</div>
                  <div className="mt-2 text-2xl font-extrabold text-white">{totalTasks}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <div className="text-xs font-semibold text-slate-400">Completion rate</div>
                  <div className="mt-2 text-2xl font-extrabold text-white">
                    {formatPercent(completionRate)}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <div className="text-xs font-semibold text-slate-400">Avg tasks / day</div>
                  <div className="mt-2 text-2xl font-extrabold text-white">
                    {avgPerDay ? avgPerDay.toFixed(2) : "—"}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <div className="text-xs font-semibold text-slate-400">Avg assign → start</div>
                  <div className="mt-2 text-2xl font-extrabold text-white">
                    {formatDuration(metrics?.avgDurationsMs?.assignToStart)}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <div className="text-xs font-semibold text-slate-400">Avg create → complete</div>
                  <div className="mt-2 text-2xl font-extrabold text-white">
                    {formatDuration(metrics?.avgDurationsMs?.createToComplete)}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs font-semibold text-slate-400">Pending</div>
                  <div className="mt-1 text-lg font-bold text-white">{pendingCount}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs font-semibold text-slate-400">Active</div>
                  <div className="mt-1 text-lg font-bold text-white">{assignedCount + inProgressCount}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs font-semibold text-slate-400">Completed</div>
                  <div className="mt-1 text-lg font-bold text-white">{completedCount}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs font-semibold text-slate-400">Rejected</div>
                  <div className="mt-1 text-lg font-bold text-white">{rejectedCount}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Operations snapshot</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <div className="text-sm font-semibold text-slate-200">Export report</div>
                <p className="mt-2 text-xs text-slate-400">
                  Download the latest metrics + log timeline for audit or reporting.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <Button onClick={handleDownloadJson} className="justify-center">
                    <Download className="h-4 w-4" />
                    Download JSON
                  </Button>
                  <Button variant="secondary" onClick={handleDownloadCsv} className="justify-center">
                    <Download className="h-4 w-4" />
                    Download CSV
                  </Button>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <div className="text-xs font-semibold text-slate-400">Robot snapshot</div>
                <div className="mt-2 text-sm text-white">Battery: {metrics?.robot?.batteryLevel ?? "—"}%</div>
                <div className="text-sm text-white">State: {metrics?.robot?.currentState || "—"}</div>
                <div className="text-sm text-white">Location: {metrics?.robot?.location || "—"}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Logs timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="flex flex-col gap-2">
                  <div className="text-sm font-semibold text-slate-300">Filter by event type</div>
                  <div className="w-64">
                    <Select value={eventType} onChange={(e) => setEventType(e.target.value)}>
                      {EVENT_TYPES.map((type) => (
                        <option key={type || "all"} value={type}>
                          {type ? type.replace(/_/g, " ") : "All events"}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Prev
                  </Button>
                  <span className="text-xs font-semibold text-slate-300">Page {page}</span>
                  <Button variant="secondary" onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>

              {logsError ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-rose-200">
                  {logsError}
                </div>
              ) : null}

              <div className="mt-3 text-xs text-slate-400">Showing {logs.length} events on this page.</div>
              <div className="mt-4 space-y-3">
                {logsLoading ? (
                  <div className="text-sm text-slate-400">Loading logs...</div>
                ) : logs.length === 0 ? (
                  <div className="text-sm text-slate-400">No logs found.</div>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-cyan-200">
                          {log.event_type?.replace(/_/g, " ")}
                        </div>
                        <div className="text-xs text-slate-400">
                          {log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-white">{log.description}</p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Highlights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <ClipboardList className="h-4 w-4 text-cyan-300" />
                  Timeline coverage
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {logs.length} events shown on this page. Use filters to isolate task or robot activity.
                </p>
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <div className="text-xs font-semibold text-slate-400">Charging ETA</div>
                <div className="mt-1 text-lg font-bold text-white">
                  {metrics?.robot?.chargingUntil
                    ? new Date(metrics.robot.chargingUntil).toLocaleTimeString()
                    : "Idle/Ready"}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
