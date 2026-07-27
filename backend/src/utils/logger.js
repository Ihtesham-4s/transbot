import { Log } from "../models/Log.js";
import { mongoose } from "../db.js";

const MODULE_BY_PREFIX = Object.freeze({
  ROBOT: "ROBOT",
  USER: "AUTH",
  AUTH: "AUTH",
  LOGIN: "AUTH",
  TASK: "TASK",
  AUTO_TASK: "TASK",
  SYSTEM: "SYSTEM"
});

function normalizeSeverity(value) {
  const normalized = String(value || "INFO").toUpperCase();
  if (normalized === "WARN") return "WARNING";
  if (["INFO", "WARNING", "ERROR", "SUCCESS"].includes(normalized)) return normalized;
  return "INFO";
}

function inferModule(eventType) {
  const normalized = String(eventType || "").toUpperCase();
  const prefix = normalized.split("_")[0];
  if (normalized.startsWith("AUTO_TASK")) return "TASK";
  return MODULE_BY_PREFIX[normalized] || MODULE_BY_PREFIX[prefix] || "SYSTEM";
}

function normalizeObjectId(value) {
  if (!value) return null;
  return mongoose.Types.ObjectId.isValid(value) ? value : null;
}

function inferEntityType(eventType, source = {}) {
  if (source.entityType) return source.entityType;
  const metadata = source.metadata || {};
  if (source.robot_id || metadata.robotId) return "Robot";
  if (source.task_id || metadata.taskId) return "Task";
  if (source.user_id || source.actorId || metadata.userId) return "User";
  const module = inferModule(eventType);
  return module === "SYSTEM" ? null : module;
}

function inferEntityId(source = {}) {
  if (source.entityId) return source.entityId;
  const metadata = source.metadata || {};
  return (
    metadata.robotId ||
    metadata.taskId ||
    metadata.userId ||
    source.robot_id ||
    source.task_id ||
    source.user_id ||
    source.actorId ||
    null
  );
}

function normalizeLogArgs(first, second, third = {}) {
  if (first && typeof first === "object" && !Array.isArray(first)) {
    const eventType = first.eventType || first.event_type;
    const message = first.message || first.description;
    return {
      eventType,
      message,
      module: first.module || inferModule(eventType),
      severity: normalizeSeverity(first.severity),
      entityType: inferEntityType(eventType, first),
      entityId: inferEntityId(first),
      actorId: first.actorId || first.user_id || null,
      task_id: first.task_id || null,
      robot_id: first.robot_id || null,
      user_id: first.user_id || first.actorId || null,
      metadata: first.metadata || null
    };
  }

  const eventType = first;
  const context = third || {};
  return {
    eventType,
    message: second,
    module: context.module || inferModule(eventType),
    severity: normalizeSeverity(context.severity),
    entityType: inferEntityType(eventType, context),
    entityId: inferEntityId(context),
    actorId: context.actorId || context.user_id || null,
    task_id: context.task_id || null,
    robot_id: context.robot_id || null,
    user_id: context.user_id || context.actorId || null,
    metadata: context.metadata || null
  };
}

export async function logEvent(first, second, third = {}) {
  try {
    const payload = normalizeLogArgs(first, second, third);
    if (!payload.eventType || !payload.message) return;

    await Log.create({
      eventType: payload.eventType,
      event_type: payload.eventType,
      module: payload.module,
      severity: payload.severity,
      message: payload.message,
      description: payload.message,
      entityType: payload.entityType,
      entityId: payload.entityId,
      actorId: normalizeObjectId(payload.actorId),
      task_id: normalizeObjectId(payload.task_id),
      robot_id: normalizeObjectId(payload.robot_id),
      user_id: normalizeObjectId(payload.user_id),
      metadata: payload.metadata,
      timestamp: new Date()
    });
  } catch {
    // ignore logging errors
  }
}

export { inferModule, normalizeSeverity };
