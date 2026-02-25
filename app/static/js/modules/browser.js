/**
 * File Browser Module
 * Handles rendering and navigation of the S3 virtual filesystem
 * @module browser
 */

import { apiCall } from './api.js';
import { escapeHtml, formatBytes, showMessage } from './utils.js';
import { currentPath, setCurrentPath, clearSelection, setAllItems } from './state.js';
import { updateSelectionUI } from './selection.js';
import { handleItemSelection, selectRange } from './selection.js';
import { downloadFile, deleteFile, deleteFolder, renameItem } from './operations.js';
import { showContextMenu } from './contextMenu.js';

/**
 * Browse a path in the S3 virtual filesystem
 * @param {string} [path=''] - The virtual path to browse
 * @returns {Promise<void>}
 */
export async function browse(path = '') {
    const container = document.getElementById('browserContainer');
    const breadcrumbsContainer = document.getElementById('breadcrumbs');
    const toolbar = document.getElementById('toolbar');
    
    setCurrentPath(path);
    clearSelection();
    setAllItems([]);
    
    try {
        container.innerHTML = '<p class="loading">Loading...</p>';
        
        const url = path ? `/api/s3/browse/${path}` : '/api/s3/browse';
        /** @type {import('../types.js').BrowseResponse} */
        const data = await apiCall(url);
        
        // Store items for selection
        setAllItems(data.items);
        
        // Render breadcrumbs
        renderBreadcrumbs(data.breadcrumbs, breadcrumbsContainer);
        
        // Show/hide toolbar based on whether we're in a bucket
        if (toolbar) {
            toolbar.style.display = path ? 'flex' : 'none';
        }
        
        // Render items
        if (data.items.length === 0) {
            container.innerHTML = '<p class="info">This folder is empty.</p>';
            updateSelectionUI();
            return;
        }
        
        const html = `
            <div class="file-browser">
                ${data.items.map(item => renderItem(item)).join('')}
            </div>
        `;
        
        container.innerHTML = html;
        
        // Add event listeners
        container.querySelectorAll('.browser-item').forEach((item, index) => {
            const itemPath = item.dataset.path;
            const itemType = item.dataset.type;
            const itemName = item.dataset.name;
            
            // Checkbox for selection
            const checkbox = item.querySelector('.item-checkbox');
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    e.stopPropagation();
                    handleItemSelection(itemPath, checkbox.checked, index);
                });
            }
            
            // Right-click context menu
            item.addEventListener('contextmenu', (e) => {
                showContextMenu(e, itemPath, itemName, itemType);
            });
            
            // Click handler with Ctrl/Cmd and Shift support
            item.addEventListener('click', (e) => {
                // Skip if clicking on actions or checkbox
                if (e.target.closest('.item-actions') || e.target.closest('.item-checkbox')) {
                    return;
                }
                
                // Handle Ctrl/Cmd + Click for multi-select
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    const checkbox = item.querySelector('.item-checkbox');
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        handleItemSelection(itemPath, checkbox.checked, index);
                    }
                    return;
                }
                
                // Handle Shift + Click for range selection
                if (e.shiftKey) {
                    e.preventDefault();
                    selectRange(index);
                    return;
                }
                
                // Default behavior: navigate for directories
                if (itemType === 'directory') {
                    browse(itemPath);
                }
            });
            
            if (itemType === 'directory') {
                // Add folder-specific actions
                const deleteBtn = item.querySelector('.delete-folder-btn');
                const renameBtn = item.querySelector('.rename-btn');
                
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        deleteFolder(itemPath, itemName);
                    });
                }
                
                if (renameBtn) {
                    renameBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        renameItem(itemPath, itemName, itemType);
                    });
                }
            } else {
                // For files, add action buttons
                const downloadBtn = item.querySelector('.download-btn');
                const deleteBtn = item.querySelector('.delete-btn');
                const renameBtn = item.querySelector('.rename-btn');
                
                if (downloadBtn) {
                    downloadBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        downloadFile(itemPath);
                    });
                }
                
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        deleteFile(itemPath);
                    });
                }
                
                if (renameBtn) {
                    renameBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        renameItem(itemPath, itemName, itemType);
                    });
                }
            }
        });
    } catch (error) {
        container.innerHTML = `<p class="error">Failed to load: ${escapeHtml(error.message)}</p>`;
    }
}

/**
 * Renders breadcrumb navigation
 * @param {import('../types.js').Breadcrumb[]} breadcrumbs - Array of breadcrumb items
 * @param {HTMLElement} container - The breadcrumbs container element
 */
function renderBreadcrumbs(breadcrumbs, container) {
    const html = breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;
        return `
            <span class="breadcrumb-item ${isLast ? 'active' : ''}" 
                  ${!isLast ? `onclick="window.browseGlobal('${escapeHtml(crumb.path)}')"` : ''}>
                ${escapeHtml(crumb.name)}
            </span>
            ${!isLast ? '<span class="breadcrumb-separator">/</span>' : ''}
        `;
    }).join('');
    
    container.innerHTML = html;
}

/**
 * Renders a single browser item (file or directory)
 * @param {import('../types.js').S3Item} item - The item to render
 * @returns {string} HTML string for the item
 */
function renderItem(item) {
    const isRoot = currentPath === '';
    
    if (item.type === 'directory') {
        return `
            <div class="browser-item directory" data-path="${escapeHtml(item.path)}" data-type="directory" data-name="${escapeHtml(item.name)}">
                ${!isRoot ? '<input type="checkbox" class="item-checkbox" />' : ''}
                <div class="item-icon">${item.icon}</div>
                <div class="item-info">
                    <div class="item-name">${escapeHtml(item.name)}</div>
                    <div class="item-meta">
                        ${item.lastModified ? `Modified: ${new Date(item.lastModified).toLocaleString()}` : 'Folder'}
                    </div>
                </div>
                ${!isRoot ? `
                <div class="item-actions">
                    <button class="btn btn-sm btn-secondary rename-btn" title="Rename">
                        ✏️
                    </button>
                    <button class="btn btn-sm btn-danger delete-folder-btn" title="Delete Folder">
                        🗑️
                    </button>
                </div>
                ` : ''}
            </div>
        `;
    } else {
        return `
            <div class="browser-item file" data-path="${escapeHtml(item.path)}" data-type="file" data-name="${escapeHtml(item.name)}">
                <input type="checkbox" class="item-checkbox" />
                <div class="item-icon">${item.icon}</div>
                <div class="item-info">
                    <div class="item-name">${escapeHtml(item.name)}</div>
                    <div class="item-meta">
                        ${formatBytes(item.size)} | Modified: ${new Date(item.lastModified).toLocaleString()}
                    </div>
                </div>
                <div class="item-actions">
                    <button class="btn btn-sm btn-primary download-btn" title="Download">
                        ⬇️
                    </button>
                    <button class="btn btn-sm btn-secondary rename-btn" title="Rename">
                        ✏️
                    </button>
                    <button class="btn btn-sm btn-danger delete-btn" title="Delete">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    }
}
