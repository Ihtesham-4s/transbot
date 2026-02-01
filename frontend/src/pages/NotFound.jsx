import { Link } from "react-router-dom";
import { Bot, Home, SearchX } from "lucide-react";
import { Button } from "../components/ui/Button";

export default function NotFound() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-64 -right-64 h-[680px] w-[680px] rounded-full bg-gradient-to-br from-blue-500/25 via-purple-500/20 to-cyan-500/25 blur-3xl animate-float" />
        <div className="absolute -bottom-72 -left-72 h-[760px] w-[760px] rounded-full bg-gradient-to-br from-cyan-500/20 via-indigo-500/20 to-violet-500/20 blur-3xl animate-float-delayed" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:88px_88px] animate-grid-move" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_55%)]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-4xl items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg text-center animate-fade-in-up">
          <div className="relative mx-auto mb-5 inline-block">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 blur-xl opacity-60 animate-pulse-glow" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-600 shadow-2xl shadow-blue-500/40">
              <Bot className="h-8 w-8 text-white" />
            </div>
          </div>

          <div className="text-6xl font-extrabold tracking-tight bg-gradient-to-r from-white via-blue-200 to-cyan-200 bg-clip-text text-transparent">
            404
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white">Page not found</div>
          <div className="mt-2 text-sm font-medium text-slate-300">
            The page you requested doesn’t exist or has been moved.
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link to="/login">
              <Button className="w-full justify-center">
                <Home className="h-4 w-4" />
                Go to login
              </Button>
            </Link>
            <Link to="/app">
              <Button variant="secondary" className="w-full justify-center">
                <SearchX className="h-4 w-4" />
                Go to dashboard
              </Button>
            </Link>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 backdrop-blur">
            If you believe this is a mistake, check the URL or return to your dashboard.
          </div>
        </div>
      </div>
    </div>
  );
}

