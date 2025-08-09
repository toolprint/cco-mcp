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
import { IAuditLogService } from "../audit/interface.js";
import { getAuditLogService } from "../routes/audit.js";
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
  private auditService: IAuditLogService;
  private stopped = false;

  constructor(
    config?: HookEventServiceConfig,
    configService?: ConfigurationService,
    auditService?: IAuditLogService
  ) {
    super();

    this.config = {
      maxEvents: config?.maxEvents ?? DEFAULT_CONFIG.maxEvents,
      ttlMs: config?.ttlMs ?? DEFAULT_CONFIG.ttlMs,
      cleanupIntervalMs:
        config?.cleanupIntervalMs ?? DEFAULT_CONFIG.cleanupIntervalMs,
    };

    this.configService = configService || getConfigurationService();
    this.auditService = auditService || getAuditLogService();
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

    // Evaluate PreToolUse events and create audit entries
    if (event.hook_event_name === "PreToolUse") {
      try {
        // Create audit entry for unified tracking
        const auditEntry = await this.auditService.addEntry(
          event.tool_name || "Unknown",
          event.tool_input || {},
          "claude-code-hook" // Special identifier for hook events
        );

        storedEvent.auditEntryId = auditEntry.id;

        // Add unified audit metadata
        (auditEntry as any).source = "hook";
        (auditEntry as any).hookEventId = storedEvent.id;
        (auditEntry as any).sessionId = event.session_id;

        logger.debug(
          {
            hookEventId: storedEvent.id,
            auditEntryId: auditEntry.id,
            toolName: event.tool_name,
          },
          "Created audit entry for hook event"
        );
      } catch (error) {
        logger.error(
          { error, eventId: storedEvent.id },
          "Failed to create audit entry for hook event"
        );
        // Continue processing even if audit entry fails
      }

      const evaluation = await this.evaluatePreToolUse(event);
      storedEvent.evaluation = evaluation;

      // Update audit entry based on evaluation result
      if (storedEvent.auditEntryId) {
        await this.updateAuditEntryFromEvaluation(
          storedEvent.auditEntryId,
          evaluation
        );
      }
    }

    // Handle PostToolUse events for 'ask' inference
    if (event.hook_event_name === "PostToolUse") {
      try {
        // Find matching PreToolUse event
        const preToolEvent = await this.findRecentPreToolUse(
          event.session_id,
          event.tool_name
        );

        if (
          preToolEvent?.evaluation?.behavior === "ask" &&
          preToolEvent.auditEntryId
        ) {
          // Tool executed after 'ask' = user approved in Claude Code UI
          await this.auditService.updateEntry(
            preToolEvent.auditEntryId,
            "APPROVED",
            "user:claude-code-ui-inferred"
          );

          // Add metadata about inference
          try {
            const auditEntry = await this.auditService.getEntry(
              preToolEvent.auditEntryId
            );
            if (auditEntry) {
              (auditEntry as any).metadata = {
                ...(auditEntry as any).metadata,
                inferredDecision: true,
                inferenceMethod: "post-tool-use",
                waitingForUserResponse: false,
              };
            }
          } catch (error) {
            logger.error(
              { error },
              "Failed to update metadata for inferred approval"
            );
          }

          logger.info(
            {
              postToolEventId: storedEvent.id,
              preToolEventId: preToolEvent.id,
              auditEntryId: preToolEvent.auditEntryId,
              toolName: event.tool_name,
              sessionId: event.session_id,
            },
            "Inferred user approval from PostToolUse after 'ask'"
          );
        }
      } catch (error) {
        logger.error(
          { error, eventId: storedEvent.id },
          "Failed to process PostToolUse correlation"
        );
      }
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
      filtered = filtered.filter(
        (event) => event.sessionId === filters.sessionId
      );
    }

    if (filters?.agentIdentity) {
      filtered = filtered.filter((event) => {
        return (
          "agentIdentity" in event &&
          event.agentIdentity === filters.agentIdentity
        );
      });
    }

    if (filters?.toolName) {
      filtered = filtered.filter((event) => {
        return event.tool_name === filters.toolName;
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
  async evaluateBlockingEvent(event: HookEvent): Promise<HookEvaluationResult> {
    const startTime = Date.now();

    try {
      logger.debug(
        {
          eventType: event.hook_event_name,
          toolName: event.tool_name,
          sessionId: event.session_id,
          hasConfigService: !!this.configService,
        },
        "Starting blocking event evaluation"
      );

      // Handle different blocking event types
      switch (event.hook_event_name) {
        case "PreToolUse":
          return await this.evaluatePreToolUseEvent(event, startTime);
        case "UserPromptSubmit":
          return await this.evaluateUserPromptSubmitEvent(event, startTime);
        case "Stop":
        case "SubagentStop":
          return await this.evaluateStopEvent(event, startTime);
        case "PreCompact":
          return await this.evaluatePreCompactEvent(event, startTime);
        default:
          logger.warn(
            { eventType: event.hook_event_name },
            "Unknown blocking event type, defaulting to allow"
          );
          return {
            behavior: "allow",
            message: `Unknown event type: ${event.hook_event_name}, defaulting to allow`,
            evaluationTime: Date.now() - startTime,
          };
      }
    } catch (error) {
      const evaluationTime = Date.now() - startTime;

      // Enhanced error logging with detailed information
      const errorInfo = {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : typeof error,
        eventData: {
          hook_event_name: event.hook_event_name,
          tool_name: event.tool_name || "Unknown",
          session_id: event.session_id,
          hasToolInput: !!event.tool_input,
        },
        configState: {
          configServiceExists: !!this.configService,
          auditServiceExists: !!this.auditService,
        },
        evaluationTime,
      };

      logger.error(
        {
          error: error instanceof Error ? error : new Error(String(error)),
          errorInfo,
        },
        "Error evaluating blocking event - detailed diagnostics"
      );

      return {
        behavior: "allow",
        message: `Evaluation error (${error instanceof Error ? error.message : String(error)}), defaulting to allow`,
        evaluationTime,
      };
    }
  }

  /**
   * Evaluate PreToolUse events using configuration rules
   */
  private async evaluatePreToolUseEvent(
    event: HookEvent,
    startTime: number
  ): Promise<HookEvaluationResult> {
    // Ensure required fields are present
    if (!event.tool_name) {
      logger.warn(
        { event },
        "PreToolUse event missing tool_name, using 'Unknown'"
      );
    }

    // Convert hook event to tool call info
    const toolCall: ToolCallInfo = {
      toolName: event.tool_name || "Unknown",
      agentIdentity: undefined, // Claude Code doesn't provide agent identity
      input: event.tool_input || {},
    };

    logger.debug({ toolCall }, "Converted hook event to tool call info");

    // Get action from configuration service
    logger.debug("Calling configService.getActionForToolCall");
    const { action, rule } = this.configService.getActionForToolCall(toolCall);

    logger.debug(
      { action, ruleName: rule?.name, ruleId: rule?.id },
      "Received action from configuration service"
    );

    const evaluationTime = Date.now() - startTime;

    let behavior: "allow" | "deny" | "ask";
    let message: string | undefined;

    switch (action) {
      case "approve":
        behavior = "allow";
        message = rule
          ? `Allowed by rule: ${rule.name}`
          : "Allowed by default action";
        break;
      case "deny":
        behavior = "deny";
        message = rule
          ? `Denied by rule: ${rule.name}`
          : "Denied by default action";
        break;
      case "review":
        // Now properly support 'ask' behavior for interactive review
        behavior = "ask";
        message = rule
          ? `Manual approval required (rule: ${rule.name})`
          : "Manual approval required by default action";
        break;
      default:
        behavior = "allow";
        message = "Unknown action, defaulting to allow";
    }

    logger.debug(
      {
        toolName: event.tool_name || "Unknown",
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
  }

  /**
   * Evaluate UserPromptSubmit events
   */
  private async evaluateUserPromptSubmitEvent(
    event: HookEvent,
    startTime: number
  ): Promise<HookEvaluationResult> {
    const evaluationTime = Date.now() - startTime;

    // For now, UserPromptSubmit events are always allowed
    // This could be extended with prompt-based rules in the future
    logger.debug(
      { prompt: event.prompt ? "present" : "missing" },
      "UserPromptSubmit event evaluated"
    );

    return {
      behavior: "allow",
      message: "User prompt submission allowed",
      evaluationTime,
    };
  }

  /**
   * Evaluate Stop and SubagentStop events
   */
  private async evaluateStopEvent(
    event: HookEvent,
    startTime: number
  ): Promise<HookEvaluationResult> {
    const evaluationTime = Date.now() - startTime;

    // For now, Stop events are always allowed
    // This could be extended with stop-specific rules in the future
    logger.debug(
      {
        eventType: event.hook_event_name,
        stopHookActive: event.stop_hook_active,
      },
      "Stop event evaluated"
    );

    return {
      behavior: "allow",
      message: `${event.hook_event_name} event allowed`,
      evaluationTime,
    };
  }

  /**
   * Evaluate PreCompact events
   */
  private async evaluatePreCompactEvent(
    event: HookEvent,
    startTime: number
  ): Promise<HookEvaluationResult> {
    const evaluationTime = Date.now() - startTime;

    // For now, PreCompact events are always allowed
    // This could be extended with compact-specific rules in the future
    logger.debug({ trigger: event.trigger }, "PreCompact event evaluated");

    return {
      behavior: "allow",
      message: "PreCompact event allowed",
      evaluationTime,
    };
  }

  /**
   * Get evaluation result for a PreToolUse event (for external blocking response)
   */
  getBlockingResponse(event: HookEvent): Promise<BlockingResponse> {
    return this.evaluateBlockingEvent(event).then((result) => ({
      behavior: result.behavior,
      message: result.message,
    }));
  }

  /**
   * Cleanup expired events and handle unresolved 'ask' decisions
   */
  async cleanup(): Promise<number> {
    let removed = 0;
    let inferredDenials = 0;
    const now = Date.now();
    const askTimeoutMs = 5 * 60 * 1000; // 5 minutes timeout for 'ask' decisions
    const events = this.storage.entries();

    for (const [id, event] of events) {
      // Remove expired events
      if (this.isExpired(event)) {
        this.storage.delete(id);
        removed++;
        continue;
      }

      // Handle unresolved 'ask' decisions
      if (
        event.type === "PreToolUse" &&
        event.evaluation?.behavior === "ask" &&
        event.auditEntryId &&
        now - event.receivedAt.getTime() > askTimeoutMs
      ) {
        try {
          // Check if audit entry is still in NEEDS_REVIEW state
          const auditEntry = await this.auditService.getEntry(
            event.auditEntryId
          );
          if (auditEntry && auditEntry.state === "NEEDS_REVIEW") {
            // No PostToolUse after timeout = likely denied by user
            await this.auditService.updateEntry(
              event.auditEntryId,
              "DENIED",
              "inferred:timeout-no-execution"
            );

            // Update metadata
            (auditEntry as any).metadata = {
              ...(auditEntry as any).metadata,
              inferredDecision: true,
              inferenceMethod: "timeout-no-execution",
              waitingForUserResponse: false,
            };

            inferredDenials++;
            logger.info(
              {
                eventId: event.id,
                auditEntryId: event.auditEntryId,
                toolName: event.tool_name,
                ageMs: now - event.receivedAt.getTime(),
              },
              "Inferred denial for unresolved 'ask' decision after timeout"
            );
          }
        } catch (error) {
          logger.error(
            { error, eventId: event.id },
            "Failed to update audit entry for unresolved 'ask'"
          );
        }
      }
    }

    if (removed > 0 || inferredDenials > 0) {
      logger.info(
        { removedCount: removed, inferredDenials },
        "Cleaned up hook events"
      );
      this.emit("hook-cleanup", {
        type: "hook-cleanup",
        cleanedCount: removed,
        inferredDenials,
      });
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
      UserPromptSubmit: 0,
      PreCompact: 0,
      SessionStart: 0,
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

        if (event.evaluation.behavior === "allow") {
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
        avgEvaluationTime:
          totalEvaluated > 0 ? totalEvaluationTime / totalEvaluated : 0,
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

  /**
   * Find a recent PreToolUse event for correlation
   */
  private async findRecentPreToolUse(
    sessionId: string,
    toolName?: string,
    maxAgeMs: number = 30000 // 30 seconds default
  ): Promise<StoredHookEvent | null> {
    const now = Date.now();
    const events = this.storage.values();

    // Find the most recent matching PreToolUse event
    const matches = events
      .filter(
        (event) =>
          event.type === "PreToolUse" &&
          event.sessionId === sessionId &&
          (!toolName || event.tool_name === toolName) &&
          now - event.receivedAt.getTime() <= maxAgeMs
      )
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

    return matches[0] || null;
  }

  /**
   * Update audit entry based on hook evaluation result
   */
  private async updateAuditEntryFromEvaluation(
    auditEntryId: string,
    evaluation: HookEvaluationResult
  ): Promise<void> {
    try {
      let state: "APPROVED" | "DENIED" | "NEEDS_REVIEW";
      let decisionBy: string;

      switch (evaluation.behavior) {
        case "allow":
          state = "APPROVED";
          decisionBy = evaluation.ruleName
            ? `rule:${evaluation.ruleId}`
            : "config:default-approve";
          break;

        case "deny":
          state = "DENIED";
          decisionBy = evaluation.ruleName
            ? `rule:${evaluation.ruleId}`
            : "config:default-deny";
          break;

        case "ask":
          // Leave in NEEDS_REVIEW state for manual decision
          // We'll track the user's response via PostToolUse inference
          try {
            const auditEntry = await this.auditService.getEntry(auditEntryId);
            if (auditEntry) {
              (auditEntry as any).metadata = {
                waitingForUserResponse: true,
                askMessage: evaluation.message,
              };
            }
          } catch (error) {
            logger.error(
              { error, auditEntryId },
              "Failed to add metadata to audit entry"
            );
          }

          logger.debug(
            { auditEntryId, behavior: "ask" },
            "Audit entry left in NEEDS_REVIEW for user decision"
          );
          return; // Don't update state
      }

      await this.auditService.updateEntry(auditEntryId, state, decisionBy);

      logger.debug(
        {
          auditEntryId,
          state,
          decisionBy,
          behavior: evaluation.behavior,
        },
        "Updated audit entry from hook evaluation"
      );
    } catch (error) {
      logger.error(
        { error, auditEntryId },
        "Failed to update audit entry from evaluation"
      );
    }
  }
}

// Singleton instance
let hookEventService: HookEventService | null = null;

/**
 * Get or create the hook event service instance
 */
export function getHookEventService(): HookEventService {
  if (!hookEventService) {
    hookEventService = new HookEventService(
      undefined, // default config
      undefined, // default config service
      getAuditLogService() // pass audit service
    );
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
