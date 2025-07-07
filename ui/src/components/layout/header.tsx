import React, { useEffect, useState } from "react";
import { Shield, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";

interface AutoApprovalInfo {
  enabled: boolean;
  ruleCount: number;
  activeRuleCount: number;
}

interface HeaderProps {
  isConnected: boolean;
  isHealthy: boolean | null;
}

export const Header: React.FC<HeaderProps> = ({ isConnected, isHealthy }) => {
  const [autoApprovalInfo, setAutoApprovalInfo] = useState<AutoApprovalInfo | null>(null);

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
  }, [isHealthy]); // Re-fetch when health status changes

  return (
    <header className="sticky top-0 z-50 w-full bg-white dark:bg-gray-800 shadow-sm">
      {/* Auto-approve warning banner */}
      {autoApprovalInfo?.enabled && (
        <div className="bg-amber-100 dark:bg-amber-900/30 border-b-2 border-amber-300 dark:border-amber-700 px-4 py-3">
          <div className="mx-auto max-w-7xl flex items-center justify-center gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-700 dark:text-amber-500 animate-pulse" />
            <div className="flex flex-col items-center">
              <span className="text-base font-semibold text-amber-900 dark:text-amber-100 uppercase tracking-wide">
                ⚠️ AUTO-APPROVE MODE IS ACTIVE
              </span>
              {autoApprovalInfo.activeRuleCount > 0 ? (
                <span className="text-sm text-amber-800 dark:text-amber-200">
                  {autoApprovalInfo.activeRuleCount} active rule{autoApprovalInfo.activeRuleCount !== 1 ? 's' : ''} configured
                </span>
              ) : (
                <span className="text-sm text-amber-800 dark:text-amber-200">
                  No rules configured - using default action
                </span>
              )}
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
                <Shield className="h-8 w-8 text-blueprint-600 dark:text-blueprint-400" />
              </div>
              <div className="ml-4">
                <h1 className="text-xl font-semibold text-slate-800 dark:text-white">
                  CCO-MCP{" "}
                  <span className="text-gradient font-bold">
                    Audit Dashboard
                  </span>
                </h1>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Real-time tool approval monitoring
                </p>
              </div>
            </div>

            {/* Status Indicators */}
            <div className="flex items-center space-x-6">
              {/* Auto-Approval Status */}
              {autoApprovalInfo?.enabled && (
                <Badge
                  variant="warning"
                  className="flex items-center gap-1.5"
                >
                  <AlertTriangle className="h-3 w-3" />
                  <span>Auto-Approve</span>
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
