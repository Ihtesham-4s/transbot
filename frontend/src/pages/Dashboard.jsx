import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  ClipboardCheck,
  ListTodo,
  Package,
  RefreshCw,
  ShoppingCart,
  Warehouse
} from "lucide-react";
import { Link } from "react-router-dom";
import { PageTransition } from "../components/PageTransition";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { useAppData } from "../context/AppDataContext";
import { useAuth } from "../context/AuthContext";
import { getDashboardOverview } from "../lib/api";
import { formatDateTime, formatTaskId, getErrorMessage } from "../lib/formatters";
import { getRobotStateMeta, getTaskStatusMeta } from "../lib/status";

const EMPTY_INVENTORY = {
  totalSKUs: 0,
  totalStockUnits: 0,
  lowStockCount: 0,
  overstockCount: 0,
  normalCount: 0,
  reorderRequiredCount: 0
};

const EMPTY_FULFILLMENT = {
  totalOrders: 0,
  pendingOrders: 0,
  readyToPickOrders: 0,
  insufficientStockOrders: 0,
  completedOrders: 0,
  openPickLists: 0,
  completedPickLists: 0
};

const EMPTY_ROBOT = {
  totalRobots: 0,
  idleRobots: 0,
  busyRobots: 0,
  errorRobots: 0,
  activeRobotName: null,
  activeRobotState: null,
  activeRobotId: null,
  activeTask: null,
  dispatchStatus: "UNKNOWN"
};

const EMPTY_ACTION = {
  lowStockProducts: [],
  overstockProducts: [],
  blockedOrders: [],
  readyPickLists: [],
  recentMovements: [],
  recentLogs: []
};

const EMPTY_METRICS = {
  stockHealthScore: 100,
  orderCompletionRate: 0,
  blockedOrderRate: 0,
  totalActionsRequired: 0
};

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return `${n.toFixed(1)}%`;
}

function severityTone(severity) {
  if (severity === "HIGH") return "error";
  if (severity === "MEDIUM") return "warning";
  return "neutral";
}

function stockStatusTone(status) {
  if (status === "LOW_STOCK") return "error";
  if (status === "OVERSTOCK") return "warning";
  return "success";
}

function actionStatusTone(status) {
  if (!status) return "neutral";
  const s = String(status);
  if (s === "LOW_STOCK" || s === "INSUFFICIENT_STOCK") return "error";
  if (s === "OVERSTOCK") return "warning";
  if (s === "NORMAL" || s === "READY_TO_PICK" || s === "COMPLETED") return "success";
  if (s === "OPEN" || s === "PICKING") return "warning";
  return "neutral";
}

const linkButtonSecondarySm =
  "inline-flex h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white backdrop-blur-xl transition-all hover:border-white/15 hover:bg-white/10";

function dispatchLabel(code) {
  const map = {
    NO_ROBOT: "No robot",
    FAULT: "Fault",
    DISPATCHED: "Dispatched",
    READY: "Ready",
    BUSY: "Busy",
    UNKNOWN: "Unknown"
  };
  return map[code] || code || "Unknown";
}

function mergeOverview(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      inventory: { ...EMPTY_INVENTORY },
      fulfillment: { ...EMPTY_FULFILLMENT },
      robot: { ...EMPTY_ROBOT },
      actionCenter: {
        lowStockProducts: [],
        overstockProducts: [],
        blockedOrders: [],
        readyPickLists: [],
        recentMovements: [],
        recentLogs: []
      },
      metrics: { ...EMPTY_METRICS }
    };
  }

  return {
    inventory: { ...EMPTY_INVENTORY, ...raw.inventory },
    fulfillment: { ...EMPTY_FULFILLMENT, ...raw.fulfillment },
    robot: { ...EMPTY_ROBOT, ...raw.robot },
    actionCenter: {
      ...EMPTY_ACTION,
      ...raw.actionCenter,
      lowStockProducts: raw.actionCenter?.lowStockProducts || [],
      overstockProducts: raw.actionCenter?.overstockProducts || [],
      blockedOrders: raw.actionCenter?.blockedOrders || [],
      readyPickLists: raw.actionCenter?.readyPickLists || [],
      recentMovements: raw.actionCenter?.recentMovements || [],
      recentLogs: raw.actionCenter?.recentLogs || []
    },
    metrics: { ...EMPTY_METRICS, ...raw.metrics }
  };
}

function buildMergedActions(actionCenter) {
  const severityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const rows = [];

  for (const item of actionCenter.lowStockProducts || []) {
    rows.push({ ...item, category: "Low stock" });
  }
  for (const item of actionCenter.blockedOrders || []) {
    rows.push({ ...item, category: "Blocked order" });
  }
  for (const item of actionCenter.readyPickLists || []) {
    rows.push({ ...item, category: "Pick list" });
  }
  for (const item of actionCenter.overstockProducts || []) {
    rows.push({ ...item, category: "Overstock" });
  }

  return rows.sort(
    (a, b) =>
      (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3) ||
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <LoadingSkeleton key={index} className="h-[132px]" />
        ))}
      </div>
      <LoadingSkeleton className="h-48" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <LoadingSkeleton className="h-[420px]" />
        <LoadingSkeleton className="h-[420px]" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { token } = useAuth();
  const { tasks, robot, initialLoading, refreshing, refreshData, lastUpdated, loadError } = useAppData();

  const [overviewRaw, setOverviewRaw] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState("");
  const [overviewRefreshing, setOverviewRefreshing] = useState(false);

  const overview = useMemo(() => mergeOverview(overviewRaw), [overviewRaw]);

  const loadOverview = useCallback(async () => {
    if (!token) {
      setOverviewRaw(null);
      setOverviewLoading(false);
      return;
    }
    try {
      const data = await getDashboardOverview(token);
      setOverviewRaw(data);
      setOverviewError("");
    } catch (error) {
      if (error?.status === 401) {
        setOverviewError("Session expired. Please sign in again.");
      } else {
        setOverviewError(getErrorMessage(error, "Could not load warehouse overview."));
      }
      setOverviewRaw(null);
    } finally {
      setOverviewLoading(false);
      setOverviewRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setOverviewRaw(null);
      setOverviewLoading(false);
      return;
    }
    setOverviewLoading(true);
    loadOverview();
  }, [token, loadOverview]);

  async function handleRefresh() {
    setOverviewRefreshing(true);
    await Promise.allSettled([loadOverview(), refreshData({ silent: true })]);
  }

  const mergedActions = useMemo(() => buildMergedActions(overview.actionCenter), [overview.actionCenter]);

  const recentTasks = useMemo(
    () =>
      [...tasks]
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
        .slice(0, 5),
    [tasks]
  );

  const robotStateForUi = robot?.currentState || overview.robot.activeRobotState;
  const robotStateMeta = getRobotStateMeta(robotStateForUi);
  const robotName = robot?.name || overview.robot.activeRobotName || "Robot";
  const showMainSkeleton = overviewLoading && !overviewRaw;

  return (
    <PageTransition>
      <PageHeader
        title="Warehouse Intelligence Dashboard"
        description="Inventory health, order fulfillment, pick lists, and robot dispatch overview."
        lastUpdated={lastUpdated}
        actions={
          <Button variant="secondary" onClick={handleRefresh} isLoading={refreshing || overviewRefreshing}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {(loadError || overviewError) && (
        <div className="mb-6 space-y-2">
          {loadError ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 backdrop-blur-sm">
              Live queue data: {loadError}
            </div>
          ) : null}
          {overviewError ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 backdrop-blur-sm">
              {overviewError}
            </div>
          ) : null}
        </div>
      )}

      {showMainSkeleton ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <StatCard
              label="Total SKUs"
              value={formatNumber(overview.inventory.totalSKUs)}
              helper="Catalog products"
              tone="primary"
              icon={<Package className="h-4 w-4" />}
            />
            <StatCard
              label="Low stock items"
              value={formatNumber(overview.inventory.lowStockCount)}
              helper="At or below minimum"
              tone="error"
              icon={<AlertTriangle className="h-4 w-4" />}
            />
            <StatCard
              label="Reorder required"
              value={formatNumber(overview.inventory.reorderRequiredCount)}
              helper="Suggested reorder quantity greater than 0"
              tone="warning"
              icon={<Warehouse className="h-4 w-4" />}
            />
            <StatCard
              label="Ready to pick orders"
              value={formatNumber(overview.fulfillment.readyToPickOrders)}
              helper="Fully allocated"
              tone="success"
              icon={<ShoppingCart className="h-4 w-4" />}
            />
            <StatCard
              label="Blocked orders"
              value={formatNumber(overview.fulfillment.insufficientStockOrders)}
              helper="Insufficient stock"
              tone="error"
              icon={<AlertTriangle className="h-4 w-4" />}
            />
            <StatCard
              label="Open pick lists"
              value={formatNumber(overview.fulfillment.openPickLists)}
              helper="OPEN or PICKING"
              tone="info"
              icon={<ClipboardCheck className="h-4 w-4" />}
            />
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Operations metrics</CardTitle>
              <CardDescription>Derived KPIs across inventory and fulfillment.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Stock health</div>
                  <div className="brand-heading mt-2 text-2xl font-semibold text-white">
                    {formatPercent(overview.metrics.stockHealthScore)}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Share of SKUs in normal band</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Order completion</div>
                  <div className="brand-heading mt-2 text-2xl font-semibold text-white">
                    {formatPercent(overview.metrics.orderCompletionRate)}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Completed / total orders</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Blocked order rate</div>
                  <div className="brand-heading mt-2 text-2xl font-semibold text-white">
                    {formatPercent(overview.metrics.blockedOrderRate)}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Insufficient stock / total orders</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Actions required</div>
                  <div className="brand-heading mt-2 text-2xl font-semibold text-white">
                    {formatNumber(overview.metrics.totalActionsRequired)}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Low + overstock + blocked + open picks</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid gap-6">
              <Card className="border-cyan-500/20 shadow-[0_0_40px_rgba(34,211,238,0.08)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-cyan-300" />
                    Warehouse action center
                  </CardTitle>
                  <CardDescription>Prioritized work queue across stock, orders, and picking.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {mergedActions.length === 0 ? (
                    <EmptyState
                      title="No actions required"
                      description="Inventory and fulfillment are clear, or data has not been added yet."
                    />
                  ) : (
                    mergedActions.map((item, index) => (
                      <div
                        key={`${item.category}-${item.relatedId}-${index}`}
                        className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={severityTone(item.severity)}>{item.severity}</Badge>
                            <Badge tone="neutral">{item.category}</Badge>
                          </div>
                          <span className="text-xs text-slate-400">{formatDateTime(item.createdAt)}</span>
                        </div>
                        <div className="mt-2 text-sm font-semibold text-white">{item.title}</div>
                        <p className="mt-1 text-sm leading-6 text-slate-300">{item.description}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.status ? (
                            <Badge tone={actionStatusTone(item.status)}>{item.status}</Badge>
                          ) : null}
                          {item.category === "Low stock" || item.category === "Overstock" ? (
                            <Link to="/inventory" className={linkButtonSecondarySm}>
                              Open inventory
                            </Link>
                          ) : null}
                          {item.category === "Blocked order" || item.category === "Pick list" ? (
                            <Link to="/fulfillment" className={linkButtonSecondarySm}>
                              Open fulfillment
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Inventory risk panel</CardTitle>
                  <CardDescription>Top low-stock and overstock SKUs by severity.</CardDescription>
                </CardHeader>
                <CardContent>
                  {overview.inventory.totalSKUs === 0 ? (
                    <EmptyState
                      title="No inventory items added yet"
                      description="Add products on the Inventory page to populate risk signals."
                    />
                  ) : (
                    <div className="grid gap-6 lg:grid-cols-2">
                      <div>
                        <div className="mb-2 text-sm font-semibold text-white">Low stock</div>
                        {overview.actionCenter.lowStockProducts.length === 0 ? (
                          <p className="text-sm text-slate-400">No low-stock SKUs in the top slice.</p>
                        ) : (
                          <div className="overflow-x-auto thin-scrollbar">
                            <table className="min-w-full text-left text-sm">
                              <thead>
                                <tr className="border-b border-white/10 text-slate-400">
                                  <th className="pb-2 font-medium">Product / SKU</th>
                                  <th className="pb-2 font-medium">Current</th>
                                  <th className="pb-2 font-medium">Min / max</th>
                                  <th className="pb-2 font-medium">Status</th>
                                  <th className="pb-2 font-medium">Reorder</th>
                                  <th className="pb-2 font-medium">Location</th>
                                </tr>
                              </thead>
                              <tbody>
                                {overview.actionCenter.lowStockProducts.map((row) => (
                                  <tr key={row.relatedId} className="border-b border-white/5 last:border-b-0">
                                    <td className="py-2">
                                      <div className="text-white">{row.name}</div>
                                      <div className="font-mono text-xs text-slate-400">{row.sku}</div>
                                    </td>
                                    <td className="py-2 text-white">{formatNumber(row.currentStock)}</td>
                                    <td className="py-2 text-slate-300">
                                      {formatNumber(row.minStock)} / {formatNumber(row.maxStock)}
                                    </td>
                                    <td className="py-2">
                                      <Badge tone={stockStatusTone(row.stockStatus)}>{row.stockStatus}</Badge>
                                    </td>
                                    <td className="py-2 text-white">{formatNumber(row.suggestedReorderQty)}</td>
                                    <td className="py-2 text-slate-300">{row.location || "--"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="mb-2 text-sm font-semibold text-white">Overstock</div>
                        {overview.actionCenter.overstockProducts.length === 0 ? (
                          <p className="text-sm text-slate-400">No overstock SKUs in the top slice.</p>
                        ) : (
                          <div className="overflow-x-auto thin-scrollbar">
                            <table className="min-w-full text-left text-sm">
                              <thead>
                                <tr className="border-b border-white/10 text-slate-400">
                                  <th className="pb-2 font-medium">Product / SKU</th>
                                  <th className="pb-2 font-medium">Current</th>
                                  <th className="pb-2 font-medium">Min / max</th>
                                  <th className="pb-2 font-medium">Status</th>
                                  <th className="pb-2 font-medium">Reorder</th>
                                  <th className="pb-2 font-medium">Location</th>
                                </tr>
                              </thead>
                              <tbody>
                                {overview.actionCenter.overstockProducts.map((row) => (
                                  <tr key={row.relatedId} className="border-b border-white/5 last:border-b-0">
                                    <td className="py-2">
                                      <div className="text-white">{row.name}</div>
                                      <div className="font-mono text-xs text-slate-400">{row.sku}</div>
                                    </td>
                                    <td className="py-2 text-white">{formatNumber(row.currentStock)}</td>
                                    <td className="py-2 text-slate-300">
                                      {formatNumber(row.minStock)} / {formatNumber(row.maxStock)}
                                    </td>
                                    <td className="py-2">
                                      <Badge tone={stockStatusTone(row.stockStatus)}>{row.stockStatus}</Badge>
                                    </td>
                                    <td className="py-2 text-white">{formatNumber(row.suggestedReorderQty)}</td>
                                    <td className="py-2 text-slate-300">{row.location || "--"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Fulfillment overview</CardTitle>
                  <CardDescription>Order pipeline and pick list workload.</CardDescription>
                </CardHeader>
                <CardContent>
                  {overview.fulfillment.totalOrders === 0 && overview.fulfillment.openPickLists === 0 ? (
                    <EmptyState
                      title="No orders created yet"
                      description="Create orders from the Fulfillment page when inventory is ready."
                    />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                      {[
                        { label: "Pending", value: overview.fulfillment.pendingOrders },
                        { label: "Ready to pick", value: overview.fulfillment.readyToPickOrders },
                        {
                          label: "Insufficient stock",
                          value: overview.fulfillment.insufficientStockOrders
                        },
                        { label: "Completed", value: overview.fulfillment.completedOrders },
                        { label: "Open pick lists", value: overview.fulfillment.openPickLists }
                      ].map((cell) => (
                        <div
                          key={cell.label}
                          className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center backdrop-blur-xl"
                        >
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            {cell.label}
                          </div>
                          <div className="brand-heading mt-2 text-2xl font-semibold text-white">
                            {formatNumber(cell.value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent activity</CardTitle>
                  <CardDescription>Latest stock movements and system logs.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div>
                      <div className="mb-2 text-sm font-semibold text-white">Stock movements</div>
                      {overview.actionCenter.recentMovements.length === 0 ? (
                        <p className="text-sm text-slate-400">No movements recorded yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {overview.actionCenter.recentMovements.map((m) => (
                            <li
                              key={m.relatedId}
                              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm backdrop-blur-xl"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <Badge tone="info">{m.status}</Badge>
                                <span className="text-xs text-slate-400">{formatDateTime(m.createdAt)}</span>
                              </div>
                              <div className="mt-1 font-medium text-white">{m.title}</div>
                              <p className="mt-1 text-xs text-slate-300">{m.description}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <div className="mb-2 text-sm font-semibold text-white">System logs</div>
                      {overview.actionCenter.recentLogs.length === 0 ? (
                        <p className="text-sm text-slate-400">No logs available yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {overview.actionCenter.recentLogs.map((log) => (
                            <li
                              key={log.relatedId}
                              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm backdrop-blur-xl"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <Badge tone="primary">{log.title}</Badge>
                                <span className="text-xs text-slate-400">{formatDateTime(log.createdAt)}</span>
                              </div>
                              <p className="mt-2 text-xs leading-5 text-slate-200">{log.description}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 content-start">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bot className="h-4 w-4 text-cyan-300" />
                    Robot dispatch unit
                  </CardTitle>
                  <CardDescription className="text-xs">Execution layer — secondary to warehouse KPIs.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
                    <div className="text-xs text-slate-400">Robot</div>
                    <div className="brand-heading mt-1 text-lg font-semibold text-white">{robotName}</div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge className={robotStateMeta.badgeClass}>{robotStateMeta.label}</Badge>
                      <Badge tone="neutral">{dispatchLabel(overview.robot.dispatchStatus)}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      Zone: {robot?.location_label || robot?.location || "—"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Active task</div>
                    {overview.robot.activeTask ? (
                      <div className="mt-2 space-y-1 text-white">
                        <div className="font-mono text-xs text-slate-300">{formatTaskId(overview.robot.activeTask.id)}</div>
                        <div className="text-sm">
                          {(overview.robot.activeTask.pickup_zone_label || overview.robot.activeTask.pickup_zone) ||
                            "?"}{" "}
                          →{" "}
                          {(overview.robot.activeTask.drop_zone_label || overview.robot.activeTask.drop_zone) || "?"}
                        </div>
                        <Badge tone="info">{overview.robot.activeTask.status}</Badge>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-400">No active assigned task.</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-2">
                      <div className="text-slate-400">Idle</div>
                      <div className="text-lg font-semibold text-white">{formatNumber(overview.robot.idleRobots)}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-2">
                      <div className="text-slate-400">Busy</div>
                      <div className="text-lg font-semibold text-white">{formatNumber(overview.robot.busyRobots)}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-2">
                      <div className="text-slate-400">Errors</div>
                      <div className="text-lg font-semibold text-rose-200">{formatNumber(overview.robot.errorRobots)}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-2">
                      <div className="text-slate-400">Fleet</div>
                      <div className="text-lg font-semibold text-white">{formatNumber(overview.robot.totalRobots)}</div>
                    </div>
                  </div>

                  <Link to="/robot" className={`${linkButtonSecondarySm} w-full`}>
                    Robot control
                  </Link>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent robot queue</CardTitle>
                  <CardDescription className="text-xs">Latest tasks from the live feed.</CardDescription>
                </CardHeader>
                <CardContent>
                  {initialLoading && recentTasks.length === 0 ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <LoadingSkeleton key={i} className="h-12" />
                      ))}
                    </div>
                  ) : recentTasks.length === 0 ? (
                    <EmptyState title="No tasks yet" description="Create tasks from the Tasks page." />
                  ) : (
                    <div className="overflow-x-auto thin-scrollbar">
                      <table className="min-w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-white/10 text-slate-400">
                            <th className="pb-2 font-medium">Task</th>
                            <th className="pb-2 font-medium">Status</th>
                            <th className="pb-2 font-medium">Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentTasks.map((task) => {
                            const statusMeta = getTaskStatusMeta(task.status);
                            return (
                              <tr key={task.id} className="border-b border-white/5 last:border-b-0">
                                <td className="py-2 font-mono text-slate-300">{formatTaskId(task.id)}</td>
                                <td className="py-2">
                                  <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
                                </td>
                                <td className="py-2 text-slate-400">{formatDateTime(task.createdAt)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <Link
                    to="/tasks"
                    className="mt-3 inline-flex w-full items-center justify-center rounded-2xl px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 hover:text-white"
                  >
                    View all tasks
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </PageTransition>
  );
}
