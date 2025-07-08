import React from "react";
import { cn } from "../../lib/utils";

interface DurationPickerProps {
  value: number; // Value in milliseconds
  onChange: (value: number) => void;
  min?: number; // Minimum value in milliseconds
  className?: string;
}

export const DurationPicker: React.FC<DurationPickerProps> = ({
  value,
  onChange,
  min = 1000,
  className,
}) => {
  // Convert milliseconds to individual units
  const totalSeconds = Math.floor(value / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const handleChange = (unit: 'hours' | 'minutes' | 'seconds', newValue: string) => {
    const numValue = parseInt(newValue) || 0;
    
    let newTotalMs = 0;
    switch (unit) {
      case 'hours':
        newTotalMs = (numValue * 3600 + minutes * 60 + seconds) * 1000;
        break;
      case 'minutes':
        newTotalMs = (hours * 3600 + numValue * 60 + seconds) * 1000;
        break;
      case 'seconds':
        newTotalMs = (hours * 3600 + minutes * 60 + numValue) * 1000;
        break;
    }
    
    // Ensure we don't go below minimum
    if (newTotalMs >= min) {
      onChange(newTotalMs);
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={hours}
          onChange={(e) => handleChange('hours', e.target.value)}
          min="0"
          max="99"
          className="w-16 h-11 rounded-md border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm focus:border-blueprint-500 focus:ring-blueprint-500 hover:border-gray-400 dark:hover:border-gray-500 text-center text-base px-2 py-3"
        />
        <span className="text-xs text-gray-600 dark:text-gray-400">h</span>
      </div>
      
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={minutes}
          onChange={(e) => handleChange('minutes', e.target.value)}
          min="0"
          max="59"
          className="w-16 h-11 rounded-md border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm focus:border-blueprint-500 focus:ring-blueprint-500 hover:border-gray-400 dark:hover:border-gray-500 text-center text-base px-2 py-3"
        />
        <span className="text-xs text-gray-600 dark:text-gray-400">m</span>
      </div>
      
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={seconds}
          onChange={(e) => handleChange('seconds', e.target.value)}
          min="0"
          max="59"
          className="w-16 h-11 rounded-md border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm focus:border-blueprint-500 focus:ring-blueprint-500 hover:border-gray-400 dark:hover:border-gray-500 text-center text-base px-2 py-3"
        />
        <span className="text-xs text-gray-600 dark:text-gray-400">s</span>
      </div>
    </div>
  );
};