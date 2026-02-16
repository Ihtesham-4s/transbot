import express from "express";
import { z } from "zod";

import { authMiddleware } from "../middleware/authMiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { Robot } from "../models/Robot.js";
import { Task } from "../models/Task.js";
import { Zone } from "../models/Zone.js";
import { ROBOT_STATES, validateTransition } from "../constants/robotStates.js";
import { pickBestTask } from "../utils/scheduler.js";
import { analyzeFeasibility, analyzeFeasibilityWithReserve, BATTERY_PER_UNIT } from "../utils/feasibility.js";
import { WAREHOUSE_GRAPH, getShortestPath } from "../utils/warehouseGraph.js";
import { logEvent } from "../utils/logger.js";

const router = express.Router();

router.use(authMiddleware);

const BATTERY_RETURN_BLOCK_CODE = "INSUFFICIENT_BATTERY_RETURN";
const LEGACY_BATTERY_BLOCK_CODES = Object.freeze(["INSUFFICIENT_BATTERY", "BATTERY"]);
const BATTERY_REJECTION_MESSAGE = "Insufficient battery to complete task and reach charging dock.";

const createTaskSchema = z.object({
  pickup_zone: z.string().min(1).max(80),
  drop_zone: z.string().min(1).max(80),
  weight: z.coerce.number().min(0),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional()
});

const planSchema = z.object({
  text: z.string().min(1).max(500)
});

const TASK_ZONE_POPULATE = "pickup_zone_id drop_zone_id";

async function getZoneByCode(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return null;
  return Zone.findOne({ code: normalized, active: true });
}

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
  // Populate zone so robot.location virtual resolves to a ZONE_* code.
  return Robot.findOne({}).sort({ createdAt: 1 }).populate("location_zone_id");
}

function parseMissionText(text) {
  const raw = String(text || "");
  const lower = raw.toLowerCase();

  const wordToNumber = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10
  };

  const deliveries = [];
  // Supports: "deliver four items from zone a to zone b, then one item from zone b to zone e"
  // Also supports: "2 items from zone e to zone b with low priority and weight 3"
  const deliveryRegex =
    /(deliver|then)?\s*(?<qty>one|two|three|four|five|six|seven|eight|nine|ten|\d+)?\s*(?:item|items)?[^a-z0-9]+from\s*zone\s*(?<from>[a-e])[^a-z0-9]+to\s*zone\s*(?<to>[a-e])(?<rest>[^,.;]*)/g;

  let match;
  while ((match = deliveryRegex.exec(lower))) {
    const qtyRaw = match.groups?.qty || "";
    const qtyNumber = wordToNumber[qtyRaw] ?? (qtyRaw ? parseInt(qtyRaw, 10) : NaN);
    const quantity = Number.isFinite(qtyNumber) && qtyNumber > 0 ? qtyNumber : 1;

    const from = match.groups?.from ? `ZONE_${match.groups.from.toUpperCase()}` : null;
    const to = match.groups?.to ? `ZONE_${match.groups.to.toUpperCase()}` : null;
    const rest = match.groups?.rest || "";

    const priorityMatch = rest.match(/(?:priority\s*(high|medium|low)|(high|medium|low)\s*priority)/);
    const clausePriority = priorityMatch ? (priorityMatch[1] || priorityMatch[2] || "").toUpperCase() : null;

    const weightMatch = rest.match(/weight\s*(\d+(?:\.\d+)?)/) || rest.match(/(\d+(?:\.\d+)?)\s*(kg|kilogram|kilo)/);
    const clauseWeight = weightMatch ? Number(weightMatch[1]) : null;

    if (from && to) {
      deliveries.push({ pickup_zone: from, drop_zone: to, quantity, priority: clausePriority, weight: clauseWeight });
    }
  }

  const zones = [];
  const zoneMatches = [...lower.matchAll(/zone\s*([a-e])/g)];
  zoneMatches.forEach((m) => {
    const z = m[1]?.toUpperCase();
    if (z) zones.push(`ZONE_${z}`);
  });

  const from = deliveries[0]?.pickup_zone || zones[0] || null;
  const to = deliveries[0]?.drop_zone || zones[1] || null;

  const qtyMatch = lower.match(/(\d+)\s*(task|item|job)/);
  const quantity = qtyMatch ? Math.max(1, parseInt(qtyMatch[1], 10)) : 1;

  const weightMatch = lower.match(/weight\s*(\d+(?:\.\d+)?)(?:\s*(kg|kilogram|kilo))?/) ||
    lower.match(/(\d+(?:\.\d+)?)\s*(kg|kilogram|kilo)/);
  const weight = weightMatch ? Number(weightMatch[1]) : 1;

  const priority = lower.includes("high") ? "HIGH" : lower.includes("low") ? "LOW" : "MEDIUM";
  const wantsCharge = /charge|charging|dock/.test(lower);

  return {
    text: raw,
    zones,
    from,
    to,
    quantity,
    weight,
    priority,
    wantsCharge,
    deliveries
  };
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

async function rejectForBatteryReserve(task, reason) {
  if (!task?._id) return null;
  const message = reason || BATTERY_REJECTION_MESSAGE;
  return Task.findOneAndUpdate(
    { _id: task._id, status: { $in: ["PENDING", "REJECTED"] } },
    {
      $set: {
        status: "REJECTED",
        rejection_reason: message,
        blocked_reason: BATTERY_RETURN_BLOCK_CODE,
        retry_after: null,
        assigned_robot_id: null,
        rejectedAt: new Date()
      }
    },
    { new: true }
  );
}

async function recoverBatteryLimitedTasks(robot) {
  if (!robot) return { revived: 0 };

  // Per simulation rules: tasks previously rejected due to insufficient battery
  // should only be reconsidered once the robot is fully charged.
  const batteryNow = Number(robot.batteryLevel ?? 0);
  if (!Number.isFinite(batteryNow) || batteryNow < 100) {
    return { revived: 0 };
  }

  const candidates = await Task.find({
    status: { $in: ["REJECTED", "PENDING"] },
    blocked_reason: { $in: [BATTERY_RETURN_BLOCK_CODE, ...LEGACY_BATTERY_BLOCK_CODES] }
  })
    .sort({ createdAt: 1 })
    .populate(TASK_ZONE_POPULATE);

  let revived = 0;

  for (const task of candidates) {
    const analysis = analyzeFeasibilityWithReserve({ task, robot, graph: WAREHOUSE_GRAPH });

    if (analysis.feasible) {
      const updated = await Task.findOneAndUpdate(
        { _id: task._id },
        {
          $set: {
            status: "PENDING",
            blocked_reason: "",
            retry_after: null,
            rejection_reason: "",
            rejectedAt: null,
            assigned_robot_id: null
          }
        },
        { new: true }
      );

      if (updated) revived += 1;
    } else if (task.status === "PENDING") {
      await rejectForBatteryReserve(task, analysis.reason || BATTERY_REJECTION_MESSAGE);
    }
  }

  if (revived > 0) {
    await logEvent("TASK_REQUEUED_BATTERY", `Recovered ${revived} battery-limited task(s) after recharge.`);
  }

  return { revived };
}

function isBatteryReason(reason) {
  return typeof reason === "string" && reason.toLowerCase().includes("battery");
}

export async function scheduleNext({ requireTaskId = null } = {}) {
  const now = new Date();
  const robot = await getSingleRobot();

  const availability = await ensureRobotIsAvailable(robot);
  if (!availability.ok) return { ok: false, ...availability };

  await recoverBatteryLimitedTasks(robot);

  const pending = await Task.find({ status: "PENDING" }).sort({ createdAt: 1 }).populate(TASK_ZONE_POPULATE);

  if (!pending.length) return { ok: true, assigned: false, message: "No pending tasks." };

  let remaining = pending.slice();

  while (remaining.length) {
    const best = pickBestTask(remaining, now);
    if (!best) break;

    // Require enough battery to finish task AND return to dock.
    const analysis = analyzeFeasibilityWithReserve({ task: best.task, robot, graph: WAREHOUSE_GRAPH });
    if (!analysis.feasible) {
      if (isBatteryReason(analysis.reason)) {
        await rejectForBatteryReserve(best.task, analysis.reason || BATTERY_REJECTION_MESSAGE);
        await logEvent(
          "TASK_REJECTED_BATTERY",
          `Task rejected (id=${String(best.task._id)}) until recharge: ${analysis.reason || BATTERY_REJECTION_MESSAGE}`
        );
      } else {
        await rejectPendingTask(best.task, analysis.reason);
        await logEvent("TASK_REJECTED", `Task rejected (id=${String(best.task._id)}): ${analysis.reason}`);
      }
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
      { $set: { status: "ASSIGNED", assigned_robot_id: robot._id, assignedAt: new Date(), blocked_reason: "", retry_after: null } },
      { new: true }
    );

    if (!updatedTask) {
      return { ok: false, status: 409, message: "Task was already taken or no longer pending." };
    }

    await updatedTask.populate(TASK_ZONE_POPULATE);

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

const CHARGE_TRAVEL_SECONDS_PER_UNIT = 2;

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

    const created = await Task.create({
      pickup_zone_id: pickupZone._id,
      drop_zone_id: dropZone._id,
      weight: parsed.data.weight,
      priority: parsed.data.priority || "MEDIUM",
      status: "PENDING",
      assigned_robot_id: null
    });

    await created.populate(TASK_ZONE_POPULATE);

    await logEvent(
      "TASK_CREATED",
      `Task created (id=${String(created._id)}) ${created.pickup_zone} -> ${created.drop_zone} (weight=${created.weight}).`
    );

    const robot = await getSingleRobot();
    let feasibility = null;
    if (robot) {
      feasibility = analyzeFeasibilityWithReserve({ task: created, robot, graph: WAREHOUSE_GRAPH });
      if (!feasibility.feasible) {
        if (isBatteryReason(feasibility.reason)) {
          await rejectForBatteryReserve(created, feasibility.reason || BATTERY_REJECTION_MESSAGE);
          await logEvent(
            "TASK_REJECTED_BATTERY",
            `Task rejected (id=${String(created._id)}) until recharge (reserve): ${feasibility.reason || BATTERY_REJECTION_MESSAGE}`
          );
        } else {
          await Task.findOneAndUpdate(
            { _id: created._id, status: "PENDING" },
            { $set: { status: "REJECTED", rejection_reason: feasibility.reason, assigned_robot_id: null, rejectedAt: new Date() } },
            { new: true }
          );
          await logEvent("TASK_REJECTED", `Task rejected (id=${String(created._id)}): ${feasibility.reason}`);
        }
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

    const refreshed = await Task.findById(created._id).populate(TASK_ZONE_POPULATE);
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
    const tasks = await Task.find({}).sort({ createdAt: 1 }).populate(TASK_ZONE_POPULATE);
    return res.json({ tasks: tasks.map((t) => t.toJSON()) });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

/** GET /api/tasks/:id/feasibility — analyze task feasibility */
router.get("/:id/feasibility", roleMiddleware(["operator", "admin"]), async (req, res) => {
  const taskId = req.params.id;
  try {
    const task = await Task.findById(taskId).populate(TASK_ZONE_POPULATE);
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

/** POST /api/tasks/plan — mission planner (rule-based NL -> multi-step plan) */
router.post("/plan", roleMiddleware(["operator", "admin"]), async (req, res) => {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input.", errors: parsed.error.flatten() });
  }

  try {
    const robot = await getSingleRobot();
    if (!robot) return res.status(404).json({ message: "Robot not initialized." });

    const inputs = parseMissionText(parsed.data.text);
    const { zones, from, to, quantity, weight, priority, wantsCharge, deliveries } = inputs;

    let tasks = [];

    if (deliveries?.length) {
      deliveries.forEach((d) => {
        const qty = d.quantity || 1;
        const clausePriority = d.priority || priority;
        const clauseWeight = Number.isFinite(d.weight) ? d.weight : weight;
        for (let i = 0; i < qty; i += 1) {
          tasks.push({ pickup_zone: d.pickup_zone, drop_zone: d.drop_zone, weight: clauseWeight, priority: clausePriority });
        }
      });
    } else if (from && to) {
      tasks = Array.from({ length: quantity }).map(() => ({ pickup_zone: from, drop_zone: to, weight, priority }));
    } else if (zones.length >= 2) {
      tasks = zones.slice(0, zones.length - 1).map((z, i) => ({ pickup_zone: z, drop_zone: zones[i + 1], weight, priority }));
    } else {
      return res.status(400).json({
        message: "Could not infer zones. Try: 'Deliver 3 items from Zone B to Zone E'.",
        inputs
      });
    }

    let cursor = robot.location || "ZONE_CHARGE";
    let remainingBattery = Number(robot.batteryLevel ?? 0);
    let totalDistance = 0;
    let totalRequiredBattery = 0;
    const warnings = [];

    const enrichedTasks = tasks.map((t, index) => {
      const toPickup = getShortestPath(WAREHOUSE_GRAPH, cursor, t.pickup_zone);
      const toDrop = getShortestPath(WAREHOUSE_GRAPH, t.pickup_zone, t.drop_zone);
      const distance = (toPickup?.distance ?? 0) + (toDrop?.distance ?? 0);
      const requiredBattery = distance * BATTERY_PER_UNIT;
      const feasible = Number.isFinite(requiredBattery) && remainingBattery >= requiredBattery;

      if (!feasible) {
        warnings.push(`Task ${index + 1} may be infeasible: battery ${remainingBattery} < ${requiredBattery}.`);
      } else {
        remainingBattery -= requiredBattery;
      }

      totalDistance += distance;
      totalRequiredBattery += requiredBattery;
      cursor = t.drop_zone;

      return {
        ...t,
        estimated_distance: distance,
        required_battery: requiredBattery,
        feasible
      };
    });

    const actions = wantsCharge ? ["GO_CHARGE"] : [];

    await logEvent("MISSION_PLANNED", `Mission plan generated (steps=${enrichedTasks.length}).`);

    return res.json({
      inputs,
      plan: {
        tasks: enrichedTasks,
        actions
      },
      summary: {
        total_distance: totalDistance,
        total_required_battery: totalRequiredBattery,
        feasible: enrichedTasks.every((t) => t.feasible)
      },
      warnings
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
          await task.populate(TASK_ZONE_POPULATE);
          // Require enough battery to finish task AND return to dock.
          const analysis = analyzeFeasibilityWithReserve({ task, robot, graph: WAREHOUSE_GRAPH });
          if (!analysis.feasible) {
            if (isBatteryReason(analysis.reason)) {
              const rejected = await rejectForBatteryReserve(task, analysis.reason || BATTERY_REJECTION_MESSAGE);
              await logEvent(
                "TASK_REJECTED_BATTERY",
                `Task rejected (id=${String(task._id)}) until recharge: ${analysis.reason || BATTERY_REJECTION_MESSAGE}`
              );
              result = {
                ok: false,
                status: 409,
                message: analysis.reason,
                task: rejected ? rejected.toJSON() : null,
                decision: { reason: `Rejected: ${analysis.reason}` },
                feasibility: analysis
              };
            } else {
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
            }
          } else {
            const validation = validateTransition(robot.currentState, ROBOT_STATES.ASSIGNED);
            if (!validation.valid) {
              result = { ok: false, status: 409, message: validation.message || "Invalid robot transition." };
            } else {
              const updated = await Task.findOneAndUpdate(
                { _id: task._id, status: "PENDING" },
                { $set: { status: "ASSIGNED", assigned_robot_id: robot._id, assignedAt: new Date(), blocked_reason: "", retry_after: null } },
                { new: true }
              );
              if (!updated) {
                result = { ok: false, status: 409, message: "Task was already taken or no longer pending." };
              } else {
                await updated.populate(TASK_ZONE_POPULATE);
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

    const current = await Task.findOne({ assigned_robot_id: robot._id, status: "ASSIGNED" })
      .sort({ createdAt: 1 })
      .populate(TASK_ZONE_POPULATE);
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

    const target = await Task.findById(toTaskId).populate(TASK_ZONE_POPULATE);
    if (!target) return res.status(404).json({ message: "Target task not found." });
    if (target.status !== "PENDING") {
      return res.status(400).json({ message: `Target task must be PENDING to override (status=${target.status}).` });
    }

    // Require enough battery to finish task AND return to dock.
    const analysis = analyzeFeasibilityWithReserve({ task: target, robot, graph: WAREHOUSE_GRAPH });
    if (!analysis.feasible) {
      if (isBatteryReason(analysis.reason)) {
        const rejected = await rejectForBatteryReserve(target, analysis.reason || BATTERY_REJECTION_MESSAGE);
        await logEvent(
          "TASK_REJECTED_BATTERY",
          `Task rejected (id=${String(target._id)}) until recharge: ${analysis.reason || BATTERY_REJECTION_MESSAGE}`
        );
        return res.status(409).json({
          message: analysis.reason,
          decision: { reason: `Rejected: ${analysis.reason}` },
          task: rejected ? rejected.toJSON() : null,
          feasibility: analysis
        });
      }

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
    await unassigned.populate(TASK_ZONE_POPULATE);

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

    await assigned.populate(TASK_ZONE_POPULATE);

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

    const existing = await Task.findById(taskId).populate(TASK_ZONE_POPULATE);
    if (!existing) return res.status(404).json({ message: "Task not found." });

    // Idempotent start/resume: if the task is already IN_PROGRESS for this robot,
    // ensure the robot state is MOVING so the simulation can proceed.
    if (existing.status === "IN_PROGRESS") {
      if (existing.assigned_robot_id && String(existing.assigned_robot_id) !== String(robot._id)) {
        return res.status(409).json({ message: "Task is in progress on a different robot." });
      }
      if (robot.currentState === ROBOT_STATES.ERROR) {
        return res.status(409).json({ message: "Robot is in ERROR state." });
      }
      if (robot.currentState !== ROBOT_STATES.MOVING) {
        robot.currentState = ROBOT_STATES.MOVING;
        robot.updatedAt = new Date();
        await robot.save();
        await robot.populate("location_zone_id");
      }

      return res.json({ task: existing.toJSON(), robot: robot.toJSON() });
    }

    // Self-heal: if the task is ASSIGNED to the robot but the robot drifted to IDLE,
    // move it back to ASSIGNED first (IDLE -> ASSIGNED is a valid transition).
    if (robot.currentState === ROBOT_STATES.IDLE && existing.status === "ASSIGNED") {
      const toAssigned = validateTransition(robot.currentState, ROBOT_STATES.ASSIGNED);
      if (toAssigned.valid) {
        robot.currentState = ROBOT_STATES.ASSIGNED;
        robot.updatedAt = new Date();
        await robot.save();
      }
    }

    const validation = validateTransition(robot.currentState, ROBOT_STATES.MOVING);
    if (!validation.valid) {
      return res.status(409).json({ message: validation.message || "Invalid robot transition." });
    }

    const updatedTask = await Task.findOneAndUpdate(
      { _id: taskId, status: "ASSIGNED", assigned_robot_id: robot._id },
      { $set: { status: "IN_PROGRESS", startedAt: new Date(), blocked_reason: "", retry_after: null } },
      { new: true }
    );

    if (!updatedTask) {
      return res.status(409).json({ message: "Task not found or not ASSIGNED to the active robot." });
    }

    robot.currentState = ROBOT_STATES.MOVING;
    robot.updatedAt = new Date();
    await robot.save();

    await logEvent("TASK_STARTED", `Task started (id=${String(updatedTask._id)}).`);

    await updatedTask.populate(TASK_ZONE_POPULATE);
    await robot.populate("location_zone_id");

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

    const existing = await Task.findById(taskId).populate(TASK_ZONE_POPULATE);
    if (!existing) return res.status(404).json({ message: "Task not found." });
    if (existing.status === "COMPLETED") {
      await robot.populate("location_zone_id");
      return res.json({ task: existing.toJSON(), robot: robot.toJSON(), next: null });
    }

    if (robot.currentState === ROBOT_STATES.ERROR) {
      return res.status(409).json({ message: "Robot is in ERROR state." });
    }

    // Self-heal: allow completion even if the robot state drifted.
    // We only require the task to be IN_PROGRESS on the active robot.
    if (existing.status === "IN_PROGRESS" && existing.assigned_robot_id && String(existing.assigned_robot_id) === String(robot._id)) {
      if (robot.currentState === ROBOT_STATES.ASSIGNED || robot.currentState === ROBOT_STATES.PAUSED) {
        const toMoving = validateTransition(robot.currentState, ROBOT_STATES.MOVING);
        if (toMoving.valid) {
          robot.currentState = ROBOT_STATES.MOVING;
          robot.updatedAt = new Date();
          await robot.save();
        }
      }
    }

    // If the robot is already IDLE (drifted), allow completion as a repair.
    if (robot.currentState !== ROBOT_STATES.IDLE) {
      const validation = validateTransition(robot.currentState, ROBOT_STATES.IDLE);
      if (!validation.valid) {
        return res.status(409).json({ message: validation.message || "Invalid robot transition." });
      }
    }

    const updatedTask = await Task.findOneAndUpdate(
      { _id: taskId, status: "IN_PROGRESS", assigned_robot_id: robot._id },
      { $set: { status: "COMPLETED", completedAt: new Date(), blocked_reason: "", retry_after: null } },
      { new: true }
    );

    if (!updatedTask) {
      return res.status(409).json({ message: "Task not found or not IN_PROGRESS on the active robot." });
    }

    await updatedTask.populate(TASK_ZONE_POPULATE);

    const drainAnalysis = analyzeFeasibility({ task: updatedTask, robot, graph: WAREHOUSE_GRAPH });
    const drain = drainAnalysis?.details?.requiredBattery;
    if (typeof drain === "number" && Number.isFinite(drain)) {
      robot.batteryLevel = Math.max(0, Number(robot.batteryLevel ?? 0) - drain);
    }

    let next = null;
    robot.currentState = ROBOT_STATES.IDLE;

    const dropZoneId = updatedTask?.drop_zone_id?._id || updatedTask?.drop_zone_id || null;
    if (dropZoneId) robot.location_zone_id = dropZoneId;
    robot.updatedAt = new Date();
    await robot.save();
    await robot.populate("location_zone_id");

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
          // Start a real charge trip. Do NOT teleport to the dock and do NOT
          // drain the full return-to-dock energy up-front; the charging loop
          // applies travel drain once the robot arrives.
          if (chargeDistance > 0) {
            const requiredToDock = chargeDistance * BATTERY_PER_UNIT;
            if (Number(robot.batteryLevel ?? 0) < requiredToDock) {
              robot.chargingUntil = null;
              robot.currentState = ROBOT_STATES.ERROR;
              await logEvent(
                "ROBOT_ERROR",
                `Robot cannot reach charging dock after completion (battery=${Number(robot.batteryLevel ?? 0)} required=${requiredToDock}).`
              );
            } else {
              robot.chargingUntil = new Date(Date.now() + chargeDistance * CHARGE_TRAVEL_SECONDS_PER_UNIT * 1000);
            }
          } else {
            robot.chargingUntil = null;
          }
          robot.updatedAt = new Date();
          await robot.save();
          await robot.populate("location_zone_id");
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
        // Manual mode: same real charge trip behavior (no teleport, no up-front drain).
        if (chargeDistance > 0) {
          const requiredToDock = chargeDistance * BATTERY_PER_UNIT;
          if (Number(robot.batteryLevel ?? 0) < requiredToDock) {
            robot.chargingUntil = null;
            robot.currentState = ROBOT_STATES.ERROR;
            await logEvent(
              "ROBOT_ERROR",
              `Robot cannot reach charging dock after completion (battery=${Number(robot.batteryLevel ?? 0)} required=${requiredToDock}).`
            );
          } else {
            robot.chargingUntil = new Date(Date.now() + chargeDistance * CHARGE_TRAVEL_SECONDS_PER_UNIT * 1000);
          }
        } else {
          robot.chargingUntil = null;
        }
        robot.updatedAt = new Date();
        await robot.save();
        await robot.populate("location_zone_id");
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
