import { useState, useEffect, useCallback } from 'react';
import type { HookEventFilters, HookEventQueryResult, HookEventStats } from '../types/hooks';

const API_BASE = '/api/hooks';

export function useHookEvents(filters?: HookEventFilters) {
  const [data, setData] = useState<HookEventQueryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filters?.type) {
        if (Array.isArray(filters.type)) {
          params.append('type', filters.type.join(','));
        } else {
          params.append('type', filters.type);
        }
      }
      if (filters?.sessionId) params.append('sessionId', filters.sessionId);
      if (filters?.agentIdentity) params.append('agentIdentity', filters.agentIdentity);
      if (filters?.toolName) params.append('toolName', filters.toolName);
      if (filters?.since) params.append('since', filters.since);
      if (filters?.before) params.append('before', filters.before);
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.offset) params.append('offset', filters.offset.toString());

      const response = await fetch(`${API_BASE}/events?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch hook events: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const refetch = useCallback(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { data, loading, error, refetch };
}

export function useHookEventStats() {
  const [stats, setStats] = useState<HookEventStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/stats`);
      if (!response.ok) {
        throw new Error(`Failed to fetch hook event stats: ${response.statusText}`);
      }

      const result = await response.json();
      setStats(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const refetch = useCallback(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch };
}

export function useHookEventSSE(filters?: HookEventFilters) {
  const [events, setEvents] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters?.type) {
      if (Array.isArray(filters.type)) {
        params.append('type', filters.type.join(','));
      } else {
        params.append('type', filters.type);
      }
    }
    if (filters?.sessionId) params.append('sessionId', filters.sessionId);
    if (filters?.agentIdentity) params.append('agentIdentity', filters.agentIdentity);
    if (filters?.toolName) params.append('toolName', filters.toolName);

    const eventSource = new EventSource(`/api/hooks/stream?${params}`);
    
    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
    };

    eventSource.addEventListener('connected', (event) => {
      console.log('Hook events SSE connected:', JSON.parse(event.data));
    });

    eventSource.addEventListener('new-hook-event', (event) => {
      const hookEvent = JSON.parse(event.data);
      setEvents(prev => [hookEvent, ...prev.slice(0, 99)]); // Keep last 100 events
    });

    eventSource.addEventListener('hook-evaluation', (event) => {
      const data = JSON.parse(event.data);
      // Update the existing event with evaluation data
      setEvents(prev => prev.map(event => 
        event.id === data.event.id ? data.event : event
      ));
    });

    eventSource.addEventListener('hook-cleanup', (event) => {
      const data = JSON.parse(event.data);
      console.log('Hook events cleaned up:', data.cleanedCount);
    });

    eventSource.onerror = (event) => {
      setConnected(false);
      setError('SSE connection error');
      console.error('Hook events SSE error:', event);
    };

    return () => {
      eventSource.close();
      setConnected(false);
    };
  }, [filters]);

  return { events, connected, error };
}