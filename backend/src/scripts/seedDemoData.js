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

const zones = [
  { code: "ZONE_CHARGE", label: "Charging Dock", type: "CHARGING" },
  { code: "ZONE_A", label: "Receiving Area", type: "PICKUP" },
  { code: "ZONE_B", label: "Rack A1", type: "PICKUP" },
  { code: "ZONE_C", label: "Rack B2", type: "DROPOFF" },
  { code: "ZONE_D", label: "Shipping Area", type: "DROPOFF" }
];

async function ensureUser() {
  let user = await User.findOne({ email: DEMO_USER_EMAIL });
  if (user) {
    if (user.role !== "admin") {
      user.role = "admin";
      await user.save();
    }
    return user;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  user = await User.create({
    name: "Demo Manager",
    email: DEMO_USER_EMAIL,
    passwordHash,
    role: "admin"
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
  for (const zone of zones) {
    await Zone.findOneAndUpdate(
      { code: zone.code },
      { $set: { ...zone, active: true } },
      { upsert: true, new: true }
    );
  }
}

async function ensureRobot(user) {
  const chargeZone = await Zone.findOne({ code: "ZONE_CHARGE" });
  let robot = await Robot.findOne({}).sort({ createdAt: 1 });
  if (robot) return robot;

  robot = await Robot.create({
    name: "Robot-Prototype-01",
    currentState: "IDLE",
    autoMode: false,
    location_zone_id: chargeZone?._id
  });

  await logEvent({
    eventType: "ROBOT_STATE_UPDATED",
    module: "ROBOT",
    severity: "INFO",
    message: "Demo robot prototype initialized in IDLE state.",
    entityType: "Robot",
    entityId: robot._id,
    actorId: user._id,
    robot_id: robot._id,
    metadata: { seeded: true }
  });

  return robot;
}

async function seedTasks(user) {
  if ((await Task.countDocuments({})) > 0) return;

  const [zoneA, zoneB, zoneC, zoneD] = await Promise.all([
    Zone.findOne({ code: "ZONE_A" }),
    Zone.findOne({ code: "ZONE_B" }),
    Zone.findOne({ code: "ZONE_C" }),
    Zone.findOne({ code: "ZONE_D" })
  ]);

  const tasks = await Task.insertMany([
    {
      pickup_zone_id: zoneA._id,
      drop_zone_id: zoneC._id,
      weight: 2.4,
      priority: "HIGH",
      status: "PENDING"
    },
    {
      pickup_zone_id: zoneB._id,
      drop_zone_id: zoneD._id,
      weight: 1.2,
      priority: "MEDIUM",
      status: "PENDING"
    },
    {
      pickup_zone_id: zoneA._id,
      drop_zone_id: zoneD._id,
      weight: 4.8,
      priority: "URGENT",
      status: "PENDING"
    }
  ]);

  await logEvent({
    eventType: "TASK_BULK_CREATED",
    module: "TASK",
    severity: "SUCCESS",
    message: "Demo robot tasks seeded.",
    actorId: user._id,
    metadata: { seeded: true, taskCount: tasks.length }
  });
}

async function seedAuditLogs(user) {
  const count = await Log.countDocuments({});
  if (count >= 6) return;

  const events = [
    ["TASK_CREATED", "TASK", "SUCCESS", "Demo task created for receiving to packing."],
    ["AUTO_TASK_ASSIGNMENT_SKIPPED", "TASK", "INFO", "Auto assignment skipped while robot auto mode is off."],
    ["ROBOT_RESET", "ROBOT", "WARNING", "Demo robot reset event for audit visibility."],
    ["SYSTEM_HEALTH_CHECK", "SYSTEM", "INFO", "Demo system health check completed."]
  ];

  for (const [eventType, module, severity, message] of events) {
    await logEvent({
      eventType,
      module,
      severity,
      message,
      actorId: user._id,
      metadata: { seeded: true }
    });
  }
}

async function seed() {
  await connectDb();
  await ensureZones();
  const user = await ensureUser();
  await ensureRobot(user);
  await seedTasks(user);
  await seedAuditLogs(user);

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
