import { useEffect, useState } from "react";
import { Copy, PackagePlus, RefreshCw, Trash2 } from "lucide-react";
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
import { useToast } from "../context/ToastContext";
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
  const {
    pickupZones,
    dropZones,
    tasks,
    initialLoading,
    refreshing,
    pendingActions,
    refreshData,
    createTaskAction,
    createBulkTasksAction,
    assignTaskAction,
    completeTaskAction,
    deleteTaskAction,
    lastUpdated
  } = useAppData();

  const [taskMode, setTaskMode] = useState("single");
  const [pickupZone, setPickupZone] = useState("");
  const [dropZone, setDropZone] = useState("");
  const [weight, setWeight] = useState("1");
  const [priority, setPriority] = useState("MEDIUM");
  const [bulkText, setBulkText] = useState("");
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [page, setPage] = useState(1);

  const selectedPickupZone = pickupZone || pickupZones[0]?.code || "";
  const selectedDropZone = dropZone || dropZones[0]?.code || "";
  const canCreateTask = Boolean(selectedPickupZone && selectedDropZone && weight);

  const sortedTasks = [...tasks].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  const totalPages = Math.max(1, Math.ceil(sortedTasks.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedTasks = sortedTasks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  async function handleCreateTask(event) {
    event.preventDefault();
    await createTaskAction({
      pickup_zone: selectedPickupZone,
      drop_zone: selectedDropZone,
      weight: Number(weight),
      priority: priority
    });
    setWeight("1");
    setPriority("MEDIUM");
  }

  async function handleCreateBulkTasks(event) {
    event.preventDefault();
    const result = await createBulkTasksAction({ text: bulkText });

    if (result?.created > 0) {
      toast.success(`Created ${result.created} task(s). Failed: ${result.failed || 0}.`);
    } else {
      const firstError = result?.errors?.[0]?.reason || "No tasks were created.";
      toast.error(`Bulk create failed: ${firstError}`);
    }

    setBulkText("");
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
        description="Create delivery jobs, monitor their progress, and manage the queue from one place."
        lastUpdated={lastUpdated}
        actions={
          <Button variant="secondary" onClick={refreshData} isLoading={refreshing}>
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
            Create Tasks
          </CardTitle>
          <CardDescription>Use single mode for one task or bulk mode for many tasks at once.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={taskMode === "single" ? "primary" : "secondary"}
              onClick={() => setTaskMode("single")}
            >
              Single Task
            </Button>
            <Button
              type="button"
              size="sm"
              variant={taskMode === "bulk" ? "primary" : "secondary"}
              onClick={() => setTaskMode("bulk")}
            >
              Bulk Tasks
            </Button>
          </div>

          {taskMode === "single" ? (
            <form className="grid gap-4 xl:grid-cols-[1fr_1fr_140px_120px_auto]" onSubmit={handleCreateTask}>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-300">Pickup Zone</label>
                <Select
                  value={selectedPickupZone}
                  onChange={(event) => setPickupZone(event.target.value)}
                  required
                >
                  {!selectedPickupZone ? <option value="">Select pickup zone</option> : null}
                  {pickupZones.map((zone) => (
                    <option key={zone.id} value={zone.code}>
                      {zone.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-300">Drop Zone</label>
                <Select
                  value={selectedDropZone}
                  onChange={(event) => setDropZone(event.target.value)}
                  required
                >
                  {!selectedDropZone ? <option value="">Select drop zone</option> : null}
                  {dropZones.map((zone) => (
                    <option key={zone.id} value={zone.code}>
                      {zone.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-300">Weight</label>
                <Input
                  type="number"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={weight}
                  onChange={(event) => setWeight(event.target.value)}
                  placeholder="1.0"
                  required
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-300">Priority</label>
                <Select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-transparent">Create</label>
                <Button
                  type="submit"
                  isLoading={pendingActions["create-task"]}
                  disabled={!canCreateTask}
                >
                  Create Task
                </Button>
              </div>
            </form>
          ) : (
            <form className="grid gap-4" onSubmit={handleCreateBulkTasks}>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-300">Bulk Input</label>
                <textarea
                  rows={7}
                  className="w-full rounded-2xl border border-white/15 bg-slate-950/50 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                  placeholder={"A -> B | 5kg | HIGH\nC -> D | 2kg | LOW\nA -> C | 7kg | URGENT"}
                  value={bulkText}
                  onChange={(event) => setBulkText(event.target.value)}
                  required
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400">Format: Pickup -&gt; Drop | Weightkg | Priority</p>
                <Button
                  type="submit"
                  isLoading={pendingActions["create-bulk-task"]}
                  disabled={!bulkText.trim()}
                >
                  Create Bulk Tasks
                </Button>
              </div>
            </form>
          )}
        </CardContent>
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
              description="Create the first task above to populate the task table."
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
                      <th className="pb-3 font-medium">Priority</th>
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
                            <Badge className={task.priority === "URGENT" ? "bg-red-500/20 text-red-200" : task.priority === "HIGH" ? "bg-orange-500/20 text-orange-200" : task.priority === "MEDIUM" ? "bg-blue-500/20 text-blue-200" : "bg-slate-500/20 text-slate-200"}>
                              {task.priority || "MEDIUM"}
                            </Badge>
                          </td>
                          <td className="py-4">
                            <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
                          </td>
                          <td className="py-4 text-slate-400">{formatDateTime(task.createdAt)}</td>
                          <td className="py-4">
                            <div className="flex flex-wrap justify-end gap-2">
                              {task.status === "PENDING" ? (
                                <Button
                                  size="sm"
                                  isLoading={pendingActions[`assign-${task.id}`]}
                                  onClick={() => assignTaskAction(task.id)}
                                >
                                  Assign
                                </Button>
                              ) : null}

                              {['ASSIGNED', 'IN_PROGRESS'].includes(task.status) ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  isLoading={pendingActions[`complete-${task.id}`]}
                                  onClick={() => completeTaskAction(task.id)}
                                >
                                  Complete
                                </Button>
                              ) : null}

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
