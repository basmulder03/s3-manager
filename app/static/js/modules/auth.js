/**
 * @fileoverview Authentication module for S3 Manager
 */

import { apiCall } from './api.js';
import { showMessage } from './utils.js';

/**
 * Redirects user to login page
 * @returns {void}
 */
export function login() {
    window.location.href = '/auth/login';
}

/**
 * Logs out the current user
 * @returns {void}
 */
export function logout() {
    window.location.href = '/auth/logout';
}

/**
 * Requests PIM (Privileged Identity Management) role elevation
 * @returns {Promise<void>}
 */
export async function requestPIMElevation() {
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
