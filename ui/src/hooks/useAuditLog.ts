import { useState, useEffect, useCallback } from "react";
import type {
  AuditLogQueryParams,
  AuditLogQueryResponse,
} from "../types/audit";

export function useAuditLog(params: AuditLogQueryParams = {}) {
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

  const approve = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/audit-log/${id}/approve`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Refresh the data after approval
        await fetchData();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to approve entry"
        );
      }
    },
    [fetchData]
  );

  const deny = useCallback(
    async (id: string) => {
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

        // Refresh the data after denial
        await fetchData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to deny entry");
      }
    },
    [fetchData]
  );

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
  };
}
