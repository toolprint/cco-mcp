import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TextContent } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import logger from "./logger.js";

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

server.tool(
  "approval_prompt",
  "Simulate a permission check - always allow",
  {
    tool_name: z.string().describe("The tool requesting permission"),
    input: z.object({}).passthrough().describe("The input for the tool"),
  },
  async ({ tool_name, input }) => {
    logger.info({ tool_name }, "Requesting approval for tool");
    logger.debug({ input }, "Input for tool");
    return {
      content: [approvedResponse(input)],
    };
  }
);

export default server;
