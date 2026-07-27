import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bot, Lock, Mail } from "lucide-react";
import { AuthShell } from "../components/AuthShell";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { loginUser } from "../lib/api";
import { getErrorMessage } from "../lib/formatters";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const normalizedEmail = email.trim();
    const normalizedPassword = password;
    if (!normalizedEmail) {
      setError("Email is required.");
      return;
    }
    if (!normalizedPassword) {
      setError("Password is required.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await loginUser({ email: normalizedEmail, password: normalizedPassword });
      setAuth({ token: response.token, user: response.user });
      navigate("/dashboard", { replace: true });
    } catch (submitError) {
      setError(getErrorMessage(submitError, "Login failed."));
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <Card className="animate-fade-in-up">
        <CardContent className="space-y-8 px-8 py-8 sm:px-9">
          <div className="text-center animate-fade-in">
            <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-600 shadow-[0_0_40px_rgba(59,130,246,0.35)]">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-blue-400/30 via-purple-400/20 to-cyan-400/30 blur-xl animate-pulse-glow" />
              <Bot className="relative z-10 h-8 w-8 text-white" />
            </div>
            <div className="brand-heading bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-3xl font-semibold text-transparent">
              TransBot
            </div>
            <p className="mt-2 text-sm text-slate-400">
              Secure access to robot operations, tasks, and live system activity.
            </p>
          </div>

          <div className="space-y-2 text-center animate-fade-in-up" style={{ animationDelay: "80ms" }}>
            <CardTitle className="text-2xl text-white">Sign in</CardTitle>
            <CardDescription className="text-slate-400">
              Enter your credentials to open the TransBot dashboard.
            </CardDescription>
          </div>

          <form className="grid gap-5" onSubmit={handleSubmit}>
            <div className="grid gap-2 animate-fade-in-up" style={{ animationDelay: "140ms" }}>
              <label className="text-sm font-medium text-slate-300">Email</label>
              <div className="group relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-300" />
                <Input
                  type="email"
                  autoComplete="email"
                  className="pl-11"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div className="grid gap-2 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
              <label className="text-sm font-medium text-slate-300">Password</label>
              <div className="group relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-300" />
                <Input
                  type="password"
                  autoComplete="current-password"
                  className="pl-11"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </div>
            </div>

            {error ? (
              <div className="animate-fade-in rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 backdrop-blur-sm">
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              isLoading={submitting}
              className="w-full animate-fade-in-up"
              style={{ animationDelay: "260ms" }}
            >
              {submitting ? "Signing in..." : "Sign in"}
            </Button>

            <div
              className="animate-fade-in-up text-center text-sm text-slate-400"
              style={{ animationDelay: "320ms" }}
            >
              Don&apos;t have an account?{" "}
              <Link
                className="font-semibold bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent transition-opacity hover:opacity-80"
                to="/register"
              >
                Register
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
