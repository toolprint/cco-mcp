import React, { useEffect } from "react";
import { X, Check, AlertCircle, Info } from "lucide-react";
import { cn } from "../lib/utils";
import { Card, CardContent } from "./ui/card";

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastProps {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  onClose: (id: string) => void;
}

const icons = {
  success: Check,
  error: X,
  warning: AlertCircle,
  info: Info,
};

const styles = {
  success: "border-status-success/30 bg-status-success/20",
  error: "border-status-danger/30 bg-status-danger/20",
  warning: "border-status-warning/30 bg-status-warning/20",
  info: "border-blueprint-500/30 bg-blueprint-500/20",
};

const iconStyles = {
  success: "text-status-success",
  error: "text-status-danger",
  warning: "text-status-warning",
  info: "text-blueprint-500",
};

export const Toast: React.FC<ToastProps> = ({
  id,
  type,
  message,
  duration = 5000,
  onClose,
}) => {
  const Icon = icons[type];

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose(id);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [id, duration, onClose]);

  return (
    <Card
      className={cn(
        "relative overflow-hidden shadow-lg animate-slide-in-right max-w-sm",
        styles[type]
      )}
    >
      <CardContent className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className={cn("p-1.5 rounded-lg bg-background", iconStyles[type])}
          >
            <Icon className="h-4 w-4" />
          </div>
          <p className="flex-1 text-sm font-medium text-gray-900 dark:text-white">
            {message}
          </p>
          <button
            onClick={() => onClose(id)}
            className="flex-shrink-0 ml-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            aria-label="Close notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
      {/* Progress bar for auto-dismiss */}
      {duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-muted">
          <div
            className={cn("h-full transition-all", iconStyles[type])}
            style={{
              width: "100%",
              animation: `shrink ${duration}ms linear forwards`,
              background: "currentColor",
              opacity: 0.6,
            }}
          />
        </div>
      )}
    </Card>
  );
};

interface ToastContainerProps {
  toasts: Array<{
    id: string;
    type: ToastType;
    message: string;
    duration?: number;
  }>;
  removeToast: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  removeToast,
}) => {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} onClose={removeToast} />
      ))}
    </div>
  );
};
