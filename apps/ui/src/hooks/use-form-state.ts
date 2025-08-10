import { useCallback, useEffect, useMemo, useState } from 'react';
import { cloneDeep, isEqual } from 'lodash-es';
import { get } from '@/modules/object-util.ts';

type MessageType = 'error' | 'warning' | 'info';
type ValidationTarget = 'staged' | 'state' | 'both';

export interface Message {
  type: MessageType;
  message: string;
}

export interface Validator<S> {
  target: ValidationTarget;
  validate: (value: any, state: S) => Promise<Message | void> | Message | void;
}

export type FormState<T = Record<string, any>> = ReturnType<
  typeof useFormState<T>
>;

export type PathToValidate =
  | string
  | {
      indexes: (number | string)[];
      path: string;
    };

const wildcardRegex = /\*/gim;
const historyLimit = 25;

function replaceWildcardWithIndex(pathToValidate: PathToValidate): string {
  if (typeof pathToValidate === 'string') {
    return pathToValidate;
  }

  if (pathToValidate.indexes.length === 0) {
    return pathToValidate.path;
  }

  let index = 0;
  return pathToValidate.path.replace(wildcardRegex, () =>
    index === pathToValidate.indexes.length
      ? '*'
      : pathToValidate.indexes[index++].toString(),
  );
}

export function useFormState<
  T = Record<string, any>,
  P extends string = string,
>(initialState: T, readOnly?: boolean, validators?: Record<P, Validator<T>>) {
  const [messages, setMessages] = useState<Record<P, Message>>({} as any);

  const [changes, setChanges] = useState([initialState]);
  const [cursor, setCursor] = useState(0);
  const [staged, setStaged] = useState(initialState);
  const state = useMemo(() => changes[cursor], [cursor, changes]);

  const isDirty = useMemo(
    () => changes.length > 1 && !isEqual(state, initialState),
    [state, changes, initialState],
  );

  const validate = useCallback(
    async (target: T, ...path: PathToValidate[]) => {
      if (!validators) {
        return messages;
      }

      const pathsToValidate: PathToValidate[] =
        path.length > 0
          ? path
          : Object.keys(validators).map((k) => ({
              path: k,
              indexes: [],
            }));

      if (pathsToValidate.length === 0) {
        return messages;
      }

      const messagesCopy = cloneDeep(messages);

      for (const pathToValidate of pathsToValidate) {
        const pathReplaced =
          typeof pathToValidate === 'string'
            ? pathToValidate
            : replaceWildcardWithIndex(pathToValidate);
        const validator =
          // @ts-expect-error - ignore
          validators[
            typeof pathToValidate === 'string'
              ? pathToValidate
              : pathToValidate.path
          ];
        const pathValues = get(target, pathReplaced);

        if (pathValues.length === 0) {
          continue;
        }

        for (const pathValue of pathValues) {
          const message = await validator.validate(pathValue.value, target);

          if (message) {
            // @ts-expect-error - ignore
            messagesCopy[pathValue.path] = message;
          } else {
            // @ts-expect-error - ignore
            delete messagesCopy[pathValue.path];
          }
        }
      }

      setMessages(messagesCopy);

      return messagesCopy;
    },
    [validators, messages],
  );

  const addChange = useCallback(
    (change: Partial<T>, ...pathsToValidate: PathToValidate[]) => {
      if (readOnly) {
        return;
      }

      const newState = { ...state, ...change };

      if (!isEqual(newState, state)) {
        const newCursor = cursor + 1;

        setChanges([
          ...changes.slice(newCursor <= historyLimit ? 0 : 1, newCursor),
          newState,
        ]);
        setStaged(newState);
        setCursor(newCursor > historyLimit ? historyLimit : newCursor);

        if (pathsToValidate?.length) {
          validate(newState, ...pathsToValidate);
        }
      }
    },
    [readOnly, state, cursor, changes, validate],
  );

  const patch = useCallback(
    (change: Partial<T>, ...pathsToValidate: PathToValidate[]) => {
      if (readOnly) {
        return;
      }

      const newState = { ...state, ...change };

      if (!isEqual(newState, state)) {
        const changesCopy = [...changes];
        changesCopy[cursor] = newState;

        setChanges(changesCopy);
        setStaged(newState);

        if (pathsToValidate?.length) {
          validate(newState, ...pathsToValidate);
        }
      }
    },
    [changes, cursor, readOnly, state, validate],
  );

  const addToStaged = useCallback(
    (change: Partial<T>, ...pathsToValidate: PathToValidate[]) => {
      if (readOnly) {
        return;
      }

      const newStaged = { ...staged, ...change };
      setStaged(newStaged);

      if (pathsToValidate?.length) {
        validate(newStaged, ...pathsToValidate);
      }
    },
    [readOnly, staged, validate],
  );

  const commitStaged = useCallback(
    (...pathsToValidate: PathToValidate[]) =>
      addChange(staged, ...pathsToValidate),
    [addChange, staged],
  );

  const undo = useCallback(() => {
    if (cursor > 0) {
      const newCursor = cursor - 1;

      setCursor(newCursor);
      setStaged(changes[newCursor]);
    }
  }, [cursor, changes]);

  const redo = useCallback(() => {
    if (cursor < changes.length - 1) {
      const newCursor = cursor + 1;

      setCursor(newCursor);
      setStaged(changes[newCursor]);
    }
  }, [cursor, changes]);

  const clearMessages = useCallback(
    (...pathPrefixes: string[]) => {
      if (pathPrefixes.length === 0) {
        return setMessages({} as any);
      }

      const messagesCopy = cloneDeep(messages);

      for (const pathPrefix of pathPrefixes) {
        for (const path of Object.keys(messagesCopy)) {
          if (path.startsWith(pathPrefix)) {
            // @ts-expect-error - ignore
            delete messagesCopy[path];
          }
        }
      }

      setMessages(messagesCopy);
    },
    [messages],
  );

  const reset = useCallback(() => {
    setChanges([initialState]);
    setStaged(initialState);
    setMessages({} as any);
    setCursor(0);
  }, [initialState]);

  useEffect(() => reset(), [reset, initialState]);

  return {
    clearMessages,
    commitStaged,
    addToStaged,
    addChange,
    messages,
    readOnly,
    validate,
    changes,
    isDirty,
    staged,
    cursor,
    reset,
    patch,
    state,
    undo,
    redo,
  };
}
