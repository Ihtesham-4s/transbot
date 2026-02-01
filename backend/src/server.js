import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import protectedRoutes from "./routes/protected.js";
import adminRoutes from "./routes/admin.js";
import robotRoutes from "./routes/robots.js";
import taskRoutes from "./routes/tasks.js";
import { connectDb, isDbConnected, mongoose } from "./db.js";
import { Robot } from "./models/Robot.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/health", async (_req, res) => {
  if (!isDbConnected()) return res.status(500).json({ ok: false });
  return res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/protected", protectedRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/robots", robotRoutes);
app.use("/api/tasks", taskRoutes);

// Compatibility alias (spec sometimes uses /tasks without /api)
app.use("/tasks", taskRoutes);

app.use((_req, res) => res.status(404).json({ message: "Not found." }));


async function ensureSingleRobot() {
  const robots = await Robot.find({}).sort({ createdAt: 1 });

  if (robots.length === 0) {
    const created = await Robot.create({
      name: "Robot-01",
      location: "ZONE_CHARGE",
      batteryLevel: 100,
      maxPayload: 5
    });
    // eslint-disable-next-line no-console
    console.log(`[Robot FSM] Initialized single robot: id=${created.id} name=${created.name} state=${created.currentState}`);
    return;
  }

  if (robots.length > 1) {
    const [, ...extras] = robots;
    await Robot.deleteMany({ _id: { $in: extras.map((r) => r._id) } });
    // eslint-disable-next-line no-console
    console.log(`[Robot FSM] Enforced single-robot DB: removed ${extras.length} extra robot(s)`);
  }

  // Backfill maxPayload for existing single-robot docs.
  const robot = robots[0];
  if (robot && (robot.maxPayload === undefined || robot.maxPayload === null)) {
    robot.maxPayload = 5;
    await robot.save();
  }
}

async function startChargingLoop() {
  setInterval(async () => {
    try {
      const robot = await Robot.findOne({}).sort({ createdAt: 1 });
      if (!robot) return;

      const now = Date.now();
      const shouldCharge =
        robot.currentState === "IDLE" &&
        robot.location === "ZONE_CHARGE" &&
        (!robot.chargingUntil || new Date(robot.chargingUntil).getTime() <= now);
      if (!shouldCharge) return;

      const next = Math.min(100, Number(robot.batteryLevel ?? 0) + 5);
      if (next === robot.batteryLevel) return;

      robot.batteryLevel = next;
      if (robot.chargingUntil && new Date(robot.chargingUntil).getTime() <= now) {
        robot.chargingUntil = null;
      }
      robot.updatedAt = new Date();
      await robot.save();
    } catch {
      // ignore background errors
    }
  }, 10_000);
}


async function start() {
  try {
    await connectDb();
    const dbName = mongoose.connection.name;
    // eslint-disable-next-line no-console
    console.log(`MongoDB connected ✅ (db=${dbName})`);

    await ensureSingleRobot();
    await startChargingLoop();

    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Backend listening on http://localhost:${port}`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("MongoDB connection failed ❌", err?.message || err);
    process.exit(1);
  }
}

start();

