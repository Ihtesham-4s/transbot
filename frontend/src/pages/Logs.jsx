import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { getSystemLogs } from "../lib/api";
import { formatDateTime, getErrorMessage } from "../lib/formatters";
import { getEventTypeTone, getLogSeverityMeta } from "../lib/status";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { PageHeader } from "../components/PageHeader";
import { PageTransition } from "../components/PageTransition";

const PAGE_SIZE = 10;

function LogsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, index) => (
        <LoadingSkeleton key={index} className="h-16" />
      ))}
    </div>
  );
}

export default function Logs() {
  const { token, logout } = useAuth();
  const toast = useToast();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [lastUpdated, setLastUpdated] = useState(null);

  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const loadLogs = useCallback(async ({ silent = false } = {}) => {
    if (!token) return;

    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      // Always fetch all logs; client-side filtering handles all search types
      // (event type, description, task ID partial matches, etc.)
      const response = await getSystemLogs(token, { limit: 200, page: 1 });
      setLogs(response.logs || []);
      setError("");
      setLastUpdated(new Date().toISOString());
    } catch (loadError) {
      if (loadError?.status === 401) {
        toast.error("Session expired. Please sign in again.");
        logout();
        return;
      }
      const message = getErrorMessage(loadError, "Failed to load logs.");
      setError(message);
      if (!silent) toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [logout, toast, token]);

  useEffect(() => {
    loadLogs();
    const intervalId = window.setInterval(() => loadLogs({ silent: true }), 5000);
    return () => window.clearInterval(intervalId);
  }, [loadLogs]);

  useEffect(() => {
    setPage(1);
  }, [deferredQuery]);

  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        if (!deferredQuery) return true;

        // Strip leading '#' so users can paste formatted short IDs like #69f252
        const normalizedQuery = deferredQuery.replace(/^#/, "");

        // Extract all hex substrings from the description (e.g. ObjectIds embedded
        // in messages like "Task created (id=69f252e03dcb652bb1eabaca)").
        // This lets old logs that stored the id only in description text still match.
        const hexFromDescription = log.description
          ? (log.description.match(/[a-f0-9]{6,}/gi) || []).map((h) => h.toLowerCase())
          : [];

        const searchable = [
          log.event_type,
          log.description,
          log.severity,
          log.task_id,
          log.id,
          log.robot_id,
          log.user_id,
          log.metadata ? JSON.stringify(log.metadata) : null,
          ...hexFromDescription
        ]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase());

        return searchable.some((value) => value.includes(normalizedQuery));
      }),
    [deferredQuery, logs]
  );

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <PageTransition>
      <PageHeader
        title="Logs"
        description="Search and review recent system events with severity and event context."
        lastUpdated={lastUpdated}
        actions={
          <div className="flex w-full flex-col gap-3 sm:flex-row">
            <div className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) =>
                  startTransition(() => {
                    setQuery(event.target.value);
                  })
                }
                className="pl-10"
                placeholder="Search by event type, description, task ID…"
              />
            </div>
            <Button variant="secondary" onClick={() => loadLogs()} isLoading={refreshing}>
              <RefreshCw className="h-4 w-4" />
              Refresh
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
          <CardTitle>System Logs</CardTitle>
          <CardDescription>Showing 10 entries per page with client-side filtering.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LogsSkeleton />
          ) : paginatedLogs.length === 0 ? (
            <EmptyState
              title="No logs found"
              description={
                deferredQuery
                  ? "Try a different search term or clear the filter to see more results."
                  : "Logs will appear here when the system records new events."
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto thin-scrollbar">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400">
                      <th className="pb-3 font-medium">Timestamp</th>
                      <th className="pb-3 font-medium">Event Type</th>
                      <th className="pb-3 font-medium">Description</th>
                      <th className="pb-3 font-medium">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedLogs.map((log) => {
                      const severityMeta = getLogSeverityMeta(log.severity);

                      return (
                        <tr key={log.id} className="border-b border-white/10 last:border-b-0">
                          <td className="py-4 text-slate-400">{formatDateTime(log.timestamp)}</td>
                          <td className="py-4">
                            <Badge tone={getEventTypeTone(log.event_type)}>{log.event_type}</Badge>
                          </td>
                          <td className="py-4 text-white">{log.description}</td>
                          <td className="py-4">
                            <Badge tone={severityMeta.tone}>{severityMeta.label}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-400">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}-
                  {Math.min(currentPage * PAGE_SIZE, filteredLogs.length)} of {filteredLogs.length} logs
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    Previous
                  </Button>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white backdrop-blur-xl">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
