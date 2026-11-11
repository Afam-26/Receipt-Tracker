import { useAuth } from '@clerk/expo';
import { useCallback, useEffect, useRef } from 'react';
import { createApiClient } from './api';

/**
 * Stable authenticated GET callback.
 *
 * Clerk may update the identity of getToken between renders. Keep its latest
 * value in a ref without changing the callback identity returned to screens:
 * otherwise screens with useEffect([refresh]) can endlessly re-fetch.
 */
export function useAuthedGet() {
  const { getToken } = useAuth();
  const tokenGetterRef = useRef(getToken);

  useEffect(() => {
    tokenGetterRef.current = getToken;
  }, [getToken]);

  return useCallback(
    <T,>(path: string): Promise<T> =>
      createApiClient(() => tokenGetterRef.current())<T>(path),
    [],
  );
}
