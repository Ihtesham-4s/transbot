import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, FileText, RefreshCw, Search, ShieldAlert, TriangleAlert, X } from "lucide-react";
import { getLogs } from "../lib/api";
import { formatDateTime, getErrorMessage } from "../lib/formatters";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { PageHeader } from "../components/PageHeader";
import { PageTransition } from "../components/PageTransition";
import { StatCard } from "../components/StatCard";

const PAGE_SIZE = 15;

const emptySummary = {
  totalLogs: 0,
  errors: 0,
  warnings: 0,
  taskEvents: 0,
  robotEvents: 0,
  systemEvents: 0
};

const moduleOptions = ["TASK", "ROBOT", "AUTH", "SYSTEM", "INVENTORY", "ORDER", "PICKLIST", "DISPATCH", "COPILOT"];

const severityOptions = ["INFO", "SUCCESS", "WARNING", "ERROR"];

const eventTypeOptions = [
  "TASK_CREATED",
  "TASK_BULK_CREATED",
  "TASK_ASSIGNED_MANUAL",
  "TASK_COMPLETED",
  "TASK_DELETED",
  "AUTO_TASK_ASSIGNED",
  "AUTO_TASK_ASSIGNMENT_SKIPPED",
  "ROBOT_RESET",
  "ROBOT_STATE_UPDATED",
  "USER_LOGIN",
  "USER_REGISTERED",
  "SYSTEM_HEALTH_CHECK"
];

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function severityTone(severity) {
  if (severity === "ERROR") return "error";
  if (severity === "WARNING" || severity === "WARN") return "warning";
  if (severity === "SUCCESS") return "success";
  return "info";
}

function moduleTone(module) {
  if (module === "TASK") return "info";
  if (module === "ROBOT") return "primary";
  if (module === "AUTH") return "neutral";
  return "neutral";
}

function entityLabel(log) {
  if (!log.entityType && !log.entityId) return "--";
  const id = log.entityId ? String(log.entityId) : "";
  const shortId = id.length > 10 ? id.slice(-8) : id;
  return [log.entityType, shortId].filter(Boolean).join(" ");
}

function actorLabel(log) {
  if (log.actor?.name || log.actor?.email) return log.actor.name || log.actor.email;
  if (log.actorId) return String(log.actorId).slice(-8);
  if (log.user_id) return String(log.user_id).slice(-8);
  return "--";
}

function LogsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, index) => (
        <LoadingSkeleton key={index} className="h-16" />
      ))}
    </div>
  );
}

function MetadataModal({ log, onClose }) {
  if (!log) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close log details"
      />
      <section className="surface-card relative z-10 w-full max-w-3xl flex flex-col max-h-[90vh]">
        <div className="relative z-10 flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <h2 className="brand-heading text-xl font-semibold text-white">{log.eventType}</h2>
            <p className="mt-1 text-sm text-slate-400">{formatDateTime(log.createdAt || log.timestamp)}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close log details">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="relative z-10 overflow-y-auto thin-scrollbar space-y-4 px-6 py-6">
          <div className="flex flex-wrap gap-2">
            <Badge tone={moduleTone(log.module)}>{log.module}</Badge>
            <Badge tone={severityTone(log.severity)}>{log.severity}</Badge>
            <Badge tone="neutral">{entityLabel(log)}</Badge>
          </div>
          <p className="text-sm leading-6 text-slate-200">{log.message || log.description}</p>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <div className="mb-2 text-sm font-semibold text-white">Metadata</div>
            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-300 thin-scrollbar">
              {JSON.stringify(log.metadata || {}, null, 2)}
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function Logs() {
  const { token, logout } = useAuth();
  const toast = useToast();

  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const loadLogs = useCallback(async ({ silent = false } = {}) => {
    if (!token) return;

    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await getLogs(token, {
        module: moduleFilter,
        severity: severityFilter,
        eventType: eventTypeFilter,
        search,
        page: currentPage,
        limit: PAGE_SIZE
      });
      const rawList = response.logs || [];
      const cleanList = rawList.filter(
        (log) => log.eventType !== "ROBOT_NUDGE" && log.event_type !== "ROBOT_NUDGE"
      );
      setLogs(cleanList);
      setTotal(cleanList.length);
      setSummary({ ...emptySummary, ...(response.summary || {}) });
      setError("");
      setLastUpdated(new Date().toISOString());
    } catch (loadError) {
      if (loadError?.status === 401) {
        toast.error("Session expired. Please sign in again.");
        logout();
        return;
      }
      const message = getErrorMessage(loadError, "Failed to load audit logs.");
      setError(message);
      if (!silent) toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentPage, eventTypeFilter, logout, moduleFilter, search, severityFilter, toast, token]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const activeFilterCount = useMemo(
    () => [moduleFilter, severityFilter, eventTypeFilter, search].filter(Boolean).length,
    [eventTypeFilter, moduleFilter, search, severityFilter]
  );

  function updateFilter(setter, value) {
    setter(value);
    setPage(1);
  }

  function clearFilters() {
    setModuleFilter("");
    setSeverityFilter("");
    setEventTypeFilter("");
    setSearch("");
    setPage(1);
  }

  return (
    <PageTransition>
      <PageHeader
        title="System Logs & Audit Trail"
        description="Search, filter, and inspect task, robot, auth, and system events."
        lastUpdated={lastUpdated}
        actions={
          <Button variant="secondary" onClick={() => loadLogs()} isLoading={refreshing}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <MetadataModal log={selectedLog} onClose={() => setSelectedLog(null)} />

      {error ? (
        <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 backdrop-blur-sm">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Total Logs" value={formatNumber(summary.totalLogs)} tone="primary" icon={<FileText className="h-4 w-4" />} />
        <StatCard label="Errors" value={formatNumber(summary.errors)} tone="error" icon={<ShieldAlert className="h-4 w-4" />} />
        <StatCard label="Warnings" value={formatNumber(summary.warnings)} tone="warning" icon={<TriangleAlert className="h-4 w-4" />} />
        <StatCard label="Task Events" value={formatNumber(summary.taskEvents)} tone="info" icon={<FileText className="h-4 w-4" />} />
        <StatCard label="Robot Events" value={formatNumber(summary.robotEvents)} tone="primary" icon={<FileText className="h-4 w-4" />} />
        <StatCard label="System Events" value={formatNumber(summary.systemEvents)} tone="neutral" icon={<FileText className="h-4 w-4" />} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Audit Filters</CardTitle>
          <CardDescription>Filter by operational module, severity, event type, or search text.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_240px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => updateFilter(setSearch, event.target.value)}
                className="pl-10"
                placeholder="Search messages, entities, event types..."
              />
            </div>
            <Select value={moduleFilter} onChange={(event) => updateFilter(setModuleFilter, event.target.value)}>
              <option value="">All modules</option>
              {moduleOptions.map((module) => (
                <option key={module} value={module}>{module}</option>
              ))}
            </Select>
            <Select value={severityFilter} onChange={(event) => updateFilter(setSeverityFilter, event.target.value)}>
              <option value="">All severities</option>
              {severityOptions.map((severity) => (
                <option key={severity} value={severity}>{severity}</option>
              ))}
            </Select>
            <Select value={eventTypeFilter} onChange={(event) => updateFilter(setEventTypeFilter, event.target.value)}>
              <option value="">All event types</option>
              {eventTypeOptions.map((eventType) => (
                <option key={eventType} value={eventType}>{eventType}</option>
              ))}
            </Select>
            <Button variant="secondary" onClick={clearFilters} disabled={activeFilterCount === 0}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>Newest events first. Showing {formatNumber(total)} matching log(s).</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LogsSkeleton />
          ) : logs.length === 0 ? (
            <EmptyState
              title="No logs found"
              description={activeFilterCount ? "Adjust filters to see more audit events." : "Warehouse events will appear here as the system is used."}
            />
          ) : (
            <>
              <div className="overflow-x-auto thin-scrollbar">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400">
                      <th className="pb-3 font-medium">Time</th>
                      <th className="pb-3 font-medium">Module</th>
                      <th className="pb-3 font-medium">Event Type</th>
                      <th className="pb-3 font-medium">Severity</th>
                      <th className="pb-3 font-medium">Message</th>
                      <th className="pb-3 font-medium">Entity</th>
                      <th className="pb-3 font-medium">Actor</th>
                      <th className="pb-3 font-medium text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b border-white/10 last:border-b-0">
                        <td className="py-4 whitespace-nowrap text-slate-400">{formatDateTime(log.createdAt || log.timestamp)}</td>
                        <td className="py-4">
                          <Badge tone={moduleTone(log.module)}>{log.module}</Badge>
                        </td>
                        <td className="py-4 font-mono text-xs text-slate-200">{log.eventType}</td>
                        <td className="py-4">
                          <Badge tone={severityTone(log.severity)}>{log.severity}</Badge>
                        </td>
                        <td className="py-4 min-w-[280px] text-white">{log.message || log.description}</td>
                        <td className="py-4 whitespace-nowrap text-slate-300">{entityLabel(log)}</td>
                        <td className="py-4 whitespace-nowrap text-slate-300">{actorLabel(log)}</td>
                        <td className="py-4">
                          <div className="flex justify-end">
                            <Button size="sm" variant="secondary" onClick={() => setSelectedLog(log)}>
                              <Eye className="h-4 w-4" />
                              View
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-400">
                  Page {currentPage} of {totalPages}
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
                    {formatNumber(currentPage)} / {formatNumber(totalPages)}
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
