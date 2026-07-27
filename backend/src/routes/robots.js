import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { Robot } from "../models/Robot.js";
import { Task } from "../models/Task.js";
import { Log } from "../models/Log.js";
import { ROBOT_STATES, validateTransition } from "../constants/robotStates.js";
import { autoAssignTask } from "../services/autoAssignService.js";
import { logEvent, normalizeSeverity } from "../utils/logger.js";

const router = express.Router();

router.use(authMiddleware);

function getUserId(req) {
  return req.user?.id || null;
}

function serializeTask(row) {
  if (!row) return null;
  return {
    id: String(row._id),
    taskNo: String(row._id).slice(-8).toUpperCase(),
    sourceLocation: row.pickup_zone_id?.label || row.pickup_zone_id?.code || null,
    destinationLocation: row.drop_zone_id?.label || row.drop_zone_id?.code || null,
    totalWeight: row.weight,
    robotEligible: true,
    status: row.status,
    priority: row.priority,
    commandPayload: {
      taskId: String(row._id),
      command: "MOVE_PACKAGE",
      mode: "TASK_PIPELINE",
      sourceLocation: row.pickup_zone_id?.label || row.pickup_zone_id?.code || null,
      destinationLocation: row.drop_zone_id?.label || row.drop_zone_id?.code || null,
      totalWeight: row.weight,
      movementPlan: ["PICKUP", "MOVE", "DROPOFF"]
    },
    createdAt: row.createdAt,
    assignedAt: row.assignedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt
  };
}

function serializeLog(row) {
  const eventType = row.eventType || row.event_type || "SYSTEM_EVENT";
  return {
    id: String(row._id),
    eventType,
    event_type: eventType,
    module: row.module || (eventType.startsWith("ROBOT") ? "ROBOT" : "TASK"),
    severity: normalizeSeverity(row.severity),
    message: row.message || row.description || "",
    description: row.description || row.message || "",
    metadata: row.metadata || null,
    createdAt: row.createdAt || row.timestamp,
    timestamp: row.timestamp || row.createdAt
  };
}

async function getRobotTaskSnapshot() {
  const robot = await Robot.findOne({}).sort({ createdAt: 1 }).populate("location_zone_id");
  if (!robot) return null;

  const activeTask = await Task.findOne({
    assigned_robot_id: robot._id,
    status: { $in: ["ASSIGNED", "IN_PROGRESS"] }
  })
    .sort({ startedAt: -1, assignedAt: -1, createdAt: -1 })
    .populate("pickup_zone_id drop_zone_id")
    .lean({ virtuals: true });

  const latestRobotTask = await Task.findOne({
    assigned_robot_id: robot._id
  })
    .sort({ completedAt: -1, startedAt: -1, assignedAt: -1, createdAt: -1 })
    .populate("pickup_zone_id drop_zone_id")
    .lean({ virtuals: true });

  const state = activeTask ? ROBOT_STATES.BUSY : robot.currentState;

  const recentLogs = await Log.find({
    $or: [
      { module: { $in: ["ROBOT", "TASK"] } },
      { eventType: /^(ROBOT|TASK|AUTO_TASK)/i },
      { event_type: /^(ROBOT|TASK|AUTO_TASK)/i },
      { task_id: activeTask?._id || null }
    ]
  })
    .sort({ createdAt: -1, timestamp: -1 })
    .limit(8)
    .lean();

  return {
    robot: robot.toJSON(),
    activeTask: serializeTask(activeTask),
    latestRobotTask: serializeTask(latestRobotTask),
    state,
    commandPayload: serializeTask(activeTask)?.commandPayload || null,
    recentLogs: recentLogs.map(serializeLog)
  };
}

/** GET /api/robots - fetch the single active robot */
router.get("/", async (_req, res) => {
  try {
    const robot = await Robot.findOne({}).sort({ createdAt: 1 }).populate("location_zone_id");
    if (!robot) {
      return res.status(404).json({ message: "Robot not initialized." });
    }
    return res.json(robot.toJSON());
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

/** GET /api/robots/task-status - derive robot status from the core task workflow */
router.get("/task-status", async (_req, res) => {
  try {
    const snapshot = await getRobotTaskSnapshot();
    if (!snapshot) return res.status(404).json({ message: "Robot not initialized." });
    return res.json(snapshot);
  } catch (error) {
    console.error("[robots] task-status", error);
    return res.status(500).json({ message: "Server error." });
  }
});

/** POST /api/robots/transition - legacy manual FSM transition */
router.post("/transition", async (req, res) => {
  try {
    const { nextState } = req.body || {};

    if (!nextState || typeof nextState !== "string") {
      return res.status(400).json({ message: "Body must include nextState (string)." });
    }

    const robot = await Robot.findOne({}).sort({ createdAt: 1 });
    if (!robot) {
      return res.status(404).json({ message: "Robot not initialized." });
    }

    const currentState = robot.currentState;

    const validation = validateTransition(currentState, nextState);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    robot.currentState = nextState;
    robot.updatedAt = new Date();
    await robot.save();

    await robot.populate("location_zone_id");

    await logEvent({
      eventType: "ROBOT_STATE_UPDATED",
      module: "ROBOT",
      severity: nextState === ROBOT_STATES.ERROR ? "ERROR" : "INFO",
      message: `Robot ${robot.name} state changed from ${currentState} to ${nextState}.`,
      entityType: "Robot",
      entityId: robot._id,
      actorId: getUserId(req),
      robot_id: robot._id,
      metadata: { previousState: currentState, nextState }
    });

    if (nextState === ROBOT_STATES.IDLE) {
      await autoAssignTask({ trigger: "ROBOT_IDLE", userId: req.user?.id });
    }

    return res.json(robot.toJSON());
  } catch (e) {
    if (e.name === "ValidationError") {
      return res.status(400).json({ message: e.message || "Validation failed." });
    }
    return res.status(500).json({ message: "Server error." });
  }
});

/** PATCH /api/robots/auto-mode - legacy toggle, kept for compatibility */
router.patch("/auto-mode", async (req, res) => {
  try {
    const { autoMode } = req.body || {};
    if (typeof autoMode !== "boolean") {
      return res.status(400).json({ message: "Body must include autoMode (boolean)." });
    }

    const robot = await Robot.findOneAndUpdate({}, { $set: { autoMode } }, { new: true }).populate("location_zone_id");
    if (!robot) {
      return res.status(404).json({ message: "Robot not initialized." });
    }

    if (autoMode && robot.currentState === ROBOT_STATES.IDLE) {
      await autoAssignTask({ trigger: "AUTO_MODE_ENABLED", userId: req.user?.id });
    }

    return res.json({ robot: robot.toJSON() });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

/** PUT /api/robots/:id/reset - release robot from active task and set IDLE */
router.put("/:id/reset", async (req, res) => {
  try {
    const robot = await Robot.findById(req.params.id);
    if (!robot) return res.status(404).json({ message: "Robot not found." });

    const activeTasks = await Task.find({
      assigned_robot_id: robot._id,
      status: { $in: ["ASSIGNED", "IN_PROGRESS"] }
    });

    for (const task of activeTasks) {
      task.status = "PENDING";
      task.assigned_robot_id = null;
      task.assignedAt = null;
      task.startedAt = null;
      await task.save();
    }

    robot.currentState = ROBOT_STATES.IDLE;
    await robot.save();

    await logEvent({
      eventType: "ROBOT_RESET",
      module: "ROBOT",
      severity: "WARNING",
      message: `Robot ${robot.name} reset to IDLE.`,
      entityType: "Robot",
      entityId: robot._id,
      actorId: getUserId(req),
      robot_id: robot._id,
      metadata: {
        releasedTaskCount: activeTasks.length,
        releasedTaskIds: activeTasks.map((task) => String(task._id))
      }
    });

    const snapshot = await getRobotTaskSnapshot();
    return res.json(snapshot);
  } catch (error) {
    console.error("[robots] reset", error);
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;
