import { useState } from "react";
import { AlertTriangle, OctagonAlert, RefreshCw, RotateCcw } from "lucide-react";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { PageTransition } from "../components/PageTransition";
import { RobotStatusCard } from "../components/RobotStatusCard";
import { useAppData } from "../context/AppDataContext";
import { formatDateTime } from "../lib/formatters";

export default function RobotControl() {
  const [emergencyStopOpen, setEmergencyStopOpen] = useState(false);
  const {
    robot,
    logs,
    pendingActions,
    refreshing,
    refreshData,
    setAutoModeAction,
    transitionRobotAction,
    lastUpdated
  } = useAppData();

  const robotLogs = logs.filter((log) => {
    const eventType = String(log.event_type || "").toUpperCase();
    const description = String(log.description || "").toLowerCase();

    return (
      eventType.includes("ROBOT") ||
      eventType === "TASK_STARTED" ||
      eventType === "TASK_COMPLETED" ||
      description.includes("robot")
    );
  });

  const recentActivity = (robotLogs.length > 0 ? robotLogs : logs).slice(0, 5);

  return (
    <PageTransition>
      <PageHeader
        title="Robot Control"
        description="Monitor the robot's live state and use manual controls when intervention is required."
        lastUpdated={lastUpdated}
        actions={
          <Button variant="secondary" onClick={refreshData} isLoading={refreshing}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <ConfirmDialog
        open={emergencyStopOpen}
        title="Emergency stop robot?"
        description="This will immediately force the robot into ERROR state until the fault is cleared."
        icon={<OctagonAlert className="h-5 w-5 text-rose-200" />}
        confirmText="Activate stop"
        confirmLoading={pendingActions["robot-ERROR"]}
        destructive
        onCancel={() => setEmergencyStopOpen(false)}
        onConfirm={async () => {
          await transitionRobotAction("ERROR", "Emergency stop activated.");
          setEmergencyStopOpen(false);
        }}
      />

      <RobotStatusCard
        robot={robot}
        title="Robot Live Status"
        description="Prominent status view with current location and direct control actions."
        actions={
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                variant={robot?.autoMode ? "primary" : "secondary"}
                className="sm:col-span-2"
                isLoading={pendingActions["robot-auto-mode"]}
                onClick={() => setAutoModeAction(!robot?.autoMode)}
              >
                Auto Mode: {robot?.autoMode ? "ON" : "OFF"}
              </Button>
              <Button
                variant="secondary"
                isLoading={pendingActions["robot-IDLE"]}
                disabled={robot?.currentState === "IDLE"}
                onClick={() => transitionRobotAction("IDLE", "Robot state set to IDLE.")}
              >
                <RotateCcw className="h-4 w-4" />
                Force IDLE
              </Button>
              <Button
                variant="danger"
                isLoading={pendingActions["robot-ERROR"]}
                disabled={robot?.currentState === "ERROR"}
                onClick={() => transitionRobotAction("ERROR", "Robot moved to ERROR state.")}
              >
                <AlertTriangle className="h-4 w-4" />
                Force ERROR
              </Button>
              <Button
                variant="primary"
                className="sm:col-span-2"
                isLoading={pendingActions["robot-IDLE"]}
                disabled={robot?.currentState !== "ERROR"}
                onClick={() => transitionRobotAction("IDLE", "Robot error cleared.")}
              >
                Clear Error
              </Button>
            </div>

            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 backdrop-blur-sm">
              <Button
                variant="danger"
                className="h-12 w-full"
                isLoading={pendingActions["robot-ERROR"]}
                disabled={robot?.currentState === "ERROR"}
                onClick={() => setEmergencyStopOpen(true)}
              >
                <OctagonAlert className="h-4 w-4" />
                Emergency Stop
              </Button>
            </div>
          </>
        }
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent Robot Activity</CardTitle>
          <CardDescription>Most recent robot-related entries from the system logs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentActivity.length === 0 ? (
            <EmptyState
              title="No robot activity yet"
              description="Robot transitions and task activity will appear here once the system starts moving."
            />
          ) : (
            recentActivity.map((log) => (
              <div
                key={log.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">{log.event_type}</div>
                  <div className="text-xs text-slate-400">{formatDateTime(log.timestamp)}</div>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">{log.description}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
