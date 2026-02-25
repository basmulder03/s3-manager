/**
 * Context Menu Module
 * Handles right-click context menu and properties modal
 * @module contextMenu
 */

import { escapeHtml, formatBytes } from './utils.js';
import { downloadFile, deleteFile, deleteFolder, renameItem } from './operations.js';

/**
 * @typedef {Object} ContextMenuTarget
 * @property {string} path - The virtual path of the item
 * @property {string} name - The name of the item
 * @property {string} type - The type of the item ('file' or 'directory')
 */

/**
 * Currently targeted item for context menu actions
 * @type {ContextMenuTarget|null}
 */
let contextMenuTarget = null;

/**
 * Shows the context menu at the mouse position
 * @param {MouseEvent} event - The mouse event that triggered the context menu
 * @param {string} itemPath - The virtual path of the item
 * @param {string} itemName - The name of the item
 * @param {string} itemType - The type of the item ('file' or 'directory')
 */
export function showContextMenu(event, itemPath, itemName, itemType) {
    event.preventDefault();
    event.stopPropagation();
    
    const contextMenu = document.getElementById('contextMenu');
    if (!contextMenu) return;
    
    // Store the target item info
    contextMenuTarget = { path: itemPath, name: itemName, type: itemType };
    
    // Position the context menu at mouse position
    contextMenu.style.display = 'block';
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    
    // Hide properties option for folders
    const items = contextMenu.querySelectorAll('.context-menu-item');
    items.forEach(item => {
        const action = item.getAttribute('onclick');
        if (action && action.includes('properties') && itemType === 'directory') {
            item.style.display = 'none';
        } else if (action && action.includes('download') && itemType === 'directory') {
            item.style.display = 'none';
        } else {
            item.style.display = 'flex';
        }
    });
}

/**
 * Hides the context menu
 */
export function hideContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) {
        contextMenu.style.display = 'none';
    }
    contextMenuTarget = null;
}

/**
 * Executes a context menu action
 * @param {string} action - The action to execute ('properties', 'download', 'rename', 'delete')
 * @returns {Promise<void>}
 */
export async function contextMenuAction(action) {
    if (!contextMenuTarget) return;
    
    const { path, name, type } = contextMenuTarget;
    hideContextMenu();
    
    switch (action) {
        case 'properties':
            await showPropertiesModal(path, name);
            break;
        case 'download':
            downloadFile(path);
            break;
        case 'rename':
            renameItem(path, name, type);
            break;
        case 'delete':
            if (type === 'directory') {
                deleteFolder(path, name);
            } else {
                deleteFile(path);
            }
            break;
    }
}

/**
 * Shows the properties modal for a file
 * @param {string} itemPath - The virtual path of the item
 * @param {string} itemName - The name of the item
 * @returns {Promise<void>}
 */
export async function showPropertiesModal(itemPath, itemName) {
    const modal = document.getElementById('propertiesModal');
    const content = document.getElementById('propertiesContent');
    
    if (!modal || !content) return;
    
    modal.style.display = 'flex';
    content.innerHTML = '<p class="loading">Loading properties...</p>';
    
    try {
        const response = await fetch(`/api/s3/operations/properties?path=${encodeURIComponent(itemPath)}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch properties');
        }
        
        /** @type {import('../types.js').FileProperties} */
        const data = await response.json();
        renderProperties(data, content);
    } catch (error) {
        content.innerHTML = `<p class="error">Failed to load properties: ${escapeHtml(error.message)}</p>`;
    }
}

/**
 * Closes the properties modal
 */
export function closePropertiesModal() {
    const modal = document.getElementById('propertiesModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Renders file properties in the properties modal
 * @param {import('../types.js').FileProperties} data - The file properties data
 * @param {HTMLElement} container - The container element for the properties
 */
function renderProperties(data, container) {
    const html = `
        <div class="property-group">
            <div class="property-group-title">General</div>
            <div class="property-row">
                <div class="property-label">Name:</div>
                <div class="property-value">${escapeHtml(data.name)}</div>
            </div>
            <div class="property-row">
                <div class="property-label">Size:</div>
                <div class="property-value">${formatBytes(data.size)}</div>
            </div>
            <div class="property-row">
                <div class="property-label">Type:</div>
                <div class="property-value">${escapeHtml(data.contentType || 'Unknown')}</div>
            </div>
            <div class="property-row">
                <div class="property-label">Last Modified:</div>
                <div class="property-value">${new Date(data.lastModified).toLocaleString()}</div>
            </div>
            ${data.etag ? `
            <div class="property-row">
                <div class="property-label">ETag:</div>
                <div class="property-value"><code>${escapeHtml(data.etag)}</code></div>
            </div>
            ` : ''}
        </div>
        
        ${data.metadata && Object.keys(data.metadata).length > 0 ? `
        <div class="property-group">
            <div class="property-group-title">Custom Metadata</div>
            ${Object.entries(data.metadata).map(([key, value]) => `
                <div class="property-row">
                    <div class="property-label">${escapeHtml(key)}:</div>
                    <div class="property-value">${escapeHtml(value)}</div>
                </div>
            `).join('')}
        </div>
        ` : ''}
        
        <div class="property-group">
            <div class="property-group-title">Storage Details</div>
            <div class="property-row">
                <div class="property-label">Storage Class:</div>
                <div class="property-value">${escapeHtml(data.storageClass || 'STANDARD')}</div>
            </div>
            <div class="property-row">
                <div class="property-label">Key:</div>
                <div class="property-value"><code>${escapeHtml(data.key)}</code></div>
            </div>
            ${data.versionId ? `
            <div class="property-row">
                <div class="property-label">Version ID:</div>
                <div class="property-value"><code>${escapeHtml(data.versionId)}</code></div>
            </div>
            ` : ''}
        </div>
    `;
    
    container.innerHTML = html;
}
