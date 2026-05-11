import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { Robot } from "../models/Robot.js";
import { ROBOT_STATES, validateTransition } from "../constants/robotStates.js";
import { autoAssignTask } from "../services/autoAssignService.js";

const router = express.Router();

router.use(authMiddleware);

/** GET /api/robots — fetch the single active robot */
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

/** POST /api/robots/transition — validate transition, update DB, return robot */
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

    const json = robot.toJSON();
    console.log(`[Robot FSM] State transition: robot=${json.id} (${json.name}) ${currentState} → ${nextState}`);

    if (nextState === ROBOT_STATES.IDLE) {
      await autoAssignTask({ trigger: "ROBOT_IDLE", userId: req.user?.id });
    }

    return res.json(json);
  } catch (e) {
    if (e.name === "ValidationError") {
      return res.status(400).json({ message: e.message || "Validation failed." });
    }
    return res.status(500).json({ message: "Server error." });
  }
});

/** PATCH /api/robots/auto-mode — toggle auto assignment mode */
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

export default router;
