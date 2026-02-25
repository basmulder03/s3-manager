/**
 * Upload Module
 * Handles file and folder uploads, drag-and-drop functionality
 * @module upload
 */

import { apiCall } from './api.js';
import { showMessage } from './utils.js';
import { currentPath } from './state.js';
import { closeUploadModal, closeFolderModal } from './modals.js';

/**
 * Uploads selected files or folder to the current S3 path
 * @returns {Promise<void>}
 */
export async function uploadFiles() {
    const filesTab = document.getElementById('filesTab');
    const folderTab = document.getElementById('folderTab');
    const isFilesMode = filesTab.style.display !== 'none';
    
    const fileInput = isFilesMode ? 
        document.getElementById('uploadFileInput') : 
        document.getElementById('uploadFolderInput');
    
    const files = fileInput.files;
    
    if (!files || files.length === 0) {
        showMessage('Please select file(s) or a folder', 'error');
        return;
    }
    
    if (!currentPath) {
        showMessage('Cannot upload to root. Please navigate to a bucket.', 'error');
        return;
    }
    
    const formData = new FormData();
    const relativePaths = [];
    
    // Add all files to FormData
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        formData.append('files[]', file);
        
        // For folder uploads, preserve relative path structure
        if (!isFilesMode && file.webkitRelativePath) {
            relativePaths.push(file.webkitRelativePath);
        } else {
            relativePaths.push(file.name);
        }
    }
    
    // Add relative paths for folder structure preservation
    relativePaths.forEach(path => {
        formData.append('relativePaths[]', path);
    });
    
    formData.append('path', currentPath);
    
    // Show progress
    const progressDiv = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('uploadProgressBar');
    const statusText = document.getElementById('uploadStatus');
    
    progressDiv.style.display = 'block';
    statusText.textContent = `Uploading ${files.length} file(s)...`;
    progressBar.style.width = '10%';
    
    try {
        const response = await fetch('/api/s3/operations/upload', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        
        progressBar.style.width = '90%';
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }
        
        /** @type {import('../types.js').UploadResult} */
        const result = await response.json();
        progressBar.style.width = '100%';
        
        showMessage(result.message || `${result.count} file(s) uploaded successfully`, 'success');
        
        // Close modal and refresh
        setTimeout(() => {
            closeUploadModal();
            // Import browse dynamically to avoid circular dependency
            import('./browser.js').then(({ browse }) => browse(currentPath));
        }, 500);
    } catch (error) {
        progressDiv.style.display = 'none';
        showMessage('Failed to upload: ' + error.message, 'error');
    }
}

/**
 * Creates a new folder in the current S3 path
 * @returns {Promise<void>}
 */
export async function createNewFolder() {
    const folderName = document.getElementById('newFolderName').value.trim();
    
    if (!folderName) {
        showMessage('Please enter a folder name', 'error');
        return;
    }
    
    if (!currentPath) {
        showMessage('Cannot create folder in root. Please navigate to a bucket.', 'error');
        return;
    }
    
    try {
        await apiCall('/api/s3/operations/create-folder', {
            method: 'POST',
            body: JSON.stringify({ 
                path: currentPath,
                folderName: folderName
            })
        });
        
        showMessage(`Folder "${folderName}" created successfully`, 'success');
        
        // Close modal and refresh
        closeFolderModal();
        import('./browser.js').then(({ browse }) => browse(currentPath));
    } catch (error) {
        showMessage('Failed to create folder: ' + error.message, 'error');
    }
}

/**
 * Sets up drag-and-drop functionality for the browser container
 */
export function setupDragAndDrop() {
    const container = document.getElementById('browserContainer');
    
    if (!container) return;
    
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        container.classList.add('drag-over');
    });
    
    container.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        container.classList.remove('drag-over');
    });
    
    container.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        container.classList.remove('drag-over');
        
        if (!currentPath) {
            showMessage('Cannot upload to root. Please navigate to a bucket.', 'error');
            return;
        }
        
        const files = Array.from(e.dataTransfer.files);
        
        if (files.length === 0) return;
        
        showMessage(`Uploading ${files.length} file(s)...`, 'info');
        
        let successCount = 0;
        let errorCount = 0;
        
        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('path', currentPath);
            
            try {
                const response = await fetch('/api/s3/operations/upload', {
                    method: 'POST',
                    credentials: 'include',
                    body: formData
                });
                
                if (response.ok) {
                    successCount++;
                } else {
                    errorCount++;
                }
            } catch (error) {
                errorCount++;
            }
        }
        
        if (successCount > 0) {
            showMessage(`Uploaded ${successCount} file(s) successfully`, 'success');
            import('./browser.js').then(({ browse }) => browse(currentPath));
        }
        
        if (errorCount > 0) {
            showMessage(`Failed to upload ${errorCount} file(s)`, 'error');
        }
    });
}
