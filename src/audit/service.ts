import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import {
  AuditLogEntry,
  AuditLogState,
  AuditLogFilter,
  AuditLogQueryResult,
  AuditLogConfig,
  AuditLogEvent,
} from "./types.js";
import { IAuditLogService } from "./interface.js";
import {
  DEFAULT_MAX_ENTRIES,
  DEFAULT_TTL_MS,
  DEFAULT_AUTO_DENY_TIMEOUT_MS,
  CLEANUP_INTERVAL_MS,
  MIN_TTL_MS,
  MAX_TTL_MS,
} from "./constants.js";
import { LRUCache } from "./lru-cache.js";
import logger from "../logger.js";

/**
 * In-memory audit log service implementation
 * Provides thread-safe storage with TTL and LRU eviction
 */
export class AuditLogService extends EventEmitter implements IAuditLogService {
  private storage: LRUCache<string, AuditLogEntry>;
  private config: Required<AuditLogConfig>;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private autoDenyTimers: Map<string, NodeJS.Timeout> = new Map();
  private stopped = false;

  constructor(config?: AuditLogConfig) {
    super();

    // Validate and set configuration
    this.config = {
      maxEntries: config?.maxEntries ?? DEFAULT_MAX_ENTRIES,
      ttlMs: config?.ttlMs ?? DEFAULT_TTL_MS,
      autoDenyTimeoutMs:
        config?.autoDenyTimeoutMs ?? DEFAULT_AUTO_DENY_TIMEOUT_MS,
    };

    // Validate TTL
    if (this.config.ttlMs < MIN_TTL_MS || this.config.ttlMs > MAX_TTL_MS) {
      throw new Error(
        `TTL must be between ${MIN_TTL_MS}ms and ${MAX_TTL_MS}ms`
      );
    }

    // Initialize storage
    this.storage = new LRUCache<string, AuditLogEntry>(this.config.maxEntries);

    // Start cleanup timer
    this.startCleanupTimer();

    logger.info({ config: this.config }, "AuditLogService initialized");
  }

  async addEntry(
    toolName: string,
    toolInput: Record<string, any>,
    agentIdentity?: string
  ): Promise<AuditLogEntry> {
    if (this.stopped) {
      throw new Error("AuditLogService has been stopped");
    }

    const now = new Date();
    const entry: AuditLogEntry = {
      id: uuidv4(),
      timestamp: now,
      tool_name: toolName,
      tool_input: toolInput,
      agent_identity: agentIdentity,
      state: "NEEDS_REVIEW",
      expires_at: new Date(now.getTime() + this.config.ttlMs),
    };

    // Add to storage (LRU will handle eviction if needed)
    const evicted = this.storage.set(entry.id, entry);
    if (evicted) {
      logger.debug(
        { evictedId: evicted.id },
        "Entry evicted due to capacity limit"
      );
      this.cancelAutoDenyTimer(evicted.id);
    }

    // Set up auto-deny timer
    this.setupAutoDenyTimer(entry);

    // Emit event
    this.emit("new-entry", { type: "new-entry", entry });

    logger.info({ entryId: entry.id, toolName }, "New audit log entry added");
    return entry;
  }

  async getEntry(id: string): Promise<AuditLogEntry | null> {
    const entry = this.storage.get(id);
    if (!entry) {
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.storage.delete(id);
      this.cancelAutoDenyTimer(id);
      return null;
    }

    return entry;
  }

  async updateEntry(
    id: string,
    state: AuditLogState,
    decisionBy?: string
  ): Promise<AuditLogEntry | null> {
    if (this.stopped) {
      throw new Error("AuditLogService has been stopped");
    }

    const entry = await this.getEntry(id);
    if (!entry) {
      return null;
    }

    // Can't update if already decided
    if (entry.state !== "NEEDS_REVIEW") {
      logger.warn(
        { entryId: id, currentState: entry.state },
        "Cannot update already decided entry"
      );
      return entry;
    }

    const previousState = entry.state;
    entry.state = state;
    entry.decision_by = decisionBy;
    entry.decision_time = new Date();

    // Update in storage
    this.storage.set(id, entry);

    // Cancel auto-deny timer
    this.cancelAutoDenyTimer(id);

    // Emit event
    this.emit("state-change", {
      type: "state-change",
      entry,
      previousState,
    });

    logger.info(
      {
        entryId: id,
        previousState,
        newState: state,
        decisionBy,
      },
      "Audit log entry updated"
    );

    return entry;
  }

  async queryEntries(filter?: AuditLogFilter): Promise<AuditLogQueryResult> {
    const allEntries = await this.getAllEntries();

    // Apply filters
    let filtered = allEntries;

    if (filter?.state) {
      filtered = filtered.filter((e) => e.state === filter.state);
    }

    if (filter?.agent_identity) {
      filtered = filtered.filter(
        (e) => e.agent_identity === filter.agent_identity
      );
    }

    if (filter?.search) {
      const searchLower = filter.search.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.tool_name.toLowerCase().includes(searchLower) ||
          JSON.stringify(e.tool_input).toLowerCase().includes(searchLower)
      );
    }

    // Apply pagination
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 100;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      entries: paginated,
      total: filtered.length,
      offset,
      limit,
    };
  }

  async getAllEntries(): Promise<AuditLogEntry[]> {
    // Get all entries from storage (already in LRU order)
    const entries = this.storage.values();

    // Filter out expired entries
    const validEntries = entries.filter((entry) => {
      if (this.isExpired(entry)) {
        this.storage.delete(entry.id);
        this.cancelAutoDenyTimer(entry.id);
        return false;
      }
      return true;
    });

    return validEntries;
  }

  async deleteEntry(id: string): Promise<boolean> {
    const deleted = this.storage.delete(id);
    if (deleted) {
      this.cancelAutoDenyTimer(id);
      logger.info({ entryId: id }, "Audit log entry deleted");
    }
    return deleted;
  }

  async cleanup(): Promise<number> {
    let removed = 0;
    const entries = this.storage.entries();

    for (const [id, entry] of entries) {
      if (this.isExpired(entry)) {
        this.storage.delete(id);
        this.cancelAutoDenyTimer(id);
        this.emit("entry-expired", { type: "entry-expired", entry });
        removed++;
      }
    }

    if (removed > 0) {
      logger.info({ removedCount: removed }, "Cleaned up expired entries");
    }

    return removed;
  }

  async stop(): Promise<void> {
    this.stopped = true;

    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Cancel all auto-deny timers
    for (const timer of this.autoDenyTimers.values()) {
      clearTimeout(timer);
    }
    this.autoDenyTimers.clear();

    // Clear storage
    this.storage.clear();

    // Remove all listeners
    this.removeAllListeners();

    logger.info("AuditLogService stopped");
  }

  async getStats(): Promise<{
    totalEntries: number;
    entriesByState: Record<AuditLogState, number>;
    oldestEntry?: Date;
    newestEntry?: Date;
  }> {
    const entries = await this.getAllEntries();

    const entriesByState: Record<AuditLogState, number> = {
      APPROVED: 0,
      DENIED: 0,
      NEEDS_REVIEW: 0,
    };

    let oldestEntry: Date | undefined;
    let newestEntry: Date | undefined;

    for (const entry of entries) {
      entriesByState[entry.state]++;

      if (!oldestEntry || entry.timestamp < oldestEntry) {
        oldestEntry = entry.timestamp;
      }
      if (!newestEntry || entry.timestamp > newestEntry) {
        newestEntry = entry.timestamp;
      }
    }

    return {
      totalEntries: entries.length,
      entriesByState,
      oldestEntry,
      newestEntry,
    };
  }

  /**
   * Check if an entry has expired
   */
  private isExpired(entry: AuditLogEntry): boolean {
    return new Date() > entry.expires_at;
  }

  /**
   * Start the periodic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch((err) => {
        logger.error({ error: err }, "Error during cleanup");
      });
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Set up auto-deny timer for an entry
   */
  private setupAutoDenyTimer(entry: AuditLogEntry): void {
    if (entry.state !== "NEEDS_REVIEW") {
      return;
    }

    const timer = setTimeout(() => {
      this.autoDenyEntry(entry.id).catch((err) => {
        logger.error(
          { error: err, entryId: entry.id },
          "Error during auto-deny"
        );
      });
    }, this.config.autoDenyTimeoutMs);

    this.autoDenyTimers.set(entry.id, timer);
  }

  /**
   * Cancel auto-deny timer for an entry
   */
  private cancelAutoDenyTimer(id: string): void {
    const timer = this.autoDenyTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.autoDenyTimers.delete(id);
    }
  }

  /**
   * Auto-deny an entry due to timeout
   */
  private async autoDenyEntry(id: string): Promise<void> {
    const entry = await this.getEntry(id);
    if (!entry || entry.state !== "NEEDS_REVIEW") {
      return;
    }

    entry.state = "DENIED";
    entry.denied_by_timeout = true;
    entry.decision_time = new Date();

    this.storage.set(id, entry);
    this.autoDenyTimers.delete(id);

    this.emit("state-change", {
      type: "state-change",
      entry,
      previousState: "NEEDS_REVIEW",
    });

    logger.info({ entryId: id }, "Entry auto-denied due to timeout");
  }
}

/**
 * Factory function to create an audit log service instance
 */
export function createAuditLogService(
  config?: AuditLogConfig
): IAuditLogService {
  return new AuditLogService(config);
}
