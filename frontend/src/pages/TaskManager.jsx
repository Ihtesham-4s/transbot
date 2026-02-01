import { Bot, LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

import { cn } from "../lib/cn";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useAuth } from "../context/AuthContext";
import TaskPanel from "../components/TaskPanel";

export default function TaskManager() {
  const { user, token, logout } = useAuth();
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const navigate = useNavigate();

  const dashboardPath = user?.role === "admin" ? "/admin" : "/operator";

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      <ConfirmDialog
        open={confirmLogoutOpen}
        title="Logout?"
        description="Do you want to logout from your account?"
        icon={<LogOut className="h-5 w-5 text-cyan-200" />}
        confirmText="Logout"
        cancelText="Cancel"
        destructive
        onCancel={() => setConfirmLogoutOpen(false)}
        onConfirm={() => {
          setConfirmLogoutOpen(false);
          logout();
        }}
      />

      {/* ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-64 -right-64 h-[680px] w-[680px] rounded-full bg-gradient-to-br from-blue-500/25 via-purple-500/20 to-cyan-500/25 blur-3xl animate-float" />
        <div className="absolute -bottom-72 -left-72 h-[760px] w-[760px] rounded-full bg-gradient-to-br from-cyan-500/20 via-indigo-500/20 to-violet-500/20 blur-3xl animate-float-delayed" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:88px_88px] animate-grid-move" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_55%)]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-8">
        {/* top bar */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 blur-lg opacity-60 animate-pulse-glow" />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-600 shadow-2xl shadow-blue-500/40">
                <Bot className="h-6 w-6 text-white" />
              </div>
            </div>

            <div>
              <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-blue-200 to-cyan-200 bg-clip-text text-transparent">
                Task Manager
              </h1>
              <p className="mt-1 text-sm font-medium text-slate-300">
                Full task queue view + scheduling controls for your role.
              </p>
            </div>
          </div>

          <div className="flex w-full items-center gap-3 overflow-x-auto pb-1 sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => navigate(dashboardPath)}
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20"
              )}
            >
              Dashboard
            </Button>
            <Link
              to="/robots"
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              )}
            >
              Robot State Machine
            </Link>
            <Link
              to="/simulation"
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              )}
            >
              Simulation
            </Link>
            {user?.role === "admin" ? (
              <Link
                to="/analytics"
                className={cn(
                  "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                )}
              >
                Analytics
              </Link>
            ) : null}
            <Button variant="secondary" onClick={() => setConfirmLogoutOpen(true)} className="shrink-0 px-5 py-3.5">
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>

        <TaskPanel token={token} isAdmin={user?.role === "admin"} />
      </div>
    </div>
  );
}
