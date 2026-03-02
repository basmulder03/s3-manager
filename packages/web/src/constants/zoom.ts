/**
 * Explorer zoom configuration constants
 * Used for managing zoom levels in the file browser
 */

export const EXPLORER_ZOOM_STORAGE_KEY = 'browser-explorer-zoom';
export const EXPLORER_ZOOM_EVENT_NAME = 's3-manager:explorer-zoom-change';
export const EXPLORER_ZOOM_LEVELS = [70, 85, 100, 115, 130, 150, 175, 200] as const;
export const EXPLORER_ZOOM_DEFAULT_LEVEL = 100;
export const MIN_BROWSER_ZOOM_FACTOR = 0.5;
export const MAX_BROWSER_ZOOM_FACTOR = 3;

export type ExplorerZoomLevel = (typeof EXPLORER_ZOOM_LEVELS)[number];

/**
 * Find the nearest valid zoom level to a given value
 */
export const resolveNearestExplorerZoomLevel = (value: number): number => {
  return EXPLORER_ZOOM_LEVELS.reduce((closest, candidate) => {
    return Math.abs(candidate - value) < Math.abs(closest - value) ? candidate : closest;
  }, EXPLORER_ZOOM_DEFAULT_LEVEL);
};
