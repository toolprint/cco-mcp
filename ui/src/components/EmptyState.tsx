import React from "react";
import { FileSearch, Shield, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

interface EmptyStateProps {
  hasFilters: boolean;
  onClearFilters?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  hasFilters,
  onClearFilters,
}) => {
  return (
    <div className="relative py-16">
      {/* Blueprint grid background pattern */}
      <div className="absolute inset-0 bg-blueprint-dots opacity-5" />

      <div className="relative text-center">
        <div
          className={cn(
            "mx-auto w-20 h-20 flex items-center justify-center rounded-full mb-6",
            "bg-gradient-to-br from-blueprint-100 to-blueprint-200",
            "dark:from-blueprint-900/30 dark:to-blueprint-800/30",
            "border-2 border-blueprint-300 dark:border-blueprint-700"
          )}
        >
          {hasFilters ? (
            <FileSearch className="h-10 w-10 text-blueprint-600 dark:text-blueprint-400" />
          ) : (
            <Shield className="h-10 w-10 text-blueprint-600 dark:text-blueprint-400" />
          )}
        </div>

        <h3 className="text-xl font-semibold text-slate-800 dark:text-white mb-3">
          {hasFilters ? "No results found" : "No audit log entries yet"}
        </h3>

        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto mb-6">
          {hasFilters
            ? "Try adjusting your filters or search query to find what you're looking for."
            : "Tool approval requests will appear here when agents request permissions."}
        </p>

        {hasFilters && onClearFilters ? (
          <Button
            onClick={onClearFilters}
            variant="blueprint"
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Clear all filters
          </Button>
        ) : (
          !hasFilters && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm text-slate-600 dark:text-slate-400">
              <Shield className="h-4 w-4" />
              <span>Monitoring for incoming requests...</span>
            </div>
          )
        )}
      </div>
    </div>
  );
};
