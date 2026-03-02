import { useState, useMemo, useCallback, useEffect, useRef, type CSSProperties } from 'react';
import {
  EXPLORER_ZOOM_DEFAULT_LEVEL,
  EXPLORER_ZOOM_EVENT_NAME,
  EXPLORER_ZOOM_LEVELS,
  EXPLORER_ZOOM_STORAGE_KEY,
  EXPLORER_GRID_VIEW_MIN_ZOOM,
  resolveInitialExplorerZoomLevel,
  resolveNearestExplorerZoomLevel,
  resolveNextExplorerZoomLevel,
} from '@web/pages/browser/constants';

const MIN_BROWSER_ZOOM_FACTOR = 0.5;
const MAX_BROWSER_ZOOM_FACTOR = 3;

export const useBrowserZoom = () => {
  const [manualExplorerZoomLevel, setManualExplorerZoomLevel] = useState<number>(
    resolveInitialExplorerZoomLevel
  );
  const [browserZoomFactor, setBrowserZoomFactor] = useState(1);
  const initialDevicePixelRatioRef = useRef<number | null>(null);

  const explorerZoomLevel = useMemo(
    () => resolveNearestExplorerZoomLevel(manualExplorerZoomLevel * browserZoomFactor),
    [browserZoomFactor, manualExplorerZoomLevel]
  );

  const isExplorerGridView = explorerZoomLevel >= EXPLORER_GRID_VIEW_MIN_ZOOM;

  const explorerViewportScale = useMemo(() => {
    const normalizedBrowserZoom = Math.max(
      MIN_BROWSER_ZOOM_FACTOR,
      Math.min(MAX_BROWSER_ZOOM_FACTOR, browserZoomFactor)
    );
    const ratio = explorerZoomLevel / (EXPLORER_ZOOM_DEFAULT_LEVEL * normalizedBrowserZoom);
    return Math.max(0.7, Math.min(2.4, ratio));
  }, [browserZoomFactor, explorerZoomLevel]);

  const explorerZoomStyle = useMemo(
    () =>
      ({
        zoom: explorerViewportScale,
      }) as CSSProperties,
    [explorerViewportScale]
  );

  const resetExplorerZoom = useCallback(() => {
    setManualExplorerZoomLevel(EXPLORER_ZOOM_DEFAULT_LEVEL);
  }, []);

  const nudgeExplorerZoom = useCallback(
    (direction: 1 | -1) => {
      setManualExplorerZoomLevel((previousManualZoomLevel) => {
        const effectiveLevel = resolveNearestExplorerZoomLevel(
          previousManualZoomLevel * browserZoomFactor
        );
        const nextEffectiveLevel = resolveNextExplorerZoomLevel(effectiveLevel, direction);
        const nextManualLevel = nextEffectiveLevel / Math.max(browserZoomFactor, 0.01);
        return Math.max(
          EXPLORER_ZOOM_LEVELS[0],
          Math.min(EXPLORER_ZOOM_LEVELS.at(-1) ?? 200, nextManualLevel)
        );
      });
    },
    [browserZoomFactor]
  );

  // Save zoom level to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(EXPLORER_ZOOM_STORAGE_KEY, String(manualExplorerZoomLevel));
    window.dispatchEvent(
      new CustomEvent(EXPLORER_ZOOM_EVENT_NAME, {
        detail: { manualExplorerZoomLevel },
      })
    );
  }, [manualExplorerZoomLevel]);

  // Track browser zoom changes
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

  // Keyboard zoom shortcuts
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      if (event.deltaY === 0) {
        return;
      }

      nudgeExplorerZoom(event.deltaY < 0 ? 1 : -1);
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', onWheel);
    };
  }, [nudgeExplorerZoom]);

  return {
    explorerZoomLevel,
    manualExplorerZoomLevel,
    setManualExplorerZoomLevel,
    browserZoomFactor,
    isExplorerGridView,
    explorerZoomStyle,
    explorerViewportScale,
    resetExplorerZoom,
    nudgeExplorerZoom,
  };
};
