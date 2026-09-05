"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

/** Page-local reads start after the workspace cookie is initialized. */
export function useApiResource<T>(path: string | null) {
  const [result, setResult] = useState<{
    path: string;
    data?: T;
    error?: string;
    attempt: number;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    void api<T>(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ path, data, attempt });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ path, error: (error as Error).message, attempt });
      });
    return () => controller.abort();
  }, [path, attempt]);
  const mutate = useCallback(
    (update: (current: T | undefined) => T) => {
      if (path)
        setResult((current) => ({
          path,
          data: update(current?.path === path ? current.data : undefined),
          attempt,
        }));
    },
    [path, attempt],
  );
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const current = result?.path === path ? result : null;
  return {
    data: current?.data,
    error: current?.error,
    loading: !!path && (!current || current.attempt !== attempt),
    retry,
    mutate,
  };
}
