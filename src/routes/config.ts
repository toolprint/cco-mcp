import { Router, Request, Response } from "express";
import { z } from "zod";
import logger from "../logger.js";
import { getConfigurationService } from "../services/ConfigurationService.js";
import {
  CCOMCPConfigSchema,
  ApprovalRuleSchema,
  validateConfig,
  validateApprovalRule,
} from "../config/schema.js";
import { ApprovalRule, CCOMCPConfig } from "../config/types.js";

/**
 * Create configuration routes
 */
export function createConfigRoutes(): Router {
  const router = Router();

  /**
   * GET /api/config
   * Get current configuration
   */
  router.get("/config", async (req: Request, res: Response) => {
    try {
      const configService = getConfigurationService();
      const config = configService.getConfig();

      res.status(200).json({
        config,
        status: {
          autoApprovalEnabled: configService.isAutoApprovalEnabled(),
          ruleCount: config.approvals.rules.length,
          activeRuleCount: config.approvals.rules.filter(
            (r) => r.enabled !== false
          ).length,
        },
      });
    } catch (error) {
      logger.error({ error }, "Failed to get configuration");
      res.status(500).json({
        error: "Failed to get configuration",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * PUT /api/config
   * Update full configuration
   */
  router.put("/config", async (req: Request, res: Response) => {
    try {
      const validation = validateConfig(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid configuration",
          details: validation.error.errors,
        });
      }

      const configService = getConfigurationService();
      configService.saveConfiguration(validation.data);

      logger.info("Configuration updated via API");

      res.status(200).json({
        message: "Configuration updated successfully",
        config: validation.data,
      });
    } catch (error) {
      logger.error({ error }, "Failed to update configuration");
      res.status(500).json({
        error: "Failed to update configuration",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * PATCH /api/config
   * Partially update configuration
   */
  router.patch("/config", async (req: Request, res: Response) => {
    try {
      const configService = getConfigurationService();
      const currentConfig = configService.getConfig();

      // Deep merge current config with updates
      const updatedConfig = {
        ...currentConfig,
        ...req.body,
        approvals: req.body.approvals
          ? {
              ...currentConfig.approvals,
              ...req.body.approvals,
              // Handle nested timeout object if present
              timeout: req.body.approvals.timeout
                ? {
                    ...currentConfig.approvals.timeout,
                    ...req.body.approvals.timeout,
                  }
                : currentConfig.approvals.timeout,
              // Preserve rules array if not explicitly provided
              rules: req.body.approvals.rules || currentConfig.approvals.rules,
            }
          : currentConfig.approvals,
      };

      const validation = validateConfig(updatedConfig);

      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid configuration",
          details: validation.error.errors,
        });
      }

      configService.saveConfiguration(validation.data);

      logger.info("Configuration partially updated via API");

      res.status(200).json({
        message: "Configuration updated successfully",
        config: validation.data,
      });
    } catch (error) {
      logger.error({ error }, "Failed to update configuration");
      res.status(500).json({
        error: "Failed to update configuration",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/config/validate
   * Validate configuration without saving
   */
  router.post("/config/validate", async (req: Request, res: Response) => {
    try {
      const validation = validateConfig(req.body);

      if (validation.success) {
        res.status(200).json({
          valid: true,
          message: "Configuration is valid",
        });
      } else {
        res.status(400).json({
          valid: false,
          errors: validation.error.errors,
        });
      }
    } catch (error) {
      logger.error({ error }, "Failed to validate configuration");
      res.status(500).json({
        error: "Failed to validate configuration",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/config/rules
   * List all approval rules
   */
  router.get("/config/rules", async (req: Request, res: Response) => {
    try {
      const configService = getConfigurationService();
      const config = configService.getConfig();

      // Sort rules by priority
      const sortedRules = [...config.approvals.rules].sort(
        (a, b) => a.priority - b.priority
      );

      res.status(200).json({
        rules: sortedRules,
        total: sortedRules.length,
        active: sortedRules.filter((r) => r.enabled !== false).length,
      });
    } catch (error) {
      logger.error({ error }, "Failed to get rules");
      res.status(500).json({
        error: "Failed to get rules",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/config/rules
   * Add a new approval rule
   */
  router.post("/config/rules", async (req: Request, res: Response) => {
    try {
      const validation = validateApprovalRule(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid rule",
          details: validation.error.errors,
        });
      }

      const configService = getConfigurationService();
      const config = configService.getConfig();

      // Check for duplicate rule ID
      if (config.approvals.rules.some((r) => r.id === validation.data.id)) {
        return res.status(409).json({
          error: "Rule with this ID already exists",
        });
      }

      // Auto-fix duplicate priority if needed
      if (
        config.approvals.rules.some(
          (r) => r.priority === validation.data.priority
        )
      ) {
        // Find the next available priority
        const existingPriorities = config.approvals.rules
          .map((r) => r.priority)
          .sort((a, b) => a - b);
        let newPriority = validation.data.priority;

        // Keep incrementing by 10 until we find an unused priority
        while (existingPriorities.includes(newPriority)) {
          newPriority += 10;
        }

        validation.data.priority = newPriority;
        logger.info(
          {
            originalPriority: req.body.priority,
            assignedPriority: newPriority,
          },
          "Auto-assigned new priority to avoid conflict"
        );
      }

      configService.addRule(validation.data);

      logger.info({ ruleId: validation.data.id }, "Rule added via API");

      res.status(201).json({
        message: "Rule added successfully",
        rule: validation.data,
      });
    } catch (error) {
      logger.error({ error }, "Failed to add rule");
      res.status(500).json({
        error: "Failed to add rule",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * PUT /api/config/rules/:id
   * Update an existing rule
   */
  router.put("/config/rules/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const configService = getConfigurationService();
      const config = configService.getConfig();

      // Find existing rule
      const existingRule = config.approvals.rules.find((r) => r.id === id);
      if (!existingRule) {
        return res.status(404).json({
          error: "Rule not found",
        });
      }

      // Merge with existing rule
      const updatedRule = {
        ...existingRule,
        ...req.body,
        id, // Ensure ID cannot be changed
      };

      const validation = validateApprovalRule(updatedRule);

      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid rule",
          details: validation.error.errors,
        });
      }

      // Auto-fix duplicate priority if needed (excluding current rule)
      if (
        config.approvals.rules.some(
          (r) => r.id !== id && r.priority === validation.data.priority
        )
      ) {
        // Find the next available priority
        const existingPriorities = config.approvals.rules
          .filter((r) => r.id !== id)
          .map((r) => r.priority)
          .sort((a, b) => a - b);
        let newPriority = validation.data.priority;

        // Keep incrementing by 10 until we find an unused priority
        while (existingPriorities.includes(newPriority)) {
          newPriority += 10;
        }

        validation.data.priority = newPriority;
        logger.info(
          {
            ruleId: id,
            originalPriority: req.body.priority,
            assignedPriority: newPriority,
          },
          "Auto-assigned new priority to avoid conflict during update"
        );
      }

      configService.updateRule(id, validation.data);

      logger.info({ ruleId: id }, "Rule updated via API");

      res.status(200).json({
        message: "Rule updated successfully",
        rule: validation.data,
      });
    } catch (error) {
      logger.error({ error }, "Failed to update rule");
      res.status(500).json({
        error: "Failed to update rule",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * DELETE /api/config/rules/:id
   * Delete a rule
   */
  router.delete("/config/rules/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const configService = getConfigurationService();
      const config = configService.getConfig();

      // Check if rule exists
      if (!config.approvals.rules.some((r) => r.id === id)) {
        return res.status(404).json({
          error: "Rule not found",
        });
      }

      configService.removeRule(id);

      logger.info({ ruleId: id }, "Rule deleted via API");

      res.status(200).json({
        message: "Rule deleted successfully",
      });
    } catch (error) {
      logger.error({ error }, "Failed to delete rule");
      res.status(500).json({
        error: "Failed to delete rule",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/config/rules/test
   * Test rule matching against a simulated tool call
   */
  router.post("/config/rules/test", async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        toolName: z.string(),
        agentIdentity: z.string().optional(),
        input: z.record(z.any()).default({}),
      });

      const validation = schema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid test data",
          details: validation.error.errors,
        });
      }

      const configService = getConfigurationService();
      const toolCall = validation.data;

      // Get the action that would be taken
      const { action, rule, timeout } =
        configService.getActionForToolCall(toolCall);

      // Get all matching rules for debugging
      const config = configService.getConfig();
      const matchingRules: any[] = [];

      for (const r of config.approvals.rules) {
        const result = configService.matchRules({
          ...toolCall,
          // Test against specific rule
        });
        if (result.matched && result.rule?.id === r.id) {
          matchingRules.push({
            rule: r,
            priority: r.priority,
          });
        }
      }

      res.status(200).json({
        toolCall,
        result: {
          action,
          rule: rule
            ? {
                id: rule.id,
                name: rule.name,
                priority: rule.priority,
              }
            : null,
          timeout,
          reason: rule
            ? `Matched rule: ${rule.name}`
            : `Default action: ${action}`,
        },
        matchingRules,
        autoApprovalEnabled: configService.isAutoApprovalEnabled(),
      });
    } catch (error) {
      logger.error({ error }, "Failed to test rules");
      res.status(500).json({
        error: "Failed to test rules",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
