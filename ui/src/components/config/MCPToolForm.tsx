import React from "react";
import { Input } from "../ui/input";
import { Info, AlertTriangle, Shield } from "lucide-react";
import { cn } from "../../lib/utils";

interface MCPToolFormProps {
  serverName: string;
  toolName?: string;
  optionalSpecifier?: string;
  onServerNameChange: (serverName: string) => void;
  onToolNameChange: (toolName: string) => void;
  onSpecifierChange: (specifier: string) => void;
}

export const MCPToolForm: React.FC<MCPToolFormProps> = ({
  serverName,
  toolName = "",
  optionalSpecifier = "*",
  onServerNameChange,
  onToolNameChange,
  onSpecifierChange,
}) => {
  const isValidServerName = serverName && /^[a-z0-9-_]+$/.test(serverName);
  const showServerWarning = serverName && !isValidServerName;

  return (
    <div className="space-y-4">
      {/* Security Warning */}
      <div className="flex items-start gap-2 p-3 bg-blueprint-50 dark:bg-blueprint-950/20 rounded-md border border-blueprint-200 dark:border-blueprint-800">
        <Shield className="h-4 w-4 text-blueprint-600 dark:text-blueprint-400 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-blueprint-800 dark:text-blueprint-200">
          <p className="font-medium mb-1">Important Security Notice:</p>
          <p>MCP rules apply to the configured server names in your MCP settings. Ensure your MCP servers 
          are properly named to prevent privilege escalation.</p>
        </div>
      </div>

      {/* MCP Server Name */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          MCP Server Name <span className="text-red-500">*</span>
        </label>
        <Input
          type="text"
          value={serverName}
          onChange={(e) => onServerNameChange(e.target.value.toLowerCase())}
          placeholder="e.g., puppeteer, github, database"
          className={cn(
            "w-full",
            showServerWarning && "border-orange-500 focus:ring-orange-500"
          )}
        />
        {showServerWarning && (
          <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
            Server names must be lowercase and contain only letters, numbers, hyphens, and underscores.
          </p>
        )}
        <p className="text-xs text-gray-600 dark:text-gray-400">
          This must match exactly with your MCP server configuration name.
        </p>
      </div>

      {/* Tool Name (Optional) */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Tool Name
          <span className="text-xs text-gray-500 ml-2">(Leave empty to match all tools on this server)</span>
        </label>
        <Input
          type="text"
          value={toolName}
          onChange={(e) => onToolNameChange(e.target.value)}
          placeholder="e.g., navigate, screenshot, execute_query"
          className="w-full"
        />
        {!toolName && (
          <div className="flex items-start gap-2 mt-2">
            <Info className="h-4 w-4 text-blueprint-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Leaving this empty will match <strong>all tools</strong> on the <code>{serverName || "server"}</code> server.
            </p>
          </div>
        )}
      </div>

      {/* Optional Specifier */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Optional Specifier
          <span className="text-xs text-gray-500 ml-2">(Default: *)</span>
        </label>
        <Input
          type="text"
          value={optionalSpecifier}
          onChange={(e) => onSpecifierChange(e.target.value || "*")}
          placeholder="* (allows all content)"
          className="w-full"
        />
        {optionalSpecifier === "*" && (
          <div className="flex items-start gap-2 mt-2 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-md border border-orange-200 dark:border-orange-800">
            <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-orange-800 dark:text-orange-200">
              <span className="font-medium">Security Notice:</span> Using <code className="font-mono">*</code> allows 
              unrestricted content for this tool. Consider being more specific if possible.
            </p>
          </div>
        )}
      </div>

      {/* Examples */}
      <div className="space-y-2 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-md">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Rule Format Examples:</p>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <li>• <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
            mcp__puppeteer__navigate(*)
          </code> - Allow navigation to any URL</li>
          <li>• <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
            mcp__github__create_issue(*)
          </code> - Allow creating issues in any repo</li>
          <li>• <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
            mcp__database
          </code> - Allow all database operations</li>
        </ul>
      </div>
    </div>
  );
};