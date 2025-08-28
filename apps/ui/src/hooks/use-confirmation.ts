import { createContext, useContext } from 'react';

export interface ConfirmationState {
  open: boolean;
  title: string;
  message: string;
  callback?: (confirmed: boolean) => void;
}

export const ConfirmationContext = createContext<{
  showConfirmation: (state: Omit<ConfirmationState, 'open' | 'callback'>) => Promise<boolean>;
} | null>(null);

export function useConfirmation() {
  const context = useContext(ConfirmationContext);

  if (!context) {
    throw new Error('useConfirmation must be used within a ConfirmationProvider');
  }

  return context.showConfirmation;
}
