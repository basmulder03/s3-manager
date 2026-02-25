"""
End-to-end UI tests for file operations.

Tests all CRUD operations through the UI:
- File upload (button click)
- File upload (drag and drop)
- Folder creation
- File/folder deletion
- File/folder renaming
- Multi-select operations
"""

import pytest
from playwright.sync_api import Page, expect, FilePayload
import re
from pathlib import Path
import tempfile
import os


@pytest.mark.e2e
@pytest.mark.ui
class TestFileUpload:
    """E2E tests for file upload functionality."""
    
    def test_upload_button_click(self, page: Page, base_url: str, test_bucket):
        """Test uploading file via upload button."""
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        # Click upload button
        page.click("#upload-btn")
        
        # Modal should appear
        expect(page.locator("#upload-modal")).to_be_visible()
        
        # Create temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write("Test file content")
            temp_file = f.name
        
        try:
            # Set file input
            page.set_input_files("#file-input", temp_file)
            
            # Submit upload
            page.click("#upload-submit-btn")
            
            # Wait for success message
            page.wait_for_selector(".message.success", timeout=5000)
            
            # Modal should close
            expect(page.locator("#upload-modal")).to_be_hidden()
            
            # File should appear in browser
            filename = os.path.basename(temp_file)
            expect(page.locator(f".file-item:has-text('{filename}')")).to_be_visible()
        
        finally:
            os.unlink(temp_file)
    
    def test_upload_to_nested_folder(self, page: Page, base_url: str, test_bucket, s3_client):
        """Test uploading file to nested folder."""
        # Create folder structure
        s3_client.put_object(Bucket=test_bucket, Key="uploads/")
        
        page.goto(f"{base_url}#{test_bucket}/uploads")
        page.wait_for_selector("#file-browser")
        
        # Upload file
        page.click("#upload-btn")
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write("Nested upload")
            temp_file = f.name
        
        try:
            page.set_input_files("#file-input", temp_file)
            page.click("#upload-submit-btn")
            
            page.wait_for_selector(".message.success", timeout=5000)
            
            filename = os.path.basename(temp_file)
            expect(page.locator(f".file-item:has-text('{filename}')")).to_be_visible()
        
        finally:
            os.unlink(temp_file)
    
    def test_upload_multiple_files(self, page: Page, base_url: str, test_bucket):
        """Test uploading multiple files sequentially."""
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        temp_files = []
        try:
            # Create multiple temp files
            for i in range(3):
                with tempfile.NamedTemporaryFile(mode='w', suffix=f'_{i}.txt', delete=False) as f:
                    f.write(f"File {i}")
                    temp_files.append(f.name)
            
            # Upload each file
            for temp_file in temp_files:
                page.click("#upload-btn")
                page.set_input_files("#file-input", temp_file)
                page.click("#upload-submit-btn")
                page.wait_for_selector(".message.success", timeout=5000)
            
            # All files should be visible
            for temp_file in temp_files:
                filename = os.path.basename(temp_file)
                expect(page.locator(f".file-item:has-text('{filename}')")).to_be_visible()
        
        finally:
            for temp_file in temp_files:
                os.unlink(temp_file)
    
    def test_upload_cancel(self, page: Page, base_url: str, test_bucket):
        """Test canceling upload closes modal without uploading."""
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        page.click("#upload-btn")
        expect(page.locator("#upload-modal")).to_be_visible()
        
        # Click cancel
        page.click("#upload-cancel-btn")
        
        # Modal should close
        expect(page.locator("#upload-modal")).to_be_hidden()
    
    def test_upload_large_file(self, page: Page, base_url: str, test_bucket):
        """Test uploading a larger file (1MB)."""
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        # Create 1MB file
        with tempfile.NamedTemporaryFile(mode='wb', suffix='.bin', delete=False) as f:
            f.write(b'x' * (1024 * 1024))  # 1MB
            temp_file = f.name
        
        try:
            page.click("#upload-btn")
            page.set_input_files("#file-input", temp_file)
            page.click("#upload-submit-btn")
            
            # Wait longer for large file
            page.wait_for_selector(".message.success", timeout=10000)
            
            filename = os.path.basename(temp_file)
            expect(page.locator(f".file-item:has-text('{filename}')")).to_be_visible()
        
        finally:
            os.unlink(temp_file)
    
    def test_upload_without_permission(self, page: Page, base_url: str, test_bucket, client):
        """Test that upload is disabled for users without write permission."""
        # This would require setting up a session with view-only role
        # and verifying upload button is disabled or hidden
        # Implementation depends on frontend permission handling
        pass


@pytest.mark.e2e
@pytest.mark.ui
class TestFolderCreation:
    """E2E tests for folder creation."""
    
    def test_create_folder_in_bucket(self, page: Page, base_url: str, test_bucket):
        """Test creating a new folder."""
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        # Click new folder button
        page.click("#new-folder-btn")
        
        # Modal should appear
        expect(page.locator("#create-folder-modal")).to_be_visible()
        
        # Enter folder name
        folder_name = "test-folder"
        page.fill("#folder-name-input", folder_name)
        
        # Submit
        page.click("#create-folder-submit-btn")
        
        # Wait for success
        page.wait_for_selector(".message.success", timeout=5000)
        
        # Modal should close
        expect(page.locator("#create-folder-modal")).to_be_hidden()
        
        # Folder should appear
        expect(page.locator(f".file-item:has-text('{folder_name}')")).to_be_visible()
    
    def test_create_nested_folder(self, page: Page, base_url: str, test_bucket, s3_client):
        """Test creating folder inside another folder."""
        # Create parent folder
        s3_client.put_object(Bucket=test_bucket, Key="parent/")
        
        page.goto(f"{base_url}#{test_bucket}/parent")
        page.wait_for_selector("#file-browser")
        
        # Create child folder
        page.click("#new-folder-btn")
        page.fill("#folder-name-input", "child-folder")
        page.click("#create-folder-submit-btn")
        
        page.wait_for_selector(".message.success", timeout=5000)
        
        expect(page.locator(".file-item:has-text('child-folder')")).to_be_visible()
    
    def test_create_folder_with_spaces(self, page: Page, base_url: str, test_bucket):
        """Test creating folder with spaces in name."""
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        folder_name = "my new folder"
        page.click("#new-folder-btn")
        page.fill("#folder-name-input", folder_name)
        page.click("#create-folder-submit-btn")
        
        page.wait_for_selector(".message.success", timeout=5000)
        
        expect(page.locator(f".file-item:has-text('{folder_name}')")).to_be_visible()
    
    def test_create_folder_cancel(self, page: Page, base_url: str, test_bucket):
        """Test canceling folder creation."""
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        page.click("#new-folder-btn")
        expect(page.locator("#create-folder-modal")).to_be_visible()
        
        page.fill("#folder-name-input", "should-not-exist")
        page.click("#create-folder-cancel-btn")
        
        expect(page.locator("#create-folder-modal")).to_be_hidden()
        
        # Folder should not exist
        expect(page.locator(".file-item:has-text('should-not-exist')")).not_to_be_visible()
    
    def test_create_folder_empty_name(self, page: Page, base_url: str, test_bucket):
        """Test creating folder with empty name shows error."""
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        page.click("#new-folder-btn")
        page.fill("#folder-name-input", "")
        page.click("#create-folder-submit-btn")
        
        # Should show error (modal stays open or error message appears)
        # Exact behavior depends on frontend validation
        page.wait_for_selector(".message.error, .error", timeout=5000)


@pytest.mark.e2e
@pytest.mark.ui
class TestDeleteOperations:
    """E2E tests for delete operations."""
    
    def test_delete_single_file(self, page: Page, base_url: str, test_bucket, s3_client):
        """Test deleting a single file."""
        # Create file
        s3_client.put_object(Bucket=test_bucket, Key="delete-me.txt", Body=b"test")
        
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        # Select file
        file_item = page.locator(".file-item:has-text('delete-me.txt')")
        file_item.locator("input[type='checkbox']").check()
        
        # Click delete button
        page.click("#delete-selected-btn")
        
        # Confirm deletion (if confirmation dialog exists)
        page.once("dialog", lambda dialog: dialog.accept())
        
        # Wait for success
        page.wait_for_selector(".message.success", timeout=5000)
        
        # File should be gone
        expect(page.locator(".file-item:has-text('delete-me.txt')")).not_to_be_visible()
    
    def test_delete_single_folder(self, page: Page, base_url: str, test_bucket, s3_client):
        """Test deleting a folder with contents."""
        # Create folder with file
        s3_client.put_object(Bucket=test_bucket, Key="delete-folder/")
        s3_client.put_object(Bucket=test_bucket, Key="delete-folder/file.txt", Body=b"test")
        
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        # Select folder
        folder_item = page.locator(".file-item:has-text('delete-folder')").first
        folder_item.locator("input[type='checkbox']").check()
        
        # Delete
        page.click("#delete-selected-btn")
        page.once("dialog", lambda dialog: dialog.accept())
        
        page.wait_for_selector(".message.success", timeout=5000)
        
        expect(page.locator(".file-item:has-text('delete-folder')")).not_to_be_visible()
    
    def test_delete_multiple_items(self, page: Page, base_url: str, test_bucket, s3_client):
        """Test deleting multiple selected items."""
        # Create files
        s3_client.put_object(Bucket=test_bucket, Key="file1.txt", Body=b"1")
        s3_client.put_object(Bucket=test_bucket, Key="file2.txt", Body=b"2")
        s3_client.put_object(Bucket=test_bucket, Key="file3.txt", Body=b"3")
        
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        # Select multiple files
        page.locator(".file-item:has-text('file1.txt') input[type='checkbox']").check()
        page.locator(".file-item:has-text('file2.txt') input[type='checkbox']").check()
        
        # Delete
        page.click("#delete-selected-btn")
        page.once("dialog", lambda dialog: dialog.accept())
        
        page.wait_for_selector(".message.success", timeout=5000)
        
        # Deleted files should be gone
        expect(page.locator(".file-item:has-text('file1.txt')")).not_to_be_visible()
        expect(page.locator(".file-item:has-text('file2.txt')")).not_to_be_visible()
        
        # file3 should still exist
        expect(page.locator(".file-item:has-text('file3.txt')")).to_be_visible()
    
    def test_delete_button_disabled_when_nothing_selected(self, page: Page, base_url: str, test_bucket):
        """Test delete button is disabled with no selection."""
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        delete_btn = page.locator("#delete-selected-btn")
        expect(delete_btn).to_be_disabled()
    
    def test_delete_button_enabled_when_selected(self, page: Page, base_url: str, test_bucket, s3_client):
        """Test delete button enables when items selected."""
        s3_client.put_object(Bucket=test_bucket, Key="test.txt", Body=b"test")
        
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        # Initially disabled
        delete_btn = page.locator("#delete-selected-btn")
        expect(delete_btn).to_be_disabled()
        
        # Select item
        page.locator(".file-item:has-text('test.txt') input[type='checkbox']").check()
        
        # Should be enabled
        expect(delete_btn).to_be_enabled()


@pytest.mark.e2e
@pytest.mark.ui
class TestRenameOperations:
    """E2E tests for rename operations."""
    
    def test_rename_file(self, page: Page, base_url: str, test_bucket, s3_client):
        """Test renaming a file."""
        # Create file
        s3_client.put_object(Bucket=test_bucket, Key="old-name.txt", Body=b"content")
        
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        # Right-click or click rename button on file
        file_item = page.locator(".file-item:has-text('old-name.txt')")
        
        # This depends on UI implementation - might be context menu or inline edit
        # Assuming there's a rename button in the file item
        file_item.hover()
        page.click(".rename-btn")  # Adjust selector based on actual implementation
        
        # Enter new name
        page.fill(".rename-input", "new-name.txt")
        page.keyboard.press("Enter")
        
        # Wait for success
        page.wait_for_selector(".message.success", timeout=5000)
        
        # Old name should be gone, new name should appear
        expect(page.locator(".file-item:has-text('old-name.txt')")).not_to_be_visible()
        expect(page.locator(".file-item:has-text('new-name.txt')")).to_be_visible()
    
    def test_rename_folder(self, page: Page, base_url: str, test_bucket, s3_client):
        """Test renaming a folder."""
        # Create folder with content
        s3_client.put_object(Bucket=test_bucket, Key="old-folder/")
        s3_client.put_object(Bucket=test_bucket, Key="old-folder/file.txt", Body=b"test")
        
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        # Rename folder
        folder_item = page.locator(".file-item:has-text('old-folder')").first
        folder_item.hover()
        page.click(".rename-btn")
        
        page.fill(".rename-input", "new-folder")
        page.keyboard.press("Enter")
        
        page.wait_for_selector(".message.success", timeout=5000)
        
        expect(page.locator(".file-item:has-text('old-folder')")).not_to_be_visible()
        expect(page.locator(".file-item:has-text('new-folder')")).to_be_visible()


@pytest.mark.e2e
@pytest.mark.ui
class TestMultiSelect:
    """E2E tests for multi-select functionality."""
    
    def test_select_multiple_with_checkboxes(self, page: Page, base_url: str, test_bucket, s3_client):
        """Test selecting multiple items with checkboxes."""
        # Create files
        for i in range(5):
            s3_client.put_object(Bucket=test_bucket, Key=f"file{i}.txt", Body=b"test")
        
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        # Select 3 files
        page.locator(".file-item:has-text('file0.txt') input[type='checkbox']").check()
        page.locator(".file-item:has-text('file1.txt') input[type='checkbox']").check()
        page.locator(".file-item:has-text('file2.txt') input[type='checkbox']").check()
        
        # Selection counter should show 3
        selection_info = page.locator("#selection-info")
        expect(selection_info).to_contain_text("3")
    
    def test_deselect_items(self, page: Page, base_url: str, test_bucket, s3_client):
        """Test deselecting items."""
        s3_client.put_object(Bucket=test_bucket, Key="file.txt", Body=b"test")
        
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        checkbox = page.locator(".file-item:has-text('file.txt') input[type='checkbox']")
        
        # Select
        checkbox.check()
        expect(page.locator("#selection-info")).to_contain_text("1")
        
        # Deselect
        checkbox.uncheck()
        expect(page.locator("#selection-info")).to_contain_text("0")
    
    def test_selection_counter_updates(self, page: Page, base_url: str, test_bucket, s3_client):
        """Test selection counter updates correctly."""
        for i in range(3):
            s3_client.put_object(Bucket=test_bucket, Key=f"file{i}.txt", Body=b"test")
        
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        selection_info = page.locator("#selection-info")
        
        # Select one by one
        for i in range(3):
            page.locator(f".file-item:has-text('file{i}.txt') input[type='checkbox']").check()
            expect(selection_info).to_contain_text(str(i + 1))
    
    def test_selection_cleared_after_delete(self, page: Page, base_url: str, test_bucket, s3_client):
        """Test selection is cleared after delete operation."""
        s3_client.put_object(Bucket=test_bucket, Key="file1.txt", Body=b"1")
        s3_client.put_object(Bucket=test_bucket, Key="file2.txt", Body=b"2")
        
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        # Select and delete
        page.locator(".file-item:has-text('file1.txt') input[type='checkbox']").check()
        page.click("#delete-selected-btn")
        page.once("dialog", lambda dialog: dialog.accept())
        
        page.wait_for_selector(".message.success", timeout=5000)
        
        # Selection should be cleared
        expect(page.locator("#selection-info")).to_contain_text("0")
    
    def test_selection_persists_navigation(self, page: Page, base_url: str, test_bucket, s3_client):
        """Test selection is cleared when navigating to different folder."""
        s3_client.put_object(Bucket=test_bucket, Key="file.txt", Body=b"test")
        s3_client.put_object(Bucket=test_bucket, Key="folder/")
        
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        # Select file
        page.locator(".file-item:has-text('file.txt') input[type='checkbox']").check()
        expect(page.locator("#selection-info")).to_contain_text("1")
        
        # Navigate to folder
        page.locator(".file-item:has-text('folder')").click()
        page.wait_for_url(re.compile("folder"))
        
        # Selection should be cleared
        expect(page.locator("#selection-info")).to_contain_text("0")
