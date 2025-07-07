import React, { createContext, useContext, ReactNode } from 'react';
import { useSSE } from '../hooks/useSSE';

interface SSEContextType {
  isConnected: boolean;
  reconnect: () => void;
  disconnect: () => void;
}

const SSEContext = createContext<SSEContextType | undefined>(undefined);

interface SSEProviderProps {
  children: ReactNode;
}

export const SSEProvider: React.FC<SSEProviderProps> = ({ children }) => {
  const { isConnected, reconnect, disconnect } = useSSE({
    // No specific event handlers - this is just for connection tracking
  });

  return (
    <SSEContext.Provider value={{ isConnected, reconnect, disconnect }}>
      {children}
    </SSEContext.Provider>
  );
};

export const useSSEConnection = (): SSEContextType => {
  const context = useContext(SSEContext);
  if (context === undefined) {
    throw new Error('useSSEConnection must be used within an SSEProvider');
  }
  return context;
};