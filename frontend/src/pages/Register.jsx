import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bot, Lock, Mail, UserRound } from "lucide-react";
import { AuthShell } from "../components/AuthShell";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { registerUser } from "../lib/api";
import { getErrorMessage } from "../lib/formatters";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await registerUser({ name, email, password });
      setAuth({ token: response.token, user: response.user });
      navigate("/dashboard", { replace: true });
    } catch (submitError) {
      setError(getErrorMessage(submitError, "Registration failed."));
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
              Create a TransBot account to manage tasks, telemetry, and robot control.
            </p>
          </div>

          <div className="space-y-2 text-center animate-fade-in-up" style={{ animationDelay: "80ms" }}>
            <CardTitle className="text-2xl text-white">Create account</CardTitle>
            <CardDescription className="text-slate-400">
              Create a single shared account for the system.
            </CardDescription>
          </div>

          <form className="grid gap-5" onSubmit={handleSubmit}>
            <div className="grid gap-2 animate-fade-in-up" style={{ animationDelay: "140ms" }}>
              <label className="text-sm font-medium text-slate-300">Full name</label>
              <div className="group relative">
                <UserRound className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-300" />
                <Input
                  className="pl-11"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  required
                />
              </div>
            </div>

            <div className="grid gap-2 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
              <label className="text-sm font-medium text-slate-300">Email</label>
              <div className="group relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-300" />
                <Input
                  type="email"
                  className="pl-11"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="grid gap-2 animate-fade-in-up" style={{ animationDelay: "260ms" }}>
              <label className="text-sm font-medium text-slate-300">Password</label>
              <div className="group relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-300" />
                <Input
                  type="password"
                  className="pl-11"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>
              <p className="text-xs text-slate-400">Must be at least 6 characters.</p>
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
              style={{ animationDelay: "320ms" }}
            >
              {submitting ? "Creating account..." : "Create account"}
            </Button>

            <div
              className="animate-fade-in-up text-center text-sm text-slate-400"
              style={{ animationDelay: "380ms" }}
            >
              Already have an account?{" "}
              <Link
                className="font-semibold bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent transition-opacity hover:opacity-80"
                to="/login"
              >
                Login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
