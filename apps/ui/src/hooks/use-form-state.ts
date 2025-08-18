import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { isEqual as lodashIsEqual } from 'lodash-es';
import { get } from '@/modules/object-util.ts';

type MessageType = 'error' | 'warning' | 'info';
type ValidationTarget = 'staged' | 'state' | 'both';

export interface Message {
  type: MessageType;
  message: string;
}

export interface Validator<S, P extends keyof S> {
  target: ValidationTarget;
  validate: (value: S[P], state: S) => Promise<Message | void> | Message | void;
}

export type ValidatorMap<S> = {
  [P in keyof S]?: Validator<S, P>;
};

export type PathToValidate =
  | string
  | {
      indexes: (number | string)[];
      path: string;
    };

export interface UseFormStateOptions<S> {
  readOnly?: boolean;
  validators?: ValidatorMap<S>;
  history?: boolean | { limit?: number }; // false disables history
  compare?: (a: S, b: S) => boolean; // defaults to lodash isEqual
  syncStagedOnHistory?: boolean;
}

const wildcardRegex = /\*/gim;
const DEFAULT_HISTORY_LIMIT = 25;

function replaceWildcardWithIndex(pathToValidate: PathToValidate): string {
  if (typeof pathToValidate === 'string') return pathToValidate;
  if (pathToValidate.indexes.length === 0) return pathToValidate.path;

  let index = 0;
  return pathToValidate.path.replace(wildcardRegex, () =>
    index === pathToValidate.indexes.length
      ? '*'
      : String(pathToValidate.indexes[index++]),
  );
}

interface HistoryState<T> {
  changes: T[];
  cursor: number; // index into changes
}

type HistoryAction<T> =
  | { type: 'RESET'; payload: T; trackHistory: boolean }
  | { type: 'PUSH'; payload: T; limit: number; trackHistory: boolean }
  | { type: 'REPLACE_CURRENT'; payload: T; trackHistory: boolean }
  | { type: 'UNDO' }
  | { type: 'REDO' };

function historyReducer<T>(
  state: HistoryState<T>,
  action: HistoryAction<T>,
): HistoryState<T> {
  switch (action.type) {
    case 'RESET': {
      const base = [action.payload];
      return action.trackHistory
        ? { changes: base, cursor: 0 }
        : { changes: base, cursor: 0 };
    }
    case 'PUSH': {
      if (!action.trackHistory) {
        // Single snapshot mode
        return { changes: [action.payload], cursor: 0 };
      }
      // Drop "future" history if user edited after undo
      const upto = state.changes.slice(0, state.cursor + 1);
      const next = [...upto, action.payload];
      const limit = Math.max(1, action.limit || DEFAULT_HISTORY_LIMIT);
      const trimmed =
        next.length > limit ? next.slice(next.length - limit) : next;
      return { changes: trimmed, cursor: trimmed.length - 1 };
    }
    case 'REPLACE_CURRENT': {
      if (!action.trackHistory) {
        return { changes: [action.payload], cursor: 0 };
      }
      const changes = state.changes.slice();
      changes[state.cursor] = action.payload;
      return { changes, cursor: state.cursor };
    }
    case 'UNDO': {
      if (state.cursor > 0) return { ...state, cursor: state.cursor - 1 };
      return state;
    }
    case 'REDO': {
      if (state.cursor < state.changes.length - 1) {
        return { ...state, cursor: state.cursor + 1 };
      }
      return state;
    }
    default:
      return state;
  }
}

export function useFormState<
  T = Record<string, any>,
  P extends keyof T = keyof T,
>(initialState: T, options: UseFormStateOptions<T> = {}) {
  const {
    readOnly = false,
    validators,
    history = true,
    compare = lodashIsEqual,
    syncStagedOnHistory = true,
  } = options;

  const trackHistory = Boolean(history);
  const historyLimit =
    typeof history === 'object' && history?.limit
      ? history.limit
      : DEFAULT_HISTORY_LIMIT;

  const [messages, setMessages] = useState<Record<P, Message>>({} as any);

  const [historyState, dispatch] = useReducer(historyReducer<T>, {
    changes: [initialState],
    cursor: 0,
  });

  const state = useMemo(
    () => historyState.changes[historyState.cursor],
    [historyState],
  );

  const [staged, setStaged] = useState<T>(initialState);

  const isDirty = useMemo(
    () => historyState.changes.length > 0 && !compare(state, initialState),
    [historyState.changes.length, compare, state, initialState],
  );

  const validate = useCallback(
    async (target: T, ...path: PathToValidate[]) => {
      if (!validators || Object.keys(validators).length === 0) {
        return true;
      }

      const pathsToValidate: PathToValidate[] =
        path.length > 0
          ? path
          : Object.keys(validators).map((k) => ({ path: k, indexes: [] }));

      if (pathsToValidate.length === 0) {
        return true;
      }

      // Build validation tasks
      const tasks: Array<Promise<{ path: string; message?: Message }>> = [];

      for (const p of pathsToValidate) {
        const rawKey = typeof p === 'string' ? p : p.path;
        const replaced =
          typeof p === 'string' ? p : replaceWildcardWithIndex(p);

        // @ts-expect-error index by path key
        const validator: Validator<T> | undefined = validators[rawKey];
        if (!validator) continue;

        const pathValues = get(target, replaced) ?? [];
        if (!Array.isArray(pathValues) || pathValues.length === 0) continue;

        for (const pv of pathValues) {
          tasks.push(
            Promise.resolve(validator.validate(pv.value, target)).then(
              (msg) => ({
                path: pv.path,
                message: msg || undefined,
              }),
            ),
          );
        }
      }

      if (tasks.length === 0) return true;

      const results = await Promise.all(tasks);

      setMessages((prev) => {
        const n = { ...(prev as Record<string, Message>) } as Record<
          P,
          Message
        >;
        for (const { path, message } of results) {
          if (message) n[path as P] = message;
          else delete n[path as P];
        }

        return n;
      });

      return !results.some((r) => r.message?.type === 'error');
    },
    [validators],
  );

  const addChange = useCallback(
    (change: Partial<T>, ...pathsToValidate: PathToValidate[]) => {
      if (readOnly) return;

      const newState = { ...state, ...change };
      if (!Object.is(newState, state) && !lodashIsEqual(newState, state)) {
        dispatch({
          type: 'PUSH',
          payload: newState,
          limit: historyLimit,
          trackHistory,
        });
        setStaged(newState);
        if (pathsToValidate?.length) {
          // Fire & forget; caller can await if needed
          void validate(newState, ...pathsToValidate);
        }
      }
    },
    [readOnly, state, historyLimit, trackHistory, validate],
  );

  const patch = useCallback(
    (change: Partial<T>, ...pathsToValidate: PathToValidate[]) => {
      if (readOnly) return;

      const newState = { ...state, ...change };
      if (!lodashIsEqual(newState, state)) {
        dispatch({ type: 'REPLACE_CURRENT', payload: newState, trackHistory });
        setStaged(newState);
        if (pathsToValidate?.length) {
          void validate(newState, ...pathsToValidate);
        }
      }
    },
    [readOnly, state, trackHistory, validate],
  );

  const addToStaged = useCallback(
    (change: Partial<T>, ...pathsToValidate: PathToValidate[]) => {
      if (readOnly) return;

      setStaged((prev) => {
        const newStaged = { ...(prev as T), ...change };
        if (pathsToValidate?.length) {
          void validate(newStaged, ...pathsToValidate);
        }
        return newStaged;
      });
    },
    [readOnly, validate],
  );

  const commitStaged = useCallback(
    (...pathsToValidate: PathToValidate[]) =>
      addChange(staged, ...pathsToValidate),
    [addChange, staged],
  );

  const undo = useCallback(() => {
    if (!trackHistory) return; // no-op when history disabled
    dispatch({ type: 'UNDO' });
  }, [trackHistory]);

  const redo = useCallback(() => {
    if (!trackHistory) return; // no-op when history disabled
    dispatch({ type: 'REDO' });
  }, [trackHistory]);

  const clearMessages = useCallback((...pathPrefixes: string[]) => {
    if (pathPrefixes.length === 0) {
      setMessages({} as any);
      return;
    }
    setMessages((prev) => {
      const nextEntries = Object.entries(prev).filter(
        ([path]) => !pathPrefixes.some((pref) => path.startsWith(pref)),
      ) as [string, Message][];
      return Object.fromEntries(nextEntries) as Record<P, Message>;
    });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET', payload: initialState, trackHistory });
    setStaged(initialState);
    setMessages({} as any);
  }, [initialState, trackHistory]);

  useEffect(() => reset(), [reset, initialState]);

  useEffect(() => {
    if (syncStagedOnHistory) {
      setStaged(state);
    }
  }, [state, syncStagedOnHistory]);

  return {
    changes: historyState.changes,
    cursor: historyState.cursor,
    history: trackHistory,
    syncStagedOnHistory,
    clearMessages,
    commitStaged,
    addToStaged,
    addChange,
    messages,
    readOnly,
    validate,
    isDirty,
    staged,
    reset,
    patch,
    state,
    undo,
    redo,
  };
}
