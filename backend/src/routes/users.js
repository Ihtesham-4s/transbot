import bcrypt from "bcrypt";
import express from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { User } from "../models/User.js";
import { logEvent } from "../utils/logger.js";

const router = express.Router();

/** GET /api/users/me — get current user profile */
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

const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120).optional(),
  email: z.string().email("Invalid email address.").optional()
});

/** PATCH /api/users/me — update profile (name / email) */
router.patch("/me", authMiddleware, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input.", errors: parsed.error.flatten().fieldErrors });
  }

  const { name, email } = parsed.data;

  if (!name && !email) {
    return res.status(400).json({ message: "Provide at least one field to update (name or email)." });
  }

  try {
    // Check email uniqueness if changing it
    if (email) {
      const existing = await User.findOne({ email, _id: { $ne: req.user.id } });
      if (existing) return res.status(409).json({ message: "Email is already in use." });
    }

    const update = {};
    if (name) update.name = name;
    if (email) update.email = email;

    const updated = await User.findByIdAndUpdate(req.user.id, { $set: update }, { new: true }).select("name email role createdAt");
    if (!updated) return res.status(404).json({ message: "User not found." });

    await logEvent({
      eventType: "USER_PROFILE_UPDATED",
      module: "AUTH",
      severity: "INFO",
      message: `User profile updated: ${updated.email}.`,
      entityType: "User",
      entityId: updated._id,
      actorId: req.user.id,
      metadata: { fields: Object.keys(update) }
    });

    return res.json({
      message: "Profile updated successfully.",
      user: {
        id: String(updated._id),
        name: updated.name,
        email: updated.email,
        role: updated.role
      }
    });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z.string().min(8, "New password must be at least 8 characters.")
});

/** PATCH /api/users/me/password — change password */
router.patch("/me/password", authMiddleware, async (req, res) => {
  const parsed = updatePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input.", errors: parsed.error.flatten().fieldErrors });
  }

  try {
    const user = await User.findById(req.user.id).select("passwordHash email");
    if (!user) return res.status(404).json({ message: "User not found." });

    const matches = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!matches) return res.status(401).json({ message: "Current password is incorrect." });

    const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
    user.passwordHash = newHash;
    await user.save();

    await logEvent({
      eventType: "USER_PASSWORD_CHANGED",
      module: "AUTH",
      severity: "SUCCESS",
      message: `Password changed for ${user.email}.`,
      entityType: "User",
      entityId: user._id,
      actorId: req.user.id
    });

    return res.json({ message: "Password changed successfully." });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;
