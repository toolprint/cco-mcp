import { Router, Request, Response } from "express";
import {
  createAuditLogService,
  IAuditLogService,
  AuditLogFilter,
} from "../audit/index.js";
import { validateAuditLogQuery } from "./validation.js";
import logger from "../logger.js";
import { getConfigurationService } from "../services/ConfigurationService.js";

// Create a singleton instance of the audit log service
let auditLogService: IAuditLogService | null = null;

/**
 * Get or create the audit log service instance
 */
export function getAuditLogService(): IAuditLogService {
  if (!auditLogService) {
    auditLogService = createAuditLogService();
    logger.info("Audit log service initialized");
  }
  return auditLogService;
}

/**
 * Create audit routes
 */
export function createAuditRoutes(): Router {
  const router = Router();

  /**
   * Middleware to extract user identity from request
   * Looks for user information in headers or JWT token
   */
  function extractUserIdentity(req: Request): string | undefined {
    // Check for user header (often set by API gateways)
    const userHeader = req.headers["x-user-id"] || req.headers["x-user-email"];
    if (userHeader && typeof userHeader === "string") {
      return userHeader;
    }

    // Check for JWT token (would need proper JWT validation in production)
    const authHeader = req.headers.authorization;
    if (
      authHeader &&
      typeof authHeader === "string" &&
      authHeader.startsWith("Bearer ")
    ) {
      // In production, decode and validate JWT token here
      // For now, just extract a basic identifier
      const token = authHeader.substring(7);
      // This is a placeholder - in production, properly decode JWT
      return `jwt-user-${token.substring(0, 8)}`;
    }

    // Default to IP address if no other identity found
    return req.ip || "unknown";
  }

  /**
   * GET /api/audit-log
   * Fetch audit log entries with optional filtering, search, and pagination
   *
   * Query parameters:
   * - state: Filter by state (APPROVED, DENIED, NEEDS_REVIEW)
   * - agent_identity: Filter by agent identity
   * - search: Free-text search across tool name and input
   * - offset: Pagination offset (default: 0)
   * - limit: Number of entries to return (default: 100, max: 1000)
   */
  router.get("/audit-log", async (req: Request, res: Response) => {
    try {
      // Validate query parameters
      const validation = validateAuditLogQuery(req.query);
      if (!validation.success) {
        return res.status(400).json({
          error: validation.error,
        });
      }

      const { state, agent_identity, search, offset, limit } = validation.data;

      // Build filter object for the service
      const filter: AuditLogFilter = {
        state,
        agent_identity,
        search,
        offset,
        limit,
      };

      // Get the service and query entries
      const service = getAuditLogService();
      const result = await service.queryEntries(filter);

      // Format response
      res.status(200).json({
        entries: result.entries,
        total: result.total,
        offset: result.offset,
        limit: result.limit,
        hasMore: result.offset + result.limit < result.total,
      });
    } catch (error) {
      logger.error({ error }, "Error fetching audit log entries");
      res.status(500).json({
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/audit-log/:id
   * Get a specific audit log entry by ID
   */
  router.get("/audit-log/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Get the service
      const service = getAuditLogService();

      // Get the entry
      const entry = await service.getEntry(id);
      if (!entry) {
        return res.status(404).json({
          error: "Audit log entry not found",
        });
      }

      res.status(200).json({ entry });
    } catch (error) {
      logger.error(
        { error, entryId: req.params.id },
        "Error fetching audit log entry"
      );
      res.status(500).json({
        error: "Internal server error",
      });
    }
  });

  /**
   * POST /api/audit-log/:id/approve
   * Approve a tool call request that's in NEEDS_REVIEW state
   */
  router.post("/audit-log/:id/approve", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const decisionBy = extractUserIdentity(req);

      // Get the service
      const service = getAuditLogService();

      // First check if entry exists and is in correct state
      const entry = await service.getEntry(id);
      if (!entry) {
        return res.status(404).json({
          error: "Audit log entry not found",
        });
      }

      // Check if already decided (idempotency)
      if (entry.state === "APPROVED") {
        // Already approved - return success for idempotency
        return res.status(200).json({
          entry,
          message: "Entry already approved",
        });
      }

      if (entry.state !== "NEEDS_REVIEW") {
        return res.status(400).json({
          error: `Cannot approve entry in ${entry.state} state`,
          currentState: entry.state,
        });
      }

      // Update the entry
      const updatedEntry = await service.updateEntry(
        id,
        "APPROVED",
        decisionBy
      );
      if (!updatedEntry) {
        // This shouldn't happen as we just checked it exists
        return res.status(500).json({
          error: "Failed to update entry",
        });
      }

      logger.info(
        {
          entryId: id,
          decisionBy,
          toolName: updatedEntry.tool_name,
        },
        "Audit log entry approved"
      );

      res.status(200).json({ entry: updatedEntry });
    } catch (error) {
      logger.error(
        { error, entryId: req.params.id },
        "Error approving audit log entry"
      );
      res.status(500).json({
        error: "Internal server error",
      });
    }
  });

  /**
   * GET /api/audit-log/status
   * Get the current audit log configuration status
   */
  router.get("/audit-log/status", async (req: Request, res: Response) => {
    try {
      const configService = getConfigurationService();
      const status = {
        autoApprove: configService.isAutoApprovalEnabled(),
        approvalTimeoutMs: configService.getTimeoutMs(),
      };

      res.status(200).json(status);
    } catch (error) {
      logger.error({ error }, "Error getting audit log status");
      res.status(500).json({
        error: "Internal server error",
      });
    }
  });

  /**
   * POST /api/audit-log/:id/deny
   * Deny a tool call request that's in NEEDS_REVIEW state
   */
  router.post("/audit-log/:id/deny", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const decisionBy = extractUserIdentity(req);

      // Get the service
      const service = getAuditLogService();

      // First check if entry exists and is in correct state
      const entry = await service.getEntry(id);
      if (!entry) {
        return res.status(404).json({
          error: "Audit log entry not found",
        });
      }

      // Check if already decided (idempotency)
      if (entry.state === "DENIED") {
        // Already denied - return success for idempotency
        return res.status(200).json({
          entry,
          message: "Entry already denied",
        });
      }

      if (entry.state !== "NEEDS_REVIEW") {
        return res.status(400).json({
          error: `Cannot deny entry in ${entry.state} state`,
          currentState: entry.state,
        });
      }

      // Update the entry
      const updatedEntry = await service.updateEntry(id, "DENIED", decisionBy);
      if (!updatedEntry) {
        // This shouldn't happen as we just checked it exists
        return res.status(500).json({
          error: "Failed to update entry",
        });
      }

      logger.info(
        {
          entryId: id,
          decisionBy,
          toolName: updatedEntry.tool_name,
        },
        "Audit log entry denied"
      );

      res.status(200).json({ entry: updatedEntry });
    } catch (error) {
      logger.error(
        { error, entryId: req.params.id },
        "Error denying audit log entry"
      );
      res.status(500).json({
        error: "Internal server error",
      });
    }
  });

  return router;
}

/**
 * Cleanup function to stop the audit log service
 */
export async function stopAuditLogService(): Promise<void> {
  if (auditLogService) {
    await auditLogService.stop();
    auditLogService = null;
    logger.info("Audit log service stopped");
  }
}
