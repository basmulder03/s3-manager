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

// Bucket functions
async function loadBuckets() {
    const container = document.getElementById('bucketsContainer');
    
    try {
        const data = await apiCall('/api/s3/buckets');
        
        if (data.buckets.length === 0) {
            container.innerHTML = '<p class="info">No buckets found.</p>';
            return;
        }
        
        const html = `
            <div class="bucket-list">
                ${data.buckets.map(bucket => `
                    <div class="bucket-item" onclick="loadObjects('${bucket.name}')">
                        <div class="bucket-name">📦 ${bucket.name}</div>
                        <div class="bucket-date">Created: ${new Date(bucket.creationDate).toLocaleString()}</div>
                    </div>
                `).join('')}
            </div>
        `;
        
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<p class="error">Failed to load buckets: ${error.message}</p>`;
    }
}

// Object functions
async function loadObjects(bucketName) {
    const section = document.getElementById('objectsSection');
    const container = document.getElementById('objectsContainer');
    const bucketSpan = document.getElementById('currentBucket');
    
    bucketSpan.textContent = bucketName;
    section.style.display = 'block';
    container.innerHTML = '<p class="loading">Loading objects...</p>';
    
    try {
        const data = await apiCall(`/api/s3/buckets/${bucketName}/objects`);
        
        if (data.objects.length === 0) {
            container.innerHTML = '<p class="info">No objects found in this bucket.</p>';
            return;
        }
        
        const html = `
            <div class="object-list">
                ${data.objects.map(obj => `
                    <div class="object-item">
                        <div class="object-name">📄 ${obj.key}</div>
                        <div class="object-meta">
                            Size: ${formatBytes(obj.size)} | 
                            Modified: ${new Date(obj.lastModified).toLocaleString()}
                        </div>
                        <div class="object-actions">
                            <button onclick="downloadObject('${bucketName}', '${obj.key}')" class="btn btn-primary">
                                Download
                            </button>
                            <button onclick="deleteObject('${bucketName}', '${obj.key}')" class="btn btn-danger">
                                Delete
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<p class="error">Failed to load objects: ${error.message}</p>`;
    }
}

async function downloadObject(bucketName, objectKey) {
    try {
        const data = await apiCall(`/api/s3/buckets/${bucketName}/objects/${objectKey}`);
        
        // Open download URL in new tab
        window.open(data.downloadUrl, '_blank');
    } catch (error) {
        showMessage('Failed to download object: ' + error.message, 'error');
    }
}

async function deleteObject(bucketName, objectKey) {
    if (!confirm(`Are you sure you want to delete ${objectKey}?`)) {
        return;
    }
    
    try {
        await apiCall(`/api/s3/buckets/${bucketName}/objects/${objectKey}`, {
            method: 'DELETE'
        });
        
        showMessage('Object deleted successfully', 'success');
        loadObjects(bucketName);
    } catch (error) {
        showMessage('Failed to delete object: ' + error.message, 'error');
    }
}

function closeBucket() {
    document.getElementById('objectsSection').style.display = 'none';
}

// Utility functions
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showMessage(message, type = 'info') {
    const container = document.querySelector('main');
    const messageDiv = document.createElement('div');
    messageDiv.className = type;
    messageDiv.textContent = message;
    
    container.insertBefore(messageDiv, container.firstChild);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    const bucketsContainer = document.getElementById('bucketsContainer');
    if (bucketsContainer && !bucketsContainer.classList.contains('welcome')) {
        loadBuckets();
    }
});
