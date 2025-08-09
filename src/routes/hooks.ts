import { Router, Request, Response } from "express";
import { z } from "zod";
import logger from "../logger.js";
import {
  HookEvent,
  HookEventType,
  PreToolUseEvent,
  HookEventFilters,
  BlockingResponse,
} from "../types/hooks.js";
import { getHookEventService } from "../services/HookEventService.js";

// Zod schemas for validation

/**
 * Claude Code's official hook event schema
 */
const hookEventSchema = z
  .object({
    session_id: z.string().min(1).max(255),
    transcript_path: z.string().min(1),
    cwd: z.string().min(1),
    hook_event_name: z.string().min(1),

    // Tool-related fields (for PreToolUse, PostToolUse)
    tool_name: z.string().min(1).max(255).optional(),
    tool_input: z.record(z.any()).optional(),
    tool_response: z.union([z.string(), z.record(z.any())]).optional(),

    // Notification fields
    message: z.string().min(1).max(1000).optional(),

    // Stop/SubagentStop fields
    stop_hook_active: z.boolean().optional(),

    // UserPromptSubmit fields
    prompt: z.string().optional(),

    // PreCompact fields
    trigger: z.string().optional(),
    custom_instructions: z.string().optional(),

    // SessionStart fields
    source: z.string().optional(),
  })
  .refine(
    (data) => {
      // Validate required fields based on event type
      switch (data.hook_event_name) {
        case "PreToolUse":
        case "PostToolUse":
          return data.tool_name !== undefined;
        case "Notification":
          return data.message !== undefined;
        case "UserPromptSubmit":
          return data.prompt !== undefined;
        case "PreCompact":
          return data.trigger !== undefined;
        case "SessionStart":
          return data.source !== undefined;
        case "Stop":
        case "SubagentStop":
          return true; // No additional fields required
        default:
          // Allow unknown event types for forward compatibility
          return true;
      }
    },
    {
      message: "Invalid hook event: missing required fields for event type",
    }
  );

/**
 * Schema for hook event query parameters
 */
const hookEventQuerySchema = z.object({
  type: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      // Handle comma-separated types
      const types = val.split(",").map((t) => t.trim());
      return types.length === 1 ? types[0] : types;
    })
    .refine((val) => {
      if (!val) return true;
      const validTypes = [
        "PreToolUse",
        "PostToolUse",
        "Notification",
        "Stop",
        "SubagentStop",
        "UserPromptSubmit",
        "PreCompact",
        "SessionStart",
      ];
      if (Array.isArray(val)) {
        return val.every((t) => validTypes.includes(t));
      }
      return validTypes.includes(val);
    }, "Invalid event type"),

  sessionId: z.string().min(1).max(255).optional(),
  agentIdentity: z.string().min(1).max(255).optional(),
  toolName: z.string().min(1).max(255).optional(),

  since: z.string().datetime().optional(),
  before: z.string().datetime().optional(),

  offset: z
    .string()
    .regex(/^\d+$/, "Offset must be a positive integer")
    .transform((val) => parseInt(val, 10))
    .refine((val) => val >= 0, "Offset must be non-negative")
    .optional()
    .default("0"),

  limit: z
    .string()
    .regex(/^\d+$/, "Limit must be a positive integer")
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0 && val <= 1000, "Limit must be between 1 and 1000")
    .optional()
    .default("100"),
});

export function createHookRoutes(): Router {
  const router = Router();
  const hookService = getHookEventService();

  /**
   * GET /health - Health check endpoint for hook clients
   */
  router.get("/health", async (req: Request, res: Response) => {
    try {
      const stats = await hookService.getStats();

      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        service: "CCO Hook Service",
        version: process.env.npm_package_version || "0.1.0",
        totalEvents: stats.totalEvents,
        uptime: process.uptime(),
      });
    } catch (error) {
      logger.error({ error }, "Health check failed");
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: "Service unavailable",
      });
    }
  });

  /**
   * POST /event - Receive hook events from bridge
   */
  router.post("/event", async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validation = hookEventSchema.safeParse(req.body);
      if (!validation.success) {
        const errors = validation.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");

        logger.warn(
          {
            body: req.body,
            errors: validation.error.errors,
            clientIp: req.ip,
          },
          "Invalid hook event received"
        );

        return res.status(400).json({
          error: "Invalid hook event",
          details: errors,
        });
      }

      const event = validation.data as HookEvent;

      logger.info(
        {
          eventType: event.hook_event_name,
          sessionId: event.session_id,
          toolName: event.tool_name,
          clientIp: req.ip,
        },
        "Hook event received"
      );

      // Add event to service
      const storedEvent = await hookService.addEvent(event);

      // For blocking events, return blocking response
      const blockingEventTypes = [
        "PreToolUse",
        "UserPromptSubmit",
        "Stop",
        "SubagentStop",
        "PreCompact",
      ];
      if (blockingEventTypes.includes(event.hook_event_name)) {
        const blockingResponse = await hookService.getBlockingResponse(event);

        logger.info(
          {
            eventId: storedEvent.id,
            eventType: event.hook_event_name,
            toolName: event.tool_name,
            behavior: blockingResponse.behavior,
            ruleId: storedEvent.evaluation?.ruleId,
          },
          `${event.hook_event_name} event evaluated with behavior: ${blockingResponse.behavior}`
        );

        return res.json(blockingResponse);
      }

      // For other events, just return success
      res.status(201).json({
        success: true,
        eventId: storedEvent.id,
      });
    } catch (error) {
      logger.error(
        {
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            name: error instanceof Error ? error.name : "UnknownError",
          },
          body: req.body,
          clientIp: req.ip,
        },
        "Error processing hook event"
      );

      // For blocking events, default to allow on error
      const blockingEventTypes = [
        "PreToolUse",
        "UserPromptSubmit",
        "Stop",
        "SubagentStop",
        "PreCompact",
      ];
      if (
        req.body?.hook_event_name &&
        blockingEventTypes.includes(req.body.hook_event_name)
      ) {
        return res.json({
          behavior: "allow",
          message: "Processing error, defaulting to allow",
        } as BlockingResponse);
      }

      res.status(500).json({
        error: "Internal server error",
        message: "Failed to process hook event",
      });
    }
  });

  /**
   * GET /events - List hook events with filters
   */
  router.get("/events", async (req: Request, res: Response) => {
    try {
      // Validate query parameters
      const validation = hookEventQuerySchema.safeParse(req.query);
      if (!validation.success) {
        const errors = validation.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");

        return res.status(400).json({
          error: "Invalid query parameters",
          details: errors,
        });
      }

      const filters: HookEventFilters = {
        type: validation.data.type as HookEventType | HookEventType[],
        sessionId: validation.data.sessionId,
        agentIdentity: validation.data.agentIdentity,
        toolName: validation.data.toolName,
        since: validation.data.since,
        before: validation.data.before,
        offset: validation.data.offset,
        limit: validation.data.limit,
      };

      const result = await hookService.queryEvents(filters);

      logger.debug(
        {
          filters,
          totalResults: result.total,
          returnedResults: result.events.length,
          clientIp: req.ip,
        },
        "Hook events queried"
      );

      res.json(result);
    } catch (error) {
      logger.error(
        {
          error,
          query: req.query,
          clientIp: req.ip,
        },
        "Error querying hook events"
      );

      res.status(500).json({
        error: "Internal server error",
        message: "Failed to query hook events",
      });
    }
  });

  /**
   * GET /stats - Get hook event statistics
   */
  router.get("/stats", async (req: Request, res: Response) => {
    try {
      const stats = await hookService.getStats();

      logger.debug(
        {
          totalEvents: stats.totalEvents,
          clientIp: req.ip,
        },
        "Hook event stats requested"
      );

      res.json(stats);
    } catch (error) {
      logger.error(
        {
          error,
          clientIp: req.ip,
        },
        "Error getting hook event stats"
      );

      res.status(500).json({
        error: "Internal server error",
        message: "Failed to get hook event statistics",
      });
    }
  });

  /**
   * GET /events/:id - Get a specific hook event
   */
  router.get("/events/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!id || typeof id !== "string") {
        return res.status(400).json({
          error: "Invalid event ID",
        });
      }

      const event = await hookService.getEvent(id);

      if (!event) {
        return res.status(404).json({
          error: "Hook event not found",
        });
      }

      logger.debug(
        {
          eventId: id,
          eventType: event.type,
          clientIp: req.ip,
        },
        "Hook event retrieved"
      );

      res.json(event);
    } catch (error) {
      logger.error(
        {
          error,
          eventId: req.params.id,
          clientIp: req.ip,
        },
        "Error getting hook event"
      );

      res.status(500).json({
        error: "Internal server error",
        message: "Failed to get hook event",
      });
    }
  });

  /**
   * POST /cleanup - Manual cleanup of expired events
   */
  router.post("/cleanup", async (req: Request, res: Response) => {
    try {
      const removedCount = await hookService.cleanup();

      logger.info(
        {
          removedCount,
          clientIp: req.ip,
        },
        "Manual hook event cleanup performed"
      );

      res.json({
        success: true,
        removedCount,
      });
    } catch (error) {
      logger.error(
        {
          error,
          clientIp: req.ip,
        },
        "Error during manual hook event cleanup"
      );

      res.status(500).json({
        error: "Internal server error",
        message: "Failed to cleanup hook events",
      });
    }
  });

  /**
   * GET /stream - Server-Sent Events stream for hook events
   */
  router.get("/stream", async (req: Request, res: Response) => {
    try {
      // Validate query parameters for filtering
      const validation = hookEventQuerySchema.safeParse(req.query);
      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid query parameters",
          details: validation.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", "),
        });
      }

      const filters: HookEventFilters = {
        type: validation.data.type as HookEventType | HookEventType[],
        sessionId: validation.data.sessionId,
        agentIdentity: validation.data.agentIdentity,
        toolName: validation.data.toolName,
        since: validation.data.since,
        before: validation.data.before,
      };

      // Set SSE headers
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
      });

      // Send initial connection event
      res.write("event: connected\n");
      res.write(
        `data: ${JSON.stringify({ status: "connected", timestamp: new Date().toISOString() })}\n\n`
      );

      // Set up event listeners
      const onNewHookEvent = (data: any) => {
        if (matchesFilters(data.event, filters)) {
          res.write("event: new-hook-event\n");
          res.write(`data: ${JSON.stringify(data.event)}\n\n`);
        }
      };

      const onHookEvaluation = (data: any) => {
        if (matchesFilters(data.event, filters)) {
          res.write("event: hook-evaluation\n");
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        }
      };

      const onHookCleanup = (data: any) => {
        res.write("event: hook-cleanup\n");
        res.write(
          `data: ${JSON.stringify({ cleanedCount: data.cleanedCount, inferredDenials: data.inferredDenials })}\n\n`
        );
      };

      // Subscribe to hook service events
      hookService.on("new-hook-event", onNewHookEvent);
      hookService.on("hook-evaluation", onHookEvaluation);
      hookService.on("hook-cleanup", onHookCleanup);

      // Handle client disconnect
      req.on("close", () => {
        hookService.off("new-hook-event", onNewHookEvent);
        hookService.off("hook-evaluation", onHookEvaluation);
        hookService.off("hook-cleanup", onHookCleanup);
        logger.debug(
          { clientIp: req.ip },
          "Hook events SSE client disconnected"
        );
      });

      logger.info(
        { clientIp: req.ip, filters },
        "Hook events SSE client connected"
      );
    } catch (error) {
      logger.error(
        { error, clientIp: req.ip },
        "Error setting up hook events SSE stream"
      );

      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal server error",
          message: "Failed to set up event stream",
        });
      }
    }
  });

  /**
   * Helper function to check if event matches filters
   */
  function matchesFilters(event: any, filters: HookEventFilters): boolean {
    // Type filter
    if (filters.type) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      if (!types.includes(event.type)) {
        return false;
      }
    }

    // Session ID filter
    if (filters.sessionId && event.sessionId !== filters.sessionId) {
      return false;
    }

    // Agent identity filter
    if (
      filters.agentIdentity &&
      event.agentIdentity !== filters.agentIdentity
    ) {
      return false;
    }

    // Tool name filter
    if (filters.toolName && event.tool_name !== filters.toolName) {
      return false;
    }

    // Time filters
    if (filters.since) {
      const since = new Date(filters.since);
      if (new Date(event.receivedAt) < since) {
        return false;
      }
    }

    if (filters.before) {
      const before = new Date(filters.before);
      if (new Date(event.receivedAt) > before) {
        return false;
      }
    }

    return true;
  }

  return router;
}
