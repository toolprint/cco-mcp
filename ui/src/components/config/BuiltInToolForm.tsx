import React from "react";
import { Select } from "../ui/select";
import { Input } from "../ui/input";
import { Info, AlertTriangle } from "lucide-react";
import { BUILT_IN_TOOLS } from "../../types/config";
import type { BuiltInToolName } from "../../types/config";

interface BuiltInToolFormProps {
  toolName: BuiltInToolName | string;
  optionalSpecifier?: string;
  onToolNameChange: (toolName: BuiltInToolName | string) => void;
  onSpecifierChange: (specifier: string) => void;
}

export const BuiltInToolForm: React.FC<BuiltInToolFormProps> = ({
  toolName,
  optionalSpecifier = "",
  onToolNameChange,
  onSpecifierChange,
}) => {
  const selectedTool =
    toolName in BUILT_IN_TOOLS
      ? BUILT_IN_TOOLS[toolName as BuiltInToolName]
      : null;
  const showSpecifierWarning =
    optionalSpecifier === "*" ||
    optionalSpecifier === "(*)" ||
    (!optionalSpecifier && selectedTool?.requiresPermission);

  return (
    <div className="space-y-4">
      {/* Tool Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Built-in Tool
        </label>
        <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
          ◊ indicates no permission required{" "}
          <a
            href="https://docs.anthropic.com/en/docs/claude-code/settings#tools-available-to-claude"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blueprint-600 hover:text-blueprint-700 underline"
          >
            see docs
          </a>
        </div>
        <Select
          value={toolName}
          onChange={(e) => onToolNameChange(e.target.value as BuiltInToolName)}
          className="w-full"
        >
          <option value="">Select a tool...</option>
          {Object.values(BUILT_IN_TOOLS).map((tool) => (
            <option key={tool.name} value={tool.name}>
              {tool.name} {tool.requiresPermission ? "" : "◊"}
            </option>
          ))}
        </Select>
        {selectedTool && (
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            {selectedTool.description}
          </p>
        )}
      </div>

      {/* Optional Specifier */}
      {selectedTool && selectedTool.requiresPermission && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Optional Specifier
            <span className="text-xs text-gray-500 ml-2">
              (Leave empty for no restrictions)
            </span>
          </label>
          <Input
            type="text"
            value={optionalSpecifier}
            onChange={(e) => onSpecifierChange(e.target.value)}
            placeholder={
              selectedTool.exampleSpecifiers?.[0] || "Enter specifier..."
            }
            className="w-full"
          />

          {/* Examples */}
          {selectedTool.exampleSpecifiers &&
            selectedTool.exampleSpecifiers.length > 0 && (
              <div className="flex items-start gap-2 mt-2">
                <Info className="h-4 w-4 text-blueprint-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  <span className="font-medium">Examples:</span>
                  <ul className="mt-1 space-y-0.5">
                    {selectedTool.exampleSpecifiers.map((example, idx) => (
                      <li key={idx} className="ml-2">
                        •{" "}
                        <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                          {toolName}({example})
                        </code>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

          {/* Warning for wildcard usage */}
          {showSpecifierWarning && (
            <div className="flex items-start gap-2 mt-2 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-md border border-orange-200 dark:border-orange-800">
              <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-orange-800 dark:text-orange-200">
                <span className="font-medium">Security Notice:</span> Using{" "}
                <code className="font-mono">(*)</code> or leaving empty allows
                unrestricted use of this tool. Consider being more specific to
                limit permissions.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tool-specific help */}
      {selectedTool && toolName === "Bash" && (
        <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-md">
          <strong>Note:</strong> Claude is aware of shell operators. A prefix
          rule like <code>npm run test:*</code>
          won't allow chained commands like{" "}
          <code>npm run test:unit && rm -rf /</code>.
        </div>
      )}

      {selectedTool &&
        (toolName === "Edit" ||
          toolName === "Read" ||
          toolName === "Write" ||
          toolName === "MultiEdit") && (
          <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-md">
            <strong>Note:</strong> File patterns follow gitignore specification.
            Use <code>**</code> for recursive matching.
          </div>
        )}

      {selectedTool && toolName === "WebFetch" && (
        <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-md">
          <strong>Note:</strong> Use <code>domain:</code> prefix to restrict by
          domain, e.g., <code>domain:example.com</code>.
        </div>
      )}
    </div>
  );
};
