import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.get("/admin", authMiddleware, roleMiddleware(["admin"]), (_req, res) => {
  return res.json({ ok: true, area: "admin" });
});

router.get("/operator", authMiddleware, roleMiddleware(["operator"]), (_req, res) => {
  return res.json({ ok: true, area: "operator" });
});

export default router;

