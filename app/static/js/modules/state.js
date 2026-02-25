/**
 * Global State Management Module
 * Manages application-wide state including current path, selected items, and selection tracking
 * @module state
 */

/**
 * The current virtual path in the S3 filesystem
 * @type {string}
 */
export let currentPath = '';

/**
 * Set of currently selected item paths
 * @type {Set<string>}
 */
export let selectedItems = new Set();

/**
 * Index of the last selected item for range selection
 * @type {number}
 */
export let lastSelectedIndex = -1;

/**
 * Array of all items in the current directory (used for range selection and type checking)
 * @type {import('../types.js').S3Item[]}
 */
export let allItems = [];

/**
 * Updates the current path
 * @param {string} path - The new current path
 */
export function setCurrentPath(path) {
    currentPath = path;
}

/**
 * Clears all selected items and resets selection state
 */
export function clearSelection() {
    selectedItems.clear();
    lastSelectedIndex = -1;
}

/**
 * Sets all items for the current directory
 * @param {import('../types.js').S3Item[]} items - Array of S3 items
 */
export function setAllItems(items) {
    allItems = items;
}

/**
 * Updates the last selected index for range selection
 * @param {number} index - The new last selected index
 */
export function setLastSelectedIndex(index) {
    lastSelectedIndex = index;
}
