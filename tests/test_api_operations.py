"""
Backend API tests for S3 file operation endpoints.

Tests all CRUD operations:
- POST /api/s3/operations/upload
- POST /api/s3/operations/create-folder
- POST /api/s3/operations/rename
- DELETE /api/s3/operations/delete-folder
- DELETE /api/s3/operations/delete-multiple
"""

import pytest
import json
import io
from tests.conftest import list_bucket_objects, get_object_content


@pytest.mark.api
@pytest.mark.integration
class TestUploadOperation:
    """Tests for file upload operation."""
    
    def test_upload_file_to_bucket_root(self, authenticated_client, test_bucket):
        """Test uploading a file to bucket root."""
        file_data = (io.BytesIO(b"Test file content"), "test.txt")
        
        response = authenticated_client.post(
            '/api/s3/operations/upload',
            data={
                'file': file_data,
                'virtual_path': test_bucket
            },
            content_type='multipart/form-data'
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert 'test.txt' in data['message']
    
    def test_upload_file_to_folder(self, authenticated_client, test_bucket, s3_client):
        """Test uploading a file to a folder."""
        # Create folder first
        s3_client.put_object(Bucket=test_bucket, Key="uploads/")
        
        file_data = (io.BytesIO(b"Nested file content"), "nested.txt")
        
        response = authenticated_client.post(
            '/api/s3/operations/upload',
            data={
                'file': file_data,
                'virtual_path': f'{test_bucket}/uploads'
            },
            content_type='multipart/form-data'
        )
        
        assert response.status_code == 200
        
        # Verify file exists in S3
        objects = list_bucket_objects(s3_client, test_bucket, prefix="uploads/")
        assert "uploads/nested.txt" in objects
    
    def test_upload_multiple_files(self, authenticated_client, test_bucket):
        """Test uploading multiple files in sequence."""
        files = [
            (io.BytesIO(b"File 1"), "file1.txt"),
            (io.BytesIO(b"File 2"), "file2.txt"),
            (io.BytesIO(b"File 3"), "file3.txt"),
        ]
        
        for file_data, filename in files:
            response = authenticated_client.post(
                '/api/s3/operations/upload',
                data={
                    'file': (file_data, filename),
                    'virtual_path': test_bucket
                },
                content_type='multipart/form-data'
            )
            assert response.status_code == 200
    
    def test_upload_large_file(self, authenticated_client, test_bucket):
        """Test uploading a larger file (1MB)."""
        large_content = b"x" * (1024 * 1024)  # 1MB
        file_data = (io.BytesIO(large_content), "large.bin")
        
        response = authenticated_client.post(
            '/api/s3/operations/upload',
            data={
                'file': file_data,
                'virtual_path': test_bucket
            },
            content_type='multipart/form-data'
        )
        
        assert response.status_code == 200
    
    def test_upload_without_file(self, authenticated_client, test_bucket):
        """Test upload request without file."""
        response = authenticated_client.post(
            '/api/s3/operations/upload',
            data={'virtual_path': test_bucket},
            content_type='multipart/form-data'
        )
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'error' in data
    
    def test_upload_without_permission(self, client, test_bucket):
        """Test upload without write permission."""
        with client.session_transaction() as session:
            session['user'] = {
                'name': 'View User',
                'email': 'view@localhost',
                'roles': ['S3-View']  # No write permission
            }
        
        file_data = (io.BytesIO(b"Test"), "test.txt")
        response = client.post(
            '/api/s3/operations/upload',
            data={
                'file': file_data,
                'virtual_path': test_bucket
            },
            content_type='multipart/form-data'
        )
        
        assert response.status_code == 403
    
    def test_upload_special_filename(self, authenticated_client, test_bucket):
        """Test uploading file with special characters in name."""
        file_data = (io.BytesIO(b"Test"), "my file (2024).txt")
        
        response = authenticated_client.post(
            '/api/s3/operations/upload',
            data={
                'file': file_data,
                'virtual_path': test_bucket
            },
            content_type='multipart/form-data'
        )
        
        assert response.status_code == 200
    
    def test_upload_multiple_files_at_once(self, authenticated_client, test_bucket, s3_client):
        """Test uploading multiple files in a single request."""
        file1_data = (io.BytesIO(b"File 1 content"), "file1.txt")
        file2_data = (io.BytesIO(b"File 2 content"), "file2.txt")
        file3_data = (io.BytesIO(b"File 3 content"), "file3.txt")
        
        response = authenticated_client.post(
            '/api/s3/operations/upload',
            data={
                'files[]': [file1_data, file2_data, file3_data],
                'virtual_path': test_bucket
            },
            content_type='multipart/form-data'
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert data['count'] == 3
        assert len(data['files']) == 3
        
        # Verify all files exist in S3
        objects = list_bucket_objects(s3_client, test_bucket)
        assert "file1.txt" in objects
        assert "file2.txt" in objects
        assert "file3.txt" in objects
    
    def test_upload_folder_with_structure(self, authenticated_client, test_bucket, s3_client):
        """Test uploading folder with nested structure."""
        file1 = (io.BytesIO(b"Root file"), "root.txt")
        file2 = (io.BytesIO(b"Subfolder file"), "sub.txt")
        file3 = (io.BytesIO(b"Nested file"), "nested.txt")
        
        response = authenticated_client.post(
            '/api/s3/operations/upload',
            data={
                'files[]': [file1, file2, file3],
                'relativePaths[]': ['my-folder/root.txt', 'my-folder/subfolder/sub.txt', 'my-folder/subfolder/deep/nested.txt'],
                'virtual_path': test_bucket
            },
            content_type='multipart/form-data'
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert data['count'] == 3
        
        # Verify folder structure preserved in S3
        objects = list_bucket_objects(s3_client, test_bucket)
        assert "my-folder/root.txt" in objects
        assert "my-folder/subfolder/sub.txt" in objects
        assert "my-folder/subfolder/deep/nested.txt" in objects
    
    def test_upload_mime_type_detection(self, authenticated_client, test_bucket, s3_client):
        """Test MIME type detection for different file types."""
        # PNG magic bytes
        png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89'
        
        # JPEG magic bytes
        jpeg_data = b'\xff\xd8\xff\xe0\x00\x10JFIF'
        
        # Plain text
        text_data = b'This is plain text'
        
        files = [
            (io.BytesIO(png_data), "image.png"),
            (io.BytesIO(jpeg_data), "photo.jpg"),
            (io.BytesIO(text_data), "document.txt")
        ]
        
        response = authenticated_client.post(
            '/api/s3/operations/upload',
            data={
                'files[]': files,
                'virtual_path': test_bucket
            },
            content_type='multipart/form-data'
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert data['count'] == 3
        
        # Verify MIME types in response
        files_info = data['files']
        assert any(f['filename'] == 'image.png' and 'image/png' in f['contentType'] for f in files_info)
        assert any(f['filename'] == 'photo.jpg' and 'image/jpeg' in f['contentType'] for f in files_info)
        assert any(f['filename'] == 'document.txt' and 'text/plain' in f['contentType'] for f in files_info)
        
        # Verify MIME types in S3 metadata
        png_obj = s3_client.head_object(Bucket=test_bucket, Key='image.png')
        assert png_obj['ContentType'] == 'image/png'
        
        jpg_obj = s3_client.head_object(Bucket=test_bucket, Key='photo.jpg')
        assert jpg_obj['ContentType'] == 'image/jpeg'
        
        txt_obj = s3_client.head_object(Bucket=test_bucket, Key='document.txt')
        assert txt_obj['ContentType'] == 'text/plain'


@pytest.mark.api
@pytest.mark.integration
class TestCreateFolderOperation:
    """Tests for folder creation operation."""
    
    def test_create_folder_in_bucket(self, authenticated_client, test_bucket, s3_client):
        """Test creating a folder in bucket root."""
        response = authenticated_client.post(
            '/api/s3/operations/create-folder',
            data=json.dumps({
                'virtual_path': test_bucket,
                'folder_name': 'new-folder'
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        
        # Verify folder exists
        objects = list_bucket_objects(s3_client, test_bucket)
        assert "new-folder/" in objects
    
    def test_create_nested_folder(self, authenticated_client, test_bucket, s3_client):
        """Test creating a folder inside another folder."""
        # Create parent folder
        s3_client.put_object(Bucket=test_bucket, Key="parent/")
        
        response = authenticated_client.post(
            '/api/s3/operations/create-folder',
            data=json.dumps({
                'virtual_path': f'{test_bucket}/parent',
                'folder_name': 'child'
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        
        # Verify nested folder exists
        objects = list_bucket_objects(s3_client, test_bucket)
        assert "parent/child/" in objects
    
    def test_create_folder_with_spaces(self, authenticated_client, test_bucket, s3_client):
        """Test creating folder with spaces in name."""
        response = authenticated_client.post(
            '/api/s3/operations/create-folder',
            data=json.dumps({
                'virtual_path': test_bucket,
                'folder_name': 'my folder'
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        
        objects = list_bucket_objects(s3_client, test_bucket)
        assert "my folder/" in objects
    
    def test_create_folder_without_name(self, authenticated_client, test_bucket):
        """Test creating folder without name."""
        response = authenticated_client.post(
            '/api/s3/operations/create-folder',
            data=json.dumps({
                'virtual_path': test_bucket,
                'folder_name': ''
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 400
    
    def test_create_folder_without_permission(self, client, test_bucket):
        """Test creating folder without write permission."""
        with client.session_transaction() as session:
            session['user'] = {
                'name': 'View User',
                'email': 'view@localhost',
                'roles': ['S3-View']
            }
        
        response = client.post(
            '/api/s3/operations/create-folder',
            data=json.dumps({
                'virtual_path': test_bucket,
                'folder_name': 'forbidden'
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 403


@pytest.mark.api
@pytest.mark.integration
class TestRenameOperation:
    """Tests for rename operation."""
    
    def test_rename_file(self, authenticated_client, test_bucket, s3_client):
        """Test renaming a file."""
        # Create file
        s3_client.put_object(Bucket=test_bucket, Key="old-name.txt", Body=b"content")
        
        response = authenticated_client.post(
            '/api/s3/operations/rename',
            data=json.dumps({
                'virtual_path': test_bucket,
                'old_name': 'old-name.txt',
                'new_name': 'new-name.txt'
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        
        # Verify old file deleted and new file exists
        objects = list_bucket_objects(s3_client, test_bucket)
        assert "old-name.txt" not in objects
        assert "new-name.txt" in objects
        
        # Verify content preserved
        content = get_object_content(s3_client, test_bucket, "new-name.txt")
        assert content == b"content"
    
    def test_rename_folder(self, authenticated_client, test_bucket, s3_client):
        """Test renaming a folder with contents."""
        # Create folder with files
        s3_client.put_object(Bucket=test_bucket, Key="old-folder/")
        s3_client.put_object(Bucket=test_bucket, Key="old-folder/file1.txt", Body=b"file1")
        s3_client.put_object(Bucket=test_bucket, Key="old-folder/file2.txt", Body=b"file2")
        
        response = authenticated_client.post(
            '/api/s3/operations/rename',
            data=json.dumps({
                'virtual_path': test_bucket,
                'old_name': 'old-folder',
                'new_name': 'new-folder'
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        
        # Verify folder renamed
        objects = list_bucket_objects(s3_client, test_bucket)
        assert "old-folder/" not in objects
        assert "new-folder/" in objects
        assert "new-folder/file1.txt" in objects
        assert "new-folder/file2.txt" in objects
    
    def test_rename_nested_file(self, authenticated_client, test_bucket, s3_client):
        """Test renaming a file in a nested folder."""
        s3_client.put_object(Bucket=test_bucket, Key="parent/child/old.txt", Body=b"content")
        
        response = authenticated_client.post(
            '/api/s3/operations/rename',
            data=json.dumps({
                'virtual_path': f'{test_bucket}/parent/child',
                'old_name': 'old.txt',
                'new_name': 'new.txt'
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        
        objects = list_bucket_objects(s3_client, test_bucket)
        assert "parent/child/new.txt" in objects
    
    def test_rename_without_permission(self, client, test_bucket, s3_client):
        """Test renaming without write permission."""
        s3_client.put_object(Bucket=test_bucket, Key="file.txt", Body=b"test")
        
        with client.session_transaction() as session:
            session['user'] = {
                'name': 'View User',
                'email': 'view@localhost',
                'roles': ['S3-View']
            }
        
        response = client.post(
            '/api/s3/operations/rename',
            data=json.dumps({
                'virtual_path': test_bucket,
                'old_name': 'file.txt',
                'new_name': 'renamed.txt'
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 403


@pytest.mark.api
@pytest.mark.integration
class TestDeleteFolderOperation:
    """Tests for folder deletion operation."""
    
    def test_delete_empty_folder(self, authenticated_client, test_bucket, s3_client):
        """Test deleting an empty folder."""
        s3_client.put_object(Bucket=test_bucket, Key="empty/")
        
        response = authenticated_client.delete(
            '/api/s3/operations/delete-folder',
            data=json.dumps({
                'virtual_path': test_bucket,
                'folder_name': 'empty'
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        
        objects = list_bucket_objects(s3_client, test_bucket)
        assert "empty/" not in objects
    
    def test_delete_folder_with_contents(self, authenticated_client, test_bucket, s3_client):
        """Test deleting a folder with files (recursive)."""
        # Create folder with multiple files
        s3_client.put_object(Bucket=test_bucket, Key="to-delete/")
        s3_client.put_object(Bucket=test_bucket, Key="to-delete/file1.txt", Body=b"1")
        s3_client.put_object(Bucket=test_bucket, Key="to-delete/file2.txt", Body=b"2")
        s3_client.put_object(Bucket=test_bucket, Key="to-delete/nested/file3.txt", Body=b"3")
        
        response = authenticated_client.delete(
            '/api/s3/operations/delete-folder',
            data=json.dumps({
                'virtual_path': test_bucket,
                'folder_name': 'to-delete'
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        
        # Verify all objects deleted
        objects = list_bucket_objects(s3_client, test_bucket)
        assert not any(obj.startswith("to-delete/") for obj in objects)
    
    def test_delete_large_folder(self, authenticated_client, test_bucket, s3_client):
        """Test deleting folder with many files (>1000 for batch delete)."""
        # Create folder with 50 files (testing batch logic without creating 1000+)
        for i in range(50):
            s3_client.put_object(Bucket=test_bucket, Key=f"large-folder/file{i:04d}.txt", Body=b"x")
        
        response = authenticated_client.delete(
            '/api/s3/operations/delete-folder',
            data=json.dumps({
                'virtual_path': test_bucket,
                'folder_name': 'large-folder'
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        
        objects = list_bucket_objects(s3_client, test_bucket)
        assert not any(obj.startswith("large-folder/") for obj in objects)
    
    def test_delete_folder_without_permission(self, client, test_bucket, s3_client):
        """Test deleting folder without delete permission."""
        s3_client.put_object(Bucket=test_bucket, Key="protected/")
        
        with client.session_transaction() as session:
            session['user'] = {
                'name': 'Write User',
                'email': 'write@localhost',
                'roles': ['S3-Write']  # No delete permission
            }
        
        response = client.delete(
            '/api/s3/operations/delete-folder',
            data=json.dumps({
                'virtual_path': test_bucket,
                'folder_name': 'protected'
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 403


@pytest.mark.api
@pytest.mark.integration
class TestDeleteMultipleOperation:
    """Tests for bulk delete operation."""
    
    def test_delete_multiple_files(self, authenticated_client, test_bucket, s3_client):
        """Test deleting multiple files at once."""
        # Create files
        s3_client.put_object(Bucket=test_bucket, Key="file1.txt", Body=b"1")
        s3_client.put_object(Bucket=test_bucket, Key="file2.txt", Body=b"2")
        s3_client.put_object(Bucket=test_bucket, Key="file3.txt", Body=b"3")
        
        response = authenticated_client.delete(
            '/api/s3/operations/delete-multiple',
            data=json.dumps({
                'virtual_path': test_bucket,
                'items': ['file1.txt', 'file2.txt']
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        
        objects = list_bucket_objects(s3_client, test_bucket)
        assert "file1.txt" not in objects
        assert "file2.txt" not in objects
        assert "file3.txt" in objects  # Not deleted
    
    def test_delete_multiple_folders(self, authenticated_client, test_bucket, s3_client):
        """Test deleting multiple folders with contents."""
        # Create folders
        s3_client.put_object(Bucket=test_bucket, Key="folder1/")
        s3_client.put_object(Bucket=test_bucket, Key="folder1/file.txt", Body=b"1")
        s3_client.put_object(Bucket=test_bucket, Key="folder2/")
        s3_client.put_object(Bucket=test_bucket, Key="folder2/file.txt", Body=b"2")
        
        response = authenticated_client.delete(
            '/api/s3/operations/delete-multiple',
            data=json.dumps({
                'virtual_path': test_bucket,
                'items': ['folder1', 'folder2']
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        
        objects = list_bucket_objects(s3_client, test_bucket)
        assert not any(obj.startswith("folder1/") for obj in objects)
        assert not any(obj.startswith("folder2/") for obj in objects)
    
    def test_delete_mixed_items(self, authenticated_client, test_bucket, s3_client):
        """Test deleting mix of files and folders."""
        s3_client.put_object(Bucket=test_bucket, Key="file.txt", Body=b"file")
        s3_client.put_object(Bucket=test_bucket, Key="folder/")
        s3_client.put_object(Bucket=test_bucket, Key="folder/nested.txt", Body=b"nested")
        
        response = authenticated_client.delete(
            '/api/s3/operations/delete-multiple',
            data=json.dumps({
                'virtual_path': test_bucket,
                'items': ['file.txt', 'folder']
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        
        objects = list_bucket_objects(s3_client, test_bucket)
        assert len(objects) == 0
    
    def test_delete_empty_selection(self, authenticated_client, test_bucket):
        """Test deleting with empty items array."""
        response = authenticated_client.delete(
            '/api/s3/operations/delete-multiple',
            data=json.dumps({
                'virtual_path': test_bucket,
                'items': []
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 400
    
    def test_delete_without_permission(self, client, test_bucket, s3_client):
        """Test bulk delete without permission."""
        s3_client.put_object(Bucket=test_bucket, Key="file1.txt", Body=b"1")
        s3_client.put_object(Bucket=test_bucket, Key="file2.txt", Body=b"2")
        
        with client.session_transaction() as session:
            session['user'] = {
                'name': 'View User',
                'email': 'view@localhost',
                'roles': ['S3-View']
            }
        
        response = client.delete(
            '/api/s3/operations/delete-multiple',
            data=json.dumps({
                'virtual_path': test_bucket,
                'items': ['file1.txt', 'file2.txt']
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 403
