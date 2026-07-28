import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, Clock3, MapPinned, RefreshCw, Route, Warehouse } from "lucide-react";
import { Link } from "react-router-dom";
import { PageTransition } from "../components/PageTransition";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { useAppData } from "../context/AppDataContext";
import { useAuth } from "../context/AuthContext";
import { getDashboardOverview } from "../lib/api";
import { formatDateTime, formatTaskId, formatWeight, getErrorMessage } from "../lib/formatters";
import { getRobotStateMeta, getTaskStatusMeta } from "../lib/status";
import WarehouseMap from "../components/WarehouseMap";

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function defaultOverview() {
  return {
    robot: {
      totalRobots: 0,
      idleRobots: 0,
      busyRobots: 0,
      errorRobots: 0,
      activeRobotName: null,
      activeRobotState: "IDLE",
      locationLabel: null,
      autoMode: false,
      activeTask: null
    },
    tasks: {
      total: 0,
      open: 0,
      byStatus: {},
      recent: []
    },
    zones: {
      total: 0,
      byType: {},
      list: []
    },
    actionCenter: {
      activeTask: null,
      recentTasks: [],
      recentLogs: []
    },
    metrics: {
      completionRate: 0,
      openTaskRate: 0,
      totalActionsRequired: 0
    }
  };
}

function mergeOverview(raw) {
  const fallback = defaultOverview();
  if (!raw || typeof raw !== "object") return fallback;

  return {
    robot: { ...fallback.robot, ...raw.robot },
    tasks: {
      ...fallback.tasks,
      ...raw.tasks,
      byStatus: { ...fallback.tasks.byStatus, ...(raw.tasks?.byStatus || {}) },
      recent: raw.tasks?.recent || []
    },
    zones: {
      ...fallback.zones,
      ...raw.zones,
      byType: { ...fallback.zones.byType, ...(raw.zones?.byType || {}) },
      list: raw.zones?.list || []
    },
    actionCenter: {
      ...fallback.actionCenter,
      ...raw.actionCenter,
      recentTasks: raw.actionCenter?.recentTasks || [],
      recentLogs: raw.actionCenter?.recentLogs || []
    },
    metrics: { ...fallback.metrics, ...raw.metrics }
  };
}

function TaskRow({ task }) {
  const statusMeta = getTaskStatusMeta(task.status);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-slate-400">{formatTaskId(task.id)}</div>
          <div className="mt-2 text-sm font-semibold text-white">
            {task.pickupZoneLabel || task.pickupZone || "Pickup"} to {task.dropZoneLabel || task.dropZone || "Dropoff"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span>{formatWeight(task.weight)} kg</span>
        <span>{formatDateTime(task.createdAt)}</span>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <LoadingSkeleton key={index} className="h-[132px]" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <LoadingSkeleton className="h-[420px]" />
        <LoadingSkeleton className="h-[420px]" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { token } = useAuth();
  const { robot: liveRobot, refreshing, refreshData, lastUpdated, loadError } = useAppData();
  const [overviewRaw, setOverviewRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overviewRefreshing, setOverviewRefreshing] = useState(false);

  const overview = useMemo(() => mergeOverview(overviewRaw), [overviewRaw]);

  const loadOverview = useCallback(async () => {
    if (!token) {
      setOverviewRaw(null);
      setLoading(false);
      return;
    }

    try {
      const data = await getDashboardOverview(token);
      setOverviewRaw(data);
      setError("");
    } catch (loadErrorValue) {
      setOverviewRaw(null);
      setError(getErrorMessage(loadErrorValue, "Could not load dashboard overview."));
    } finally {
      setLoading(false);
      setOverviewRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    loadOverview();
  }, [loadOverview]);

  async function handleRefresh() {
    setOverviewRefreshing(true);
    await Promise.allSettled([loadOverview(), refreshData({ silent: true })]);
  }

  const robotStateMeta = getRobotStateMeta(overview.robot.activeRobotState);
  const activeTask = overview.actionCenter.activeTask || overview.robot.activeTask;
  const recentTasks = overview.actionCenter.recentTasks.length
    ? overview.actionCenter.recentTasks
    : overview.tasks.recent;

  return (
    <PageTransition>
      <PageHeader
        title="TransBot Dashboard"
        description="Robot status, task queue, and warehouse zone overview."
        lastUpdated={lastUpdated}
        actions={
          <Button variant="secondary" onClick={handleRefresh} isLoading={refreshing || overviewRefreshing}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {(loadError || error) && (
        <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 backdrop-blur-sm">
          {loadError || error}
        </div>
      )}

      {loading && !overviewRaw ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Robot State"
              value={robotStateMeta.label}
              helper={overview.robot.activeRobotName || "Single prototype robot"}
              tone={overview.robot.errorRobots ? "error" : overview.robot.busyRobots ? "warning" : "success"}
              icon={<Bot className="h-4 w-4" />}
            />
            <StatCard
              label="Open Tasks"
              value={formatNumber(overview.tasks.open)}
              helper={`${formatNumber(overview.tasks.total)} total tasks`}
              tone="info"
              icon={<Route className="h-4 w-4" />}
            />
            <StatCard
              label="Completed"
              value={formatNumber(overview.tasks.byStatus.COMPLETED)}
              helper={`${formatNumber(overview.metrics.completionRate)}% completion rate`}
              tone="success"
              icon={<CheckCircle2 className="h-4 w-4" />}
            />
            <StatCard
              label="Current Zone"
              value={liveRobot?.location || overview.robot.locationLabel || "--"}
              helper="Robot's last logged position"
              tone="primary"
              icon={<Warehouse className="h-4 w-4" />}
            />
          </div>

          {/* Warehouse map hero */}
          <div className="mt-6">
            <WarehouseMap
              robotZone={liveRobot?.location || overview.robot.locationLabel}
              activeTask={activeTask}
            />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock3 className="h-5 w-5 text-cyan-300" />
                  Task Pipeline
                </CardTitle>
                <CardDescription>Current task mix and the most recent robot jobs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-5">
                  {["PENDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "REJECTED"].map((status) => {
                    const meta = getTaskStatusMeta(status);
                    return (
                      <div key={status} className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                        <Badge className={meta.className}>{meta.label}</Badge>
                        <div className="mt-3 text-2xl font-semibold text-white">
                          {formatNumber(overview.tasks.byStatus[status])}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {recentTasks.length === 0 ? (
                  <EmptyState title="No tasks yet" description="Create a task from the Tasks page to start the pipeline." />
                ) : (
                  <div className="grid gap-3">
                    {recentTasks.slice(0, 5).map((task) => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid content-start gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-cyan-300" />
                    Robot
                  </CardTitle>
                  <CardDescription>Live robot execution status.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="brand-heading text-xl font-semibold text-white">
                      {overview.robot.activeRobotName || "Robot unavailable"}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge className={robotStateMeta.badgeClass}>{robotStateMeta.label}</Badge>
                      <Badge tone={overview.robot.autoMode ? "success" : "neutral"}>
                        {overview.robot.autoMode ? "Auto mode" : "Manual mode"}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm text-slate-400">
                      Current zone: {overview.robot.locationLabel || overview.robot.location || "--"}
                    </p>
                  </div>

                  {activeTask ? (
                    <TaskRow task={activeTask} />
                  ) : (
                    <EmptyState title="No active task" description="The robot is waiting for the next assignment." />
                  )}

                  <Link
                    to="/robot"
                    className="inline-flex h-10 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition-all hover:border-white/15 hover:bg-white/10"
                  >
                    Open robot monitor
                  </Link>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Warehouse className="h-5 w-5 text-cyan-300" />
                    Zones
                  </CardTitle>
                  <CardDescription>Active warehouse locations.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {overview.zones.list.map((zone) => (
                    <div key={zone.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <div>
                        <div className="text-sm font-semibold text-white">{zone.label}</div>
                        <div className="font-mono text-xs text-slate-400">{zone.code}</div>
                      </div>
                      <Badge tone="neutral">{zone.type}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </PageTransition>
  );
}
