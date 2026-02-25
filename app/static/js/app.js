// API helper functions
async function apiCall(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Request failed');
        }
        
        return await response.json();
    } catch (error) {
        console.error('API call error:', error);
        throw error;
    }
}

// Authentication functions
function login() {
    window.location.href = '/auth/login';
}

function logout() {
    window.location.href = '/auth/logout';
}

// PIM elevation
async function requestPIMElevation() {
    try {
        const role = prompt('Enter the role you want to activate (e.g., S3-Admin):');
        if (!role) return;
        
        const result = await apiCall('/auth/pim/elevate', {
            method: 'POST',
            body: JSON.stringify({ role })
        });
        
        showMessage('PIM elevation request submitted. Waiting for approval...', 'info');
        console.log('PIM result:', result);
    } catch (error) {
        showMessage('Failed to request PIM elevation: ' + error.message, 'error');
    }
}

// Global state for current path
let currentPath = '';
let selectedItems = new Set();

// Virtual Filesystem Browser
async function browse(path = '') {
    const container = document.getElementById('browserContainer');
    const breadcrumbsContainer = document.getElementById('breadcrumbs');
    const toolbar = document.getElementById('toolbar');
    
    currentPath = path;
    selectedItems.clear();
    
    try {
        container.innerHTML = '<p class="loading">Loading...</p>';
        
        const url = path ? `/api/s3/browse/${path}` : '/api/s3/browse';
        const data = await apiCall(url);
        
        // Render breadcrumbs
        renderBreadcrumbs(data.breadcrumbs, breadcrumbsContainer);
        
        // Show/hide toolbar based on whether we're in a bucket
        if (toolbar) {
            toolbar.style.display = path ? 'flex' : 'none';
        }
        
        // Render items
        if (data.items.length === 0) {
            container.innerHTML = '<p class="info">This folder is empty.</p>';
            return;
        }
        
        const html = `
            <div class="file-browser">
                ${data.items.map(item => renderItem(item)).join('')}
            </div>
        `;
        
        container.innerHTML = html;
        
        // Add event listeners
        container.querySelectorAll('.browser-item').forEach(item => {
            const itemPath = item.dataset.path;
            const itemType = item.dataset.type;
            const itemName = item.dataset.name;
            
            // Checkbox for selection
            const checkbox = item.querySelector('.item-checkbox');
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    e.stopPropagation();
                    handleItemSelection(itemPath, checkbox.checked);
                });
            }
            
            if (itemType === 'directory') {
                item.addEventListener('click', (e) => {
                    if (!e.target.closest('.item-actions') && !e.target.closest('.item-checkbox')) {
                        browse(itemPath);
                    }
                });
                
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

function handleItemSelection(path, isSelected) {
    if (isSelected) {
        selectedItems.add(path);
    } else {
        selectedItems.delete(path);
    }
    
    updateSelectionUI();
}

function updateSelectionUI() {
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
    }
}

function renderBreadcrumbs(breadcrumbs, container) {
    const html = breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;
        return `
            <span class="breadcrumb-item ${isLast ? 'active' : ''}" 
                  ${!isLast ? `onclick="browse('${escapeHtml(crumb.path)}')"` : ''}>
                ${escapeHtml(crumb.name)}
            </span>
            ${!isLast ? '<span class="breadcrumb-separator">/</span>' : ''}
        `;
    }).join('');
    
    container.innerHTML = html;
}

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

async function downloadFile(virtualPath) {
    try {
        // Extract bucket and object key from virtual path
        const parts = virtualPath.split('/');
        const bucket = parts[0];
        const objectKey = parts.slice(1).join('/');
        
        const data = await apiCall(`/api/s3/buckets/${bucket}/objects/${objectKey}`);
        
        // Open download URL in new tab
        window.open(data.downloadUrl, '_blank');
    } catch (error) {
        showMessage('Failed to download file: ' + error.message, 'error');
    }
}

async function deleteFile(virtualPath) {
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
        browse(currentPath);
    } catch (error) {
        showMessage('Failed to delete file: ' + error.message, 'error');
    }
}

async function deleteFolder(virtualPath, folderName) {
    if (!confirm(`Are you sure you want to delete the folder "${folderName}" and all its contents?`)) {
        return;
    }
    
    try {
        await apiCall('/api/s3/operations/delete-folder', {
            method: 'DELETE',
            body: JSON.stringify({ path: virtualPath })
        });
        
        showMessage('Folder deleted successfully', 'success');
        browse(currentPath);
    } catch (error) {
        showMessage('Failed to delete folder: ' + error.message, 'error');
    }
}

async function uploadFile() {
    const fileInput = document.getElementById('uploadFileInput');
    const file = fileInput.files[0];
    
    if (!file) {
        showMessage('Please select a file', 'error');
        return;
    }
    
    if (!currentPath) {
        showMessage('Cannot upload to root. Please navigate to a bucket.', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', currentPath);
    
    try {
        const response = await fetch('/api/s3/operations/upload', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }
        
        const result = await response.json();
        showMessage(`File "${result.filename}" uploaded successfully`, 'success');
        
        // Close modal and refresh
        closeUploadModal();
        browse(currentPath);
    } catch (error) {
        showMessage('Failed to upload file: ' + error.message, 'error');
    }
}

async function createNewFolder() {
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
        browse(currentPath);
    } catch (error) {
        showMessage('Failed to create folder: ' + error.message, 'error');
    }
}

async function renameItem(virtualPath, currentName, itemType) {
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
        browse(currentPath);
    } catch (error) {
        showMessage('Failed to rename: ' + error.message, 'error');
    }
}

async function deleteSelectedItems() {
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
        browse(currentPath);
    } catch (error) {
        showMessage('Failed to delete items: ' + error.message, 'error');
    }
}

// Modal functions
function showUploadModal() {
    const modal = document.getElementById('uploadModal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('uploadFileInput').value = '';
    }
}

function closeUploadModal() {
    const modal = document.getElementById('uploadModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function showFolderModal() {
    const modal = document.getElementById('folderModal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('newFolderName').value = '';
    }
}

function closeFolderModal() {
    const modal = document.getElementById('folderModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Drag and drop support
function setupDragAndDrop() {
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
            browse(currentPath);
        }
        
        if (errorCount > 0) {
            showMessage(`Failed to upload ${errorCount} file(s)`, 'error');
        }
    });
}

// Utility functions
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showMessage(message, type = 'info') {
    // Remove any existing messages
    const existingMessages = document.querySelectorAll('.message-toast');
    existingMessages.forEach(msg => msg.remove());
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message-toast message-${type}`;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    const browserContainer = document.getElementById('browserContainer');
    if (browserContainer) {
        browse('');  // Start at root (show all buckets)
        setupDragAndDrop();
    }
});
