import express from "express";

import { authMiddleware } from "../middleware/authMiddleware.js";
import { Log } from "../models/Log.js";
import { inferModule, normalizeSeverity } from "../utils/logger.js";

const router = express.Router();
router.use(authMiddleware);

const MODULE_EVENT_PATTERNS = Object.freeze({
  ROBOT: /^ROBOT/i,
  AUTH: /^(USER|AUTH|LOGIN)/i,
  SYSTEM: /^SYSTEM/i,
  TASK: /^(TASK|AUTO_TASK)/i
});

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function moduleCondition(module) {
  const normalized = String(module || "").trim().toUpperCase();
  if (!normalized) return null;
  const pattern = MODULE_EVENT_PATTERNS[normalized] || new RegExp(`^${escapeRegex(normalized)}`, "i");
  return {
    $or: [
      { module: normalized },
      { eventType: pattern },
      { event_type: pattern }
    ]
  };
}

function severityCondition(severity) {
  const normalized = normalizeSeverity(severity);
  if (!severity) return null;
  if (normalized === "WARNING") {
    return { severity: { $in: ["WARNING", "WARN"] } };
  }
  return { severity: normalized };
}

function dateCondition(startDate, endDate) {
  const range = {};
  const start = startDate ? new Date(String(startDate)) : null;
  const end = endDate ? new Date(String(endDate)) : null;

  if (start && !Number.isNaN(start.getTime())) range.$gte = start;
  if (end && !Number.isNaN(end.getTime())) range.$lte = end;
  if (Object.keys(range).length === 0) return null;

  return {
    $or: [
      { createdAt: range },
      { timestamp: range }
    ]
  };
}

function buildFilter(query) {
  const and = [];
  const eventType = String(query.eventType || query.event_type || "").trim();
  const search = String(query.search || "").trim();

  const moduleFilter = moduleCondition(query.module);
  if (moduleFilter) and.push(moduleFilter);

  const severityFilter = severityCondition(query.severity);
  if (severityFilter) and.push(severityFilter);

  const dateFilter = dateCondition(query.startDate || query.from, query.endDate || query.to);
  if (dateFilter) and.push(dateFilter);

  if (eventType) {
    const pattern = new RegExp(escapeRegex(eventType), "i");
    and.push({ $or: [{ eventType: pattern }, { event_type: pattern }] });
  }

  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    and.push({
      $or: [
        { eventType: pattern },
        { event_type: pattern },
        { message: pattern },
        { description: pattern },
        { module: pattern },
        { severity: pattern },
        { entityType: pattern },
        { entityId: pattern }
      ]
    });
  }

  return and.length ? { $and: and } : {};
}

function normalizeLog(row) {
  const eventType = row.eventType || row.event_type || "SYSTEM_EVENT";
  const actor =
    row.actorId && typeof row.actorId === "object"
      ? row.actorId
      : row.user_id && typeof row.user_id === "object"
        ? row.user_id
        : null;

  return {
    id: String(row._id),
    eventType,
    event_type: eventType,
    module: row.module || inferModule(eventType),
    severity: normalizeSeverity(row.severity),
    message: row.message || row.description || "",
    description: row.description || row.message || "",
    entityType: row.entityType || null,
    entityId: row.entityId ? String(row.entityId) : null,
    actor: actor ? { id: String(actor._id), name: actor.name, email: actor.email } : null,
    actorId: row.actorId ? String(row.actorId._id || row.actorId) : row.user_id ? String(row.user_id._id || row.user_id) : null,
    task_id: row.task_id ? String(row.task_id) : null,
    robot_id: row.robot_id ? String(row.robot_id) : null,
    user_id: row.user_id ? String(row.user_id._id || row.user_id) : null,
    metadata: row.metadata || null,
    createdAt: row.createdAt || row.timestamp,
    timestamp: row.timestamp || row.createdAt
  };
}

async function countByModule(module) {
  const condition = moduleCondition(module);
  return Log.countDocuments(condition || {});
}

async function getSummary() {
  const [totalLogs, errors, warnings, taskEvents, robotEvents, systemEvents] = await Promise.all([
    Log.countDocuments({}),
    Log.countDocuments({ severity: "ERROR" }),
    Log.countDocuments({ severity: { $in: ["WARNING", "WARN"] } }),
    countByModule("TASK"),
    countByModule("ROBOT"),
    countByModule("SYSTEM")
  ]);

  return {
    totalLogs,
    errors,
    warnings,
    taskEvents,
    robotEvents,
    systemEvents
  };
}

/** GET /api/logs */
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || "25", 10), 1), 200);
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const skip = (page - 1) * limit;
    const filter = buildFilter(req.query);

    const [logs, total, summary] = await Promise.all([
      Log.find(filter)
        .sort({ createdAt: -1, timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .populate("actorId", "name email")
        .populate("user_id", "name email")
        .lean(),
      Log.countDocuments(filter),
      getSummary()
    ]);

    return res.json({
      total,
      page,
      limit,
      summary,
      logs: logs.map(normalizeLog)
    });
  } catch (error) {
    console.error("[logs] list", error);
    return res.status(500).json({ message: "Server error." });
  }
});

/** GET /api/logs/summary */
router.get("/summary", async (_req, res) => {
  try {
    return res.json(await getSummary());
  } catch (error) {
    console.error("[logs] summary", error);
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;
