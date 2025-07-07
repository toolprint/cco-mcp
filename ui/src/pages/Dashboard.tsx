import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuditLogList } from "../components/AuditLogList";
import { StatusFilter } from "../components/StatusFilter";
import { useAuditLogWithSSE } from "../hooks/useAuditLogWithSSE";
import type { AuditLogState, AuditLogEntry } from "../types/audit";
import { Header } from "../components/layout/header";

export function Dashboard() {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const [selectedState, setSelectedState] = useState<AuditLogState | "ALL">(
    "ALL"
  );
  const navigate = useNavigate();

  const { entries, loading, error, refetch, approve, deny, isConnected } =
    useAuditLogWithSSE({
      state: selectedState === "ALL" ? undefined : selectedState,
    });

  useEffect(() => {
    // Check API health
    fetch("/api/audit-log")
      .then((res) => (res.ok ? setIsHealthy(true) : setIsHealthy(false)))
      .catch(() => setIsHealthy(false));
  }, []);

  const handleCreateRule = (entry: AuditLogEntry) => {
    // Navigate to config page with pre-populated data
    navigate("/config", {
      state: {
        createRuleData: {
          toolName: entry.tool_name,
          agentIdentity: entry.agent_identity,
          action: "review" as const,
        },
      },
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Header isConnected={isConnected} isHealthy={isHealthy} onRefresh={refetch} loading={loading} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                Audit Log Entries
              </h2>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {entries.length} entries
              </div>
            </div>

            <StatusFilter
              selectedState={selectedState}
              onStateChange={setSelectedState}
            />
          </div>

          <AuditLogList
            entries={entries}
            loading={loading}
            error={error}
            onApprove={approve}
            onDeny={deny}
            onCreateRule={handleCreateRule}
          />
        </div>
      </main>
    </div>
  );
}