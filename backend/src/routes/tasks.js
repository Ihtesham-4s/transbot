import express from "express";
import { z } from "zod";

import { authMiddleware } from "../middleware/authMiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { Robot } from "../models/Robot.js";
import { Task } from "../models/Task.js";
import { ROBOT_STATES, validateTransition } from "../constants/robotStates.js";
import { pickBestTask } from "../utils/scheduler.js";
import { analyzeFeasibility, BATTERY_PER_UNIT } from "../utils/feasibility.js";
import { WAREHOUSE_GRAPH, getShortestPath } from "../utils/warehouseGraph.js";
import { logEvent } from "../utils/logger.js";

const router = express.Router();

router.use(authMiddleware);

const createTaskSchema = z.object({
  pickup_zone: z.string().min(1).max(80),
  drop_zone: z.string().min(1).max(80),
  weight: z.coerce.number().min(0),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional()
});

function formatDecision(scored) {
  if (!scored) return null;
  const eff = Number(scored.effective_priority);
  const effRounded = Math.round(eff * 100) / 100;
  const waitingRounded = Math.round(scored.waiting_minutes * 10) / 10;

  return {
    task_id: String(scored.task._id),
    base_priority: scored.base_priority,
    waiting_minutes: waitingRounded,
    effective_priority: effRounded,
    reason: `Selected because effective_priority=${effRounded} and FIFO order` // FIFO tie-breaker
  };
}

async function getSingleRobot() {
  return Robot.findOne({}).sort({ createdAt: 1 });
}

async function ensureRobotIsAvailable(robot) {
  if (!robot) return { ok: false, status: 404, message: "Robot not initialized." };
  if (robot.currentState !== ROBOT_STATES.IDLE) {
    return { ok: false, status: 409, message: `Robot is not available (state=${robot.currentState}).` };
  }

  const active = await Task.findOne({
    assigned_robot_id: robot._id,
    status: { $in: ["ASSIGNED", "IN_PROGRESS"] }
  });

  if (active) {
    return {
      ok: false,
      status: 409,
      message: `Robot already has an active task (task=${String(active._id)} status=${active.status}).`
    };
  }

  return { ok: true };
}

async function rejectPendingTask(task, reason) {
  if (!task?._id) return null;
  return Task.findOneAndUpdate(
    { _id: task._id, status: "PENDING" },
    { $set: { status: "REJECTED", rejection_reason: reason || "Rejected", assigned_robot_id: null, rejectedAt: new Date() } },
    { new: true }
  );
}

async function scheduleNext({ requireTaskId = null } = {}) {
  const now = new Date();
  const robot = await getSingleRobot();

  const availability = await ensureRobotIsAvailable(robot);
  if (!availability.ok) return { ok: false, ...availability };

  const pending = await Task.find({ status: "PENDING" }).sort({ createdAt: 1 });

  if (!pending.length) return { ok: true, assigned: false, message: "No pending tasks." };

  let remaining = pending.slice();

  while (remaining.length) {
    const best = pickBestTask(remaining, now);
    if (!best) break;

    const analysis = analyzeFeasibility({ task: best.task, robot, graph: WAREHOUSE_GRAPH });
    if (!analysis.feasible) {
      await rejectPendingTask(best.task, analysis.reason);
      await logEvent("TASK_REJECTED", `Task rejected (id=${String(best.task._id)}): ${analysis.reason}`);
      remaining = remaining.filter((t) => String(t._id) !== String(best.task._id));
      continue;
    }

    const chosenId = String(best.task._id);
    if (requireTaskId && String(requireTaskId) !== chosenId) {
      return {
        ok: false,
        status: 409,
        message: `Fair scheduler would pick task=${chosenId}. Requested task=${String(requireTaskId)} was not selected.`,
        decision: formatDecision(best),
        feasibility: analysis
      };
    }

    const validation = validateTransition(robot.currentState, ROBOT_STATES.ASSIGNED);
    if (!validation.valid) {
      return { ok: false, status: 409, message: validation.message || "Invalid robot transition." };
    }

    const updatedTask = await Task.findOneAndUpdate(
      { _id: best.task._id, status: "PENDING" },
      { $set: { status: "ASSIGNED", assigned_robot_id: robot._id, assignedAt: new Date() } },
      { new: true }
    );

    if (!updatedTask) {
      return { ok: false, status: 409, message: "Task was already taken or no longer pending." };
    }

    await logEvent("TASK_ASSIGNED", `Task assigned (id=${String(updatedTask._id)}) by scheduler.`);

    robot.currentState = ROBOT_STATES.ASSIGNED;
    robot.updatedAt = new Date();
    await robot.save();

    return {
      ok: true,
      assigned: true,
      task: updatedTask,
      robot,
      decision: formatDecision(best),
      feasibility: analysis
    };
  }

  return { ok: true, assigned: false, message: "No feasible pending tasks." };
}

const CHARGE_TRAVEL_SECONDS_PER_UNIT = 4;

/** POST /api/tasks — create a new task (operator/admin) */
router.post("/", roleMiddleware(["operator", "admin"]), async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input.", errors: parsed.error.flatten() });
  }

  const role = req.user?.role;
  const requestedAuto = String(req.query.auto || "true") !== "false";
  // Operators always run auto-scheduling; admins can disable it for manual override demos.
  const shouldAutoSchedule = role === "admin" ? requestedAuto : true;

  try {
    const created = await Task.create({
      pickup_zone: parsed.data.pickup_zone,
      drop_zone: parsed.data.drop_zone,
      weight: parsed.data.weight,
      priority: parsed.data.priority || "MEDIUM",
      status: "PENDING",
      assigned_robot_id: null
    });

    await logEvent(
      "TASK_CREATED",
      `Task created (id=${String(created._id)}) ${created.pickup_zone} -> ${created.drop_zone} (weight=${created.weight}).`
    );

    const robot = await getSingleRobot();
    let feasibility = null;
    if (robot) {
      feasibility = analyzeFeasibility({ task: created, robot, graph: WAREHOUSE_GRAPH });
      if (!feasibility.feasible) {
        await Task.findOneAndUpdate(
          { _id: created._id, status: "PENDING" },
          { $set: { status: "REJECTED", rejection_reason: feasibility.reason, assigned_robot_id: null, rejectedAt: new Date() } },
          { new: true }
        );
        await logEvent("TASK_REJECTED", `Task rejected (id=${String(created._id)}): ${feasibility.reason}`);
      }
    }

    // Optional auto-schedule for demo: if robot is idle, assign the best pending task.
    // We intentionally avoid MongoDB transactions here for compatibility with standalone Mongo.
    let auto = null;
    try {
      if (shouldAutoSchedule) {
        const result = await scheduleNext();
        auto = result.assigned ? result : { assigned: false };
      }
    } catch {
      auto = null;
    }

    const refreshed = await Task.findById(created._id);
    return res.status(201).json({
      task: refreshed ? refreshed.toJSON() : created.toJSON(),
      auto,
      feasibility
    });
  } catch (e) {
    if (e?.name === "ValidationError") {
      return res.status(400).json({ message: e.message || "Validation failed." });
    }
    return res.status(500).json({ message: "Server error." });
  }
});

/** GET /api/tasks — list all tasks */
router.get("/", roleMiddleware(["operator", "admin"]), async (_req, res) => {
  try {
    const tasks = await Task.find({}).sort({ createdAt: 1 });
    return res.json({ tasks: tasks.map((t) => t.toJSON()) });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

/** GET /api/tasks/:id/feasibility — analyze task feasibility */
router.get("/:id/feasibility", roleMiddleware(["operator", "admin"]), async (req, res) => {
  const taskId = req.params.id;
  try {
    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ message: "Task not found." });

    const robot = await getSingleRobot();
    if (!robot) return res.status(404).json({ message: "Robot not initialized." });

    const analysis = analyzeFeasibility({ task, robot, graph: WAREHOUSE_GRAPH });
    return res.json({
      task: task.toJSON(),
      robot: robot.toJSON(),
      analysis,
      persisted_rejection_reason: task.rejection_reason || ""
    });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

/** POST /api/tasks/schedule — manual scheduler trigger: assigns the best PENDING task */
router.post("/schedule", roleMiddleware(["operator", "admin"]), async (_req, res) => {
  try {
    const result = await scheduleNext();

    if (!result.ok) return res.status(result.status || 500).json({ message: result.message, decision: result.decision });

    return res.json({
      assigned: Boolean(result.assigned),
      message: result.message || (result.assigned ? "Assigned." : "No pending tasks."),
      decision: result.decision,
      task: result.task ? result.task.toJSON() : null,
      robot: result.robot ? result.robot.toJSON() : null
    });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

/**
 * PATCH /api/tasks/:id/assign
 * - operator: can only assign if that task is the scheduler's fair choice
 * - admin: can assign any PENDING task (override)
 */
router.patch("/:id/assign", roleMiddleware(["operator", "admin"]), async (req, res) => {
  const role = req.user?.role;
  const taskId = req.params.id;
  try {
    let result;

    if (role === "operator") {
      result = await scheduleNext({ requireTaskId: taskId });
    } else {
      // admin override: assign this task even if not best
      const robot = await getSingleRobot();
      const availability = await ensureRobotIsAvailable(robot);
      if (!availability.ok) {
        result = { ok: false, ...availability };
      } else {
        const task = await Task.findById(taskId);
        if (!task) {
          result = { ok: false, status: 404, message: "Task not found." };
        } else if (task.status !== "PENDING") {
          result = { ok: false, status: 400, message: `Task must be PENDING to assign (status=${task.status}).` };
        } else {
          const analysis = analyzeFeasibility({ task, robot, graph: WAREHOUSE_GRAPH });
          if (!analysis.feasible) {
            const rejected = await rejectPendingTask(task, analysis.reason);
            await logEvent("TASK_REJECTED", `Task rejected (id=${String(task._id)}): ${analysis.reason}`);
            result = {
              ok: false,
              status: 409,
              message: analysis.reason,
              task: rejected ? rejected.toJSON() : null,
              decision: { reason: `Rejected: ${analysis.reason}` },
              feasibility: analysis
            };
          } else {
            const validation = validateTransition(robot.currentState, ROBOT_STATES.ASSIGNED);
            if (!validation.valid) {
              result = { ok: false, status: 409, message: validation.message || "Invalid robot transition." };
            } else {
              const updated = await Task.findOneAndUpdate(
                { _id: task._id, status: "PENDING" },
                { $set: { status: "ASSIGNED", assigned_robot_id: robot._id, assignedAt: new Date() } },
                { new: true }
              );
              if (!updated) {
                result = { ok: false, status: 409, message: "Task was already taken or no longer pending." };
              } else {
                await logEvent("TASK_ASSIGNED", `Task assigned (id=${String(updated._id)}) by admin override.`);
                robot.currentState = ROBOT_STATES.ASSIGNED;
                robot.updatedAt = new Date();
                await robot.save();
                result = {
                  ok: true,
                  assigned: true,
                  task: updated,
                  robot,
                  decision: {
                    task_id: String(updated._id),
                    base_priority: null,
                    waiting_minutes: null,
                    effective_priority: null,
                    reason: "Admin override assignment"
                  },
                  feasibility: analysis
                };
              }
            }
          }
        }
      }
    }

    if (!result.ok) return res.status(result.status || 500).json({ message: result.message, decision: result.decision });

    return res.json({
      assigned: Boolean(result.assigned),
      decision: result.decision,
      task: result.task ? result.task.toJSON() : null,
      robot: result.robot ? result.robot.toJSON() : null
    });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

/**
 * PATCH /api/tasks/:id/override
 * Admin-only: swap the currently ASSIGNED (not started) task for the active robot
 * with another PENDING task. Robot remains in ASSIGNED state.
 */
router.patch("/:id/override", roleMiddleware(["admin"]), async (req, res) => {
  const toTaskId = req.params.id;

  try {
    const robot = await getSingleRobot();
    if (!robot) return res.status(404).json({ message: "Robot not initialized." });

    if (robot.currentState !== ROBOT_STATES.ASSIGNED) {
      return res.status(409).json({ message: `Robot must be ASSIGNED to override (state=${robot.currentState}).` });
    }

    const current = await Task.findOne({ assigned_robot_id: robot._id, status: "ASSIGNED" }).sort({ createdAt: 1 });
    if (!current) {
      return res.status(404).json({ message: "No currently ASSIGNED task to override." });
    }

    if (String(current._id) === String(toTaskId)) {
      return res.json({
        swapped: false,
        decision: { reason: "Requested task is already assigned" },
        from_task: current.toJSON(),
        to_task: current.toJSON(),
        robot: robot.toJSON()
      });
    }

    const target = await Task.findById(toTaskId);
    if (!target) return res.status(404).json({ message: "Target task not found." });
    if (target.status !== "PENDING") {
      return res.status(400).json({ message: `Target task must be PENDING to override (status=${target.status}).` });
    }

    const analysis = analyzeFeasibility({ task: target, robot, graph: WAREHOUSE_GRAPH });
    if (!analysis.feasible) {
      const rejected = await rejectPendingTask(target, analysis.reason);
      await logEvent("TASK_REJECTED", `Task rejected (id=${String(target._id)}): ${analysis.reason}`);
      return res.status(409).json({
        message: analysis.reason,
        decision: { reason: `Rejected: ${analysis.reason}` },
        task: rejected ? rejected.toJSON() : null,
        feasibility: analysis
      });
    }

    // 1) Unassign current (best-effort, guarded)
    const unassigned = await Task.findOneAndUpdate(
      { _id: current._id, status: "ASSIGNED", assigned_robot_id: robot._id },
      { $set: { status: "PENDING", assigned_robot_id: null } },
      { new: true }
    );
    if (!unassigned) {
      return res.status(409).json({ message: "Current assigned task changed; cannot override." });
    }

    // 2) Assign target
    const assigned = await Task.findOneAndUpdate(
      { _id: target._id, status: "PENDING" },
      { $set: { status: "ASSIGNED", assigned_robot_id: robot._id, assignedAt: new Date() } },
      { new: true }
    );

    if (!assigned) {
      // rollback: try to put back the previous task
      await Task.findOneAndUpdate(
        { _id: current._id, status: "PENDING", assigned_robot_id: null },
        { $set: { status: "ASSIGNED", assigned_robot_id: robot._id } }
      );
      return res.status(409).json({ message: "Target task is no longer pending; override cancelled." });
    }

    robot.updatedAt = new Date();
    await robot.save();

    await logEvent("TASK_ASSIGNED", `Task assigned (id=${String(assigned._id)}) by admin swap override.`);

    return res.json({
      swapped: true,
      decision: { reason: `Admin override swapped assignment from ${String(current._id)} to ${String(assigned._id)}` },
      from_task: unassigned.toJSON(),
      to_task: assigned.toJSON(),
      robot: robot.toJSON(),
      feasibility: analysis
    });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

/** PATCH /api/tasks/:id/start — task ASSIGNED -> IN_PROGRESS; robot ASSIGNED -> MOVING */
router.patch("/:id/start", roleMiddleware(["operator", "admin"]), async (req, res) => {
  const taskId = req.params.id;

  try {
    const robot = await getSingleRobot();
    if (!robot) return res.status(404).json({ message: "Robot not initialized." });

    const validation = validateTransition(robot.currentState, ROBOT_STATES.MOVING);
    if (!validation.valid) {
      return res.status(409).json({ message: validation.message || "Invalid robot transition." });
    }

    const updatedTask = await Task.findOneAndUpdate(
      { _id: taskId, status: "ASSIGNED", assigned_robot_id: robot._id },
      { $set: { status: "IN_PROGRESS", startedAt: new Date() } },
      { new: true }
    );

    if (!updatedTask) {
      return res.status(409).json({ message: "Task not found or not ASSIGNED to the active robot." });
    }

    robot.currentState = ROBOT_STATES.MOVING;
    robot.updatedAt = new Date();
    await robot.save();

    await logEvent("TASK_STARTED", `Task started (id=${String(updatedTask._id)}).`);

    return res.json({ task: updatedTask.toJSON(), robot: robot.toJSON() });
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message || "Server error." });
  }
});

/** PATCH /api/tasks/:id/complete — task IN_PROGRESS -> COMPLETED; robot MOVING -> IDLE */
router.patch("/:id/complete", roleMiddleware(["operator", "admin"]), async (req, res) => {
  const taskId = req.params.id;
  const role = req.user?.role;
  const requestedAuto = String(req.query.auto || "true") !== "false";
  // Operators always auto-schedule; admins may disable for manual override.
  const autoSchedule = role === "admin" ? requestedAuto : true;
  try {
    const robot = await getSingleRobot();
    if (!robot) return res.status(404).json({ message: "Robot not initialized." });

    const validation = validateTransition(robot.currentState, ROBOT_STATES.IDLE);
    if (!validation.valid) {
      return res.status(409).json({ message: validation.message || "Invalid robot transition." });
    }

    const updatedTask = await Task.findOneAndUpdate(
      { _id: taskId, status: "IN_PROGRESS", assigned_robot_id: robot._id },
      { $set: { status: "COMPLETED", completedAt: new Date() } },
      { new: true }
    );

    if (!updatedTask) {
      return res.status(409).json({ message: "Task not found or not IN_PROGRESS on the active robot." });
    }

    const drainAnalysis = analyzeFeasibility({ task: updatedTask, robot, graph: WAREHOUSE_GRAPH });
    const drain = drainAnalysis?.details?.requiredBattery;
    if (typeof drain === "number" && Number.isFinite(drain)) {
      robot.batteryLevel = Math.max(0, Number(robot.batteryLevel ?? 0) - drain);
    }

    let next = null;
    robot.currentState = ROBOT_STATES.IDLE;
    robot.location = updatedTask?.drop_zone || robot.location || "ZONE_CHARGE";
    robot.updatedAt = new Date();
    await robot.save();

    await logEvent("TASK_COMPLETED", `Task completed (id=${String(updatedTask._id)}).`);

    if (autoSchedule) {
      const scheduled = await scheduleNext();
      if (scheduled?.ok && scheduled?.assigned) {
        next = {
          decision: scheduled.decision,
          task: scheduled.task.toJSON(),
          robot: scheduled.robot.toJSON()
        };
      } else {
        const shouldGoCharge = Number(robot.batteryLevel ?? 0) <= 20 || !scheduled?.assigned;
        if (shouldGoCharge) {
          const chargePath = getShortestPath(WAREHOUSE_GRAPH, robot.location || "ZONE_CHARGE", "ZONE_CHARGE");
          const chargeDistance = chargePath?.distance || 0;
          const chargeDrain = chargeDistance * BATTERY_PER_UNIT;
          if (Number.isFinite(chargeDrain) && chargeDrain > 0) {
            robot.batteryLevel = Math.max(0, Number(robot.batteryLevel ?? 0) - chargeDrain);
          }
          robot.location = "ZONE_CHARGE";
          if (chargeDistance > 0) {
            robot.chargingUntil = new Date(Date.now() + chargeDistance * CHARGE_TRAVEL_SECONDS_PER_UNIT * 1000);
          } else {
            robot.chargingUntil = null;
          }
          robot.updatedAt = new Date();
          await robot.save();
          await logEvent(
            "ROBOT_CHARGING_TRIP",
            `Robot sent to charge after completion (distance=${chargeDistance}).`
          );
        }
      }
    } else {
      const shouldGoCharge = Number(robot.batteryLevel ?? 0) <= 20;
      if (shouldGoCharge) {
        const chargePath = getShortestPath(WAREHOUSE_GRAPH, robot.location || "ZONE_CHARGE", "ZONE_CHARGE");
        const chargeDistance = chargePath?.distance || 0;
        const chargeDrain = chargeDistance * BATTERY_PER_UNIT;
        if (Number.isFinite(chargeDrain) && chargeDrain > 0) {
          robot.batteryLevel = Math.max(0, Number(robot.batteryLevel ?? 0) - chargeDrain);
        }
        robot.location = "ZONE_CHARGE";
        if (chargeDistance > 0) {
          robot.chargingUntil = new Date(Date.now() + chargeDistance * CHARGE_TRAVEL_SECONDS_PER_UNIT * 1000);
        } else {
          robot.chargingUntil = null;
        }
        robot.updatedAt = new Date();
        await robot.save();
        await logEvent(
          "ROBOT_CHARGING_TRIP",
          `Robot sent to charge after completion (distance=${chargeDistance}).`
        );
      }
    }

    return res.json({ task: updatedTask.toJSON(), robot: robot.toJSON(), next });
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message || "Server error." });
  }
});

export default router;
