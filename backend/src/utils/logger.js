import { Log } from "../models/Log.js";

export async function logEvent(event_type, description, context = {}) {
  try {
    if (!event_type || !description) return;
    const { task_id = null, robot_id = null, user_id = null, severity = "INFO", metadata = null } = context || {};
    await Log.create({ event_type, description, task_id, robot_id, user_id, severity, metadata });
  } catch {
    // ignore logging errors
  }
}
