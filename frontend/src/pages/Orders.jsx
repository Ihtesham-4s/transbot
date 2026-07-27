import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ClipboardList, PackageCheck, Plus, RefreshCw, ShoppingCart, Trash2, X } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { PageHeader } from "../components/PageHeader";
import { PageTransition } from "../components/PageTransition";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { apiFetch } from "../lib/api";
import { formatDateTime, getErrorMessage } from "../lib/formatters";

function OrdersTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <LoadingSkeleton key={index} className="h-16" />
      ))}
    </div>
  );
}

function getStatusTone(status) {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "error";
  if (status === "BLOCKED") return "warning";
  return "neutral";
}

function getProductId(product) {
  return product?.id || product?._id || "";
}

function getUserName(user) {
  if (!user) return "--";
  if (typeof user === "string") return user;
  return user.name || user.email || "--";
}

function summarizeItems(items = []) {
  const count = items.reduce((total, item) => total + Number(item.quantity || 0), 0);
  return `${count} unit${count === 1 ? "" : "s"}`;
}

function summarizeProducts(items = []) {
  if (items.length === 0) return "--";
  return items
    .map((item) => {
      const product = item.product_id;
      const label = typeof product === "object" ? product.sku || product.name || "Item" : "Item";
      return `${label} x${item.quantity}`;
    })
    .join(", ");
}

function getZoneLabel(zone) {
  if (!zone) return "--";
  if (typeof zone === "string") return zone;
  return zone.label || zone.code || zone.name || "--";
}

const blankItem = { product_id: "", quantity: "1" };

export default function Orders() {
  const { token, user } = useAuth();
  const toast = useToast();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [zones, setZones] = useState([]);
  const [picklists, setPicklists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [deliverZoneId, setDeliverZoneId] = useState("");
  const [items, setItems] = useState([{ ...blankItem }]);
  const [submitting, setSubmitting] = useState(false);
  const [pendingActions, setPendingActions] = useState({});

  const isManager = user?.role === "manager";
  const productOptions = useMemo(
    () => products.map((product) => ({ ...product, optionId: getProductId(product) })).filter((product) => product.optionId),
    [products]
  );
  const picklistOrderIds = useMemo(
    () =>
      new Set(
        picklists
          .map((picklist) => (typeof picklist.order_id === "object" ? picklist.order_id?.id : picklist.order_id))
          .filter(Boolean)
      ),
    [picklists]
  );

  const loadOrders = useCallback(async () => {
    if (!token) {
      setOrders([]);
      setLoading(false);
      return;
    }

    try {
      const data = await apiFetch("/api/orders", { method: "GET", token });
      setOrders(data.orders || []);
      setError("");
    } catch (loadError) {
      setOrders([]);
      setError(getErrorMessage(loadError, "Could not load orders."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  const loadProducts = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetch("/api/inventory", { method: "GET", token });
      setProducts(data.products || []);
    } catch {
      setProducts([]);
    }
  }, [token]);

  const loadZones = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetch("/api/zones", { method: "GET", token });
      setZones(data.zones || []);
    } catch {
      setZones([]);
    }
  }, [token]);

  const loadPicklists = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetch("/api/picklists", { method: "GET", token });
      setPicklists(data.picklists || []);
    } catch {
      setPicklists([]);
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    loadOrders();
    loadProducts();
    loadZones();
    loadPicklists();
  }, [loadOrders, loadProducts, loadPicklists, loadZones]);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.allSettled([loadOrders(), loadProducts(), loadZones(), loadPicklists()]);
  }

  function resetForm() {
    setItems([{ ...blankItem, product_id: productOptions[0]?.optionId || "" }]);
    setDeliverZoneId(zones[0]?.id || "");
  }

  function openCreateModal() {
    resetForm();
    setShowForm(true);
  }

  function updateItem(index, patch) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((current) => [...current, { ...blankItem, product_id: productOptions[0]?.optionId || "" }]);
  }

  function removeItem(index) {
    setItems((current) => (current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index)));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!token) return;

    const payload = {
      deliverZone_id: deliverZoneId,
      items: items.map((item) => ({
        product_id: item.product_id,
        quantity: Number(item.quantity)
      }))
    };

    if (!payload.deliverZone_id || payload.items.some((item) => !item.product_id || !Number.isFinite(item.quantity) || item.quantity < 1)) {
      toast.error("Choose a delivery zone, product, and quantity for every item.");
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiFetch("/api/orders", {
        method: "POST",
        token,
        body: JSON.stringify(payload)
      });
      if (data.order?.status === "BLOCKED") {
        toast.info("Order created and blocked for stock review.");
      } else {
        toast.success("Order created.");
      }
      setShowForm(false);
      resetForm();
      await Promise.allSettled([loadOrders(), loadPicklists()]);
    } catch (submitError) {
      toast.error(getErrorMessage(submitError, "Could not create order."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGeneratePickList(order) {
    if (!token) return;
    const key = `picklist-${order.id}`;
    setPendingActions((current) => ({ ...current, [key]: true }));

    try {
      await apiFetch(`/api/picklists/from-order/${order.id}`, { method: "POST", token });
      toast.success("Pick list generated.");
      await Promise.allSettled([loadOrders(), loadPicklists()]);
    } catch (picklistError) {
      toast.error(getErrorMessage(picklistError, "Could not generate pick list."));
    } finally {
      setPendingActions((current) => ({ ...current, [key]: false }));
    }
  }

  async function handleOrderAction(order, action) {
    if (!token) return;
    const key = `${action}-${order.id}`;
    setPendingActions((current) => ({ ...current, [key]: true }));

    try {
      await apiFetch(`/api/orders/${order.id}/${action}`, { method: "PATCH", token });
      toast.success(action === "approve" ? "Order approved." : "Order rejected.");
      await loadOrders();
    } catch (actionError) {
      const details = actionError?.data?.details;
      if (action === "approve" && Array.isArray(details) && details.length > 0) {
        const summary = details.map((item) => `${item.sku}: ${item.availableQuantity}/${item.requestedQuantity}`).join(", ");
        toast.error(`Insufficient stock: ${summary}`);
      } else {
        toast.error(getErrorMessage(actionError, `Could not ${action} order.`));
      }
    } finally {
      setPendingActions((current) => ({ ...current, [key]: false }));
    }
  }

  return (
    <PageTransition>
      <PageHeader
        title="Orders"
        description="Create customer orders, review stock blocks, and approve fulfillment requests."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleRefresh} isLoading={refreshing}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={openCreateModal}>
              <Plus className="h-4 w-4" />
              Create Order
            </Button>
          </div>
        }
      />

      {error ? (
        <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 backdrop-blur-sm">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-cyan-300" />
            Order Queue
          </CardTitle>
          <CardDescription>All warehouse orders currently in the system.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && orders.length === 0 ? (
            <OrdersTableSkeleton />
          ) : orders.length === 0 ? (
            <EmptyState title="No orders yet" description="Create the first order to begin warehouse fulfillment." />
          ) : (
            <div className="overflow-x-auto thin-scrollbar">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="pb-3 font-medium">Order Number</th>
                    <th className="pb-3 font-medium">Items</th>
                    <th className="pb-3 font-medium">Summary</th>
                    <th className="pb-3 font-medium">Delivery Zone</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Requested By</th>
                    <th className="pb-3 font-medium">Created Date</th>
                    {isManager ? <th className="pb-3 font-medium text-right">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b border-white/10 last:border-b-0">
                      <td className="py-4 font-mono text-slate-300">{order.orderNumber}</td>
                      <td className="py-4 text-white">{order.items?.length || 0}</td>
                      <td className="max-w-sm py-4 text-slate-300">
                        <div>{summarizeItems(order.items)}</div>
                        <div className="mt-1 truncate text-xs text-slate-500" title={summarizeProducts(order.items)}>
                          {summarizeProducts(order.items)}
                        </div>
                        {order.status === "BLOCKED" && order.blockedReason ? (
                          <div className="mt-2 text-xs text-amber-200">{order.blockedReason}</div>
                        ) : null}
                      </td>
                      <td className="py-4 text-slate-300">{getZoneLabel(order.deliverZone_id)}</td>
                      <td className="py-4">
                        <Badge tone={getStatusTone(order.status)}>{order.status}</Badge>
                      </td>
                      <td className="py-4 text-slate-300">{getUserName(order.requestedBy)}</td>
                      <td className="py-4 text-slate-400">{formatDateTime(order.createdAt)}</td>
                      {isManager ? (
                        <td className="py-4">
                          <div className="flex flex-wrap justify-end gap-2">
                            {order.status === "PENDING" ? (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => handleOrderAction(order, "approve")}
                                  isLoading={pendingActions[`approve-${order.id}`]}
                                >
                                  <Check className="h-4 w-4" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => handleOrderAction(order, "reject")}
                                  isLoading={pendingActions[`reject-${order.id}`]}
                                >
                                  <X className="h-4 w-4" />
                                  Reject
                                </Button>
                              </>
                            ) : null}
                            {order.status === "APPROVED" && !picklistOrderIds.has(order.id) ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleGeneratePickList(order)}
                                isLoading={pendingActions[`picklist-${order.id}`]}
                              >
                                <ClipboardList className="h-4 w-4" />
                                Generate Pick List
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showForm ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl thin-scrollbar">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-white">Create order</h3>
                <p className="mt-1 text-sm text-slate-400">Select one or more inventory products for fulfillment.</p>
              </div>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Close
              </Button>
            </div>

            <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-300">Delivery Zone</label>
                <Select value={deliverZoneId} onChange={(event) => setDeliverZoneId(event.target.value)} required>
                  <option value="">Select delivery zone</option>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.label || zone.code}
                    </option>
                  ))}
                </Select>
              </div>

              {items.map((item, index) => (
                <div key={index} className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-[1fr_140px_auto]">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-300">Product</label>
                    <Select
                      value={item.product_id}
                      onChange={(event) => updateItem(index, { product_id: event.target.value })}
                      required
                    >
                      <option value="">Select product</option>
                      {productOptions.map((product) => (
                        <option key={product.optionId} value={product.optionId}>
                          {product.sku} - {product.name} ({product.quantity} available)
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-300">Quantity</label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(event) => updateItem(index, { quantity: event.target.value })}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-transparent">Remove</label>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeItem(index)}
                      disabled={items.length === 1}
                      aria-label="Remove order item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="secondary" onClick={addItem}>
                  <Plus className="h-4 w-4" />
                  Add Another Item
                </Button>
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" isLoading={submitting} disabled={productOptions.length === 0}>
                    <ShoppingCart className="h-4 w-4" />
                    Create Order
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </PageTransition>
  );
}
