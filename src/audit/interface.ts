import { EventEmitter } from 'events';
import { 
  AuditLogEntry, 
  AuditLogState, 
  AuditLogFilter, 
  AuditLogQueryResult,
  AuditLogEvent,
  AuditLogEventType
} from './types.js';

/**
 * Interface for the audit log service
 */
export interface IAuditLogService extends EventEmitter {
  /**
   * Add a new audit log entry
   * @param toolName Name of the tool requesting approval
   * @param toolInput Input parameters for the tool
   * @param agentIdentity Identity of the requesting agent (optional)
   * @returns The created audit log entry
   */
  addEntry(
    toolName: string, 
    toolInput: Record<string, any>, 
    agentIdentity?: string
  ): Promise<AuditLogEntry>;

  /**
   * Get a specific audit log entry by ID
   * @param id The entry ID
   * @returns The audit log entry, or null if not found
   */
  getEntry(id: string): Promise<AuditLogEntry | null>;

  /**
   * Update the state of an audit log entry
   * @param id The entry ID
   * @param state The new state
   * @param decisionBy Identity of who made the decision (optional)
   * @returns The updated entry, or null if not found
   */
  updateEntry(
    id: string, 
    state: AuditLogState, 
    decisionBy?: string
  ): Promise<AuditLogEntry | null>;

  /**
   * Query audit log entries with filtering and pagination
   * @param filter Filter options
   * @returns Paginated query result
   */
  queryEntries(filter?: AuditLogFilter): Promise<AuditLogQueryResult>;

  /**
   * Get all audit log entries (unfiltered)
   * @returns Array of all entries
   */
  getAllEntries(): Promise<AuditLogEntry[]>;

  /**
   * Delete a specific audit log entry
   * @param id The entry ID
   * @returns True if deleted, false if not found
   */
  deleteEntry(id: string): Promise<boolean>;

  /**
   * Manually trigger cleanup of expired entries
   * @returns Number of entries removed
   */
  cleanup(): Promise<number>;

  /**
   * Stop the service and clean up resources
   */
  stop(): Promise<void>;

  /**
   * Get current statistics about the audit log
   */
  getStats(): Promise<{
    totalEntries: number;
    entriesByState: Record<AuditLogState, number>;
    oldestEntry?: Date;
    newestEntry?: Date;
  }>;

  /**
   * Event emitter methods (inherited from EventEmitter)
   * Events:
   * - 'new-entry': Emitted when a new entry is added
   * - 'state-change': Emitted when an entry's state changes
   * - 'entry-expired': Emitted when an entry expires
   */
  on(event: AuditLogEventType, listener: (data: AuditLogEvent) => void): this;
  off(event: AuditLogEventType, listener: (data: AuditLogEvent) => void): this;
  emit(event: AuditLogEventType, data: AuditLogEvent): boolean;
}

/**
 * Factory function type for creating audit log service instances
 */
export type AuditLogServiceFactory = (config?: {
  maxEntries?: number;
  ttlMs?: number;
  autoDenyTimeoutMs?: number;
}) => IAuditLogService;