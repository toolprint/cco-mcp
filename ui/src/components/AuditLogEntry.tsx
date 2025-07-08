import React, { useState } from "react";
import {
  Clock,
  User,
  Check,
  X,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Terminal,
  Server,
  UserCircle,
  Shield,
} from "lucide-react";
import type { AuditLogEntry as AuditLogEntryType } from "../types/audit";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { JsonViewer } from "./ui/json-viewer";
import { cn } from "../lib/utils";
import { formatDuration, formatUserIdentity } from "../lib/format";

interface AuditLogEntryProps {
  entry: AuditLogEntryType;
  onApprove?: (id: string) => void;
  onDeny?: (id: string) => void;
  onCreateRule?: (entry: AuditLogEntryType) => void;
}

export const AuditLogEntry: React.FC<AuditLogEntryProps> = ({
  entry,
  onApprove,
  onDeny,
  onCreateRule,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const timestamp = new Date(entry.timestamp).toLocaleString();
  const isExpired = new Date(entry.expires_at) < new Date();

  const stateConfig = {
    APPROVED: {
      variant: "success" as const,
      icon: Check,
      label: "Approved",
    },
    DENIED: {
      variant: "danger" as const,
      icon: X,
      label: "Denied",
    },
    NEEDS_REVIEW: {
      variant: "warning" as const,
      icon: AlertCircle,
      label: "Needs Review",
    },
  };

  const state = stateConfig[entry.state];
  const StateIcon = state.icon;

  return (
    <Card
      className={cn(
        "transition-all duration-200 hover:shadow-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 overflow-hidden",
        entry.state === "NEEDS_REVIEW" &&
          !isExpired &&
          "border-blueprint-400 shadow-blueprint-100",
        isExpired && "opacity-60"
      )}
    >
      <CardContent className="p-0">
        {/* Header Section (Always Visible) */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            {/* Left side - Icon and content */}
            <div className="flex items-start gap-3 flex-1">
              <div
                className={cn(
                  "p-2 rounded-lg flex-shrink-0",
                  entry.state === "APPROVED" && "bg-status-success/10",
                  entry.state === "DENIED" && "bg-status-danger/10",
                  entry.state === "NEEDS_REVIEW" && "bg-status-warning/10"
                )}
              >
                <StateIcon
                  className={cn(
                    "h-5 w-5",
                    entry.state === "APPROVED" && "text-status-success",
                    entry.state === "DENIED" && "text-status-danger",
                    entry.state === "NEEDS_REVIEW" && "text-status-warning"
                  )}
                />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-800 dark:text-white">
                  {entry.tool_name}
                </h3>
                <div className="flex items-center gap-4 mt-1 text-sm text-slate-600 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {entry.agent_identity}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {timestamp}
                  </span>
                </div>
                {/* Decision info */}
                {entry.state !== "NEEDS_REVIEW" && (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    {entry.state === "APPROVED" &&
                      entry.decision_by &&
                      (() => {
                        const identity = formatUserIdentity(entry.decision_by);
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-status-success">
                              Approved by
                            </span>
                            <Badge
                              variant="outline"
                              className="text-xs border-status-success/30 text-status-success"
                            >
                              {identity.type === "ip" && (
                                <Server className="h-3 w-3 mr-1" />
                              )}
                              {identity.type === "user" && (
                                <UserCircle className="h-3 w-3 mr-1" />
                              )}
                              {identity.display}
                            </Badge>
                          </div>
                        );
                      })()}
                    {entry.state === "DENIED" && entry.denied_by_timeout && (
                      <div className="flex items-center gap-2">
                        <span className="text-status-danger">
                          Denied by timeout
                        </span>
                        <Badge
                          variant="outline"
                          className="text-xs border-status-danger/30 text-status-danger"
                        >
                          <Clock className="h-3 w-3 mr-1" />
                          {entry.expires_at
                            ? formatDuration(
                                new Date(entry.expires_at).getTime() -
                                  new Date(entry.timestamp).getTime()
                              )
                            : "expired"}
                        </Badge>
                      </div>
                    )}
                    {entry.state === "DENIED" &&
                      !entry.denied_by_timeout &&
                      entry.decision_by &&
                      (() => {
                        const identity = formatUserIdentity(entry.decision_by);
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-status-danger">
                              Denied by
                            </span>
                            <Badge
                              variant="outline"
                              className="text-xs border-status-danger/30 text-status-danger"
                            >
                              {identity.type === "ip" && (
                                <Server className="h-3 w-3 mr-1" />
                              )}
                              {identity.type === "user" && (
                                <UserCircle className="h-3 w-3 mr-1" />
                              )}
                              {identity.display}
                            </Badge>
                          </div>
                        );
                      })()}
                  </div>
                )}
              </div>
            </div>

            {/* Right side - Status badge and buttons */}
            <div className="flex flex-col items-end gap-3">
              <div className="flex items-start gap-2">
                <Badge variant={state.variant} className="text-xs">
                  {state.label}
                </Badge>
                {isExpired && (
                  <Badge
                    variant="outline"
                    className="text-xs text-muted-foreground"
                  >
                    Expired
                  </Badge>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {/* Create Rule Button (for completed requests) */}
                {(entry.state === "APPROVED" || entry.state === "DENIED") &&
                  onCreateRule && (
                    <Button
                      onClick={() => onCreateRule(entry)}
                      size="sm"
                      variant="outline"
                      className={cn(
                        "gap-1.5 py-1.5 px-2.5 text-xs",
                        "border-blueprint-500 text-blueprint-600 hover:bg-blueprint-50",
                        "dark:border-blueprint-400 dark:text-blueprint-400 dark:hover:bg-blueprint-900/20"
                      )}
                    >
                      <Shield className="h-3 w-3" />
                      Create Rule
                    </Button>
                  )}

                {/* Expand/Collapse Button */}
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className={cn(
                    "flex items-center gap-2 py-1.5 px-3 rounded-md text-sm font-medium transition-colors",
                    "bg-blueprint-50 hover:bg-blueprint-100 text-blueprint-700",
                    "dark:bg-blueprint-900/20 dark:hover:bg-blueprint-900/30 dark:text-blueprint-400"
                  )}
                >
                  {isExpanded ? (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Hide Details
                    </>
                  ) : (
                    <>
                      <ChevronRight className="h-4 w-4" />
                      View Details
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Expandable Request Details */}
        {isExpanded && (
          <div className="px-4 pb-4 space-y-3">
            <div className="flex items-start gap-2">
              <Terminal className="h-4 w-4 text-blueprint-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Request Details
                </p>
                <JsonViewer
                  data={entry.request || entry.tool_input}
                  defaultExpandDepth={2}
                />
              </div>
            </div>

            {entry.response_snapshot && (
              <div className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 text-blueprint-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {entry.state === "APPROVED"
                      ? "Response"
                      : "Response Preview"}
                  </p>
                  {typeof entry.response_snapshot === "string" ? (
                    <pre className="text-xs text-slate-600 dark:text-slate-400 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 p-3 rounded overflow-x-auto whitespace-pre-wrap font-mono">
                      {entry.response_snapshot}
                    </pre>
                  ) : (
                    <JsonViewer
                      data={entry.response_snapshot}
                      defaultExpandDepth={2}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Footer (Only for Needs Review) */}
        {entry.state === "NEEDS_REVIEW" &&
          !isExpired &&
          onApprove &&
          onDeny && (
            <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-4">
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={() => onApprove(entry.id)}
                  size="sm"
                  className={cn(
                    "gap-2 flex-1 max-w-[150px]",
                    "bg-green-700 hover:bg-green-800 text-white",
                    "shadow-sm hover:shadow-md transition-all",
                    "bg-gradient-to-b from-green-600 to-green-700",
                    "hover:from-green-700 hover:to-green-800",
                    "border border-green-800/20"
                  )}
                >
                  <Check className="h-4 w-4" />
                  Approve
                </Button>
                <Button
                  onClick={() => onDeny(entry.id)}
                  size="sm"
                  className={cn(
                    "gap-2 flex-1 max-w-[150px]",
                    "bg-red-700 hover:bg-red-800 text-white",
                    "shadow-sm hover:shadow-md transition-all",
                    "bg-gradient-to-b from-red-600 to-red-700",
                    "hover:from-red-700 hover:to-red-800",
                    "border border-red-800/20"
                  )}
                >
                  <X className="h-4 w-4" />
                  Deny
                </Button>
              </div>
            </div>
          )}

      </CardContent>
    </Card>
  );
};
