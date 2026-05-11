/** Allowed robot states (finite state machine). */
export const ROBOT_STATES = Object.freeze({
  IDLE: "IDLE",
  ASSIGNED: "ASSIGNED",
  MOVING: "MOVING",
  PAUSED: "PAUSED",
  BUSY: "BUSY",
  ERROR: "ERROR"
});

export const ROBOT_STATE_VALUES = Object.values(ROBOT_STATES);

/**
 * Valid transitions: currentState -> Set<nextState>
 * ERROR can be entered from ANY state.
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  [ROBOT_STATES.IDLE]: [ROBOT_STATES.ASSIGNED, ROBOT_STATES.MOVING, ROBOT_STATES.BUSY],
  [ROBOT_STATES.ASSIGNED]: [ROBOT_STATES.MOVING, ROBOT_STATES.PAUSED, ROBOT_STATES.IDLE],
  [ROBOT_STATES.MOVING]: [ROBOT_STATES.PAUSED, ROBOT_STATES.IDLE],
  [ROBOT_STATES.PAUSED]: [ROBOT_STATES.MOVING, ROBOT_STATES.IDLE],
  [ROBOT_STATES.BUSY]: [ROBOT_STATES.IDLE],
  [ROBOT_STATES.ERROR]: [ROBOT_STATES.IDLE] // allow the user to clear fault back to IDLE
});

/**
 * Validates state transition. Returns { valid: boolean, message?: string }.
 */
export function validateTransition(currentState, nextState) {
  if (!ROBOT_STATE_VALUES.includes(nextState)) {
    return { valid: false, message: `Invalid state: ${nextState}. Allowed: ${ROBOT_STATE_VALUES.join(", ")}.` };
  }
  if (!ROBOT_STATE_VALUES.includes(currentState)) {
    return { valid: false, message: `Robot has invalid current state: ${currentState}.` };
  }
  if (nextState === ROBOT_STATES.ERROR) {
    return { valid: true };
  }
  const allowed = ALLOWED_TRANSITIONS[currentState];
  if (!allowed || !allowed.includes(nextState)) {
    return {
      valid: false,
      message: `Invalid transition: ${currentState} \u2192 ${nextState}. Allowed from ${currentState}: ${(allowed || []).concat(ROBOT_STATES.ERROR).join(", ")}.`
    };
  }
  return { valid: true };
}
