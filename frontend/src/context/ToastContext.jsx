/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, CircleAlert, Info } from "lucide-react";

const ToastContext = createContext(null);

const iconMap = {
  success: CheckCircle2,
  error: CircleAlert,
  info: Info
};

const toneClasses = {
  success: "border-emerald-500/30 bg-emerald-500/15 text-emerald-100",
  error: "border-rose-500/30 bg-rose-500/15 text-rose-100",
  info: "border-cyan-500/30 bg-cyan-500/15 text-cyan-100"
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const MotionDiv = motion.div;

  const removeToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(({ message, title, tone = "info", duration = 3200 }) => {
    const id = idRef.current + 1;
    idRef.current = id;

    setToasts((current) => [...current, { id, message, title, tone }]);

    window.setTimeout(() => removeToast(id), duration);
    return id;
  }, [removeToast]);

  const value = useMemo(
    () => ({
      success: (message, title = "Success") => pushToast({ message, title, tone: "success" }),
      error: (message, title = "Action failed") => pushToast({ message, title, tone: "error" }),
      info: (message, title = "Update") => pushToast({ message, title, tone: "info" })
    }),
    [pushToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3">
        <AnimatePresence>
          {toasts.map((toast) => {
            const Icon = iconMap[toast.tone] || Info;

            return (
              <MotionDiv
                key={toast.id}
                initial={{ opacity: 0, y: -12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-xl ${toneClasses[toast.tone]}`}
              >
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{toast.title}</div>
                    <div className="mt-1 text-sm text-inherit/90">{toast.message}</div>
                  </div>
                </div>
              </MotionDiv>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
