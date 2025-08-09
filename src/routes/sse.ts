import { Router, Request, Response } from "express";
import { getAuditLogService } from "./audit.js";
import logger from "../logger.js";
import { AuditLogEntry, AuditLogEvent } from "../audit/types.js";
import { getConfigurationService } from "../services/ConfigurationService.js";
import { getHookEventService } from "../services/HookEventService.js";
import { HookServiceEvent, HookEventType } from "../types/hooks.js";

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

    // Send initial connection message with configuration status
    const configService = getConfigurationService();
    const config = configService.getConfig();

    res.write("event: connected\n");
    res.write(
      `data: ${JSON.stringify({
        message: "Connected to audit log stream",
        autoApproval: {
          enabled: configService.isAutoApprovalEnabled(),
          ruleCount: config.approvals.rules.length,
          activeRuleCount: config.approvals.rules.filter(
            (r) => r.enabled !== false
          ).length,
        },
      })}\n\n`
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
    const onNewEntry = (event: AuditLogEvent) => {
      if (event.type === "new-entry" && matchesFilters(event.entry)) {
        res.write("event: new-entry\n");
        res.write(`data: ${JSON.stringify(event.entry)}\n\n`);
      }
    };

    const onStateChange = (event: AuditLogEvent) => {
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

    const onEntryExpired = (event: AuditLogEvent) => {
      if (event.type === "entry-expired" && matchesFilters(event.entry)) {
        res.write("event: entry-expired\n");
        res.write(`data: ${JSON.stringify(event.entry)}\n\n`);
      }
    };

    // Configuration update handler
    const onConfigUpdate = () => {
      const updatedConfig = configService.getConfig();
      res.write("event: config-update\n");
      res.write(
        `data: ${JSON.stringify({
          autoApproval: {
            enabled: configService.isAutoApprovalEnabled(),
            ruleCount: updatedConfig.approvals.rules.length,
            activeRuleCount: updatedConfig.approvals.rules.filter(
              (r) => r.enabled !== false
            ).length,
          },
        })}\n\n`
      );
    };

    // Register event listeners
    auditService.on("new-entry", onNewEntry);
    auditService.on("state-change", onStateChange);
    auditService.on("entry-expired", onEntryExpired);
    configService.on("config-updated", onConfigUpdate);

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
      configService.removeListener("config-updated", onConfigUpdate);
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

  // SSE endpoint for real-time hook events
  router.get("/hooks/stream", (req: Request, res: Response) => {
    // Set headers for SSE
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Extract filter parameters
    const filters = {
      type: req.query.type as string | undefined,
      sessionId: req.query.sessionId as string | undefined,
      agentIdentity: req.query.agentIdentity as string | undefined,
      toolName: req.query.toolName as string | undefined,
    };

    logger.info(
      {
        clientIp: req.ip,
        filters,
        userAgent: req.headers["user-agent"],
      },
      "Hook events SSE client connected"
    );

    // Send initial connection message
    const configService = getConfigurationService();
    const hookService = getHookEventService();

    res.write("event: connected\n");
    res.write(
      `data: ${JSON.stringify({
        message: "Connected to hook events stream",
        autoApproval: {
          enabled: configService.isAutoApprovalEnabled(),
        },
      })}\n\n`
    );

    // Keep connection alive with periodic heartbeat
    const heartbeat = setInterval(() => {
      res.write("event: heartbeat\n");
      res.write(
        `data: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`
      );
    }, 30000); // 30 seconds

    // Helper function to check if a hook event matches filters
    const matchesFilters = (event: any): boolean => {
      if (filters.type && event.type !== filters.type) return false;
      if (filters.sessionId && event.sessionId !== filters.sessionId)
        return false;
      if (
        filters.agentIdentity &&
        event.agentIdentity !== filters.agentIdentity
      )
        return false;
      if (
        filters.toolName &&
        "tool" in event &&
        event.tool?.name !== filters.toolName
      )
        return false;
      return true;
    };

    // Hook event handlers
    const onNewHookEvent = (serviceEvent: HookServiceEvent) => {
      if (
        serviceEvent.type === "new-hook-event" &&
        serviceEvent.event &&
        matchesFilters(serviceEvent.event)
      ) {
        res.write("event: new-hook-event\n");
        res.write(`data: ${JSON.stringify(serviceEvent.event)}\n\n`);
      }
    };

    const onHookEvaluation = (serviceEvent: HookServiceEvent) => {
      if (
        serviceEvent.type === "hook-evaluation" &&
        serviceEvent.event &&
        matchesFilters(serviceEvent.event)
      ) {
        res.write("event: hook-evaluation\n");
        res.write(
          `data: ${JSON.stringify({
            event: serviceEvent.event,
            evaluation: serviceEvent.evaluation,
          })}\n\n`
        );
      }
    };

    const onHookCleanup = (serviceEvent: HookServiceEvent) => {
      if (serviceEvent.type === "hook-cleanup") {
        res.write("event: hook-cleanup\n");
        res.write(
          `data: ${JSON.stringify({
            cleanedCount: serviceEvent.cleanedCount,
          })}\n\n`
        );
      }
    };

    // Configuration update handler (reuse from audit log)
    const onConfigUpdate = () => {
      const updatedConfig = configService.getConfig();
      res.write("event: config-update\n");
      res.write(
        `data: ${JSON.stringify({
          autoApproval: {
            enabled: configService.isAutoApprovalEnabled(),
            ruleCount: updatedConfig.approvals.rules.length,
            activeRuleCount: updatedConfig.approvals.rules.filter(
              (r) => r.enabled !== false
            ).length,
          },
        })}\n\n`
      );
    };

    // Register event listeners
    hookService.on("new-hook-event", onNewHookEvent);
    hookService.on("hook-evaluation", onHookEvaluation);
    hookService.on("hook-cleanup", onHookCleanup);
    configService.on("config-updated", onConfigUpdate);

    // Handle client disconnect
    req.on("close", () => {
      logger.info(
        {
          clientIp: req.ip,
          filters,
        },
        "Hook events SSE client disconnected"
      );

      // Cleanup
      clearInterval(heartbeat);
      hookService.removeListener("new-hook-event", onNewHookEvent);
      hookService.removeListener("hook-evaluation", onHookEvaluation);
      hookService.removeListener("hook-cleanup", onHookCleanup);
      configService.removeListener("config-updated", onConfigUpdate);
    });

    // Handle errors
    req.on("error", (error) => {
      logger.error(
        {
          error,
          clientIp: req.ip,
        },
        "Hook events SSE connection error"
      );

      // Cleanup on error
      clearInterval(heartbeat);
      hookService.removeListener("new-hook-event", onNewHookEvent);
      hookService.removeListener("hook-evaluation", onHookEvaluation);
      hookService.removeListener("hook-cleanup", onHookCleanup);
      configService.removeListener("config-updated", onConfigUpdate);
    });
  });

  return router;
}
