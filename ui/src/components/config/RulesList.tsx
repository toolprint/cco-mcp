import React, { useState } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Toggle } from "../ui/toggle";
import { ConfirmationModal } from "../ui/confirmation-modal";
import {
  Plus,
  Edit2,
  Trash2,
  GripVertical,
  RotateCcw,
  Code,
} from "lucide-react";
import { RuleModal } from "./RuleModal";
import { priorityUtils } from "../../utils/priority";
import { cn } from "../../lib/utils";
import type { ApprovalRule, ToolMatch } from "../../types/config";

interface RulesListProps {
  rules: ApprovalRule[];
  onCreateRule: (rule: Omit<ApprovalRule, "id">) => void;
  onUpdateRule: (id: string, rule: Partial<ApprovalRule>) => void;
  onDeleteRule: (id: string) => void;
  onRebalancePriorities?: (
    rules: ApprovalRule[]
  ) => Promise<{ success: boolean; error?: string }>;
}

export const RulesList: React.FC<RulesListProps> = ({
  rules,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
  onRebalancePriorities,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ApprovalRule | null>(null);
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());
  const [draggedRule, setDraggedRule] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after" | null>(
    null
  );
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [rulesToDelete, setRulesToDelete] = useState<Set<string>>(new Set());

  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);
  const priorities = rules.map((rule) => rule.priority);
  const needsRebalancing = priorityUtils.needsRebalancing(priorities);

  const handleCreateRule = () => {
    setEditingRule(null);
    setIsModalOpen(true);
  };

  const handleRebalancePriorities = async () => {
    if (!onRebalancePriorities) return;

    const result = await onRebalancePriorities(rules);
    if (!result.success) {
      console.error("Failed to rebalance priorities:", result.error);
    }
  };

  const handleEditRule = (rule: ApprovalRule) => {
    setEditingRule(rule);
    setIsModalOpen(true);
  };

  const handleSaveRule = (rule: Omit<ApprovalRule, "id">) => {
    if (editingRule) {
      onUpdateRule(editingRule.id, rule);
    } else {
      onCreateRule(rule);
    }
    setIsModalOpen(false);
  };

  const handleSelectRule = (ruleId: string, selected: boolean) => {
    const newSelected = new Set(selectedRules);
    if (selected) {
      newSelected.add(ruleId);
    } else {
      newSelected.delete(ruleId);
    }
    setSelectedRules(newSelected);
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedRules(new Set(sortedRules.map((rule) => rule.id)));
    } else {
      setSelectedRules(new Set());
    }
  };

  const handleDeleteSelected = () => {
    const count = selectedRules.size;
    if (count === 0) return;

    setRulesToDelete(selectedRules);
    setShowDeleteConfirmation(true);
  };

  const confirmDelete = () => {
    rulesToDelete.forEach((ruleId) => onDeleteRule(ruleId));
    setSelectedRules(new Set());
    setRulesToDelete(new Set());
    setShowDeleteConfirmation(false);
  };

  const cancelDelete = () => {
    setRulesToDelete(new Set());
    setShowDeleteConfirmation(false);
  };

  const handleDragStart = (e: React.DragEvent, ruleId: string) => {
    setDraggedRule(ruleId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    // Calculate drop position based on cursor position within the card
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mouseY = e.clientY;
    const cardMiddle = rect.top + rect.height / 2;

    const position = mouseY < cardMiddle ? "before" : "after";

    setDragOverIndex(index);
    setDropPosition(position);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're actually leaving the card area
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    if (
      mouseX < rect.left ||
      mouseX > rect.right ||
      mouseY < rect.top ||
      mouseY > rect.bottom
    ) {
      setDragOverIndex(null);
      setDropPosition(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();

    if (!draggedRule || !dropPosition) return;

    const draggedIndex = sortedRules.findIndex(
      (rule) => rule.id === draggedRule
    );
    if (draggedIndex === -1) {
      setDraggedRule(null);
      setDragOverIndex(null);
      setDropPosition(null);
      return;
    }

    // Calculate actual insert position based on drop position
    let insertIndex = targetIndex;
    if (dropPosition === "after") {
      insertIndex = targetIndex + 1;
    }

    // Adjust for the fact that we're removing the dragged item first
    if (draggedIndex < insertIndex) {
      insertIndex = insertIndex - 1;
    }

    // Don't do anything if dropping in the same position
    if (draggedIndex === insertIndex) {
      setDraggedRule(null);
      setDragOverIndex(null);
      setDropPosition(null);
      return;
    }

    // Reorder rules by updating their priorities
    const newSortedRules = [...sortedRules];
    const [draggedRuleObj] = newSortedRules.splice(draggedIndex, 1);
    newSortedRules.splice(insertIndex, 0, draggedRuleObj);

    // Update priorities based on new order - use temporary high values first to avoid conflicts
    const updates: Array<{ id: string; priority: number }> = [];
    newSortedRules.forEach((rule, index) => {
      const newPriority = (index + 1) * 10;
      if (rule.priority !== newPriority) {
        updates.push({ id: rule.id, priority: newPriority });
      }
    });

    // Apply updates in a single batch since backend now auto-fixes conflicts
    const applyUpdates = async () => {
      // Apply all priority updates at once - backend will handle conflicts
      for (const update of updates) {
        await onUpdateRule(update.id, { priority: update.priority });
      }
    };

    applyUpdates().catch(console.error);

    setDraggedRule(null);
    setDragOverIndex(null);
    setDropPosition(null);
  };

  const handleDragEnd = () => {
    setDraggedRule(null);
    setDragOverIndex(null);
    setDropPosition(null);
  };

  const getActionBadgeVariant = (action: string) => {
    switch (action) {
      case "approve":
        return "success";
      case "deny":
        return "danger";
      case "review":
        return "warning";
      default:
        return "outline";
    }
  };

  const formatToolMatch = (tool: ToolMatch): string => {
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

  const getToolTypeLabel = (tool: ToolMatch): string => {
    return tool.type === "builtin" ? "Built-in" : "MCP";
  };

  return (
    <>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Approval Rules
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Rules are evaluated in priority order. First match wins.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {selectedRules.size > 0 && (
                <Button
                  onClick={handleDeleteSelected}
                  variant="outline"
                  className="gap-2 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-400 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950 dark:hover:text-red-300 dark:hover:border-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Rules ({selectedRules.size})
                </Button>
              )}
              {needsRebalancing && onRebalancePriorities && (
                <Button
                  onClick={handleRebalancePriorities}
                  variant="outline"
                  className="gap-2 border-orange-300 text-orange-600 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-400 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950 dark:hover:text-orange-300 dark:hover:border-orange-600"
                  title="Priority conflicts detected. Click to rebalance."
                >
                  <RotateCcw className="h-4 w-4" />
                  Rebalance Priorities
                </Button>
              )}
              <Button
                onClick={handleCreateRule}
                className="gap-2 bg-blueprint-600 hover:bg-blueprint-700 text-white"
              >
                <Plus className="h-4 w-4" />
                Add Rule
              </Button>
            </div>
          </div>

          {sortedRules.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                No rules configured yet
              </p>
              <Button
                onClick={handleCreateRule}
                variant="outline"
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Create your first rule
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Select All Checkbox */}
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                <input
                  type="checkbox"
                  checked={
                    selectedRules.size === sortedRules.length &&
                    sortedRules.length > 0
                  }
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="rounded border-gray-300 text-blueprint-600 focus:ring-blueprint-500"
                />
                <label className="text-sm text-gray-600 dark:text-gray-400">
                  Select all ({sortedRules.length} rule
                  {sortedRules.length !== 1 ? "s" : ""})
                </label>
              </div>

              {sortedRules.map((rule, index) => (
                <div key={rule.id} className="relative">
                  {/* Drop indicator line before this card */}
                  {dragOverIndex === index && dropPosition === "before" && (
                    <div className="absolute -top-2 left-0 right-0 z-10">
                      <div className="h-1 bg-blueprint-500 rounded-full shadow-lg" />
                      <div className="absolute left-0 top-0 -translate-y-1 w-3 h-3 bg-blueprint-500 rounded-full" />
                    </div>
                  )}

                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, rule.id)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "relative p-4 rounded-lg border transition-colors",
                      rule.enabled !== false
                        ? "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                        : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60",
                      draggedRule === rule.id && "opacity-50"
                    )}
                  >
                    {/* Top Row: Checkbox + Drag Handle + Title/Badges + Priority + Toggle */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        {/* Selection Checkbox */}
                        <input
                          type="checkbox"
                          checked={selectedRules.has(rule.id)}
                          onChange={(e) =>
                            handleSelectRule(rule.id, e.target.checked)
                          }
                          className="rounded border-gray-300 text-blueprint-600 focus:ring-blueprint-500"
                        />
                        {/* Drag Handle */}
                        <div className="cursor-move text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                          <GripVertical className="h-5 w-5" />
                        </div>
                        {/* Rule Title and Badges */}
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900 dark:text-white">
                              {rule.name}
                            </h3>
                            <Badge
                              variant={getActionBadgeVariant(rule.action)}
                              className="text-xs"
                            >
                              {rule.action}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Priority + Toggle */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Priority: {rule.priority}
                        </span>
                        <div className="flex items-center gap-2">
                          <Toggle
                            checked={rule.enabled !== false}
                            onChange={(enabled) =>
                              onUpdateRule(rule.id, { enabled })
                            }
                          />
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            {rule.enabled !== false ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    {rule.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 ml-11">
                        {rule.description}
                      </p>
                    )}

                    {/* Match Criteria Summary */}
                    <div className="mb-3 ml-11 flex flex-wrap gap-2">
                      {rule.match.tool && (
                        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs">
                          <Code className="h-3 w-3" />
                          <span className="font-mono">
                            {formatToolMatch(rule.match.tool)}
                          </span>
                          <Badge
                            variant="outline"
                            className="ml-1 text-[10px] px-1 py-0"
                          >
                            {getToolTypeLabel(rule.match.tool)}
                          </Badge>
                        </div>
                      )}
                      {rule.match.agentIdentity && (
                        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs opacity-50">
                          <span className="font-medium">Agent:</span>
                          <span>{rule.match.agentIdentity}</span>
                          <span className="text-green-600 dark:text-green-400">
                            (Coming Soon)
                          </span>
                        </div>
                      )}
                      {rule.match.inputParameters && (
                        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-xs opacity-50">
                          <span className="font-medium">Input Params</span>
                          <span className="text-purple-600 dark:text-purple-400">
                            (Coming Soon)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Right Actions */}
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleEditRule(rule)}
                        className="gap-1 bg-blueprint-500 hover:bg-blueprint-600 text-white"
                      >
                        <Edit2 className="h-3 w-3" />
                        Edit
                      </Button>
                    </div>
                  </div>

                  {/* Drop indicator line after this card */}
                  {dragOverIndex === index && dropPosition === "after" && (
                    <div className="absolute -bottom-2 left-0 right-0 z-10">
                      <div className="h-1 bg-blueprint-500 rounded-full shadow-lg" />
                      <div className="absolute right-0 top-0 -translate-y-1 w-3 h-3 bg-blueprint-500 rounded-full" />
                    </div>
                  )}
                </div>
              ))}

              {/* Drop indicator for bottom of list */}
              {draggedRule &&
                dragOverIndex === sortedRules.length - 1 &&
                dropPosition === "after" && (
                  <div className="relative">
                    <div className="h-1 bg-blueprint-500 rounded-full shadow-lg" />
                    <div className="absolute right-0 top-0 -translate-y-1 w-3 h-3 bg-blueprint-500 rounded-full" />
                  </div>
                )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rule Creation/Edit Modal */}
      <RuleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveRule}
        rule={editingRule}
        existingPriorities={rules.map((r) => r.priority)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirmation}
        onClose={cancelDelete}
        onConfirm={confirmDelete}
        title="Delete Rules"
        message={`Are you sure you want to delete ${rulesToDelete.size} rule${rulesToDelete.size > 1 ? "s" : ""}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </>
  );
};
