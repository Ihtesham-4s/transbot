import { useEffect } from "react";
import { Button } from "./Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./Card";

export function ConfirmDialog({
  open,
  title = "Are you sure?",
  description,
  icon,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  destructive = false
}) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onCancel?.();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        onClick={() => onCancel?.()}
      />

      <div className="relative w-full max-w-md">
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              {icon ? (
                <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                  {icon}
                </div>
              ) : null}
              <div>
                <CardTitle className={destructive ? "from-white via-blue-200 to-cyan-200" : undefined}>
                  {title}
                </CardTitle>
                {description ? <CardDescription>{description}</CardDescription> : null}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => onCancel?.()}>
                {cancelText}
              </Button>
              <Button
                onClick={() => onConfirm?.()}
                className={destructive ? "from-blue-600 via-purple-600 to-cyan-600" : undefined}
              >
                {confirmText}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
