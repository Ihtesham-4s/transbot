import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  destructive = false,
  confirmLoading = false
}) {
  useEffect(() => {
    if (!open) return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape") onCancel?.();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onCancel]);

  const MotionDiv = motion.div;

  return (
    <AnimatePresence>
      {open ? (
        <MotionDiv
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => onCancel?.()}
          />

          <MotionDiv
            className="relative z-10 w-full max-w-md"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <Card>
              <CardHeader>
                <div className="flex items-start gap-3">
                  {icon ? (
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white backdrop-blur-xl">
                      {icon}
                    </div>
                  ) : null}
                  <div>
                    <CardTitle>{title}</CardTitle>
                    {description ? <CardDescription>{description}</CardDescription> : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={() => onCancel?.()}>
                  {cancelText}
                </Button>
                <Button
                  variant={destructive ? "danger" : "primary"}
                  isLoading={confirmLoading}
                  onClick={() => onConfirm?.()}
                >
                  {confirmText}
                </Button>
              </CardContent>
            </Card>
          </MotionDiv>
        </MotionDiv>
      ) : null}
    </AnimatePresence>
  );
}
