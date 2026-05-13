import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck,
  Eye,
  ListPlus,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
  X
} from "lucide-react";
import {
  cancelOrder,
  completePickList,
  createOrder,
  generatePickList,
  getFulfillmentSummary,
  getOrders,
  getPickLists,
  listProducts
} from "../lib/api";
import { formatDateTime, getErrorMessage } from "../lib/formatters";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { PageHeader } from "../components/PageHeader";
import { PageTransition } from "../components/PageTransition";
import { StatCard } from "../components/StatCard";

const emptySummary = {
  totalOrders: 0,
  pendingOrders: 0,
  readyToPickOrders: 0,
  insufficientStockOrders: 0,
  completedOrders: 0,
  openPickLists: 0,
  completedPickLists: 0
};

const orderStatusTone = {
  PENDING: "neutral",
  READY_TO_PICK: "success",
  INSUFFICIENT_STOCK: "error",
  PICKING: "primary",
  PICKED: "info",
  COMPLETED: "success",
  CANCELLED: "neutral"
};

const pickStatusTone = {
  OPEN: "warning",
  PICKING: "primary",
  COMPLETED: "success",
  CANCELLED: "neutral"
};

const priorityTone = {
  LOW: "neutral",
  NORMAL: "info",
  HIGH: "warning",
  URGENT: "error"
};

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function pickListLineSummary(items) {
  if (!items?.length) return "--";
  if (items.length === 1) return `${items[0].sku}`;
  return `${items[0].sku} +${items.length - 1} more`;
}

function pickListTotalQty(items) {
  if (!items?.length) return 0;
  return items.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
}

function pickListLocationSummary(items) {
  if (!items?.length) return "--";
  if (items.length === 1) return items[0].location || "--";
  return "Multiple";
}

function CreateOrderModal({
  open,
  onClose,
  products,
  saving,
  customerName,
  priority,
  dueDate,
  lines,
  onCustomerChange,
  onPriorityChange,
  onDueDateChange,
  onAddLine,
  onRemoveLine,
  onLineChange,
  onSubmit
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close create order"
      />
      <section className="surface-card relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="relative z-10 flex items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <h2 className="brand-heading text-xl font-semibold text-white">Create order</h2>
            <p className="mt-1 text-sm text-slate-400">Build a pickable order from catalog inventory.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close create order">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <form className="relative z-10 grid gap-5 px-6 py-6" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2 md:col-span-2">
              <label className="text-sm font-medium text-slate-300">Customer / department</label>
              <Input
                value={customerName}
                onChange={(e) => onCustomerChange(e.target.value)}
                placeholder="e.g. Retail partner or internal department"
                required
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-300">Priority</label>
              <Select value={priority} onChange={(e) => onPriorityChange(e.target.value)}>
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-300">Due date (optional)</label>
              <Input type="date" value={dueDate} onChange={(e) => onDueDateChange(e.target.value)} />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">Order lines</div>
              <Button type="button" size="sm" variant="secondary" onClick={onAddLine}>
                <Plus className="h-4 w-4" />
                Add product
              </Button>
            </div>

            <div className="mt-4 grid gap-3">
              {lines.map((line, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-xl border border-white/10 bg-slate-950/30 p-3 md:grid-cols-[1fr_120px_auto]"
                >
                  <div className="grid gap-2">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Product</label>
                    <Select
                      value={line.productId}
                      onChange={(e) => onLineChange(index, "productId", e.target.value)}
                      required
                    >
                      <option value="">Select SKU</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name} (stock {formatNumber(p.currentStock)} @ {p.location || "—"})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Qty</label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={line.quantity}
                      onChange={(e) => onLineChange(index, "quantity", e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex items-end justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveLine(index)}
                      disabled={lines.length <= 1}
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4 text-rose-300" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving}>
              <ListPlus className="h-4 w-4" />
              Submit order
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function OrderDetailModal({ open, order, onClose }) {
  if (!open || !order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close order details"
      />
      <section className="surface-card relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="relative z-10 flex items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <h2 className="brand-heading text-xl font-semibold text-white">Order {order.orderNo}</h2>
            <p className="mt-1 text-sm text-slate-400">{order.customerName}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="relative z-10 space-y-5 px-6 py-6">
          <div className="flex flex-wrap gap-2">
            <Badge tone={orderStatusTone[order.status] || "neutral"}>{order.status}</Badge>
            <Badge tone={priorityTone[order.priority] || "neutral"}>{order.priority}</Badge>
            {order.dueDate ? (
              <Badge tone="info">Due {formatDateTime(order.dueDate)}</Badge>
            ) : null}
          </div>

          {order.status === "INSUFFICIENT_STOCK" && order.insufficientItems?.length ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-100">
                <TriangleAlert className="h-4 w-4" />
                Shortage details
              </div>
              <div className="mt-3 overflow-x-auto thin-scrollbar">
                <table className="min-w-full text-left text-sm text-rose-50">
                  <thead>
                    <tr className="border-b border-white/10 text-rose-200/80">
                      <th className="pb-2 font-medium">Product</th>
                      <th className="pb-2 font-medium">Requested</th>
                      <th className="pb-2 font-medium">Available</th>
                      <th className="pb-2 font-medium">Shortage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.insufficientItems.map((row, idx) => (
                      <tr key={idx} className="border-b border-white/5 last:border-b-0">
                        <td className="py-2">
                          <div className="font-medium text-white">{row.name}</div>
                          <div className="font-mono text-xs text-slate-300">{row.sku}</div>
                        </td>
                        <td className="py-2">{formatNumber(row.requestedQty)}</td>
                        <td className="py-2">{formatNumber(row.availableQty)}</td>
                        <td className="py-2 font-semibold">{formatNumber(row.shortageQty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div>
            <div className="text-sm font-semibold text-white">Requested lines</div>
            <div className="mt-2 overflow-x-auto thin-scrollbar">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="pb-2 font-medium">SKU</th>
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Qty</th>
                    <th className="pb-2 font-medium">Location</th>
                    <th className="pb-2 font-medium">Stock at order</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.items || []).map((row, idx) => (
                    <tr key={idx} className="border-b border-white/5 last:border-b-0">
                      <td className="py-2 font-mono text-slate-300">{row.sku}</td>
                      <td className="py-2 text-white">{row.name}</td>
                      <td className="py-2">{formatNumber(row.quantity)}</td>
                      <td className="py-2 text-slate-300">{row.location || "--"}</td>
                      <td className="py-2 text-slate-300">{formatNumber(row.availableStockAtCreation)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function PickListDetailModal({ open, pickList, onClose }) {
  if (!open || !pickList) return null;

  const items = [...(pickList.items || [])].sort((a, b) =>
    String(a.location || "").localeCompare(String(b.location || ""), undefined, { sensitivity: "base" })
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close pick list"
      />
      <section className="surface-card relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="relative z-10 flex items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <h2 className="brand-heading text-xl font-semibold text-white">Pick list {pickList.pickNo}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {pickList.orderNo ? `Order ${pickList.orderNo}` : "Linked order"}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="relative z-10 px-6 py-6">
          <Badge tone={pickStatusTone[pickList.status] || "neutral"} className="mb-4">
            {pickList.status}
          </Badge>
          <p className="mb-4 text-sm text-slate-400">
            Lines are sorted by warehouse location for an efficient pick walk.
          </p>
          <div className="overflow-x-auto thin-scrollbar">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="pb-2 font-medium">SKU</th>
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium">Qty</th>
                  <th className="pb-2 font-medium">Location</th>
                  <th className="pb-2 font-medium">Picked</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, idx) => (
                  <tr key={idx} className="border-b border-white/5 last:border-b-0">
                    <td className="py-2 font-mono text-slate-300">{row.sku}</td>
                    <td className="py-2 text-white">{row.name}</td>
                    <td className="py-2">{formatNumber(row.quantity)}</td>
                    <td className="py-2 text-cyan-200">{row.location || "--"}</td>
                    <td className="py-2">{row.picked ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function Fulfillment() {
  const { token, logout } = useAuth();
  const toast = useToast();

  const [summary, setSummary] = useState(emptySummary);
  const [orders, setOrders] = useState([]);
  const [pickLists, setPickLists] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState([{ productId: "", quantity: "1" }]);
  const [createSaving, setCreateSaving] = useState(false);

  const [viewOrder, setViewOrder] = useState(null);
  const [viewPickList, setViewPickList] = useState(null);

  const [orderToCancel, setOrderToCancel] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const [pickToComplete, setPickToComplete] = useState(null);
  const [completeLoading, setCompleteLoading] = useState(false);

  const loadAll = useCallback(
    async ({ silent } = {}) => {
      if (!token) return;
      if (silent) setRefreshing(true);
      else setLoading(true);

      try {
        const [sumRes, ordRes, pickRes, prodRes] = await Promise.all([
          getFulfillmentSummary(token),
          getOrders(token),
          getPickLists(token),
          listProducts(token)
        ]);

        setSummary({ ...emptySummary, ...sumRes });
        setOrders(ordRes.orders || []);
        setPickLists(pickRes.pickLists || []);
        setProducts(prodRes.products || []);
        setLastUpdated(new Date());
      } catch (err) {
        if (err?.status === 401) {
          toast.error("Session expired. Please sign in again.");
          logout();
          return;
        }
        toast.error(getErrorMessage(err, "Failed to load fulfillment data."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, logout, toast]
  );

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [orders]
  );

  const sortedPickLists = useMemo(
    () => [...pickLists].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [pickLists]
  );

  function resetCreateForm() {
    setCustomerName("");
    setPriority("NORMAL");
    setDueDate("");
    setLines([{ productId: "", quantity: "1" }]);
  }

  function openCreate() {
    resetCreateForm();
    setCreateOpen(true);
  }

  function addLine() {
    setLines((current) => [...current, { productId: "", quantity: "1" }]);
  }

  function removeLine(index) {
    setLines((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)));
  }

  function changeLine(index, field, value) {
    setLines((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  async function handleCreateSubmit(event) {
    event.preventDefault();
    if (!token) return;

    const payloadItems = lines
      .filter((row) => row.productId)
      .map((row) => ({
        productId: row.productId,
        quantity: Number(row.quantity || 0)
      }));

    if (!payloadItems.length) {
      toast.error("Add at least one product line with a selected SKU.");
      return;
    }

    if (payloadItems.some((row) => !Number.isFinite(row.quantity) || row.quantity < 1)) {
      toast.error("Each line needs a valid quantity of at least 1.");
      return;
    }

    setCreateSaving(true);
    try {
      await createOrder(token, {
        customerName: customerName.trim(),
        priority,
        dueDate: dueDate || null,
        items: payloadItems
      });
      toast.success("Order created.");
      setCreateOpen(false);
      resetCreateForm();
      await loadAll({ silent: true });
    } catch (err) {
      if (err?.status === 401) {
        toast.error("Session expired. Please sign in again.");
        logout();
        return;
      }
      toast.error(getErrorMessage(err, "Could not create order."));
    } finally {
      setCreateSaving(false);
    }
  }

  async function handleGeneratePickList(order) {
    if (!token || !order?.id) return;
    try {
      const res = await generatePickList(token, order.id);
      if (res.existing) {
        toast.success("An open pick list already exists for this order.");
      } else {
        toast.success("Pick list generated.");
      }
      await loadAll({ silent: true });
    } catch (err) {
      if (err?.status === 401) {
        toast.error("Session expired. Please sign in again.");
        logout();
        return;
      }
      toast.error(getErrorMessage(err, "Could not generate pick list."));
    }
  }

  async function handleCancelOrder() {
    if (!token || !orderToCancel?.id) return;
    setCancelLoading(true);
    try {
      await cancelOrder(token, orderToCancel.id);
      toast.success("Order cancelled.");
      setOrderToCancel(null);
      await loadAll({ silent: true });
    } catch (err) {
      if (err?.status === 401) {
        toast.error("Session expired. Please sign in again.");
        logout();
        return;
      }
      toast.error(getErrorMessage(err, "Could not cancel order."));
    } finally {
      setCancelLoading(false);
    }
  }

  async function handleCompletePick() {
    if (!token || !pickToComplete?.id) return;
    setCompleteLoading(true);
    try {
      await completePickList(token, pickToComplete.id);
      toast.success("Picking completed. Stock updated.");
      setPickToComplete(null);
      await loadAll({ silent: true });
    } catch (err) {
      if (err?.status === 401) {
        toast.error("Session expired. Please sign in again.");
        logout();
        return;
      }
      toast.error(getErrorMessage(err, "Could not complete picking."));
    } finally {
      setCompleteLoading(false);
    }
  }

  return (
    <PageTransition>
      <PageHeader
        title="Order fulfillment"
        description="Create customer orders from inventory, generate location-sorted pick lists, and confirm picks with automatic stock deductions."
        lastUpdated={lastUpdated}
        actions={
          <div className="flex w-full flex-col gap-3 sm:flex-row">
            <Button variant="secondary" onClick={() => loadAll()} isLoading={refreshing}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={openCreate}>
              <ListPlus className="h-4 w-4" />
              Create order
            </Button>
          </div>
        }
      />

      <ConfirmDialog
        open={Boolean(orderToCancel)}
        title="Cancel this order?"
        description="Open pick lists for this order will also be cancelled."
        icon={<Trash2 className="h-5 w-5 text-rose-200" />}
        confirmText="Cancel order"
        confirmLoading={cancelLoading}
        destructive
        onCancel={() => setOrderToCancel(null)}
        onConfirm={handleCancelOrder}
      />

      <ConfirmDialog
        open={Boolean(pickToComplete)}
        title="Complete picking?"
        description="This deducts stock for every line, records OUT movements, and marks the order complete."
        icon={<ClipboardCheck className="h-5 w-5 text-emerald-200" />}
        confirmText="Complete picking"
        confirmLoading={completeLoading}
        onCancel={() => setPickToComplete(null)}
        onConfirm={handleCompletePick}
      />

      <CreateOrderModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        products={products}
        saving={createSaving}
        customerName={customerName}
        priority={priority}
        dueDate={dueDate}
        lines={lines}
        onCustomerChange={setCustomerName}
        onPriorityChange={setPriority}
        onDueDateChange={setDueDate}
        onAddLine={addLine}
        onRemoveLine={removeLine}
        onLineChange={changeLine}
        onSubmit={handleCreateSubmit}
      />

      <OrderDetailModal open={Boolean(viewOrder)} order={viewOrder} onClose={() => setViewOrder(null)} />

      <PickListDetailModal
        open={Boolean(viewPickList)}
        pickList={viewPickList}
        onClose={() => setViewPickList(null)}
      />

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <LoadingSkeleton key={index} className="h-[132px]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-5">
          <StatCard
            label="Total orders"
            value={formatNumber(summary.totalOrders)}
            helper="All time"
            tone="primary"
            icon={<ClipboardCheck className="h-4 w-4" />}
          />
          <StatCard
            label="Ready to pick"
            value={formatNumber(summary.readyToPickOrders)}
            helper="Fully allocated stock"
            tone="success"
            icon={<ListPlus className="h-4 w-4" />}
          />
          <StatCard
            label="Insufficient stock"
            value={formatNumber(summary.insufficientStockOrders)}
            helper="Needs replenishment"
            tone="error"
            icon={<TriangleAlert className="h-4 w-4" />}
          />
          <StatCard
            label="Completed orders"
            value={formatNumber(summary.completedOrders)}
            helper="Picking finished"
            tone="info"
            icon={<ClipboardCheck className="h-4 w-4" />}
          />
          <StatCard
            label="Open pick lists"
            value={formatNumber(summary.openPickLists)}
            helper="OPEN or PICKING"
            tone="warning"
            icon={<Eye className="h-4 w-4" />}
          />
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Orders</CardTitle>
          <CardDescription>Monitor availability, shortages, and fulfillment progress.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <LoadingSkeleton key={index} className="h-16" />
              ))}
            </div>
          ) : sortedOrders.length === 0 ? (
            <EmptyState title="No orders yet" description="Create an order to start fulfillment." />
          ) : (
            <div className="overflow-x-auto thin-scrollbar">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="pb-3 font-medium">Order no.</th>
                    <th className="pb-3 font-medium">Customer</th>
                    <th className="pb-3 font-medium">Priority</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Total items</th>
                    <th className="pb-3 font-medium">Created</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedOrders.map((order) => {
                    const canPick = order.status === "READY_TO_PICK";
                    const canCancel = order.status !== "COMPLETED" && order.status !== "CANCELLED";

                    return (
                      <tr key={order.id} className="border-b border-white/10 last:border-b-0">
                        <td className="py-4 font-mono text-slate-200">{order.orderNo}</td>
                        <td className="py-4 text-white">{order.customerName}</td>
                        <td className="py-4">
                          <Badge tone={priorityTone[order.priority] || "neutral"}>{order.priority}</Badge>
                        </td>
                        <td className="py-4">
                          <Badge tone={orderStatusTone[order.status] || "neutral"}>{order.status}</Badge>
                        </td>
                        <td className="py-4 text-white">{formatNumber(order.totalItems)}</td>
                        <td className="py-4 text-slate-300">{formatDateTime(order.createdAt)}</td>
                        <td className="py-4">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button size="sm" variant="secondary" onClick={() => setViewOrder(order)}>
                              <Eye className="h-4 w-4" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={!canPick}
                              onClick={() => handleGeneratePickList(order)}
                              title={canPick ? "" : "Only READY_TO_PICK orders can generate a pick list."}
                            >
                              Pick list
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-rose-200 hover:text-white"
                              disabled={!canCancel}
                              onClick={() => setOrderToCancel(order)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Pick lists</CardTitle>
          <CardDescription>Location-sorted sequences ready for the warehouse floor.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <LoadingSkeleton key={index} className="h-16" />
              ))}
            </div>
          ) : sortedPickLists.length === 0 ? (
            <EmptyState title="No pick lists" description="Generate a pick list from a ready order." />
          ) : (
            <div className="overflow-x-auto thin-scrollbar">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="pb-3 font-medium">Pick no.</th>
                    <th className="pb-3 font-medium">Order no.</th>
                    <th className="pb-3 font-medium">Product / SKU</th>
                    <th className="pb-3 font-medium">Quantity</th>
                    <th className="pb-3 font-medium">Location</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPickLists.map((pick) => {
                    const canComplete = pick.status === "OPEN" || pick.status === "PICKING";
                    return (
                      <tr key={pick.id} className="border-b border-white/10 last:border-b-0">
                        <td className="py-4 font-mono text-slate-200">{pick.pickNo}</td>
                        <td className="py-4 font-mono text-slate-300">{pick.orderNo || "--"}</td>
                        <td className="py-4 text-white">{pickListLineSummary(pick.items)}</td>
                        <td className="py-4 text-white">{formatNumber(pickListTotalQty(pick.items))}</td>
                        <td className="py-4 text-slate-300">{pickListLocationSummary(pick.items)}</td>
                        <td className="py-4">
                          <Badge tone={pickStatusTone[pick.status] || "neutral"}>{pick.status}</Badge>
                        </td>
                        <td className="py-4">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button size="sm" variant="secondary" onClick={() => setViewPickList(pick)}>
                              <Eye className="h-4 w-4" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => setPickToComplete(pick)}
                              disabled={!canComplete}
                              title={canComplete ? "" : "Only open pick lists can be completed."}
                            >
                              <ClipboardCheck className="h-4 w-4" />
                              Complete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
