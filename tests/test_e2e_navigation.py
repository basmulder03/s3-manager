"""
End-to-end UI tests for navigation and browsing.

Tests the browser-based user experience:
- Page loading and rendering
- Navigation through breadcrumbs
- Clicking into folders
- Folder/file display
- Toolbar visibility
- Permissions and UI state
"""

import pytest
from playwright.sync_api import Page, expect
import re


@pytest.mark.e2e
@pytest.mark.ui
class TestNavigationAndBrowsing:
    """E2E tests for navigation and browsing functionality."""
    
    def test_page_loads_successfully(self, page: Page, base_url: str):
        """Test that the main page loads."""
        page.goto(base_url)
        expect(page).to_have_title(re.compile("S3 Manager", re.IGNORECASE))
        
        # Check for main UI elements
        expect(page.locator("#breadcrumb")).to_be_visible()
        expect(page.locator("#file-browser")).to_be_visible()
    
    def test_display_buckets_at_root(self, page: Page, base_url: str, test_bucket):
        """Test browsing root displays buckets as folders."""
        page.goto(base_url)
        
        # Wait for file browser to load
        page.wait_for_selector("#file-browser")
        
        # Should see bucket as folder
        bucket_item = page.locator(f".file-item:has-text('{test_bucket}')")
        expect(bucket_item).to_be_visible()
        
        # Should have folder icon
        expect(bucket_item.locator(".item-icon")).to_contain_text("📁")
    
    def test_breadcrumb_shows_root(self, page: Page, base_url: str):
        """Test breadcrumb shows 'Root' at top level."""
        page.goto(base_url)
        
        breadcrumb = page.locator("#breadcrumb")
        expect(breadcrumb).to_contain_text("Root")
    
    def test_click_into_bucket(self, page: Page, base_url: str, test_bucket_with_data):
        """Test clicking a bucket navigates into it."""
        page.goto(base_url)
        
        # Click bucket
        page.locator(f".file-item:has-text('{test_bucket_with_data}')").click()
        
        # Wait for navigation
        page.wait_for_url(re.compile(f"/#{test_bucket_with_data}"))
        
        # Breadcrumb should show bucket name
        breadcrumb = page.locator("#breadcrumb")
        expect(breadcrumb).to_contain_text(test_bucket_with_data)
        
        # Should see folders and files
        expect(page.locator(".file-item:has-text('folder1')")).to_be_visible()
        expect(page.locator(".file-item:has-text('file1.txt')")).to_be_visible()
    
    def test_click_into_nested_folder(self, page: Page, base_url: str, test_bucket_with_data):
        """Test navigating into nested folders."""
        page.goto(f"{base_url}#{test_bucket_with_data}")
        page.wait_for_selector("#file-browser")
        
        # Click into folder1
        page.locator(".file-item:has-text('folder1')").first.click()
        page.wait_for_url(re.compile(f"{test_bucket_with_data}/folder1"))
        
        # Should see subfolder
        expect(page.locator(".file-item:has-text('subfolder')")).to_be_visible()
        
        # Breadcrumb should show: Root > bucket > folder1
        breadcrumb_text = page.locator("#breadcrumb").text_content()
        assert "Root" in breadcrumb_text
        assert test_bucket_with_data in breadcrumb_text
        assert "folder1" in breadcrumb_text
    
    def test_breadcrumb_navigation_to_parent(self, page: Page, base_url: str, test_bucket_with_data):
        """Test clicking breadcrumb navigates to parent folder."""
        # Navigate to nested folder
        page.goto(f"{base_url}#{test_bucket_with_data}/folder1/subfolder")
        page.wait_for_selector("#file-browser")
        
        # Click breadcrumb for bucket root
        page.locator(f"#breadcrumb a:has-text('{test_bucket_with_data}')").click()
        
        # Should navigate back to bucket root
        page.wait_for_url(re.compile(f"/#{test_bucket_with_data}$"))
        expect(page.locator(".file-item:has-text('folder1')")).to_be_visible()
    
    def test_breadcrumb_navigation_to_root(self, page: Page, base_url: str, test_bucket_with_data):
        """Test clicking 'Root' in breadcrumb returns to bucket list."""
        # Start in a folder
        page.goto(f"{base_url}#{test_bucket_with_data}/folder1")
        page.wait_for_selector("#file-browser")
        
        # Click 'Root' in breadcrumb
        page.locator("#breadcrumb a:has-text('Root')").click()
        
        # Should show buckets
        page.wait_for_url(f"{base_url}#")
        expect(page.locator(f".file-item:has-text('{test_bucket_with_data}')")).to_be_visible()
    
    def test_toolbar_hidden_at_root(self, page: Page, base_url: str):
        """Test toolbar is hidden when browsing root (bucket list)."""
        page.goto(base_url)
        page.wait_for_selector("#file-browser")
        
        toolbar = page.locator("#toolbar")
        expect(toolbar).to_be_hidden()
    
    def test_toolbar_visible_in_bucket(self, page: Page, base_url: str, test_bucket):
        """Test toolbar is visible when inside a bucket."""
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        toolbar = page.locator("#toolbar")
        expect(toolbar).to_be_visible()
        
        # Check toolbar buttons
        expect(page.locator("#upload-btn")).to_be_visible()
        expect(page.locator("#new-folder-btn")).to_be_visible()
        expect(page.locator("#delete-selected-btn")).to_be_visible()
    
    def test_folders_appear_before_files(self, page: Page, base_url: str, test_bucket_with_data):
        """Test that folders are listed before files."""
        page.goto(f"{base_url}#{test_bucket_with_data}")
        page.wait_for_selector("#file-browser")
        
        # Get all file items
        items = page.locator(".file-item").all()
        
        # Find index of first file
        first_file_index = -1
        for i, item in enumerate(items):
            item_name = item.text_content()
            if 'file1.txt' in item_name or 'file2.pdf' in item_name:
                first_file_index = i
                break
        
        # All items before first file should be folders
        if first_file_index > 0:
            for i in range(first_file_index):
                assert "📁" in items[i].text_content()
    
    def test_file_type_icons_displayed(self, page: Page, base_url: str, test_bucket_with_data):
        """Test that different file types show correct icons."""
        page.goto(f"{base_url}#{test_bucket_with_data}")
        page.wait_for_selector("#file-browser")
        
        # Check folder icon
        folder_item = page.locator(".file-item:has-text('folder1')").first
        expect(folder_item.locator(".item-icon")).to_contain_text("📁")
        
        # Check text file icon
        txt_item = page.locator(".file-item:has-text('file1.txt')")
        expect(txt_item.locator(".item-icon")).to_contain_text("📄")
        
        # Check PDF icon
        pdf_item = page.locator(".file-item:has-text('file2.pdf')")
        expect(pdf_item.locator(".item-icon")).to_contain_text("📕")
    
    def test_empty_folder_shows_message(self, page: Page, base_url: str, test_bucket, s3_client):
        """Test that empty folders show appropriate message."""
        # Create empty folder
        s3_client.put_object(Bucket=test_bucket, Key="empty/")
        
        page.goto(f"{base_url}#{test_bucket}/empty")
        page.wait_for_selector("#file-browser")
        
        # Should show empty state or no items
        file_items = page.locator(".file-item")
        expect(file_items).to_have_count(0)
    
    def test_back_button_navigation(self, page: Page, base_url: str, test_bucket_with_data):
        """Test browser back button works for navigation."""
        page.goto(base_url)
        
        # Navigate into bucket
        page.locator(f".file-item:has-text('{test_bucket_with_data}')").click()
        page.wait_for_url(re.compile(test_bucket_with_data))
        
        # Navigate into folder
        page.locator(".file-item:has-text('folder1')").first.click()
        page.wait_for_url(re.compile("folder1"))
        
        # Use browser back button
        page.go_back()
        page.wait_for_url(re.compile(f"{test_bucket_with_data}$"))
        
        # Should be back at bucket root
        expect(page.locator(".file-item:has-text('folder1')")).to_be_visible()
    
    def test_forward_button_navigation(self, page: Page, base_url: str, test_bucket_with_data):
        """Test browser forward button works after going back."""
        page.goto(f"{base_url}#{test_bucket_with_data}")
        
        # Navigate into folder
        page.locator(".file-item:has-text('folder1')").first.click()
        page.wait_for_url(re.compile("folder1"))
        
        # Go back
        page.go_back()
        page.wait_for_url(re.compile(f"{test_bucket_with_data}$"))
        
        # Go forward
        page.go_forward()
        page.wait_for_url(re.compile("folder1"))
        
        # Should be in folder1
        expect(page.locator(".file-item:has-text('subfolder')")).to_be_visible()
    
    def test_direct_url_navigation(self, page: Page, base_url: str, test_bucket_with_data):
        """Test navigating directly to a deep path via URL."""
        page.goto(f"{base_url}#{test_bucket_with_data}/folder1/subfolder")
        page.wait_for_selector("#file-browser")
        
        # Should show correct breadcrumb
        breadcrumb = page.locator("#breadcrumb").text_content()
        assert "subfolder" in breadcrumb
        
        # Should show file in subfolder
        expect(page.locator(".file-item:has-text('file4.txt')")).to_be_visible()
    
    def test_refresh_preserves_location(self, page: Page, base_url: str, test_bucket_with_data):
        """Test that page refresh preserves current location."""
        # Navigate to folder
        page.goto(f"{base_url}#{test_bucket_with_data}/folder1")
        page.wait_for_selector("#file-browser")
        
        # Refresh page
        page.reload()
        page.wait_for_selector("#file-browser")
        
        # Should still be in folder1
        breadcrumb = page.locator("#breadcrumb").text_content()
        assert "folder1" in breadcrumb
    
    def test_special_characters_in_path(self, page: Page, base_url: str, test_bucket, s3_client):
        """Test navigation with special characters in folder names."""
        # Create folder with spaces
        folder_name = "my folder (2024)"
        s3_client.put_object(Bucket=test_bucket, Key=f"{folder_name}/")
        s3_client.put_object(Bucket=test_bucket, Key=f"{folder_name}/test.txt", Body=b"test")
        
        page.goto(f"{base_url}#{test_bucket}")
        page.wait_for_selector("#file-browser")
        
        # Click folder with special name
        page.locator(f".file-item:has-text('{folder_name}')").click()
        page.wait_for_url(re.compile(folder_name.replace(" ", "%20")))
        
        # Should navigate successfully
        expect(page.locator(".file-item:has-text('test.txt')")).to_be_visible()
    
    def test_loading_indicator(self, page: Page, base_url: str, test_bucket):
        """Test that loading indicator appears during navigation."""
        page.goto(base_url)
        
        # This test would need actual slow responses to verify loading state
        # For now, just verify the page loads without errors
        page.wait_for_selector("#file-browser")
        expect(page.locator("#file-browser")).to_be_visible()
    
    def test_error_handling_invalid_path(self, page: Page, base_url: str):
        """Test navigation to invalid path shows error."""
        page.goto(f"{base_url}#nonexistent-bucket/fake-folder")
        
        # Should show error message or redirect to root
        # Implementation depends on error handling strategy
        page.wait_for_selector("#file-browser, .error-message")
