import * as React from "react";
import { cn } from "../../lib/utils";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  className,
}) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blueprint-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "bg-blueprint-500"
          : "bg-gray-200 dark:bg-gray-700",
        className
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
};