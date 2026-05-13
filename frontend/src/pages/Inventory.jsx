import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  ClipboardList,
  Package,
  PackagePlus,
  Pencil,
  RefreshCw,
  Trash2,
  TriangleAlert,
  X
} from "lucide-react";
import {
  createProduct,
  deleteProduct,
  getInventorySummary,
  getReorderSuggestions,
  listProducts,
  listStockMovements,
  stockIn,
  stockOut,
  stockTransfer,
  updateProduct
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

const emptyProductForm = {
  sku: "",
  name: "",
  category: "",
  weight: "0",
  currentStock: "0",
  minStock: "0",
  maxStock: "100",
  location: "",
  supplierLeadTimeDays: "0"
};

const emptyMovementForm = {
  productId: "",
  type: "IN",
  quantity: "1",
  fromLocation: "",
  toLocation: "",
  reason: ""
};

const emptySummary = {
  totalSKUs: 0,
  totalStockUnits: 0,
  lowStockCount: 0,
  overstockCount: 0,
  normalCount: 0,
  reorderRequiredCount: 0
};

const stockStatusTone = {
  NORMAL: "success",
  LOW_STOCK: "error",
  OVERSTOCK: "warning"
};

const riskTone = {
  LOW: "success",
  MEDIUM: "warning",
  HIGH: "error"
};

const movementIcons = {
  IN: ArrowDown,
  OUT: ArrowUp,
  TRANSFER: ArrowRightLeft
};

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function productToForm(product) {
  return {
    sku: product.sku || "",
    name: product.name || "",
    category: product.category || "",
    weight: String(product.weight ?? 0),
    currentStock: String(product.currentStock ?? 0),
    minStock: String(product.minStock ?? 0),
    maxStock: String(product.maxStock ?? 100),
    location: product.location || "",
    supplierLeadTimeDays: String(product.supplierLeadTimeDays ?? 0)
  };
}

function buildProductPayload(form) {
  return {
    sku: form.sku.trim(),
    name: form.name.trim(),
    category: form.category.trim(),
    weight: Number(form.weight || 0),
    currentStock: Number(form.currentStock || 0),
    minStock: Number(form.minStock || 0),
    maxStock: Number(form.maxStock || 0),
    location: form.location.trim(),
    supplierLeadTimeDays: Number(form.supplierLeadTimeDays || 0)
  };
}

function ProductModal({
  open,
  editingProduct,
  form,
  saving,
  onClose,
  onChange,
  onSubmit
}) {
  if (!open) return null;

  const title = editingProduct ? "Edit Product" : "Add Product";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close product form"
      />
      <section className="surface-card relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="relative z-10 flex items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <h2 className="brand-heading text-xl font-semibold text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-400">SKU profile and stock thresholds.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close product form">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <form className="relative z-10 grid gap-5 px-6 py-6" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-300">SKU</label>
              <Input value={form.sku} onChange={(event) => onChange("sku", event.target.value)} required />
            </div>
            <div className="grid gap-2 md:col-span-1 xl:col-span-2">
              <label className="text-sm font-medium text-slate-300">Product Name</label>
              <Input value={form.name} onChange={(event) => onChange("name", event.target.value)} required />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-300">Category</label>
              <Input value={form.category} onChange={(event) => onChange("category", event.target.value)} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-300">Weight</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.weight}
                onChange={(event) => onChange("weight", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-300">Current Stock</label>
              <Input
                type="number"
                min="0"
                step="1"
                value={form.currentStock}
                onChange={(event) => onChange("currentStock", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-300">Minimum Stock</label>
              <Input
                type="number"
                min="0"
                step="1"
                value={form.minStock}
                onChange={(event) => onChange("minStock", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-300">Maximum Stock</label>
              <Input
                type="number"
                min="0"
                step="1"
                value={form.maxStock}
                onChange={(event) => onChange("maxStock", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-300">Location</label>
              <Input value={form.location} onChange={(event) => onChange("location", event.target.value)} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-300">Supplier Lead Time Days</label>
              <Input
                type="number"
                min="0"
                step="1"
                value={form.supplierLeadTimeDays}
                onChange={(event) => onChange("supplierLeadTimeDays", event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving}>
              {editingProduct ? "Save Product" : "Create Product"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function Inventory() {
  const { token, logout } = useAuth();
  const toast = useToast();

  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [movements, setMovements] = useState([]);
  const [reorderSuggestions, setReorderSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [productSaving, setProductSaving] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [movementForm, setMovementForm] = useState(emptyMovementForm);
  const [movementSaving, setMovementSaving] = useState(false);

  const sortedProducts = useMemo(
    () => [...products].sort((left, right) => String(left.sku || "").localeCompare(String(right.sku || ""))),
    [products]
  );

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === movementForm.productId) || null,
    [movementForm.productId, products]
  );

  const sortedReorderSuggestions = useMemo(
    () =>
      [...reorderSuggestions].sort(
        (left, right) => Number(right.suggestedReorderQty || 0) - Number(left.suggestedReorderQty || 0)
      ),
    [reorderSuggestions]
  );

  const loadInventory = useCallback(async ({ silent = false } = {}) => {
    if (!token) return;

    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const [productResult, summaryResult, movementResult, reorderResult] = await Promise.all([
        listProducts(token),
        getInventorySummary(token),
        listStockMovements(token, { limit: 100 }),
        getReorderSuggestions(token)
      ]);

      setProducts(productResult.products || []);
      setSummary({ ...emptySummary, ...(summaryResult || {}) });
      setMovements(movementResult.movements || []);
      setReorderSuggestions(reorderResult.products || []);
      setError("");
      setLastUpdated(new Date().toISOString());
    } catch (loadError) {
      if (loadError?.status === 401) {
        toast.error("Session expired. Please sign in again.");
        logout();
        return;
      }
      const message = getErrorMessage(loadError, "Failed to load inventory data.");
      setError(message);
      if (!silent) toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [logout, toast, token]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  useEffect(() => {
    setMovementForm((current) => {
      const currentProduct = products.find((product) => product.id === current.productId);
      if (currentProduct) return current;
      if (products.length === 0) return { ...current, productId: "", fromLocation: "" };

      const firstProduct = products[0];
      return {
        ...current,
        productId: firstProduct.id,
        fromLocation: firstProduct.location || ""
      };
    });
  }, [products]);

  function updateProductForm(field, value) {
    setProductForm((current) => ({ ...current, [field]: value }));
  }

  function openCreateProduct() {
    setEditingProduct(null);
    setProductForm(emptyProductForm);
    setProductModalOpen(true);
  }

  function openEditProduct(product) {
    setEditingProduct(product);
    setProductForm(productToForm(product));
    setProductModalOpen(true);
  }

  async function handleProductSubmit(event) {
    event.preventDefault();
    setProductSaving(true);

    try {
      const payload = buildProductPayload(productForm);
      if (editingProduct) {
        await updateProduct(token, editingProduct.id, payload);
        toast.success("Product updated.");
      } else {
        await createProduct(token, payload);
        toast.success("Product created.");
      }
      setProductModalOpen(false);
      setEditingProduct(null);
      await loadInventory({ silent: true });
    } catch (submitError) {
      if (submitError?.status === 401) {
        toast.error("Session expired. Please sign in again.");
        logout();
        return;
      }
      toast.error(getErrorMessage(submitError, "Product save failed."));
    } finally {
      setProductSaving(false);
    }
  }

  async function handleDeleteProduct() {
    if (!productToDelete) return;
    setDeleteLoading(true);

    try {
      await deleteProduct(token, productToDelete.id);
      toast.success("Product deleted.");
      setProductToDelete(null);
      await loadInventory({ silent: true });
    } catch (deleteError) {
      if (deleteError?.status === 401) {
        toast.error("Session expired. Please sign in again.");
        logout();
        return;
      }
      toast.error(getErrorMessage(deleteError, "Product delete failed."));
    } finally {
      setDeleteLoading(false);
    }
  }

  function updateMovementProduct(productId) {
    const product = products.find((item) => item.id === productId);
    setMovementForm((current) => ({
      ...current,
      productId,
      fromLocation: product?.location || current.fromLocation
    }));
  }

  async function handleMovementSubmit(event) {
    event.preventDefault();

    if (!movementForm.productId) {
      toast.error("Select a product before recording movement.");
      return;
    }

    setMovementSaving(true);

    try {
      const payload = {
        productId: movementForm.productId,
        quantity: Number(movementForm.quantity || 0),
        reason: movementForm.reason.trim()
      };

      if (movementForm.type === "IN") {
        await stockIn(token, { ...payload, toLocation: movementForm.toLocation.trim() });
      } else if (movementForm.type === "OUT") {
        await stockOut(token, { ...payload, fromLocation: movementForm.fromLocation.trim() });
      } else {
        await stockTransfer(token, {
          ...payload,
          fromLocation: movementForm.fromLocation.trim(),
          toLocation: movementForm.toLocation.trim()
        });
      }

      toast.success("Stock movement recorded.");
      setMovementForm((current) => ({
        ...current,
        quantity: "1",
        reason: ""
      }));
      await loadInventory({ silent: true });
    } catch (movementError) {
      if (movementError?.status === 401) {
        toast.error("Session expired. Please sign in again.");
        logout();
        return;
      }
      toast.error(getErrorMessage(movementError, "Stock movement failed."));
    } finally {
      setMovementSaving(false);
    }
  }

  return (
    <PageTransition>
      <PageHeader
        title="Inventory Intelligence"
        description="Manage warehouse SKUs, stock movement history, and risk-driven reorder signals."
        lastUpdated={lastUpdated}
        actions={
          <div className="flex w-full flex-col gap-3 sm:flex-row">
            <Button variant="secondary" onClick={() => loadInventory()} isLoading={refreshing}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={openCreateProduct}>
              <PackagePlus className="h-4 w-4" />
              Add Product
            </Button>
          </div>
        }
      />

      <ProductModal
        open={productModalOpen}
        editingProduct={editingProduct}
        form={productForm}
        saving={productSaving}
        onClose={() => setProductModalOpen(false)}
        onChange={updateProductForm}
        onSubmit={handleProductSubmit}
      />

      <ConfirmDialog
        open={Boolean(productToDelete)}
        title="Delete product?"
        description="This removes the product record. Existing movement history remains in the audit trail."
        icon={<Trash2 className="h-5 w-5 text-rose-200" />}
        confirmText="Delete product"
        confirmLoading={deleteLoading}
        destructive
        onCancel={() => setProductToDelete(null)}
        onConfirm={handleDeleteProduct}
      />

      {error ? (
        <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 backdrop-blur-sm">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <LoadingSkeleton key={index} className="h-[132px]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-5">
          <StatCard
            label="Total SKUs"
            value={formatNumber(summary.totalSKUs)}
            helper="Active product records"
            tone="primary"
            icon={<Package className="h-4 w-4" />}
          />
          <StatCard
            label="Total Stock Units"
            value={formatNumber(summary.totalStockUnits)}
            helper="Units on hand"
            tone="info"
            icon={<ClipboardList className="h-4 w-4" />}
          />
          <StatCard
            label="Low Stock Items"
            value={formatNumber(summary.lowStockCount)}
            helper="At or below minimum"
            tone="error"
            icon={<TriangleAlert className="h-4 w-4" />}
          />
          <StatCard
            label="Overstock Items"
            value={formatNumber(summary.overstockCount)}
            helper="At or above maximum"
            tone="warning"
            icon={<ArrowUp className="h-4 w-4" />}
          />
          <StatCard
            label="Reorder Required"
            value={formatNumber(summary.reorderRequiredCount)}
            helper="Suggested reorder qty > 0"
            tone="success"
            icon={<PackagePlus className="h-4 w-4" />}
          />
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Product Inventory</CardTitle>
          <CardDescription>SKU stock position, storage location, and calculated risk.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <LoadingSkeleton key={index} className="h-16" />
              ))}
            </div>
          ) : sortedProducts.length === 0 ? (
            <EmptyState title="No products yet" description="Create a product to start tracking stock risk." />
          ) : (
            <div className="overflow-x-auto thin-scrollbar">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="pb-3 font-medium">SKU</th>
                    <th className="pb-3 font-medium">Product Name</th>
                    <th className="pb-3 font-medium">Category</th>
                    <th className="pb-3 font-medium">Current Stock</th>
                    <th className="pb-3 font-medium">Location</th>
                    <th className="pb-3 font-medium">Stock Status</th>
                    <th className="pb-3 font-medium">Risk Level</th>
                    <th className="pb-3 font-medium">Suggested Reorder</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProducts.map((product) => (
                    <tr key={product.id} className="border-b border-white/10 last:border-b-0">
                      <td className="py-4 font-mono text-slate-300">{product.sku}</td>
                      <td className="py-4 text-white">{product.name}</td>
                      <td className="py-4 text-slate-300">{product.category || "--"}</td>
                      <td className="py-4 text-white">{formatNumber(product.currentStock)}</td>
                      <td className="py-4 text-slate-300">{product.location || "--"}</td>
                      <td className="py-4">
                        <Badge tone={stockStatusTone[product.stockStatus] || "neutral"}>
                          {product.stockStatus || "NORMAL"}
                        </Badge>
                      </td>
                      <td className="py-4">
                        <Badge tone={riskTone[product.riskLevel] || "neutral"}>
                          {product.riskLevel || "LOW"}
                        </Badge>
                      </td>
                      <td className="py-4 text-white">{formatNumber(product.suggestedReorderQty)}</td>
                      <td className="py-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9"
                            onClick={() => openEditProduct(product)}
                            aria-label={`Edit ${product.sku}`}
                            title="Edit product"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 text-rose-200 hover:text-rose-100"
                            onClick={() => setProductToDelete(product)}
                            aria-label={`Delete ${product.sku}`}
                            title="Delete product"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Stock Movement</CardTitle>
            <CardDescription>Record receiving, issuing, and location transfers.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={handleMovementSubmit}>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="grid gap-2 xl:col-span-2">
                  <label className="text-sm font-medium text-slate-300">Product</label>
                  <Select
                    value={movementForm.productId}
                    onChange={(event) => updateMovementProduct(event.target.value)}
                    required
                  >
                    {products.length === 0 ? <option value="">No products available</option> : null}
                    {sortedProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.sku} - {product.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-300">Movement Type</label>
                  <Select
                    value={movementForm.type}
                    onChange={(event) =>
                      setMovementForm((current) => ({
                        ...current,
                        type: event.target.value
                      }))
                    }
                  >
                    <option value="IN">IN</option>
                    <option value="OUT">OUT</option>
                    <option value="TRANSFER">TRANSFER</option>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-300">Quantity</label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={movementForm.quantity}
                    onChange={(event) =>
                      setMovementForm((current) => ({ ...current, quantity: event.target.value }))
                    }
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-300">From Location</label>
                  <Input
                    value={movementForm.fromLocation}
                    placeholder={selectedProduct?.location || "Aisle A"}
                    onChange={(event) =>
                      setMovementForm((current) => ({ ...current, fromLocation: event.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-300">To Location</label>
                  <Input
                    value={movementForm.toLocation}
                    placeholder="Aisle B"
                    onChange={(event) =>
                      setMovementForm((current) => ({ ...current, toLocation: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-300">Reason</label>
                <textarea
                  rows={3}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl transition-all duration-300 ease-out placeholder:text-slate-400 hover:border-white/15 hover:bg-white/[0.07] focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-slate-950/80"
                  value={movementForm.reason}
                  onChange={(event) =>
                    setMovementForm((current) => ({ ...current, reason: event.target.value }))
                  }
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" isLoading={movementSaving} disabled={products.length === 0}>
                  {(() => {
                    const Icon = movementIcons[movementForm.type] || ArrowRightLeft;
                    return <Icon className="h-4 w-4" />;
                  })()}
                  Record Movement
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reorder Suggestions</CardTitle>
            <CardDescription>Low-stock SKUs ranked by suggested quantity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => <LoadingSkeleton key={index} className="h-16" />)
            ) : sortedReorderSuggestions.length === 0 ? (
              <EmptyState title="No reorder required" description="All tracked products are above reorder risk." />
            ) : (
              sortedReorderSuggestions.map((product) => (
                <div
                  key={product.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-sm text-slate-300">{product.sku}</div>
                      <div className="mt-1 truncate text-sm font-semibold text-white">{product.name}</div>
                    </div>
                    <Badge tone="error">HIGH</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-slate-400">Suggested reorder</span>
                    <span className="font-semibold text-white">{formatNumber(product.suggestedReorderQty)}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Stock Movement History</CardTitle>
          <CardDescription>Latest receiving, issuing, and transfer events.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <LoadingSkeleton key={index} className="h-16" />
              ))}
            </div>
          ) : movements.length === 0 ? (
            <EmptyState title="No stock movements" description="Movement history appears after stock changes." />
          ) : (
            <div className="overflow-x-auto thin-scrollbar">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="pb-3 font-medium">Product</th>
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium">Quantity</th>
                    <th className="pb-3 font-medium">From</th>
                    <th className="pb-3 font-medium">To</th>
                    <th className="pb-3 font-medium">Reason</th>
                    <th className="pb-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr key={movement.id} className="border-b border-white/10 last:border-b-0">
                      <td className="py-4 text-white">
                        {movement.product ? `${movement.product.sku} - ${movement.product.name}` : "Deleted product"}
                      </td>
                      <td className="py-4">
                        <Badge tone={movement.type === "IN" ? "success" : movement.type === "OUT" ? "warning" : "info"}>
                          {movement.type}
                        </Badge>
                      </td>
                      <td className="py-4 text-white">{formatNumber(movement.quantity)}</td>
                      <td className="py-4 text-slate-300">{movement.fromLocation || "--"}</td>
                      <td className="py-4 text-slate-300">{movement.toLocation || "--"}</td>
                      <td className="py-4 text-slate-300">{movement.reason || "--"}</td>
                      <td className="py-4 text-slate-400">{formatDateTime(movement.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
