"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
};

/**
 * Transient background events only. Field-level problems render inline next to
 * the input, and a dead backend gets the persistent banner instead — see the
 * error contract in project_documentation.md.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (toast) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((list) => [...list.slice(-3), { id, tone: "info", ...toast }]);
      const timer = setTimeout(() => dismiss(id), toast.duration ?? 5000);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="region" aria-label="Notifications">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.tone] ?? Info;
          return (
            <div key={toast.id} className={`toast ${toast.tone}`} role="status">
              <Icon size={16} aria-hidden="true" />
              <div className="toast-body">
                <div className="toast-title">{toast.title}</div>
                {toast.text ? <div className="toast-text">{toast.text}</div> : null}
                {toast.action ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: "var(--sp-2)" }}
                    onClick={() => {
                      toast.action.onClick();
                      dismiss(toast.id);
                    }}
                  >
                    {toast.action.label}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className="btn btn-icon btn-sm"
                onClick={() => dismiss(toast.id)}
                aria-label={`Dismiss: ${toast.title}`}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
