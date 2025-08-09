/**
 * Hook Event Service for managing Claude Code hook events
 */

import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import logger from "../logger.js";
import {
  HookEvent,
  HookEventType,
  StoredHookEvent,
  HookEventFilters,
  HookEventQueryResult,
  BlockingResponse,
  HookEvaluationResult,
  HookServiceEvent,
} from "../types/hooks.js";
import { LRUCache } from "../audit/lru-cache.js";
import {
  ConfigurationService,
  getConfigurationService,
  ToolCallInfo,
} from "./ConfigurationService.js";

/**
 * Configuration for hook event service
 */
export interface HookEventServiceConfig {
  /** Maximum number of events to store (default: 2000) */
  maxEvents?: number;
  
  /** Time-to-live for events in milliseconds (default: 7 days) */
  ttlMs?: number;
  
  /** Cleanup interval in milliseconds (default: 1 hour) */
  cleanupIntervalMs?: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<HookEventServiceConfig> = {
  maxEvents: 2000,
  ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
};

/**
 * Service for managing hook events with in-memory storage and rule evaluation
 */
export class HookEventService extends EventEmitter {
  private storage: LRUCache<string, StoredHookEvent>;
  private config: Required<HookEventServiceConfig>;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private configService: ConfigurationService;
  private stopped = false;

  constructor(config?: HookEventServiceConfig, configService?: ConfigurationService) {
    super();

    this.config = {
      maxEvents: config?.maxEvents ?? DEFAULT_CONFIG.maxEvents,
      ttlMs: config?.ttlMs ?? DEFAULT_CONFIG.ttlMs,
      cleanupIntervalMs: config?.cleanupIntervalMs ?? DEFAULT_CONFIG.cleanupIntervalMs,
    };

    this.configService = configService || getConfigurationService();
    this.storage = new LRUCache<string, StoredHookEvent>(this.config.maxEvents);

    // Start cleanup timer
    this.startCleanupTimer();

    logger.info({ config: this.config }, "HookEventService initialized");
  }

  /**
   * Add a new hook event and evaluate it if it's a PreToolUse event
   */
  async addEvent(event: HookEvent): Promise<StoredHookEvent> {
    if (this.stopped) {
      throw new Error("HookEventService has been stopped");
    }

    const now = new Date();
    const storedEvent: StoredHookEvent = {
      id: uuidv4(),
      receivedAt: now,
      expiresAt: new Date(now.getTime() + this.config.ttlMs),
      type: event.hook_event_name,
      sessionId: event.session_id,
      timestamp: now.toISOString(), // Generate timestamp since Claude Code doesn't provide one
      tool_name: event.tool_name,
      tool_input: event.tool_input,
      tool_response: event.tool_response,
      message: event.message,
      reason: undefined, // Claude Code doesn't have reason field
      transcript_path: event.transcript_path,
      cwd: event.cwd,
      prompt: event.prompt,
      trigger: event.trigger,
      custom_instructions: event.custom_instructions,
      source: event.source,
      stop_hook_active: event.stop_hook_active,
    };

    // Evaluate PreToolUse events
    if (event.hook_event_name === 'PreToolUse') {
      const evaluation = await this.evaluatePreToolUse(event);
      storedEvent.evaluation = evaluation;
    }

    // Add to storage (LRU will handle eviction if needed)
    const evicted = this.storage.set(storedEvent.id, storedEvent);
    if (evicted) {
      logger.debug(
        { evictedId: evicted.id, eventType: evicted.type },
        "Hook event evicted due to capacity limit"
      );
    }

    // Emit events
    this.emit("new-hook-event", { type: "new-hook-event", event: storedEvent });

    if (storedEvent.evaluation) {
      this.emit("hook-evaluation", {
        type: "hook-evaluation",
        event: storedEvent,
        evaluation: storedEvent.evaluation,
      });
    }

    logger.info(
      {
        eventId: storedEvent.id,
        eventType: event.type,
        sessionId: event.sessionId,
        evaluation: storedEvent.evaluation?.behavior,
      },
      "New hook event added"
    );

    return storedEvent;
  }

  /**
   * Get a hook event by ID
   */
  async getEvent(id: string): Promise<StoredHookEvent | null> {
    const event = this.storage.get(id);
    if (!event) {
      return null;
    }

    // Check if expired
    if (this.isExpired(event)) {
      this.storage.delete(id);
      return null;
    }

    return event;
  }

  /**
   * Query hook events with filters
   */
  async queryEvents(filters?: HookEventFilters): Promise<HookEventQueryResult> {
    const allEvents = await this.getAllEvents();

    // Apply filters
    let filtered = allEvents;

    if (filters?.type) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      filtered = filtered.filter((event) => types.includes(event.type));
    }

    if (filters?.sessionId) {
      filtered = filtered.filter((event) => event.sessionId === filters.sessionId);
    }

    if (filters?.agentIdentity) {
      filtered = filtered.filter((event) => {
        return 'agentIdentity' in event && event.agentIdentity === filters.agentIdentity;
      });
    }

    if (filters?.toolName) {
      filtered = filtered.filter((event) => {
        return 'tool' in event && event.tool.name === filters.toolName;
      });
    }

    if (filters?.since) {
      const since = new Date(filters.since);
      filtered = filtered.filter((event) => event.receivedAt >= since);
    }

    if (filters?.before) {
      const before = new Date(filters.before);
      filtered = filtered.filter((event) => event.receivedAt <= before);
    }

    // Sort by received time (newest first)
    filtered.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

    // Apply pagination
    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 100;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      events: paginated,
      total: filtered.length,
      offset,
      limit,
    };
  }

  /**
   * Get all non-expired events
   */
  async getAllEvents(): Promise<StoredHookEvent[]> {
    const events = this.storage.values();

    // Filter out expired events
    const validEvents = events.filter((event) => {
      if (this.isExpired(event)) {
        this.storage.delete(event.id);
        return false;
      }
      return true;
    });

    return validEvents;
  }

  /**
   * Evaluate a PreToolUse event against configured rules
   */
  async evaluatePreToolUse(event: HookEvent): Promise<HookEvaluationResult> {
    const startTime = Date.now();

    try {
      // Convert hook event to tool call info
      const toolCall: ToolCallInfo = {
        toolName: event.tool_name || 'Unknown',
        agentIdentity: undefined, // Claude Code doesn't provide agent identity
        input: event.tool_input || {},
      };

      // Get action from configuration service
      const { action, rule } = this.configService.getActionForToolCall(toolCall);

      const evaluationTime = Date.now() - startTime;

      let behavior: 'allow' | 'deny' | 'ask';
      let message: string | undefined;

      switch (action) {
        case 'approve':
          behavior = 'allow';
          message = rule ? `Allowed by rule: ${rule.name}` : 'Allowed by default action';
          break;
        case 'deny':
          behavior = 'deny';
          message = rule ? `Denied by rule: ${rule.name}` : 'Denied by default action';
          break;
        case 'review':
          // Now properly support 'ask' behavior for interactive review
          behavior = 'ask';
          message = rule ? `Manual approval required (rule: ${rule.name})` : 'Manual approval required by default action';
          break;
        default:
          behavior = 'allow';
          message = 'Unknown action, defaulting to allow';
      }

      logger.debug(
        {
          toolName: event.tool.name,
          action,
          ruleName: rule?.name,
          behavior,
          evaluationTime,
        },
        "PreToolUse event evaluated"
      );

      return {
        behavior,
        message,
        ruleId: rule?.id,
        ruleName: rule?.name,
        evaluationTime,
      };
    } catch (error) {
      const evaluationTime = Date.now() - startTime;
      logger.error(
        {
          error,
          toolName: event.tool.name,
          evaluationTime,
        },
        "Error evaluating PreToolUse event"
      );

      return {
        behavior: 'allow',
        message: 'Evaluation error, defaulting to allow',
        evaluationTime,
      };
    }
  }

  /**
   * Get evaluation result for a PreToolUse event (for external blocking response)
   */
  getBlockingResponse(event: HookEvent): Promise<BlockingResponse> {
    return this.evaluatePreToolUse(event).then((result) => ({
      behavior: result.behavior,
      message: result.message,
    }));
  }

  /**
   * Cleanup expired events
   */
  async cleanup(): Promise<number> {
    let removed = 0;
    const events = this.storage.entries();

    for (const [id, event] of events) {
      if (this.isExpired(event)) {
        this.storage.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info({ removedCount: removed }, "Cleaned up expired hook events");
      this.emit("hook-cleanup", { type: "hook-cleanup", cleanedCount: removed });
    }

    return removed;
  }

  /**
   * Get statistics about stored events
   */
  async getStats(): Promise<{
    totalEvents: number;
    eventsByType: Record<HookEventType, number>;
    evaluationStats: {
      totalEvaluated: number;
      allowed: number;
      denied: number;
      avgEvaluationTime: number;
    };
    oldestEvent?: Date;
    newestEvent?: Date;
  }> {
    const events = await this.getAllEvents();

    const eventsByType: Record<HookEventType, number> = {
      PreToolUse: 0,
      PostToolUse: 0,
      Notification: 0,
      Stop: 0,
      SubagentStop: 0,
    };

    let totalEvaluated = 0;
    let allowed = 0;
    let denied = 0;
    let totalEvaluationTime = 0;
    let oldestEvent: Date | undefined;
    let newestEvent: Date | undefined;

    for (const event of events) {
      eventsByType[event.type]++;

      if (event.evaluation) {
        totalEvaluated++;
        totalEvaluationTime += event.evaluation.evaluationTime;
        
        if (event.evaluation.behavior === 'allow') {
          allowed++;
        } else {
          denied++;
        }
      }

      if (!oldestEvent || event.receivedAt < oldestEvent) {
        oldestEvent = event.receivedAt;
      }
      if (!newestEvent || event.receivedAt > newestEvent) {
        newestEvent = event.receivedAt;
      }
    }

    return {
      totalEvents: events.length,
      eventsByType,
      evaluationStats: {
        totalEvaluated,
        allowed,
        denied,
        avgEvaluationTime: totalEvaluated > 0 ? totalEvaluationTime / totalEvaluated : 0,
      },
      oldestEvent,
      newestEvent,
    };
  }

  /**
   * Stop the service
   */
  async stop(): Promise<void> {
    this.stopped = true;

    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Clear storage
    this.storage.clear();

    // Remove all listeners
    this.removeAllListeners();

    logger.info("HookEventService stopped");
  }

  /**
   * Check if an event has expired
   */
  private isExpired(event: StoredHookEvent): boolean {
    return new Date() > event.expiresAt;
  }

  /**
   * Start the periodic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch((err) => {
        logger.error({ error: err }, "Error during hook event cleanup");
      });
    }, this.config.cleanupIntervalMs);
  }
}

// Singleton instance
let hookEventService: HookEventService | null = null;

/**
 * Get or create the hook event service instance
 */
export function getHookEventService(): HookEventService {
  if (!hookEventService) {
    hookEventService = new HookEventService();
  }
  return hookEventService;
}

/**
 * Stop the hook event service
 */
export function stopHookEventService(): void {
  if (hookEventService) {
    hookEventService.stop();
    hookEventService = null;
  }
}