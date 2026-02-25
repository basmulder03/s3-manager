/**
 * File Operations Module
 * Handles file and folder operations (download, delete, rename)
 * @module operations
 */

import { apiCall } from './api.js';
import { showMessage } from './utils.js';
import { currentPath, selectedItems, allItems } from './state.js';

/**
 * Downloads a file from S3
 * @param {string} virtualPath - The virtual path of the file to download
 * @returns {Promise<void>}
 */
export async function downloadFile(virtualPath) {
    try {
        // Use the backend proxy download endpoint
        const downloadUrl = `/api/s3/operations/download?path=${encodeURIComponent(virtualPath)}`;
        
        // Create a temporary link and click it to trigger download
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = ''; // Let the server specify the filename via Content-Disposition
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showMessage('Download started', 'success');
    } catch (error) {
        showMessage('Failed to download file: ' + error.message, 'error');
    }
}

/**
 * Deletes a file from S3
 * @param {string} virtualPath - The virtual path of the file to delete
 * @returns {Promise<void>}
 */
export async function deleteFile(virtualPath) {
    const parts = virtualPath.split('/');
    const bucket = parts[0];
    const objectKey = parts.slice(1).join('/');
    const fileName = parts[parts.length - 1];
    
    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
        return;
    }
    
    try {
        await apiCall(`/api/s3/buckets/${bucket}/objects/${objectKey}`, {
            method: 'DELETE'
        });
        
        showMessage('File deleted successfully', 'success');
        
        // Refresh current directory
        const { browse } = await import('./browser.js');
        browse(currentPath);
    } catch (error) {
        showMessage('Failed to delete file: ' + error.message, 'error');
    }
}

/**
 * Deletes a folder and all its contents from S3
 * @param {string} virtualPath - The virtual path of the folder to delete
 * @param {string} folderName - The name of the folder
 * @returns {Promise<void>}
 */
export async function deleteFolder(virtualPath, folderName) {
    if (!confirm(`Are you sure you want to delete the folder "${folderName}" and all its contents?`)) {
        return;
    }
    
    try {
        await apiCall('/api/s3/operations/delete-folder', {
            method: 'DELETE',
            body: JSON.stringify({ path: virtualPath })
        });
        
        showMessage('Folder deleted successfully', 'success');
        const { browse } = await import('./browser.js');
        browse(currentPath);
    } catch (error) {
        showMessage('Failed to delete folder: ' + error.message, 'error');
    }
}

/**
 * Renames a file or folder in S3
 * @param {string} virtualPath - The virtual path of the item to rename
 * @param {string} currentName - The current name of the item
 * @param {string} itemType - The type of the item ('file' or 'directory')
 * @returns {Promise<void>}
 */
export async function renameItem(virtualPath, currentName, itemType) {
    const newName = prompt(`Rename ${itemType}:`, currentName);
    
    if (!newName || newName === currentName) {
        return;
    }
    
    try {
        await apiCall('/api/s3/operations/rename', {
            method: 'POST',
            body: JSON.stringify({
                oldPath: virtualPath,
                newName: newName
            })
        });
        
        showMessage(`${itemType === 'directory' ? 'Folder' : 'File'} renamed successfully`, 'success');
        const { browse } = await import('./browser.js');
        browse(currentPath);
    } catch (error) {
        showMessage('Failed to rename: ' + error.message, 'error');
    }
}

/**
 * Deletes all currently selected items
 * @returns {Promise<void>}
 */
export async function deleteSelectedItems() {
    if (selectedItems.size === 0) {
        showMessage('No items selected', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete ${selectedItems.size} item(s)?`)) {
        return;
    }
    
    try {
        const paths = Array.from(selectedItems);
        
        await apiCall('/api/s3/operations/delete-multiple', {
            method: 'DELETE',
            body: JSON.stringify({ paths })
        });
        
        showMessage('Selected items deleted successfully', 'success');
        selectedItems.clear();
        const { browse } = await import('./browser.js');
        browse(currentPath);
    } catch (error) {
        showMessage('Failed to delete items: ' + error.message, 'error');
    }
}

/**
 * Downloads all currently selected items (files only)
 * @returns {Promise<void>}
 */
export async function downloadSelectedItems() {
    if (selectedItems.size === 0) {
        showMessage('No items selected', 'error');
        return;
    }
    
    // Filter only files (not folders)
    const filePaths = Array.from(selectedItems).filter(path => {
        const item = allItems.find(i => i.path === path);
        return item && item.type === 'file';
    });
    
    if (filePaths.length === 0) {
        showMessage('No files selected. Folders cannot be downloaded.', 'error');
        return;
    }
    
    if (filePaths.length === 1) {
        // Single file - download directly
        downloadFile(filePaths[0]);
    } else {
        // Multiple files - download sequentially with a small delay
        showMessage(`Starting download of ${filePaths.length} files...`, 'info');
        
        for (let i = 0; i < filePaths.length; i++) {
            setTimeout(() => {
                downloadFile(filePaths[i]);
            }, i * 300); // 300ms delay between downloads to avoid browser blocking
        }
    }
}
