import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response, Application } from "express";
import path from "path";
import server from "./server";
import logger from "./logger.js";
import { createAuditRoutes, stopAuditLogService } from "./routes/audit.js";
import { createSSERoutes } from "./routes/sse.js";

const app: Application = express();
app.use(express.json());

// Serve static files from the UI dist directory
// In production, the UI files will be in dist/ui relative to the running JS file
const uiPath = path.join(process.cwd(), "dist", "ui");
app.use(express.static(uiPath));

// Health check endpoint for Cloud Run
app.get("/health", (_, res) => {
  res
    .status(200)
    .json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Mount SSE routes first (must come before audit routes due to /audit-log/stream vs /audit-log/:id conflict)
app.use("/api", createSSERoutes());

// Mount audit log API routes
app.use("/api", createAuditRoutes());

app.post("/mcp", async (req: Request, res: Response) => {
  // In stateless mode, create a new instance of transport and server for each request
  // to ensure complete isolation. A single instance would cause request ID collisions
  // when multiple clients connect concurrently.

  try {
    const transport: StreamableHTTPServerTransport =
      new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
    res.on("close", () => {
      logger.debug("Request closed");
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    logger.error({ error }, "Error handling MCP request");
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.get("/mcp", async (req: Request, res: Response) => {
  logger.info("Received GET MCP request");
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    })
  );
});

app.delete("/mcp", async (req: Request, res: Response) => {
  logger.info("Received DELETE MCP request");
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    })
  );
});

// Catch-all middleware for SPA - must be last
app.use((req, res) => {
  // Only handle GET requests
  if (req.method !== 'GET') {
    return res.status(404).json({ error: "Not found" });
  }
  
  // Don't serve index.html for API routes or assets with extensions
  if (req.path.startsWith("/api") || req.path.match(/\.\w+$/)) {
    res.status(404).json({ error: "Not found" });
  } else {
    res.sendFile(path.join(process.cwd(), "dist", "ui", "index.html"));
  }
});

// Graceful shutdown handling
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  await stopAuditLogService();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully");
  await stopAuditLogService();
  process.exit(0);
});

export default app;
