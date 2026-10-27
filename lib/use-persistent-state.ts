'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * useState that remembers its value in localStorage, for per-device view preferences (filters,
 * list vs timeline). Renders `initial` first and loads the stored value after mount, so server
 * and client render the same markup. `isValid` drops stored values that no longer apply.
 */
export function usePersistentState<T extends string>(
  key: string,
  initial: T,
  isValid: (value: string) => boolean = () => true
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null && isValid(stored)) {
        setValue(stored as T);
      }
    } catch {
      // Storage can be unavailable (private mode); fall back to the initial value
    }
    // Only on mount: later changes to isValid shouldn't overwrite the user's choice
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Ignore: the preference just won't be remembered
      }
    },
    [key]
  );

  return [value, update];
}
