import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { Zone } from "../models/Zone.js";

const router = express.Router();

router.use(authMiddleware);

/** GET /api/zones — list all zones */
router.get("/", async (_req, res) => {
  try {
    const zones = await Zone.find({ active: true }).sort({ code: 1 });
    return res.json({ zones: zones.map((z) => z.toJSON()) });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;
