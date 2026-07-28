import { useState } from "react";
import { KeyRound, Save, Settings as SettingsIcon, User } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { PageHeader } from "../components/PageHeader";
import { PageTransition } from "../components/PageTransition";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { updateProfile, updatePassword } from "../lib/api";
import { getErrorMessage } from "../lib/formatters";

function FieldError({ message }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-rose-400">{message}</p>;
}

function FieldSuccess({ message }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-emerald-400">{message}</p>;
}

export default function Settings() {
  const { user, token, logout } = useAuth();
  const toast = useToast();

  // Profile section
  const [profileName, setProfileName] = useState(user?.name || "");
  const [profileEmail, setProfileEmail] = useState(user?.email || "");
  const [profileErrors, setProfileErrors] = useState({});
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);

  // Password section
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setProfileErrors({});
    setProfileSuccess("");

    const trimmedName = profileName.trim();
    const trimmedEmail = profileEmail.trim();

    const errors = {};
    if (!trimmedName) errors.name = "Name is required.";
    if (!trimmedEmail) errors.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) errors.email = "Enter a valid email address.";
    if (Object.keys(errors).length > 0) { setProfileErrors(errors); return; }

    setProfileLoading(true);
    try {
      await updateProfile(token, { name: trimmedName, email: trimmedEmail });
      setProfileSuccess("Profile updated successfully.");
      toast.success("Profile updated.");
    } catch (error) {
      if (error?.status === 401) { logout(); return; }
      if (error?.data?.errors) {
        setProfileErrors(error.data.errors);
      } else {
        setProfileErrors({ _global: getErrorMessage(error, "Failed to update profile.") });
      }
    } finally {
      setProfileLoading(false);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setPasswordErrors({});
    setPasswordSuccess("");

    const errors = {};
    if (!currentPassword) errors.currentPassword = "Current password is required.";
    if (!newPassword) errors.newPassword = "New password is required.";
    else if (newPassword.length < 8) errors.newPassword = "New password must be at least 8 characters.";
    if (newPassword !== confirmPassword) errors.confirmPassword = "Passwords do not match.";
    if (Object.keys(errors).length > 0) { setPasswordErrors(errors); return; }

    setPasswordLoading(true);
    try {
      await updatePassword(token, { currentPassword, newPassword });
      setPasswordSuccess("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed.");
    } catch (error) {
      if (error?.status === 401) {
        setPasswordErrors({ currentPassword: "Current password is incorrect." });
        return;
      }
      if (error?.data?.errors) {
        setPasswordErrors(error.data.errors);
      } else {
        setPasswordErrors({ _global: getErrorMessage(error, "Failed to change password.") });
      }
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <PageTransition>
      <PageHeader
        title="Settings"
        description="Manage your account profile and security preferences."
        icon={<SettingsIcon className="h-6 w-6" />}
      />

      <div className="mx-auto max-w-2xl space-y-6">
        {/* ── Profile Section ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-cyan-300" />
              Profile
            </CardTitle>
            <CardDescription>Update your display name and email address.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              {profileErrors._global && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {profileErrors._global}
                </div>
              )}

              <div className="grid gap-2">
                <label htmlFor="profile-name" className="text-sm font-medium text-slate-300">
                  Full Name
                </label>
                <Input
                  id="profile-name"
                  type="text"
                  value={profileName}
                  onChange={(e) => { setProfileName(e.target.value); setProfileErrors((p) => ({ ...p, name: "" })); }}
                  placeholder="Your full name"
                  autoComplete="name"
                />
                <FieldError message={profileErrors.name} />
              </div>

              <div className="grid gap-2">
                <label htmlFor="profile-email" className="text-sm font-medium text-slate-300">
                  Email Address
                </label>
                <Input
                  id="profile-email"
                  type="email"
                  value={profileEmail}
                  onChange={(e) => { setProfileEmail(e.target.value); setProfileErrors((p) => ({ ...p, email: "" })); }}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
                <FieldError message={profileErrors.email} />
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" isLoading={profileLoading}>
                  <Save className="h-4 w-4" />
                  Save Profile
                </Button>
                <FieldSuccess message={profileSuccess} />
              </div>
            </form>
          </CardContent>
        </Card>

        {/* ── Password Section ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-cyan-300" />
              Change Password
            </CardTitle>
            <CardDescription>Keep your account secure with a strong password (8+ characters).</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              {passwordErrors._global && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {passwordErrors._global}
                </div>
              )}

              <div className="grid gap-2">
                <label htmlFor="current-password" className="text-sm font-medium text-slate-300">
                  Current Password
                </label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setPasswordErrors((p) => ({ ...p, currentPassword: "" })); }}
                  placeholder="Your current password"
                  autoComplete="current-password"
                />
                <FieldError message={passwordErrors.currentPassword} />
              </div>

              <div className="grid gap-2">
                <label htmlFor="new-password" className="text-sm font-medium text-slate-300">
                  New Password
                </label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPasswordErrors((p) => ({ ...p, newPassword: "", confirmPassword: "" })); }}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
                <FieldError message={passwordErrors.newPassword} />
              </div>

              <div className="grid gap-2">
                <label htmlFor="confirm-password" className="text-sm font-medium text-slate-300">
                  Confirm New Password
                </label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPasswordErrors((p) => ({ ...p, confirmPassword: "" })); }}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                />
                <FieldError message={passwordErrors.confirmPassword} />
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" isLoading={passwordLoading}>
                  <KeyRound className="h-4 w-4" />
                  Change Password
                </Button>
                <FieldSuccess message={passwordSuccess} />
              </div>
            </form>
          </CardContent>
        </Card>

        {/* ── Role info ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-slate-400" />
              Account Role
            </CardTitle>
            <CardDescription>Your system permissions level. Contact an administrator to change your role.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-widest text-slate-400">Current Role</div>
              <div className="mt-1 text-base font-semibold capitalize text-white">{user?.role || "—"}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
