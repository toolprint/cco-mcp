import React, { useState } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Plus, Edit2, Trash2, GripVertical, TestTube, CheckCircle, XCircle } from "lucide-react";
import { RuleModal } from "./RuleModal";
import { cn } from "../../lib/utils";
import type { ApprovalRule, RuleTestRequest } from "../../types/config";

interface RulesListProps {
  rules: ApprovalRule[];
  onCreateRule: (rule: Omit<ApprovalRule, "id">) => void;
  onUpdateRule: (id: string, rule: Partial<ApprovalRule>) => void;
  onDeleteRule: (id: string) => void;
  onTestRule: (test: RuleTestRequest) => Promise<{ matched: boolean; rule?: ApprovalRule; reason: string }>;
}

export const RulesList: React.FC<RulesListProps> = ({
  rules,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
  onTestRule,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ApprovalRule | null>(null);
  const [testingRuleId, setTestingRuleId] = useState<string | null>(null);

  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  const handleCreateRule = () => {
    setEditingRule(null);
    setIsModalOpen(true);
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

  const handleTestRule = async (ruleId: string) => {
    setTestingRuleId(ruleId);
    // For demo purposes, we'll use a sample test
    const testData: RuleTestRequest = {
      toolName: "Read",
      agentIdentity: "claude-code",
      input: { file_path: "/tmp/test.txt" },
    };
    
    const result = await onTestRule(testData);
    
    // Show result (in a real app, this would be a proper UI)
    setTimeout(() => {
      alert(`Test Result: ${result.matched ? 'Matched' : 'No match'} - ${result.reason}`);
      setTestingRuleId(null);
    }, 500);
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

  const getPatternTypeLabel = (type: string) => {
    switch (type) {
      case "exact":
        return "Exact";
      case "wildcard":
        return "Wildcard";
      case "regex":
        return "Regex";
      default:
        return type;
    }
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
            <Button
              onClick={handleCreateRule}
              className="gap-2 bg-blueprint-600 hover:bg-blueprint-700 text-white"
            >
              <Plus className="h-4 w-4" />
              Add Rule
            </Button>
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
              {sortedRules.map((rule) => (
                <div
                  key={rule.id}
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-lg border transition-colors",
                    rule.enabled !== false
                      ? "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                      : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60"
                  )}
                >
                  {/* Drag Handle */}
                  <div className="pt-1 cursor-move text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <GripVertical className="h-5 w-5" />
                  </div>

                  {/* Rule Content */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
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
                          {rule.enabled === false && (
                            <Badge variant="outline" className="text-xs">
                              Disabled
                            </Badge>
                          )}
                        </div>
                        {rule.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {rule.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Priority: {rule.priority}
                        </span>
                      </div>
                    </div>

                    {/* Match Criteria Summary */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {rule.match.toolName && (
                        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs">
                          <span className="font-medium">Tool:</span>
                          <span>{rule.match.toolName.value}</span>
                          <span className="text-blue-600 dark:text-blue-400">
                            ({getPatternTypeLabel(rule.match.toolName.type)})
                          </span>
                        </div>
                      )}
                      {rule.match.agentIdentity && (
                        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs">
                          <span className="font-medium">Agent:</span>
                          <span>{rule.match.agentIdentity.value}</span>
                          <span className="text-green-600 dark:text-green-400">
                            ({getPatternTypeLabel(rule.match.agentIdentity.type)})
                          </span>
                        </div>
                      )}
                      {rule.match.conditions && rule.match.conditions.length > 0 && (
                        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-xs">
                          <span className="font-medium">Conditions:</span>
                          <span>{rule.match.conditions.length}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditRule(rule)}
                        className="gap-1"
                      >
                        <Edit2 className="h-3 w-3" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleTestRule(rule.id)}
                        disabled={testingRuleId === rule.id}
                        className="gap-1"
                      >
                        <TestTube className="h-3 w-3" />
                        {testingRuleId === rule.id ? "Testing..." : "Test"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDeleteRule(rule.id)}
                        className="gap-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onUpdateRule(rule.id, { enabled: !rule.enabled })}
                        className="gap-1"
                      >
                        {rule.enabled !== false ? (
                          <>
                            <XCircle className="h-3 w-3" />
                            Disable
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-3 w-3" />
                            Enable
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
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
        existingPriorities={rules.map(r => r.priority)}
      />
    </>
  );
};