import { Navigate, Outlet } from "react-router-dom";
import { Bot } from "lucide-react";
import { AuthShell } from "./AuthShell";
import { Card, CardContent } from "./ui/Card";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute() {
  const { isAuthed, loading } = useAuth();

  if (loading) {
    return (
      <AuthShell>
        <Card className="animate-fade-in-up">
          <CardContent className="px-8 py-7 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-600 shadow-[0_0_30px_rgba(59,130,246,0.28)]">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div className="brand-heading mt-4 text-xl font-semibold text-white">Loading session</div>
            <p className="mt-2 text-sm text-slate-400">Checking your authentication state.</p>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  if (!isAuthed) return <Navigate to="/login" replace />;

  return <Outlet />;
}
