import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "../ui/button";
import type { ApprovalRule, ApprovalAction, MatchPatternType } from "../../types/config";

interface RuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (rule: Omit<ApprovalRule, "id">) => void;
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
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    priority: 10,
    action: "review" as ApprovalAction,
    enabled: true,
    toolName: {
      enabled: false,
      type: "exact" as MatchPatternType,
      value: "",
      caseSensitive: false,
    },
    agentIdentity: {
      enabled: false,
      type: "exact" as MatchPatternType,
      value: "",
      caseSensitive: false,
    },
    conditions: [] as Array<{
      field: string;
      operator: "equals" | "contains" | "startsWith" | "endsWith" | "matches";
      value: string;
      caseSensitive: boolean;
    }>,
    timeoutOverride: {
      enabled: false,
      value: 300000,
    },
  });

  useEffect(() => {
    if (rule) {
      // Editing existing rule
      setFormData({
        name: rule.name,
        description: rule.description || "",
        priority: rule.priority,
        action: rule.action,
        enabled: rule.enabled !== false,
        toolName: {
          enabled: !!rule.match.toolName,
          type: rule.match.toolName?.type || "exact",
          value: rule.match.toolName?.value || "",
          caseSensitive: rule.match.toolName?.caseSensitive || false,
        },
        agentIdentity: {
          enabled: !!rule.match.agentIdentity,
          type: rule.match.agentIdentity?.type || "exact",
          value: rule.match.agentIdentity?.value || "",
          caseSensitive: rule.match.agentIdentity?.caseSensitive || false,
        },
        conditions: (rule.match.conditions || []).map(c => ({
          field: c.field,
          operator: c.operator as any,
          value: String(c.value),
          caseSensitive: c.caseSensitive || false,
        })),
        timeoutOverride: {
          enabled: !!rule.timeoutOverride,
          value: rule.timeoutOverride || 300000,
        },
      });
    } else if (prePopulatedData) {
      // Creating new rule with pre-populated data
      const nextPriority = Math.max(...existingPriorities, 0) + 10;
      setFormData(prev => ({
        ...prev,
        priority: nextPriority,
        action: prePopulatedData.action || "review",
        name: prePopulatedData.toolName && prePopulatedData.agentIdentity 
          ? `Allow ${prePopulatedData.toolName} for ${prePopulatedData.agentIdentity}`
          : "",
        toolName: prePopulatedData.toolName ? {
          enabled: true,
          type: "exact",
          value: prePopulatedData.toolName,
          caseSensitive: false,
        } : prev.toolName,
        agentIdentity: prePopulatedData.agentIdentity ? {
          enabled: true,
          type: "exact",
          value: prePopulatedData.agentIdentity,
          caseSensitive: false,
        } : prev.agentIdentity,
      }));
    } else {
      // Creating new rule from scratch
      const nextPriority = Math.max(...existingPriorities, 0) + 10;
      setFormData(prev => ({ ...prev, priority: nextPriority }));
    }
  }, [rule, existingPriorities, prePopulatedData]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const ruleToSave: Omit<ApprovalRule, "id"> = {
      name: formData.name,
      description: formData.description || undefined,
      priority: formData.priority,
      action: formData.action,
      enabled: formData.enabled,
      match: {
        toolName: formData.toolName.enabled ? {
          type: formData.toolName.type,
          value: formData.toolName.value,
          caseSensitive: formData.toolName.caseSensitive,
        } : undefined,
        agentIdentity: formData.agentIdentity.enabled ? {
          type: formData.agentIdentity.type,
          value: formData.agentIdentity.value,
          caseSensitive: formData.agentIdentity.caseSensitive,
        } : undefined,
        conditions: formData.conditions.length > 0 ? formData.conditions : undefined,
      },
      timeoutOverride: formData.timeoutOverride.enabled ? formData.timeoutOverride.value : undefined,
    };

    onSave(ruleToSave);
  };


  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {rule ? "Edit Rule" : "Create New Rule"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">Basic Information</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Rule Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-sm focus:border-blueprint-500 focus:ring-blueprint-500"
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
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-sm focus:border-blueprint-500 focus:ring-blueprint-500"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Priority <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                  className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-sm focus:border-blueprint-500 focus:ring-blueprint-500"
                  required
                  min="0"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Lower numbers have higher priority
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Enabled
                </label>
                <label className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="rounded border-gray-300 text-blueprint-600 focus:ring-blueprint-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Rule is active
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Match Criteria */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">Match Criteria</h3>
            
            {/* Tool Name */}
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.toolName.enabled}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    toolName: { ...prev.toolName, enabled: e.target.checked }
                  }))}
                  className="rounded border-gray-300 text-blueprint-600 focus:ring-blueprint-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Match Tool Name
                </span>
              </label>
              
              {formData.toolName.enabled && (
                <div className="ml-6 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={formData.toolName.type}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        toolName: { ...prev.toolName, type: e.target.value as MatchPatternType }
                      }))}
                      className="rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-sm focus:border-blueprint-500 focus:ring-blueprint-500"
                    >
                      <option value="exact">Exact Match</option>
                      <option value="wildcard">Wildcard (*,?)</option>
                      <option value="regex">Regular Expression</option>
                    </select>
                    <input
                      type="text"
                      value={formData.toolName.value}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        toolName: { ...prev.toolName, value: e.target.value }
                      }))}
                      placeholder="e.g., Read, Write*, ^(Read|Write)$"
                      className="flex-1 rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-sm focus:border-blueprint-500 focus:ring-blueprint-500"
                      required={formData.toolName.enabled}
                    />
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.toolName.caseSensitive}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        toolName: { ...prev.toolName, caseSensitive: e.target.checked }
                      }))}
                      className="rounded border-gray-300 text-blueprint-600 focus:ring-blueprint-500"
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      Case sensitive
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Agent Identity */}
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.agentIdentity.enabled}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    agentIdentity: { ...prev.agentIdentity, enabled: e.target.checked }
                  }))}
                  className="rounded border-gray-300 text-blueprint-600 focus:ring-blueprint-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Match Agent Identity
                </span>
              </label>
              
              {formData.agentIdentity.enabled && (
                <div className="ml-6 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={formData.agentIdentity.type}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        agentIdentity: { ...prev.agentIdentity, type: e.target.value as MatchPatternType }
                      }))}
                      className="rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-sm focus:border-blueprint-500 focus:ring-blueprint-500"
                    >
                      <option value="exact">Exact Match</option>
                      <option value="wildcard">Wildcard (*,?)</option>
                      <option value="regex">Regular Expression</option>
                    </select>
                    <input
                      type="text"
                      value={formData.agentIdentity.value}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        agentIdentity: { ...prev.agentIdentity, value: e.target.value }
                      }))}
                      placeholder="e.g., claude-code, agent-*"
                      className="flex-1 rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-sm focus:border-blueprint-500 focus:ring-blueprint-500"
                      required={formData.agentIdentity.enabled}
                    />
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.agentIdentity.caseSensitive}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        agentIdentity: { ...prev.agentIdentity, caseSensitive: e.target.checked }
                      }))}
                      className="rounded border-gray-300 text-blueprint-600 focus:ring-blueprint-500"
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      Case sensitive
                    </span>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Action */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">Action</h3>
            
            <div className="space-y-2">
              {(["approve", "deny", "review"] as const).map((action) => (
                <label
                  key={action}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <input
                    type="radio"
                    name="action"
                    value={action}
                    checked={formData.action === action}
                    onChange={(e) => setFormData(prev => ({ ...prev, action: e.target.value as ApprovalAction }))}
                    className="text-blueprint-600 focus:ring-blueprint-500"
                  />
                  <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                    {action}
                  </span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {action === "approve" && "- Allow the tool call to proceed"}
                    {action === "deny" && "- Block the tool call"}
                    {action === "review" && "- Wait for manual decision"}
                  </span>
                </label>
              ))}
            </div>

            {/* Timeout Override (only for review action) */}
            {formData.action === "review" && (
              <div className="ml-6 space-y-2">
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
                    Override timeout for this rule
                  </span>
                </label>
                
                {formData.timeoutOverride.enabled && (
                  <div className="ml-6">
                    <input
                      type="number"
                      value={formData.timeoutOverride.value}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        timeoutOverride: { ...prev.timeoutOverride, value: parseInt(e.target.value) || 300000 }
                      }))}
                      min="1000"
                      step="1000"
                      className="w-32 rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-sm focus:border-blueprint-500 focus:ring-blueprint-500"
                    />
                    <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                      milliseconds
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </form>

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
            onClick={handleSubmit}
            className="bg-blueprint-600 hover:bg-blueprint-700 text-white"
          >
            {rule ? "Update Rule" : "Create Rule"}
          </Button>
        </div>
      </div>
    </div>
  );
};