import React from "react";

type PersistentStateOptions<T> = {
  storage?: Storage | undefined;
  serialize?: (value: T) => string;
  deserialize?: (value: string) => T;
};

const defaultSerialize = <T,>(value: T) => JSON.stringify(value);
const defaultDeserialize = <T,>(value: string) => JSON.parse(value) as T;

/**
 * Persists stateful values using Web Storage.
 */
export function usePersistentState<T>(key: string, initialValue: T, options?: PersistentStateOptions<T>) {
  const storage =
    options?.storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  const serialize = options?.serialize ?? defaultSerialize<T>;
  const deserialize = options?.deserialize ?? defaultDeserialize<T>;

  const [value, setValue] = React.useState<T>(() => {
    if (typeof window === "undefined" || !storage) {
      return initialValue;
    }

    try {
      const storedValue = storage.getItem(key);
      if (storedValue === null) {
        return initialValue;
      }

      return deserialize(storedValue);
    } catch {
      return initialValue;
    }
  });

  React.useEffect(() => {
    if (typeof window === "undefined" || !storage) {
      return;
    }

    try {
      storage.setItem(key, serialize(value));
    } catch {
      // ignore storage errors (quota, privacy settings, etc.)
    }
  }, [key, serialize, storage, value]);

  return [value, setValue] as const;
}
