import express from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { signToken } from "../utils/jwt.js";
import { User } from "../models/User.js";
import { createRateLimiter } from "../middleware/rateLimitMiddleware.js";
import { logEvent } from "../utils/logger.js";

const router = express.Router();

const registerLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many registration attempts. Please try again later."
});

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many login attempts. Please try again later."
});

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(100),
  password: z.string().min(6).max(255),
  role: z.enum(["manager", "operator"]).optional()
});

const loginSchema = z.object({
  email: z.string().email().max(100),
  password: z.string().min(1).max(255)
});

router.post("/register", registerLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input.", errors: parsed.error.flatten() });
  }

  const { name, email, password, role } = parsed.data;
  const selectedRole = role ?? "operator";

  try {
    const existing = await User.findOne({ email }).select("_id");
    if (existing) {
      return res.status(409).json({ message: "Email already registered." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const created = await User.create({ name, email, passwordHash, role: selectedRole });

    const token = signToken({
      id: String(created._id),
      role: selectedRole,
      email: created.email,
      name: created.name
    });

    await logEvent({
      eventType: "USER_REGISTERED",
      module: "AUTH",
      severity: "SUCCESS",
      message: `User registered: ${created.email}.`,
      entityType: "User",
      entityId: created._id,
      actorId: created._id,
      metadata: { email: created.email, role: selectedRole }
    });

    return res.status(201).json({
      token,
      user: {
        id: String(created._id),
        name: created.name,
        email: created.email,
        role: selectedRole,
        created_at: created.createdAt
      }
    });
  } catch (err) {
    // Unique constraint safety net
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Email already registered." });
    }
    return res.status(500).json({ message: "Server error." });
  }
});

router.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input.", errors: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;

  try {
    const found = await User.findOne({ email });
    if (!found) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const ok = await bcrypt.compare(password, found.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const role = found.role === "manager" || found.role === "operator" ? found.role : "operator";

    const user = {
      id: String(found._id),
      name: found.name,
      email: found.email,
      role,
      created_at: found.createdAt
    };

    const token = signToken({ id: user.id, role: user.role, email: user.email, name: user.name });

    await logEvent({
      eventType: "USER_LOGIN",
      module: "AUTH",
      severity: "SUCCESS",
      message: `User logged in: ${user.email}.`,
      entityType: "User",
      entityId: user.id,
      actorId: user.id,
      metadata: { email: user.email, role: user.role }
    });

    return res.json({ token, user });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;
