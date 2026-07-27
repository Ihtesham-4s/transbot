import express from "express";
import { z } from "zod";

import { authMiddleware } from "../middleware/authMiddleware.js";
import { Robot } from "../models/Robot.js";
import { Task } from "../models/Task.js";
import { Zone } from "../models/Zone.js";
import { ROBOT_STATES } from "../constants/robotStates.js";
import { logEvent } from "../utils/logger.js";
import { autoAssignTask } from "../services/autoAssignService.js";
import { getDefaultTaskRoute, routeForZones } from "../services/warehouseMap.js";

const router = express.Router();

router.use(authMiddleware);

const createTaskSchema = z.object({
  pickup_zone: z.string().min(1).max(80),
  drop_zone: z.string().min(1).max(80),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  weight: z.coerce.number().positive("Weight must be greater than 0").max(10, "Weight cannot exceed 10 kg")
});

const TASK_PRIORITY_VALUES = Object.freeze(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const TASK_QUEUE_STATUSES = Object.freeze(["PENDING", "ASSIGNED"]);
const TASK_PRIORITY_RANK = Object.freeze({
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  URGENT: 4
});

const TASK_ZONE_POPULATE = "pickup_zone_id drop_zone_id";

function normalizePriority(value) {
  const normalized = String(value || "MEDIUM").trim().toUpperCase();
  return TASK_PRIORITY_VALUES.includes(normalized) ? normalized : null;
}

function getPriorityRank(priority) {
  return TASK_PRIORITY_RANK[priority] || TASK_PRIORITY_RANK.MEDIUM;
}

function sortTasksByQueueOrder(tasks) {
  return [...tasks].sort((left, right) => {
    const rankDelta = getPriorityRank(right.priority) - getPriorityRank(left.priority);
    if (rankDelta !== 0) return rankDelta;
    return new Date(left.createdAt) - new Date(right.createdAt);
  });
}

function serializeQueueTasks(tasks) {
  const maxPriorityRank = tasks.reduce((highest, task) => Math.max(highest, getPriorityRank(task.priority)), 0);

  return sortTasksByQueueOrder(tasks).map((task) => {
    const serialized = task.toJSON();
    serialized.interruptsPending = getPriorityRank(task.priority) < maxPriorityRank;
    return serialized;
  });
}

function toTaskInputShape(raw = {}) {
  return {
    pickupZone: raw.pickupZone ?? raw.pickup_zone,
    dropZone: raw.dropZone ?? raw.drop_zone,
    weight: raw.weight,
    priority: raw.priority ?? "MEDIUM"
  };
}

function parseBulkTextInput(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const [zonesPart, weightPart, priorityPart] = line.split("|").map((part) => part?.trim());
    const zoneParts = String(zonesPart || "").split("->");
    const pickupZone = zoneParts[0]?.trim();
    const dropZone = zoneParts[1]?.trim();

    const weightMatch = String(weightPart || "").match(/(\d+(?:\.\d+)?)/);
    const weight = weightMatch ? Number(weightMatch[1]) : NaN;

    return {
      pickupZone,
      dropZone,
      weight,
      priority: (priorityPart || "MEDIUM").trim().toUpperCase(),
      raw: line
    };
  });
}

function resolveZoneByInput(input, lookupByCode, lookupByShortCode) {
  const normalized = String(input || "").trim().toUpperCase();
  if (!normalized) return null;
  return lookupByCode.get(normalized) || lookupByShortCode.get(normalized) || null;
}

async function getZoneByCode(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return null;
  return Zone.findOne({ code: normalized, active: true });
}

async function getSingleRobot() {
  return Robot.findOne({}).sort({ createdAt: 1 }).populate("location_zone_id");
}

export async function getDispatchAssignment(totalWeightKg) {
  const robot = await Robot.findOne({}).sort({ createdAt: 1 }).lean();
  const maxCapacityKg = Number(robot?.maxCapacityKg || 0);
  const assignedType = Number(totalWeightKg) <= maxCapacityKg ? "ROBOT" : "MANUAL";

  return {
    assignedType,
    assignedWorkerName: assignedType === "ROBOT" ? robot?.name || null : null,
    maxCapacityKg,
    robotId: robot?._id || null
  };
}

export async function logDispatchAssignment({ taskId, totalWeightKg, assignment, userId }) {
  await logEvent("DISPATCH_AUTO_ASSIGNED", `Dispatch assignment decided (id=${taskId}).`, {
    module: "DISPATCH",
    task_id: taskId,
    robot_id: assignment.robotId,
    user_id: userId,
    metadata: {
      totalWeightKg,
      maxCapacityKg: assignment.maxCapacityKg,
      assignedType: assignment.assignedType
    }
  });
}

/** POST /api/tasks — create a new task */
router.post("/", async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input.", errors: parsed.error.flatten() });
  }

  try {
    const [pickupZone, dropZone] = await Promise.all([
      getZoneByCode(parsed.data.pickup_zone),
      getZoneByCode(parsed.data.drop_zone)
    ]);

    if (!pickupZone || !dropZone) {
      return res.status(400).json({
        message: "Unknown zone code.",
        errors: {
          pickup_zone: pickupZone ? undefined : "Unknown pickup zone.",
          drop_zone: dropZone ? undefined : "Unknown drop zone."
        }
      });
    }

    const totalWeightKg = parsed.data.weight;
    const dispatchAssignment = await getDispatchAssignment(totalWeightKg);

    const created = await Task.create({
      pickup_zone_id: pickupZone._id,
      drop_zone_id: dropZone._id,
      order_id: null,
      weight: parsed.data.weight,
      totalWeightKg,
      assignedType: dispatchAssignment.assignedType,
      assignedWorkerName: dispatchAssignment.assignedWorkerName,
      priority: parsed.data.priority || "MEDIUM",
      status: "PENDING",
      assigned_robot_id: null
    });

    await created.populate(TASK_ZONE_POPULATE);
    await logDispatchAssignment({
      taskId: created._id,
      totalWeightKg,
      assignment: dispatchAssignment,
      userId: req.user?.id
    });

    await logEvent("TASK_CREATED", `Task created (id=${created._id})`, {
      task_id: created._id,
      user_id: req.user?.id
    });

    if (created.priority === "URGENT") {
      const pushedDownTasks = await Task.find({
        _id: { $ne: created._id },
        status: { $in: TASK_QUEUE_STATUSES },
        priority: { $in: ["LOW", "MEDIUM", "HIGH"] }
      })
        .sort({ createdAt: 1 })
        .select("_id priority status createdAt")
        .lean();

      await logEvent({
        eventType: "PRIORITY_INTERRUPT",
        module: "DISPATCH",
        severity: "WARNING",
        message: `Urgent dispatch task created (id=${created._id}); queue priority changed.`,
        actorId: req.user?.id || null,
        task_id: created._id,
        metadata: {
          urgentTaskId: String(created._id),
          pushedDownTasks: pushedDownTasks.map((task) => ({
            id: String(task._id),
            priority: task.priority,
            status: task.status,
            createdAt: task.createdAt
          }))
        }
      });
    }

    // Trigger auto-assignment if robot is IDLE and auto mode is enabled.
    const autoResult = await autoAssignTask({ trigger: "TASK_CREATED", userId: req.user?.id });

    if (autoResult.ok) {
      return res.status(201).json({
        task: created.toJSON(),
        autoAssigned: {
          task: autoResult.task,
          robot: autoResult.robot
        }
      });
    }

    return res.status(201).json({ task: created.toJSON() });
  } catch (e) {
    return res.status(500).json({ message: "Server error." });
  }
});

/** POST /api/tasks/bulk — create multiple tasks from JSON or text */
router.post("/bulk", async (req, res) => {
  try {
    let receivedItems = [];

    if (Array.isArray(req.body)) {
      receivedItems = req.body.map((item) => ({ ...toTaskInputShape(item), raw: item }));
    } else if (Array.isArray(req.body?.tasks)) {
      receivedItems = req.body.tasks.map((item) => ({ ...toTaskInputShape(item), raw: item }));
    } else if (typeof req.body?.text === "string" || typeof req.body?.input === "string") {
      receivedItems = parseBulkTextInput(req.body?.text ?? req.body?.input);
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid bulk payload. Provide tasks[] JSON or text input."
      });
    }

    if (receivedItems.length === 0) {
      return res.status(400).json({ success: false, message: "No tasks received." });
    }

    const activeZones = await Zone.find({ active: true }).lean();
    const lookupByCode = new Map(activeZones.map((zone) => [String(zone.code).toUpperCase(), zone]));
    const lookupByShortCode = new Map(
      activeZones
        .map((zone) => [String(zone.code).toUpperCase().replace(/^ZONE_/, ""), zone])
        .filter(([shortCode]) => Boolean(shortCode))
    );

    const errors = [];
    const docsToInsert = [];
    const dispatchAssignmentByIndex = new Map();

    const robot = await Robot.findOne({}).sort({ createdAt: 1 }).lean();
    const maxCapacityKg = Number(robot?.maxCapacityKg || 0);

    receivedItems.forEach((item, index) => {
      const pickupZone = resolveZoneByInput(item.pickupZone, lookupByCode, lookupByShortCode);
      const dropZone = resolveZoneByInput(item.dropZone, lookupByCode, lookupByShortCode);
      const weight = Number(item.weight);
      const priority = normalizePriority(item.priority);

      if (!pickupZone) {
        errors.push({ index, reason: "Unknown pickup zone.", input: item.raw });
        return;
      }

      if (!dropZone) {
        errors.push({ index, reason: "Unknown drop zone.", input: item.raw });
        return;
      }

      if (!Number.isFinite(weight) || weight <= 0 || weight > 10) {
        errors.push({ index, reason: "weight must be greater than 0 and <= 10kg.", input: item.raw });
        return;
      }

      if (!priority) {
        errors.push({ index, reason: "priority must be LOW, MEDIUM, HIGH, or URGENT.", input: item.raw });
        return;
      }

      const totalWeightKg = weight;
      const assignedType = totalWeightKg <= maxCapacityKg ? "ROBOT" : "MANUAL";
      const dispatchAssignment = {
        assignedType,
        assignedWorkerName: assignedType === "ROBOT" ? robot?.name || null : null,
        maxCapacityKg,
        robotId: robot?._id || null
      };

      dispatchAssignmentByIndex.set(docsToInsert.length, { totalWeightKg, assignment: dispatchAssignment });
      docsToInsert.push({
        pickup_zone_id: pickupZone._id,
        drop_zone_id: dropZone._id,
        order_id: null,
        weight,
        totalWeightKg,
        assignedType,
        assignedWorkerName: dispatchAssignment.assignedWorkerName,
        priority,
        status: "PENDING",
        assigned_robot_id: null
      });
    });

    const inserted = docsToInsert.length > 0 ? await Task.insertMany(docsToInsert, { ordered: false }) : [];
    const dispatchAssignmentByTaskId = new Map(
      inserted
        .map((task, index) => {
          const dispatch = dispatchAssignmentByIndex.get(index);
          return dispatch ? [String(task._id), dispatch] : null;
        })
        .filter(Boolean)
    );
    const taskIds = inserted.map((task) => task._id);
    const createdTasks = taskIds.length
      ? await Task.find({ _id: { $in: taskIds } }).populate(TASK_ZONE_POPULATE).sort({ createdAt: 1 })
      : [];

    if (createdTasks.length > 0) {
      await Promise.all(
        createdTasks.map((task) => {
          const dispatch = dispatchAssignmentByTaskId.get(String(task._id));
          if (!dispatch) return null;
          return logDispatchAssignment({
            taskId: task._id,
            totalWeightKg: dispatch.totalWeightKg,
            assignment: dispatch.assignment,
            userId: req.user?.id
          });
        })
      );

      await logEvent("TASK_BULK_CREATED", `Bulk task creation completed (created=${createdTasks.length}).`, {
        user_id: req.user?.id,
        metadata: {
          totalReceived: receivedItems.length,
          created: createdTasks.length,
          failed: errors.length
        }
      });

      await autoAssignTask({ trigger: "TASK_BULK_CREATED", userId: req.user?.id });
    }

    return res.status(201).json({
      success: true,
      totalReceived: receivedItems.length,
      created: createdTasks.length,
      failed: errors.length,
      tasks: createdTasks.map((task) => task.toJSON()),
      errors
    });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

/** GET /api/tasks — list all tasks */
router.get("/", async (_req, res) => {
  try {
    const tasks = await Task.find({}).sort({ createdAt: 1 }).populate(TASK_ZONE_POPULATE);
    return res.json({ tasks: tasks.map((t) => t.toJSON()) });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

router.get("/queue", async (_req, res) => {
  try {
    const tasks = await Task.find({ status: { $in: TASK_QUEUE_STATUSES } })
      .populate(TASK_ZONE_POPULATE)
      .sort({ createdAt: 1 });

    return res.json({
      priorityOrder: ["URGENT", "HIGH", "MEDIUM", "LOW"],
      statuses: TASK_QUEUE_STATUSES,
      tasks: serializeQueueTasks(tasks)
    });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

router.get("/:id/route", async (req, res) => {
  try {
    const taskId = String(req.params.id || "").trim();
    const lookupMode = taskId.toLowerCase();

    if (["demo", "current", "active"].includes(lookupMode)) {
      const activeTask = await Task.findOne({ status: { $in: ["ASSIGNED", "IN_PROGRESS"] } })
        .sort({ assignedAt: -1, createdAt: -1 })
        .populate(TASK_ZONE_POPULATE);

      return res.json({
        taskId: activeTask ? String(activeTask._id) : "SIM-TASK-001",
        route: activeTask
          ? routeForZones(activeTask.pickup_zone_id, activeTask.drop_zone_id)
          : getDefaultTaskRoute(),
        status: activeTask?.status || "IN_PROGRESS",
        source: activeTask ? "DATABASE" : "SIMULATION"
      });
    }

    if (!/^[a-f\d]{24}$/i.test(taskId)) {
      return res.status(400).json({ message: "Invalid task id." });
    }

    const task = await Task.findById(taskId).populate(TASK_ZONE_POPULATE);
    if (!task) return res.status(404).json({ message: "Task not found." });

    return res.json({
      taskId: String(task._id),
      route: routeForZones(task.pickup_zone_id, task.drop_zone_id),
      status: task.status,
      source: "DATABASE"
    });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

/** PATCH /api/tasks/:id/assign — manual assignment (optional) */
router.patch("/:id/assign", async (req, res) => {
  const taskId = req.params.id;
  try {
    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ message: "Task not found." });
    if (task.status !== "PENDING") {
      return res.status(400).json({ message: "Task must be PENDING to assign." });
    }

    const robot = await Robot.findOneAndUpdate(
      { currentState: ROBOT_STATES.IDLE },
      { $set: { currentState: ROBOT_STATES.ASSIGNED } },
      { new: true }
    ).populate("location_zone_id");

    if (!robot) {
      return res.status(409).json({ message: "Robot is not IDLE." });
    }

    const updatedTask = await Task.findOneAndUpdate(
      { _id: task._id, status: "PENDING" },
      { $set: { status: "ASSIGNED", assigned_robot_id: robot._id, assignedAt: new Date() } },
      { new: true }
    );

    if (!updatedTask) {
      robot.currentState = ROBOT_STATES.IDLE;
      await robot.save();
      return res.status(409).json({ message: "Task no longer pending." });
    }

    await updatedTask.populate(TASK_ZONE_POPULATE);
    await logEvent("TASK_ASSIGNED_MANUAL", `Task assigned manually (id=${updatedTask._id}).`, {
      task_id: updatedTask._id,
      robot_id: robot._id,
      user_id: req.user?.id
    });

    return res.json({
      task: updatedTask.toJSON(),
      robot: robot.toJSON()
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error." });
  }
});

/** PATCH /api/tasks/:id/complete — mark task COMPLETED, robot to IDLE */
router.patch("/:id/complete", async (req, res) => {
  const taskId = req.params.id;
  try {
    const robot = await getSingleRobot();
    if (!robot) return res.status(404).json({ message: "Robot not initialized." });

    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ message: "Task not found." });
    
    if (task.status === "COMPLETED") {
      return res.json({ task: task.toJSON(), robot: robot.toJSON() });
    }

    const updatedTask = await Task.findOneAndUpdate(
      { _id: taskId, status: { $in: ["ASSIGNED", "IN_PROGRESS"] }, assigned_robot_id: robot._id },
      { $set: { status: "COMPLETED", completedAt: new Date(), startedAt: task.startedAt || new Date() } },
      { new: true }
    );

    if (!updatedTask) {
      return res.status(409).json({ message: "Task not found or not IN_PROGRESS on the active robot." });
    }

    robot.currentState = ROBOT_STATES.IDLE;
    const dropZoneId = updatedTask?.drop_zone_id?._id || updatedTask?.drop_zone_id || null;
    if (dropZoneId) robot.location_zone_id = dropZoneId;
    await robot.save();
    
    await updatedTask.populate(TASK_ZONE_POPULATE);
    await robot.populate("location_zone_id");
    
    await logEvent("TASK_COMPLETED", `Task completed (id=${updatedTask._id}).`, {
      task_id: updatedTask._id,
      robot_id: robot._id,
      user_id: req.user?.id
    });

    // Robot became IDLE after completion. Try auto-assigning next best task.
    await autoAssignTask({ trigger: "TASK_COMPLETED", userId: req.user?.id });

    return res.json({ task: updatedTask.toJSON(), robot: robot.toJSON() });
  } catch (err) {
    return res.status(500).json({ message: "Server error." });
  }
});

/** DELETE /api/tasks/:id — delete a task */
router.delete("/:id", async (req, res) => {
  const taskId = req.params.id;
  try {
    const task = await Task.findByIdAndDelete(taskId);
    if (!task) return res.status(404).json({ message: "Task not found." });

    let robot = null;

    if (task.status === "IN_PROGRESS") {
      robot = task.assigned_robot_id
        ? await Robot.findById(task.assigned_robot_id)
        : await getSingleRobot();

      if (robot) {
        robot.currentState = ROBOT_STATES.IDLE;
        await robot.save();
        await robot.populate("location_zone_id");

        await logEvent(
          "ROBOT_FORCED_RESET",
          `Robot reset to IDLE after deleting in-progress task (id=${taskId}).`,
          {
            task_id: task._id,
            robot_id: robot._id,
            user_id: req.user?.id,
            severity: "WARN",
            metadata: { reason: "TASK_DELETED_WHILE_IN_PROGRESS" }
          }
        );
      }
    }

    await logEvent("TASK_DELETED", `Task deleted (id=${taskId}) manually.`, {
      task_id: task._id,
      robot_id: robot?._id || task.assigned_robot_id || null,
      user_id: req.user?.id,
      severity: ["ASSIGNED", "IN_PROGRESS"].includes(task.status) ? "WARN" : "INFO"
    });

    if (robot?.currentState === ROBOT_STATES.IDLE) {
      await autoAssignTask({ trigger: "TASK_DELETED", userId: req.user?.id });
    }

    return res.json({ ok: true, robot: robot ? robot.toJSON() : null });
  } catch (err) {
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;
