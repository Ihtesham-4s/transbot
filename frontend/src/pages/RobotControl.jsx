import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  CheckCircle2,
  ClipboardList,
  Code2,
  Gamepad2,
  MapPin,
  RefreshCw,
  RotateCcw,
  Square,
  Weight,
  Zap,
  ToggleLeft,
  ToggleRight
} from "lucide-react";
import {
  getRobotTaskStatus,
  logRobotZoneArrival,
  resetRobotState,
  sendRobotCommand,
  setRobotMode,
  sendNudge,
  sendTaskCommand,
  setMotorSpeed
} from "../lib/api";
import { formatDateTime, getErrorMessage } from "../lib/formatters";
import { getRobotStateMeta } from "../lib/status";
import { useAuth } from "../context/AuthContext";
import { useAppData } from "../context/AppDataContext";
import { useToast } from "../context/ToastContext";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { PageHeader } from "../components/PageHeader";
import { PageTransition } from "../components/PageTransition";
import { StatCard } from "../components/StatCard";
import WarehouseMap from "../components/WarehouseMap";

function formatWeight(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function logSeverityTone(severity) {
  if (severity === "ERROR") return "error";
  if (severity === "WARNING" || severity === "WARN") return "warning";
  if (severity === "SUCCESS") return "success";
  return "info";
}

function commandLine(commandPayload) {
  if (!commandPayload) return [];
  return [
    ["Command", commandPayload.command],
    ["Mode", commandPayload.mode],
    ["From", commandPayload.sourceLocation],
    ["To", commandPayload.destinationLocation],
    ["Total weight", `${formatWeight(commandPayload.totalWeight)} kg`],
    ["Capacity", `${formatWeight(commandPayload.payloadCapacityKg)} kg`],
    ["Movement plan", (commandPayload.movementPlan || []).join(" → ")]
  ].filter(([, value]) => Boolean(value));
}

function getRobotLocation(robot) {
  return robot?.location_label || robot?.location || "--";
}

/** Directional pad button for MANUAL mode */
function ManualControlButton({ label, command, icon, active, disabled, onPress, onRelease, className = "" }) {
  return (
    <Button
      variant={command === "S" ? "danger" : "secondary"}
      className={`h-20 w-full select-none touch-none rounded-2xl ${active ? "ring-2 ring-cyan-300/70" : ""} ${className}`}
      disabled={disabled}
      aria-label={label}
      title={label}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        onPress(command);
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        onRelease();
      }}
      onPointerCancel={onRelease}
      onPointerLeave={onRelease}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="flex flex-col items-center justify-center gap-1">
        {icon}
        <span className="text-xs uppercase tracking-[0.12em]">{label}</span>
      </span>
    </Button>
  );
}

// Valid task codes for the 3-zone L-track
const TASK_CODES = [
  { code: "AB", label: "A → B" },
  { code: "AC", label: "A → C" },
  { code: "BA", label: "B → A" },
  { code: "BC", label: "B → C" },
  { code: "CA", label: "C → A" },
  { code: "CB", label: "C → B" }
];

export default function RobotControl() {
  const { token, logout } = useAuth();
  const { tasks, completeTaskAction, pendingActions, refreshData } = useAppData();
  const toast = useToast();

  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [completingTask, setCompletingTask] = useState(false);

  // Mode: "AUTO" | "MANUAL" — derives from robot.autoMode
  const [mode, setMode] = useState("AUTO");
  const [modeSwitching, setModeSwitching] = useState(false);

  // Manual drive state
  const [activeCommand, setActiveCommand] = useState(null);
  const [commandSending, setCommandSending] = useState(false);
  const [arrivalSending, setArrivalSending] = useState("");
  const [manualStatus, setManualStatus] = useState({
    tone: "info",
    message: "Manual controls ready. Hold a direction to drive; release to stop."
  });
  const [activeKeys, setActiveKeys] = useState(new Set());
  const activeCommandRef = useRef(null);

  // Speed slider (MANUAL only)
  const [motorSpeed, setMotorSpeedState] = useState(150);
  const speedDebounceRef = useRef(null);

  // Task command (AUTO only)
  const [taskSending, setTaskSending] = useState("");

  const loadRobot = useCallback(async ({ silent = false } = {}) => {
    if (!token) return;
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await getRobotTaskStatus(token);
      setSnapshot(data);
      setError("");
      setLastUpdated(new Date().toISOString());
      // Sync mode from robot DB field
      if (typeof data?.robot?.autoMode === "boolean") {
        setMode(data.robot.autoMode ? "AUTO" : "MANUAL");
      }
    } catch (loadError) {
      if (loadError?.status === 401) { toast.error("Session expired."); logout(); return; }
      const message = getErrorMessage(loadError, "Failed to load robot task status.");
      setError(message);
      if (!silent) toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [logout, toast, token]);

  useEffect(() => { loadRobot(); }, [loadRobot]);

  const robot = snapshot?.robot || null;
  const activeTask = snapshot?.activeTask || null;
  const state = snapshot?.state || "IDLE";
  const stateMeta = getRobotStateMeta(state);
  const commandPayload = snapshot?.commandPayload || activeTask?.commandPayload || null;
  const commandRows = useMemo(() => commandLine(commandPayload), [commandPayload]);
  const controlsDisabled = !token;
  const currentZone = robot?.location || null;  // "A", "B", or "C"

  // Next eligible pending task from robot's current zone
  const nextQueueTask = useMemo(() => {
    if (!currentZone) return null;
    return tasks.find(
      (t) =>
        t.status === "PENDING" &&
        Number(t.weight) <= 2 &&
        (t.pickup_zone === currentZone || t.pickup_zone_label === `Zone ${currentZone}` || t.pickup_zone_id?.code === currentZone)
    );
  }, [tasks, currentZone]);

  // ── Mode toggle ──────────────────────────────────────────────────────────
  async function handleModeToggle() {
    if (!token || modeSwitching) return;
    const newMode = mode === "AUTO" ? "MANUAL" : "AUTO";
    setModeSwitching(true);
    try {
      const result = await setRobotMode(token, newMode);
      setMode(newMode);
      if (result?.robot) {
        setSnapshot((current) => current ? { ...current, robot: result.robot } : current);
      }
      toast.success(`Switched to ${newMode} mode.`);
    } catch (err) {
      if (err?.status === 401) { logout(); return; }
      toast.error(getErrorMessage(err, "Failed to switch mode."));
    } finally {
      setModeSwitching(false);
    }
  }

  // ── Auto task command ────────────────────────────────────────────────────
  async function handleTaskCommand(task) {
    if (!token || taskSending) return;
    setTaskSending(task);
    try {
      await sendTaskCommand(token, task);
      toast.success(`Task command ${task} sent.`);
    } catch (err) {
      if (err?.status === 401) { logout(); return; }
      toast.error(getErrorMessage(err, "Failed to send task command."));
    } finally {
      setTaskSending("");
    }
  }

  // ── Manual drive ─────────────────────────────────────────────────────────
  const resolveMovementCommand = useCallback((pressedKeys) => {
    const hasUp = pressedKeys.has("ArrowUp");
    const hasDown = pressedKeys.has("ArrowDown");
    const hasLeft = pressedKeys.has("ArrowLeft");
    const hasRight = pressedKeys.has("ArrowRight");
    if (hasUp && hasLeft) return "FL";
    if (hasUp && hasRight) return "FR";
    if (hasDown && hasLeft) return "BL";
    if (hasDown && hasRight) return "BR";
    if (hasUp) return "F";
    if (hasDown) return "B";
    if (hasLeft) return "L";
    if (hasRight) return "R";
    return null;
  }, []);

  const submitManualCommand = useCallback(async (command) => {
    if (!token) return;
    setCommandSending(true);
    setManualStatus({ tone: "info", message: command === "S" ? "Sending stop…" : `Sending ${command}…` });
    try {
      await sendRobotCommand(token, command);
      setManualStatus({ tone: "success", message: command === "S" ? "Motors stopped." : `Command ${command} sent.` });
    } catch (commandError) {
      if (commandError?.status === 401) { logout(); return; }
      const message = getErrorMessage(commandError, "Failed to send command.");
      setManualStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setCommandSending(false);
    }
  }, [logout, toast, token]);

  const handleControlPress = useCallback((command) => {
    activeCommandRef.current = command;
    setActiveCommand(command);
    submitManualCommand(command);
  }, [submitManualCommand]);

  const handleControlRelease = useCallback(() => {
    if (!activeCommandRef.current) return;
    activeCommandRef.current = null;
    setActiveCommand(null);
    submitManualCommand("S");
  }, [submitManualCommand]);

  // Keyboard arrow keys for MANUAL mode
  useEffect(() => {
    if (!token || mode !== "MANUAL") return;

    const handleKeyDown = (event) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
      if (!activeKeys.has(event.key)) {
        const nextKeys = new Set(activeKeys);
        nextKeys.add(event.key);
        setActiveKeys(nextKeys);
        const command = resolveMovementCommand(nextKeys);
        if (command) { activeCommandRef.current = command; setActiveCommand(command); submitManualCommand(command); }
      }
    };

    const handleKeyUp = (event) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
      const nextKeys = new Set(activeKeys);
      nextKeys.delete(event.key);
      setActiveKeys(nextKeys);
      const command = resolveMovementCommand(nextKeys);
      if (command) { activeCommandRef.current = command; setActiveCommand(command); submitManualCommand(command); }
      else { activeCommandRef.current = null; setActiveCommand(null); submitManualCommand("S"); }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => { window.removeEventListener("keydown", handleKeyDown); window.removeEventListener("keyup", handleKeyUp); };
  }, [activeKeys, mode, resolveMovementCommand, submitManualCommand, token]);

  // Hidden nudge keylistener: "n" = NUDGE:L, "m" = NUDGE:R — AUTO mode only
  useEffect(() => {
    if (!token || mode !== "AUTO") return;

    const handleNudge = async (event) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (["input", "textarea", "select"].includes(tag)) return;  // ignore when typing

      if (event.key === "n" || event.key === "m") {
        const direction = event.key === "n" ? "L" : "R";
        try {
          await sendNudge(token, direction);
        } catch {
          // Silent — nudge is a hidden feature
        }
      }
    };

    window.addEventListener("keydown", handleNudge);
    return () => window.removeEventListener("keydown", handleNudge);
  }, [token, mode]);

  // Speed slider with debounce (300ms)
  function handleSpeedChange(event) {
    const value = Number(event.target.value);
    setMotorSpeedState(value);
    if (speedDebounceRef.current) clearTimeout(speedDebounceRef.current);
    speedDebounceRef.current = setTimeout(async () => {
      try {
        await setMotorSpeed(token, value, value);
      } catch {
        // Ignore speed errors silently
      }
    }, 300);
  }

  // ── Zone arrival ─────────────────────────────────────────────────────────
  async function handleZoneArrival(zoneCode) {
    if (!token) return;
    setArrivalSending(zoneCode);
    try {
      const data = await logRobotZoneArrival(token, zoneCode);
      if (data.robot) setSnapshot((current) => current ? { ...current, robot: data.robot } : current);
      setLastUpdated(new Date().toISOString());
      await refreshData({ silent: true });
      setManualStatus({ tone: "success", message: `Arrival at Zone ${zoneCode} logged.` });
      toast.success(`Robot arrival at Zone ${zoneCode} logged.`);
    } catch (arrivalError) {
      if (arrivalError?.status === 401) { logout(); return; }
      const message = getErrorMessage(arrivalError, "Failed to log zone arrival.");
      setManualStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setArrivalSending("");
    }
  }

  // ── Complete Active Task ──────────────────────────────────────────────────
  async function handleCompleteTask() {
    if (!activeTask?.id || completingTask) return;
    setCompletingTask(true);
    try {
      await completeTaskAction(activeTask.id);
      toast.success(`Task completed! Robot updated to ${activeTask.destinationLocation || "destination zone"}.`);
      await loadRobot({ silent: true });
    } catch (err) {
      if (err?.status === 401) { logout(); return; }
      toast.error(getErrorMessage(err, "Failed to complete task."));
    } finally {
      setCompletingTask(false);
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────────
  async function handleReset() {
    if (!token || !robot?.id) return;
    setResetting(true);
    try {
      const data = await resetRobotState(token, robot.id);
      setSnapshot(data);
      setResetOpen(false);
      setLastUpdated(new Date().toISOString());
      await refreshData({ silent: true });
      toast.success("Robot reset to IDLE at Zone A.");
    } catch (resetError) {
      if (resetError?.status === 401) { logout(); return; }
      toast.error(getErrorMessage(resetError, "Robot reset failed."));
    } finally {
      setResetting(false);
    }
  }

  return (
    <PageTransition>
      <PageHeader
        title="Robot Monitor"
        description="Live robot status, teleoperation, and task control."
        lastUpdated={lastUpdated}
        actions={
          <Button variant="secondary" onClick={() => loadRobot()} isLoading={refreshing}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <ConfirmDialog
        open={resetOpen}
        title="Reset robot to IDLE?"
        description="Any active task will be released back to the pending queue."
        icon={<RotateCcw className="h-5 w-5 text-amber-200" />}
        confirmText="Reset robot"
        confirmLoading={resetting}
        onCancel={() => setResetOpen(false)}
        onConfirm={handleReset}
      />

      {error ? (
        <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 backdrop-blur-sm">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <LoadingSkeleton key={i} className="h-[132px]" />)}
        </div>
      ) : (
        <>
          {/* ── Stat cards ─────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Robot"
              value={robot?.name || "Prototype"}
              helper="Single active task unit"
              tone="primary"
              icon={<Bot className="h-4 w-4" />}
            />
            <StatCard
              label="Payload capacity"
              value="2 kg"
              helper="Maximum task weight"
              tone="info"
              icon={<Weight className="h-4 w-4" />}
            />
            <StatCard
              label="Current zone"
              value={getRobotLocation(robot)}
              helper="Last logged robot location"
              tone="info"
              icon={<MapPin className="h-4 w-4" />}
            />
            <StatCard
              label="State"
              value={stateMeta.label}
              helper={activeTask ? "Handling an active task" : "No active task"}
              tone={state === "ERROR" ? "error" : activeTask ? "warning" : "success"}
              icon={<Bot className="h-4 w-4" />}
            />
          </div>

          {/* ── Mode toggle banner ──────────────────────────────────────── */}
          <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-xl">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">Robot Mode</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {mode === "AUTO" ? "Autonomous (Auto)" : "Manual Drive"}
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                {mode === "AUTO"
                  ? "Robot handles tasks automatically."
                  : "Direct drive via on-screen pad or keyboard arrows."}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={handleModeToggle}
              isLoading={modeSwitching}
              className="shrink-0"
            >
              {mode === "AUTO" ? <ToggleRight className="h-4 w-4 text-cyan-300" /> : <ToggleLeft className="h-4 w-4" />}
              {mode === "AUTO" ? "Switch to Manual" : "Switch to Auto"}
            </Button>
          </div>

          {/* ── Warehouse map (always visible) ──────────────────────────── */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-cyan-300" />
                Warehouse Map
              </CardTitle>
              <CardDescription>Live robot position on the L-shaped track. A=South, B=North, C=West of B.</CardDescription>
            </CardHeader>
            <CardContent>
              <WarehouseMap
                robotZone={currentZone}
                activeTask={activeTask}
              />
            </CardContent>
          </Card>

          {/* ── AUTO mode panel ──────────────────────────────────────────── */}
          {mode === "AUTO" && (
            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-cyan-300" />
                      Auto Mode — Task Control
                    </CardTitle>
                    <CardDescription>
                      Tasks are automatically transmitted to Arduino hardware (`TASK:AB`, `TASK:AC`, etc.) via Bluetooth serial upon assignment.
                    </CardDescription>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => setResetOpen(true)}
                    disabled={!robot?.id}
                    isLoading={resetting}
                    className="shrink-0"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </Button>
                </CardHeader>
                <CardContent>
                  {/* Active task info */}
                  {activeTask ? (
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="text-xs text-slate-400">Status</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge className={stateMeta.badgeClass}>{stateMeta.label}</Badge>
                            <Badge tone="neutral">{activeTask.status}</Badge>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="text-xs text-slate-400">Payload</div>
                          <div className="mt-1 text-2xl font-semibold text-white">{formatWeight(activeTask.totalWeight)} kg</div>
                          <p className="mt-1 text-xs text-cyan-400">Robot eligible (&le; 2 kg)</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="h-3 w-3" /> Source</div>
                          <div className="mt-1 text-sm font-semibold text-white">{activeTask.sourceLocation || "--"}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="h-3 w-3" /> Destination</div>
                          <div className="mt-1 text-sm font-semibold text-white">{activeTask.destinationLocation || "--"}</div>
                        </div>
                      </div>

                      {/* Hardware Serial Status Banner */}
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 text-xs text-slate-300">
                        <span className="font-semibold text-cyan-300">Hardware Status: </span>
                        Task command (<code className="font-mono text-cyan-200">TASK:{(activeTask.pickupLocation || "A").slice(-1)}{(activeTask.destinationLocation || "B").slice(-1)}</code>) transmitted over Bluetooth serial. Physical robot is in Auto Mode waiting for package weight (&gt; 300g) on load cell sensor to start driving.
                      </div>

                      {/* Complete Task Button */}
                      <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-white">Execute / Complete Task</div>
                            <div className="mt-0.5 text-xs text-slate-400">
                              Clicking complete marks task as done and relocates robot to <span className="font-semibold text-cyan-300">{activeTask.destinationLocation || "destination zone"}</span>.
                            </div>
                          </div>
                          <Button
                            variant="primary"
                            isLoading={completingTask || pendingActions[`complete-${activeTask.id}`]}
                            onClick={handleCompleteTask}
                            className="shrink-0"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Complete Task
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      title={state === "ERROR" ? "Robot needs attention" : "Robot is idle"}
                      description={state === "ERROR" ? "Inspect the robot before continuing." : `Robot is waiting at Zone ${currentZone || "A"} for the next assignment.`}
                    />
                  )}

                  {/* Next task in queue from current zone */}
                  <div className="mt-5 border-t border-white/10 pt-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                        Next Task in Queue (from Zone {currentZone || "A"})
                      </div>
                      {nextQueueTask ? (
                        <Badge tone="info">Ready to Dispatch</Badge>
                      ) : (
                        <Badge tone="neutral">Queue Clear</Badge>
                      )}
                    </div>

                    {nextQueueTask ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-white">
                              {nextQueueTask.pickup_zone_label || `Zone ${nextQueueTask.pickup_zone}`} &rarr; {nextQueueTask.drop_zone_label || `Zone ${nextQueueTask.drop_zone}`}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              Payload: {formatWeight(nextQueueTask.weight)} kg &middot; Priority: {nextQueueTask.priority || "MEDIUM"}
                            </div>
                          </div>
                          <Badge tone="success">Auto-Queue</Badge>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">
                        No pending tasks originating from Zone {currentZone || "A"} in queue.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Command preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Code2 className="h-5 w-5 text-cyan-300" />
                    Command Preview
                  </CardTitle>
                  <CardDescription>Active task command payload.</CardDescription>
                </CardHeader>
                <CardContent>
                  {!commandPayload ? (
                    <EmptyState title="No command payload" description="Assign a task to preview command data." />
                  ) : (
                    <div className="space-y-3">
                      {commandRows.map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                          <div className="text-xs text-slate-400">{label}</div>
                          <div className="mt-1 break-words text-sm font-semibold text-white">{value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── MANUAL mode panel ────────────────────────────────────────── */}
          {mode === "MANUAL" && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gamepad2 className="h-5 w-5 text-cyan-300" />
                  Manual Drive
                </CardTitle>
                <CardDescription>
                  Hold a direction to move; release to stop. Use keyboard arrows or on-screen pad.
                  Sends F, B, L, R, FL, FR, BL, BR, S to the HC-05 module on COM7 at 9600 baud.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 lg:grid-cols-[minmax(260px,380px)_minmax(0,1fr)] lg:items-start">
                  {/* Direction pad */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div />
                      <ManualControlButton label="Forward" command="F" icon={<ArrowUp className="h-6 w-6" />}
                        active={["F","FL","FR"].includes(activeCommand)} disabled={controlsDisabled}
                        onPress={handleControlPress} onRelease={handleControlRelease} />
                      <div />
                      <ManualControlButton label="Fwd-Left" command="FL" icon={<ArrowLeft className="h-6 w-6" />}
                        active={activeCommand === "FL"} disabled={controlsDisabled}
                        onPress={handleControlPress} onRelease={handleControlRelease} />
                      <ManualControlButton label="Stop" command="S" icon={<Square className="h-5 w-5 fill-current" />}
                        active={activeCommand === "S"} disabled={controlsDisabled}
                        onPress={handleControlPress} onRelease={handleControlRelease} />
                      <ManualControlButton label="Fwd-Right" command="FR" icon={<ArrowRight className="h-6 w-6" />}
                        active={activeCommand === "FR"} disabled={controlsDisabled}
                        onPress={handleControlPress} onRelease={handleControlRelease} />
                      <ManualControlButton label="Bck-Left" command="BL" icon={<ArrowLeft className="h-6 w-6" />}
                        active={activeCommand === "BL"} disabled={controlsDisabled}
                        onPress={handleControlPress} onRelease={handleControlRelease} />
                      <ManualControlButton label="Backward" command="B" icon={<ArrowDown className="h-6 w-6" />}
                        active={["B","BL","BR"].includes(activeCommand)} disabled={controlsDisabled}
                        onPress={handleControlPress} onRelease={handleControlRelease} />
                      <ManualControlButton label="Bck-Right" command="BR" icon={<ArrowRight className="h-6 w-6" />}
                        active={activeCommand === "BR"} disabled={controlsDisabled}
                        onPress={handleControlPress} onRelease={handleControlRelease} />
                    </div>

                    {/* Speed slider */}
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-slate-400">
                        <span>Motor Speed</span>
                        <span className="text-white">{motorSpeed}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={255}
                        step={5}
                        value={motorSpeed}
                        onChange={handleSpeedChange}
                        disabled={controlsDisabled}
                        className="w-full accent-cyan-400"
                        aria-label="Motor speed"
                      />
                      <div className="mt-1 flex justify-between text-xs text-slate-500">
                        <span>0</span><span>Slow</span><span>Fast</span><span>255</span>
                      </div>
                    </div>
                  </div>

                  {/* Status + zone arrival */}
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                      <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">Command status</div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge tone={manualStatus.tone}>{manualStatus.tone.toUpperCase()}</Badge>
                        {commandSending ? <Badge tone="info">Sending</Badge> : null}
                        {activeCommand ? <Badge tone="warning">Active: {activeCommand}</Badge> : <Badge tone="neutral">Idle</Badge>}
                      </div>
                      <p className="mt-4 text-sm leading-6 text-slate-300">{manualStatus.message}</p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                        <MapPin className="h-4 w-4" />
                        Zone arrival
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {["A", "B", "C"].map((zoneCode) => (
                          <Button
                            key={zoneCode}
                            variant="secondary"
                            size="sm"
                            disabled={controlsDisabled}
                            isLoading={arrivalSending === zoneCode}
                            onClick={() => handleZoneArrival(zoneCode)}
                          >
                            <MapPin className="h-4 w-4" />
                            Zone {zoneCode}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Recent logs ─────────────────────────────────────────────── */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-cyan-300" />
                Recent Robot Logs
              </CardTitle>
              <CardDescription>Robot and task audit events.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                const visibleLogs = (snapshot?.recentLogs || []).filter(
                  (log) => log.eventType !== "ROBOT_NUDGE" && log.event_type !== "ROBOT_NUDGE"
                );
                if (visibleLogs.length === 0) {
                  return (
                    <EmptyState title="No robot activity yet" description="Task assignment, completion, reset, and robot events will appear here." />
                  );
                }
                return visibleLogs.map((log) => (
                  <div key={log.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={logSeverityTone(log.severity)}>{log.severity}</Badge>
                        <Badge tone="neutral">{log.eventType}</Badge>
                      </div>
                      <div className="text-xs text-slate-400">{formatDateTime(log.createdAt || log.timestamp)}</div>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{log.message || log.description}</p>
                  </div>
                ));
              })()}
            </CardContent>
          </Card>
        </>
      )}
    </PageTransition>
  );
}
