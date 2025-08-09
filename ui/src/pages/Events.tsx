import { useState, useEffect } from 'react';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { JsonViewer } from '../components/ui/json-viewer';
import { Skeleton } from '../components/ui/skeleton';
import { Header } from '../components/layout/header';
import { Navigation } from '../components/layout/navigation';
import { useHookEvents, useHookEventSSE, useHookEventStats } from '../hooks/useHookEvents';
import type { HookEventType, StoredHookEvent, HookEventFilters } from '../types/hooks';
// Removed date-fns import to avoid adding new dependencies

// Color mapping for event types
const EVENT_TYPE_COLORS: Record<HookEventType, string> = {
  PreToolUse: 'bg-blue-100 text-blue-800 border-blue-200',
  PostToolUse: 'bg-green-100 text-green-800 border-green-200',
  Notification: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  Stop: 'bg-red-100 text-red-800 border-red-200',
  SubagentStop: 'bg-red-100 text-red-800 border-red-200',
  UserPromptSubmit: 'bg-purple-100 text-purple-800 border-purple-200',
  PreCompact: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  SessionStart: 'bg-teal-100 text-teal-800 border-teal-200',
};

// Evaluation result colors
const EVALUATION_COLORS = {
  allow: 'bg-green-100 text-green-800 border-green-200',
  deny: 'bg-red-100 text-red-800 border-red-200',
  ask: 'bg-amber-100 text-amber-800 border-amber-200',
};

interface EventFiltersProps {
  filters: HookEventFilters;
  onFiltersChange: (filters: HookEventFilters) => void;
  onClearFilters: () => void;
}

function EventFilters({ filters, onFiltersChange, onClearFilters }: EventFiltersProps) {
  const eventTypes: HookEventType[] = [
    'PreToolUse', 
    'PostToolUse', 
    'Notification', 
    'Stop', 
    'SubagentStop',
    'UserPromptSubmit',
    'PreCompact',
    'SessionStart'
  ];

  return (
    <Card className="p-4 mb-6">
      <h3 className="text-lg font-medium mb-4">Filters</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Event Type
          </label>
          <Select
            value={filters.type as string || ''}
            onChange={(e) => {
              const value = e.target.value;
              onFiltersChange({ ...filters, type: value === '' ? undefined : value as HookEventType });
            }}
          >
            <option value="">All Types</option>
            {eventTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Session ID
          </label>
          <Input
            type="text"
            placeholder="Enter session ID"
            value={filters.sessionId || ''}
            onChange={(e) => onFiltersChange({ ...filters, sessionId: e.target.value || undefined })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Agent Identity
          </label>
          <Input
            type="text"
            placeholder="Enter agent identity"
            value={filters.agentIdentity || ''}
            onChange={(e) => onFiltersChange({ ...filters, agentIdentity: e.target.value || undefined })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tool Name
          </label>
          <Input
            type="text"
            placeholder="Enter tool name"
            value={filters.toolName || ''}
            onChange={(e) => onFiltersChange({ ...filters, toolName: e.target.value || undefined })}
          />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          onClick={onClearFilters}
          variant="secondary"
          size="sm"
        >
          Clear Filters
        </Button>
      </div>
    </Card>
  );
}

interface EventItemProps {
  event: StoredHookEvent;
}

function EventItem({ event }: EventItemProps) {
  const [expanded, setExpanded] = useState(false);

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      
      if (diffMinutes < 1) return 'just now';
      if (diffMinutes < 60) return `${diffMinutes}m ago`;
      if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
      return `${Math.floor(diffMinutes / 1440)}d ago`;
    } catch {
      return new Date(timestamp).toLocaleString();
    }
  };

  const getEventIcon = (type: HookEventType) => {
    switch (type) {
      case 'PreToolUse':
        return '🔍';
      case 'PostToolUse':
        return '✅';
      case 'Notification':
        return '💬';
      case 'Stop':
        return '🛑';
      case 'SubagentStop':
        return '⏹️';
      case 'UserPromptSubmit':
        return '💭';
      case 'PreCompact':
        return '📦';
      case 'SessionStart':
        return '🚀';
      default:
        return '📝';
    }
  };

  return (
    <Card className="p-4 mb-3">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          <span className="text-2xl">{getEventIcon(event.type)}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={EVENT_TYPE_COLORS[event.type]}>
                {event.type}
              </Badge>
              {event.evaluation && (
                <Badge className={EVALUATION_COLORS[event.evaluation.behavior]}>
                  {event.evaluation.behavior}
                </Badge>
              )}
              <span className="text-sm text-gray-500">
                {formatTimestamp(event.receivedAt)}
              </span>
            </div>

            <div className="space-y-1 text-sm">
              <div><strong>Session:</strong> <code className="text-xs">{event.sessionId}</code></div>
              
              {event.tool_name && (
                <div><strong>Tool:</strong> {event.tool_name}</div>
              )}
              
              {event.message && (
                <div><strong>Message:</strong> {event.message}</div>
              )}
              
              {event.reason && (
                <div><strong>Reason:</strong> {event.reason}</div>
              )}
              
              {event.prompt && (
                <div><strong>Prompt:</strong> {event.prompt}</div>
              )}
              
              {event.trigger && (
                <div><strong>Trigger:</strong> {event.trigger}</div>
              )}
              
              {event.source && (
                <div><strong>Source:</strong> {event.source}</div>
              )}
              
              {event.stop_hook_active !== undefined && (
                <div><strong>Stop Hook Active:</strong> {event.stop_hook_active ? 'Yes' : 'No'}</div>
              )}
              
              {event.agentIdentity && (
                <div><strong>Agent:</strong> {event.agentIdentity}</div>
              )}
              
              {event.duration && (
                <div><strong>Duration:</strong> {event.duration}ms</div>
              )}
              
              {event.evaluation && (
                <div className="mt-2 p-2 bg-gray-50 rounded">
                  <div><strong>Evaluation:</strong> {event.evaluation.behavior}</div>
                  {event.evaluation.message && (
                    <div><strong>Message:</strong> {event.evaluation.message}</div>
                  )}
                  {event.evaluation.ruleName && (
                    <div><strong>Rule:</strong> {event.evaluation.ruleName}</div>
                  )}
                  <div><strong>Time:</strong> {event.evaluation.evaluationTime}ms</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <Button
          onClick={() => setExpanded(!expanded)}
          variant="secondary"
          size="sm"
        >
          {expanded ? 'Hide Details' : 'Show Details'}
        </Button>
      </div>

      {expanded && (
        <div className="mt-4 border-t pt-4">
          <h4 className="font-medium mb-2">Raw Event Data</h4>
          <JsonViewer data={event} />
        </div>
      )}
    </Card>
  );
}

interface EventStatsProps {
  stats: any;
}

function EventStats({ stats }: EventStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card className="p-4">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Total Events</h3>
        <p className="text-3xl font-bold text-blue-600">{stats.totalEvents}</p>
      </Card>

      <Card className="p-4">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Evaluations</h3>
        <p className="text-lg">
          <span className="text-green-600 font-semibold">{stats.evaluationStats.allowed}</span>
          {' / '}
          <span className="text-red-600 font-semibold">{stats.evaluationStats.denied}</span>
        </p>
        <p className="text-sm text-gray-500">Allowed / Denied</p>
      </Card>

      <Card className="p-4">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Avg Evaluation Time</h3>
        <p className="text-2xl font-bold text-purple-600">
          {stats.evaluationStats.avgEvaluationTime.toFixed(1)}ms
        </p>
      </Card>

      <Card className="p-4">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Event Types</h3>
        <div className="space-y-1 text-sm">
          {Object.entries(stats.eventsByType).map(([type, count]) => (
            <div key={type} className="flex justify-between">
              <span>{type}:</span>
              <span className="font-semibold">{count as number}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function Events() {
  const [filters, setFilters] = useState<HookEventFilters>({
    limit: 50,
    offset: 0,
  });
  const [useRealTime, setUseRealTime] = useState(true);
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    // Check API health
    fetch("/health")
      .then((res) => {
        const healthy = res.ok;
        setIsHealthy(healthy);
      })
      .catch(() => {
        setIsHealthy(false);
      });
  }, []);

  const { data: queryData, loading: queryLoading, error: queryError, refetch } = useHookEvents(filters);
  const { events: sseEvents, connected: sseConnected, error: sseError } = useHookEventSSE(useRealTime ? filters : undefined);
  const { stats, loading: statsLoading } = useHookEventStats();

  // Use SSE events if real-time is enabled and connected, otherwise use query data
  const events = useRealTime && sseConnected ? sseEvents : queryData?.events || [];
  const loading = useRealTime ? false : queryLoading;
  const error = useRealTime ? sseError : queryError;

  const clearFilters = () => {
    setFilters({
      limit: 50,
      offset: 0,
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Header isHealthy={isHealthy} />
      <Navigation />
      <main className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Hook Events</h1>
          <p className="text-gray-600 mt-1">
            Real-time monitoring of Claude Code hook events
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="realtime"
              checked={useRealTime}
              onChange={(e) => setUseRealTime(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="realtime" className="text-sm font-medium text-gray-700">
              Real-time updates
            </label>
            {useRealTime && (
              <Badge className={sseConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                {sseConnected ? 'Connected' : 'Disconnected'}
              </Badge>
            )}
          </div>
          
          {!useRealTime && (
            <Button onClick={refetch} variant="secondary">
              Refresh
            </Button>
          )}
        </div>
      </div>

      {stats && !statsLoading && <EventStats stats={stats} />}

      <EventFilters
        filters={filters}
        onFiltersChange={setFilters}
        onClearFilters={clearFilters}
      />

      {error && (
        <Card className="p-4 mb-6 bg-red-50 border-red-200">
          <p className="text-red-800">Error loading hook events: {error}</p>
        </Card>
      )}

      <div className="space-y-4">
        {loading && (
          <>
            {[...Array(5)].map((_, i) => (
              <Card key={i} className="p-4">
                <div className="flex items-start space-x-3">
                  <Skeleton className="w-8 h-8 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-48" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                </div>
              </Card>
            ))}
          </>
        )}

        {!loading && events.length === 0 && (
          <Card className="p-8 text-center">
            <div className="text-6xl mb-4">📡</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Hook Events</h3>
            <p className="text-gray-600">
              No hook events match your current filters. Try adjusting your filters or check that Claude Code hooks are configured.
            </p>
          </Card>
        )}

        {!loading && events.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing {events.length} events
                {useRealTime && sseConnected && ' (live updates)'}
              </p>
            </div>

            {events.map((event) => (
              <EventItem key={event.id} event={event} />
            ))}
          </>
        )}
      </div>
      </main>
    </div>
  );
}