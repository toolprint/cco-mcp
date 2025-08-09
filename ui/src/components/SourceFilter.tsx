import React from "react";
import { Select } from "./ui/select";
import { Label } from "./ui/label";
import { Server, Webhook } from "lucide-react";

interface SourceFilterProps {
  selectedSource: "ALL" | "mcp" | "hook";
  onSourceChange: (source: "ALL" | "mcp" | "hook") => void;
}

export const SourceFilter: React.FC<SourceFilterProps> = ({
  selectedSource,
  onSourceChange,
}) => {
  return (
    <div>
      <Label htmlFor="source-filter" className="text-sm font-medium">
        Source
      </Label>
      <Select
        id="source-filter"
        value={selectedSource}
        onChange={(e) =>
          onSourceChange(e.target.value as "ALL" | "mcp" | "hook")
        }
        className="mt-1"
      >
        <option value="ALL">All Sources</option>
        <option value="mcp">
          <Server className="inline h-3 w-3 mr-1" />
          MCP Only
        </option>
        <option value="hook">
          <Webhook className="inline h-3 w-3 mr-1" />
          Hooks Only
        </option>
      </Select>
    </div>
  );
};
