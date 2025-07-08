import React, { useState, useEffect } from "react";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { DurationPicker } from "../ui/duration-picker";
import { Info, Clock, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [pendingSettings, setPendingSettings] = useState({
    defaultAction,
    timeout,
  });
  const [hasChanges, setHasChanges] = useState(false);

  // Sync pending settings when props change (e.g., from external updates)
  useEffect(() => {
    setPendingSettings({ defaultAction, timeout });
    setHasChanges(false);
  }, [defaultAction, timeout]);

  // Check if there are changes
  useEffect(() => {
    const changed =
      pendingSettings.defaultAction !== defaultAction ||
      pendingSettings.timeout.duration !== timeout.duration ||
      pendingSettings.timeout.defaultAction !== timeout.defaultAction;
    setHasChanges(changed);
  }, [pendingSettings, defaultAction, timeout]);

  const handlePendingChange = (newSettings: typeof pendingSettings) => {
    setPendingSettings(newSettings);
  };

  const handleConfirmChanges = () => {
    onUpdateSettings(pendingSettings);
    setHasChanges(false);
  };

  const handleCancelChanges = () => {
    setPendingSettings({ defaultAction, timeout });
    setHasChanges(false);
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours} hour${hours > 1 ? "s" : ""}`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? "s" : ""}`;
    } else {
      return `${seconds} second${seconds > 1 ? "s" : ""}`;
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-6">
          {/* Header with Toggle */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
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

              {/* Show current configuration when collapsed */}
              {enabled && !isExpanded && (
                <div className="mt-3 flex items-center gap-4 text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    Default action:{" "}
                    <span className="font-medium text-gray-900 dark:text-white capitalize">
                      {defaultAction}
                    </span>
                  </span>
                  {defaultAction === "review" && (
                    <span className="text-gray-600 dark:text-gray-400">
                      Timeout:{" "}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {formatDuration(timeout.duration)}
                      </span>
                    </span>
                  )}
                  {hasChanges && (
                    <Badge variant="warning" className="text-xs">
                      Unsaved changes
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Expand/Collapse button (only shown when enabled) */}
              {enabled && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  aria-label={
                    isExpanded ? "Collapse settings" : "Expand settings"
                  }
                >
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </button>
              )}

              {/* Enable/Disable toggle */}
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
          </div>

          {/* Settings (only shown when enabled and expanded) */}
          {enabled && isExpanded && (
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
                        checked={pendingSettings.defaultAction === action}
                        onChange={(e) =>
                          handlePendingChange({
                            ...pendingSettings,
                            defaultAction: e.target
                              .value as typeof defaultAction,
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

                {/* Warning for non-review default actions */}
                {pendingSettings.defaultAction !== "review" && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mt-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                          Security Warning
                        </p>
                        <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                          Setting the default action to "
                          {pendingSettings.defaultAction}" means all tool calls
                          that don't match any rules will be automatically{" "}
                          {pendingSettings.defaultAction === "approve"
                            ? "approved"
                            : "denied"}{" "}
                          without review. Consider adding specific rules or
                          changing the default action to "review" for better
                          security.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Timeout Settings (always shown, disabled when not review) */}
              <div
                className={cn(
                  "border-t border-gray-200 dark:border-gray-700 pt-6",
                  pendingSettings.defaultAction !== "review" && "opacity-50"
                )}
              >
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Timeout Settings
                  {pendingSettings.defaultAction !== "review" && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      (Only applies when default action is "review")
                    </span>
                  )}
                </h3>
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <p className="text-xs text-blue-800 dark:text-blue-300">
                      When a tool call requires review and no action is taken
                      within the timeout period, the configured timeout action
                      will be applied automatically.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Timeout Duration
                    </label>
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          pendingSettings.defaultAction !== "review" &&
                            "pointer-events-none"
                        )}
                      >
                        <DurationPicker
                          value={pendingSettings.timeout.duration}
                          onChange={(value) => {
                            if (pendingSettings.defaultAction === "review") {
                              handlePendingChange({
                                ...pendingSettings,
                                timeout: {
                                  ...pendingSettings.timeout,
                                  duration: value,
                                },
                              });
                            }
                          }}
                          min={1000}
                        />
                      </div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        ({formatDuration(pendingSettings.timeout.duration)})
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
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors",
                            pendingSettings.defaultAction === "review"
                              ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                              : "cursor-not-allowed"
                          )}
                        >
                          <input
                            type="radio"
                            name="timeoutAction"
                            value={action}
                            checked={
                              pendingSettings.timeout.defaultAction === action
                            }
                            disabled={
                              pendingSettings.defaultAction !== "review"
                            }
                            onChange={(e) => {
                              if (pendingSettings.defaultAction === "review") {
                                handlePendingChange({
                                  ...pendingSettings,
                                  timeout: {
                                    ...pendingSettings.timeout,
                                    defaultAction: e.target.value as
                                      | "approve"
                                      | "deny",
                                  },
                                });
                              }
                            }}
                            className="text-blueprint-600 focus:ring-blueprint-500 disabled:opacity-50"
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

              {/* Confirm/Cancel buttons when there are changes */}
              {hasChanges && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                  <div className="flex items-center justify-end gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelChanges}
                    >
                      Cancel Changes
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleConfirmChanges}
                      className="bg-blueprint-600 hover:bg-blueprint-700 text-white"
                    >
                      Confirm Changes
                    </Button>
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
