import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TextContent } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import logger from "./logger.js";
import { getAuditLogService } from "./routes/audit.js";
import { AuditLogEntry } from "./audit/types.js";
import {
  getConfigurationService,
  ToolCallInfo,
} from "./services/ConfigurationService.js";
import { ApprovalRule } from "./config/types.js";

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

// Get configuration service instance
const configService = getConfigurationService();

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

      // Check configuration for auto-approval rules
      const toolCall: ToolCallInfo = {
        toolName: tool_name,
        agentIdentity: agent_identity,
        input: input,
      };

      const { action, rule, timeout } =
        configService.getActionForToolCall(toolCall);

      // Handle immediate approve/deny based on rules
      if (action === "approve") {
        const decisionBy = rule ? `rule:${rule.id}` : "config:default-approve";
        const updatedEntry = await auditService.updateEntry(
          entry.id,
          "APPROVED",
          decisionBy
        );
        logger.info(
          {
            entryId: entry.id,
            rule: rule?.name,
            decisionBy,
          },
          "Auto-approved tool call"
        );

        // Add rule information to audit log
        if (rule) {
          (updatedEntry as any).matched_rule = {
            id: rule.id,
            name: rule.name,
          };
        }

        return {
          content: [approvedResponse(input)],
        };
      }

      if (action === "deny") {
        const decisionBy = rule ? `rule:${rule.id}` : "config:default-deny";
        const updatedEntry = await auditService.updateEntry(
          entry.id,
          "DENIED",
          decisionBy
        );
        logger.info(
          {
            entryId: entry.id,
            rule: rule?.name,
            decisionBy,
          },
          "Auto-denied tool call"
        );

        // Add rule information to audit log
        if (rule) {
          (updatedEntry as any).matched_rule = {
            id: rule.id,
            name: rule.name,
          };
        }

        return {
          content: [
            deniedResponse(
              rule
                ? `Denied by rule: ${rule.name}`
                : "Denied by default configuration"
            ),
          ],
        };
      }

      // Otherwise, wait for approval/denial (action === 'review')
      // Poll the audit log service
      const startTime = Date.now();
      const pollInterval = 1000; // Poll every second
      const timeoutMs = timeout || configService.getTimeoutMs();

      logger.info(
        {
          entryId: entry.id,
          action,
          timeoutMs,
          rule: rule?.name,
        },
        "Waiting for manual review"
      );

      while (Date.now() - startTime < timeoutMs) {
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

      // Timeout reached without approval - apply timeout action
      const timeoutAction = configService.getTimeoutAction();
      logger.warn(
        {
          entryId: entry.id,
          timeoutAction,
        },
        "Approval request timed out"
      );

      if (timeoutAction === "approve") {
        await auditService.updateEntry(
          entry.id,
          "APPROVED",
          "config:timeout-approve"
        );
        return {
          content: [approvedResponse(input)],
        };
      } else {
        await auditService.updateEntry(
          entry.id,
          "DENIED",
          "config:timeout-deny"
        );
        return {
          content: [deniedResponse("Request timed out waiting for approval")],
        };
      }
    } catch (error) {
      logger.error({ error, tool_name }, "Error processing approval request");
      return {
        content: [deniedResponse("Internal error processing approval request")],
      };
    }
  }
);

export default server;
