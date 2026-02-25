/**
 * S3 Manager - Main Application Entry Point
 * @module app
 */

// Import all modules
import { login, logout, requestPIMElevation } from './modules/auth.js';
import { browse } from './modules/browser.js';
import { toggleSelectAll } from './modules/selection.js';
import { deleteSelectedItems, downloadSelectedItems } from './modules/operations.js';
import { hideContextMenu, contextMenuAction, closePropertiesModal } from './modules/contextMenu.js';
import { showUploadModal, closeUploadModal, showFolderModal, closeFolderModal, switchUploadTab } from './modules/modals.js';
import { uploadFiles, createNewFolder, setupDragAndDrop } from './modules/upload.js';
import { selectedItems, currentPath } from './modules/state.js';
import { updateSelectionUI } from './modules/selection.js';

// Make functions globally accessible for onclick handlers in HTML
window.login = login;
window.logout = logout;
window.requestPIMElevation = requestPIMElevation;
window.browseGlobal = browse;
window.toggleSelectAll = toggleSelectAll;
window.deleteSelectedItems = deleteSelectedItems;
window.downloadSelectedItems = downloadSelectedItems;
window.contextMenuAction = contextMenuAction;
window.closePropertiesModal = closePropertiesModal;
window.showUploadModal = showUploadModal;
window.closeUploadModal = closeUploadModal;
window.showFolderModal = showFolderModal;
window.closeFolderModal = closeFolderModal;
window.switchUploadTab = switchUploadTab;
window.uploadFiles = uploadFiles;
window.createNewFolder = createNewFolder;

/**
 * Initialize the application when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
    const browserContainer = document.getElementById('browserContainer');
    if (browserContainer) {
        browse('');  // Start at root (show all buckets)
        setupDragAndDrop();
    }
    
    // Hide context menu when clicking anywhere
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#contextMenu')) {
            hideContextMenu();
        }
    });
    
    // Close modals when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+A or Cmd+A - Select All (only when not in an input field)
        if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !e.target.matches('input, textarea')) {
            e.preventDefault();
            if (currentPath) { // Only in bucket/folder view
                toggleSelectAll();
            }
        }
        
        // Delete key - Delete selected items
        if (e.key === 'Delete' && !e.target.matches('input, textarea')) {
            if (selectedItems.size > 0) {
                deleteSelectedItems();
            }
        }
        
        // Escape key - Clear selection
        if (e.key === 'Escape') {
            if (selectedItems.size > 0) {
                selectedItems.clear();
                const container = document.getElementById('browserContainer');
                if (container) {
                    container.querySelectorAll('.item-checkbox').forEach(cb => cb.checked = false);
                }
                updateSelectionUI();
            }
        }
    });
});
