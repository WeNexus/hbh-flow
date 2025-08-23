import {
  type SetStateAction,
  createContext,
  type Dispatch,
  useContext,
} from 'react';

export interface HeaderState {
  search: boolean;
  datePicker: boolean;
  loading: boolean;
  query: string;
}

export interface HeaderContext {
  state: HeaderState;
  UI: (state: Partial<HeaderState>) => void;
  loading: (loading: boolean) => void;
  setQuery: Dispatch<SetStateAction<string>>;
  setQueryThrottled: Dispatch<SetStateAction<string>>;
  submitQuery: (value: string) => void;
}

export const HeaderContext = createContext<HeaderContext | null>(null);

export function useHeader() {
  const context = useContext(HeaderContext);

  if (!context) {
    throw new Error('useHeader must be used within a HeaderProvider');
  }

  return context;
}
