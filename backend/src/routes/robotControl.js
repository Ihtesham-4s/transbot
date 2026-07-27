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

router.get("/status", (_req, res) => {
  return res.json(getRobotSerialStatus());
});

router.post("/send", async (req, res) => {
  const { command } = req.body || {};

  if (!isValidRobotCommand(command)) {
    return res.status(400).json({ message: "Invalid command. Use one of F, B, L, R, FL, FR, BL, BR, S." });
  }

  try {
    const result = await sendRobotSerialCommand(command);

    await logEvent({
      eventType: "ROBOT_MANUAL_COMMAND",
      module: "ROBOT",
      severity: "INFO",
      message: `Manual robot command sent: ${command}`,
      actorId: req.user?.id || null,
      metadata: {
        command: result.command,
        requestedCommand: result.requestedCommand,
        port: result.port,
        baudRate: result.baudRate
      }
    });

    return res.json({
      ok: true,
      message: `Command ${command} sent to robot.`,
      ...result
    });
  } catch (error) {
    console.error("[robot-control] send", error?.message || error);

    if (error.code === "ROBOT_SERIAL_UNAVAILABLE") {
      return res.status(503).json({
        message: error.message,
        status: getRobotSerialStatus()
      });
    }

    if (error.code === "ROBOT_COMMAND_INVALID") {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({ message: "Failed to send robot command." });
  }
});

router.post("/zone-arrival", async (req, res) => {
  const zoneCode = String(req.body?.zoneCode || "").trim().toUpperCase();
  const commandByZone = {
    Z1: "AZ1",
    Z2: "AZ2",
    Z3: "AZ3",
    HOME: "AHOME"
  };
  const command = commandByZone[zoneCode];

  if (!command) {
    return res.status(400).json({ message: "zoneCode must be one of Z1, Z2, Z3, HOME." });
  }

  try {
    const [robot, zone] = await Promise.all([
      Robot.findOne({}).sort({ createdAt: 1 }),
      Zone.findOne({ code: zoneCode, active: true })
    ]);

    if (!robot) return res.status(404).json({ message: "Robot not initialized." });
    if (!zone) return res.status(404).json({ message: "Zone not found." });

    const result = await sendRobotSerialCommand(command);
    robot.location_zone_id = zone._id;
    await robot.save();
    await robot.populate("location_zone_id");

    await logEvent({
      eventType: "ZONE_ARRIVAL_LOGGED",
      module: "ROBOT",
      severity: "SUCCESS",
      message: `Robot arrival logged at ${zoneCode}.`,
      entityType: "Robot",
      entityId: robot._id,
      actorId: req.user?.id || null,
      robot_id: robot._id,
      metadata: {
        zoneCode,
        command: result.command,
        requestedCommand: result.requestedCommand,
        port: result.port,
        baudRate: result.baudRate
      }
    });

    return res.json({
      ok: true,
      message: `Arrival at ${zoneCode} logged.`,
      robot: robot.toJSON(),
      ...result
    });
  } catch (error) {
    console.error("[robot-control] zone-arrival", error?.message || error);

    if (error.code === "ROBOT_SERIAL_UNAVAILABLE") {
      return res.status(503).json({
        message: error.message,
        status: getRobotSerialStatus()
      });
    }

    if (error.code === "ROBOT_COMMAND_INVALID") {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({ message: "Failed to log zone arrival." });
  }
});

export default router;
