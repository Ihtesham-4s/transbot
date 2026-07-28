/**
 * Physical warehouse map — L-shaped track layout (3 zones).
 *
 * Real-world layout:
 *   Zone A = South (bottom) — robot home/start position
 *   Zone B = North (top)    — robot travels straight north from A to B
 *   Zone C = West of B      — robot turns left at B and travels west to C
 *
 *   Path shape (top-down view):
 *
 *     C ←─────────── B
 *                    │
 *                    │
 *                    │
 *                    A
 *
 * Coordinate system (x increases right, y increases down — SVG convention):
 *   A = (142, 147)  — bottom-right (south)
 *   B = (142,   0)  — top-right   (north)
 *   C = (  0,   0)  — top-left    (west of B)
 *
 * Scale: 1 unit ≈ 1 cm (147cm vertical leg, 142cm horizontal leg).
 * Horizontal distance chosen proportionally to match aisles "71cm apart" × 2 bays.
 */

export const warehouseMap = Object.freeze({
  widthCm: 142,
  heightCm: 147,
  zones: Object.freeze([
    { id: "A", x: 142, y: 147, type: "PICKUP",  label: "Zone A" }, // South — home
    { id: "B", x: 142, y: 0,   type: "PICKUP",  label: "Zone B" }, // North
    { id: "C", x: 0,   y: 0,   type: "DROPOFF", label: "Zone C" }  // West of B
  ]),
  // Ordered track nodes for drawing the L-shaped path
  trackNodes: Object.freeze([
    { x: 142, y: 147 }, // A (south)
    { x: 142, y: 0   }, // B (north)
    { x: 0,   y: 0   }  // C (west of B)
  ]),
  paths: Object.freeze([
    Object.freeze(["A", "B"]),
    Object.freeze(["A", "C"]),
    Object.freeze(["B", "A"]),
    Object.freeze(["B", "C"]),
    Object.freeze(["C", "A"]),
    Object.freeze(["C", "B"])
  ])
});

const ZONE_LOOKUP = new Map(warehouseMap.zones.map((zone) => [zone.id, zone]));
const DEFAULT_ROUTE = Object.freeze(["A", "B", "C"]);
const SEGMENT_DURATION_MS = 5000;

function cloneZone(zone) {
  return { ...zone };
}

export function getWarehouseMap() {
  return {
    widthCm: warehouseMap.widthCm,
    heightCm: warehouseMap.heightCm,
    zones: warehouseMap.zones.map(cloneZone),
    paths: warehouseMap.paths.map((path) => [...path]),
    trackNodes: [...warehouseMap.trackNodes],
    defaultRoute: [...DEFAULT_ROUTE]
  };
}

export function getDefaultTaskRoute() {
  return [...DEFAULT_ROUTE];
}

/**
 * Normalise an incoming zone identifier to one of the canonical IDs: "A", "B", "C".
 * Accepts objects (with .code/.id/.label/.name), strings like "Zone A", "ZONE_A", "zone-c", "A", etc.
 */
export function normalizeMapZoneCode(value) {
  const raw =
    value && typeof value === "object"
      ? value.code || value.id || value.label || value.name || ""
      : value;
  const normalized = String(raw || "").trim().toUpperCase();

  if (ZONE_LOOKUP.has(normalized)) return normalized;

  // Accept "Zone A" / "ZONE_A" / "zone-b" style
  const match = normalized.match(/\bZONE[_\s-]*([A-C])\b/);
  if (match?.[1] && ZONE_LOOKUP.has(match[1])) return match[1];

  const letterMatch = normalized.match(/\b([A-C])\b/);
  if (letterMatch?.[1] && ZONE_LOOKUP.has(letterMatch[1])) return letterMatch[1];

  return null;
}

/**
 * Returns the shortest ordered route (array of zone IDs) from startZone to endZone
 * along the L-shaped track.
 *
 * The physical route connectivity is:  A ↔ B ↔ C
 * so A→C means passing through B, and C→A means passing through B.
 */
export function routeForZones(startZone, endZone) {
  const start = normalizeMapZoneCode(startZone);
  const end = normalizeMapZoneCode(endZone);

  if (!start || !end) return [...DEFAULT_ROUTE];
  if (start === end) return [start];

  // Physical adjacency on L-track: A-B-C in a line
  const TRACK_ORDER = ["A", "B", "C"];
  const startIdx = TRACK_ORDER.indexOf(start);
  const endIdx = TRACK_ORDER.indexOf(end);

  if (startIdx === -1 || endIdx === -1) return [...DEFAULT_ROUTE];

  // Walk from start to end (forward or backward along the chain)
  const step = endIdx > startIdx ? 1 : -1;
  const route = [];
  for (let i = startIdx; i !== endIdx + step; i += step) {
    route.push(TRACK_ORDER[i]);
  }
  return route;
}

export function getZoneByMapId(id) {
  const zone = ZONE_LOOKUP.get(normalizeMapZoneCode(id));
  return zone ? cloneZone(zone) : null;
}

export function getRouteSegments(route = DEFAULT_ROUTE) {
  const normalizedRoute = route.map(normalizeMapZoneCode).filter(Boolean);
  const effectiveRoute = normalizedRoute.length > 1 ? normalizedRoute : [...DEFAULT_ROUTE];

  return effectiveRoute.slice(0, -1).map((fromId, index) => {
    const toId = effectiveRoute[index + 1];
    return {
      from: fromId,
      to: toId,
      fromZone: cloneZone(ZONE_LOOKUP.get(fromId)),
      toZone: cloneZone(ZONE_LOOKUP.get(toId))
    };
  });
}

function interpolatePoint(fromZone, toZone, progress) {
  return {
    x: fromZone.x + (toZone.x - fromZone.x) * progress,
    y: fromZone.y + (toZone.y - fromZone.y) * progress
  };
}

function nearestZoneId(point) {
  let nearest = warehouseMap.zones[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const zone of warehouseMap.zones) {
    const dx = point.x - zone.x;
    const dy = point.y - zone.y;
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearest = zone;
      nearestDistance = distance;
    }
  }
  return nearest.id;
}

export function getRobotSimulationStatus({
  route = DEFAULT_ROUTE,
  taskId = "SIM-TASK-001",
  now = Date.now(),
  task = null,
  idleZone = null
} = {}) {
  const normalizedRoute = (route || []).map(normalizeMapZoneCode).filter(Boolean);
  const effectiveRoute = normalizedRoute.length > 1 ? normalizedRoute : [...DEFAULT_ROUTE];
  const segments = getRouteSegments(effectiveRoute);

  // 1. Active task in progress
  if (task) {
    const start = task.startedAt || task.assignedAt || task.createdAt || now;
    const startTime = new Date(start).getTime();
    const elapsed = now - startTime;
    const loopDuration = segments.length * SEGMENT_DURATION_MS;

    if (elapsed >= loopDuration) {
      const destZone = segments[segments.length - 1]?.toZone || ZONE_LOOKUP.get(effectiveRoute[effectiveRoute.length - 1]) || ZONE_LOOKUP.get("C");
      return {
        x: destZone.x, y: destZone.y,
        currentZone: destZone.id, status: "IDLE", taskStatus: "COMPLETED",
        currentTask: taskId, progress: 100, route: [...effectiveRoute], segment: null, completed: true
      };
    }

    if (elapsed <= 0) {
      const startZone = segments[0]?.fromZone || ZONE_LOOKUP.get(effectiveRoute[0]) || ZONE_LOOKUP.get("A");
      return {
        x: startZone.x, y: startZone.y,
        currentZone: startZone.id, status: "ASSIGNED", taskStatus: "ASSIGNED",
        currentTask: taskId, progress: 0, route: [...effectiveRoute], segment: null
      };
    }

    const segmentIndex = Math.min(segments.length - 1, Math.floor(elapsed / SEGMENT_DURATION_MS));
    const segmentProgress = (elapsed % SEGMENT_DURATION_MS) / SEGMENT_DURATION_MS;
    const segment = segments[segmentIndex];
    const point = interpolatePoint(segment.fromZone, segment.toZone, segmentProgress);
    const progress = Math.min(99, Math.round(((segmentIndex + segmentProgress) / segments.length) * 100));

    return {
      x: Math.round(point.x), y: Math.round(point.y),
      currentZone: nearestZoneId(point), status: "MOVING", taskStatus: "IN_PROGRESS",
      currentTask: taskId, progress, route: [...effectiveRoute],
      segment: { from: segment.from, to: segment.to, index: segmentIndex, progress: Number(segmentProgress.toFixed(2)) }
    };
  }

  // 2. Static idle at known zone
  if (idleZone) {
    const zone = ZONE_LOOKUP.get(normalizeMapZoneCode(idleZone)) || ZONE_LOOKUP.get("A");
    return {
      x: zone.x, y: zone.y, currentZone: zone.id, status: "IDLE",
      taskStatus: "STATIC", currentTask: null, progress: 0, route: [zone.id], segment: null
    };
  }

  // 3. Fallback clock-based loop simulation
  if (segments.length === 0) {
    const zone = ZONE_LOOKUP.get(effectiveRoute[0]) || ZONE_LOOKUP.get("A");
    return {
      x: zone.x, y: zone.y, currentZone: zone.id, status: "IDLE",
      taskStatus: "PENDING", currentTask: taskId, progress: 0, route: [...effectiveRoute], segment: null
    };
  }

  const loopDuration = segments.length * SEGMENT_DURATION_MS;
  const elapsed = ((now % loopDuration) + loopDuration) % loopDuration;
  const segmentIndex = Math.min(segments.length - 1, Math.floor(elapsed / SEGMENT_DURATION_MS));
  const segmentProgress = (elapsed % SEGMENT_DURATION_MS) / SEGMENT_DURATION_MS;
  const segment = segments[segmentIndex];
  const point = interpolatePoint(segment.fromZone, segment.toZone, segmentProgress);
  const progress = Math.round(((segmentIndex + segmentProgress) / segments.length) * 100);

  return {
    x: Math.round(point.x), y: Math.round(point.y),
    currentZone: nearestZoneId(point), status: "MOVING",
    taskStatus: progress >= 98 ? "COMPLETING" : "IN_PROGRESS",
    currentTask: taskId, progress, route: [...effectiveRoute],
    segment: { from: segment.from, to: segment.to, index: segmentIndex, progress: Number(segmentProgress.toFixed(2)) }
  };
}
