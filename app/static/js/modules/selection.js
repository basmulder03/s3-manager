/**
 * Selection Management Module
 * Handles multi-select functionality including checkboxes, Ctrl+Click, and Shift+Click
 * @module selection
 */

import { selectedItems, lastSelectedIndex, setLastSelectedIndex, allItems } from './state.js';

/**
 * Handles selection/deselection of an item
 * @param {string} path - The path of the item being selected/deselected
 * @param {boolean} isSelected - Whether the item is being selected (true) or deselected (false)
 * @param {number} [index=-1] - The index of the item in the browser list
 */
export function handleItemSelection(path, isSelected, index = -1) {
    if (isSelected) {
        selectedItems.add(path);
        if (index !== -1) {
            setLastSelectedIndex(index);
        }
    } else {
        selectedItems.delete(path);
    }
    
    updateSelectionUI();
}

/**
 * Selects a range of items from the last selected index to the target index
 * @param {number} endIndex - The ending index of the range to select
 */
export function selectRange(endIndex) {
    if (lastSelectedIndex === -1) return;
    
    const container = document.getElementById('browserContainer');
    const items = container.querySelectorAll('.browser-item');
    
    const min = Math.min(lastSelectedIndex, endIndex);
    const max = Math.max(lastSelectedIndex, endIndex);
    
    for (let i = min; i <= max; i++) {
        const item = items[i];
        const checkbox = item.querySelector('.item-checkbox');
        if (checkbox) {
            checkbox.checked = true;
            const itemPath = item.dataset.path;
            selectedItems.add(itemPath);
        }
    }
    
    setLastSelectedIndex(endIndex);
    updateSelectionUI();
}

/**
 * Toggles selection of all items in the current directory
 */
export function toggleSelectAll() {
    const container = document.getElementById('browserContainer');
    const items = container.querySelectorAll('.browser-item');
    const checkboxes = container.querySelectorAll('.item-checkbox');
    
    // Check if all are selected
    const allSelected = Array.from(checkboxes).every(cb => cb.checked);
    
    if (allSelected) {
        // Deselect all
        selectedItems.clear();
        checkboxes.forEach(cb => cb.checked = false);
    } else {
        // Select all
        items.forEach(item => {
            const checkbox = item.querySelector('.item-checkbox');
            if (checkbox) {
                checkbox.checked = true;
                selectedItems.add(item.dataset.path);
            }
        });
    }
    
    updateSelectionUI();
}

/**
 * Updates the UI to reflect the current selection state
 * Updates toolbar buttons, selection info, and visual highlighting
 */
export function updateSelectionUI() {
    const selectedCount = selectedItems.size;
    const toolbar = document.getElementById('toolbar');
    
    if (toolbar) {
        const selectionInfo = toolbar.querySelector('.selection-info');
        if (selectionInfo) {
            if (selectedCount > 0) {
                selectionInfo.textContent = `${selectedCount} item(s) selected`;
                selectionInfo.style.display = 'block';
            } else {
                selectionInfo.style.display = 'none';
            }
        }
        
        const deleteSelectedBtn = toolbar.querySelector('.delete-selected-btn');
        if (deleteSelectedBtn) {
            deleteSelectedBtn.disabled = selectedCount === 0;
        }
        
        const downloadSelectedBtn = toolbar.querySelector('.download-selected-btn');
        if (downloadSelectedBtn) {
            // Only enable if all selected items are files (not folders)
            const allFiles = Array.from(selectedItems).every(path => {
                const item = allItems.find(i => i.path === path);
                return item && item.type === 'file';
            });
            downloadSelectedBtn.disabled = selectedCount === 0 || !allFiles;
        }
        
        const selectAllBtn = toolbar.querySelector('.select-all-btn');
        if (selectAllBtn) {
            const container = document.getElementById('browserContainer');
            const checkboxes = container.querySelectorAll('.item-checkbox');
            const allSelected = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
            selectAllBtn.textContent = allSelected ? '☐ Deselect All' : '☑️ Select All';
        }
    }
    
    // Update visual state of selected items
    const container = document.getElementById('browserContainer');
    if (container) {
        container.querySelectorAll('.browser-item').forEach(item => {
            const itemPath = item.dataset.path;
            if (selectedItems.has(itemPath)) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }
}
