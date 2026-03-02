import { useState, useEffect, useMemo, useRef } from 'react';
import {
  EXPLORER_ZOOM_STORAGE_KEY,
  EXPLORER_ZOOM_EVENT_NAME,
  EXPLORER_ZOOM_DEFAULT_LEVEL,
  MIN_BROWSER_ZOOM_FACTOR,
  MAX_BROWSER_ZOOM_FACTOR,
  resolveNearestExplorerZoomLevel,
} from '@web/constants/zoom';

export interface UseExplorerZoomResult {
  manualExplorerZoomLevel: number;
  browserZoomFactor: number;
  effectiveExplorerZoomLevel: number;
  headerZoomStyle: { zoom: number };
  setManualExplorerZoomLevel: (level: number) => void;
}

/**
 * Resolves the initial manual explorer zoom level from localStorage
 */
const resolveInitialManualExplorerZoomLevel = (): number => {
  if (typeof window === 'undefined') {
    return EXPLORER_ZOOM_DEFAULT_LEVEL;
  }

  const stored = window.localStorage.getItem(EXPLORER_ZOOM_STORAGE_KEY);
  if (!stored) {
    return EXPLORER_ZOOM_DEFAULT_LEVEL;
  }

  const parsed = Number.parseFloat(stored);
  if (!Number.isFinite(parsed)) {
    return EXPLORER_ZOOM_DEFAULT_LEVEL;
  }

  return resolveNearestExplorerZoomLevel(parsed);
};

/**
 * Hook for managing explorer zoom levels and browser zoom detection
 *
 * Features:
 * - Manual explorer zoom level management with localStorage persistence
 * - Browser zoom detection via devicePixelRatio
 * - Effective zoom level calculation combining both factors
 * - Header zoom style for proper UI scaling
 * - Cross-window zoom synchronization via custom events
 */
export function useExplorerZoom(): UseExplorerZoomResult {
  const [manualExplorerZoomLevel, setManualExplorerZoomLevel] = useState<number>(
    resolveInitialManualExplorerZoomLevel
  );
  const [browserZoomFactor, setBrowserZoomFactor] = useState(1);
  const initialDevicePixelRatioRef = useRef<number | null>(null);

  // Calculate effective zoom level combining manual and browser zoom
  const effectiveExplorerZoomLevel = useMemo(
    () => resolveNearestExplorerZoomLevel(manualExplorerZoomLevel * browserZoomFactor),
    [browserZoomFactor, manualExplorerZoomLevel]
  );

  // Calculate header zoom style for UI scaling
  const headerZoomStyle = useMemo(() => {
    const normalizedBrowserZoom = Math.max(
      MIN_BROWSER_ZOOM_FACTOR,
      Math.min(MAX_BROWSER_ZOOM_FACTOR, browserZoomFactor)
    );
    const ratio =
      effectiveExplorerZoomLevel / (EXPLORER_ZOOM_DEFAULT_LEVEL * normalizedBrowserZoom);
    return {
      zoom: Math.max(0.7, Math.min(2.4, ratio)),
    };
  }, [browserZoomFactor, effectiveExplorerZoomLevel]);

  // Listen for zoom change events from other components/windows
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onExplorerZoomChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ manualExplorerZoomLevel?: number }>;
      const nextManualZoom = customEvent.detail?.manualExplorerZoomLevel;
      if (typeof nextManualZoom === 'number' && Number.isFinite(nextManualZoom)) {
        setManualExplorerZoomLevel(resolveNearestExplorerZoomLevel(nextManualZoom));
      }
    };

    window.addEventListener(EXPLORER_ZOOM_EVENT_NAME, onExplorerZoomChange as EventListener);
    return () => {
      window.removeEventListener(EXPLORER_ZOOM_EVENT_NAME, onExplorerZoomChange as EventListener);
    };
  }, []);

  // Detect browser zoom changes via devicePixelRatio
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const baseDevicePixelRatio =
      initialDevicePixelRatioRef.current ?? Math.max(window.devicePixelRatio || 1, 0.01);
    initialDevicePixelRatioRef.current = baseDevicePixelRatio;

    const syncBrowserZoomFactor = () => {
      const currentRatio = Math.max(window.devicePixelRatio || 1, 0.01);
      const nextFactor = Math.max(
        MIN_BROWSER_ZOOM_FACTOR,
        Math.min(MAX_BROWSER_ZOOM_FACTOR, currentRatio / baseDevicePixelRatio)
      );

      setBrowserZoomFactor((previous) =>
        Math.abs(previous - nextFactor) < 0.01 ? previous : nextFactor
      );
    };

    syncBrowserZoomFactor();
    window.addEventListener('resize', syncBrowserZoomFactor);
    window.visualViewport?.addEventListener('resize', syncBrowserZoomFactor);
    return () => {
      window.removeEventListener('resize', syncBrowserZoomFactor);
      window.visualViewport?.removeEventListener('resize', syncBrowserZoomFactor);
    };
  }, []);

  // Persist manual zoom level to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(EXPLORER_ZOOM_STORAGE_KEY, String(manualExplorerZoomLevel));
  }, [manualExplorerZoomLevel]);

  return {
    manualExplorerZoomLevel,
    browserZoomFactor,
    effectiveExplorerZoomLevel,
    headerZoomStyle,
    setManualExplorerZoomLevel,
  };
}
