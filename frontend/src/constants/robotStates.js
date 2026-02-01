/** Robot FSM states — must match backend enum */
export const ROBOT_STATES = Object.freeze({
  IDLE: "IDLE",
  ASSIGNED: "ASSIGNED",
  MOVING: "MOVING",
  PAUSED: "PAUSED",
  ERROR: "ERROR"
});

/** Human-readable labels for examiner clarity */
export const ROBOT_STATE_LABELS = Object.freeze({
  [ROBOT_STATES.IDLE]: "Idle",
  [ROBOT_STATES.ASSIGNED]: "Assigned",
  [ROBOT_STATES.MOVING]: "Moving",
  [ROBOT_STATES.PAUSED]: "Paused",
  [ROBOT_STATES.ERROR]: "Error"
});

/** Badge Tailwind classes (Day-1 style: border + bg + text) */
export const ROBOT_STATE_BADGE_CLASSES = Object.freeze({
  [ROBOT_STATES.IDLE]: "border-slate-400/40 bg-slate-500/20 text-slate-200",
  [ROBOT_STATES.ASSIGNED]: "border-blue-400/40 bg-blue-500/20 text-blue-200",
  [ROBOT_STATES.MOVING]: "border-emerald-400/40 bg-emerald-500/20 text-emerald-200",
  [ROBOT_STATES.PAUSED]: "border-amber-400/40 bg-amber-500/20 text-amber-200",
  [ROBOT_STATES.ERROR]: "border-rose-400/40 bg-rose-500/20 text-rose-200"
});
