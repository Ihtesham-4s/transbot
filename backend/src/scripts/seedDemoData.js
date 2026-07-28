import bcrypt from "bcrypt";
import { pathToFileURL } from "url";

import { connectDb, mongoose } from "../db.js";
import { User } from "../models/User.js";
import { Zone } from "../models/Zone.js";
import { Robot } from "../models/Robot.js";
import { Task } from "../models/Task.js";
import { Log } from "../models/Log.js";
import { logEvent } from "../utils/logger.js";

const DEMO_USER_EMAIL = "demo.manager@transbot.local";
const DEMO_PASSWORD = "password123";

// 3-zone L-shaped track: A (south/home), B (north), C (west of B)
const ZONES = [
  { code: "A", name: "Zone A", label: "Zone A", type: "PICKUP",  description: "South \u2014 robot home position (start of vertical aisle).", isHome: true  },
  { code: "B", name: "Zone B", label: "Zone B", type: "PICKUP",  description: "North \u2014 top of vertical aisle.",                              isHome: false },
  { code: "C", name: "Zone C", label: "Zone C", type: "DROPOFF", description: "West of B \u2014 end of horizontal aisle.",                        isHome: false }
];

async function ensureUser() {
  let user = await User.findOne({ email: DEMO_USER_EMAIL });
  if (user) return user;

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  user = await User.create({
    name: "Demo Manager",
    email: DEMO_USER_EMAIL,
    passwordHash,
    role: "manager"     // valid roles: "manager" | "operator"
  });

  await logEvent({
    eventType: "USER_REGISTERED",
    module: "AUTH",
    severity: "SUCCESS",
    message: `Demo user created: ${DEMO_USER_EMAIL}.`,
    entityType: "User",
    entityId: user._id,
    actorId: user._id,
    metadata: { seeded: true }
  });

  return user;
}

async function ensureZones() {
  for (const zone of ZONES) {
    await Zone.findOneAndUpdate(
      { code: zone.code },
      { $set: { ...zone, active: true } },
      { upsert: true, new: true }
    );
  }
}

async function ensureRobot() {
  let robot = await Robot.findOne({}).sort({ createdAt: 1 });
  if (robot) return robot;

  const zoneA = await Zone.findOne({ code: "A" });

  robot = await Robot.create({
    name: "Robot-01",
    currentState: "IDLE",
    autoMode: true,
    maxCapacityKg: 2,
    location_zone_id: zoneA?._id
  });

  await logEvent({
    eventType: "ROBOT_STATE_UPDATED",
    module: "ROBOT",
    severity: "INFO",
    message: "Demo robot initialized in IDLE state at Zone A.",
    entityType: "Robot",
    entityId: robot._id,
    actorId: null,
    robot_id: robot._id,
    metadata: { seeded: true }
  });

  return robot;
}

async function seedTasks() {
  if ((await Task.countDocuments({})) > 0) return;

  const [zoneA, zoneB, zoneC] = await Promise.all([
    Zone.findOne({ code: "A" }),
    Zone.findOne({ code: "B" }),
    Zone.findOne({ code: "C" })
  ]);

  if (!zoneA || !zoneB || !zoneC) {
    console.warn("[seed] Zones not found \u2014 skipping task seed.");
    return;
  }

  // All task weights must be <= 2 kg (robot payload limit)
  await Task.insertMany([
    { pickup_zone_id: zoneA._id, drop_zone_id: zoneB._id, weight: 1.2, priority: "HIGH",   status: "PENDING" },
    { pickup_zone_id: zoneA._id, drop_zone_id: zoneC._id, weight: 0.8, priority: "MEDIUM", status: "PENDING" },
    { pickup_zone_id: zoneA._id, drop_zone_id: zoneB._id, weight: 1.9, priority: "URGENT", status: "PENDING" }
  ]);

  await logEvent({
    eventType: "TASK_BULK_CREATED",
    module: "TASK",
    severity: "SUCCESS",
    message: "Demo tasks seeded (3 tasks from Zone A).",
    actorId: null,
    metadata: { seeded: true, taskCount: 3 }
  });
}

async function seedAuditLogs() {
  const count = await Log.countDocuments({});
  if (count >= 6) return;

  const events = [
    ["TASK_CREATED",                 "TASK",   "SUCCESS", "Demo task created: Zone A \u2192 Zone B."],
    ["AUTO_TASK_ASSIGNED",           "TASK",   "SUCCESS", "Auto assignment: Robot-01 picked up task from Zone A."],
    ["ROBOT_RESET",                  "ROBOT",  "WARNING", "Demo robot reset event for audit visibility."],
    ["SYSTEM_HEALTH_CHECK",          "SYSTEM", "INFO",    "Demo system health check completed."]
  ];

  for (const [eventType, module, severity, message] of events) {
    await logEvent({ eventType, module, severity, message, actorId: null, metadata: { seeded: true } });
  }
}

async function seed() {
  await connectDb();
  await ensureZones();
  await ensureUser();
  await ensureRobot();
  await seedTasks();
  await seedAuditLogs();

  console.log("Demo seed complete.");
  console.log(`Demo login: ${DEMO_USER_EMAIL} / ${DEMO_PASSWORD}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed()
    .catch((error) => {
      console.error("Demo seed failed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.connection.close();
    });
}
