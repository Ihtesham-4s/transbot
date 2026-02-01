import { getShortestPath } from "./warehouseGraph.js";

export const BATTERY_PER_UNIT = 2;
export const MAX_PAYLOAD_LIMIT = 5;

export function analyzeFeasibility({ task, robot, graph, batteryPerUnit = BATTERY_PER_UNIT }) {
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

  const pickup = task?.pickup_zone;
  const drop = task?.drop_zone;
  const start = robot?.location || "ZONE_CHARGE";

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

  if (battery < requiredBattery) {
    return {
      feasible: false,
      reason: "Insufficient battery for task",
      details: {
        distance,
        requiredBattery,
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
