import type { ApprovalRule } from "../types/config";

export interface PriorityUtils {
  /**
   * Calculate the next priority value to place a new rule at the end
   */
  calculateNextPriority: (existingPriorities: number[]) => number;
  
  /**
   * Check if priorities need rebalancing (gaps too large, conflicts, etc.)
   */
  needsRebalancing: (priorities: number[]) => boolean;
  
  /**
   * Generate a rebalanced set of priorities
   */
  rebalancePriorities: (rules: ApprovalRule[]) => Array<{ id: string; priority: number }>;
  
  /**
   * Find a safe priority value that doesn't conflict with existing ones
   */
  findSafePriority: (existingPriorities: number[], preferredPriority?: number) => number;
}

const PRIORITY_STEP = 10;
const MAX_PRIORITY_GAP = 100;
const MIN_PRIORITY = 10;

export const priorityUtils: PriorityUtils = {
  calculateNextPriority: (existingPriorities: number[]): number => {
    if (existingPriorities.length === 0) {
      return MIN_PRIORITY;
    }
    
    // Sort priorities to find the highest
    const sortedPriorities = [...existingPriorities].sort((a, b) => a - b);
    const maxPriority = sortedPriorities[sortedPriorities.length - 1];
    
    // Always add at the end with a safe gap
    return maxPriority + PRIORITY_STEP;
  },

  needsRebalancing: (priorities: number[]): boolean => {
    if (priorities.length <= 1) return false;
    
    const sortedPriorities = [...priorities].sort((a, b) => a - b);
    
    // Check for duplicates
    const uniquePriorities = new Set(sortedPriorities);
    if (uniquePriorities.size !== sortedPriorities.length) {
      return true;
    }
    
    // Check for large gaps
    for (let i = 1; i < sortedPriorities.length; i++) {
      const gap = sortedPriorities[i] - sortedPriorities[i - 1];
      if (gap > MAX_PRIORITY_GAP) {
        return true;
      }
    }
    
    // Check if priorities are not well-spaced (too close together)
    for (let i = 1; i < sortedPriorities.length; i++) {
      const gap = sortedPriorities[i] - sortedPriorities[i - 1];
      if (gap < PRIORITY_STEP && gap > 0) {
        return true;
      }
    }
    
    return false;
  },

  rebalancePriorities: (rules: ApprovalRule[]): Array<{ id: string; priority: number }> => {
    // Sort rules by current priority, then by creation order (using ID as tiebreaker)
    const sortedRules = [...rules].sort((a, b) => {
      if (a.priority === b.priority) {
        return a.id.localeCompare(b.id);
      }
      return a.priority - b.priority;
    });
    
    // Generate new priorities with consistent gaps
    return sortedRules.map((rule, index) => ({
      id: rule.id,
      priority: MIN_PRIORITY + (index * PRIORITY_STEP),
    }));
  },

  findSafePriority: (existingPriorities: number[], preferredPriority?: number): number => {
    const sortedPriorities = [...existingPriorities].sort((a, b) => a - b);
    
    // If no preferred priority, use the next available at the end
    if (preferredPriority === undefined) {
      return priorityUtils.calculateNextPriority(existingPriorities);
    }
    
    // If preferred priority is not taken, use it
    if (!sortedPriorities.includes(preferredPriority)) {
      return preferredPriority;
    }
    
    // Find the next available priority after the preferred one
    let candidate = preferredPriority;
    while (sortedPriorities.includes(candidate)) {
      candidate += PRIORITY_STEP;
    }
    
    return candidate;
  },
};

/**
 * Helper function to check if a priority update operation might cause conflicts
 */
export const validatePriorityUpdate = (
  ruleId: string,
  newPriority: number,
  existingRules: ApprovalRule[]
): { isValid: boolean; conflictingRule?: ApprovalRule; suggestedPriority?: number } => {
  const otherRules = existingRules.filter(rule => rule.id !== ruleId);
  const otherPriorities = otherRules.map(rule => rule.priority);
  
  // Check if the new priority conflicts with existing ones
  const conflictingRule = otherRules.find(rule => rule.priority === newPriority);
  
  if (conflictingRule) {
    const suggestedPriority = priorityUtils.findSafePriority(otherPriorities, newPriority);
    return {
      isValid: false,
      conflictingRule,
      suggestedPriority,
    };
  }
  
  return { isValid: true };
};