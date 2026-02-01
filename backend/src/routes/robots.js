import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { Robot } from "../models/Robot.js";
import { ROBOT_STATES, validateTransition } from "../constants/robotStates.js";

const router = express.Router();

/** All robot routes require JWT */
router.use(authMiddleware);

/** GET /api/robots — fetch the single active robot */
router.get("/", async (_req, res) => {
  try {
    const robot = await Robot.findOne({}).sort({ createdAt: 1 });
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
    const role = req.user?.role;

    if (!nextState || typeof nextState !== "string") {
      return res.status(400).json({ message: "Body must include nextState (string)." });
    }

    const robot = await Robot.findOne({}).sort({ createdAt: 1 });
    if (!robot) {
      return res.status(404).json({ message: "Robot not initialized." });
    }

    const currentState = robot.currentState;

    // Force ERROR is admin-only
    if (nextState === ROBOT_STATES.ERROR) {
      if (role !== "admin") {
        return res.status(403).json({ message: "Only admin can force robot into ERROR state." });
      }
    }

    // Clear fault (ERROR -> IDLE) is admin-only
    if (currentState === ROBOT_STATES.ERROR && nextState === ROBOT_STATES.IDLE) {
      if (role !== "admin") {
        return res.status(403).json({ message: "Only admin can clear robot fault." });
      }
    }

    const validation = validateTransition(currentState, nextState);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    robot.currentState = nextState;
    robot.updatedAt = new Date();
    await robot.save();

    const json = robot.toJSON();
    // eslint-disable-next-line no-console
    console.log(`[Robot FSM] State transition: robot=${json.id} (${json.name}) ${currentState} → ${nextState}`);

    return res.json(json);
  } catch (e) {
    if (e.name === "ValidationError") {
      return res.status(400).json({ message: e.message || "Validation failed." });
    }
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;
