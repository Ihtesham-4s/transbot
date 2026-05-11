import { Navigate } from "react-router-dom";
import { Bot } from "lucide-react";
import { AuthShell } from "../components/AuthShell";
import { Card, CardContent } from "../components/ui/Card";
import { useAuth } from "../context/AuthContext";

export default function AppRedirect() {
  const { user } = useAuth();

  if (!user) {
    return (
      <AuthShell>
        <Card className="animate-fade-in-up">
          <CardContent className="px-8 py-7 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-600 shadow-[0_0_30px_rgba(59,130,246,0.28)]">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div className="brand-heading mt-4 text-xl font-semibold text-white">Redirecting</div>
            <p className="mt-2 text-sm text-slate-400">Preparing your dashboard.</p>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  return <Navigate to="/dashboard" replace />;
}
