/**
 * Modal Management Module
 * Handles showing/hiding of modal dialogs (upload and new folder)
 * @module modals
 */

/**
 * Shows the upload modal dialog
 */
export function showUploadModal() {
    const modal = document.getElementById('uploadModal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('uploadFileInput').value = '';
        document.getElementById('uploadFolderInput').value = '';
        
        // Reset progress bar
        const progressDiv = document.getElementById('uploadProgress');
        if (progressDiv) {
            progressDiv.style.display = 'none';
        }
    }
}

/**
 * Closes the upload modal dialog
 */
export function closeUploadModal() {
    const modal = document.getElementById('uploadModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Shows the new folder modal dialog
 */
export function showFolderModal() {
    const modal = document.getElementById('folderModal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('newFolderName').value = '';
    }
}

/**
 * Closes the new folder modal dialog
 */
export function closeFolderModal() {
    const modal = document.getElementById('folderModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Switches between files and folder tabs in the upload modal
 * @param {string} tab - The tab to switch to ('files' or 'folder')
 */
export function switchUploadTab(tab) {
    const filesTab = document.getElementById('filesTab');
    const folderTab = document.getElementById('folderTab');
    const filesTabBtn = document.getElementById('filesTabBtn');
    const folderTabBtn = document.getElementById('folderTabBtn');
    
    if (tab === 'files') {
        filesTab.style.display = 'block';
        folderTab.style.display = 'none';
        filesTabBtn.classList.add('active');
        folderTabBtn.classList.remove('active');
    } else {
        filesTab.style.display = 'none';
        folderTab.style.display = 'block';
        filesTabBtn.classList.remove('active');
        folderTabBtn.classList.add('active');
    }
}
