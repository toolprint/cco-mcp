import { useState, useCallback } from "react";
import { priorityUtils, validatePriorityUpdate } from "../utils/priority";
import type { ApprovalRule, RuleTestRequest, RuleTestResponse } from "../types/config";

export function useConfigurationRules() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch("/api/config/rules");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data.rules || [];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch rules";
      setError(errorMessage);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const createRule = useCallback(async (rule: ApprovalRule) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch("/api/config/rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(rule),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return { success: true, rule: data.rule };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create rule";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  const updateRule = useCallback(async (id: string, rule: Partial<ApprovalRule>) => {
    setLoading(true);
    setError(null);
    
    try {
      // If updating priority, validate it doesn't conflict
      if (rule.priority !== undefined) {
        const currentRules = await getRules();
        const validation = validatePriorityUpdate(id, rule.priority, currentRules);
        
        if (!validation.isValid && validation.suggestedPriority) {
          // Use the suggested priority to avoid conflicts
          rule.priority = validation.suggestedPriority;
        }
      }

      const response = await fetch(`/api/config/rules/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(rule),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return { success: true, rule: data.rule };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update rule";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteRule = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/config/rules/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete rule";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  const testRule = useCallback(async (testData: RuleTestRequest): Promise<RuleTestResponse> => {
    try {
      const response = await fetch("/api/config/rules/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(testData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      return {
        matched: false,
        reason: err instanceof Error ? err.message : "Test failed",
      };
    }
  }, []);

  const rebalancePriorities = useCallback(async (rules: ApprovalRule[]) => {
    setLoading(true);
    setError(null);
    
    try {
      const updates = priorityUtils.rebalancePriorities(rules);
      const results = [];
      
      // Apply updates sequentially to avoid conflicts
      for (const update of updates) {
        const result = await updateRule(update.id, { priority: update.priority });
        results.push(result);
        
        if (!result.success) {
          throw new Error(`Failed to update rule ${update.id}: ${result.error}`);
        }
      }
      
      return { success: true, updates: results };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to rebalance priorities";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [updateRule]);

  const checkAndRebalanceIfNeeded = useCallback(async (rules: ApprovalRule[]) => {
    const priorities = rules.map(rule => rule.priority);
    
    if (priorityUtils.needsRebalancing(priorities)) {
      return await rebalancePriorities(rules);
    }
    
    return { success: true, rebalanceNeeded: false };
  }, [rebalancePriorities]);

  return {
    loading,
    error,
    getRules,
    createRule,
    updateRule,
    deleteRule,
    testRule,
    rebalancePriorities,
    checkAndRebalanceIfNeeded,
  };
}