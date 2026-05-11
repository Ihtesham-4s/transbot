export const ROBOT_STATES = Object.freeze({
  IDLE: "IDLE",
  ASSIGNED: "ASSIGNED",
  MOVING: "MOVING",
  PAUSED: "PAUSED",
  BUSY: "BUSY",
  ERROR: "ERROR"
});

export const ROBOT_STATE_LABELS = Object.freeze({
  [ROBOT_STATES.IDLE]: "Idle",
  [ROBOT_STATES.ASSIGNED]: "Assigned",
  [ROBOT_STATES.MOVING]: "Moving",
  [ROBOT_STATES.PAUSED]: "Paused",
  [ROBOT_STATES.BUSY]: "Busy",
  [ROBOT_STATES.ERROR]: "Error"
});

export const ROBOT_STATE_BADGE_CLASSES = Object.freeze({
  [ROBOT_STATES.IDLE]: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  [ROBOT_STATES.ASSIGNED]: "border-amber-500/30 bg-amber-500/15 text-amber-200",
  [ROBOT_STATES.MOVING]: "border-cyan-500/30 bg-cyan-500/15 text-cyan-200",
  [ROBOT_STATES.PAUSED]: "border-orange-500/30 bg-orange-500/15 text-orange-200",
  [ROBOT_STATES.BUSY]: "border-amber-500/30 bg-amber-500/15 text-amber-200",
  [ROBOT_STATES.ERROR]: "border-rose-500/30 bg-rose-500/15 text-rose-200"
});
