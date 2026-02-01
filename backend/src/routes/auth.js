import express from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { signToken } from "../utils/jwt.js";
import { User } from "../models/User.js";

const router = express.Router();

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(100),
  password: z.string().min(6).max(255),
  // Role is server-controlled. We keep it optional for backward compatibility
  // with older clients that still send it.
  role: z.enum(["admin", "operator"]).optional()
});

const loginSchema = z.object({
  email: z.string().email().max(100),
  password: z.string().min(1).max(255)
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input.", errors: parsed.error.flatten() });
  }

  const { name, email, password, role } = parsed.data;

  try {
    const userCount = await User.countDocuments({});
    const isFirstUser = userCount === 0;
    if (!isFirstUser && role === "admin") {
      return res
        .status(403)
        .json({ message: "Admin role can only be assigned to the first registered user." });
    }

    const finalRole = isFirstUser ? "admin" : role || "operator";

    const existing = await User.findOne({ email }).select("_id");
    if (existing) {
      return res.status(409).json({ message: "Email already registered." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const created = await User.create({ name, email, passwordHash, role: finalRole });

    const token = signToken({
      id: String(created._id),
      role: created.role,
      email: created.email,
      name: created.name
    });

    return res.status(201).json({
      token,
      user: {
        id: String(created._id),
        name: created.name,
        email: created.email,
        role: created.role,
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

router.post("/login", async (req, res) => {
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

    const user = {
      id: String(found._id),
      name: found.name,
      email: found.email,
      role: found.role,
      created_at: found.createdAt
    };

    const token = signToken({ id: user.id, role: user.role, email: user.email, name: user.name });
    return res.json({ token, user });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;

