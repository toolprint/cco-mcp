import React, { useState, useEffect } from "react";
import { X, Info } from "lucide-react";
import { Button } from "../ui/button";
import { DurationPicker } from "../ui/duration-picker";
import { BuiltInToolForm } from "./BuiltInToolForm";
import { MCPToolForm } from "./MCPToolForm";
import { ToolRulePreview } from "./ToolRulePreview";
import { priorityUtils } from "../../utils/priority";
import type { 
  ApprovalRule, 
  ApprovalAction, 
  ToolType,
  ToolMatch
} from "../../types/config";
import type { BuiltInToolName } from "../../types/config";

interface RuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (rule: ApprovalRule) => void;
  rule?: ApprovalRule | null;
  existingPriorities: number[];
  prePopulatedData?: {
    toolName?: string;
    agentIdentity?: string;
    action?: ApprovalAction;
  };
}

export const RuleModal: React.FC<RuleModalProps> = ({
  isOpen,
  onClose,
  onSave,
  rule,
  existingPriorities,
  prePopulatedData,
}) => {
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    priority: 10,
    action: "review" as ApprovalAction,
    enabled: true,
    toolType: "builtin" as ToolType,
    // Built-in tool fields
    builtInToolName: "" as BuiltInToolName | string,
    builtInSpecifier: "",
    // MCP tool fields
    mcpServerName: "",
    mcpToolName: "",
    mcpSpecifier: "*",
    // Future features (disabled)
    agentIdentity: "",
    timeoutOverride: {
      enabled: false,
      value: 300000,
    },
  });

  // Parse existing rule or pre-populated data
  useEffect(() => {
    if (rule) {
      // Parse existing rule
      const tool = rule.match.tool;
      setFormData({
        name: rule.name,
        description: rule.description || "",
        priority: rule.priority,
        action: rule.action,
        enabled: rule.enabled !== false,
        toolType: tool.type,
        builtInToolName: tool.type === 'builtin' ? tool.toolName : "",
        builtInSpecifier: tool.type === 'builtin' ? tool.optionalSpecifier || "" : "",
        mcpServerName: tool.type === 'mcp' ? tool.serverName : "",
        mcpToolName: tool.type === 'mcp' ? tool.toolName || "" : "",
        mcpSpecifier: tool.type === 'mcp' ? tool.optionalSpecifier || "*" : "*",
        agentIdentity: rule.match.agentIdentity || "",
        timeoutOverride: {
          enabled: !!rule.timeoutOverride,
          value: rule.timeoutOverride || 300000,
        },
      });
    } else if (prePopulatedData) {
      // Parse pre-populated tool name to determine type
      const toolName = prePopulatedData.toolName || "";
      const isMCP = toolName.startsWith("mcp__");
      
      if (isMCP) {
        // Parse MCP tool format: mcp__server__tool
        const parts = toolName.split("__");
        setFormData(prev => ({
          ...prev,
          toolType: "mcp",
          mcpServerName: parts[1] || "",
          mcpToolName: parts[2] || "",
          mcpSpecifier: "*", // Ensure default specifier is set
          action: prePopulatedData.action || "review",
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          toolType: "builtin",
          builtInToolName: toolName,
          builtInSpecifier: "", // Clear any default specifier
          action: prePopulatedData.action || "review",
        }));
      }
      
      // Set smart defaults for name and description
      const nextPriority = priorityUtils.calculateNextPriority(existingPriorities);
      const action = prePopulatedData.action || "review";
      
      let ruleName = "";
      let ruleDescription = "";
      
      if (action === "approve") {
        ruleName = `Auto-approve ${toolName}`;
        ruleDescription = `Automatically approve requests for the ${toolName} tool.`;
      } else if (action === "deny") {
        ruleName = `Auto-deny ${toolName}`;
        ruleDescription = `Automatically deny requests for the ${toolName} tool.`;
      } else {
        ruleName = `Review ${toolName}`;
        ruleDescription = `Require manual review for requests to the ${toolName} tool.`;
      }
      
      setFormData(prev => ({
        ...prev,
        name: ruleName,
        description: ruleDescription,
        priority: nextPriority,
      }));
    } else {
      // New rule from scratch
      const nextPriority = priorityUtils.calculateNextPriority(existingPriorities);
      setFormData(prev => ({ ...prev, priority: nextPriority }));
    }
  }, [rule, existingPriorities, prePopulatedData]);

  if (!isOpen) return null;

  // Build the tool match object based on current form state
  const buildToolMatch = (): ToolMatch | null => {
    if (formData.toolType === 'builtin') {
      if (!formData.builtInToolName) return null;
      return {
        type: 'builtin',
        toolName: formData.builtInToolName,
        optionalSpecifier: formData.builtInSpecifier || undefined,
      };
    } else {
      if (!formData.mcpServerName) return null;
      return {
        type: 'mcp',
        serverName: formData.mcpServerName,
        toolName: formData.mcpToolName || undefined,
        optionalSpecifier: formData.mcpSpecifier || "*",
      };
    }
  };

  const currentToolMatch = buildToolMatch();

  const generateRuleId = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      + '-' + Date.now().toString().slice(-6);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const toolMatch = buildToolMatch();
    if (!toolMatch) {
      // Should show validation error
      console.error("Tool match validation failed", formData);
      return;
    }
    
    const ruleToSave: ApprovalRule = {
      id: rule?.id || generateRuleId(formData.name),
      name: formData.name,
      description: formData.description || undefined,
      priority: formData.priority,
      action: formData.action,
      enabled: formData.enabled,
      match: {
        tool: toolMatch,
        agentIdentity: formData.agentIdentity && formData.agentIdentity.trim() ? formData.agentIdentity.trim() : undefined,
      },
      timeoutOverride: formData.timeoutOverride.enabled ? formData.timeoutOverride.value : undefined,
    };

    console.log("Submitting rule:", ruleToSave);
    onSave(ruleToSave);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-lg shadow-xl">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {rule ? "Edit Rule" : "Create New Rule"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                Basic Information
              </h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Rule Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full h-11 text-base rounded-md border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2.5 shadow-sm focus:border-blueprint-500 focus:ring-blueprint-500 hover:border-gray-400 dark:hover:border-gray-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full min-h-[80px] text-base rounded-md border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2.5 shadow-sm focus:border-blueprint-500 focus:ring-blueprint-500 hover:border-gray-400 dark:hover:border-gray-500 resize-y"
                  rows={3}
                  placeholder="Describe the purpose and scope of this rule..."
                />
              </div>
            </div>

            {/* Tool Type Selection */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                Tool Type
              </h3>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    value="builtin"
                    checked={formData.toolType === 'builtin'}
                    onChange={() => setFormData(prev => ({ ...prev, toolType: 'builtin' }))}
                    className="text-blueprint-600 focus:ring-blueprint-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Built-in Tool</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    value="mcp"
                    checked={formData.toolType === 'mcp'}
                    onChange={() => setFormData(prev => ({ ...prev, toolType: 'mcp' }))}
                    className="text-blueprint-600 focus:ring-blueprint-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">MCP Tool</span>
                </label>
              </div>
            </div>

            {/* Tool Configuration */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              {formData.toolType === 'builtin' ? (
                <BuiltInToolForm
                  toolName={formData.builtInToolName}
                  optionalSpecifier={formData.builtInSpecifier}
                  onToolNameChange={(name) => setFormData(prev => ({ ...prev, builtInToolName: name }))}
                  onSpecifierChange={(spec) => setFormData(prev => ({ ...prev, builtInSpecifier: spec }))}
                />
              ) : (
                <MCPToolForm
                  serverName={formData.mcpServerName}
                  toolName={formData.mcpToolName}
                  optionalSpecifier={formData.mcpSpecifier}
                  onServerNameChange={(name) => setFormData(prev => ({ ...prev, mcpServerName: name }))}
                  onToolNameChange={(name) => setFormData(prev => ({ ...prev, mcpToolName: name }))}
                  onSpecifierChange={(spec) => setFormData(prev => ({ ...prev, mcpSpecifier: spec }))}
                />
              )}
            </div>

            {/* Rule Preview */}
            {currentToolMatch && (
              <ToolRulePreview tool={currentToolMatch} />
            )}

            {/* Action */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                Action
              </h3>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    value="approve"
                    checked={formData.action === 'approve'}
                    onChange={() => setFormData(prev => ({ ...prev, action: 'approve' }))}
                    className="text-status-success focus:ring-status-success"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Approve</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    value="deny"
                    checked={formData.action === 'deny'}
                    onChange={() => setFormData(prev => ({ ...prev, action: 'deny' }))}
                    className="text-status-danger focus:ring-status-danger"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Deny</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    value="review"
                    checked={formData.action === 'review'}
                    onChange={() => setFormData(prev => ({ ...prev, action: 'review' }))}
                    className="text-status-warning focus:ring-status-warning"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Manual Review</span>
                </label>
              </div>
            </div>

            {/* Future Features (Disabled) */}
            <div className="space-y-4 opacity-50">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                Advanced Options
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Info className="h-3 w-3" />
                  Coming Soon
                </div>
              </h3>
              
              {/* Agent Identity */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-not-allowed">
                  <input
                    type="checkbox"
                    disabled
                    className="rounded border-gray-300 text-blueprint-600 focus:ring-blueprint-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Match Agent Identity
                  </span>
                </label>
              </div>

              {/* Input Parameters */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-not-allowed">
                  <input
                    type="checkbox"
                    disabled
                    className="rounded border-gray-300 text-blueprint-600 focus:ring-blueprint-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Match Input Parameters
                  </span>
                </label>
              </div>

              {/* Timeout Override */}
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.timeoutOverride.enabled}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      timeoutOverride: { ...prev.timeoutOverride, enabled: e.target.checked }
                    }))}
                    className="rounded border-gray-300 text-blueprint-600 focus:ring-blueprint-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Override Timeout
                  </span>
                </label>
                
                {formData.timeoutOverride.enabled && (
                  <div className="ml-6">
                    <DurationPicker
                      value={formData.timeoutOverride.value}
                      onChange={(value) => setFormData(prev => ({ 
                        ...prev, 
                        timeoutOverride: { ...prev.timeoutOverride, value }
                      }))}
                      min={1000}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!formData.name || !currentToolMatch}
              className="bg-blueprint-600 hover:bg-blueprint-700 text-white"
            >
              {rule ? "Save Changes" : "Create Rule"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};