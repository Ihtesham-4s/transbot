import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock, Mail, UserRound } from "lucide-react";
import { AuthShell } from "../components/AuthShell";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { registerUser } from "../lib/api";
import { useAuth } from "../context/AuthContext";

function roleHome(role) {
  return role === "admin" ? "/admin" : "/operator";
}

export default function Register() {
  const nav = useNavigate();
  const { setAuth } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await registerUser({ name, email, password });
      setAuth({ token: res.token, user: res.user });
      nav(roleHome(res.user.role), { replace: true });
    } catch (err) {
      setError(err.message || "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell productName="TransBot" productTagline="Warehouse Automation System">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>
            Join TransBot and start managing your warehouse. The first account becomes the administrator automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-6">
            <div className="grid gap-2.5">
              <label className="text-sm font-bold text-slate-300">Full name</label>
              <div className="relative group">
                <UserRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-400 z-20" />
                <Input
                  className="pl-12"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  autoComplete="name"
                  required
                />
              </div>
            </div>

            <div className="grid gap-2.5">
              <label className="text-sm font-bold text-slate-300">Email address</label>
              <div className="relative group">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-400 z-20" />
                <Input
                  className="pl-12"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="grid gap-2.5">
              <label className="text-sm font-bold text-slate-300">Password</label>
              <div className="relative group">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-400 z-20" />
                <Input
                  className="pl-12"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
              </div>
              <p className="text-xs text-slate-400">Must be at least 6 characters</p>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-500/30 bg-gradient-to-r from-red-500/10 via-rose-500/10 to-red-500/10 px-4 py-3.5 text-sm font-semibold text-red-300 backdrop-blur-sm shadow-lg border-red-500/20">
                {error}
              </div>
            ) : null}

            <Button type="submit" disabled={submitting} className="w-full mt-2">
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Creating account...
                </span>
              ) : (
                "Create account"
              )}
            </Button>

            <div className="text-center text-sm text-slate-400 pt-2">
              Already have an account?{" "}
              <Link
                className="font-bold text-blue-400 hover:text-cyan-400 hover:underline transition-colors"
                to="/login"
              >
                Sign in
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

