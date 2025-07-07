import React from "react";
import type { AuditLogState } from "../types/audit";
import { Select } from "./ui/select";

interface StatusFilterProps {
  selectedState: AuditLogState | "ALL";
  onStateChange: (state: AuditLogState | "ALL") => void;
}

export const StatusFilter: React.FC<StatusFilterProps> = ({
  selectedState,
  onStateChange,
}) => {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
        Status
      </label>
      <Select
        value={selectedState}
        onChange={(e) => onStateChange(e.target.value as AuditLogState | "ALL")}
        className="w-full"
      >
        <option value="ALL">All Statuses</option>
        <option value="NEEDS_REVIEW">Needs Review</option>
        <option value="APPROVED">Approved</option>
        <option value="DENIED">Denied</option>
      </Select>
    </div>
  );
};
