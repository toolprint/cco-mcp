import React from 'react'

export const Footer: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            &copy; 2025 OneGrep, Inc. Part of the{' '}
            <a 
              href="https://toolprint.ai" 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-semibold text-blueprint-600 dark:text-blueprint-400 hover:text-blueprint-700 dark:hover:text-blueprint-300 transition-colors"
            >
              Toolprint
            </a>{' '}
            ecosystem.
          </p>
          <div className="flex items-center space-x-4 text-sm text-slate-600 dark:text-slate-400">
            <span>Version 0.1.0</span>
          </div>
        </div>
      </div>
    </footer>
  )
}