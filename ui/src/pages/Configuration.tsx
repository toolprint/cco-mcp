import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Header } from "../components/layout/header";
import { ApprovalSettings } from "../components/config/ApprovalSettings";
import { RulesList } from "../components/config/RulesList";
import { RuleModal } from "../components/config/RuleModal";
import { useConfiguration } from "../hooks/useConfiguration";
import { useConfigurationRules } from "../hooks/useConfigurationRules";
import { useToast } from "../hooks/useToast";
import { ToastContainer } from "../components/Toast";
import type { ApprovalRule } from "../types/config";

export function Configuration() {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const [showCreateRuleModal, setShowCreateRuleModal] = useState(false);
  const [configRefreshTrigger, setConfigRefreshTrigger] = useState(0);

  const location = useLocation();
  const navigate = useNavigate();
  const { config, loading, error, patchConfig, refetch } = useConfiguration();
  const rulesApi = useConfigurationRules();
  const {
    toasts,
    removeToast,
    success: showSuccess,
    error: showError,
  } = useToast();

  // Check if we have pre-populated data from navigation
  const createRuleData = location.state?.createRuleData;

  useEffect(() => {
    // Check API health
    fetch("/health")
      .then((res) => {
        const healthy = res.ok;
        setIsHealthy(healthy);
      })
      .catch(() => {
        setIsHealthy(false);
      });
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
        defaultAction: settings.defaultAction,
        timeout: settings.timeout,
      },
    });

    if (result.success) {
      showSuccess("Settings updated successfully");
      // Trigger header refresh to update warning banner
      setConfigRefreshTrigger((prev) => prev + 1);
    } else {
      showError(result.error || "Failed to update settings");
    }
  };

  const handleCreateRule = async (rule: Omit<ApprovalRule, "id">) => {
    const result = await rulesApi.createRule(rule as ApprovalRule);

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
        <Header isHealthy={isHealthy} />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500 dark:text-gray-400">
              Loading configuration...
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <Header isHealthy={isHealthy} />
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
      <Header
        isHealthy={isHealthy}
        configRefreshTrigger={configRefreshTrigger}
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Approval Configuration
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Manage approval settings and rules for tool calls
            </p>
          </div>
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Dashboard
          </button>
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
            onRebalancePriorities={rulesApi.rebalancePriorities}
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
          existingPriorities={config.approvals.rules.map((r) => r.priority)}
          prePopulatedData={createRuleData}
        />
      )}

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
