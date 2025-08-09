import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';

interface NavigationTab {
  path: string;
  label: string;
  icon?: React.ReactNode;
}

const navigationTabs: NavigationTab[] = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    icon: '📊'
  },
  {
    path: '/events',
    label: 'Hook Events',
    icon: '🔗'
  },
  {
    path: '/config',
    label: 'Configuration',
    icon: '⚙️'
  }
];

export function Navigation() {
  const location = useLocation();

  return (
    <nav className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-12 items-center space-x-8">
          {navigationTabs.map((tab) => {
            const isActive = location.pathname === tab.path;
            
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={cn(
                  'inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                )}
              >
                {tab.icon && <span className="text-base">{tab.icon}</span>}
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}