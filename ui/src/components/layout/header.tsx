import React, { useEffect, useState } from "react";
import { Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";
import { useSSEConnection } from "../../contexts/SSEContext";

interface AutoApprovalInfo {
  enabled: boolean;
  ruleCount: number;
  activeRuleCount: number;
  defaultAction: "approve" | "deny" | "review";
}

interface HeaderProps {
  isHealthy: boolean | null;
  configRefreshTrigger?: number; // Used to trigger config refresh
}

const HeaderBase: React.FC<HeaderProps> = ({ isHealthy, configRefreshTrigger }) => {
  const [autoApprovalInfo, setAutoApprovalInfo] = useState<AutoApprovalInfo | null>(null);
  const { isConnected } = useSSEConnection();

  useEffect(() => {
    // Fetch auto-approval status from health endpoint
    fetch("/health")
      .then((res) => res.json())
      .then((data) => {
        if (data.autoApproval) {
          setAutoApprovalInfo(data.autoApproval);
        }
      })
      .catch(() => setAutoApprovalInfo(null));
  }, [isHealthy, configRefreshTrigger]); // Re-fetch when health status changes or config updates

  const showWarningBanner = autoApprovalInfo?.enabled && autoApprovalInfo?.defaultAction !== "review";
  
  return (
    <header className="sticky top-0 z-50 w-full bg-white dark:bg-gray-800 shadow-sm">
      {/* Warning banner for non-review default actions */}
      {showWarningBanner && (
        <div className="bg-amber-100 dark:bg-amber-900/30 border-b-2 border-amber-300 dark:border-amber-700 px-4 py-3">
          <div className="mx-auto max-w-7xl flex items-center justify-center gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-700 dark:text-amber-500 animate-pulse" />
            <div className="flex flex-col items-center">
              <span className="text-base font-semibold text-amber-900 dark:text-amber-100 uppercase tracking-wide">
                {autoApprovalInfo?.defaultAction === "approve" 
                  ? "⚠️ DEFAULT ACTION: AUTO-APPROVE (Reviewing Disabled)"
                  : "⚠️ DEFAULT ACTION: AUTO-DENY (Reviewing Disabled)"
                }
              </span>
              <span className="text-sm text-amber-800 dark:text-amber-200">
                {autoApprovalInfo?.defaultAction === "approve"
                  ? "All unmatched requests will be automatically approved"
                  : "All unmatched requests will be automatically denied"
                }
              </span>
            </div>
            <AlertTriangle className="h-6 w-6 text-amber-700 dark:text-amber-500 animate-pulse" />
          </div>
        </div>
      )}

      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="mx-auto max-w-7xl">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            {/* Logo and Title */}
            <div className="flex items-center">
              <div className="flex items-center p-2.5 bg-blueprint-50 dark:bg-blueprint-900/20 rounded-lg border border-blueprint-200 dark:border-blueprint-700">
                <img src="/eye-magnifier.svg" alt="CCO Monitor" className="h-8 w-8" style={{ filter: "brightness(0) saturate(100%) invert(37%) sepia(93%) saturate(1250%) hue-rotate(199deg) brightness(95%) contrast(86%)" }} />
              </div>
              <div className="ml-4">
                <h1 className="text-xl font-semibold text-slate-800 dark:text-white">
                  <span className="text-gradient font-bold">
                    Claude Code Oversight
                  </span>
                </h1>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Real-time tool approval review system
                </p>
              </div>
            </div>

            {/* Navigation and Status Indicators */}
            <div className="flex items-center space-x-4">

              {/* Approval System Status */}
              {autoApprovalInfo !== null && (
                <Badge
                  variant={autoApprovalInfo.enabled ? "success" : "outline"}
                  className="flex items-center gap-1.5"
                >
                  <div className={cn(
                    "h-2 w-2 rounded-full",
                    autoApprovalInfo.enabled ? "bg-green-500" : "bg-gray-400"
                  )} />
                  <span>Approvals {autoApprovalInfo.enabled ? "Enabled" : "Disabled"}</span>
                </Badge>
              )}

              {/* Connection Status */}
              <div className="flex items-center space-x-2">
                {isConnected ? (
                  <Badge
                    variant="success"
                    className="flex items-center gap-1.5"
                  >
                    <Wifi className="h-3 w-3" />
                    <span>Live</span>
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="flex items-center gap-1.5"
                  >
                    <WifiOff className="h-3 w-3" />
                    <span>Offline</span>
                  </Badge>
                )}
              </div>

              {/* API Health */}
              <div className="flex items-center space-x-2">
                <div
                  className={cn(
                    "h-2 w-2 rounded-full animate-pulse",
                    isHealthy === null
                      ? "bg-gray-400"
                      : isHealthy
                        ? "bg-status-success"
                        : "bg-status-danger"
                  )}
                />
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  API{" "}
                  {isHealthy === null
                    ? "Checking"
                    : isHealthy
                      ? "Healthy"
                      : "Error"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

// Wrapper component that uses useLocation when inside a Router
export const Header: React.FC<HeaderProps> = (props) => {
  try {
    useLocation(); // Verify we're inside a Router
    return <HeaderBase {...props} />;
  } catch {
    // Not inside a Router, use the base component directly
    return <HeaderBase {...props} />;
  }
};
