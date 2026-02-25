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

// Virtual Filesystem Browser
async function browse(path = '') {
    const container = document.getElementById('browserContainer');
    const breadcrumbsContainer = document.getElementById('breadcrumbs');
    
    currentPath = path;
    
    try {
        container.innerHTML = '<p class="loading">Loading...</p>';
        
        const url = path ? `/api/s3/browse/${path}` : '/api/s3/browse';
        const data = await apiCall(url);
        
        // Render breadcrumbs
        renderBreadcrumbs(data.breadcrumbs, breadcrumbsContainer);
        
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
            
            if (itemType === 'directory') {
                item.addEventListener('click', () => browse(itemPath));
            } else {
                // For files, add action buttons
                const downloadBtn = item.querySelector('.download-btn');
                const deleteBtn = item.querySelector('.delete-btn');
                
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
            }
        });
    } catch (error) {
        container.innerHTML = `<p class="error">Failed to load: ${escapeHtml(error.message)}</p>`;
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
    if (item.type === 'directory') {
        return `
            <div class="browser-item directory" data-path="${escapeHtml(item.path)}" data-type="directory">
                <div class="item-icon">${item.icon}</div>
                <div class="item-info">
                    <div class="item-name">${escapeHtml(item.name)}</div>
                    <div class="item-meta">
                        ${item.lastModified ? `Modified: ${new Date(item.lastModified).toLocaleString()}` : 'Folder'}
                    </div>
                </div>
            </div>
        `;
    } else {
        return `
            <div class="browser-item file" data-path="${escapeHtml(item.path)}" data-type="file">
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
    }
});
