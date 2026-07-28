/**
 * migrate_zones.js — One-time migration to 3-zone (A, B, C) system.
 *
 * Run this ONCE against your live database:
 *   node src/scripts/migrate_zones.js
 *
 * What it does:
 *   1. Deletes old zone documents (HOME, Z1, Z2, Z3, ZONE_CHARGE, ZONE_A, ZONE_B, ZONE_C, ZONE_D)
 *   2. Upserts the canonical 3 zones: A, B, C
 *   3. Nulls task pickup_zone_id / drop_zone_id that referenced deleted zones
 *   4. Resets any robot location referencing a deleted zone to Zone A
 *
 * Safe to re-run (idempotent).
 */

import { pathToFileURL } from "url";
import { connectDb, mongoose } from "../db.js";
import { Zone } from "../models/Zone.js";
import { Task } from "../models/Task.js";
import { Robot } from "../models/Robot.js";

const OLD_ZONE_CODES = ["HOME", "Z1", "Z2", "Z3", "ZONE_CHARGE", "ZONE_A", "ZONE_B", "ZONE_C", "ZONE_D"];

const NEW_ZONES = [
  { code: "A", name: "Zone A", label: "Zone A", type: "PICKUP",  description: "South \u2014 robot home (start of vertical aisle).", isHome: true,  active: true },
  { code: "B", name: "Zone B", label: "Zone B", type: "PICKUP",  description: "North \u2014 top of vertical aisle.",                isHome: false, active: true },
  { code: "C", name: "Zone C", label: "Zone C", type: "DROPOFF", description: "West of B \u2014 end of horizontal aisle.",          isHome: false, active: true }
];

async function migrate() {
  console.log("=== TransBot Zone Migration (3-zone) ===\n");

  await connectDb();
  console.log(`Connected to DB: ${mongoose.connection.name}\n`);

  // 1. Find old zone IDs before deleting
  const oldZones = await Zone.find({ code: { $in: OLD_ZONE_CODES } }).select("_id code").lean();
  const oldZoneIds = oldZones.map((z) => z._id);
  console.log(`Found ${oldZones.length} old zone(s) to remove: ${oldZones.map((z) => z.code).join(", ")}`);

  // 2. Upsert canonical zones A, B, C first
  for (const zone of NEW_ZONES) {
    const result = await Zone.findOneAndUpdate(
      { code: zone.code },
      { $set: zone },
      { upsert: true, new: true }
    );
    console.log(`  Upserted Zone ${result.code} (id=${result._id})`);
  }

  const zoneA = await Zone.findOne({ code: "A" });
  console.log(`\nZone A id: ${zoneA._id} (robot default location)`);

  // 3. Remove old zones (skip if A/B/C were originally named with old codes)
  if (oldZoneIds.length > 0) {
    const deletedResult = await Zone.deleteMany({ _id: { $in: oldZoneIds } });
    console.log(`\nDeleted ${deletedResult.deletedCount} old zone document(s).`);
  } else {
    console.log("\nNo old zones to delete.");
  }

  // 4. Null out tasks referencing deleted zones
  if (oldZoneIds.length > 0) {
    const pickupResult = await Task.updateMany(
      { pickup_zone_id: { $in: oldZoneIds } },
      { $set: { pickup_zone_id: null, status: "REJECTED" } }
    );
    const dropResult = await Task.updateMany(
      { drop_zone_id: { $in: oldZoneIds } },
      { $set: { drop_zone_id: null, status: "REJECTED" } }
    );
    console.log(`\nRejected ${pickupResult.modifiedCount} task(s) with stale pickup zone.`);
    console.log(`Rejected ${dropResult.modifiedCount} task(s) with stale drop zone.`);
  }

  // 5. Reset robot location if pointing at a deleted zone
  if (oldZoneIds.length > 0) {
    const robotResult = await Robot.updateMany(
      { location_zone_id: { $in: oldZoneIds } },
      { $set: { location_zone_id: zoneA._id } }
    );
    if (robotResult.modifiedCount > 0) {
      console.log(`\nReset ${robotResult.modifiedCount} robot(s) to Zone A.`);
    } else {
      console.log("\nRobot location already valid \u2014 no changes needed.");
    }
  }

  // 6. Summary
  const finalZones = await Zone.find({}).sort({ code: 1 }).lean();
  const finalTasks = await Task.countDocuments({});
  const finalRobots = await Robot.find({}).populate("location_zone_id").lean();

  console.log("\n=== Migration Complete ===");
  console.log(`\nZones in DB (${finalZones.length}):`);
  for (const z of finalZones) {
    console.log(`  ${z.code} — ${z.name} (${z.type})`);
  }
  console.log(`\nTotal tasks: ${finalTasks}`);
  console.log(`\nRobots (${finalRobots.length}):`);
  for (const r of finalRobots) {
    const loc = r.location_zone_id?.code || "unknown";
    console.log(`  ${r.name} — state: ${r.currentState}, zone: ${loc}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate()
    .catch((error) => {
      console.error("\nMigration failed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.connection.close();
      console.log("\nDB connection closed.");
    });
}
