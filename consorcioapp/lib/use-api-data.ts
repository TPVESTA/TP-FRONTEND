"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "./backoffice";

interface ApiData<T> {
  data: T;
  loading: boolean;
  error: string;
  /** Vuelve a pedir los datos (por ejemplo, después de guardar o al reintentar). */
  reload: () => void;
}

/**
 * Pide datos al montar y cada vez que cambian `loader` o `refreshKey`. Cancela la petición
 * anterior al desmontar o al volver a pedir, y nunca actualiza un componente que ya no está.
 * `loader` debe ser estable (useCallback); ante un error, `data` vuelve a `initial`.
 */
export function useApiData<T>(loader: (signal: AbortSignal) => Promise<T>, initial: T, refreshKey?: unknown): ApiData<T> {
  const fallback = useRef(initial);
  const [state, setState] = useState({ data: initial, loading: true, error: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loader(controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ data, loading: false, error: "" }); })
      .catch(err => { if (!controller.signal.aborted) setState({ data: fallback.current, loading: false, error: errorMessage(err) }); });
    return () => controller.abort();
  }, [loader, attempt, refreshKey]);
  const reload = useCallback(() => {
    setState(current => ({ ...current, loading: true, error: "" }));
    setAttempt(value => value + 1);
  }, []);
  return { ...state, reload };
}
