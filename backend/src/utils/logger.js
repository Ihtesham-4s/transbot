import { Log } from "../models/Log.js";

export async function logEvent(event_type, description) {
  try {
    if (!event_type || !description) return;
    await Log.create({ event_type, description });
  } catch {
    // ignore logging errors
  }
}
