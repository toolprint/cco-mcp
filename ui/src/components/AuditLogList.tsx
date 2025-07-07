import React from "react";
import { AuditLogEntry } from "./AuditLogEntry";
import type { AuditLogEntry as AuditLogEntryType } from "../types/audit";
import { Loader2 } from "lucide-react";

interface AuditLogListProps {
  entries: AuditLogEntryType[];
  loading?: boolean;
  error?: string | null;
  onApprove?: (id: string) => void;
  onDeny?: (id: string) => void;
}

export const AuditLogList: React.FC<AuditLogListProps> = ({
  entries,
  loading = false,
  error = null,
  onApprove,
  onDeny,
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
        <p className="text-red-600 dark:text-red-400">
          Error loading audit logs: {error}
        </p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">
          No audit log entries found.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <AuditLogEntry
          key={entry.id}
          entry={entry}
          onApprove={onApprove}
          onDeny={onDeny}
        />
      ))}
    </div>
  );
};
