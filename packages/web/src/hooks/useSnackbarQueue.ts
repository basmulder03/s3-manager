import { useCallback, useEffect, useRef, useState } from 'react';

export type SnackbarTone = 'info' | 'success' | 'error';

export interface SnackbarItem {
  id: number;
  message: string;
  tone: SnackbarTone;
  durationMs: number;
}

interface EnqueueSnackbarInput {
  message: string;
  tone?: SnackbarTone;
  durationMs?: number;
}

const DEFAULT_DURATION_MS = 3200;

export const useSnackbarQueue = () => {
  const [snackbars, setSnackbars] = useState<SnackbarItem[]>([]);
  const nextIdRef = useRef(1);

  const dismissSnackbar = useCallback((id: number) => {
    setSnackbars((previous) => previous.filter((item) => item.id !== id));
  }, []);

  const enqueueSnackbar = useCallback(
    ({ message, tone = 'info', durationMs = DEFAULT_DURATION_MS }: EnqueueSnackbarInput) => {
      const id = nextIdRef.current;
      nextIdRef.current += 1;
      setSnackbars((previous) => [...previous, { id, message, tone, durationMs }]);
    },
    []
  );

  useEffect(() => {
    if (snackbars.length === 0) {
      return;
    }

    const timers = snackbars.map((snackbar) =>
      window.setTimeout(() => {
        dismissSnackbar(snackbar.id);
      }, snackbar.durationMs)
    );

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [dismissSnackbar, snackbars]);

  return {
    snackbars,
    enqueueSnackbar,
    dismissSnackbar,
  };
};
