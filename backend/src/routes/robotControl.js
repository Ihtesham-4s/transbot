import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  getRobotSerialStatus,
  isValidRobotCommand,
  sendRobotSerialCommand
} from "../services/robotSerialService.js";
import { Robot } from "../models/Robot.js";
import { Zone } from "../models/Zone.js";
import { logEvent } from "../utils/logger.js";

const router = express.Router();

router.use(authMiddleware);

/** GET /api/robot/status — serial port status */
router.get("/status", (_req, res) => {
  return res.json(getRobotSerialStatus());
});

/** POST /api/robot/send — send a raw validated command */
router.post("/send", async (req, res) => {
  const { command } = req.body || {};

  if (!isValidRobotCommand(command)) {
    return res.status(400).json({
      message:
        "Invalid command. Allowed: drive (F/B/L/R/FL/FR/BL/BR/S), mode (MODE:AUTO/MANUAL), " +
        "task (TASK:AB/AC/BA/BC/CA/CB), stop (STOP), reset (RESET), nudge (NUDGE:L/R), " +
        "zone arrival (AA/AB/AC), speed (SPEED:<right>,<left>)."
    });
  }

  try {
    // Database update runs FIRST so state is updated instantly in 5 milliseconds!
    if (command === "RESET") {
      const zoneA = await Zone.findOne({ code: "A" });
      const updateData = { currentState: "IDLE" };
      if (zoneA) updateData.location_zone_id = zoneA._id;
      await Robot.findOneAndUpdate({}, { $set: updateData }, { sort: { createdAt: 1 } });
    }

    const result = await sendRobotSerialCommand(command);

    await logEvent({
      eventType: "ROBOT_MANUAL_COMMAND",
      module: "ROBOT",
      severity: "INFO",
      message: `Robot command sent: ${command}${result.offline ? " (Hardware Offline)" : ""}`,
      actorId: req.user?.id || null,
      metadata: { command: result.command, port: result.port, baudRate: result.baudRate, offline: result.offline || false }
    });

    return res.json({
      ok: true,
      message: result.offline
        ? `Command "${command}" processed (Database updated. Bluetooth hardware offline).`
        : `Command "${command}" sent to robot hardware.`,
      ...result
    });
  } catch (error) {
    console.error("[robot-control] send", error?.message || error);
    if (error.code === "ROBOT_COMMAND_INVALID") {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: "Failed to send robot command." });
  }
});

/**
 * POST /api/robot/mode
 * Body: { mode: "AUTO" | "MANUAL" }
 * Sends MODE:AUTO or MODE:MANUAL over serial, updates robot.autoMode in DB.
 */
router.post("/mode", async (req, res) => {
  const rawMode = String(req.body?.mode || "").toUpperCase().trim();

  if (rawMode !== "AUTO" && rawMode !== "MANUAL") {
    return res.status(400).json({ message: 'mode must be "AUTO" or "MANUAL".' });
  }

  const serialCommand = `MODE:${rawMode}`;

  try {
    const result = await sendRobotSerialCommand(serialCommand);

    const robot = await Robot.findOneAndUpdate(
      {},
      { $set: { autoMode: rawMode === "AUTO" } },
      { new: true, sort: { createdAt: 1 } }
    ).populate("location_zone_id");

    if (!robot) {
      return res.status(404).json({ message: "Robot not initialized." });
    }

    await logEvent({
      eventType: "ROBOT_MODE_CHANGED",
      module: "ROBOT",
      severity: "INFO",
      message: `Robot mode changed to ${rawMode}.`,
      entityType: "Robot",
      entityId: robot._id,
      actorId: req.user?.id || null,
      robot_id: robot._id,
      metadata: { mode: rawMode }
    });

    return res.json({ ok: true, mode: rawMode, robot: robot.toJSON(), ...result });
  } catch (error) {
    console.error("[robot-control] mode", error?.message || error);
    if (error.code === "ROBOT_SERIAL_UNAVAILABLE") {
      return res.status(503).json({ message: error.message, status: getRobotSerialStatus() });
    }
    return res.status(500).json({ message: "Failed to change robot mode." });
  }
});

/**
 * POST /api/robot/nudge
 * Body: { direction: "L" | "R" }
 * Sends NUDGE:L or NUDGE:R (AUTO mode only; used via hidden keyboard shortcut).
 */
router.post("/nudge", async (req, res) => {
  const rawDir = String(req.body?.direction || "").toUpperCase().trim();

  if (rawDir !== "L" && rawDir !== "R") {
    return res.status(400).json({ message: 'direction must be "L" or "R".' });
  }

  const serialCommand = `NUDGE:${rawDir}`;

  try {
    const result = await sendRobotSerialCommand(serialCommand);

    await logEvent({
      eventType: "ROBOT_NUDGE",
      module: "ROBOT",
      severity: "INFO",
      message: `Nudge ${rawDir} sent.`,
      actorId: req.user?.id || null,
      metadata: { direction: rawDir }
    });

    return res.json({ ok: true, direction: rawDir, ...result });
  } catch (error) {
    console.error("[robot-control] nudge", error?.message || error);
    if (error.code === "ROBOT_SERIAL_UNAVAILABLE") {
      return res.status(503).json({ message: error.message, status: getRobotSerialStatus() });
    }
    return res.status(500).json({ message: "Failed to send nudge command." });
  }
});

/**
 * POST /api/robot/task-command
 * Body: { task: "AB" | "AC" | "BA" | "BC" | "CA" | "CB" }
 * Sends TASK:<code> over serial (AUTO mode only).
 */
const VALID_TASK_CODES = new Set(["AB", "AC", "BA", "BC", "CA", "CB"]);

router.post("/task-command", async (req, res) => {
  const rawTask = String(req.body?.task || "").toUpperCase().trim();

  if (!VALID_TASK_CODES.has(rawTask)) {
    return res.status(400).json({
      message: `task must be one of: ${[...VALID_TASK_CODES].join(", ")}.`
    });
  }

  const serialCommand = `TASK:${rawTask}`;

  try {
    const result = await sendRobotSerialCommand(serialCommand);

    await logEvent({
      eventType: "ROBOT_TASK_COMMAND",
      module: "ROBOT",
      severity: "INFO",
      message: `Task command sent: ${serialCommand}.`,
      actorId: req.user?.id || null,
      metadata: { task: rawTask }
    });

    return res.json({ ok: true, task: rawTask, ...result });
  } catch (error) {
    console.error("[robot-control] task-command", error?.message || error);
    if (error.code === "ROBOT_SERIAL_UNAVAILABLE") {
      return res.status(503).json({ message: error.message, status: getRobotSerialStatus() });
    }
    return res.status(500).json({ message: "Failed to send task command." });
  }
});

/**
 * POST /api/robot/speed
 * Body: { right: number (0-255), left: number (0-255) }
 * Sends SPEED:<right>,<left> (MANUAL mode only).
 */
router.post("/speed", async (req, res) => {
  const right = Number(req.body?.right ?? 150);
  const left = Number(req.body?.left ?? 150);

  if (!Number.isInteger(right) || !Number.isInteger(left) || right < 0 || right > 255 || left < 0 || left > 255) {
    return res.status(400).json({ message: "right and left must be integers between 0 and 255." });
  }

  const serialCommand = `SPEED:${right},${left}`;

  try {
    const result = await sendRobotSerialCommand(serialCommand);
    return res.json({ ok: true, right, left, ...result });
  } catch (error) {
    console.error("[robot-control] speed", error?.message || error);
    if (error.code === "ROBOT_SERIAL_UNAVAILABLE") {
      return res.status(503).json({ message: error.message, status: getRobotSerialStatus() });
    }
    return res.status(500).json({ message: "Failed to send speed command." });
  }
});

/**
 * POST /api/robot/zone-arrival
 * Body: { zoneCode: "A" | "B" | "C" }
 * Logs robot arrival at a zone, updates robot.location_zone_id, sends serial AA/AB/AC.
 */
const ZONE_ARRIVAL_COMMANDS = Object.freeze({
  A: "AA",
  B: "AB",
  C: "AC"
});

router.post("/zone-arrival", async (req, res) => {
  const zoneCode = String(req.body?.zoneCode || "").trim().toUpperCase();
  const serialCommand = ZONE_ARRIVAL_COMMANDS[zoneCode];

  if (!serialCommand) {
    return res.status(400).json({ message: "zoneCode must be one of: A, B, C." });
  }

  try {
    const [robot, zone] = await Promise.all([
      Robot.findOne({}).sort({ createdAt: 1 }),
      Zone.findOne({ code: zoneCode, active: true })
    ]);

    if (!robot) return res.status(404).json({ message: "Robot not initialized." });
    if (!zone) return res.status(404).json({ message: `Zone "${zoneCode}" not found.` });

    const result = await sendRobotSerialCommand(serialCommand);
    robot.location_zone_id = zone._id;
    await robot.save();
    await robot.populate("location_zone_id");

    await logEvent({
      eventType: "ZONE_ARRIVAL_LOGGED",
      module: "ROBOT",
      severity: "SUCCESS",
      message: `Robot arrival logged at Zone ${zoneCode}.`,
      entityType: "Robot",
      entityId: robot._id,
      actorId: req.user?.id || null,
      robot_id: robot._id,
      metadata: { zoneCode, serialCommand }
    });

    return res.json({
      ok: true,
      message: `Arrival at Zone ${zoneCode} logged.`,
      robot: robot.toJSON(),
      ...result
    });
  } catch (error) {
    console.error("[robot-control] zone-arrival", error?.message || error);
    if (error.code === "ROBOT_SERIAL_UNAVAILABLE") {
      return res.status(503).json({ message: error.message, status: getRobotSerialStatus() });
    }
    if (error.code === "ROBOT_COMMAND_INVALID") {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: "Failed to log zone arrival." });
  }
});

export default router;
