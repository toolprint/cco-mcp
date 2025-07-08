import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Filter, BarChart3, X, Settings } from "lucide-react";
import { AuditLogList } from "./components/AuditLogList";
import { StatusFilter } from "./components/StatusFilter";
import { SearchBar } from "./components/SearchBar";
import { AgentFilter } from "./components/AgentFilter";
import { Pagination } from "./components/Pagination";
import { ToastContainer } from "./components/Toast";
import { EmptyState } from "./components/EmptyState";
import { Statistics } from "./components/Statistics";
import { RuleModal } from "./components/config/RuleModal";
import { useAuditLogWithSSE } from "./hooks/useAuditLogWithSSE";
import { useToast } from "./hooks/useToast";
import { useConfiguration } from "./hooks/useConfiguration";
import { useConfigurationRules } from "./hooks/useConfigurationRules";
import { migrateRules } from "./utils/ruleMigration";
import type { AuditLogState, AuditLogEntry } from "./types/audit";
import type { ApprovalRule } from "./types/config";
import { Header } from "./components/layout/header";
import { Footer } from "./components/layout/footer";
import { Button } from "./components/ui/button";
import { Card, CardContent } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { cn } from "./lib/utils";

const ITEMS_PER_PAGE = 10;

function AppFinal() {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const [selectedState, setSelectedState] = useState<AuditLogState | "ALL">(
    "ALL"
  );
  const [selectedAgent, setSelectedAgent] = useState<string | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const [showCreateRuleModal, setShowCreateRuleModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const navigate = useNavigate();
  const { toasts, removeToast, info, success, error: showError } = useToast();
  const { config } = useConfiguration();
  const rulesApi = useConfigurationRules();
  const entriesRef = useRef<Set<string>>(new Set());

  const {
    entries: allEntries,
    loading,
    error,
    refetch,
    approve,
    deny,
  } = useAuditLogWithSSE({
    state: selectedState === "ALL" ? undefined : selectedState,
    agent_identity: selectedAgent === "ALL" ? undefined : selectedAgent,
    search: searchQuery || undefined,
  });

  // Check if filters are active
  const hasActiveFilters =
    selectedState !== "ALL" || selectedAgent !== "ALL" || searchQuery !== "";

  // Filter and paginate entries
  const { paginatedEntries, totalPages } = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return {
      paginatedEntries: allEntries.slice(startIndex, endIndex),
      totalPages: Math.ceil(allEntries.length / ITEMS_PER_PAGE),
    };
  }, [allEntries, currentPage]);

  // Get unique agents for filter
  const uniqueAgents = useMemo(() => {
    const agents = new Set(allEntries.map((entry) => entry.agent_identity));
    return Array.from(agents);
  }, [allEntries]);

  // Show notifications for new entries that need review
  useEffect(() => {
    allEntries.forEach((entry) => {
      if (entry.state === "NEEDS_REVIEW" && !entriesRef.current.has(entry.id)) {
        entriesRef.current.add(entry.id);
        info(`New approval request from ${entry.agent_identity}`);
      }
    });

    // Cleanup old entries from ref to prevent memory leak
    const currentIds = new Set(allEntries.map((e) => e.id));
    entriesRef.current.forEach((id) => {
      if (!currentIds.has(id)) {
        entriesRef.current.delete(id);
      }
    });
  }, [allEntries, info]);

  const handleApprove = useCallback(
    async (id: string) => {
      try {
        await approve(id);
        success("Entry approved successfully");
      } catch {
        showError("Failed to approve entry");
      }
    },
    [approve, success, showError]
  );

  const handleDeny = useCallback(
    async (id: string) => {
      try {
        await deny(id);
        success("Entry denied successfully");
      } catch {
        showError("Failed to deny entry");
      }
    },
    [deny, success, showError]
  );

  const clearFilters = useCallback(() => {
    setSelectedState("ALL");
    setSelectedAgent("ALL");
    setSearchQuery("");
  }, []);

  const handleCreateRule = useCallback((entry: AuditLogEntry) => {
    setSelectedEntry(entry);
    setShowCreateRuleModal(true);
  }, []);

  const handleSaveRule = useCallback(async (rule: ApprovalRule) => {
    const result = await rulesApi.createRule(rule);
    
    if (result.success) {
      success("Rule created successfully");
      setShowCreateRuleModal(false);
      setSelectedEntry(null);
    } else {
      showError(result.error || "Failed to create rule");
    }
  }, [rulesApi, success, showError]);

  useEffect(() => {
    // Check API health
    fetch("/api/audit-log")
      .then((res) => (res.ok ? setIsHealthy(true) : setIsHealthy(false)))
      .catch(() => setIsHealthy(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col relative">
      {/* Blueprint grid background pattern */}
      <div className="fixed inset-0 blueprint-grid opacity-10 pointer-events-none" />

      <Header isHealthy={isHealthy} />

      <main className="flex-1 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 w-full">
        {/* Action Bar */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => setShowStats(!showStats)}
              variant={showStats ? "blueprint" : "blueprint-outline"}
              size="sm"
              className="gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              Statistics
            </Button>
            <Button
              onClick={() => setShowFilters(!showFilters)}
              variant={
                showFilters || hasActiveFilters
                  ? "blueprint"
                  : "blueprint-outline"
              }
              size="sm"
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              Filters
              {hasActiveFilters && (
                <Badge variant="blueprint" className="ml-1 px-1 py-0 text-xs">
                  {
                    [
                      selectedState !== "ALL",
                      selectedAgent !== "ALL",
                      searchQuery !== "",
                    ].filter(Boolean).length
                  }
                </Badge>
              )}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => navigate("/config")}
              variant="blueprint-outline"
              size="sm"
              className="gap-2"
            >
              <Settings className="h-4 w-4" />
              Configuration
            </Button>
            <Button
              onClick={refetch}
              variant="blueprint-outline"
              size="sm"
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Statistics */}
        {showStats && (
          <div className="mb-6 animate-fade-in">
            <Statistics entries={allEntries} />
          </div>
        )}

        {/* Main Content Card */}
        <Card className="border-gray-200 dark:border-gray-700 shadow-lg bg-white dark:bg-gray-800">
          {/* Filters */}
          {showFilters && (
            <div className="border-b border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-900/50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatusFilter
                  selectedState={selectedState}
                  onStateChange={setSelectedState}
                />
                <AgentFilter
                  selectedAgent={selectedAgent}
                  onAgentChange={setSelectedAgent}
                  agents={uniqueAgents}
                />
                <SearchBar
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                />
              </div>
              {hasActiveFilters && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing filtered results
                  </p>
                  <Button
                    onClick={clearFilters}
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-blueprint-600 hover:text-blueprint-700"
                  >
                    <X className="h-4 w-4" />
                    Clear filters
                  </Button>
                </div>
              )}
            </div>
          )}

          <CardContent className="p-6">
            {/* Content */}
            {error ? (
              <div className="rounded-lg bg-destructive/10 p-4 text-center">
                <p className="text-sm text-destructive">
                  Error loading audit logs:{" "}
                  {error ? String(error) : "Unknown error"}
                </p>
              </div>
            ) : loading && allEntries.length === 0 ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-24 bg-gray-100 dark:bg-gray-700 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : paginatedEntries.length === 0 ? (
              <EmptyState
                hasFilters={hasActiveFilters}
                onClearFilters={clearFilters}
              />
            ) : (
              <>
                <AuditLogList
                  entries={paginatedEntries}
                  onApprove={handleApprove}
                  onDeny={handleDeny}
                  onCreateRule={handleCreateRule}
                />

                {totalPages > 1 && (
                  <div className="mt-6">
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>

      <Footer />
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Create Rule Modal */}
      {showCreateRuleModal && selectedEntry && config && (
        <RuleModal
          isOpen={showCreateRuleModal}
          onClose={() => {
            setShowCreateRuleModal(false);
            setSelectedEntry(null);
          }}
          onSave={handleSaveRule}
          existingPriorities={migrateRules(config.approvals.rules).map(r => r.priority)}
          prePopulatedData={{
            toolName: selectedEntry.tool_name,
            agentIdentity: selectedEntry.agent_identity,
            action: selectedEntry.state === "APPROVED" ? "approve" : "deny" as const,
          }}
        />
      )}
    </div>
  );
}

export default AppFinal;
