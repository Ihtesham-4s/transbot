import { Bot, HardHat, LogOut, User } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../lib/cn";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useAuth } from "../context/AuthContext";
import { useState } from "react";
import TaskWidget from "../components/TaskWidget";
import RobotWidget from "../components/RobotWidget";

export default function OperatorDashboard() {
  const { user, token, logout } = useAuth();
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);

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
        <div className="absolute -top-64 -right-64 h-[680px] w-[680px] rounded-full bg-gradient-to-br from-blue-500/20 via-purple-500/15 to-cyan-500/20 blur-3xl animate-float" />
        <div className="absolute -bottom-72 -left-72 h-[760px] w-[760px] rounded-full bg-gradient-to-br from-emerald-500/15 via-cyan-500/15 to-indigo-500/15 blur-3xl animate-float-delayed" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:88px_88px] animate-grid-move" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_55%)]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-8">
        {/* top bar */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 blur-lg opacity-50 animate-pulse-glow" />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-600 shadow-2xl shadow-blue-500/40">
                <Bot className="h-6 w-6 text-white" />
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-blue-200 to-cyan-200 bg-clip-text text-transparent">
                  Operator Dashboard
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-slate-200 backdrop-blur">
                  <HardHat className="h-3.5 w-3.5 text-emerald-300" />
                  {user?.role?.toUpperCase() || "OPERATOR"}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-300">
                Signed in as <span className="font-bold text-white">{user?.name}</span>{" "}
                <span className="text-slate-400">({user?.email})</span>
              </p>
            </div>
          </div>

          <div className="flex w-full items-center gap-3 overflow-x-auto pb-1 sm:justify-end">
            <Link
              to="/robots"
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              )}
            >
              Robot State Machine
            </Link>
            <Link
              to="/tasks"
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              )}
            >
              Task Manager
            </Link>
            <Link
              to="/simulation"
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              )}
            >
              Simulation
            </Link>
            <Button variant="secondary" onClick={() => setConfirmLogoutOpen(true)} className="shrink-0 px-5 py-3.5">
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>

        {/* dashboard */}
        <div className="mt-6 grid gap-4 lg:grid-cols-3 lg:items-start">
          <div className="lg:col-span-2">
            <div className="grid gap-4">
              <TaskWidget token={token} />
              <RobotWidget token={token} role={user?.role} />
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-emerald-200" />
                Account
              </CardTitle>
              <CardDescription>Your operator profile.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-300">Name</span>
                  <span className="text-sm font-bold text-white truncate max-w-[60%]">{user?.name || "—"}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-300">Email</span>
                  <span className="text-sm font-bold text-white truncate max-w-[60%]">{user?.email || "—"}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-300">Role</span>
                  <span className="text-sm font-bold text-white">{user?.role || "operator"}</span>
                </div>

                <div className="grid gap-2">
                  <Link
                    to="/tasks"
                    className={cn(
                      "inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                    )}
                  >
                    Open Task Manager
                  </Link>
                  <Link
                    to="/robots"
                    className={cn(
                      "inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                    )}
                  >
                    Robot State Machine
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

