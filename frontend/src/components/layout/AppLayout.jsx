import { useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Bot,
  Cpu,
  FileText,
  House,
  List,
  LogOut,
  Menu,
  Package,
  X,
  Map,
  ClipboardCheck
} from "lucide-react";
import { AppDataProvider } from "../../context/AppDataContext";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../ui/Button";
import { cn } from "../../lib/cn";

const navItems = [
  { label: "Dashboard", to: "/dashboard", icon: House },
  { label: "Inventory", to: "/inventory", icon: Package },
  { label: "Fulfillment", to: "/fulfillment", icon: ClipboardCheck },
  { label: "Tasks", to: "/tasks", icon: List },
  { label: "Robot Control", to: "/robot", icon: Cpu },
  { label: "Logs", to: "/logs", icon: FileText }
];

function SidebarContent({ onNavigate }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const activeTitle = useMemo(
    () => navItems.find((item) => location.pathname.startsWith(item.to))?.label || "Dashboard",
    [location.pathname]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-5 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-600 shadow-[0_0_30px_rgba(59,130,246,0.28)]">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="brand-heading bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-xl font-semibold text-transparent">
              TransBot
            </div>
            <p className="mt-1 text-sm text-slate-400">Warehouse automation control</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          Navigation
        </div>
        <nav className="grid gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-300 ease-out",
                    isActive
                      ? "border-white/10 bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                      : "border-transparent text-slate-400 hover:border-white/10 hover:bg-white/5 hover:text-white"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-white/10 px-4 py-5">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Signed in
          </div>
          <div className="mt-3">
            <div className="brand-heading text-lg font-semibold text-white">
              {user?.name || "User"}
            </div>
            <div className="mt-1 text-sm text-slate-400">{user?.email || activeTitle}</div>
          </div>
          <Button variant="secondary" className="mt-4 w-full" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <AppDataProvider>
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-8 h-80 w-80 rounded-full bg-blue-500/25 blur-3xl animate-float" />
          <div className="absolute right-[-8rem] top-[12%] h-[26rem] w-[26rem] rounded-full bg-purple-500/20 blur-3xl animate-float-slow" />
          <div className="absolute bottom-[-10rem] left-[28%] h-[28rem] w-[28rem] rounded-full bg-cyan-500/25 blur-3xl animate-float-delayed" />
          <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.1)_1px,transparent_1px)] [background-size:72px_72px] animate-grid-move" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.12),transparent_24%)]" />
        </div>

        <div className="relative flex min-h-screen">
          <aside className="hidden w-[290px] shrink-0 border-r border-white/10 bg-slate-950/40 backdrop-blur-xl lg:flex">
            <SidebarContent />
          </aside>

          <div className="flex min-h-screen min-w-0 flex-1 flex-col">
            <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-slate-950/40 px-4 py-3 backdrop-blur-xl lg:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-600 shadow-[0_0_24px_rgba(59,130,246,0.25)]">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="brand-heading bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-lg font-semibold text-transparent">
                    TransBot
                  </div>
                  <div className="text-xs text-slate-400">Command center</div>
                </div>
              </div>

              <Button
                variant="secondary"
                size="icon"
                aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
                onClick={() => setMobileOpen((current) => !current)}
              >
                {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </Button>
            </div>

            {mobileOpen ? (
              <div className="fixed inset-0 z-30 lg:hidden">
                <button
                  type="button"
                  className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation"
                />
                <aside className="relative h-full w-[290px] border-r border-white/10 bg-slate-950/80 backdrop-blur-xl">
                  <SidebarContent onNavigate={() => setMobileOpen(false)} />
                </aside>
              </div>
            ) : null}

            <main className="relative z-10 min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </AppDataProvider>
  );
}
