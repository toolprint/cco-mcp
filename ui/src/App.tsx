import { useEffect, useState } from "react";
import { Shield, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { AuditLogList } from "./components/AuditLogList";
import { StatusFilter } from "./components/StatusFilter";
import { useAuditLogWithSSE } from "./hooks/useAuditLogWithSSE";
import type { AuditLogState } from "./types/audit";

function App() {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const [selectedState, setSelectedState] = useState<AuditLogState | "ALL">(
    "ALL"
  );

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

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center">
              <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              <h1 className="ml-3 text-xl font-semibold text-gray-900 dark:text-white">
                CCO-MCP Audit Dashboard
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={refetch}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                disabled={loading}
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  {isConnected ? (
                    <Wifi className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-gray-400" />
                  )}
                  <span className="ml-1 text-sm text-gray-600 dark:text-gray-300">
                    {isConnected ? "Live" : "Offline"}
                  </span>
                </div>
                <div className="flex items-center">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      isHealthy === null
                        ? "bg-gray-400"
                        : isHealthy
                          ? "bg-green-500"
                          : "bg-red-500"
                    }`}
                  />
                  <span className="ml-2 text-sm text-gray-600 dark:text-gray-300">
                    {isHealthy === null
                      ? "Checking..."
                      : isHealthy
                        ? "API Connected"
                        : "API Disconnected"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

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
          />
        </div>
      </main>
    </div>
  );
}

export default App;
