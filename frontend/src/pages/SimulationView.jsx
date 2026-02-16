import { Bot, LogOut, Pause, Play } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../lib/cn";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useAuth } from "../context/AuthContext";
import { getRobot, listTasks, getTaskFeasibility, startTask, completeTask } from "../lib/api";
import { ROBOT_STATES } from "../constants/robotStates";

const ZONE_NODES = Object.freeze({
  ZONE_CHARGE: { x: 120, y: 460, label: "Charging" },
  ZONE_A: { x: 130, y: 90, label: "Zone A" },
  ZONE_B: { x: 440, y: 80, label: "Zone B" },
  ZONE_C: { x: 440, y: 340, label: "Zone C" },
  ZONE_D: { x: 820, y: 150, label: "Zone D" },
  ZONE_E: { x: 820, y: 360, label: "Zone E" }
});

const ZONE_EDGES = Object.freeze([
  ["ZONE_CHARGE", "ZONE_A"],
  ["ZONE_CHARGE", "ZONE_B"],
  ["ZONE_A", "ZONE_B"],
  ["ZONE_A", "ZONE_C"],
  ["ZONE_B", "ZONE_C"],
  ["ZONE_B", "ZONE_D"],
  ["ZONE_C", "ZONE_D"],
  ["ZONE_C", "ZONE_E"],
  ["ZONE_D", "ZONE_E"]
]);

const BATTERY_PER_UNIT = 2;
const CHARGE_TRAVEL_SECONDS_PER_UNIT = 2;

const ZONE_EDGE_DISTANCE = Object.freeze({
  "ZONE_CHARGE-ZONE_A": 2,
  "ZONE_CHARGE-ZONE_B": 3,
  "ZONE_A-ZONE_B": 4,
  "ZONE_A-ZONE_C": 6,
  "ZONE_B-ZONE_C": 3,
  "ZONE_B-ZONE_D": 5,
  "ZONE_C-ZONE_D": 2,
  "ZONE_C-ZONE_E": 4,
  "ZONE_D-ZONE_E": 3
});

function edgeKey(a, b) {
  return [a, b].sort().join("-");
}

function buildAdjacency() {
  const adj = new Map();
  Object.keys(ZONE_NODES).forEach((z) => adj.set(z, []));
  ZONE_EDGES.forEach(([from, to]) => {
    if (!adj.has(from) || !adj.has(to)) return;
    const sorted = edgeKey(from, to);
    const direct = `${from}-${to}`;
    const reverse = `${to}-${from}`;
    const dist =
      ZONE_EDGE_DISTANCE[sorted] ??
      ZONE_EDGE_DISTANCE[direct] ??
      ZONE_EDGE_DISTANCE[reverse] ??
      1;
    adj.get(from).push({ to, distance: dist });
    adj.get(to).push({ to: from, distance: dist });
  });
  return adj;
}

const GRAPH_ADJACENCY = buildAdjacency();

function findPath(start, end) {
  if (!start || !end) return [];
  if (start === end) return [start];
  if (!GRAPH_ADJACENCY.has(start) || !GRAPH_ADJACENCY.has(end)) return [];

  // Dijkstra (weighted) — matches backend's shortest-distance routing.
  const dist = new Map();
  const prev = new Map();
  const visited = new Set();

  for (const node of GRAPH_ADJACENCY.keys()) {
    dist.set(node, Number.POSITIVE_INFINITY);
  }
  dist.set(start, 0);

  while (visited.size < GRAPH_ADJACENCY.size) {
    let current = null;
    let best = Number.POSITIVE_INFINITY;

    for (const [node, d] of dist.entries()) {
      if (visited.has(node)) continue;
      if (d < best) {
        best = d;
        current = node;
      }
    }

    if (!current) break;
    if (current === end) break;

    visited.add(current);
    const neighbors = GRAPH_ADJACENCY.get(current) || [];
    for (const n of neighbors) {
      if (visited.has(n.to)) continue;
      const candidate = best + (Number(n.distance) || 0);
      if (candidate < (dist.get(n.to) ?? Number.POSITIVE_INFINITY)) {
        dist.set(n.to, candidate);
        prev.set(n.to, current);
      }
    }
  }

  const final = dist.get(end);
  if (!Number.isFinite(final) || final === Number.POSITIVE_INFINITY) return [];

  const path = [];
  let cur = end;
  while (cur) {
    path.unshift(cur);
    if (cur === start) break;
    cur = prev.get(cur);
  }
  if (!path.length || path[0] !== start) return [];
  return path;
}

function buildSegments(path) {
  const points = path
    .map((zone) => ZONE_NODES[zone])
    .filter(Boolean)
    .map((node) => ({ x: node.x, y: node.y }));

  if (points.length < 2) return { points, segments: [], total: 0 };

  const segments = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    segments.push({ a, b, len });
    total += len;
  }
  return { points, segments, total };
}

function getGraphDistance(path) {
  if (!Array.isArray(path) || path.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const sorted = edgeKey(a, b);
    const direct = `${a}-${b}`;
    const reverse = `${b}-${a}`;
    const dist =
      ZONE_EDGE_DISTANCE[sorted] ??
      ZONE_EDGE_DISTANCE[direct] ??
      ZONE_EDGE_DISTANCE[reverse];
    if (typeof dist === "number") total += dist;
  }
  return total;
}

function positionAlong(segments, total, distance) {
  if (!segments.length) return null;
  let remaining = distance;
  for (const seg of segments) {
    if (remaining <= seg.len) {
      const t = seg.len === 0 ? 0 : remaining / seg.len;
      return {
        x: seg.a.x + (seg.b.x - seg.a.x) * t,
        y: seg.a.y + (seg.b.y - seg.a.y) * t
      };
    }
    remaining -= seg.len;
  }
  const last = segments[segments.length - 1];
  return { x: last.b.x, y: last.b.y };
}

function formatSeconds(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return "—";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.max(0, totalSeconds % 60);
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export default function SimulationView() {
  const { user, token, logout } = useAuth();
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [robot, setRobot] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [_loading, setLoading] = useState(true);
  const [feasibility, setFeasibility] = useState(null);
  const [robotPos, setRobotPos] = useState(null);
  const [simulationPaused, setSimulationPaused] = useState(false);
  const [acting, setActing] = useState(false);
  const [chargingTrip, setChargingTrip] = useState(false);
  const [localChargeArrived, setLocalChargeArrived] = useState(false);
  const [chargingOrigin, setChargingOrigin] = useState(null);
  const [taskTripComplete, setTaskTripComplete] = useState(false);
  const motionProgressRef = useRef(0);
  const progressRef = useRef(0);
  const [pickupHold, setPickupHold] = useState(false);
  const [movePhase, setMovePhase] = useState("toPickup");
  const [progressPct, setProgressPct] = useState(0);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [simElapsed, setSimElapsed] = useState(0);
  const [showPath, setShowPath] = useState(true);
  const [showPov, _setShowPov] = useState(true);
  const [povZoom, _setPovZoom] = useState(2.4);
  const tripStartBatteryRef = useRef(null);
  const lastChargeAnimatedForRef = useRef(null);
  const lastRobotLocationRef = useRef(null);
  const lastChargeOriginRef = useRef(null);
  const [lastChargeCompletedId, setLastChargeCompletedId] = useState(() => {
    try {
      return localStorage.getItem("simulation.lastChargeCompletedId") || "";
    } catch {
      return "";
    }
  });

  const navigate = useNavigate();
  const dashboardPath = user?.role === "admin" ? "/admin" : "/operator";

  const activeTask = useMemo(() => {
    return tasks.find((t) => t.status === "IN_PROGRESS") || tasks.find((t) => t.status === "ASSIGNED") || null;
  }, [tasks]);

  const lastCompletedMeta = useMemo(() => {
    const completed = tasks
      .filter((t) => t.status === "COMPLETED")
      .sort((a, b) => {
        const ta = new Date(a.createdAt).getTime();
        const tb = new Date(b.createdAt).getTime();
        return tb - ta;
      });
    const last = completed[0] || null;
    return last
      ? {
          id: last.id || last._id,
          drop: last.drop_zone || null
        }
      : { id: null, drop: null };
  }, [tasks]);
  const lastCompletedTaskId = lastCompletedMeta.id;
  const lastCompletedDrop = lastCompletedMeta.drop;

  const analysis = feasibility?.analysis || null;
  const basePath = analysis?.details?.path || [];
  const robotLocation = robot?.location_zone_id?.code || robot?.location || null;
  const batteryLevel = Number(robot?.batteryLevel ?? 0);
  const lowBattery = batteryLevel <= 20;
  const isMoving = robot?.currentState === ROBOT_STATES.MOVING;
  const atDockEffective = robotLocation === "ZONE_CHARGE" || localChargeArrived;
  const isCharging = atDockEffective && robot?.currentState === ROBOT_STATES.IDLE && batteryLevel < 100;
  const isFullBattery = batteryLevel >= 100;
  const batteryDepleted = batteryLevel <= 0;
  const hasPendingTasks = useMemo(() => tasks.some((t) => t.status === "PENDING"), [tasks]);
  const chargingTravelActive = useMemo(() => {
    if (!robot?.chargingUntil) return false;
    const until = new Date(robot.chargingUntil).getTime();
    return Number.isFinite(until) && until > Date.now();
  }, [robot?.chargingUntil]);

  const shouldShowChargeTrip =
    robot?.currentState === ROBOT_STATES.IDLE &&
    robot?.currentState !== ROBOT_STATES.ERROR &&
    !batteryDepleted &&
    !atDockEffective &&
    (chargingTravelActive || lowBattery || (!activeTask && !hasPendingTasks));
  const canPause = (isMoving || chargingTrip || pickupHold) && !taskTripComplete;

  const chargePath = useMemo(() => {
    if (localChargeArrived) return [];
    if (!shouldShowChargeTrip && !chargingTrip) return [];
    const from = chargingOrigin || (robotLocation && robotLocation !== "ZONE_CHARGE" ? robotLocation : null) || lastCompletedDrop;
    if (!from) return [];
    return findPath(from, "ZONE_CHARGE");
  }, [localChargeArrived, shouldShowChargeTrip, chargingTrip, robotLocation, chargingOrigin, lastCompletedDrop]);

  const chargeDistance = useMemo(() => getGraphDistance(chargePath), [chargePath]);
  const chargeDrain = useMemo(() => chargeDistance * BATTERY_PER_UNIT, [chargeDistance]);

  const pickup = activeTask?.pickup_zone;
  const drop = activeTask?.drop_zone;

  const fallbackTaskPath = useMemo(() => {
    if (!activeTask || !pickup || !drop) return [];
    const start = robotLocation || "ZONE_CHARGE";
    const toPickup = findPath(start, pickup);
    const toDrop = findPath(pickup, drop);
    if (!toPickup.length && !toDrop.length) return [];
    if (!toPickup.length) return toDrop;
    if (!toDrop.length) return toPickup;
    const merged = [...toPickup];
    const startIndex = toDrop[0] === merged[merged.length - 1] ? 1 : 0;
    merged.push(...toDrop.slice(startIndex));
    return merged;
  }, [activeTask, pickup, drop, robotLocation]);

  const displayPath = chargingTrip && chargePath.length ? chargePath : basePath.length ? basePath : fallbackTaskPath;
  const pathEdges = new Set();

  for (let i = 0; i < displayPath.length - 1; i += 1) {
    pathEdges.add(edgeKey(displayPath[i], displayPath[i + 1]));
  }

  const segmentsInfo = useMemo(() => buildSegments(displayPath), [displayPath]);
  const pickupIndex = useMemo(() => {
    if (!pickup || !displayPath.length) return -1;
    return displayPath.indexOf(pickup);
  }, [displayPath, pickup]);

  const pathToPickup = useMemo(() => {
    if (pickupIndex <= 0) return displayPath.length ? [displayPath[0]] : [];
    return displayPath.slice(0, pickupIndex + 1);
  }, [displayPath, pickupIndex]);

  const pathToDrop = useMemo(() => {
    if (pickupIndex < 0) return displayPath;
    return displayPath.slice(pickupIndex);
  }, [displayPath, pickupIndex]);

  const pickupDistance = useMemo(() => {
    const fromAnalysis = analysis?.details?.distance_to_pickup;
    if (Number.isFinite(fromAnalysis)) return fromAnalysis;
    return getGraphDistance(pathToPickup);
  }, [analysis?.details?.distance_to_pickup, pathToPickup]);

  const dropDistance = useMemo(() => {
    const fromAnalysis = analysis?.details?.distance_task;
    if (Number.isFinite(fromAnalysis)) return fromAnalysis;
    return getGraphDistance(pathToDrop);
  }, [analysis?.details?.distance_task, pathToDrop]);

  const pickupDrain = useMemo(() => pickupDistance * BATTERY_PER_UNIT, [pickupDistance]);
  const dropDrain = useMemo(() => dropDistance * BATTERY_PER_UNIT, [dropDistance]);

  useEffect(() => {
    const inTrip = Boolean(chargingTrip) || (Boolean(isMoving) && Boolean(activeTask));
    if (inTrip) {
      if (tripStartBatteryRef.current == null) {
        tripStartBatteryRef.current = batteryLevel;
      }
    } else {
      tripStartBatteryRef.current = null;
    }
  }, [chargingTrip, isMoving, activeTask, batteryLevel]);

  const taskDrainSoFar = useMemo(() => {
    if (!isMoving || chargingTrip || !activeTask) return 0;
    const phaseProgress = Math.min(1, Math.max(0, progressPct));
    if (movePhase === "toDrop") return pickupDrain + dropDrain * phaseProgress;
    return pickupDrain * phaseProgress;
  }, [isMoving, chargingTrip, activeTask, movePhase, pickupDrain, dropDrain, progressPct]);

  const displayBatteryLevel = useMemo(() => {
    const startBattery = Number.isFinite(tripStartBatteryRef.current) ? tripStartBatteryRef.current : batteryLevel;
    if (chargingTrip && chargeDrain > 0) {
      const phaseProgress = Math.min(1, Math.max(0, progressPct));
      const current = Math.max(0, startBattery - chargeDrain * phaseProgress);
      return Math.round(current * 10) / 10;
    }
    if (isMoving && taskDrainSoFar > 0) {
      const current = Math.max(0, startBattery - taskDrainSoFar);
      return Math.round(current * 10) / 10;
    }
    return batteryLevel;
  }, [chargingTrip, chargeDrain, batteryLevel, progressPct, isMoving, taskDrainSoFar]);

  const pickupSegments = useMemo(() => buildSegments(pathToPickup), [pathToPickup]);
  const dropSegments = useMemo(() => buildSegments(pathToDrop), [pathToDrop]);
  const chargeSegments = useMemo(() => buildSegments(chargePath), [chargePath]);

  const queuedTasks = useMemo(() => {
    return tasks.filter((t) => t.status === "ASSIGNED").slice(0, 4);
  }, [tasks]);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    try {
      const [robotRes, taskRes] = await Promise.all([getRobot(token), listTasks(token)]);
      setRobot(robotRes || null);
      setTasks(taskRes?.tasks || []);
    } finally {
      setLoading(false);
    }
  }

  async function handleStart() {
    if (!activeTask?.id) return;
    const isResume = activeTask.status === "IN_PROGRESS";
    setActing(true);
    try {
      try {
        await startTask(token, activeTask.id);
      } catch {
        // If we're resuming an already-started task, allow the UI to continue
        // even if the backend start endpoint rejects (e.g., after a hot-reload).
        if (!isResume) throw new Error("Start failed.");
      }
      if (!isResume) {
        setTaskTripComplete(false);
        setPickupHold(false);
        setMovePhase("toPickup");
      } else {
        setSimulationPaused(false);
      }
      await refresh();
    } finally {
      setActing(false);
    }
  }

  async function handleComplete() {
    if (!activeTask?.id) return;
    setActing(true);
    try {
      let adminManualMode = false;
      if (user?.role === "admin") {
        try {
          adminManualMode = localStorage.getItem("taskpanel.adminManualMode") === "true";
        } catch {
          adminManualMode = false;
        }
      }
      const shouldAutoAssign = !user?.role || user?.role !== "admin" || !adminManualMode;
      await completeTask(token, activeTask.id, { auto: shouldAutoAssign });
      await refresh();
    } finally {
      setActing(false);
    }
  }

  function handlePauseToggle() {
    if (!canPause) return;
    setSimulationPaused((prev) => {
      const next = !prev;
      if (!next && pickupHold) {
        setPickupHold(false);
        motionProgressRef.current = 0;
      }
      return next;
    });
  }

  useEffect(() => {
    refresh();
    const t = setInterval(() => refresh(), 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token || !activeTask?.id) {
      setFeasibility(null);
      return;
    }
    let alive = true;
    getTaskFeasibility(token, activeTask.id)
      .then((res) => {
        if (!alive) return;
        setFeasibility(res || null);
      })
      .catch(() => {
        if (!alive) return;
        setFeasibility(null);
      });

    return () => {
      alive = false;
    };
  }, [token, activeTask?.id]);


  useEffect(() => {
    const currentLocation = robotLocation || null;
    if (currentLocation) {
      lastRobotLocationRef.current = currentLocation;
    }
  }, [robotLocation]);

  useEffect(() => {
    if (localChargeArrived) {
      // Keep the robot pinned to the dock until backend location catches up.
      setChargingTrip(false);
      setChargingOrigin(null);
      const dock = ZONE_NODES.ZONE_CHARGE;
      if (dock) setRobotPos({ x: dock.x, y: dock.y });
      return;
    }
    if (chargingTravelActive) {
      // If we already snapped to the dock locally or the backend reports the dock,
      // never (re)start a local charge-trip animation.
      if (localChargeArrived || robotLocation === "ZONE_CHARGE") {
        setChargingTrip(false);
        setChargingOrigin(null);
        return;
      }
      const origin = chargingOrigin || lastRobotLocationRef.current || lastCompletedDrop || robotLocation;
      if (origin && origin !== "ZONE_CHARGE") {
        setChargingTrip(true);
        setChargingOrigin(origin);
        const originNode = ZONE_NODES[origin];
        if (originNode) setRobotPos({ x: originNode.x, y: originNode.y });
        return;
      }
    }

    if (hasPendingTasks && !chargingTrip && !lowBattery && !chargingTravelActive) {
      setChargingTrip(false);
      setChargingOrigin(null);
      const location = robotLocation || "ZONE_CHARGE";
      const node = ZONE_NODES[location] || ZONE_NODES.ZONE_CHARGE;
      setRobotPos(node ? { x: node.x, y: node.y } : null);
      return;
    }

    const location = robotLocation || "ZONE_CHARGE";
    const prevLocation = lastRobotLocationRef.current;
    if (
      shouldShowChargeTrip &&
      location === "ZONE_CHARGE" &&
      prevLocation &&
      prevLocation !== "ZONE_CHARGE" &&
      lastChargeOriginRef.current !== prevLocation
    ) {
      lastChargeOriginRef.current = prevLocation;
      setChargingTrip(true);
      setChargingOrigin(prevLocation);
      const originNode = ZONE_NODES[prevLocation];
      if (originNode) setRobotPos({ x: originNode.x, y: originNode.y });
      return;
    }

    if (shouldShowChargeTrip && location !== "ZONE_CHARGE") {
      if (lastCompletedTaskId) lastChargeAnimatedForRef.current = lastCompletedTaskId;
      setChargingTrip(true);
      setChargingOrigin(location);
      const originNode = ZONE_NODES[location];
      if (originNode) setRobotPos({ x: originNode.x, y: originNode.y });
      return;
    }

    if (shouldShowChargeTrip && location === "ZONE_CHARGE" && lastCompletedDrop) {
      if (lastCompletedTaskId && (lastChargeAnimatedForRef.current === lastCompletedTaskId || lastChargeCompletedId === lastCompletedTaskId)) {
        setChargingTrip(false);
        setChargingOrigin(null);
      } else {
        if (lastCompletedTaskId) lastChargeAnimatedForRef.current = lastCompletedTaskId;
        setChargingTrip(true);
        setChargingOrigin(lastCompletedDrop);
        const originNode = ZONE_NODES[lastCompletedDrop];
        if (originNode) setRobotPos({ x: originNode.x, y: originNode.y });
        return;
      }
    }

    setChargingTrip(false);
    setChargingOrigin(null);
    const node = ZONE_NODES[location] || ZONE_NODES.ZONE_CHARGE;
    setRobotPos(node ? { x: node.x, y: node.y } : null);
  }, [
    robotLocation,
    shouldShowChargeTrip,
    lastCompletedDrop,
    lastCompletedTaskId,
    lastChargeCompletedId,
    hasPendingTasks,
    chargingTravelActive,
    lowBattery,
    chargingOrigin,
    chargingTrip,
    localChargeArrived
  ]);

  useEffect(() => {
    if (isMoving || chargingTrip) return;
    if (localChargeArrived) {
      const dock = ZONE_NODES.ZONE_CHARGE;
      if (dock) setRobotPos({ x: dock.x, y: dock.y });
      motionProgressRef.current = 0;
      return;
    }
    const location = robotLocation || "ZONE_CHARGE";
    const node = ZONE_NODES[location] || ZONE_NODES.ZONE_CHARGE;
    setRobotPos(node ? { x: node.x, y: node.y } : null);
    motionProgressRef.current = 0;
  }, [robotLocation, isMoving, chargingTrip]);

  const rafRef = useRef(null);
  const startRef = useRef(null);
  const prevChargingTripRef = useRef(false);
  const lastBatteryLevelRef = useRef(null);

  useEffect(() => {
    const currentBattery = Number(robot?.batteryLevel);
    if (!Number.isFinite(currentBattery)) return;
    const prevBattery = lastBatteryLevelRef.current;
    lastBatteryLevelRef.current = currentBattery;
    if (prevBattery == null) return;

    // If the backend reports battery increasing, it is already charging at the dock.
    // Treat that signal as authoritative even if the FSM state lags, and stop any
    // pending charge-trip animation so the UI shows "Charging" instead of
    // repeatedly replaying "Heading to charge" from the last location.
    const chargingNow = currentBattery > prevBattery;
    if (!chargingNow) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const dock = ZONE_NODES.ZONE_CHARGE;
    if (dock) setRobotPos({ x: dock.x, y: dock.y });
    setLocalChargeArrived(true);
    setChargingTrip(false);
    setChargingOrigin(null);
    motionProgressRef.current = 0;
    progressRef.current = 0;
    setProgressPct(0);
  }, [robot?.batteryLevel]);

  useEffect(() => {
    // Backend can report arrival at the dock (and start charging) before the
    // local charge-trip animation completes (e.g., if the user slows the UI
    // speed). In that case, stop animating immediately and snap to the dock.
    if (!chargingTrip) return;
    if (robotLocation !== "ZONE_CHARGE") return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const dock = ZONE_NODES.ZONE_CHARGE;
    if (dock) setRobotPos({ x: dock.x, y: dock.y });
    setChargingTrip(false);
    setChargingOrigin(null);
    motionProgressRef.current = 0;
    progressRef.current = 0;
    setProgressPct(0);
  }, [robotLocation, chargingTrip]);

  function runAnimation(segments, total, speed, onComplete, initialDistance = 0) {
    if (!segments.length || total <= 0) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startRef.current = null;

    const startDistance = Math.max(0, Math.min(total, initialDistance));

    const tick = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = (ts - startRef.current) / 1000;
      const distance = Math.min(total, startDistance + elapsed * speed);
      motionProgressRef.current = total > 0 ? distance / total : 0;
      if (Math.abs(motionProgressRef.current - progressRef.current) >= 0.01 || distance >= total) {
        progressRef.current = motionProgressRef.current;
        setProgressPct(progressRef.current);
      }
      const pos = positionAlong(segments, total, distance);
      if (pos) setRobotPos(pos);
      if (distance < total) {
        rafRef.current = requestAnimationFrame(tick);
      } else if (typeof onComplete === "function") {
        onComplete();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    progressRef.current = 0;
    setProgressPct(0);
  }, [movePhase, chargingTrip, activeTask?.id]);

  useEffect(() => {
    const wasCharging = prevChargingTripRef.current;
    prevChargingTripRef.current = Boolean(chargingTrip);
    if (!chargingTrip || wasCharging) return;
    motionProgressRef.current = 0;
    progressRef.current = 0;
    setProgressPct(0);
  }, [chargingTrip]);

  useEffect(() => {
    setSimElapsed(0);
  }, [activeTask?.id, chargingTrip]);

  useEffect(() => {
    const travelingToCharge = Boolean(chargingTrip) && progressPct < 1;
    if ((isMoving || travelingToCharge) && !simulationPaused) {
      const t = setInterval(() => setSimElapsed((prev) => prev + 1), 1000);
      return () => clearInterval(t);
    }
  }, [isMoving, chargingTrip, progressPct, simulationPaused]);

  useEffect(() => {
    // Once backend confirms we're at the dock, clear local override.
    if (robotLocation === "ZONE_CHARGE" && localChargeArrived) {
      setLocalChargeArrived(false);
    }
  }, [robotLocation, localChargeArrived]);

  useEffect(() => {
    if (simulationPaused) return;
    const isTaskTrip = robot?.currentState === ROBOT_STATES.MOVING;
    const isChargeTrip = Boolean(chargingTrip);
    if (!isTaskTrip && !isChargeTrip) return;

    if (isChargeTrip) {
      // If backend already shows we are docked, never start another
      // charge-trip animation (avoids repeated fast 'snap-move' loops).
      if (robotLocation === "ZONE_CHARGE") {
        setChargingTrip(false);
        setChargingOrigin(null);
        return;
      }
      if (hasPendingTasks && !lowBattery && !chargingTravelActive) {
        setChargingTrip(false);
        setChargingOrigin(null);
        return;
      }

      const start =
        chargingOrigin ||
        (robotLocation && robotLocation !== "ZONE_CHARGE" ? robotLocation : null) ||
        lastCompletedDrop;
      if (!start || start === "ZONE_CHARGE") return;

      const pathToCharge = findPath(start, "ZONE_CHARGE");
      const animSegments = buildSegments(pathToCharge);
      if (!animSegments.segments.length || animSegments.total <= 0) return;

      const initialDistance = motionProgressRef.current * animSegments.total;

      // Use consistent distance-based timing for the charge trip to avoid mid-route slowdowns.
      const chargeUnits = getGraphDistance(pathToCharge);
      const travelSeconds = chargeUnits * CHARGE_TRAVEL_SECONDS_PER_UNIT;
      const speed = travelSeconds > 0 ? (animSegments.total / travelSeconds) * speedMultiplier : 40 * speedMultiplier;

      runAnimation(animSegments.segments, animSegments.total, speed, () => {
        motionProgressRef.current = 1;
        progressRef.current = 1;
        setProgressPct(1);
        if (lastCompletedTaskId) {
          try {
            localStorage.setItem("simulation.lastChargeCompletedId", lastCompletedTaskId);
          } catch {
            // ignore
          }
          setLastChargeCompletedId(lastCompletedTaskId);
        }
      }, initialDistance);

      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }

    if (!segmentsInfo.segments.length || segmentsInfo.total <= 0) return;

    const speed = 60 * speedMultiplier; // px/sec
    setTaskTripComplete(false);

    const segmentsForPhase = movePhase === "toDrop" ? buildSegments(pathToDrop) : buildSegments(pathToPickup);

    if (movePhase === "toPickup") {
      if (!pickup || pickupIndex < 0) {
        setMovePhase("toDrop");
        return;
      }
      if (!segmentsForPhase.segments.length || segmentsForPhase.total <= 0) {
        setPickupHold(true);
        setMovePhase("toDrop");
        setSimulationPaused(true);
        motionProgressRef.current = 0;
        progressRef.current = 0;
        setProgressPct(0);
        return;
      }
    }

    if (movePhase === "toDrop" && (!segmentsForPhase.segments.length || segmentsForPhase.total <= 0)) {
      setTaskTripComplete(true);
      return;
    }

    const initialDistance = motionProgressRef.current * segmentsForPhase.total;
    runAnimation(segmentsForPhase.segments, segmentsForPhase.total, speed, () => {
      motionProgressRef.current = 1;
      progressRef.current = 1;
      setProgressPct(1);
      if (movePhase === "toPickup" && pickup) {
        setPickupHold(true);
        setMovePhase("toDrop");
        setSimulationPaused(true);
        motionProgressRef.current = 0;
        progressRef.current = 0;
        setProgressPct(0);
      } else {
        setTaskTripComplete(true);
      }
    }, initialDistance);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [robot?.currentState, segmentsInfo, simulationPaused, movePhase, pickup, pickupIndex, pathToPickup, pathToDrop, speedMultiplier, chargingTrip, robotLocation, chargingOrigin, lastCompletedDrop, lastCompletedTaskId, hasPendingTasks, lowBattery, chargingTravelActive, robot?.chargingUntil]);

  // Ensure the robot icon snaps to the dock locally as soon as the charge trip animation completes
  // instead of waiting for the next backend refresh tick.
  useEffect(() => {
    if (!chargingTrip) return;
    if (progressPct < 1) return;
    const dock = ZONE_NODES.ZONE_CHARGE;
    if (dock) setRobotPos({ x: dock.x, y: dock.y });
    // Treat the robot as arrived at the dock immediately so the UI switches to
    // charging state without waiting for the next backend refresh tick.
    setLocalChargeArrived(true);
    setChargingTrip(false);
    setChargingOrigin(null);
  }, [chargingTrip, progressPct]);

  useEffect(() => {
    if (!simulationPaused || !pickupHold || robot?.currentState !== ROBOT_STATES.MOVING) return;
    // waiting at pickup until operator resumes
  }, [simulationPaused, pickupHold, robot?.currentState]);

  const activePhaseSegments = chargingTrip ? chargeSegments : movePhase === "toDrop" ? dropSegments : pickupSegments;
  const activeSpeed = chargingTrip ? 40 * speedMultiplier : 60 * speedMultiplier;
  const remainingDistance = activePhaseSegments.total > 0 ? Math.max(0, (1 - progressPct) * activePhaseSegments.total) : 0;
  const etaSeconds = activeSpeed > 0 ? Math.ceil(remainingDistance / activeSpeed) : null;
  const atDock = atDockEffective;
  const progressLabel = atDock
    ? batteryLevel < 100
      ? "Charging"
      : "Idle at dock"
    : chargingTrip
      ? "Heading to charge"
      : movePhase === "toPickup"
        ? "To pickup"
        : "To drop";
  const progressPercentLabel = `${Math.round(progressPct * 100)}%`;
  const povTime = new Date().toLocaleTimeString();
  const povTarget = robotPos || ZONE_NODES.ZONE_CHARGE;
  const povCenterX = povTarget?.x ?? 0;
  const povCenterY = povTarget?.y ?? 0;
  const povTranslateX = 490 - povCenterX * povZoom;
  const povTranslateY = 280 - povCenterY * povZoom;
  const nextWaypoint = chargingTrip ? "ZONE_CHARGE" : movePhase === "toPickup" ? pickup : drop;
  const nextWaypointLabel = nextWaypoint && ZONE_NODES[nextWaypoint] ? ZONE_NODES[nextWaypoint].label : "—";

  const renderWarehouseContent = (variant = "main") => (
    <>
      {ZONE_EDGES.map(([from, to]) => {
        const start = ZONE_NODES[from];
        const end = ZONE_NODES[to];
        const highlighted = (variant === "main" ? showPath : true) && pathEdges.has(edgeKey(from, to));
        return (
          <line
            key={`${variant}-${from}-${to}`}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke={highlighted ? "#22d3ee" : "rgba(148,163,184,0.25)"}
            strokeWidth={highlighted ? 4 : 2}
            strokeDasharray={highlighted && isMoving ? "8 6" : "0"}
            className={highlighted && isMoving ? "animate-dash" : ""}
            strokeLinecap="round"
          />
        );
      })}

      {Object.entries(ZONE_NODES).map(([zone, node]) => {
        const isPickup = zone === pickup;
        const isDrop = zone === drop;
        const isCharge = zone === "ZONE_CHARGE";
        const fill = isPickup ? "#60a5fa" : isDrop ? "#34d399" : isCharge ? "#f59e0b" : "#0f172a";
        const stroke = isPickup || isDrop || isCharge ? "#f8fafc" : "#475569";
        return (
          <g key={`${variant}-${zone}`}>
            <rect x={node.x - 32} y={node.y - 22} width={64} height={44} rx={10} fill={fill} stroke={stroke} strokeWidth={2} filter="url(#softGlow)" />
            <text x={node.x} y={node.y + 4} fontSize="11" textAnchor="middle" fill="#e2e8f0" fontWeight="800">
              {node.label}
            </text>
            {isPickup ? (
              <g transform={`translate(${node.x - 36}, ${node.y - 52})`}>
                <rect x="0" y="0" width="72" height="18" rx="8" fill="rgba(59,130,246,0.9)" />
                <text x="36" y="12" textAnchor="middle" fontSize="9" fill="#e2e8f0" fontWeight="800">
                  PICKUP
                </text>
              </g>
            ) : null}
            {isDrop ? (
              <g transform={`translate(${node.x - 32}, ${node.y + 30})`}>
                <rect x="0" y="0" width="64" height="18" rx="8" fill="rgba(16,185,129,0.9)" />
                <text x="32" y="12" textAnchor="middle" fontSize="9" fill="#e2e8f0" fontWeight="800">
                  DROP
                </text>
              </g>
            ) : null}
          </g>
        );
      })}

      {robotPos ? (
        <g>
          <circle cx={robotPos.x} cy={robotPos.y} r={28} fill="url(#robotGlow)" opacity="0.85" />
          <circle
            cx={robotPos.x}
            cy={robotPos.y}
            r={14}
            fill={isCharging ? "#f59e0b" : isMoving ? "#38bdf8" : isFullBattery ? "#22c55e" : "#2563eb"}
            stroke="#e2e8f0"
            strokeWidth={2}
            filter="url(#softGlow)"
          />
          <g transform={`translate(${robotPos.x - 8}, ${robotPos.y - 8})`}>
            <rect x="0" y="2" width="16" height="10" rx="3" fill="rgba(15,23,42,0.9)" />
            <rect x="2" y="0" width="12" height="6" rx="2" fill="rgba(226,232,240,0.9)" />
          </g>
          {(isCharging || isMoving) && (
            <circle
              cx={robotPos.x}
              cy={robotPos.y}
              r={24}
              fill="transparent"
              stroke={isCharging ? "rgba(245,158,11,0.8)" : "rgba(56,189,248,0.8)"}
              strokeWidth={2}
              className="animate-pulse-ring"
            />
          )}
          {variant === "main" ? (
            <g transform={`translate(${robotPos.x + 18}, ${robotPos.y - 26})`}>
              <rect x="0" y="0" width="110" height="28" rx="8" fill="rgba(15,23,42,0.9)" stroke="rgba(148,163,184,0.35)" />
              <text x="55" y="18" textAnchor="middle" fontSize="11" fill="#e2e8f0" fontWeight="700">
                {activeTask?.status === "IN_PROGRESS"
                  ? taskTripComplete
                    ? "Route complete"
                    : pickupHold
                      ? "Waiting pickup"
                      : simulationPaused
                        ? "Paused"
                        : "En route"
                  : chargingTrip
                    ? simulationPaused
                      ? "Charging paused"
                      : "Heading to charge"
                    : robot?.currentState || "IDLE"}
              </text>
            </g>
          ) : null}
        </g>
      ) : null}
    </>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      <ConfirmDialog
        open={confirmLogoutOpen}
        title="Logout?"
        description="Do you want to logout from your account?"
        icon={<LogOut className="h-5 w-5 text-cyan-200" />}
        confirmText="Logout"
        cancelText="Cancel"
        destructive
        onCancel={() => setConfirmLogoutOpen(false)}
        onConfirm={() => {
          setConfirmLogoutOpen(false);
          logout();
        }}
      />

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-64 -right-64 h-[720px] w-[720px] rounded-full bg-gradient-to-br from-blue-500/25 via-purple-500/20 to-cyan-500/25 blur-3xl animate-float" />
        <div className="absolute -bottom-72 -left-72 h-[820px] w-[820px] rounded-full bg-gradient-to-br from-cyan-500/20 via-indigo-500/20 to-violet-500/20 blur-3xl animate-float-delayed" />
        <div className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(to_right,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:96px_96px] animate-grid-move" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_60%)]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 blur-lg opacity-60 animate-pulse-glow" />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-600 shadow-2xl shadow-blue-500/40">
                <Bot className="h-6 w-6 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-blue-200 to-cyan-200 bg-clip-text text-transparent">
                Simulation
              </h1>
              <p className="mt-1 text-sm font-medium text-slate-300">Live task execution visualization.</p>
            </div>
          </div>
          <div className="flex w-full items-center gap-3 overflow-x-auto pb-1 sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => navigate(dashboardPath)}
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20"
              )}
            >
              Dashboard
            </Button>
            <Link
              to="/robots"
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              )}
            >
              Robot State Machine
            </Link>
            <Link
              to="/tasks"
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              )}
            >
              Task Manager
            </Link>
            {user?.role === "admin" ? (
              <Link
                to="/analytics"
                className={cn(
                  "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                )}
              >
                Analytics
              </Link>
            ) : null}
            <Button variant="secondary" onClick={() => setConfirmLogoutOpen(true)} className="shrink-0 px-5 py-3.5">
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_20px_40px_-20px_rgba(15,23,42,0.8)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-extrabold text-white">Warehouse simulation</div>
                <div className="text-xs text-slate-400">Robot dot follows the planned path.</div>
              </div>
              <div className="flex items-center gap-2">

                <Button
                  variant="secondary"
                  onClick={handleStart}
                  disabled={
                    !activeTask ||
                    acting ||
                    !(
                      activeTask.status === "ASSIGNED" ||
                      (activeTask.status === "IN_PROGRESS" && robot?.currentState !== ROBOT_STATES.MOVING)
                    )
                  }
                >
                  <Play className="h-4 w-4" />
                  {activeTask?.status === "IN_PROGRESS" ? "Resume" : "Start"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleComplete}
                  disabled={!activeTask || activeTask.status !== "IN_PROGRESS" || acting || !taskTripComplete}
                  className="border-emerald-500/40 text-emerald-100 hover:bg-emerald-500/15 hover:border-emerald-500/60"
                >
                  <Bot className="h-4 w-4" />
                  Complete
                </Button>
                <Button
                  variant="secondary"
                  onClick={handlePauseToggle}
                  className="border-white/10"
                  disabled={!canPause}
                >
                  {simulationPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  {simulationPaused ? "Resume" : "Pause"}
                </Button>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[11px] text-slate-400">Playback speed</div>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.25"
                    value={speedMultiplier}
                    onChange={(event) => setSpeedMultiplier(Number(event.target.value))}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-cyan-400"
                  />
                  <div className="text-xs font-semibold text-slate-200">{speedMultiplier}x</div>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[11px] text-slate-400">Path highlight</div>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setShowPath((prev) => !prev)}
                    className="px-3 py-2 text-xs"
                  >
                    {showPath ? "Visible" : "Hidden"}
                  </Button>
                  <span className="text-xs text-slate-400">Toggle route focus.</span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[11px] text-slate-400">Session timer</div>
                <div className="mt-2 text-sm font-semibold text-slate-100">
                  {formatSeconds(simElapsed)}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                  className={
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold " +
                    (isMoving
                      ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
                      : isCharging
                        ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
                        : isFullBattery
                          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                          : "border-white/10 bg-white/5 text-slate-200")
                  }
                >
                  {isMoving ? "MOVING" : isCharging ? "CHARGING" : isFullBattery ? "FULL" : robot?.currentState || "IDLE"}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-slate-200">
                  Battery {Number.isFinite(displayBatteryLevel) ? `${displayBatteryLevel}%` : "—"}
                </span>
              </div>

              <div className="relative">
                <svg viewBox="0 0 980 560" className="w-full h-[540px] rounded-2xl border border-white/10 bg-slate-950/40 shadow-inner">
                  <defs>
                    <radialGradient id="robotGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor={isCharging ? "#f59e0b" : isMoving ? "#38bdf8" : "#22c55e"} stopOpacity="0.9" />
                      <stop offset="100%" stopColor="transparent" />
                    </radialGradient>
                    <filter id="softGlow">
                      <feGaussianBlur stdDeviation="6" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                {renderWarehouseContent("main")}
                </svg>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span className="font-semibold text-slate-100">{progressLabel}</span>
                <span>{progressPercentLabel}</span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-white/10">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                  style={{ width: `${Math.max(0, Math.min(100, progressPct * 100))}%` }}
                />
              </div>
              <div className="mt-2 grid gap-2 text-[11px] text-slate-400 sm:grid-cols-3">
                <span>
                  ETA: {(isMoving || chargingTrip) && activePhaseSegments.total > 0 ? formatSeconds(etaSeconds) : "—"}
                </span>
                <span>
                  Remaining: {(isMoving || chargingTrip) && activePhaseSegments.total > 0 ? `${Math.round(remainingDistance)} px` : "—"}
                </span>
                <span>
                  Phase: {(isMoving || chargingTrip) ? progressLabel : "—"}
                </span>
              </div>
            </div>

            {showPov ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-extrabold text-white">Robot-eye POV</div>
                    <div className="text-xs text-slate-400">First-person camera view (simulated).</div>
                  </div>
                  <div className="text-xs font-semibold text-slate-300">{povTime}</div>
                </div>
                <div className="mt-3 relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60">
                  <svg viewBox="0 0 980 560" className="h-[260px] w-full">
                    <defs>
                      <radialGradient id="robotGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor={isCharging ? "#f59e0b" : isMoving ? "#38bdf8" : "#22c55e"} stopOpacity="0.9" />
                        <stop offset="100%" stopColor="transparent" />
                      </radialGradient>
                      <filter id="softGlow">
                        <feGaussianBlur stdDeviation="6" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                      <radialGradient id="povVignette" cx="50%" cy="50%" r="60%">
                        <stop offset="0%" stopColor="rgba(0,0,0,0)" />
                        <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
                      </radialGradient>
                      <pattern id="scanlines" width="4" height="4" patternUnits="userSpaceOnUse">
                        <rect width="4" height="2" fill="rgba(148,163,184,0.08)" />
                        <rect y="2" width="4" height="2" fill="rgba(2,6,23,0)" />
                      </pattern>
                      <filter id="povGlow">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>
                    <g transform={`translate(${povTranslateX} ${povTranslateY}) scale(${povZoom})`}>
                      {renderWarehouseContent("pov")}
                    </g>
                    <rect x="0" y="0" width="980" height="560" fill="url(#scanlines)" opacity="0.45" />
                    <rect x="0" y="0" width="980" height="560" fill="url(#povVignette)" />
                    <g filter="url(#povGlow)">
                      <rect x="18" y="18" width="240" height="72" rx="12" fill="rgba(15,23,42,0.7)" stroke="rgba(148,163,184,0.25)" />
                      <text x="36" y="42" fontSize="12" fill="#e2e8f0" fontWeight="800">POV</text>
                      <text x="36" y="62" fontSize="11" fill="#94a3b8">Battery</text>
                      <text x="110" y="62" fontSize="11" fill="#e2e8f0" fontWeight="700">{displayBatteryLevel}%</text>
                      <text x="36" y="80" fontSize="11" fill="#94a3b8">Next</text>
                      <text x="110" y="80" fontSize="11" fill="#e2e8f0" fontWeight="700">{nextWaypointLabel}</text>
                    </g>
                    <g filter="url(#povGlow)">
                      <rect x="720" y="18" width="242" height="72" rx="12" fill="rgba(15,23,42,0.7)" stroke="rgba(148,163,184,0.25)" />
                      <text x="740" y="42" fontSize="11" fill="#94a3b8">Speed</text>
                      <text x="820" y="42" fontSize="11" fill="#e2e8f0" fontWeight="700">{activeSpeed.toFixed(0)} px/s</text>
                      <text x="740" y="62" fontSize="11" fill="#94a3b8">ETA</text>
                      <text x="820" y="62" fontSize="11" fill="#e2e8f0" fontWeight="700">
                        {(isMoving || chargingTrip) && activePhaseSegments.total > 0 ? formatSeconds(etaSeconds) : "—"}
                      </text>
                      <text x="740" y="80" fontSize="11" fill="#94a3b8">Phase</text>
                      <text x="820" y="80" fontSize="11" fill="#e2e8f0" fontWeight="700">{progressLabel}</text>
                    </g>
                  </svg>
                </div>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-300">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Charging
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-400" /> Pickup
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Drop
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-1 w-8 rounded bg-cyan-400/60" /> Highlighted path
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Robot
              </span>
            </div>
            <style>{`
              .animate-dash {
                stroke-dasharray: 8 6;
                animation: dash 1.5s linear infinite;
              }
              .animate-pulse-ring {
                animation: pulse-ring 1.6s ease-out infinite;
              }
              @keyframes dash {
                to { stroke-dashoffset: -28; }
              }
              @keyframes pulse-ring {
                0% { r: 14; opacity: 0.8; }
                100% { r: 24; opacity: 0; }
              }
            `}</style>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_20px_40px_-20px_rgba(15,23,42,0.8)]">
            <div className="text-xs font-extrabold uppercase tracking-wide text-slate-300">Live status</div>
            <div className="mt-3 grid gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[11px] text-slate-400">Robot state</div>
                <div className="text-sm font-semibold text-slate-100">{robot?.currentState || "—"}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[11px] text-slate-400">Battery</div>
                <div className="text-sm font-semibold text-slate-100">
                  {Number.isFinite(displayBatteryLevel) ? `${displayBatteryLevel}%` : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[11px] text-slate-400">Active task</div>
                <div className="text-sm font-semibold text-slate-100">{activeTask?.id || "—"}</div>
                {activeTask ? (
                  <div className="mt-1 text-xs text-slate-400">
                    {activeTask.pickup_zone} → {activeTask.drop_zone}
                  </div>
                ) : null}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[11px] text-slate-400">Planned distance</div>
                <div className="text-sm font-semibold text-slate-100">
                  {typeof analysis?.details?.distance === "number" ? analysis.details.distance : "—"}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  to pickup: {analysis?.details?.distance_to_pickup ?? "—"} · task: {analysis?.details?.distance_task ?? "—"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[11px] text-slate-400">Simulation progress</div>
                <div className="text-sm font-semibold text-slate-100">
                  {activeTask?.status === "IN_PROGRESS"
                    ? taskTripComplete
                      ? "Route complete"
                      : pickupHold
                        ? "Waiting pickup"
                        : simulationPaused
                          ? "Paused"
                          : "En route"
                    : chargingTrip
                      ? simulationPaused
                        ? "Charging paused"
                        : "Heading to charge"
                      : "—"}
                </div>
              </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-[11px] text-slate-400">Queued tasks</div>
                  {queuedTasks.length ? (
                    <ul className="mt-2 space-y-1 text-xs text-slate-200">
                      {queuedTasks.map((task) => (
                        <li key={task.id || task._id} className="flex items-center justify-between">
                          <span className="font-semibold">{task.id || task._id}</span>
                          <span className="text-slate-400">
                            {task.pickup_zone} → {task.drop_zone}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-2 text-xs text-slate-500">No queued tasks.</div>
                  )}
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
