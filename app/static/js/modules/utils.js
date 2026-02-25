/**
 * @fileoverview Utility functions for the S3 Manager application
 */

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string|null|undefined} unsafe - Unsafe string to escape
 * @returns {string} HTML-escaped string
 * @example
 * escapeHtml('<script>alert("xss")</script>')
 * // Returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 */
export function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Formats bytes into human-readable file size
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted file size (e.g., "1.5 MB")
 * @example
 * formatBytes(1536) // Returns: "1.5 KB"
 * formatBytes(0) // Returns: "0 Bytes"
 * formatBytes(1048576) // Returns: "1 MB"
 */
export function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Shows a toast message to the user
 * @param {string} message - Message to display
 * @param {'info'|'success'|'error'} [type='info'] - Message type
 * @returns {void}
 * @example
 * showMessage('File uploaded successfully', 'success')
 * showMessage('An error occurred', 'error')
 */
export function showMessage(message, type = 'info') {
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
