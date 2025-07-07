import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Header } from "../components/layout/header";
import { ApprovalSettings } from "../components/config/ApprovalSettings";
import { RulesList } from "../components/config/RulesList";
import { RuleModal } from "../components/config/RuleModal";
import { useConfiguration } from "../hooks/useConfiguration";
import { useConfigurationRules } from "../hooks/useConfigurationRules";
import { useToast } from "../hooks/useToast";
import type { ApprovalRule } from "../types/config";

export function Configuration() {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const [isConnected] = useState(false); // SSE not needed on config page
  const [showCreateRuleModal, setShowCreateRuleModal] = useState(false);
  
  const location = useLocation();
  const { config, loading, error, patchConfig, refetch } = useConfiguration();
  const rulesApi = useConfigurationRules();
  const { success: showSuccess, error: showError } = useToast();

  // Check if we have pre-populated data from navigation
  const createRuleData = location.state?.createRuleData;

  useEffect(() => {
    // Check API health
    fetch("/health")
      .then((res) => (res.ok ? setIsHealthy(true) : setIsHealthy(false)))
      .catch(() => setIsHealthy(false));
  }, []);

  useEffect(() => {
    // If we have pre-populated data, open the create rule modal
    if (createRuleData && config) {
      setShowCreateRuleModal(true);
    }
  }, [createRuleData, config]);

  const handleToggleApprovals = async (enabled: boolean) => {
    const result = await patchConfig({
      approvals: {
        ...config?.approvals!,
        enabled,
      },
    });

    if (result.success) {
      showSuccess(`Approval system ${enabled ? "enabled" : "disabled"}`);
    } else {
      showError(result.error || "Failed to update configuration");
    }
  };

  const handleUpdateSettings = async (settings: {
    defaultAction: "approve" | "deny" | "review";
    timeout: {
      duration: number;
      defaultAction: "approve" | "deny";
    };
  }) => {
    const result = await patchConfig({
      approvals: {
        ...config?.approvals!,
        ...settings,
      },
    });

    if (result.success) {
      showSuccess("Settings updated successfully");
    } else {
      showError(result.error || "Failed to update settings");
    }
  };

  const handleCreateRule = async (rule: Omit<ApprovalRule, "id">) => {
    const result = await rulesApi.createRule(rule);
    
    if (result.success) {
      showSuccess("Rule created successfully");
      await refetch(); // Refresh config to get updated rules
      setShowCreateRuleModal(false);
      // Clear navigation state
      window.history.replaceState({}, document.title);
    } else {
      showError(result.error || "Failed to create rule");
    }
  };

  const handleUpdateRule = async (id: string, rule: Partial<ApprovalRule>) => {
    const result = await rulesApi.updateRule(id, rule);
    
    if (result.success) {
      showSuccess("Rule updated successfully");
      await refetch(); // Refresh config to get updated rules
    } else {
      showError(result.error || "Failed to update rule");
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) {
      return;
    }

    const result = await rulesApi.deleteRule(id);
    
    if (result.success) {
      showSuccess("Rule deleted successfully");
      await refetch(); // Refresh config to get updated rules
    } else {
      showError(result.error || "Failed to delete rule");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <Header isConnected={isConnected} isHealthy={isHealthy} />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500 dark:text-gray-400">Loading configuration...</div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <Header isConnected={isConnected} isHealthy={isHealthy} />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow">
            <div className="text-red-600 dark:text-red-400">
              {error || "Failed to load configuration"}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Header isConnected={isConnected} isHealthy={isHealthy} />
      
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Approval Configuration
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Manage approval settings and rules for tool calls
          </p>
        </div>

        <div className="space-y-8">
          {/* Approval Settings */}
          <ApprovalSettings
            enabled={config.approvals.enabled}
            defaultAction={config.approvals.defaultAction}
            timeout={config.approvals.timeout}
            onToggleEnabled={handleToggleApprovals}
            onUpdateSettings={handleUpdateSettings}
          />

          {/* Rules Management */}
          <RulesList
            rules={config.approvals.rules}
            onCreateRule={handleCreateRule}
            onUpdateRule={handleUpdateRule}
            onDeleteRule={handleDeleteRule}
            onTestRule={rulesApi.testRule}
          />
        </div>
      </main>

      {/* Create Rule Modal (shown when navigating from dashboard) */}
      {showCreateRuleModal && (
        <RuleModal
          isOpen={showCreateRuleModal}
          onClose={() => {
            setShowCreateRuleModal(false);
            // Clear navigation state
            window.history.replaceState({}, document.title);
          }}
          onSave={handleCreateRule}
          existingPriorities={config.approvals.rules.map(r => r.priority)}
          prePopulatedData={createRuleData}
        />
      )}
    </div>
  );
}