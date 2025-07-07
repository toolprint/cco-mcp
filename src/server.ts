import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TextContent } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import logger from "./logger.js";
import { getAuditLogService } from "./routes/audit.js";
import { AuditLogEntry } from "./audit/types.js";

const server = new McpServer({
  name: "cco-mcp",
  version: "0.1.0",
  description: "Approves tool calls for Claude Code",
});

const approvedResponse = (input: any): TextContent => {
  return {
    type: "text",
    text: JSON.stringify({
      behavior: "allow",
      updatedInput: input,
    }),
  };
};

const deniedResponse = (
  deniedReason: string = "Permission denied"
): TextContent => {
  return {
    type: "text",
    text: JSON.stringify({
      behavior: "deny",
      message: deniedReason,
    }),
  };
};

// Configuration for automatic approval behavior
const AUTO_APPROVE_MODE = process.env.CCO_AUTO_APPROVE === "true";
const APPROVAL_TIMEOUT_MS = parseInt(
  process.env.CCO_APPROVAL_TIMEOUT || "300000"
); // 5 minutes default

server.tool(
  "approval_prompt",
  "Request approval for a tool call - integrates with audit log",
  {
    tool_name: z.string().describe("The tool requesting permission"),
    input: z.object({}).passthrough().describe("The input for the tool"),
    agent_identity: z
      .string()
      .optional()
      .describe("Identity of the agent making the request"),
  },
  async ({ tool_name, input, agent_identity }) => {
    logger.info({ tool_name, agent_identity }, "Requesting approval for tool");
    logger.debug({ input }, "Input for tool");

    try {
      // Get the audit log service
      const auditService = getAuditLogService();

      // Create an audit log entry
      const entry = await auditService.addEntry(
        tool_name,
        input,
        agent_identity
      );
      logger.info(
        { entryId: entry.id },
        "Created audit log entry for approval request"
      );

      // If auto-approve mode is enabled, immediately approve
      if (AUTO_APPROVE_MODE) {
        const updatedEntry = await auditService.updateEntry(
          entry.id,
          "APPROVED",
          "auto-approve-mode"
        );
        logger.info({ entryId: entry.id }, "Auto-approved tool call");
        return {
          content: [approvedResponse(input)],
        };
      }

      // Otherwise, wait for approval/denial
      // In a real implementation, this would use a proper async waiting mechanism
      // For now, we'll poll the audit log service
      const startTime = Date.now();
      const pollInterval = 1000; // Poll every second

      while (Date.now() - startTime < APPROVAL_TIMEOUT_MS) {
        const currentEntry = await auditService.getEntry(entry.id);

        if (!currentEntry) {
          // Entry was deleted or expired
          logger.warn({ entryId: entry.id }, "Audit log entry not found");
          return {
            content: [deniedResponse("Approval request expired")],
          };
        }

        if (currentEntry.state === "APPROVED") {
          logger.info(
            {
              entryId: entry.id,
              decisionBy: currentEntry.decision_by,
            },
            "Tool call approved"
          );
          return {
            content: [approvedResponse(input)],
          };
        }

        if (currentEntry.state === "DENIED") {
          logger.info(
            {
              entryId: entry.id,
              decisionBy: currentEntry.decision_by,
              deniedByTimeout: currentEntry.denied_by_timeout,
            },
            "Tool call denied"
          );
          const reason = currentEntry.denied_by_timeout
            ? "Request timed out waiting for approval"
            : "Permission denied by user";
          return {
            content: [deniedResponse(reason)],
          };
        }

        // Still pending, wait a bit before checking again
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      // Timeout reached without approval
      logger.warn({ entryId: entry.id }, "Approval request timed out");
      return {
        content: [deniedResponse("Approval request timed out")],
      };
    } catch (error) {
      logger.error({ error, tool_name }, "Error processing approval request");
      return {
        content: [deniedResponse("Internal error processing approval request")],
      };
    }
  }
);

export default server;
