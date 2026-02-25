"""
Backend API tests for S3 browse endpoint.

Tests the unified virtual filesystem browse API:
- GET /api/s3/browse (root - list all buckets)
- GET /api/s3/browse/<path> (browse into buckets and folders)
- Breadcrumb generation
- Folder/file detection
- Sorting and file type icons
"""

import pytest
import json


@pytest.mark.api
@pytest.mark.integration
class TestBrowseEndpoint:
    """Tests for /api/s3/browse endpoint."""
    
    def test_browse_root_no_buckets(self, authenticated_client):
        """Test browsing root when no buckets exist."""
        response = authenticated_client.get('/api/s3/browse')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert data['current_path'] == ''
        assert data['breadcrumbs'] == [{'name': 'Root', 'path': ''}]
        assert data['items'] == []
    
    def test_browse_root_with_buckets(self, authenticated_client, test_bucket, s3_client):
        """Test browsing root with buckets."""
        # Create additional bucket
        s3_client.create_bucket(Bucket="another-bucket")
        
        response = authenticated_client.get('/api/s3/browse')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert data['current_path'] == ''
        assert len(data['items']) >= 2
        
        # Check bucket items
        bucket_names = [item['name'] for item in data['items']]
        assert test_bucket in bucket_names
        assert "another-bucket" in bucket_names
        
        # All items should be folders (buckets)
        for item in data['items']:
            assert item['type'] == 'folder'
            assert item['icon'] == '📁'
        
        # Cleanup
        s3_client.delete_bucket(Bucket="another-bucket")
    
    def test_browse_bucket_root(self, authenticated_client, test_bucket_with_data):
        """Test browsing into a bucket root."""
        response = authenticated_client.get(f'/api/s3/browse/{test_bucket_with_data}')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert data['current_path'] == test_bucket_with_data
        assert len(data['breadcrumbs']) == 2
        assert data['breadcrumbs'][0] == {'name': 'Root', 'path': ''}
        assert data['breadcrumbs'][1] == {'name': test_bucket_with_data, 'path': test_bucket_with_data}
        
        # Should have folders and files
        items = data['items']
        folder_names = [item['name'] for item in items if item['type'] == 'folder']
        file_names = [item['name'] for item in items if item['type'] == 'file']
        
        assert 'folder1' in folder_names
        assert 'folder2' in folder_names
        assert 'file1.txt' in file_names
        assert 'file2.pdf' in file_names
    
    def test_browse_nested_folder(self, authenticated_client, test_bucket_with_data):
        """Test browsing into nested folders."""
        response = authenticated_client.get(f'/api/s3/browse/{test_bucket_with_data}/folder1')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert data['current_path'] == f'{test_bucket_with_data}/folder1'
        assert len(data['breadcrumbs']) == 3
        
        items = data['items']
        item_names = [item['name'] for item in items]
        assert 'subfolder' in item_names
        assert 'file3.jpg' in item_names
    
    def test_browse_deeply_nested_folder(self, authenticated_client, test_bucket_with_data):
        """Test browsing deeply nested folders."""
        response = authenticated_client.get(f'/api/s3/browse/{test_bucket_with_data}/folder1/subfolder')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert data['current_path'] == f'{test_bucket_with_data}/folder1/subfolder'
        assert len(data['breadcrumbs']) == 4
        
        items = data['items']
        assert len(items) == 1
        assert items[0]['name'] == 'file4.txt'
        assert items[0]['type'] == 'file'
    
    def test_browse_nonexistent_bucket(self, authenticated_client):
        """Test browsing a non-existent bucket."""
        response = authenticated_client.get('/api/s3/browse/nonexistent-bucket')
        assert response.status_code == 404
        
        data = json.loads(response.data)
        assert 'error' in data
    
    def test_browse_empty_folder(self, authenticated_client, test_bucket, s3_client):
        """Test browsing an empty folder."""
        # Create empty folder
        s3_client.put_object(Bucket=test_bucket, Key="empty-folder/")
        
        response = authenticated_client.get(f'/api/s3/browse/{test_bucket}/empty-folder')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert data['items'] == []
    
    def test_breadcrumbs_generation(self, authenticated_client, test_bucket_with_data):
        """Test breadcrumb trail generation."""
        response = authenticated_client.get(f'/api/s3/browse/{test_bucket_with_data}/folder1/subfolder')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        breadcrumbs = data['breadcrumbs']
        
        assert len(breadcrumbs) == 4
        assert breadcrumbs[0] == {'name': 'Root', 'path': ''}
        assert breadcrumbs[1] == {'name': test_bucket_with_data, 'path': test_bucket_with_data}
        assert breadcrumbs[2] == {'name': 'folder1', 'path': f'{test_bucket_with_data}/folder1'}
        assert breadcrumbs[3] == {'name': 'subfolder', 'path': f'{test_bucket_with_data}/folder1/subfolder'}
    
    def test_file_type_icons(self, authenticated_client, test_bucket_with_data):
        """Test that correct icons are assigned to file types."""
        response = authenticated_client.get(f'/api/s3/browse/{test_bucket_with_data}')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        items = {item['name']: item for item in data['items']}
        
        # Check specific file type icons
        assert items['file1.txt']['icon'] == '📄'  # Text file
        assert items['file2.pdf']['icon'] == '📕'  # PDF file
        assert items['folder1']['icon'] == '📁'    # Folder
    
    def test_sorting_folders_first(self, authenticated_client, test_bucket_with_data):
        """Test that folders appear before files in sorted order."""
        response = authenticated_client.get(f'/api/s3/browse/{test_bucket_with_data}')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        items = data['items']
        
        # Find first file
        first_file_index = next((i for i, item in enumerate(items) if item['type'] == 'file'), -1)
        
        if first_file_index > 0:
            # All items before first file should be folders
            for i in range(first_file_index):
                assert items[i]['type'] == 'folder'
    
    def test_unauthenticated_access(self, client):
        """Test that unauthenticated requests are rejected."""
        response = client.get('/api/s3/browse')
        assert response.status_code in [401, 302]  # Unauthorized or redirect to login
    
    def test_special_characters_in_path(self, authenticated_client, test_bucket, s3_client):
        """Test browsing paths with special characters."""
        # Create folder with spaces and special chars
        folder_name = "my folder (2024)"
        s3_client.put_object(Bucket=test_bucket, Key=f"{folder_name}/")
        s3_client.put_object(Bucket=test_bucket, Key=f"{folder_name}/test.txt", Body=b"test")
        
        # URL encoding should be handled
        import urllib.parse
        encoded_path = urllib.parse.quote(f"{test_bucket}/{folder_name}", safe='')
        
        response = authenticated_client.get(f'/api/s3/browse/{test_bucket}/{folder_name}')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert len(data['items']) >= 1
    
    def test_large_bucket_pagination(self, authenticated_client, test_bucket, s3_client):
        """Test browsing bucket with many objects."""
        # Create 50 files
        for i in range(50):
            s3_client.put_object(Bucket=test_bucket, Key=f"file{i:03d}.txt", Body=b"test")
        
        response = authenticated_client.get(f'/api/s3/browse/{test_bucket}')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert len(data['items']) == 50
    
    def test_permission_check_view_only(self, client):
        """Test that users with view-only permissions can browse."""
        # Create session with view-only role
        with client.session_transaction() as session:
            session['user'] = {
                'name': 'View User',
                'email': 'view@localhost',
                'roles': ['S3-View']
            }
        
        response = client.get('/api/s3/browse')
        assert response.status_code == 200
