/**
 * @fileoverview Type definitions for S3 Manager application
 * This file contains JSDoc type definitions used throughout the application
 */

/**
 * @typedef {Object} S3Item
 * @property {string} name - Item name
 * @property {string} path - Full virtual path (bucket/prefix/name)
 * @property {'file'|'directory'} type - Item type
 * @property {string} icon - Emoji icon for display
 * @property {number} [size] - File size in bytes (files only)
 * @property {string} [lastModified] - ISO 8601 date string
 */

/**
 * @typedef {Object} Breadcrumb
 * @property {string} name - Display name
 * @property {string} path - Full path to this location
 */

/**
 * @typedef {Object} BrowseResponse
 * @property {S3Item[]} items - List of files and folders
 * @property {Breadcrumb[]} breadcrumbs - Navigation breadcrumbs
 * @property {string} currentPath - Current virtual path
 */

/**
 * @typedef {Object} FileProperties
 * @property {string} name - File name
 * @property {string} key - S3 object key
 * @property {number} size - File size in bytes
 * @property {string} contentType - MIME type
 * @property {string} lastModified - ISO 8601 date string
 * @property {string} etag - S3 ETag
 * @property {string} storageClass - S3 storage class
 * @property {Object<string, string>} [metadata] - Custom metadata
 * @property {string} [versionId] - S3 version ID
 * @property {string} [cacheControl] - Cache-Control header
 * @property {string} [contentDisposition] - Content-Disposition header
 * @property {string} [contentEncoding] - Content-Encoding header
 * @property {string} [contentLanguage] - Content-Language header
 * @property {string} [expires] - Expiration date
 * @property {string} [serverSideEncryption] - Encryption type
 */

/**
 * @typedef {Object} UploadResult
 * @property {boolean} success - Whether upload succeeded
 * @property {string} message - Result message
 * @property {number} count - Number of files uploaded
 * @property {Array<{filename: string, path: string, contentType: string, size: number}>} files - Uploaded file details
 */

/**
 * @typedef {Object} APIError
 * @property {string} error - Error message
 * @property {string} [details] - Additional error details
 */

/**
 * @typedef {'info'|'success'|'error'} MessageType
 */

/**
 * @typedef {Object} ContextMenuTarget
 * @property {string} path - Item path
 * @property {string} name - Item name
 * @property {'file'|'directory'} type - Item type
 */

export {};
