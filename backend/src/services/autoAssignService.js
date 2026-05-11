import { ROBOT_STATES } from "../constants/robotStates.js";
import { Robot } from "../models/Robot.js";
import { Task } from "../models/Task.js";
import { logEvent } from "../utils/logger.js";

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

function isTaskFeasible(task, maxWeightKg) {
  if (!task?.pickup_zone_id || !task?.drop_zone_id) return false;
  if (!task.pickup_zone_id.active || !task.drop_zone_id.active) return false;
  if (task.pickup_zone_id.type !== "PICKUP") return false;
  if (task.drop_zone_id.type !== "DROPOFF") return false;
  if (typeof task.weight !== "number") return false;
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
  );

  if (!robot) {
    return { ok: false, reason: "ROBOT_NOT_IDLE_OR_AUTOMODE_OFF" };
  }

  const maxWeightKg = Number(process.env.ROBOT_MAX_WEIGHT_KG || 10);
  const pendingTasks = await Task.find({ status: "PENDING" })
    .populate("pickup_zone_id")
    .populate("drop_zone_id")
    .lean({ virtuals: true });

  if (pendingTasks.length === 0) {
    await releaseRobotToIdle(robot._id);
    return { ok: false, reason: "NO_PENDING_TASKS" };
  }

  const feasibleTasks = pendingTasks.filter((task) => isTaskFeasible(task, maxWeightKg));
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
    return { ok: false, reason: "TASKS_CLAIMED_BY_OTHER_WORKER" };
  }

  await logEvent("AUTO_TASK_ASSIGNED", `Auto-assigned task (id=${assignedTask._id}).`, {
    task_id: assignedTask._id,
    robot_id: robot._id,
    user_id: userId,
    metadata: {
      trigger,
      timestamp: new Date().toISOString()
    }
  });

  const populatedRobot = await Robot.findById(robot._id).populate("location_zone_id");
  return {
    ok: true,
    trigger,
    task: assignedTask.toJSON(),
    robot: populatedRobot ? populatedRobot.toJSON() : robot.toJSON()
  };
}