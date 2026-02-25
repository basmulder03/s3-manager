/**
 * @fileoverview API communication module for S3 Manager
 */

/**
 * Makes an authenticated API call to the backend
 * @param {string} url - API endpoint URL
 * @param {RequestInit} [options={}] - Fetch options
 * @returns {Promise<any>} Parsed JSON response
 * @throws {Error} If the request fails or returns an error
 * @example
 * const data = await apiCall('/api/s3/buckets')
 * const result = await apiCall('/api/s3/operations/upload', {
 *   method: 'POST',
 *   body: formData
 * })
 */
export async function apiCall(url, options = {}) {
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
