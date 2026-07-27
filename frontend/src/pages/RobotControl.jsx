import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  ClipboardList,
  Code2,
  Gamepad2,
  MapPin,
  RefreshCw,
  RotateCcw,
  Square,
  Weight
} from "lucide-react";
import {
  getRobotTaskStatus,
  logRobotZoneArrival,
  resetRobotState,
  sendRobotCommand
} from "../lib/api";
import { formatDateTime, getErrorMessage } from "../lib/formatters";
import { getRobotStateMeta } from "../lib/status";
import { useAuth } from "../context/AuthContext";
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
    ["Movement plan", (commandPayload.movementPlan || []).join(" -> ")]
  ].filter(([, value]) => Boolean(value));
}

function getRobotLocation(robot) {
  return robot?.location_label || robot?.location || "--";
}

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

export default function RobotControl() {
  const { token, logout } = useAuth();
  const toast = useToast();

  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [activeCommand, setActiveCommand] = useState(null);
  const [commandSending, setCommandSending] = useState(false);
  const [arrivalSending, setArrivalSending] = useState("");
  const [manualStatus, setManualStatus] = useState({
    tone: "info",
    message: "Manual controls are ready. Hold a direction to move; release to stop."
  });
  const [activeKeys, setActiveKeys] = useState(new Set());
  const activeCommandRef = useRef(null);

  const loadRobot = useCallback(async ({ silent = false } = {}) => {
    if (!token) return;
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await getRobotTaskStatus(token);
      setSnapshot(data);
      setError("");
      setLastUpdated(new Date().toISOString());
    } catch (loadError) {
      if (loadError?.status === 401) {
        toast.error("Session expired. Please sign in again.");
        logout();
        return;
      }
      const message = getErrorMessage(loadError, "Failed to load robot task status.");
      setError(message);
      if (!silent) toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [logout, toast, token]);

  useEffect(() => {
    loadRobot();
  }, [loadRobot]);

  const robot = snapshot?.robot || null;
  const activeTask = snapshot?.activeTask || null;
  const state = snapshot?.state || "IDLE";
  const stateMeta = getRobotStateMeta(state);
  const commandPayload = snapshot?.commandPayload || activeTask?.commandPayload || null;
  const commandRows = useMemo(() => commandLine(commandPayload), [commandPayload]);
  const controlsDisabled = !token;

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
    setManualStatus({
      tone: "info",
      message: command === "S" ? "Sending stop command..." : `Sending ${command} command...`
    });

    try {
      await sendRobotCommand(token, command);
      setManualStatus({
        tone: "success",
        message: command === "S" ? "Stop command sent." : `Command ${command} sent to Arduino.`
      });
    } catch (commandError) {
      if (commandError?.status === 401) {
        toast.error("Session expired. Please sign in again.");
        logout();
        return;
      }

      const message = getErrorMessage(commandError, "Failed to send robot command.");
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

  useEffect(() => {
    if (!token) return;

    const handleKeyDown = (event) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
      }

      if (!activeKeys.has(event.key)) {
        const nextKeys = new Set(activeKeys);
        nextKeys.add(event.key);
        setActiveKeys(nextKeys);
        const command = resolveMovementCommand(nextKeys);
        if (command) {
          activeCommandRef.current = command;
          setActiveCommand(command);
          submitManualCommand(command);
        }
      }
    };

    const handleKeyUp = (event) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
      }

      const nextKeys = new Set(activeKeys);
      nextKeys.delete(event.key);
      setActiveKeys(nextKeys);

      const command = resolveMovementCommand(nextKeys);
      if (command) {
        activeCommandRef.current = command;
        setActiveCommand(command);
        submitManualCommand(command);
      } else {
        activeCommandRef.current = null;
        setActiveCommand(null);
        submitManualCommand("S");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [activeKeys, resolveMovementCommand, submitManualCommand, token]);

  async function handleReset() {
    if (!token || !robot?.id) return;
    setResetting(true);
    try {
      const data = await resetRobotState(token, robot.id);
      setSnapshot(data);
      setResetOpen(false);
      setLastUpdated(new Date().toISOString());
      toast.success("Robot reset to IDLE.");
    } catch (resetError) {
      if (resetError?.status === 401) {
        toast.error("Session expired. Please sign in again.");
        logout();
        return;
      }
      toast.error(getErrorMessage(resetError, "Robot reset failed."));
    } finally {
      setResetting(false);
    }
  }

  async function handleZoneArrival(zoneCode) {
    if (!token) return;

    setArrivalSending(zoneCode);
    try {
      const data = await logRobotZoneArrival(token, zoneCode);
      if (data.robot) {
        setSnapshot((current) => (current ? { ...current, robot: data.robot } : current));
      }
      setLastUpdated(new Date().toISOString());
      setManualStatus({
        tone: "success",
        message: `Arrival at ${zoneCode} logged.`
      });
      toast.success(`Robot arrival logged at ${zoneCode}.`);
    } catch (arrivalError) {
      if (arrivalError?.status === 401) {
        toast.error("Session expired. Please sign in again.");
        logout();
        return;
      }
      const message = getErrorMessage(arrivalError, "Failed to log zone arrival.");
      setManualStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setArrivalSending("");
    }
  }

  return (
    <PageTransition>
      <PageHeader
        title="Robot Prototype Monitor"
        description="Task-derived status for the robot prototype execution unit."
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
        description="Any active robot task will be released back to the pending queue."
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
        <div className="grid gap-4 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <LoadingSkeleton key={index} className="h-[132px]" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-5">
            <StatCard
              label="Robot"
              value={robot?.name || "Prototype"}
              helper="Single active task unit"
              tone="primary"
              icon={<Bot className="h-4 w-4" />}
            />
            <StatCard
              label="Payload capacity"
              value="10 kg"
              helper="Task weight limit"
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
              label="Current state"
              value={stateMeta.label}
              helper={activeTask ? "Derived from active task" : "No active robot task"}
              tone={state === "ERROR" ? "error" : activeTask ? "warning" : "success"}
              icon={<Bot className="h-4 w-4" />}
            />
            <StatCard
              label="Active task"
              value={activeTask?.taskNo || "None"}
              helper="Robot assignment queue"
              tone={activeTask ? "warning" : state === "ERROR" ? "error" : "success"}
              icon={<ClipboardList className="h-4 w-4" />}
            />
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gamepad2 className="h-5 w-5 text-cyan-300" />
                Robot Control
              </CardTitle>
              <CardDescription>
                Sends F, B, L, R, FL, FR, BL, BR, and S commands to the HC-05 module on COM7 at 9600 baud.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 lg:grid-cols-[minmax(260px,380px)_minmax(0,1fr)] lg:items-center">
                <div className="grid grid-cols-3 gap-3">
                  <div />
                  <ManualControlButton
                    label="Forward"
                    command="F"
                    icon={<ArrowUp className="h-6 w-6" />}
                    active={activeCommand === "F" || activeCommand === "FL" || activeCommand === "FR"}
                    disabled={controlsDisabled}
                    onPress={handleControlPress}
                    onRelease={handleControlRelease}
                  />
                  <div />

                  <ManualControlButton
                    label="Forward-left"
                    command="FL"
                    icon={<ArrowLeft className="h-6 w-6" />}
                    active={activeCommand === "FL"}
                    disabled={controlsDisabled}
                    onPress={handleControlPress}
                    onRelease={handleControlRelease}
                  />
                  <ManualControlButton
                    label="Stop"
                    command="S"
                    icon={<Square className="h-5 w-5 fill-current" />}
                    active={activeCommand === "S"}
                    disabled={controlsDisabled}
                    onPress={handleControlPress}
                    onRelease={handleControlRelease}
                  />
                  <ManualControlButton
                    label="Forward-right"
                    command="FR"
                    icon={<ArrowRight className="h-6 w-6" />}
                    active={activeCommand === "FR"}
                    disabled={controlsDisabled}
                    onPress={handleControlPress}
                    onRelease={handleControlRelease}
                  />

                  <ManualControlButton
                    label="Backward-left"
                    command="BL"
                    icon={<ArrowLeft className="h-6 w-6" />}
                    active={activeCommand === "BL"}
                    disabled={controlsDisabled}
                    onPress={handleControlPress}
                    onRelease={handleControlRelease}
                  />
                  <ManualControlButton
                    label="Backward"
                    command="B"
                    icon={<ArrowDown className="h-6 w-6" />}
                    active={activeCommand === "B" || activeCommand === "BL" || activeCommand === "BR"}
                    disabled={controlsDisabled}
                    onPress={handleControlPress}
                    onRelease={handleControlRelease}
                  />
                  <ManualControlButton
                    label="Backward-right"
                    command="BR"
                    icon={<ArrowRight className="h-6 w-6" />}
                    active={activeCommand === "BR"}
                    disabled={controlsDisabled}
                    onPress={handleControlPress}
                    onRelease={handleControlRelease}
                  />
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Manual command status
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge tone={manualStatus.tone}>{manualStatus.tone.toUpperCase()}</Badge>
                    {commandSending ? <Badge tone="info">Sending</Badge> : null}
                    {activeCommand ? <Badge tone="warning">Active: {activeCommand}</Badge> : <Badge tone="neutral">Idle</Badge>}
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-300">{manualStatus.message}</p>
                  <p className="mt-3 text-xs leading-5 text-slate-400">
                    Use the on-screen buttons or your keyboard arrow keys. Combine Up/Left, Up/Right, Down/Left, and Down/Right for diagonal drift control.
                  </p>

                  <div className="mt-5 border-t border-white/10 pt-5">
                    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      <MapPin className="h-4 w-4" />
                      Zone arrival
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {["Z1", "Z2", "Z3", "HOME"].map((zoneCode) => (
                        <Button
                          key={zoneCode}
                          variant="secondary"
                          size="sm"
                          disabled={controlsDisabled}
                          isLoading={arrivalSending === zoneCode}
                          onClick={() => handleZoneArrival(zoneCode)}
                        >
                          <MapPin className="h-4 w-4" />
                          Arrived at {zoneCode}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Task Unit Status</CardTitle>
                  <CardDescription>Pickup, dropoff, payload, and current task state.</CardDescription>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => setResetOpen(true)}
                  disabled={!robot?.id || resetting}
                  isLoading={resetting}
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset Robot State
                </Button>
              </CardHeader>
              <CardContent>
                {!activeTask ? (
                  <EmptyState
                    title={state === "ERROR" ? "Robot needs attention" : "Robot is idle"}
                    description={
                      state === "ERROR"
                        ? "The robot needs inspection before it can continue."
                        : "Create or assign a task to activate the prototype."
                    }
                  />
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge className={stateMeta.badgeClass}>{stateMeta.label}</Badge>
                        <Badge tone={activeTask.robotEligible ? "success" : "warning"}>
                          {activeTask.robotEligible ? "Robot eligible" : "Review required"}
                        </Badge>
                        <Badge tone="neutral">{activeTask.status}</Badge>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Payload</div>
                      <div className="brand-heading mt-2 text-2xl font-semibold text-white">
                        {formatWeight(activeTask.totalWeight)} kg
                      </div>
                      <p className="mt-1 text-xs text-slate-400">Task weight limit: 10kg</p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <MapPin className="h-4 w-4" />
                        Source
                      </div>
                      <div className="mt-2 text-sm font-semibold text-white">
                        {activeTask.sourceLocation || "--"}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <MapPin className="h-4 w-4" />
                        Destination
                      </div>
                      <div className="mt-2 text-sm font-semibold text-white">
                        {activeTask.destinationLocation || "--"}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code2 className="h-5 w-5 text-cyan-300" />
                  Command Preview
                </CardTitle>
                <CardDescription>Prototype command payload generated from the active task.</CardDescription>
              </CardHeader>
              <CardContent>
                {!commandPayload ? (
                  <EmptyState title="No command payload" description="Assign a task to the robot to preview command data." />
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

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Recent Robot Task Logs</CardTitle>
              <CardDescription>Robot and task-related audit events.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(snapshot?.recentLogs || []).length === 0 ? (
                <EmptyState
                  title="No robot activity yet"
                  description="Task assignment, completion, reset, and robot events will appear here."
                />
              ) : (
                snapshot.recentLogs.map((log) => (
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
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageTransition>
  );
}
