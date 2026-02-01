import { Navigate } from "react-router-dom";
import { Bot, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function AppRedirect() {
  const { user } = useAuth();
  const target = user?.role === "admin" ? "/admin" : "/operator";

  // Show a polished loading screen for a short moment (avoids a blank flash)
  if (!user?.role) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-64 -right-64 h-[680px] w-[680px] rounded-full bg-gradient-to-br from-blue-500/25 via-purple-500/20 to-cyan-500/25 blur-3xl animate-float" />
          <div className="absolute -bottom-72 -left-72 h-[760px] w-[760px] rounded-full bg-gradient-to-br from-cyan-500/20 via-indigo-500/20 to-violet-500/20 blur-3xl animate-float-delayed" />
          <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:88px_88px] animate-grid-move" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_55%)]" />
        </div>

        <div className="relative mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4">
          <div className="text-center">
            <div className="relative mx-auto mb-5 inline-block">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 blur-xl opacity-60 animate-pulse-glow" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-600 shadow-2xl shadow-blue-500/40">
                <Bot className="h-8 w-8 text-white" />
              </div>
            </div>

            <div className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-blue-200 to-cyan-200 bg-clip-text text-transparent">
              Redirecting…
            </div>
            <div className="mt-2 text-sm font-medium text-slate-300">
              Loading your dashboard
            </div>

            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 backdrop-blur">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
              Please wait
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <Navigate to={target} replace />;
}

