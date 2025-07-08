import { useEffect, useRef, useCallback, useState } from "react";
import type { AuditLogEntry } from "../types/audit";

export interface SSEEvent {
  type: "new-entry" | "state-change" | "entry-expired";
  entry: AuditLogEntry;
  previousState?: string;
}

interface UseSSEOptions {
  onNewEntry?: (entry: AuditLogEntry) => void;
  onStateChange?: (entry: AuditLogEntry, previousState?: string) => void;
  onEntryExpired?: (entry: AuditLogEntry) => void;
  filters?: {
    state?: string;
    agent_identity?: string;
    tool_name?: string;
  };
}

export function useSSE({
  onNewEntry,
  onStateChange,
  onEntryExpired,
  filters = {},
}: UseSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Build query string from filters
    const params = new URLSearchParams();
    if (filters.state) params.append("state", filters.state);
    if (filters.agent_identity)
      params.append("agent_identity", filters.agent_identity);
    if (filters.tool_name) params.append("tool_name", filters.tool_name);

    const url = `/api/audit-log/stream${params.toString() ? `?${params}` : ""}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log("SSE connection opened");
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    eventSource.addEventListener("connected", () => {
      console.log("SSE connected");
      reconnectAttemptsRef.current = 0;
      setIsConnected(true);
    });

    eventSource.addEventListener("new-entry", (event) => {
      try {
        const entry = JSON.parse(event.data) as AuditLogEntry;
        onNewEntry?.(entry);
      } catch (error) {
        console.error("Failed to parse new-entry event:", error);
      }
    });

    eventSource.addEventListener("state-change", (event) => {
      try {
        console.log("SSE state-change event received:", event.data);
        const data = JSON.parse(event.data) as {
          entry: AuditLogEntry;
          previousState?: string;
        };
        onStateChange?.(data.entry, data.previousState);
      } catch (error) {
        console.error("Failed to parse state-change event:", error);
      }
    });

    eventSource.addEventListener("entry-expired", (event) => {
      try {
        const entry = JSON.parse(event.data) as AuditLogEntry;
        onEntryExpired?.(entry);
      } catch (error) {
        console.error("Failed to parse entry-expired event:", error);
      }
    });

    eventSource.addEventListener("heartbeat", () => {
      // Heartbeat received, connection is alive
    });

    eventSource.onerror = () => {
      console.error("SSE connection error");
      setIsConnected(false);
      eventSource.close();
      eventSourceRef.current = null;

      // Implement exponential backoff for reconnection
      const attempts = reconnectAttemptsRef.current;
      const delay = Math.min(1000 * Math.pow(2, attempts), 30000); // Max 30s
      reconnectAttemptsRef.current += 1;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      reconnectTimeoutRef.current = setTimeout(() => {
        console.log(`Attempting to reconnect (attempt ${attempts + 1})...`);
        connect();
      }, delay);
    };
  }, [
    filters.state,
    filters.agent_identity,
    filters.tool_name,
    onNewEntry,
    onStateChange,
    onEntryExpired,
  ]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    setIsConnected(false);
  }, []);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  return {
    isConnected,
    reconnect: connect,
    disconnect,
  };
}
