import { useEffect, useState, useCallback, useRef } from 'react'
import { Shield, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { AuditLogList } from './components/AuditLogList'
import { StatusFilter } from './components/StatusFilter'
import { ToastContainer } from './components/Toast'
import { useSSE } from './hooks/useSSE'
import { useAuditLog } from './hooks/useAuditLog'
import { useToast } from './hooks/useToast'
import type { AuditLogState, AuditLogEntry } from './types/audit'

function AppWithNotifications() {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null)
  const [selectedState, setSelectedState] = useState<AuditLogState | 'ALL'>('ALL')
  const { toasts, removeToast, info, success, error: showError } = useToast()
  const entriesRef = useRef<Set<string>>(new Set())
  
  const { entries, loading, error, refetch, approve, deny } = useAuditLog({
    state: selectedState === 'ALL' ? undefined : selectedState,
  })

  // Initialize entries ref on first load
  useEffect(() => {
    if (entries.length > 0 && entriesRef.current.size === 0) {
      entries.forEach(entry => entriesRef.current.add(entry.id))
    }
  }, [entries])

  const handleNewEntry = useCallback((entry: AuditLogEntry) => {
    if (!entriesRef.current.has(entry.id)) {
      info(`New tool request: ${entry.tool_name} from ${entry.agent_identity}`)
      entriesRef.current.add(entry.id)
      refetch()
    }
  }, [info, refetch])

  const handleStateChange = useCallback((entry: AuditLogEntry, _previousState?: string) => {
    if (entry.state === 'APPROVED') {
      success(`Tool ${entry.tool_name} approved${entry.decision_by ? ` by ${entry.decision_by}` : ''}`)
    } else if (entry.state === 'DENIED') {
      showError(`Tool ${entry.tool_name} denied${entry.denied_by_timeout ? ' (timeout)' : ''}`)
    }
    refetch()
  }, [success, showError, refetch])

  const handleEntryExpired = useCallback((entry: AuditLogEntry) => {
    entriesRef.current.delete(entry.id)
    refetch()
  }, [refetch])

  const { isConnected } = useSSE({
    onNewEntry: handleNewEntry,
    onStateChange: handleStateChange,
    onEntryExpired: handleEntryExpired,
    filters: {
      state: selectedState === 'ALL' ? undefined : selectedState,
    }
  })

  const handleApprove = useCallback(async (id: string) => {
    try {
      await approve(id)
      success('Entry approved successfully')
    } catch {
      showError('Failed to approve entry')
    }
  }, [approve, success, showError])

  const handleDeny = useCallback(async (id: string) => {
    try {
      await deny(id)
      success('Entry denied successfully')
    } catch {
      showError('Failed to deny entry')
    }
  }, [deny, success, showError])

  useEffect(() => {
    // Check API health
    fetch('/api/audit-log')
      .then(res => res.ok ? setIsHealthy(true) : setIsHealthy(false))
      .catch(() => setIsHealthy(false))
  }, [])

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
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
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
                    {isConnected ? 'Live' : 'Offline'}
                  </span>
                </div>
                <div className="flex items-center">
                  <div className={`h-2 w-2 rounded-full ${
                    isHealthy === null ? 'bg-gray-400' : 
                    isHealthy ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <span className="ml-2 text-sm text-gray-600 dark:text-gray-300">
                    {isHealthy === null ? 'Checking...' : 
                     isHealthy ? 'API Connected' : 'API Disconnected'}
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
            onApprove={handleApprove}
            onDeny={handleDeny}
          />
        </div>
      </main>
      
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  )
}

export default AppWithNotifications