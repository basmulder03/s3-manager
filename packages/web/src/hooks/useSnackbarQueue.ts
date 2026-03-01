import { useCallback, useEffect, useRef, useState } from 'react';

export type SnackbarTone = 'info' | 'success' | 'error';

export interface SnackbarItem {
  id: number;
  message: string;
  tone: SnackbarTone;
  durationMs: number;
  progress: number | null;
  actionLabel: string | null;
  onAction: (() => void) | null;
}

export interface EnqueueSnackbarInput {
  message: string;
  tone?: SnackbarTone;
  durationMs?: number;
  progress?: number | null;
  actionLabel?: string;
  onAction?: () => void;
}

const DEFAULT_DURATION_MS = 3200;

export const useSnackbarQueue = () => {
  const [snackbars, setSnackbars] = useState<SnackbarItem[]>([]);
  const nextIdRef = useRef(1);
  const timersRef = useRef<Map<number, number>>(new Map());

  const clearDismissTimer = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (typeof timer !== 'number') {
      return;
    }

    window.clearTimeout(timer);
    timersRef.current.delete(id);
  }, []);

  const dismissSnackbar = useCallback(
    (id: number) => {
      clearDismissTimer(id);
      setSnackbars((previous) => previous.filter((item) => item.id !== id));
    },
    [clearDismissTimer]
  );

  const scheduleDismiss = useCallback(
    (id: number, durationMs: number) => {
      if (durationMs <= 0) {
        clearDismissTimer(id);
        return;
      }

      clearDismissTimer(id);
      const timer = window.setTimeout(() => {
        dismissSnackbar(id);
      }, durationMs);
      timersRef.current.set(id, timer);
    },
    [clearDismissTimer, dismissSnackbar]
  );

  const enqueueSnackbar = useCallback(
    ({
      message,
      tone = 'info',
      durationMs = DEFAULT_DURATION_MS,
      progress = null,
      actionLabel,
      onAction,
    }: EnqueueSnackbarInput) => {
      const id = nextIdRef.current;
      nextIdRef.current += 1;
      setSnackbars((previous) => [
        ...previous,
        {
          id,
          message,
          tone,
          durationMs,
          progress,
          actionLabel: actionLabel ?? null,
          onAction: onAction ?? null,
        },
      ]);
      scheduleDismiss(id, durationMs);
      return id;
    },
    [scheduleDismiss]
  );

  const updateSnackbar = useCallback(
    (
      id: number,
      updates: Partial<
        Pick<
          SnackbarItem,
          'message' | 'tone' | 'durationMs' | 'progress' | 'actionLabel' | 'onAction'
        >
      >
    ) => {
      if (typeof updates.durationMs === 'number') {
        scheduleDismiss(id, updates.durationMs);
      }

      setSnackbars((previous) =>
        previous.map((item) => (item.id === id ? { ...item, ...updates } : item))
      );
    },
    [scheduleDismiss]
  );

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, []);

  return {
    snackbars,
    enqueueSnackbar,
    updateSnackbar,
    dismissSnackbar,
  };
};
