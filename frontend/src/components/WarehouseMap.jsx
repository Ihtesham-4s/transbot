const ZONE_NODES = Object.freeze({
  ZONE_CHARGE: { x: 70, y: 300, label: "Charge" },
  ZONE_A: { x: 88, y: 88, label: "Zone A" },
  ZONE_B: { x: 288, y: 75, label: "Zone B" },
  ZONE_C: { x: 288, y: 238, label: "Zone C" },
  ZONE_D: { x: 500, y: 113, label: "Zone D" },
  ZONE_E: { x: 500, y: 263, label: "Zone E" }
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

export default function WarehouseMap({ selectedTask, feasibility, robot, loading = false }) {
  const analysis = feasibility?.analysis || null;
  const path = analysis?.details?.path || [];
  const pathEdges = new Set();

  for (let i = 0; i < path.length - 1; i += 1) {
    pathEdges.add(edgeKey(path[i], path[i + 1]));
  }

  const pickup = selectedTask?.pickup_zone;
  const drop = selectedTask?.drop_zone;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-extrabold text-white">Warehouse map</div>
          <div className="text-xs text-slate-400">Logical routing view (no simulation).</div>
        </div>
        {analysis ? (
          <span
            className={
              "inline-flex rounded-full border px-3 py-1 text-xs font-extrabold " +
              (analysis.feasible
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                : "border-rose-400/40 bg-rose-500/10 text-rose-100")
            }
          >
            {analysis.feasible ? "FEASIBLE" : "NOT FEASIBLE"}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <svg viewBox="0 0 650 375" className="w-full h-auto rounded-xl border border-white/10 bg-slate-950/40">
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
                  stroke={highlighted ? "#22d3ee" : "rgba(148,163,184,0.3)"}
                  strokeWidth={highlighted ? 4 : 2}
                  strokeLinecap="round"
                />
              );
            })}

            {Object.entries(ZONE_NODES).map(([zone, node]) => {
              const isPickup = zone === pickup;
              const isDrop = zone === drop;
              const isCharge = zone === "ZONE_CHARGE";
              const fill = isPickup ? "#60a5fa" : isDrop ? "#34d399" : isCharge ? "#f59e0b" : "#1f2937";
              const stroke = isPickup || isDrop || isCharge ? "#f8fafc" : "#475569";
              return (
                <g key={zone}>
                  <circle cx={node.x} cy={node.y} r={22} fill={fill} stroke={stroke} strokeWidth={2} />
                  <text x={node.x} y={node.y + 5} fontSize="11" textAnchor="middle" fill="#e2e8f0" fontWeight="700">
                    {node.label.replace("Zone ", "")}
                  </text>
                </g>
              );
            })}
          </svg>
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
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-extrabold uppercase tracking-wide text-slate-300">Decision details</div>
          {loading ? (
            <div className="mt-2 text-sm text-slate-400">Loading feasibility analysis…</div>
          ) : !analysis ? (
            <div className="mt-2 text-sm text-slate-400">Select a task to load feasibility.</div>
          ) : (
            <div className="mt-3 space-y-3">
              <div>
                <div className="text-[11px] text-slate-400">Reason</div>
                <div className="text-sm font-semibold text-slate-100">{analysis.reason || "Feasible"}</div>
              </div>

              {feasibility?.persisted_rejection_reason ? (
                <div>
                  <div className="text-[11px] text-slate-400">Persisted rejection</div>
                  <div className="text-sm font-semibold text-rose-200">{feasibility.persisted_rejection_reason}</div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-slate-400">Distance</div>
                  <div className="text-sm font-semibold text-slate-100">
                    {typeof analysis.details?.distance === "number" ? analysis.details.distance : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Required battery</div>
                  <div className="text-sm font-semibold text-slate-100">
                    {typeof analysis.details?.requiredBattery === "number" ? analysis.details.requiredBattery.toFixed(1) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Robot battery</div>
                  <div className="text-sm font-semibold text-slate-100">
                    {typeof analysis.details?.battery === "number" ? `${analysis.details.battery}%` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Payload</div>
                  <div className="text-sm font-semibold text-slate-100">
                    {typeof selectedTask?.weight === "number" ? `${selectedTask.weight} / ${analysis.details?.maxPayload ?? "—"}` : "—"}
                  </div>
                </div>
              </div>

              {robot ? (
                <div>
                  <div className="text-[11px] text-slate-400">Robot</div>
                  <div className="text-sm font-semibold text-slate-100">{robot.name || robot.id || "—"}</div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
