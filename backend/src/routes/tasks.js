import express from "express";
import { z } from "zod";

import { authMiddleware } from "../middleware/authMiddleware.js";
import { Robot } from "../models/Robot.js";
import { Task } from "../models/Task.js";
import { Zone } from "../models/Zone.js";
import { ROBOT_STATES } from "../constants/robotStates.js";
import { logEvent } from "../utils/logger.js";
import { autoAssignTask } from "../services/autoAssignService.js";
import { sendRobotSerialCommand } from "../services/robotSerialService.js";
import { getDefaultTaskRoute, routeForZones } from "../services/warehouseMap.js";

const router = express.Router();

router.use(authMiddleware);

const createTaskSchema = z.object({
  pickup_zone: z.string().min(1).max(80),
  drop_zone: z.string().min(1).max(80),
  weight: z.coerce
    .number()
    .gt(0, "Weight must be greater than 0")
    .max(50, "Weight cannot exceed 50 kg")
});

const TASK_QUEUE_STATUSES = Object.freeze(["PENDING", "ASSIGNED"]);

const TASK_ZONE_POPULATE = "pickup_zone_id drop_zone_id";

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
  const maxCapacityKg = 2;
  const isRobotTask = Number(totalWeightKg) <= maxCapacityKg;
  const assignedType = isRobotTask ? "ROBOT" : "HUMAN_WORKER";

  return {
    assignedType,
    assignedWorkerName: isRobotTask ? (robot?.name || "Robot-01") : "Human Worker (Courier)",
    maxCapacityKg,
    robotId: isRobotTask ? (robot?._id || null) : null
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

    // Pickup zone must differ from drop zone
    if (pickupZone._id.toString() === dropZone._id.toString()) {
      return res.status(400).json({ message: "Pickup and drop zones must be different." });
    }

    const totalWeightKg = parsed.data.weight;
    const isRobotTask = totalWeightKg <= 2;

    // Robot tasks (<= 2 kg) require pickup zone to match robot's current location
    const robot = await Robot.findOne({}).sort({ createdAt: 1 }).populate("location_zone_id");
    if (isRobotTask && robot) {
      const robotZoneCode = robot.location_zone_id?.code;
      if (robotZoneCode && pickupZone.code !== robotZoneCode) {
        return res.status(400).json({
          message: `Robot tasks (<= 2 kg) must have pickup zone matching robot location (currently at Zone ${robotZoneCode}). Tasks > 2 kg will be assigned to Human Workers.`
        });
      }
    }

    const assignedType = isRobotTask ? "ROBOT" : "HUMAN_WORKER";
    const assignedWorkerName = isRobotTask ? (robot?.name || "Robot-01") : "Human Worker (Courier)";

    const created = await Task.create({
      pickup_zone_id: pickupZone._id,
      drop_zone_id: dropZone._id,
      order_id: null,
      weight: totalWeightKg,
      totalWeightKg,
      assignedType,
      assignedWorkerName,
      status: "PENDING",
      assigned_robot_id: null
    });

    const dispatchAssignment = await getDispatchAssignment(totalWeightKg);

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

    // Trigger auto-assignment if robot is IDLE and auto mode is enabled.
    const autoResult = await autoAssignTask({ trigger: "TASK_CREATED", userId: req.user?.id });

    if (autoResult.ok) {
      return res.status(201).json({
        task: created.toJSON(),
        autoAssigned: { task: autoResult.task, robot: autoResult.robot }
      });
    }

    return res.status(201).json({ task: created.toJSON() });
  } catch (e) {
    console.error("[tasks] create", e);
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
      statuses: TASK_QUEUE_STATUSES,
      tasks: tasks.map((task) => task.toJSON())
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

/** PATCH /api/tasks/:id/assign — manual assignment */
router.patch("/:id/assign", async (req, res) => {
  const taskId = req.params.id;
  try {
    const task = await Task.findById(taskId).populate(TASK_ZONE_POPULATE);
    if (!task) return res.status(404).json({ message: "Task not found." });
    if (task.status !== "PENDING") {
      return res.status(400).json({ message: "Task must be PENDING to assign." });
    }

    // Weight check (robot payload limit is 2 kg)
    if (Number(task.weight) > 2 || task.assignedType === "HUMAN_WORKER") {
      return res.status(400).json({
        message: "Cannot assign task to robot. Weight exceeds 2 kg robot capacity limit."
      });
    }

    const robot = await getSingleRobot();
    if (!robot) return res.status(404).json({ message: "Robot not initialized." });
    if (robot.currentState !== ROBOT_STATES.IDLE) {
      return res.status(409).json({ message: "Robot is not IDLE." });
    }

    // Pickup zone match check — pickup zone MUST match robot's current location
    const pickupZoneId = task.pickup_zone_id?._id?.toString() || task.pickup_zone_id?.toString();
    const robotZoneId = robot.location_zone_id?._id?.toString() || robot.location_zone_id?.toString();
    const robotZoneCode = robot.location_zone_id?.code || "unknown";
    const pickupZoneCode = task.pickup_zone_id?.code || "unknown";

    if (robotZoneId && pickupZoneId && robotZoneId !== pickupZoneId) {
      return res.status(400).json({
        message: `Cannot assign task. Task pickup zone (Zone ${pickupZoneCode}) does not match robot's current location (Zone ${robotZoneCode}).`
      });
    }

    // Lock robot and assign task
    robot.currentState = ROBOT_STATES.ASSIGNED;
    await robot.save();

    const updatedTask = await Task.findOneAndUpdate(
      { _id: task._id, status: "PENDING" },
      { $set: { status: "ASSIGNED", assigned_robot_id: robot._id, assignedAt: new Date() } },
      { new: true }
    ).populate(TASK_ZONE_POPULATE);

    if (!updatedTask) {
      robot.currentState = ROBOT_STATES.IDLE;
      await robot.save();
      return res.status(409).json({ message: "Task no longer pending." });
    }

    // Automatically transmit TASK:XX to Arduino hardware over serial Bluetooth
    const pickupCode = updatedTask.pickup_zone_id?.code;
    const dropCode = updatedTask.drop_zone_id?.code;
    let serialSent = false;

    if (pickupCode && dropCode) {
      const serialCmd = `TASK:${pickupCode}${dropCode}`;
      try {
        await sendRobotSerialCommand("MODE:AUTO");
        await sendRobotSerialCommand(serialCmd);
        serialSent = true;
        console.log(`[tasks/assign] Automatically transmitted MODE:AUTO and "${serialCmd}" to Arduino Bluetooth serial.`);
      } catch (serialError) {
        console.warn(`[tasks/assign] Serial transmit "${serialCmd}" notice:`, serialError?.message);
      }
    }

    await logEvent("TASK_ASSIGNED_MANUAL", `Task assigned manually (id=${updatedTask._id}). ${serialSent ? "Transmitted to Arduino." : ""}`, {
      task_id: updatedTask._id,
      robot_id: robot._id,
      user_id: req.user?.id
    });

    return res.json({
      task: updatedTask.toJSON(),
      robot: robot.toJSON(),
      serialSent
    });
  } catch (err) {
    console.error("[tasks] assign error:", err);
    return res.status(500).json({ message: "Server error." });
  }
});

/** PATCH /api/tasks/:id/complete — mark task COMPLETED */
router.patch("/:id/complete", async (req, res) => {
  const taskId = req.params.id;
  try {
    const task = await Task.findById(taskId).populate(TASK_ZONE_POPULATE);
    if (!task) return res.status(404).json({ message: "Task not found." });
    
    const robot = await getSingleRobot();

    if (task.status === "COMPLETED") {
      return res.json({ task: task.toJSON(), robot: robot ? robot.toJSON() : null });
    }

    // Mark task COMPLETED
    task.status = "COMPLETED";
    task.completedAt = new Date();
    if (!task.startedAt) task.startedAt = new Date();
    await task.save();

    // If it's a Human Worker Courier task (> 2 kg)
    if (task.assignedType === "HUMAN_WORKER" || Number(task.weight) > 2) {
      await logEvent({
        eventType: "HUMAN_WORKER_TASK_COMPLETED",
        module: "TASK",
        severity: "SUCCESS",
        message: `Human Worker completed courier task (id=${task._id}, weight=${task.weight}kg).`,
        entityType: "Task",
        entityId: task._id,
        actorId: req.user?.id || null,
        task_id: task._id,
        metadata: { weightKg: task.weight }
      });

      return res.json({
        ok: true,
        message: `Courier task (${task.weight} kg) completed by Human Worker.`,
        task: task.toJSON(),
        robot: robot ? robot.toJSON() : null
      });
    }

    // For Robot tasks: UPDATE ROBOT LOCATION TO DROP ZONE & SET TO IDLE
    if (robot) {
      const dropZoneId = task.drop_zone_id?._id || task.drop_zone_id || null;
      if (dropZoneId) {
        robot.location_zone_id = dropZoneId;
      }
      robot.currentState = ROBOT_STATES.IDLE;
      await robot.save();
      await robot.populate("location_zone_id");

      await logEvent({
        eventType: "TASK_COMPLETED",
        module: "TASK",
        severity: "SUCCESS",
        message: `Task completed (id=${task._id}). Robot relocated to ${robot.location_zone_id?.code ? 'Zone ' + robot.location_zone_id.code : 'drop zone'}.`,
        entityType: "Task",
        entityId: task._id,
        actorId: req.user?.id || null,
        robot_id: robot._id,
        task_id: task._id,
        metadata: { dropZone: robot.location_zone_id?.code || null }
      });

      await autoAssignTask({ trigger: "TASK_COMPLETED", userId: req.user?.id });
    }

    const finalRobot = await getSingleRobot();

    return res.json({
      ok: true,
      message: `Task completed. Robot is now at Zone ${finalRobot?.location_zone_id?.code || "destination"}.`,
      task: task.toJSON(),
      robot: finalRobot ? finalRobot.toJSON() : robot ? robot.toJSON() : null
    });
  } catch (err) {
    console.error("[tasks] complete error:", err);
    return res.status(500).json({ message: "Server error." });
  }
});

/** DELETE /api/tasks/queue/clear — clear all non-completed tasks in queue */
router.delete("/queue/clear", async (req, res) => {
  try {
    const deleted = await Task.deleteMany({ status: { $ne: "COMPLETED" } });

    let robot = await getSingleRobot();
    if (robot) {
      robot.currentState = ROBOT_STATES.IDLE;
      await robot.save();
      await robot.populate("location_zone_id");
    }

    await logEvent("TASK_QUEUE_CLEARED", `Task queue cleared (${deleted.deletedCount} tasks removed).`, {
      user_id: req.user?.id,
      severity: "WARN",
      metadata: { deletedCount: deleted.deletedCount }
    });

    return res.json({ ok: true, deletedCount: deleted.deletedCount, robot: robot ? robot.toJSON() : null });
  } catch (err) {
    console.error("[tasks] clear queue error:", err);
    return res.status(500).json({ message: "Server error clearing queue." });
  }
});

/** DELETE /api/tasks/:id — delete a task */
router.delete("/:id", async (req, res) => {
  const taskId = req.params.id;
  try {
    const task = await Task.findByIdAndDelete(taskId);
    if (!task) return res.status(404).json({ message: "Task not found." });

    let robot = await getSingleRobot();

    // If deleted task was ASSIGNED or IN_PROGRESS, or assigned to this robot, release robot to IDLE
    if (["ASSIGNED", "IN_PROGRESS"].includes(task.status) || (robot && String(task.assigned_robot_id) === String(robot._id))) {
      if (robot) {
        robot.currentState = ROBOT_STATES.IDLE;
        await robot.save();
        await robot.populate("location_zone_id");

        await logEvent(
          "ROBOT_FORCED_RESET",
          `Robot reset to IDLE after deleting active task (id=${taskId}).`,
          {
            task_id: task._id,
            robot_id: robot._id,
            user_id: req.user?.id,
            severity: "WARN",
            metadata: { reason: "TASK_DELETED_WHILE_ACTIVE", taskStatus: task.status }
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

    // Auto-assign next pending task if robot is IDLE
    if (robot && robot.currentState === ROBOT_STATES.IDLE) {
      await autoAssignTask({ trigger: "TASK_DELETED", userId: req.user?.id });
      robot = await getSingleRobot();
    }

    return res.json({ ok: true, robot: robot ? robot.toJSON() : null });
  } catch (err) {
    console.error("[tasks] delete error:", err);
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;
