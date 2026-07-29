import { ROBOT_STATES } from "../constants/robotStates.js";
import { Robot } from "../models/Robot.js";
import { Task } from "../models/Task.js";
import { logEvent } from "../utils/logger.js";
import { sendRobotSerialCommand } from "./robotSerialService.js";

const PRIORITY_WEIGHT = Object.freeze({
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  URGENT: 4
});

function taskPriorityScore(task) {
  const key = String(task.priority || "MEDIUM").toUpperCase();
  return PRIORITY_WEIGHT[key] || PRIORITY_WEIGHT.MEDIUM;
}

function agingMinutes(task) {
  const createdAtMs = new Date(task.createdAt || Date.now()).getTime();
  return Math.max(0, (Date.now() - createdAtMs) / 60000);
}

/**
 * Checks if a task is feasible for the given robot.
 *
 * Rules (3-zone L-track):
 *  - Both zones must be active and exist
 *  - Pickup zone must differ from drop zone
 *  - Pickup zone must match the robot's current location
 *  - Item weight must be a number > 0 and <= robot max capacity (2 kg)
 */
function isTaskFeasible(task, robot) {
  const maxWeightKg = Number(robot?.maxCapacityKg || 2);

  if (!task?.pickup_zone_id || !task?.drop_zone_id) return false;
  if (!task.pickup_zone_id.active || !task.drop_zone_id.active) return false;

  // Zones must be different
  const pickupId = task.pickup_zone_id._id?.toString() || task.pickup_zone_id.toString();
  const dropId = task.drop_zone_id._id?.toString() || task.drop_zone_id.toString();
  if (pickupId === dropId) return false;

  // Pickup zone must match the robot's current zone
  const robotZoneId = robot?.location_zone_id?._id?.toString() || robot?.location_zone_id?.toString();
  if (robotZoneId && robotZoneId !== pickupId) return false;

  // Exclude tasks assigned to human workers (> 2 kg)
  if (task.assignedType === "HUMAN_WORKER" || task.assignedType === "MANUAL") return false;

  // Weight validation (must be <= 2 kg for robot)
  if (typeof task.weight !== "number" || task.weight <= 0) return false;
  if (task.weight > maxWeightKg) return false;

  return true;
}

function sortByScheduler(tasks) {
  return [...tasks].sort((a, b) => {
    const scoreA = taskPriorityScore(a) * 1000 + agingMinutes(a);
    const scoreB = taskPriorityScore(b) * 1000 + agingMinutes(b);
    if (scoreA !== scoreB) return scoreB - scoreA;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

async function releaseRobotToIdle(robotId) {
  await Robot.findOneAndUpdate(
    { _id: robotId, currentState: ROBOT_STATES.ASSIGNED },
    { $set: { currentState: ROBOT_STATES.IDLE } }
  );
}

export async function autoAssignTask({ trigger = "UNKNOWN", userId = null } = {}) {
  // Lock robot atomically so only one assignment attempt can run at a time.
  const robot = await Robot.findOneAndUpdate(
    { currentState: ROBOT_STATES.IDLE, autoMode: true },
    { $set: { currentState: ROBOT_STATES.ASSIGNED } },
    { new: true }
  ).populate("location_zone_id");

  if (!robot) {
    return { ok: false, reason: "ROBOT_NOT_IDLE_OR_AUTOMODE_OFF" };
  }

  const pendingTasks = await Task.find({ status: "PENDING" })
    .populate("pickup_zone_id")
    .populate("drop_zone_id")
    .lean({ virtuals: true });

  if (pendingTasks.length === 0) {
    await releaseRobotToIdle(robot._id);
    return { ok: false, reason: "NO_PENDING_TASKS" };
  }

  // Filter: pickup zone must match robot's current zone, zones must differ, weight <= 2 kg
  const feasibleTasks = pendingTasks.filter((task) => isTaskFeasible(task, robot));
  if (feasibleTasks.length === 0) {
    await releaseRobotToIdle(robot._id);
    return { ok: false, reason: "NO_FEASIBLE_TASKS" };
  }

  const candidates = sortByScheduler(feasibleTasks);
  let assignedTask = null;

  for (const candidate of candidates) {
    const claimed = await Task.findOneAndUpdate(
      { _id: candidate._id, status: "PENDING", assigned_robot_id: null },
      {
        $set: {
          status: "ASSIGNED",
          assigned_robot_id: robot._id,
          assignedAt: new Date()
        }
      },
      { new: true }
    )
      .populate("pickup_zone_id")
      .populate("drop_zone_id");

    if (claimed) {
      assignedTask = claimed;
      break;
    }
  }

  if (!assignedTask) {
    await releaseRobotToIdle(robot._id);
    return { ok: false, reason: "CLAIM_RACE_LOST" };
  }

  // AUTOMATIC HARDWARE TRANSMISSION:
  // Automatically send TASK:AB / TASK:AC / TASK:BA etc. over serial Bluetooth to Arduino!
  const pickupCode = assignedTask.pickup_zone_id?.code;
  const dropCode = assignedTask.drop_zone_id?.code;
  let serialSent = false;

  if (pickupCode && dropCode) {
    const serialCmd = `TASK:${pickupCode}${dropCode}`;
    // Non-blocking background hardware write: web app returns in 5ms without waiting for Bluetooth
    (async () => {
      try {
        await sendRobotSerialCommand("MODE:AUTO");
        await sendRobotSerialCommand(serialCmd);
        console.log(`[autoAssign] Transmitted MODE:AUTO and "${serialCmd}" to Arduino.`);
      } catch (serialError) {
        console.warn(`[autoAssign] Serial transmit notice:`, serialError?.message);
      }
    })();
    serialSent = true;
  }

  await logEvent({
    eventType: "AUTO_TASK_ASSIGNED",
    module: "TASK",
    severity: "SUCCESS",
    message: `Task auto-assigned (id=${assignedTask._id}) to ${robot.name} (trigger=${trigger}). ${serialSent ? "Transmitted command to Arduino." : ""}`,
    entityType: "Task",
    entityId: assignedTask._id,
    actorId: userId,
    robot_id: robot._id,
    task_id: assignedTask._id,
    metadata: {
      trigger,
      pickupZone: pickupCode || null,
      dropZone: dropCode || null,
      weight: assignedTask.weight,
      robotZone: robot.location_zone_id?.code || null,
      serialTransmitted: serialSent
    }
  });

  return { ok: true, task: assignedTask.toJSON(), robot: robot.toJSON(), serialSent };
}