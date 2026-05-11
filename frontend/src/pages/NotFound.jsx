import { Link } from "react-router-dom";
import { Bot, Home } from "lucide-react";
import { AuthShell } from "../components/AuthShell";
import { Card, CardContent } from "../components/ui/Card";
import { Button } from "../components/ui/Button";

export default function NotFound() {
  return (
    <AuthShell>
      <Card className="animate-fade-in-up">
        <CardContent className="px-8 py-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-600 shadow-[0_0_36px_rgba(59,130,246,0.32)]">
            <Bot className="h-8 w-8 text-white" />
          </div>
          <div className="brand-heading mt-5 bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-5xl font-semibold text-transparent">
            404
          </div>
          <div className="mt-3 text-xl font-semibold text-white">Page not found</div>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            The page you requested does not exist or is no longer available.
          </p>

          <div className="mt-8 flex justify-center">
            <Link to="/dashboard">
              <Button>
                <Home className="h-4 w-4" />
                Return to dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
