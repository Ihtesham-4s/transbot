import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, RefreshCw } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { PageHeader } from "../components/PageHeader";
import { PageTransition } from "../components/PageTransition";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { apiFetch } from "../lib/api";
import { formatDateTime, getErrorMessage } from "../lib/formatters";

function getStatusTone(status) {
  return status === "COMPLETED" ? "success" : "warning";
}

function getOrderNumber(order) {
  if (!order) return "--";
  if (typeof order === "string") return order;
  return order.orderNumber || order.id || "--";
}

function PickListsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <LoadingSkeleton key={index} className="h-16" />
      ))}
    </div>
  );
}

export default function PickLists() {
  const { token } = useAuth();
  const toast = useToast();
  const [picklists, setPicklists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [pendingActions, setPendingActions] = useState({});

  const loadPicklists = useCallback(async () => {
    if (!token) {
      setPicklists([]);
      setLoading(false);
      return;
    }

    try {
      const data = await apiFetch("/api/picklists", { method: "GET", token });
      setPicklists(data.picklists || []);
      setError("");
    } catch (loadError) {
      setPicklists([]);
      setError(getErrorMessage(loadError, "Could not load pick lists."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    loadPicklists();
  }, [loadPicklists]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadPicklists();
  }

  async function handleComplete(picklist) {
    if (!token) return;
    setPendingActions((current) => ({ ...current, [picklist.id]: true }));

    try {
      const data = await apiFetch(`/api/picklists/${picklist.id}/complete`, { method: "PATCH", token });
      toast.success(data.task ? "Pick list completed and dispatch task created." : "Pick list already completed.");
      await loadPicklists();
    } catch (completeError) {
      toast.error(getErrorMessage(completeError, "Could not complete pick list."));
    } finally {
      setPendingActions((current) => ({ ...current, [picklist.id]: false }));
    }
  }

  return (
    <PageTransition>
      <PageHeader
        title="Pick Lists"
        description="Review generated picking work and release completed orders to dispatch."
        actions={
          <Button variant="secondary" onClick={handleRefresh} isLoading={refreshing}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
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
            <ClipboardList className="h-5 w-5 text-cyan-300" />
            Pick List Queue
          </CardTitle>
          <CardDescription>Pending and completed lists generated from approved orders.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && picklists.length === 0 ? (
            <PickListsSkeleton />
          ) : picklists.length === 0 ? (
            <EmptyState title="No pick lists yet" description="Generate a pick list from an approved order to begin picking." />
          ) : (
            <div className="overflow-x-auto thin-scrollbar">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="pb-3 font-medium">Order Number</th>
                    <th className="pb-3 font-medium">Item Count</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Created Date</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {picklists.map((picklist) => (
                    <tr key={picklist.id} className="border-b border-white/10 last:border-b-0">
                      <td className="py-4 font-mono text-slate-300">{getOrderNumber(picklist.order_id)}</td>
                      <td className="py-4 text-white">{picklist.items?.length || 0}</td>
                      <td className="py-4">
                        <Badge tone={getStatusTone(picklist.status)}>{picklist.status}</Badge>
                      </td>
                      <td className="py-4 text-slate-400">{formatDateTime(picklist.createdAt)}</td>
                      <td className="py-4">
                        <div className="flex justify-end">
                          {picklist.status === "PENDING" ? (
                            <Button
                              size="sm"
                              onClick={() => handleComplete(picklist)}
                              isLoading={pendingActions[picklist.id]}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Mark Complete
                            </Button>
                          ) : (
                            <span className="text-sm text-slate-500">--</span>
                          )}
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
    </PageTransition>
  );
}
