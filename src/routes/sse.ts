import { Router, Request, Response } from "express";
import { getAuditLogService } from "./audit.js";
import logger from "../logger.js";
import { AuditLogEntry, AuditEvent } from "../audit/types.js";

export function createSSERoutes(): Router {
  const router = Router();

  // SSE endpoint for real-time audit log updates
  router.get("/audit-log/stream", (req: Request, res: Response) => {
    // Set headers for SSE
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Extract filter parameters
    const filters = {
      state: req.query.state as string | undefined,
      agent_identity: req.query.agent_identity as string | undefined,
      tool_name: req.query.tool_name as string | undefined,
    };

    logger.info(
      {
        clientIp: req.ip,
        filters,
        userAgent: req.headers["user-agent"],
      },
      "SSE client connected"
    );

    // Send initial connection message
    res.write("event: connected\n");
    res.write(
      `data: ${JSON.stringify({ message: "Connected to audit log stream" })}\n\n`
    );

    // Keep connection alive with periodic heartbeat
    const heartbeat = setInterval(() => {
      res.write("event: heartbeat\n");
      res.write(
        `data: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`
      );
    }, 30000); // 30 seconds

    // Get audit log service
    const auditService = getAuditLogService();

    // Helper function to check if an entry matches filters
    const matchesFilters = (entry: AuditLogEntry): boolean => {
      if (filters.state && entry.state !== filters.state) return false;
      if (
        filters.agent_identity &&
        entry.agent_identity !== filters.agent_identity
      )
        return false;
      if (filters.tool_name && entry.tool_name !== filters.tool_name)
        return false;
      return true;
    };

    // Event handlers
    const onNewEntry = (event: AuditEvent) => {
      if (event.type === "new-entry" && matchesFilters(event.entry)) {
        res.write("event: new-entry\n");
        res.write(`data: ${JSON.stringify(event.entry)}\n\n`);
      }
    };

    const onStateChange = (event: AuditEvent) => {
      if (event.type === "state-change" && matchesFilters(event.entry)) {
        res.write("event: state-change\n");
        res.write(
          `data: ${JSON.stringify({
            entry: event.entry,
            previousState: event.previousState,
          })}\n\n`
        );
      }
    };

    const onEntryExpired = (event: AuditEvent) => {
      if (event.type === "entry-expired" && matchesFilters(event.entry)) {
        res.write("event: entry-expired\n");
        res.write(`data: ${JSON.stringify(event.entry)}\n\n`);
      }
    };

    // Register event listeners
    auditService.on("new-entry", onNewEntry);
    auditService.on("state-change", onStateChange);
    auditService.on("entry-expired", onEntryExpired);

    // Handle client disconnect
    req.on("close", () => {
      logger.info(
        {
          clientIp: req.ip,
          filters,
        },
        "SSE client disconnected"
      );

      // Cleanup
      clearInterval(heartbeat);
      auditService.removeListener("new-entry", onNewEntry);
      auditService.removeListener("state-change", onStateChange);
      auditService.removeListener("entry-expired", onEntryExpired);
    });

    // Handle errors
    req.on("error", (error) => {
      logger.error(
        {
          error,
          clientIp: req.ip,
        },
        "SSE connection error"
      );

      // Cleanup on error
      clearInterval(heartbeat);
      auditService.removeListener("new-entry", onNewEntry);
      auditService.removeListener("state-change", onStateChange);
      auditService.removeListener("entry-expired", onEntryExpired);
    });
  });

  return router;
}
