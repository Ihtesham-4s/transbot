import { getShortestPath } from "./warehouseGraph.js";

export const BATTERY_PER_UNIT = 2;
export const MAX_PAYLOAD_LIMIT = 5;

export function analyzeFeasibility({
  task,
  robot,
  graph,
  batteryPerUnit = BATTERY_PER_UNIT,
  includeChargeReserve = false,
  chargeZoneCode = "ZONE_CHARGE"
}) {
  const weight = Number(task?.weight ?? 0);
  const rawMaxPayload = Number(robot?.maxPayload);
  const maxPayload = Number.isFinite(rawMaxPayload) ? Math.min(rawMaxPayload, MAX_PAYLOAD_LIMIT) : MAX_PAYLOAD_LIMIT;

  if (Number.isFinite(maxPayload) && weight > maxPayload) {
    return {
      feasible: false,
      reason: "Payload exceeds robot capacity",
      details: {
        weight,
        maxPayload
      }
    };
  }

  const pickup = task?.pickup_zone_id?.code || task?.pickup_zone || null;
  const drop = task?.drop_zone_id?.code || task?.drop_zone || null;
  const start = robot?.location_zone_id?.code || robot?.location || "ZONE_CHARGE";

  const toPickup = getShortestPath(graph, start, pickup) || {
    distance: 0,
    path: [start, pickup].filter(Boolean)
  };

  const toDrop = getShortestPath(graph, pickup, drop) || {
    distance: 0,
    path: [pickup, drop].filter(Boolean)
  };

  const distance = toPickup.distance + toDrop.distance;
  const mergedPath = [...toPickup.path];
  if (toDrop.path.length) {
    const startIndex = mergedPath.length && toDrop.path[0] === mergedPath[mergedPath.length - 1] ? 1 : 0;
    mergedPath.push(...toDrop.path.slice(startIndex));
  }
  const requiredBattery = distance * batteryPerUnit;
  const battery = Number(robot?.batteryLevel ?? 0);

  const dropToCharge = includeChargeReserve
    ? getShortestPath(graph, drop, chargeZoneCode) || { distance: 0, path: [drop, chargeZoneCode].filter(Boolean) }
    : { distance: 0, path: [] };
  const reserveDistance = Number(dropToCharge?.distance ?? 0);
  const reserveBattery = reserveDistance * batteryPerUnit;
  const totalRequiredBattery = includeChargeReserve ? requiredBattery + reserveBattery : requiredBattery;

  if (battery < totalRequiredBattery) {
    return {
      feasible: false,
      reason: includeChargeReserve
        ? "Insufficient battery: cannot complete task and still reach charging station after drop"
        : "Insufficient battery for task",
      details: {
        distance,
        requiredBattery,
        reserveDistance: includeChargeReserve ? reserveDistance : 0,
        reserveBattery: includeChargeReserve ? reserveBattery : 0,
        totalRequiredBattery,
        battery,
        path: mergedPath,
        start,
        pickup,
        drop,
        distance_to_pickup: toPickup.distance,
        distance_task: toDrop.distance,
        weight,
        maxPayload
      }
    };
  }

  return {
    feasible: true,
    details: {
      distance,
      requiredBattery,
      reserveDistance: includeChargeReserve ? reserveDistance : 0,
      reserveBattery: includeChargeReserve ? reserveBattery : 0,
      totalRequiredBattery,
      battery,
      path: mergedPath,
      start,
      pickup,
      drop,
      distance_to_pickup: toPickup.distance,
      distance_task: toDrop.distance,
      weight,
      maxPayload
    }
  };
}

// Always include the reserve needed to return to the charging dock.
// Using this helper avoids accidentally accepting tasks that would
// leave the robot stranded after drop-off.
export function analyzeFeasibilityWithReserve(options) {
  return analyzeFeasibility({ ...options, includeChargeReserve: true });
}
