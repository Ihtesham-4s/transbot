import { Activity, CheckCircle2, Clock3, ListTodo, RefreshCw } from "lucide-react";
import { PageTransition } from "../components/PageTransition";
import { PageHeader } from "../components/PageHeader";
import { RobotStatusCard } from "../components/RobotStatusCard";
import { StatCard } from "../components/StatCard";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { useAppData } from "../context/AppDataContext";
import { formatDateTime, formatTaskId } from "../lib/formatters";
import { getTaskStatusMeta } from "../lib/status";

function DashboardSkeleton() {
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <LoadingSkeleton key={index} className="h-[132px]" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
        <LoadingSkeleton className="h-[360px]" />
        <LoadingSkeleton className="h-[360px]" />
      </div>
    </>
  );
}

export default function Dashboard() {
  const { tasks, robot, logs, initialLoading, refreshing, refreshData, lastUpdated, loadError } =
    useAppData();

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.status === "COMPLETED").length;
  const pendingTasks = tasks.filter((task) => task.status === "PENDING").length;
  const inProgressTasks = tasks.filter((task) => task.status === "IN_PROGRESS").length;
  const recentTasks = [...tasks]
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, 5);
  const recentLogs = logs.slice(0, 5);

  return (
    <PageTransition>
      <PageHeader
        title="Dashboard"
        description="Live operational overview for tasks, robot state, and recent activity."
        lastUpdated={lastUpdated}
        actions={
          <Button variant="secondary" onClick={refreshData} isLoading={refreshing}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {loadError ? (
        <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 backdrop-blur-sm">
          {loadError}
        </div>
      ) : null}

      {initialLoading && totalTasks === 0 && !robot ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-4">
            <StatCard
              label="Total Tasks"
              value={totalTasks}
              helper="All tasks in the system"
              tone="primary"
              icon={<ListTodo className="h-4 w-4" />}
            />
            <StatCard
              label="Completed Tasks"
              value={completedTasks}
              helper="Finished deliveries"
              tone="success"
              icon={<CheckCircle2 className="h-4 w-4" />}
            />
            <StatCard
              label="Pending Tasks"
              value={pendingTasks}
              helper="Waiting to be assigned"
              tone="warning"
              icon={<Clock3 className="h-4 w-4" />}
            />
            <StatCard
              label="In Progress Tasks"
              value={inProgressTasks}
              helper="Active robot deliveries"
              tone="info"
              icon={<Activity className="h-4 w-4" />}
            />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
            <div className="grid gap-6">
              <RobotStatusCard
                robot={robot}
                title="Robot Overview"
                description="Current robot readiness, location, and latest telemetry timestamp."
              />

              <Card>
                <CardHeader>
                  <CardTitle>Recent Tasks</CardTitle>
                  <CardDescription>Five most recent tasks entering the queue.</CardDescription>
                </CardHeader>
                <CardContent>
                  {recentTasks.length === 0 ? (
                    <EmptyState
                      title="No tasks yet"
                      description="Create a task from the Tasks page to start populating the queue."
                    />
                  ) : (
                    <div className="overflow-x-auto thin-scrollbar">
                      <table className="min-w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-white/10 text-slate-400">
                            <th className="pb-3 font-medium">Task ID</th>
                            <th className="pb-3 font-medium">Route</th>
                            <th className="pb-3 font-medium">Status</th>
                            <th className="pb-3 font-medium">Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentTasks.map((task) => {
                            const statusMeta = getTaskStatusMeta(task.status);

                            return (
                              <tr key={task.id} className="border-b border-white/10 last:border-b-0">
                                <td className="py-4 font-mono text-slate-300">{formatTaskId(task.id)}</td>
                                <td className="py-4 text-white">
                                  {(task.pickup_zone_label || task.pickup_zone) || "Unknown"} to{" "}
                                  {(task.drop_zone_label || task.drop_zone) || "Unknown"}
                                </td>
                                <td className="py-4">
                                  <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
                                </td>
                                <td className="py-4 text-slate-400">{formatDateTime(task.createdAt)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent Logs</CardTitle>
                <CardDescription>Latest system events from the activity stream.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentLogs.length === 0 ? (
                  <EmptyState
                    title="No logs available"
                    description="System events will appear here as tasks and robot actions happen."
                  />
                ) : (
                  recentLogs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <Badge tone="primary">{log.event_type}</Badge>
                        <span className="text-xs text-slate-400">{formatDateTime(log.timestamp)}</span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-white">{log.description}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </PageTransition>
  );
}
