import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { Robot } from "../models/Robot.js";
import { Task } from "../models/Task.js";
import { Zone } from "../models/Zone.js";
import { Log } from "../models/Log.js";
import { ROBOT_STATES } from "../constants/robotStates.js";

const router = express.Router();

router.use(authMiddleware);

const TASK_STATUSES = ["PENDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "REJECTED"];
const ZONE_TYPES = ["PICKUP", "DROPOFF", "CHARGING"];

function mapLogSeverity(severity) {
  if (severity === "ERROR") return "HIGH";
  if (severity === "WARN" || severity === "WARNING") return "MEDIUM";
  return "LOW";
}

function countRows(rows, keys) {
  const result = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const row of rows) {
    if (row._id in result) result[row._id] = row.count;
  }
  return result;
}

function serializeTask(task) {
  if (!task) return null;
  return {
    id: String(task._id),
    status: task.status,
    priority: task.priority,
    weight: task.weight,
    pickupZone: task.pickup_zone_id?.code || null,
    pickupZoneLabel: task.pickup_zone_id?.label || null,
    dropZone: task.drop_zone_id?.code || null,
    dropZoneLabel: task.drop_zone_id?.label || null,
    createdAt: task.createdAt || null,
    assignedAt: task.assignedAt || null,
    startedAt: task.startedAt || null,
    completedAt: task.completedAt || null
  };
}

/** GET /api/dashboard/overview */
router.get("/overview", async (_req, res) => {
  try {
    const [
      robots,
      taskStatusRows,
      taskPriorityRows,
      recentTasks,
      activeTask,
      zones,
      zoneRows,
      recentLogs
    ] = await Promise.all([
      Robot.find({}).sort({ createdAt: 1 }).populate("location_zone_id").lean({ virtuals: true }),
      Task.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Task.aggregate([{ $group: { _id: "$priority", count: { $sum: 1 } } }]),
      Task.find({})
        .sort({ createdAt: -1 })
        .limit(6)
        .populate("pickup_zone_id drop_zone_id")
        .lean({ virtuals: true }),
      Task.findOne({ status: { $in: ["ASSIGNED", "IN_PROGRESS"] } })
        .sort({ startedAt: -1, assignedAt: -1, createdAt: -1 })
        .populate("pickup_zone_id drop_zone_id")
        .lean({ virtuals: true }),
      Zone.find({ active: true }).sort({ code: 1 }).lean(),
      Zone.aggregate([{ $match: { active: true } }, { $group: { _id: "$type", count: { $sum: 1 } } }]),
      Log.find({}).sort({ timestamp: -1, createdAt: -1 }).limit(5).lean()
    ]);

    const byStatus = countRows(taskStatusRows, TASK_STATUSES);
    const byPriority = countRows(taskPriorityRows, ["LOW", "MEDIUM", "HIGH", "URGENT"]);
    const byType = countRows(zoneRows, ZONE_TYPES);
    const activeRobot = robots[0] || null;

    const robot = {
      totalRobots: robots.length,
      idleRobots: robots.filter((row) => row.currentState === ROBOT_STATES.IDLE).length,
      busyRobots: robots.filter((row) => [ROBOT_STATES.ASSIGNED, ROBOT_STATES.BUSY].includes(row.currentState)).length,
      errorRobots: robots.filter((row) => row.currentState === ROBOT_STATES.ERROR).length,
      activeRobotName: activeRobot?.name || null,
      activeRobotState: activeRobot?.currentState || null,
      activeRobotId: activeRobot?._id ? String(activeRobot._id) : null,
      location: activeRobot?.location_zone_id?.code || null,
      locationLabel: activeRobot?.location_zone_id?.label || null,
      autoMode: Boolean(activeRobot?.autoMode),
      activeTask: serializeTask(activeTask)
    };

    const totalTasks = Object.values(byStatus).reduce((sum, count) => sum + count, 0);
    const openTasks = byStatus.PENDING + byStatus.ASSIGNED + byStatus.IN_PROGRESS;

    return res.json({
      robot,
      tasks: {
        total: totalTasks,
        open: openTasks,
        byStatus,
        byPriority,
        recent: recentTasks.map(serializeTask)
      },
      zones: {
        total: zones.length,
        byType,
        list: zones.map((zone) => ({
          id: String(zone._id),
          code: zone.code,
          label: zone.label,
          type: zone.type
        }))
      },
      actionCenter: {
        activeTask: serializeTask(activeTask),
        recentTasks: recentTasks.map(serializeTask),
        recentLogs: recentLogs.map((log) => ({
          title: log.event_type || log.eventType || "Event",
          description: log.description || log.message || "",
          severity: mapLogSeverity(log.severity),
          relatedId: String(log._id),
          createdAt: log.timestamp || log.createdAt || null,
          status: log.severity || "INFO",
          event_type: log.event_type || log.eventType
        }))
      },
      metrics: {
        completionRate: totalTasks === 0 ? 0 : Math.round((byStatus.COMPLETED / totalTasks) * 1000) / 10,
        openTaskRate: totalTasks === 0 ? 0 : Math.round((openTasks / totalTasks) * 1000) / 10,
        totalActionsRequired: byStatus.PENDING + byStatus.REJECTED
      }
    });
  } catch (error) {
    console.error("[dashboard] overview", error);
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;
