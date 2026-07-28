import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, ListFilter, PackagePlus, RefreshCw, Trash2 } from "lucide-react";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { PageHeader } from "../components/PageHeader";
import { PageTransition } from "../components/PageTransition";
import { useAppData } from "../context/AppDataContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { listTaskQueue } from "../lib/api";
import { formatDateTime, formatTaskId, formatWeight } from "../lib/formatters";
import { getTaskStatusMeta } from "../lib/status";

const PAGE_SIZE = 10;

function TasksTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <LoadingSkeleton key={index} className="h-16" />
      ))}
    </div>
  );
}

export default function Tasks() {
  const toast = useToast();
  const { token } = useAuth();
  const {
    zones,
    tasks,
    robot,
    initialLoading,
    refreshing,
    pendingActions,
    refreshData,
    createTaskAction,
    assignTaskAction,
    completeTaskAction,
    deleteTaskAction,
    lastUpdated
  } = useAppData();

  // Pickup zone is locked to the robot's current zone
  const robotZoneCode = robot?.location || null;
  const robotZoneLabel = robotZoneCode ? `Zone ${robotZoneCode}` : "Unknown";

  // Drop zone: user-selected, must differ from pickup zone
  const [dropZone, setDropZone] = useState("");
  const [weight, setWeight] = useState("1");
  const [weightError, setWeightError] = useState("");
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [page, setPage] = useState(1);
  const [queueOpen, setQueueOpen] = useState(true);
  const [queueTasks, setQueueTasks] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueRefreshing, setQueueRefreshing] = useState(false);
  const [clearingQueue, setClearingQueue] = useState(false);

  // All zones except the robot's current zone are valid drop targets
  const availableDropZones = zones.filter((z) => z.code !== robotZoneCode);
  const selectedDropZone = dropZone || availableDropZones[0]?.code || "";
  const canCreateTask = Boolean(robotZoneCode && selectedDropZone && weight && !weightError);

  const sortedTasks = [...tasks].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  const totalPages = Math.max(1, Math.ceil(sortedTasks.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedTasks = sortedTasks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const loadTaskQueue = useCallback(async ({ silent = false } = {}) => {
    if (!token) {
      setQueueTasks([]);
      setQueueLoading(false);
      return;
    }

    if (silent) setQueueRefreshing(true);
    else setQueueLoading(true);

    try {
      const data = await listTaskQueue(token);
      setQueueTasks(data.tasks || []);
    } catch {
      setQueueTasks([]);
    } finally {
      setQueueLoading(false);
      setQueueRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadTaskQueue();
  }, [loadTaskQueue, tasks]);

  async function handleRefreshAll() {
    await Promise.allSettled([refreshData(), loadTaskQueue({ silent: true })]);
  }

  async function handleClearQueue() {
    if (!token) return;
    setClearingQueue(true);
    try {
      await apiFetch("/api/tasks/queue/clear", { method: "DELETE", token });
      toast.success("Task queue cleared.");
      await handleRefreshAll();
    } catch (clearErr) {
      toast.error(getErrorMessage(clearErr, "Failed to clear queue."));
    } finally {
      setClearingQueue(false);
    }
  }

  async function handleCreateTask(event) {
    event.preventDefault();

    const parsedWeight = Number(weight);
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
      setWeightError("Weight must be greater than 0.");
      return;
    }
    if (parsedWeight > 2) {
      setWeightError("Weight cannot exceed 2 kg — robot payload limit is 2 kg.");
      return;
    }

    if (!robotZoneCode) {
      toast.error("Cannot determine robot's current zone. Refresh the page.");
      return;
    }
    if (robotZoneCode === selectedDropZone) {
      toast.error("Pickup and drop zones must be different.");
      return;
    }

    setWeightError("");
    await createTaskAction({
      pickup_zone: robotZoneCode,
      drop_zone: selectedDropZone,
      weight: parsedWeight
    });
    setWeight("1");
    setDropZone("");
  }

  async function handleCopyTaskId(taskId) {
    try {
      await navigator.clipboard.writeText(String(taskId || ""));
      toast.success("Task ID copied.");
    } catch {
      toast.error("Failed to copy task ID.");
    }
  }

  return (
    <PageTransition>
      <PageHeader
        title="Tasks"
        description="Use this as a manual backup flow when a task needs to be created outside the pick list process."
        lastUpdated={lastUpdated}
        actions={
          <Button variant="secondary" onClick={handleRefreshAll} isLoading={refreshing || queueRefreshing}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <ConfirmDialog
        open={Boolean(taskToDelete)}
        title="Delete task?"
        description="Deleting an in-progress task will also force the robot back to IDLE."
        icon={<Trash2 className="h-5 w-5 text-rose-200" />}
        confirmText="Delete task"
        confirmLoading={taskToDelete ? pendingActions[`delete-${taskToDelete.id}`] : false}
        destructive
        onCancel={() => setTaskToDelete(null)}
        onConfirm={async () => {
          if (!taskToDelete) return;
          await deleteTaskAction(taskToDelete.id);
          setTaskToDelete(null);
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-cyan-300" />
            Create Emergency Task
          </CardTitle>
          <CardDescription>
            Manual fallback for cases where a task must be created outside the approved pick list flow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 xl:grid-cols-[1fr_1fr_160px_auto]" onSubmit={handleCreateTask}>
            {/* Pickup zone — locked to robot's current location */}
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-300">Pickup Zone</label>
              <div className="flex items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white">
                {robotZoneCode ? (
                  <span className="font-medium">{robotZoneLabel}</span>
                ) : (
                  <span className="text-slate-500">Robot zone unknown — refresh</span>
                )}
                <span className="ml-2 text-xs text-slate-500">(robot location)</span>
              </div>
            </div>

            {/* Drop zone — all zones except pickup */}
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-300">Drop Zone</label>
              <Select
                value={selectedDropZone}
                onChange={(event) => { setDropZone(event.target.value); }}
                required
              >
                {!selectedDropZone ? <option value="">Select drop zone</option> : null}
                {availableDropZones.map((zone) => (
                  <option key={zone.id} value={zone.code}>
                    {zone.label || `Zone ${zone.code}`}
                  </option>
                ))}
              </Select>
            </div>

            {/* Weight with 2kg strict cap */}
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-300">
                Weight (kg)
              </label>
              <Input
                type="number"
                min="0.1"
                max="2"
                step="0.1"
                value={weight}
                onChange={(event) => {
                  setWeight(event.target.value);
                  const v = Number(event.target.value);
                  if (v > 2) setWeightError("Max 2 kg.");
                  else if (v <= 0) setWeightError("Must be > 0.");
                  else setWeightError("");
                }}
                placeholder="1.0"
                required
              />
              {weightError ? (
                <p className="text-xs text-rose-400">{weightError}</p>
              ) : (
                <p className="text-xs text-slate-400">Max payload: 2 kg</p>
              )}
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-transparent">Create</label>
              <Button type="submit" isLoading={pendingActions["create-task"]} disabled={!canCreateTask}>
                Create Task
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ListFilter className="h-5 w-5 text-cyan-300" />
              Queue View
            </CardTitle>
            <CardDescription>Pending and assigned dispatch work currently waiting in the queue.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {queueTasks.length > 0 ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                isLoading={clearingQueue}
                onClick={handleClearQueue}
              >
                <Trash2 className="h-4 w-4" />
                Clear Queue
              </Button>
            ) : null}
            <Button type="button" variant="secondary" size="sm" onClick={() => setQueueOpen((value) => !value)}>
              {queueOpen ? "Hide Queue" : "Show Queue"}
            </Button>
          </div>
        </CardHeader>
        {queueOpen ? (
          <CardContent>
            {queueLoading && queueTasks.length === 0 ? (
              <TasksTableSkeleton />
            ) : queueTasks.length === 0 ? (
              <EmptyState title="Queue is clear" description="Pending and assigned tasks will appear here." />
            ) : (
              <div className="grid gap-3">
                {queueTasks.map((task, index) => {
                  const statusMeta = getTaskStatusMeta(task.status);

                  return (
                    <div key={task.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone="neutral">#{index + 1}</Badge>
                            <span className="font-mono text-sm text-slate-300" title={task.id}>{formatTaskId(task.id)}</span>
                            <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
                            {Number(task.weight) > 2 || task.assignedType === "HUMAN_WORKER" ? (
                              <Badge tone="warning">Human Worker (Courier)</Badge>
                            ) : (
                              <Badge tone="primary">Robot Eligible</Badge>
                            )}
                          </div>
                          <div className="mt-2 text-sm text-slate-300">
                            {task.pickup_zone_label || task.pickup_zone || "Unknown"} to {task.drop_zone_label || task.drop_zone || "Unknown"} · {formatWeight(task.weight)} kg
                          </div>
                        </div>
                        <div className="text-sm text-slate-400">{formatDateTime(task.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        ) : null}
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Task Queue</CardTitle>
          <CardDescription>All tasks currently in the system.</CardDescription>
        </CardHeader>
        <CardContent>
          {initialLoading && tasks.length === 0 ? (
            <TasksTableSkeleton />
          ) : tasks.length === 0 ? (
            <EmptyState
              title="No tasks available"
              description="Create a manual emergency task above if you need a backup job in the system."
            />
          ) : (
            <>
              <div className="overflow-x-auto thin-scrollbar">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400">
                      <th className="pb-3 font-medium">Task ID</th>
                      <th className="pb-3 font-medium">Pickup Zone</th>
                      <th className="pb-3 font-medium">Drop Zone</th>
                      <th className="pb-3 font-medium">Weight</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Created Time</th>
                      <th className="pb-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTasks.map((task) => {
                      const statusMeta = getTaskStatusMeta(task.status);

                      return (
                        <tr key={task.id} className="border-b border-white/10 last:border-b-0">
                          <td className="py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-slate-300" title={task.id}>{formatTaskId(task.id)}</span>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => handleCopyTaskId(task.id)}
                                aria-label={`Copy task id ${task.id}`}
                                title="Copy full task ID"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                          <td className="py-4 text-white">
                            {task.pickup_zone_label || task.pickup_zone || "Unknown"}
                          </td>
                          <td className="py-4 text-white">
                            {task.drop_zone_label || task.drop_zone || "Unknown"}
                          </td>
                          <td className="py-4 text-white">{formatWeight(task.weight)} kg</td>
                          <td className="py-4">
                            <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
                          </td>
                          <td className="py-4 text-slate-400">{formatDateTime(task.createdAt)}</td>
                          <td className="py-4">
                            <div className="flex flex-wrap justify-end gap-2">
                              {task.status === "PENDING" ? (() => {
                                const isHumanTask = Number(task.weight) > 2 || task.assignedType === "HUMAN_WORKER";
                                const taskPickupCode = task.pickup_zone_code || task.pickup_zone_id?.code || task.pickup_zone;
                                const isMatch = taskPickupCode === robotZoneCode;

                                if (isHumanTask) {
                                  return (
                                    <Button
                                      size="sm"
                                      variant="primary"
                                      isLoading={pendingActions[`complete-${task.id}`]}
                                      onClick={() => completeTaskAction(task.id)}
                                    >
                                      <CheckCircle2 className="h-4 w-4" />
                                      Complete Courier Task
                                    </Button>
                                  );
                                }

                                if (!isMatch) {
                                  return (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      disabled
                                      title={`Cannot assign: task pickup is Zone ${taskPickupCode}, but robot is at Zone ${robotZoneCode || "unknown"}.`}
                                    >
                                      Wrong Zone
                                    </Button>
                                  );
                                }

                                return (
                                  <Button
                                    size="sm"
                                    isLoading={pendingActions[`assign-${task.id}`]}
                                    onClick={() => assignTaskAction(task.id)}
                                  >
                                    Assign
                                  </Button>
                                );
                              })() : null}

                              {/* Complete button removed here — task completion is performed on Robot Prototype Monitor */}

                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => setTaskToDelete(task)}
                                isLoading={pendingActions[`delete-${task.id}`]}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-400">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, sortedTasks.length)} of {sortedTasks.length} tasks
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    Previous
                  </Button>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white backdrop-blur-xl">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
