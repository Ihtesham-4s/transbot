import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, PackagePlus, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
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
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { apiFetch } from "../lib/api";
import { formatWeight, getErrorMessage } from "../lib/formatters";

function InventoryTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <LoadingSkeleton key={index} className="h-16" />
      ))}
    </div>
  );
}

function getStockTone(status) {
  if (status === "LOW") return "danger";
  if (status === "OVERSTOCK") return "warning";
  return "success";
}

function getStockLabel(status) {
  if (status === "LOW") return "Low stock";
  if (status === "OVERSTOCK") return "Overstock";
  return "Normal";
}

export default function Inventory() {
  const { token, user } = useAuth();
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productToDelete, setProductToDelete] = useState(null);
  const [zones, setZones] = useState([]);
  const [formState, setFormState] = useState({
    sku: "",
    name: "",
    category: "",
    weightKg: "1",
    quantity: "0",
    minStockLevel: "5",
    maxStockLevel: "100",
    zone_id: ""
  });
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  const isManager = user?.role === "manager";
  const lowStockProducts = useMemo(() => products.filter((product) => product.stockStatus === "LOW"), [products]);

  const loadProducts = useCallback(async () => {
    if (!token) {
      setProducts([]);
      setLoading(false);
      return;
    }

    try {
      const data = await apiFetch("/api/inventory", { method: "GET", token });
      setProducts(data.products || []);
      setError("");
    } catch (loadError) {
      setProducts([]);
      setError(getErrorMessage(loadError, "Could not load inventory."));
    } finally {
      setLoading(false);
      setRefreshing(false);
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

  useEffect(() => {
    setLoading(true);
    loadProducts();
    loadZones();
  }, [loadProducts, loadZones]);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.allSettled([loadProducts(), loadZones()]);
  }

  function resetForm() {
    setFormState({
      sku: "",
      name: "",
      category: "",
      weightKg: "1",
      quantity: "0",
      minStockLevel: "5",
      maxStockLevel: "100",
      zone_id: zones[0]?.id || ""
    });
    setEditingProduct(null);
  }

  function openCreateModal() {
    resetForm();
    setShowForm(true);
  }

  function openEditModal(product) {
    setEditingProduct(product);
    setFormState({
      sku: product.sku || "",
      name: product.name || "",
      category: product.category || "",
      weightKg: String(product.weightKg ?? 1),
      quantity: String(product.quantity ?? 0),
      minStockLevel: String(product.minStockLevel ?? 5),
      maxStockLevel: String(product.maxStockLevel ?? 100),
      zone_id: product.zone_id || zones[0]?.id || ""
    });
    setShowForm(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!token) return;

    const payload = {
      sku: formState.sku,
      name: formState.name,
      category: formState.category || null,
      weightKg: Number(formState.weightKg),
      quantity: Number(formState.quantity),
      minStockLevel: Number(formState.minStockLevel),
      maxStockLevel: Number(formState.maxStockLevel),
      zone_id: formState.zone_id
    };

    setSubmitting(true);
    try {
      if (editingProduct) {
        await apiFetch(`/api/inventory/${editingProduct.id}`, {
          method: "PATCH",
          token,
          body: JSON.stringify(payload)
        });
        toast.success("Product updated.");
      } else {
        await apiFetch("/api/inventory", {
          method: "POST",
          token,
          body: JSON.stringify(payload)
        });
        toast.success("Product created.");
      }

      setShowForm(false);
      resetForm();
      await loadProducts();
    } catch (submitError) {
      toast.error(getErrorMessage(submitError, "Could not save product."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(product) {
    if (!token) return;
    setPendingDelete(true);
    try {
      await apiFetch(`/api/inventory/${product.id}`, { method: "DELETE", token });
      toast.success("Product deleted.");
      await loadProducts();
      setProductToDelete(null);
    } catch (deleteError) {
      toast.error(getErrorMessage(deleteError, "Could not delete product."));
    } finally {
      setPendingDelete(false);
    }
  }

  return (
    <PageTransition>
      <PageHeader
        title="Inventory"
        description="Track stock levels, manage storage zones, and surface reorder alerts at a glance."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleRefresh} isLoading={refreshing}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            {isManager ? (
              <Button onClick={openCreateModal}>
                <Plus className="h-4 w-4" />
                Add Product
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? (
        <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 backdrop-blur-sm">
          {error}
        </div>
      ) : null}

      {lowStockProducts.length > 0 ? (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>
              {lowStockProducts.length} item{lowStockProducts.length === 1 ? "" : "s"} are below minimum stock.
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {lowStockProducts.map((product) => (
              <a key={product.id} href={`#product-${product.id}`} className="font-medium underline underline-offset-4">
                {product.sku}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-cyan-300" />
            Inventory Catalog
          </CardTitle>
          <CardDescription>Monitor stock levels and storage placement for each product.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && products.length === 0 ? (
            <InventoryTableSkeleton />
          ) : products.length === 0 ? (
            <EmptyState title="No products yet" description="Add your first product to start tracking inventory." />
          ) : (
            <div className="overflow-x-auto thin-scrollbar">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="pb-3 font-medium">SKU</th>
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">Category</th>
                    <th className="pb-3 font-medium">Weight</th>
                    <th className="pb-3 font-medium">Quantity</th>
                    <th className="pb-3 font-medium">Zone</th>
                    <th className="pb-3 font-medium">Status</th>
                    {isManager ? <th className="pb-3 font-medium text-right">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr id={`product-${product.id}`} key={product.id} className="border-b border-white/10 last:border-b-0">
                      <td className="py-4 font-mono text-slate-300">{product.sku}</td>
                      <td className="py-4 text-white">{product.name}</td>
                      <td className="py-4 text-slate-300">{product.category || "—"}</td>
                      <td className="py-4 text-slate-300">{formatWeight(product.weightKg)} kg</td>
                      <td className="py-4 text-slate-300">{product.quantity}</td>
                      <td className="py-4 text-slate-300">{product.zone_label || product.zone_code || "—"}</td>
                      <td className="py-4">
                        <Badge tone={getStockTone(product.stockStatus)}>{getStockLabel(product.stockStatus)}</Badge>
                      </td>
                      {isManager ? (
                        <td className="py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Button type="button" size="icon" variant="secondary" onClick={() => openEditModal(product)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button type="button" size="icon" variant="ghost" onClick={() => setProductToDelete(product)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-white">{editingProduct ? "Edit product" : "Add product"}</h3>
                <p className="mt-1 text-sm text-slate-400">Create or update stock records for the warehouse inventory.</p>
              </div>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Close
              </Button>
            </div>

            <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-300">SKU</label>
                <Input value={formState.sku} onChange={(event) => setFormState((current) => ({ ...current, sku: event.target.value }))} required />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-300">Name</label>
                <Input value={formState.name} onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))} required />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-300">Category</label>
                <Input value={formState.category} onChange={(event) => setFormState((current) => ({ ...current, category: event.target.value }))} placeholder="e.g. Electronics" />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-300">Weight (kg)</label>
                <Input type="number" min="0" step="0.1" value={formState.weightKg} onChange={(event) => setFormState((current) => ({ ...current, weightKg: event.target.value }))} required />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-300">Quantity</label>
                <Input type="number" min="0" value={formState.quantity} onChange={(event) => setFormState((current) => ({ ...current, quantity: event.target.value }))} required />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-300">Minimum Stock</label>
                <Input type="number" min="0" value={formState.minStockLevel} onChange={(event) => setFormState((current) => ({ ...current, minStockLevel: event.target.value }))} required />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-300">Maximum Stock</label>
                <Input type="number" min="0" value={formState.maxStockLevel} onChange={(event) => setFormState((current) => ({ ...current, maxStockLevel: event.target.value }))} required />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-300">Storage Zone</label>
                <Select value={formState.zone_id} onChange={(event) => setFormState((current) => ({ ...current, zone_id: event.target.value }))} required>
                  <option value="">Select storage zone</option>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.label || zone.code}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="md:col-span-2 flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={submitting}>
                  {editingProduct ? "Save changes" : "Create product"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(productToDelete)}
        title="Delete product?"
        description="This will permanently remove the inventory item from the system."
        icon={<Trash2 className="h-5 w-5 text-rose-200" />}
        confirmText="Delete product"
        confirmLoading={pendingDelete}
        destructive
        onCancel={() => setProductToDelete(null)}
        onConfirm={() => {
          if (productToDelete) handleDelete(productToDelete);
        }}
      />
    </PageTransition>
  );
}
