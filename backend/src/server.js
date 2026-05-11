import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import protectedRoutes from "./routes/protected.js";
import systemRoutes from "./routes/system.js";
import robotRoutes from "./routes/robots.js";
import taskRoutes from "./routes/tasks.js";
import zoneRoutes from "./routes/zones.js";
import { connectDb, isDbConnected, mongoose } from "./db.js";
import { Robot } from "./models/Robot.js";
import { Zone } from "./models/Zone.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS blocked for this origin."));
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
app.use("/api/robots", robotRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/zones", zoneRoutes);

app.use((_req, res) => res.status(404).json({ message: "Not found." }));

async function ensureSingleRobot() {
  const robots = await Robot.find({}).sort({ createdAt: 1 });
  const chargeZone = await Zone.findOne({ code: "ZONE_CHARGE" });

  if (robots.length === 0) {
    const created = await Robot.create({
      name: "Robot-01",
      location_zone_id: chargeZone?._id || null
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

const DEFAULT_ZONES = Object.freeze([
  { code: "ZONE_CHARGE", label: "Charging Dock", type: "CHARGING" },
  { code: "ZONE_A", label: "Zone A (Receiving)", type: "PICKUP" },
  { code: "ZONE_B", label: "Zone B (Storage)", type: "PICKUP" },
  { code: "ZONE_C", label: "Zone C (Packing)", type: "PICKUP" },
  { code: "ZONE_D", label: "Zone D (Shipping)", type: "DROPOFF" },
  { code: "ZONE_E", label: "Zone E (QA)", type: "DROPOFF" }
]);

async function ensureZones() {
  for (const zone of DEFAULT_ZONES) {
    await Zone.findOneAndUpdate(
      { code: zone.code },
      { $set: { label: zone.label, type: zone.type, active: true } },
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

    app.listen(port, () => {
      console.log(`Backend listening on http://localhost:${port}`);
    });
  } catch (err) {
    console.error("MongoDB connection failed ❌", err?.message || err);
    process.exit(1);
  }
}

start();
