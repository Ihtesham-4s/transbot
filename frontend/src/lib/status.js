import { ROBOT_STATES, ROBOT_STATE_BADGE_CLASSES, ROBOT_STATE_LABELS } from "../constants/robotStates";

export const TASK_STATUS_META = Object.freeze({
  PENDING: {
    label: "Pending",
    tone: "warning",
    className: "border-amber-500/30 bg-amber-500/15 text-amber-200"
  },
  ASSIGNED: {
    label: "Assigned",
    tone: "info",
    className: "border-blue-500/30 bg-blue-500/15 text-blue-200"
  },
  IN_PROGRESS: {
    label: "In Progress",
    tone: "info",
    className: "border-cyan-500/30 bg-cyan-500/15 text-cyan-200"
  },
  COMPLETED: {
    label: "Completed",
    tone: "success",
    className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
  },
  REJECTED: {
    label: "Rejected",
    tone: "error",
    className: "border-rose-500/30 bg-rose-500/15 text-rose-200"
  }
});

export const LOG_SEVERITY_META = Object.freeze({
  INFO: { label: "Info", tone: "primary" },
  WARN: { label: "Warn", tone: "warning" },
  WARNING: { label: "Warning", tone: "warning" },
  ERROR: { label: "Error", tone: "error" },
  SUCCESS: { label: "Success", tone: "success" }
});

export function getRobotStateMeta(state) {
  const currentState = ROBOT_STATES[state] ? state : ROBOT_STATES.IDLE;

  if (currentState === ROBOT_STATES.BUSY) {
    return {
      key: currentState,
      label: ROBOT_STATE_LABELS[currentState],
      badgeClass: ROBOT_STATE_BADGE_CLASSES[currentState],
      accentColor: "#f59e0b",
      description: "Robot is actively handling a delivery."
    };
  }

  if (currentState === ROBOT_STATES.ASSIGNED) {
    return {
      key: currentState,
      label: ROBOT_STATE_LABELS[currentState],
      badgeClass: ROBOT_STATE_BADGE_CLASSES[currentState],
      accentColor: "#f59e0b",
      description: "Robot has accepted the next task and is preparing execution."
    };
  }

  if (currentState === ROBOT_STATES.MOVING) {
    return {
      key: currentState,
      label: ROBOT_STATE_LABELS[currentState],
      badgeClass: ROBOT_STATE_BADGE_CLASSES[currentState],
      accentColor: "#06b6d4",
      description: "Robot is moving through route checkpoints."
    };
  }

  if (currentState === ROBOT_STATES.PAUSED) {
    return {
      key: currentState,
      label: ROBOT_STATE_LABELS[currentState],
      badgeClass: ROBOT_STATE_BADGE_CLASSES[currentState],
      accentColor: "#fb923c",
      description: "Robot is temporarily paused and waiting to resume."
    };
  }

  if (currentState === ROBOT_STATES.ERROR) {
    return {
      key: currentState,
      label: ROBOT_STATE_LABELS[currentState],
      badgeClass: ROBOT_STATE_BADGE_CLASSES[currentState],
      accentColor: "#ef4444",
      description: "Robot needs intervention before it can continue."
    };
  }

  return {
    key: ROBOT_STATES.IDLE,
    label: ROBOT_STATE_LABELS[ROBOT_STATES.IDLE],
    badgeClass: ROBOT_STATE_BADGE_CLASSES[ROBOT_STATES.IDLE],
    accentColor: "#22c55e",
    description: "Robot is ready for the next assignment."
  };
}

export function getTaskStatusMeta(status) {
  return TASK_STATUS_META[status] || TASK_STATUS_META.PENDING;
}

export function getLogSeverityMeta(severity) {
  return LOG_SEVERITY_META[severity] || LOG_SEVERITY_META.INFO;
}

export function getEventTypeTone(eventType) {
  const normalized = String(eventType || "").toUpperCase();

  if (normalized.includes("ERROR")) return "error";
  if (normalized.includes("ROBOT")) return "primary";
  if (normalized.includes("TASK")) return "info";
  if (normalized.includes("USER")) return "neutral";

  return "neutral";
}
