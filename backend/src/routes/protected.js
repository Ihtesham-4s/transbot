import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/session", authMiddleware, (_req, res) => {
  return res.json({ ok: true, authenticated: true });
});

export default router;
