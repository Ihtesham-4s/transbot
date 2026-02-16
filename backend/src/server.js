import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import protectedRoutes from "./routes/protected.js";
import adminRoutes from "./routes/admin.js";
import robotRoutes from "./routes/robots.js";
import taskRoutes from "./routes/tasks.js";
import zoneRoutes from "./routes/zones.js";
import { connectDb, isDbConnected, mongoose } from "./db.js";
import { Robot } from "./models/Robot.js";
import { Zone } from "./models/Zone.js";
import { Task } from "./models/Task.js";
import { WAREHOUSE_GRAPH_META, WAREHOUSE_GRAPH, getShortestPath } from "./utils/warehouseGraph.js";
import { BATTERY_PER_UNIT } from "./utils/feasibility.js";

dotenv.config();
import { scheduleNext } from "./routes/tasks.js";

const app = express();
const port = process.env.PORT || 5000;
const CHARGE_TRAVEL_SECONDS_PER_UNIT = 2;

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
app.use("/api/zones", zoneRoutes);

// Compatibility alias (spec sometimes uses /tasks without /api)
app.use("/tasks", taskRoutes);

app.use((_req, res) => res.status(404).json({ message: "Not found." }));


async function ensureSingleRobot() {
  const robots = await Robot.find({}).sort({ createdAt: 1 });
  const chargeZone = await Zone.findOne({ code: "ZONE_CHARGE" });

  if (robots.length === 0) {
    const created = await Robot.create({
      name: "Robot-01",
      location_zone_id: chargeZone?._id || null,
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
  }

  if (robot && !robot.location_zone_id && chargeZone) {
    robot.location_zone_id = chargeZone._id;
  }

  if (robot && robot.isModified()) {
    await robot.save();
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
  const zoneCodes = new Set(WAREHOUSE_GRAPH_META?.zones || []);
  const seeds = DEFAULT_ZONES.filter((z) => zoneCodes.size === 0 || zoneCodes.has(z.code));

  for (const zone of seeds) {
    await Zone.findOneAndUpdate(
      { code: zone.code },
      { $set: { label: zone.label, type: zone.type, active: true } },
      { upsert: true, new: true }
    );
  }
}

async function backfillTaskZones() {
  const zones = await Zone.find({}).select("_id code").lean();
  if (!zones.length) return;
  const zoneByCode = new Map(zones.map((z) => [z.code, z._id]));

  const cursor = Task.collection.find({
    $or: [
      { pickup_zone_id: { $exists: false } },
      { drop_zone_id: { $exists: false } },
      { pickup_zone_id: null },
      { drop_zone_id: null }
    ]
  });

  const bulk = [];
  // eslint-disable-next-line no-await-in-loop
  while (await cursor.hasNext()) {
    // eslint-disable-next-line no-await-in-loop
    const doc = await cursor.next();
    if (!doc) break;
    const pickupId = zoneByCode.get(doc.pickup_zone);
    const dropId = zoneByCode.get(doc.drop_zone);
    if (!pickupId && !dropId) continue;
    bulk.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            ...(pickupId ? { pickup_zone_id: pickupId } : {}),
            ...(dropId ? { drop_zone_id: dropId } : {})
          }
        }
      }
    });
  }

  if (bulk.length) {
    await Task.collection.bulkWrite(bulk, { ordered: false });
  }
}

async function backfillRobotLocation() {
  const chargeZone = await Zone.findOne({ code: "ZONE_CHARGE" });
  const robots = await Robot.find({}).sort({ createdAt: 1 });
  if (!robots.length) return;

  for (const robot of robots) {
    let desiredCode = null;

    try {
      const raw = await Robot.collection.findOne({ _id: robot._id });
      const legacyCode = raw?.location || raw?.location_code || raw?.current_zone || null;
      if (typeof legacyCode === "string" && legacyCode.trim()) {
        desiredCode = legacyCode.trim().toUpperCase();
      }
    } catch {
      // ignore legacy lookup failures
    }

    if (desiredCode) {
      const desiredZone = await Zone.findOne({ code: desiredCode });
      if (desiredZone && String(robot.location_zone_id) !== String(desiredZone._id)) {
        robot.location_zone_id = desiredZone._id;
        robot.updatedAt = new Date();
        await robot.save();
        continue;
      }
    }

    if (!robot.location_zone_id && chargeZone) {
      robot.location_zone_id = chargeZone._id;
      robot.updatedAt = new Date();
      await robot.save();
    }
  }
}

async function startChargingLoop() {
  setInterval(async () => {
    try {
      const robot = await Robot.findOne({}).sort({ createdAt: 1 }).populate("location_zone_id");
      if (!robot) return;

      const now = Date.now();
      const batteryNow = Number(robot.batteryLevel ?? 0);

      // Self-heal: if the robot is stuck in a non-idle state but has no active task, return it to IDLE
      const hasActiveTaskForRobot = await Task.exists({ assigned_robot_id: robot._id, status: { $in: ["ASSIGNED", "IN_PROGRESS"] } });
      if (robot.currentState !== "IDLE") {
        if (!hasActiveTaskForRobot && robot.currentState !== "ERROR") {
          robot.currentState = "IDLE";
          robot.chargingUntil = null;
          robot.updatedAt = new Date();
          await robot.save();
          await robot.populate("location_zone_id");
        } else {
          return;
        }
      }

      // If idle and low battery and not already traveling/charging, send the robot to the dock.
      const atDock = robot.location_zone_id?.code === "ZONE_CHARGE";
      const alreadyTraveling = robot.chargingUntil && new Date(robot.chargingUntil).getTime() > now;
      if (!atDock && !alreadyTraveling && batteryNow <= 20) {
        const estimate = getShortestPath(WAREHOUSE_GRAPH, robot.location_zone_id?.code || "ZONE_CHARGE", "ZONE_CHARGE");
        const distance = estimate?.distance || 0;
        if (distance > 0) {
          robot.chargingUntil = new Date(now + distance * CHARGE_TRAVEL_SECONDS_PER_UNIT * 1000);
          robot.updatedAt = new Date();
          await robot.save();
          return; // wait for travel to finish before charging ticks
        }
      }

      const chargingUntilMs = robot.chargingUntil ? new Date(robot.chargingUntil).getTime() : null;
      let arrivedThisTick = false;

      // If the robot is traveling to the dock, do not teleport or charge yet.
      if (chargingUntilMs && Number.isFinite(chargingUntilMs) && chargingUntilMs > now) {
        return;
      }

      // If travel delay elapsed, mark arrival at dock and apply travel drain once.
      if (chargingUntilMs && Number.isFinite(chargingUntilMs) && chargingUntilMs <= now) {
        const chargeZone = await Zone.findOne({ code: "ZONE_CHARGE" });
        if (chargeZone) {
          const startCode = robot.location_zone_id?.code || "ZONE_CHARGE";
          const estimate = getShortestPath(WAREHOUSE_GRAPH, startCode, "ZONE_CHARGE");
          const distance = estimate?.distance || 0;
          const drain = distance * BATTERY_PER_UNIT;
          if (Number.isFinite(drain) && drain > 0) {
            robot.batteryLevel = Math.max(0, Number(robot.batteryLevel ?? 0) - drain);
          }
          robot.location_zone_id = chargeZone._id;
        }
        robot.chargingUntil = null;
        robot.updatedAt = new Date();
        await robot.save();
        await robot.populate("location_zone_id");
        arrivedThisTick = true;
      }

      // Skip immediate charging on the same tick the robot arrives at the dock; charge on the next interval instead.
      if (arrivedThisTick) return;

      const battery = Number(robot.batteryLevel ?? 0);
      if (battery >= 100) return;

      const hasActiveTask = await Task.exists({ status: { $in: ["ASSIGNED", "IN_PROGRESS"] } });
      const isAtCharge = robot.location_zone_id?.code === "ZONE_CHARGE";

      // If idle with no active tasks and not already traveling, start a charge trip instead of teleporting.
      if (!isAtCharge && !hasActiveTask && !chargingUntilMs && batteryNow <= 20) {
        const chargeZone = await Zone.findOne({ code: "ZONE_CHARGE" });
        const startCode = robot.location_zone_id?.code || "ZONE_CHARGE";
        const path = getShortestPath(WAREHOUSE_GRAPH, startCode, "ZONE_CHARGE");
        const distance = path?.distance || 0;
        const requiredToDock = Number.isFinite(distance) ? distance * BATTERY_PER_UNIT : Number.POSITIVE_INFINITY;

        if (distance > 0 && (batteryNow <= 0 || batteryNow < requiredToDock)) {
          robot.chargingUntil = null;
          robot.currentState = "ERROR";
          robot.updatedAt = new Date();
          await robot.save();
        } else if (chargeZone && distance > 0) {
          robot.chargingUntil = new Date(now + distance * CHARGE_TRAVEL_SECONDS_PER_UNIT * 1000);
          robot.updatedAt = new Date();
          await robot.save();
          return;
        } else if (chargeZone && distance <= 0) {
          // Already at charge; ensure location is set.
          robot.location_zone_id = chargeZone._id;
          robot.updatedAt = new Date();
          await robot.save();
        }
      }

      // Only charge while physically at the dock; do not self-teleport charge from other zones.
      const canCharge = robot.location_zone_id?.code === "ZONE_CHARGE";
      if (!canCharge) return;

      const next = Math.min(100, battery + 5);
      if (next === robot.batteryLevel) return;

      robot.batteryLevel = next;
      robot.updatedAt = new Date();
      await robot.save();

      const hasActiveTaskAfterCharge = await Task.exists({ status: { $in: ["ASSIGNED", "IN_PROGRESS"] } });
      if (!hasActiveTaskAfterCharge && robot.currentState === "IDLE" && !robot.chargingUntil) {
        try {
          await scheduleNext();
        } catch {
          // swallow background scheduling errors
        }
      }
    } catch {
      // ignore background errors
    }
  }, 5_000);
}


async function start() {
  try {
    await connectDb();
    const dbName = mongoose.connection.name;
    // eslint-disable-next-line no-console
    console.log(`MongoDB connected ✅ (db=${dbName})`);

    await ensureZones();
    await backfillTaskZones();
    await backfillRobotLocation();
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

