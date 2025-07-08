import React from "react";
import { Code } from "lucide-react";
import type { ToolMatch } from "../../types/config";
import { cn } from "../../lib/utils";

interface ToolRulePreviewProps {
  tool: ToolMatch | null;
  className?: string;
}

export const ToolRulePreview: React.FC<ToolRulePreviewProps> = ({
  tool,
  className,
}) => {
  const formatRule = (tool: ToolMatch): string => {
    if (tool.type === "builtin") {
      const specifier = tool.optionalSpecifier || "";
      return specifier ? `${tool.toolName}(${specifier})` : tool.toolName;
    } else {
      // MCP tool
      const base = `mcp__${tool.serverName}`;

      if (!tool.toolName) {
        // Match all tools on the server - no trailing __*
        return base;
      }

      const specifier = tool.optionalSpecifier || "*";
      return `${base}__${tool.toolName}(${specifier})`;
    }
  };

  if (!tool) {
    return null;
  }

  const formattedRule = formatRule(tool);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <Code className="h-4 w-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Permission Rule Preview
        </span>
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 rounded-md p-3">
        <code className="text-sm font-mono text-gray-900 dark:text-gray-100">
          {formattedRule}
        </code>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        This is how your rule will appear in the permission system.
      </p>
    </div>
  );
};
