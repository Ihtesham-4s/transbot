import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import protectedRoutes from "./routes/protected.js";
import systemRoutes from "./routes/system.js";
import robotControlRoutes from "./routes/robotControl.js";
import robotRoutes from "./routes/robots.js";
import taskRoutes from "./routes/tasks.js";
import zoneRoutes from "./routes/zones.js";
import dashboardRoutes from "./routes/dashboard.js";
import logsRoutes from "./routes/logs.js";
import inventoryRoutes from "./routes/inventory.js";
import ordersRoutes from "./routes/orders.js";
import picklistsRoutes from "./routes/picklists.js";
import copilotRoutes from "./routes/copilot.js";
import { ensurePickListCollectionIndexes } from "./models/PickList.js";
import { connectDb, isDbConnected, mongoose } from "./db.js";
import { Robot } from "./models/Robot.js";
import { Zone } from "./models/Zone.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const localOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/i;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || localOriginPattern.test(origin)) {
        return callback(null, true);
      }
      console.warn(`[CORS] Blocked request from origin: ${origin}`);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true
  })
);
app.use(express.json());

app.get("/health", async (_req, res) => {
  if (!isDbConnected()) return res.status(500).json({ ok: false });
  return res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/protected", protectedRoutes);
app.use("/api/system", systemRoutes);
app.use("/api/robot", robotControlRoutes);
app.use("/api/robots", robotRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/zones", zoneRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/logs", logsRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/picklists", picklistsRoutes);
app.use("/api/copilot", copilotRoutes);

app.use((_req, res) => res.status(404).json({ message: "Not found." }));

async function ensureSingleRobot() {
  const robots = await Robot.find({}).sort({ createdAt: 1 });
  // Default to Zone A (start position)
  const zoneA = await Zone.findOne({ code: "A" });

  if (robots.length === 0) {
    const created = await Robot.create({
      name: "Robot-01",
      location_zone_id: zoneA?._id || null
    });
    console.log(`[Robot] Initialized single robot: id=${created.id} name=${created.name}`);
    return;
  }

  if (robots.length > 1) {
    const [, ...extras] = robots;
    await Robot.deleteMany({ _id: { $in: extras.map((r) => r._id) } });
    console.log(`[Robot] Removed ${extras.length} extra robot(s)`);
  }
}

// 3-zone physical layout: A (start Aisle 1), B (mid Aisle 2), C (end Aisle 3)
const DEFAULT_ZONES = Object.freeze([
  { code: "A", name: "Zone A", description: "Start of Aisle 1 — robot home position.", label: "Zone A", type: "PICKUP", isHome: true },
  { code: "B", name: "Zone B", description: "Mid-point of Aisle 2.", label: "Zone B", type: "PICKUP", isHome: false },
  { code: "C", name: "Zone C", description: "End of Aisle 3.", label: "Zone C", type: "DROPOFF", isHome: false }
]);

async function ensureZones() {
  for (const zone of DEFAULT_ZONES) {
    await Zone.findOneAndUpdate(
      { code: zone.code },
      {
        $set: {
          name: zone.name,
          description: zone.description,
          label: zone.label,
          type: zone.type,
          isHome: zone.isHome,
          active: true
        }
      },
      { upsert: true, new: true }
    );
  }
}

async function start() {
  try {
    await connectDb();
    const dbName = mongoose.connection.name;
    console.log(`MongoDB connected ✅ (db=${dbName})`);

    await ensureZones();
    await ensureSingleRobot();
    await ensurePickListCollectionIndexes();

    app.listen(port, () => {
      console.log(`Backend listening on http://localhost:${port}`);
    });
  } catch (err) {
    console.error("MongoDB connection failed ❌", err?.message || err);
    process.exit(1);
  }
}

start();
