import React, { useState } from "react";
import { cn } from "../../lib/utils";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  className,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      {isVisible && (
        <div
          className={cn(
            "absolute z-50 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg whitespace-nowrap",
            "bottom-full left-1/2 transform -translate-x-1/2 mb-2",
            "before:content-[''] before:absolute before:top-full before:left-1/2 before:transform before:-translate-x-1/2",
            "before:border-4 before:border-transparent before:border-t-gray-900",
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
};
