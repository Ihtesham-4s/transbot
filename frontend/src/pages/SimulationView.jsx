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

function edgeKey(a, b) {
  return [a, b].sort().join("-");
}

function buildAdjacency() {
  const adj = new Map();
  Object.keys(ZONE_NODES).forEach((z) => adj.set(z, []));
  ZONE_EDGES.forEach(([from, to]) => {
    if (!adj.has(from) || !adj.has(to)) return;
    adj.get(from).push(to);
    adj.get(to).push(from);
  });
  return adj;
}

const GRAPH_ADJACENCY = buildAdjacency();

function findPath(start, end) {
  if (!start || !end) return [];
  if (start === end) return [start];
  if (!GRAPH_ADJACENCY.has(start) || !GRAPH_ADJACENCY.has(end)) return [];

  const queue = [start];
  const prev = new Map();
  const visited = new Set([start]);

  while (queue.length) {
    const node = queue.shift();
    if (node === end) break;
    const neighbors = GRAPH_ADJACENCY.get(node) || [];
    for (const n of neighbors) {
      if (visited.has(n)) continue;
      visited.add(n);
      prev.set(n, node);
      queue.push(n);
    }
  }

  if (!visited.has(end)) return [];
  const path = [];
  let cur = end;
  while (cur) {
    path.unshift(cur);
    if (cur === start) break;
    cur = prev.get(cur);
  }
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

export default function SimulationView() {
  const { user, token, logout } = useAuth();
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [robot, setRobot] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feasibility, setFeasibility] = useState(null);
  const [robotPos, setRobotPos] = useState(null);
  const [simulationPaused, setSimulationPaused] = useState(false);
  const [acting, setActing] = useState(false);
  const [chargingTrip, setChargingTrip] = useState(false);
  const [chargingOrigin, setChargingOrigin] = useState(null);
  const [taskTripComplete, setTaskTripComplete] = useState(false);
  const motionProgressRef = useRef(0);
  const [pickupHold, setPickupHold] = useState(false);
  const [movePhase, setMovePhase] = useState("toPickup");
  const lastChargeAnimatedForRef = useRef(null);
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
  const batteryLevel = Number(robot?.batteryLevel ?? 0);
  const lowBattery = batteryLevel <= 20;
  const isMoving = robot?.currentState === ROBOT_STATES.MOVING;
  const isCharging = (robot?.location === "ZONE_CHARGE" || chargingTrip) && robot?.currentState === ROBOT_STATES.IDLE && batteryLevel < 100;
  const isFullBattery = batteryLevel >= 100;
  const idleNeedsCharge = robot?.currentState === ROBOT_STATES.IDLE && lowBattery;
  const shouldShowChargeTrip = robot?.currentState === ROBOT_STATES.IDLE && (lowBattery || !activeTask);
  const canPause = (isMoving || chargingTrip || pickupHold) && !taskTripComplete;

  const chargePath = useMemo(() => {
    if (!shouldShowChargeTrip && !chargingTrip) return [];
    const from = chargingOrigin || (robot?.location && robot.location !== "ZONE_CHARGE" ? robot.location : null) || lastCompletedDrop;
    if (!from) return [];
    return findPath(from, "ZONE_CHARGE");
  }, [shouldShowChargeTrip, chargingTrip, robot?.location, chargingOrigin, lastCompletedDrop]);

  const displayPath = chargingTrip && chargePath.length ? chargePath : basePath;
  const pathEdges = new Set();

  for (let i = 0; i < displayPath.length - 1; i += 1) {
    pathEdges.add(edgeKey(displayPath[i], displayPath[i + 1]));
  }

  const pickup = activeTask?.pickup_zone;
  const drop = activeTask?.drop_zone;

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
    setActing(true);
    try {
      await startTask(token, activeTask.id);
      setTaskTripComplete(false);
      setPickupHold(false);
      setMovePhase("toPickup");
      await refresh();
    } finally {
      setActing(false);
    }
  }

  async function handleComplete() {
    if (!activeTask?.id) return;
    setActing(true);
    try {
      await completeTask(token, activeTask.id, { auto: true });
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
    const location = robot?.location || "ZONE_CHARGE";

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
  }, [robot?.location, shouldShowChargeTrip, lastCompletedDrop, lastCompletedTaskId, lastChargeCompletedId]);

  useEffect(() => {
    if (isMoving || chargingTrip) return;
    const location = robot?.location || "ZONE_CHARGE";
    const node = ZONE_NODES[location] || ZONE_NODES.ZONE_CHARGE;
    setRobotPos(node ? { x: node.x, y: node.y } : null);
    motionProgressRef.current = 0;
  }, [robot?.location, isMoving, chargingTrip]);

  const rafRef = useRef(null);
  const startRef = useRef(null);

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
    if (simulationPaused) return;
    if (robot?.currentState !== ROBOT_STATES.MOVING) return;
    if (!segmentsInfo.segments.length || segmentsInfo.total <= 0) return;

    const speed = 60; // px/sec
    setTaskTripComplete(false);

    const segmentsForPhase = movePhase === "toDrop" ? buildSegments(pathToDrop) : buildSegments(pathToPickup);
    if (!segmentsForPhase.segments.length || segmentsForPhase.total <= 0) return;

    const initialDistance = motionProgressRef.current * segmentsForPhase.total;
    runAnimation(segmentsForPhase.segments, segmentsForPhase.total, speed, () => {
      motionProgressRef.current = 1;
      if (movePhase === "toPickup" && pickup) {
        setPickupHold(true);
        setMovePhase("toDrop");
        setSimulationPaused(true);
        motionProgressRef.current = 0;
      } else {
        setTaskTripComplete(true);
      }
    }, initialDistance);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [robot?.currentState, segmentsInfo, simulationPaused, movePhase, pickup, pathToPickup, pathToDrop]);

  useEffect(() => {
    if (simulationPaused) return;
    if (!chargingTrip) return;
    const start = chargingOrigin || robot?.location || lastCompletedDrop;
    if (!start || start === "ZONE_CHARGE") return;

    const pathToCharge = findPath(start, "ZONE_CHARGE");
    const animSegments = buildSegments(pathToCharge);
    if (!animSegments.segments.length || animSegments.total <= 0) return;

    const speed = 40; // px/sec
    const initialDistance = motionProgressRef.current * animSegments.total;
    runAnimation(animSegments.segments, animSegments.total, speed, () => {
      setChargingTrip(false);
      setChargingOrigin(null);
      motionProgressRef.current = 1;
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
  }, [chargingTrip, robot?.location, simulationPaused, chargingOrigin, lastCompletedDrop, lastCompletedTaskId]);

  useEffect(() => {
    if (!simulationPaused || !pickupHold || robot?.currentState !== ROBOT_STATES.MOVING) return;
    // waiting at pickup until operator resumes
  }, [simulationPaused, pickupHold, robot?.currentState]);

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
                  disabled={!activeTask || activeTask.status !== "ASSIGNED" || acting}
                >
                  <Play className="h-4 w-4" />
                  Start
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
                  Battery {Number.isFinite(batteryLevel) ? `${batteryLevel}%` : "—"}
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
                {ZONE_EDGES.map(([from, to]) => {
                  const start = ZONE_NODES[from];
                  const end = ZONE_NODES[to];
                  const highlighted = pathEdges.has(edgeKey(from, to));
                  return (
                    <line
                      key={`${from}-${to}`}
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
                    <g key={zone}>
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
                  </g>
                ) : null}
                </svg>
              </div>
            </div>

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
                  {typeof robot?.batteryLevel === "number" ? `${robot.batteryLevel}%` : "—"}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
