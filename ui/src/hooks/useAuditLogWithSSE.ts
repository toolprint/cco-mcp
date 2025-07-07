import { useState, useEffect, useCallback } from "react";
import type {
  AuditLogEntry,
  AuditLogQueryParams,
  AuditLogQueryResponse,
} from "../types/audit";
import { useSSE } from "./useSSE";

export function useAuditLogWithSSE(params: AuditLogQueryParams = {}) {
  const [data, setData] = useState<AuditLogQueryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();

      if (params.state) queryParams.append("state", params.state);
      if (params.agent_identity)
        queryParams.append("agent_identity", params.agent_identity);
      if (params.search) queryParams.append("search", params.search);
      if (params.offset !== undefined)
        queryParams.append("offset", params.offset.toString());
      if (params.limit !== undefined)
        queryParams.append("limit", params.limit.toString());

      const response = await fetch(`/api/audit-log?${queryParams}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [
    params.state,
    params.agent_identity,
    params.search,
    params.offset,
    params.limit,
  ]);

  const approve = useCallback(async (id: string) => {
    try {
      console.log("Approving entry:", id);
      const response = await fetch(`/api/audit-log/${id}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log("Approve response:", result);

      // The SSE will handle the update, no need to refetch
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve entry");
    }
  }, []);

  const deny = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/audit-log/${id}/deny`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // The SSE will handle the update, no need to refetch
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deny entry");
    }
  }, []);

  // SSE event handlers
  const handleNewEntry = useCallback(
    (entry: AuditLogEntry) => {
      setData((prev) => {
        if (!prev) return null;

        // Check if entry matches current filters
        if (params.state && entry.state !== params.state) return prev;
        if (
          params.agent_identity &&
          entry.agent_identity !== params.agent_identity
        )
          return prev;

        // Add new entry to the beginning of the list
        const newEntries = [entry, ...prev.entries];

        // Maintain limit if specified
        if (params.limit) {
          newEntries.splice(params.limit);
        }

        return {
          ...prev,
          entries: newEntries,
          total: prev.total + 1,
        };
      });
    },
    [params.state, params.agent_identity, params.limit]
  );

  const handleStateChange = useCallback(
    (updatedEntry: AuditLogEntry, previousState?: string) => {
      console.log("SSE state-change received:", {
        updatedEntry,
        previousState,
      });
      setData((prev) => {
        if (!prev) return null;

        const entries = prev.entries.map((entry) =>
          entry.id === updatedEntry.id ? updatedEntry : entry
        );

        // If the updated entry no longer matches the filter, remove it
        if (params.state && updatedEntry.state !== params.state) {
          const filteredEntries = entries.filter(
            (e) => e.id !== updatedEntry.id
          );
          return {
            ...prev,
            entries: filteredEntries,
            total: prev.total - 1,
          };
        }

        return {
          ...prev,
          entries,
        };
      });
    },
    [params.state]
  );

  const handleEntryExpired = useCallback((expiredEntry: AuditLogEntry) => {
    setData((prev) => {
      if (!prev) return null;

      const entries = prev.entries.filter(
        (entry) => entry.id !== expiredEntry.id
      );

      return {
        ...prev,
        entries,
        total: prev.total - 1,
      };
    });
  }, []);

  // Connect to SSE
  const { isConnected } = useSSE({
    onNewEntry: handleNewEntry,
    onStateChange: handleStateChange,
    onEntryExpired: handleEntryExpired,
    filters: {
      state: params.state,
      agent_identity: params.agent_identity,
    },
  });

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    entries: data?.entries || [],
    total: data?.total || 0,
    hasMore: data?.hasMore || false,
    loading,
    error,
    refetch: fetchData,
    approve,
    deny,
    isConnected,
  };
}
