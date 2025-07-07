import React from "react";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Info, Clock, AlertCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import type { TimeoutConfig } from "../../types/config";

interface ApprovalSettingsProps {
  enabled: boolean;
  defaultAction: "approve" | "deny" | "review";
  timeout: TimeoutConfig;
  onToggleEnabled: (enabled: boolean) => void;
  onUpdateSettings: (settings: {
    defaultAction: "approve" | "deny" | "review";
    timeout: TimeoutConfig;
  }) => void;
}

export const ApprovalSettings: React.FC<ApprovalSettingsProps> = ({
  enabled,
  defaultAction,
  timeout,
  onToggleEnabled,
  onUpdateSettings,
}) => {
  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
      return `${seconds} second${seconds > 1 ? 's' : ''}`;
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-6">
          {/* Header with Toggle */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                Approval System
                {enabled ? (
                  <Badge variant="success">Enabled</Badge>
                ) : (
                  <Badge variant="outline">Disabled</Badge>
                )}
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Control whether tool calls require approval before execution
              </p>
            </div>
            <button
              onClick={() => onToggleEnabled(!enabled)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                enabled ? "bg-blueprint-600" : "bg-gray-200 dark:bg-gray-700"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  enabled ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>

          {/* Settings (only shown when enabled) */}
          {enabled && (
            <>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
                  Default Action
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                  Action taken when no rules match a tool call
                </p>
                <div className="space-y-2">
                  {(["review", "approve", "deny"] as const).map((action) => (
                    <label
                      key={action}
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <input
                        type="radio"
                        name="defaultAction"
                        value={action}
                        checked={defaultAction === action}
                        onChange={(e) =>
                          onUpdateSettings({
                            defaultAction: e.target.value as typeof defaultAction,
                            timeout,
                          })
                        }
                        className="text-blueprint-600 focus:ring-blueprint-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                            {action}
                          </span>
                          {action === "review" && (
                            <Badge variant="info" className="text-xs">
                              Recommended
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                          {action === "review" &&
                            "Wait for manual approval or denial"}
                          {action === "approve" &&
                            "Automatically approve all unmatched requests"}
                          {action === "deny" &&
                            "Automatically deny all unmatched requests"}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Timeout Settings (only shown when defaultAction is 'review') */}
              {defaultAction === "review" && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Timeout Settings
                  </h3>
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                      <p className="text-xs text-blue-800 dark:text-blue-300">
                        When a tool call requires review and no action is taken within the timeout period,
                        the configured timeout action will be applied automatically.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Timeout Duration
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          value={timeout.duration}
                          onChange={(e) => {
                            const value = parseInt(e.target.value);
                            if (!isNaN(value) && value >= 1000) {
                              onUpdateSettings({
                                defaultAction,
                                timeout: { ...timeout, duration: value },
                              });
                            }
                          }}
                          min="1000"
                          step="1000"
                          className="block w-32 rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-sm focus:border-blueprint-500 focus:ring-blueprint-500 sm:text-sm"
                        />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          milliseconds ({formatDuration(timeout.duration)})
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Timeout Action
                      </label>
                      <div className="space-y-2">
                        {(["deny", "approve"] as const).map((action) => (
                          <label
                            key={action}
                            className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                          >
                            <input
                              type="radio"
                              name="timeoutAction"
                              value={action}
                              checked={timeout.defaultAction === action}
                              onChange={(e) =>
                                onUpdateSettings({
                                  defaultAction,
                                  timeout: {
                                    ...timeout,
                                    defaultAction: e.target.value as "approve" | "deny",
                                  },
                                })
                              }
                              className="text-blueprint-600 focus:ring-blueprint-500"
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                                  {action}
                                </span>
                                {action === "deny" && (
                                  <Badge variant="info" className="text-xs">
                                    Safer
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                                {action === "deny" &&
                                  "Deny requests that timeout without approval"}
                                {action === "approve" &&
                                  "Approve requests that timeout without denial"}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Warning for non-review default actions */}
              {defaultAction !== "review" && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                        Security Warning
                      </p>
                      <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                        Setting the default action to "{defaultAction}" means all tool calls that don't match any rules 
                        will be automatically {defaultAction}d without review. Consider adding specific rules or 
                        changing the default action to "review" for better security.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};