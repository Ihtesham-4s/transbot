export const warehouseMap = Object.freeze({
  width: 200,
  height: 300,
  zones: Object.freeze([
    { id: "A", x: 0, y: 0, type: "PICKUP", label: "Zone A" },
    { id: "B", x: 200, y: 0, type: "PICKUP", label: "Zone B" },
    { id: "C", x: 200, y: 300, type: "DROP", label: "Zone C" },
    { id: "D", x: 0, y: 300, type: "DROP", label: "Zone D" }
  ]),
  paths: Object.freeze([
    Object.freeze(["A", "B"]),
    Object.freeze(["B", "C"]),
    Object.freeze(["C", "D"]),
    Object.freeze(["D", "A"])
  ])
});

const DEFAULT_ROUTE = Object.freeze(["A", "B", "C", "D"]);
const ROUTE_RING = Object.freeze(["A", "B", "C", "D"]);
const SEGMENT_DURATION_MS = 5000;
const ZONE_LOOKUP = new Map(warehouseMap.zones.map((zone) => [zone.id, zone]));

function cloneZone(zone) {
  return { ...zone };
}

export function getWarehouseMap() {
  return {
    width: warehouseMap.width,
    height: warehouseMap.height,
    zones: warehouseMap.zones.map(cloneZone),
    paths: warehouseMap.paths.map((path) => [...path]),
    defaultRoute: [...DEFAULT_ROUTE]
  };
}

export function getDefaultTaskRoute() {
  return [...DEFAULT_ROUTE];
}

export function normalizeMapZoneCode(value) {
  const raw =
    value && typeof value === "object"
      ? value.code || value.id || value.label || value.name || ""
      : value;
  const normalized = String(raw || "").trim().toUpperCase();

  if (ZONE_LOOKUP.has(normalized)) return normalized;

  const zoneMatch = normalized.match(/\bZONE[_\s-]*([A-D])\b/);
  if (zoneMatch?.[1] && ZONE_LOOKUP.has(zoneMatch[1])) return zoneMatch[1];

  const singleLetterMatch = normalized.match(/\b([A-D])\b/);
  if (singleLetterMatch?.[1] && ZONE_LOOKUP.has(singleLetterMatch[1])) return singleLetterMatch[1];

  return null;
}

export function routeForZones(startZone, endZone) {
  const start = normalizeMapZoneCode(startZone) || DEFAULT_ROUTE[0];
  const end = normalizeMapZoneCode(endZone) || DEFAULT_ROUTE[DEFAULT_ROUTE.length - 1];
  const startIndex = ROUTE_RING.indexOf(start);
  const endIndex = ROUTE_RING.indexOf(end);

  if (startIndex === -1 || endIndex === -1) return getDefaultTaskRoute();
  if (start === end) return [start];

  const route = [start];
  let cursor = startIndex;

  while (route[route.length - 1] !== end && route.length <= ROUTE_RING.length) {
    cursor = (cursor + 1) % ROUTE_RING.length;
    route.push(ROUTE_RING[cursor]);
  }

  return route;
}

export function getZoneByMapId(id) {
  const zone = ZONE_LOOKUP.get(normalizeMapZoneCode(id));
  return zone ? cloneZone(zone) : null;
}

export function getRouteSegments(route = DEFAULT_ROUTE) {
  const normalizedRoute = route.map(normalizeMapZoneCode).filter(Boolean);
  const effectiveRoute = normalizedRoute.length > 1 ? normalizedRoute : DEFAULT_ROUTE;

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
  const effectiveRoute = normalizedRoute.length > 1 ? normalizedRoute : DEFAULT_ROUTE;
  const segments = getRouteSegments(effectiveRoute);

  // 1. If we have an active task in progress
  if (task) {
    const start = task.startedAt || task.assignedAt || task.createdAt || now;
    const startTime = new Date(start).getTime();
    const elapsed = now - startTime;
    const loopDuration = segments.length * SEGMENT_DURATION_MS;

    if (elapsed >= loopDuration) {
      const destZone = segments[segments.length - 1]?.toZone || ZONE_LOOKUP.get(effectiveRoute[effectiveRoute.length - 1]) || ZONE_LOOKUP.get("D");
      return {
        x: destZone.x,
        y: destZone.y,
        currentZone: destZone.id,
        status: "IDLE",
        taskStatus: "COMPLETED",
        currentTask: taskId,
        progress: 100,
        route: [...effectiveRoute],
        segment: null,
        completed: true
      };
    }

    if (elapsed <= 0) {
      const startZone = segments[0]?.fromZone || ZONE_LOOKUP.get(effectiveRoute[0]) || ZONE_LOOKUP.get("A");
      return {
        x: startZone.x,
        y: startZone.y,
        currentZone: startZone.id,
        status: "ASSIGNED",
        taskStatus: "ASSIGNED",
        currentTask: taskId,
        progress: 0,
        route: [...effectiveRoute],
        segment: null
      };
    }

    const segmentIndex = Math.min(segments.length - 1, Math.floor(elapsed / SEGMENT_DURATION_MS));
    const segmentProgress = (elapsed % SEGMENT_DURATION_MS) / SEGMENT_DURATION_MS;
    const segment = segments[segmentIndex];
    const point = interpolatePoint(segment.fromZone, segment.toZone, segmentProgress);
    const progress = Math.min(99, Math.round(((segmentIndex + segmentProgress) / segments.length) * 100));

    return {
      x: Math.round(point.x),
      y: Math.round(point.y),
      currentZone: nearestZoneId(point),
      status: "MOVING",
      taskStatus: "IN_PROGRESS",
      currentTask: taskId,
      progress,
      route: [...effectiveRoute],
      segment: {
        from: segment.from,
        to: segment.to,
        index: segmentIndex,
        progress: Number(segmentProgress.toFixed(2))
      }
    };
  }

  // 2. If no active task and we want to place it statically at idleZone
  if (idleZone) {
    const zone = ZONE_LOOKUP.get(normalizeMapZoneCode(idleZone)) || ZONE_LOOKUP.get("A");
    return {
      x: zone.x,
      y: zone.y,
      currentZone: zone.id,
      status: "IDLE",
      taskStatus: "STATIC",
      currentTask: null,
      progress: 0,
      route: [zone.id],
      segment: null
    };
  }

  // 3. Fallback clock-based loop simulation for interactive demo
  if (segments.length === 0) {
    const zone = ZONE_LOOKUP.get(effectiveRoute[0]) || ZONE_LOOKUP.get(DEFAULT_ROUTE[0]);
    return {
      x: zone.x,
      y: zone.y,
      currentZone: zone.id,
      status: "IDLE",
      taskStatus: "PENDING",
      currentTask: taskId,
      progress: 0,
      route: [...effectiveRoute],
      segment: null
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
    x: Math.round(point.x),
    y: Math.round(point.y),
    currentZone: nearestZoneId(point),
    status: "MOVING",
    taskStatus: progress >= 98 ? "COMPLETING" : "IN_PROGRESS",
    currentTask: taskId,
    progress,
    route: [...effectiveRoute],
    segment: {
      from: segment.from,
      to: segment.to,
      index: segmentIndex,
      progress: Number(segmentProgress.toFixed(2))
    }
  };
}
