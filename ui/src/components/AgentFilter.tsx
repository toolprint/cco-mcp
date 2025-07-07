import React from 'react';
import { Select } from './ui/select';

interface AgentFilterProps {
  agents: string[];
  selectedAgent: string | 'ALL';
  onAgentChange: (agent: string | 'ALL') => void;
}

export const AgentFilter: React.FC<AgentFilterProps> = ({
  agents,
  selectedAgent,
  onAgentChange
}) => {
  if (agents.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
        Agent
      </label>
      <Select
        value={selectedAgent}
        onChange={(e) => onAgentChange(e.target.value as string | 'ALL')}
        className="w-full"
      >
        <option value="ALL">All Agents</option>
        {agents.map(agent => (
          <option key={agent} value={agent}>
            {agent}
          </option>
        ))}
      </Select>
    </div>
  );
};