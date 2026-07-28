/**
 * WarehouseMap — SVG visualization of the L-shaped 3-zone robot track.
 *
 * Physical layout (top-down view):
 *   C ←────────── B
 *                 │
 *                 │
 *                 │
 *                 A
 *
 * Zones:
 *   A = South (robot home / start)
 *   B = North (top of vertical aisle)
 *   C = West of B (end of horizontal aisle)
 */

const SVG_WIDTH = 380;
const SVG_HEIGHT = 300;
const PAD = 48;

// Pixel positions for each zone node (within SVG viewBox)
const ZONE_PX = {
  A: { x: SVG_WIDTH - PAD, y: SVG_HEIGHT - PAD }, // bottom-right (south)
  B: { x: SVG_WIDTH - PAD, y: PAD },              // top-right (north)
  C: { x: PAD,             y: PAD }               // top-left (west of B)
};

// Track path as SVG polyline points: A → B → C
const TRACK_POINTS = [ZONE_PX.A, ZONE_PX.B, ZONE_PX.C]
  .map(({ x, y }) => `${x},${y}`)
  .join(" ");

const ZONE_META = {
  A: { label: "Zone A", subtitle: "South · Home",       color: "#06b6d4" }, // cyan
  B: { label: "Zone B", subtitle: "North",              color: "#a78bfa" }, // violet
  C: { label: "Zone C", subtitle: "West of B",          color: "#34d399" }  // emerald
};

const ZONE_CODES = ["A", "B", "C"];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Compute robot pixel position along the A→B→C track (0 = A, 0.5 = B, 1 = C) */
function robotPixelPosition(zoneCode) {
  return ZONE_PX[zoneCode] || ZONE_PX.A;
}

export default function WarehouseMap({ robotZone = "A", activeTask = null }) {
  const validZone = ZONE_CODES.includes(robotZone) ? robotZone : "A";
  const { x: dotX, y: dotY } = robotPixelPosition(validZone);

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl"
      role="img"
      aria-label={`Warehouse map — robot at Zone ${validZone}`}
    >
      {/* Header label row */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">L-Track Layout</span>
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#06b6d4]" />
          <span className="text-xs text-slate-400">Robot at Zone {validZone}</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full"
        style={{ maxHeight: 280 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Track shadow */}
        <polyline
          points={TRACK_POINTS}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={16}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Track rail */}
        <polyline
          points={TRACK_POINTS}
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth={8}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="10 6"
        />
        {/* Active track highlight */}
        <polyline
          points={TRACK_POINTS}
          fill="none"
          stroke="#06b6d4"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.5}
        />

        {/* Direction arrow markers along the track */}
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 Z" fill="rgba(6,182,212,0.5)" />
          </marker>
        </defs>

        {/* Zone nodes */}
        {ZONE_CODES.map((code) => {
          const { x, y } = ZONE_PX[code];
          const meta = ZONE_META[code];
          const isRobotHere = code === validZone;
          const isPickup = activeTask?.pickupZone === code;
          const isDrop = activeTask?.dropZone === code;

          return (
            <g key={code}>
              {/* Glow ring for robot location */}
              {isRobotHere && (
                <circle
                  cx={x} cy={y} r={26}
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  opacity={0.4}
                />
              )}
              {/* Zone circle */}
              <circle
                cx={x} cy={y} r={18}
                fill={isRobotHere ? `${meta.color}30` : "rgba(255,255,255,0.06)"}
                stroke={isRobotHere ? meta.color : "rgba(255,255,255,0.15)"}
                strokeWidth={isRobotHere ? 2 : 1.5}
              />
              {/* Zone label inside circle */}
              <text
                x={x} y={y + 1}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={11} fontWeight={700}
                fill={isRobotHere ? meta.color : "rgba(255,255,255,0.7)"}
                fontFamily="inherit"
              >
                {code}
              </text>

              {/* Task indicators */}
              {isPickup && (
                <circle cx={x + 18} cy={y - 18} r={6} fill="#f59e0b" />
              )}
              {isDrop && (
                <circle cx={x + 18} cy={y - 18} r={6} fill="#10b981" />
              )}

              {/* Zone name label (outside circle) */}
              {code === "A" && (
                <>
                  <text x={x - 28} y={y} textAnchor="end" dominantBaseline="middle"
                    fontSize={10} fill="rgba(255,255,255,0.5)" fontFamily="inherit">
                    {meta.label}
                  </text>
                  <text x={x - 28} y={y + 13} textAnchor="end" dominantBaseline="middle"
                    fontSize={8} fill="rgba(255,255,255,0.3)" fontFamily="inherit">
                    {meta.subtitle}
                  </text>
                </>
              )}
              {code === "B" && (
                <>
                  <text x={x + 28} y={y} textAnchor="start" dominantBaseline="middle"
                    fontSize={10} fill="rgba(255,255,255,0.5)" fontFamily="inherit">
                    {meta.label}
                  </text>
                  <text x={x + 28} y={y + 13} textAnchor="start" dominantBaseline="middle"
                    fontSize={8} fill="rgba(255,255,255,0.3)" fontFamily="inherit">
                    {meta.subtitle}
                  </text>
                </>
              )}
              {code === "C" && (
                <>
                  <text x={x} y={y + 28} textAnchor="middle" dominantBaseline="hanging"
                    fontSize={10} fill="rgba(255,255,255,0.5)" fontFamily="inherit">
                    {meta.label}
                  </text>
                  <text x={x} y={y + 40} textAnchor="middle" dominantBaseline="hanging"
                    fontSize={8} fill="rgba(255,255,255,0.3)" fontFamily="inherit">
                    {meta.subtitle}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* Robot dot */}
        <circle
          cx={dotX} cy={dotY} r={7}
          fill="#06b6d4"
          style={{ filter: "drop-shadow(0 0 6px #06b6d4)" }}
        />

        {/* Compass labels */}
        <text x={SVG_WIDTH / 2} y={18} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.25)" fontFamily="inherit">N</text>
        <text x={SVG_WIDTH / 2} y={SVG_HEIGHT - 6} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.25)" fontFamily="inherit">S</text>
        <text x={10} y={SVG_HEIGHT / 2} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.25)" fontFamily="inherit">W</text>
        <text x={SVG_WIDTH - 10} y={SVG_HEIGHT / 2} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.25)" fontFamily="inherit">E</text>
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 border-t border-white/10 px-4 py-2">
        {ZONE_CODES.map((code) => (
          <div key={code} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: ZONE_META[code].color, opacity: 0.8 }}
            />
            <span className="text-xs text-slate-400">
              {ZONE_META[code].label} — {ZONE_META[code].subtitle}
            </span>
          </div>
        ))}
        {activeTask && (
          <div className="ml-auto flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Pickup</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Drop</span>
          </div>
        )}
      </div>
    </div>
  );
}
