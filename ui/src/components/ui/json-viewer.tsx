import React, { useState, useMemo } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

interface JsonViewerProps {
  data: any;
  className?: string;
  defaultExpandDepth?: number;
}

interface JsonNodeProps {
  keyName?: string;
  value: any;
  depth: number;
  defaultExpandDepth: number;
  isLast?: boolean;
}

const JsonNode: React.FC<JsonNodeProps> = ({
  keyName,
  value,
  depth,
  defaultExpandDepth,
  isLast = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(depth < defaultExpandDepth);

  const valueType = useMemo(() => {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  }, [value]);

  const isExpandable = valueType === "object" || valueType === "array";
  const isEmpty =
    isExpandable &&
    ((valueType === "array" && value.length === 0) ||
      (valueType === "object" && Object.keys(value).length === 0));

  const renderPrimitive = () => {
    switch (valueType) {
      case "string":
        return (
          <span className="text-green-600 dark:text-green-400">"{value}"</span>
        );
      case "number":
        return (
          <span className="text-blue-600 dark:text-blue-400">{value}</span>
        );
      case "boolean":
        return (
          <span className="text-purple-600 dark:text-purple-400">
            {value.toString()}
          </span>
        );
      case "null":
        return <span className="text-gray-500 dark:text-gray-400">null</span>;
      default:
        return (
          <span className="text-gray-600 dark:text-gray-300">
            {String(value)}
          </span>
        );
    }
  };

  const renderKey = () => {
    if (!keyName) return null;
    return (
      <>
        <span className="text-slate-700 dark:text-slate-300 font-medium">
          "{keyName}"
        </span>
        <span className="text-slate-600 dark:text-slate-400">: </span>
      </>
    );
  };

  const renderBrackets = () => {
    if (valueType === "array") {
      return {
        open: <span className="text-slate-600 dark:text-slate-400">[</span>,
        close: (
          <span className="text-slate-600 dark:text-slate-400">
            ]{!isLast && ","}
          </span>
        ),
      };
    } else {
      return {
        open: <span className="text-slate-600 dark:text-slate-400">{"{"}</span>,
        close: (
          <span className="text-slate-600 dark:text-slate-400">
            {"}"}
            {!isLast && ","}
          </span>
        ),
      };
    }
  };

  if (!isExpandable) {
    return (
      <div
        className="flex items-start"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {renderKey()}
        {renderPrimitive()}
        {!isLast && (
          <span className="text-slate-600 dark:text-slate-400">,</span>
        )}
      </div>
    );
  }

  const brackets = renderBrackets();

  if (isEmpty) {
    return (
      <div
        className="flex items-start"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {renderKey()}
        {brackets.open}
        {brackets.close}
      </div>
    );
  }

  const entries =
    valueType === "array"
      ? value.map((v: any, i: number) => [i.toString(), v])
      : Object.entries(value);

  return (
    <div>
      <div
        className="flex items-start cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded px-1"
        style={{ paddingLeft: `${depth * 16}px` }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <button className="p-0.5 -ml-5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
          )}
        </button>
        {renderKey()}
        {brackets.open}
        {!isExpanded && (
          <span className="text-gray-500 dark:text-gray-400 ml-1">
            {valueType === "array"
              ? `${value.length} items`
              : `${entries.length} keys`}
          </span>
        )}
        {!isExpanded && brackets.close}
      </div>

      {isExpanded && (
        <>
          <div>
            {entries.map(([k, v]: [string, any], index: number) => (
              <JsonNode
                key={k}
                keyName={valueType === "object" ? k : undefined}
                value={v}
                depth={depth + 1}
                defaultExpandDepth={defaultExpandDepth}
                isLast={index === entries.length - 1}
              />
            ))}
          </div>
          <div style={{ paddingLeft: `${depth * 16}px` }}>{brackets.close}</div>
        </>
      )}
    </div>
  );
};

export const JsonViewer: React.FC<JsonViewerProps> = ({
  data,
  className,
  defaultExpandDepth = 2,
}) => {
  return (
    <div
      className={cn(
        "font-mono text-xs leading-relaxed",
        "bg-gray-50 dark:bg-gray-900/50",
        "border border-gray-200 dark:border-gray-700",
        "rounded-md p-3 overflow-auto",
        className
      )}
    >
      <JsonNode
        value={data}
        depth={0}
        defaultExpandDepth={defaultExpandDepth}
      />
    </div>
  );
};
