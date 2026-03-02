# File Refactoring Progress Report

## Summary

This document tracks the progress of splitting large files in the s3-manager project into smaller, more maintainable modules.

## Completed Work

### 1. BrowserPageFeature.tsx (3,236 lines) ✅ Partially Complete

Successfully extracted the following components and hooks:

#### New Components Created:

- **BrowserToolbar.tsx** (~600 lines)
  - Handles breadcrumb navigation, filter, zoom controls, overview fields menu
  - Manages selection actions and bulk operations
  - Contains all toolbar UI and interaction logic

- **BrowserModals.tsx** (~170 lines)
  - File upload confirmation modal
  - Folder upload confirmation modal
  - Create entry (file/folder) modal with validation

- **BrowserItemsTable.tsx** (~400 lines)
  - Table/grid view rendering
  - Sortable columns
  - Drag-and-drop for moving items
  - Row selection and context menu triggers

- **BrowserInfoModals.tsx** (existing)
  - Keyboard shortcuts modal
  - Filter help modal

- **BrowserContextMenu.tsx** (existing)
  - Context menu rendering with submenus
  - Keyboard navigation within menus

#### New Hooks Created:

- **useBrowserSorting.ts** (~130 lines)
  - Manages sort rules and direction
  - Provides sort indicators and tooltips
  - Multi-column sorting support

- **useBrowserZoom.ts** (~150 lines)
  - Explorer zoom level management
  - Browser zoom factor detection
  - Grid/list view switching
  - Keyboard zoom shortcuts

- **useBreadcrumbNavigation.ts** (~270 lines)
  - Breadcrumb editing state
  - Auto-complete suggestions
  - Path validation
  - Keyboard navigation for hints

- **useFilterManagement.ts** (~70 lines)
  - Filter open/close state
  - Debounced filter query updates
  - Input focus management

- **useOverviewFieldsMenu.ts** (~150 lines)
  - Column visibility management
  - Field search/filter
  - Menu positioning logic
  - Click-outside handling

- **usePropertiesLoading.ts** (~130 lines)
  - Lazy-load object properties
  - Properties caching
  - Filter-based property loading
  - Loading state tracking

- **useKeyboardNavigation.ts** (~430 lines)
  - Global keyboard shortcuts
  - Row navigation (list and grid)
  - Keyboard event handlers
  - Focus management

- **useRenderedItems.ts** (existing)
  - Filtering and sorting logic
  - Parent folder navigation

- **useUploadDropHandlers.ts** (existing)
  - Drag-and-drop upload handling
  - Move operation drag detection

#### New Utilities Created:

- **utils.ts** (~70 lines)
  - formatDate()
  - getObjectKeyFromPath()
  - attachRelativePathToFile()
  - collectFilesFromDirectoryHandle()

- **types.ts** (updated)
  - Added BrowseData interface

#### Remaining Work for BrowserPageFeature.tsx:

- Refactor main BrowserPageFeature.tsx file to use new components and hooks
- Extract remaining complex logic:
  - Context menu actions generation
  - Properties field value resolution
  - Upload folder directory picker logic
  - Create entry modal submit logic
- Test that all imports work correctly
- Update tests to use new component structure

**Estimated effort: 4-6 hours**

---

## Remaining Files to Split

### 2. S3 Service (service.ts - 2,056 lines) 🔄 In Progress

#### Analysis:

The S3Service class contains ~20 methods that can be logically grouped:

1. **Bucket Operations** (1 method)
   - listBuckets()

2. **Object Operations** (4 methods)
   - listObjects()
   - getObjectMetadata()
   - getObjectProperties()
   - updateObjectProperties()

3. **Content Operations** (2 methods)
   - getObjectTextContent()
   - updateObjectTextContent()

4. **Upload Operations** (5 methods)
   - createPresignedUpload()
   - uploadObjectViaProxy()
   - initiateMultipartUpload()
   - createMultipartPartUploadUrl()
   - completeMultipartUpload()
   - abortMultipartUpload()

5. **Delete Operations** (3 methods)
   - deleteObject()
   - deleteMultiple()
   - deleteFolder()

6. **Browse Operations** (1 method)
   - browse()

7. **File Operations** (4 methods)
   - createFolder()
   - createFile()
   - renameItem()
   - copyItem()

#### Completed Work:

- **helpers.ts** (~160 lines) ✅
  - Extracted utility functions: toIso, mapError, metricActor, toCopySource
  - Path parsing: parsePathToBucketAndKey
  - Metadata handling: buildUploadMetadata, normalizeMetadataValue
  - Rename target resolution: ensureRenameTarget
  - Body reading: readBodyAsBytes

#### Proposed Split:

Create these service modules that extend a base S3Service class:

- **s3-base.service.ts** - Base class with common dependencies and helpers
- **s3-buckets.service.ts** - Bucket listing operations
- **s3-objects.service.ts** - Object metadata and properties
- **s3-content.service.ts** - Text content reading/writing
- **s3-upload.service.ts** - All upload operations (presigned, proxy, multipart)
- **s3-delete.service.ts** - Delete operations
- **s3-browse.service.ts** - Browse/navigation operations
- **s3-file-ops.service.ts** - File/folder creation, rename, copy operations

**Estimated effort: 6-8 hours**

---

### 3. useBrowserControllerCore.ts (1,623 lines) ⏳ Not Started

#### Analysis Needed:

This hook manages the core browser controller logic:

- File operations (create, rename, move, delete)
- Clipboard operations (copy/cut/paste)
- Modal states (properties, preview, delete confirmations)
- File uploads
- Selection management
- Keyboard shortcuts
- Snackbar notifications

#### Proposed Split:

- **useFileOperations.ts** - Create, rename, move, delete operations
- **useClipboard.ts** - Copy, cut, paste logic
- **useModalState.ts** - Modal open/close state management
- **useUploadManager.ts** - File upload coordination
- **useSelection.ts** - Selection state and multi-select logic
- **useNotifications.ts** - Snackbar/toast notifications

**Estimated effort: 5-7 hours**

---

### 4. config/index.ts (709 lines) ⏳ Not Started

#### Analysis Needed:

Application configuration system using Zod validation for:

- Application settings
- Authentication/OIDC configuration
- S3 source connections
- RBAC (Role-Based Access Control)
- PIM/elevation settings
- Kubernetes integration

#### Proposed Split:

- **config-base.ts** - Base configuration types and utilities
- **config-app.ts** - Application settings schema
- **config-auth.ts** - Authentication and OIDC configuration
- **config-s3.ts** - S3 sources configuration
- **config-rbac.ts** - RBAC configuration
- **config-pim.ts** - PIM/elevation configuration
- **config-k8s.ts** - Kubernetes configuration

**Estimated effort: 3-4 hours**

---

### 5. auth/elevation.ts (714 lines) ⏳ Not Started

#### Analysis Needed:

PIM (Privileged Identity Management) / JIT (Just-In-Time) access elevation system:

- Elevation entitlements management
- Request submission
- Status tracking
- Automatic expiration
- Azure and Google provider integration

#### Proposed Split:

- **elevation-types.ts** - Type definitions and interfaces
- **elevation-entitlements.ts** - Entitlement management
- **elevation-requests.ts** - Request creation and submission
- **elevation-tracking.ts** - Status tracking and expiration
- **elevation-providers.ts** - Azure and Google provider implementations

**Estimated effort: 4-5 hours**

---

### 6. http/auth.ts (582 lines) ⏳ Not Started

#### Analysis Needed:

HTTP authentication endpoints and middleware:

- OIDC authentication flows (login, callback, logout)
- Token management (access, refresh, ID tokens)
- Session handling with secure cookies
- CSRF protection
- Elevation request endpoints

#### Proposed Split:

- **auth-routes.ts** - Route definitions and middleware setup
- **auth-oidc.ts** - OIDC flow handlers (login, callback)
- **auth-tokens.ts** - Token management and validation
- **auth-session.ts** - Session handling and cookies
- **auth-elevation-routes.ts** - Elevation-specific endpoints

**Estimated effort: 3-4 hours**

---

## Total Estimated Effort

- **Completed:** ~8-10 hours (BrowserPageFeature.tsx partial + S3 helpers)
- **Remaining:** ~25-32 hours for complete refactoring

## Benefits of Completed Work

1. **Improved Maintainability**: Components and hooks are now focused on single responsibilities
2. **Better Testability**: Smaller units are easier to test in isolation
3. **Code Reusability**: Extracted hooks can be reused in other components
4. **Reduced Cognitive Load**: Developers can understand smaller files more quickly
5. **Easier Debugging**: Isolated logic makes it easier to trace bugs

## Next Steps

### Immediate (High Priority):

1. Complete BrowserPageFeature.tsx refactoring by updating main file to use new components
2. Fix TypeScript errors in created components
3. Ensure all imports resolve correctly
4. Test that UI functionality still works

### Short Term (High Priority):

1. Complete S3 service splitting into logical modules
2. Split useBrowserControllerCore.ts into smaller hooks

### Medium Term (Medium Priority):

1. Split config/index.ts into config modules
2. Split auth/elevation.ts into smaller modules
3. Split http/auth.ts into route handlers

## Notes

- All newly created files follow the existing project structure and conventions
- TypeScript and ESLint rules are maintained
- Imports use existing path aliases (@web, @server, etc.)
- Some minor type errors exist in new files that need to be resolved
- Testing is required after each major refactoring to ensure functionality is preserved

---

**Last Updated:** 2026-03-02
**Status:** In Progress - BrowserPageFeature.tsx ~70% complete, S3 Service ~10% complete
