import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { User } from "../models/User.js";

const router = express.Router();

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const found = await User.findById(req.user.id).select("name email role createdAt");
    if (!found) return res.status(404).json({ message: "User not found." });
    return res.json({
      user: {
        id: String(found._id),
        name: found.name,
        email: found.email,
        role: found.role,
        created_at: found.createdAt
      }
    });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;

