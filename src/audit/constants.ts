/**
 * Default configuration values for the audit log service
 */

/** Default maximum number of entries to store */
export const DEFAULT_MAX_ENTRIES = 1000;

/** Default time-to-live for entries (24 hours in milliseconds) */
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** Default timeout for auto-denial (5 minutes in milliseconds) */
export const DEFAULT_AUTO_DENY_TIMEOUT_MS = 5 * 60 * 1000;

/** Cleanup interval for expired entries (1 minute in milliseconds) */
export const CLEANUP_INTERVAL_MS = 60 * 1000;

/** Minimum TTL allowed (1 minute in milliseconds) */
export const MIN_TTL_MS = 60 * 1000;

/** Maximum TTL allowed (7 days in milliseconds) */
export const MAX_TTL_MS = 7 * 24 * 60 * 60 * 1000;