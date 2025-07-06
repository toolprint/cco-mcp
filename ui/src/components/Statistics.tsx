import React, { useMemo } from 'react';
import { CheckCircle, XCircle, Clock, TrendingUp, Shield } from 'lucide-react';
import type { AuditLogEntry } from '../types/audit';
import { Card, CardContent } from './ui/card';
import { cn } from '../lib/utils';

interface StatisticsProps {
  entries: AuditLogEntry[];
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: number;
  className?: string;
  iconClassName?: string;
  valueClassName?: string;
}

const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  className,
  iconClassName,
  valueClassName
}) => (
  <Card className={cn("relative overflow-hidden bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700", className)}>
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {title}
          </p>
          <div className="flex items-baseline gap-2 mt-2">
            <p className={cn("text-3xl font-bold tracking-tight", valueClassName)}>
              {value}
            </p>
            {trend !== undefined && (
              <span className={cn(
                "flex items-center text-sm",
                trend > 0 ? "text-status-success" : "text-status-danger"
              )}>
                <TrendingUp className={cn(
                  "h-3 w-3 mr-1",
                  trend < 0 && "rotate-180"
                )} />
                {Math.abs(trend)}%
              </span>
            )}
          </div>
        </div>
        <div className={cn(
          "p-3 rounded-lg bg-muted/50",
          iconClassName
        )}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </CardContent>
    {/* Blueprint grid pattern overlay */}
    <div className="absolute inset-0 bg-blueprint-dots opacity-5 pointer-events-none" />
  </Card>
);

export const Statistics: React.FC<StatisticsProps> = ({ entries }) => {
  const stats = useMemo(() => {
    const approved = entries.filter(e => e.state === 'APPROVED').length;
    const denied = entries.filter(e => e.state === 'DENIED').length;
    const needsReview = entries.filter(e => e.state === 'NEEDS_REVIEW').length;
    const timedOut = entries.filter(e => e.denied_by_timeout).length;
    
    const approvalRate = entries.length > 0 
      ? Math.round((approved / entries.length) * 100)
      : 0;
    
    const toolUsage = entries.reduce((acc, entry) => {
      acc[entry.tool_name] = (acc[entry.tool_name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topTool = Object.entries(toolUsage)
      .sort(([, a], [, b]) => b - a)[0];
    
    // Calculate trends (mock data for demo - in real app, compare with previous period)
    const approvedTrend = approved > 0 ? 12 : 0;
    const deniedTrend = denied > 0 ? -8 : 0;
    
    return {
      approved,
      denied,
      needsReview,
      timedOut,
      approvalRate,
      topTool: topTool ? { name: topTool[0], count: topTool[1] } : null,
      approvedTrend,
      deniedTrend
    };
  }, [entries]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Approved"
        value={stats.approved}
        icon={CheckCircle}
        trend={stats.approvedTrend}
        iconClassName="bg-status-success/10 text-status-success"
        valueClassName="text-status-success"
      />
      
      <StatCard
        title="Denied"
        value={stats.denied}
        icon={XCircle}
        trend={stats.deniedTrend}
        iconClassName="bg-status-danger/10 text-status-danger"
        valueClassName="text-status-danger"
      />
      
      <StatCard
        title="Needs Review"
        value={stats.needsReview}
        icon={Clock}
        iconClassName="bg-status-warning/10 text-status-warning"
        valueClassName="text-status-warning"
      />
      
      <StatCard
        title="Approval Rate"
        value={`${stats.approvalRate}%`}
        icon={Shield}
        iconClassName="bg-blueprint-500/10 text-blueprint-500"
        valueClassName="text-blueprint-600 dark:text-blueprint-400"
      />
      
      {/* Additional insights */}
      {stats.topTool && (
        <Card className="col-span-full bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Most Used Tool
                </p>
                <p className="text-lg font-semibold text-slate-800 dark:text-white">
                  {stats.topTool.name}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Requests
                </p>
                <p className="text-2xl font-bold text-blueprint-600 dark:text-blueprint-400">
                  {stats.topTool.count}
                </p>
              </div>
            </div>
            {/* Progress bar showing relative usage */}
            <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blueprint-400 to-blueprint-600 rounded-full transition-all duration-500"
                style={{ width: `${Math.min((stats.topTool.count / entries.length) * 100, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};