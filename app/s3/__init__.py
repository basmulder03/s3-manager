from flask import Blueprint, jsonify, request, current_app
import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError
from app.auth import login_required, permission_required
import mimetypes
import magic

s3_bp = Blueprint('s3', __name__)

def get_s3_client():
    """Create and return S3 client configured for Rook-Ceph"""
    return boto3.client(
        's3',
        endpoint_url=current_app.config['S3_ENDPOINT'],
        aws_access_key_id=current_app.config['S3_ACCESS_KEY'],
        aws_secret_access_key=current_app.config['S3_SECRET_KEY'],
        region_name=current_app.config['S3_REGION'],
        config=BotoConfig(signature_version='s3v4'),
        use_ssl=current_app.config['S3_USE_SSL'],
        verify=current_app.config['S3_VERIFY_SSL']
    )

def detect_mime_type(filename, file_content=None):
    """
    Detect MIME type for a file using multiple methods.
    
    Args:
        filename: Name of the file
        file_content: Optional file content (bytes) for magic number detection
    
    Returns:
        MIME type string (e.g., 'image/png', 'text/plain')
    """
    # Try python-magic first if content is available (most accurate)
    if file_content:
        try:
            mime = magic.Magic(mime=True)
            detected_type = mime.from_buffer(file_content)
            if detected_type and detected_type != 'application/octet-stream':
                return detected_type
        except Exception as e:
            current_app.logger.warning(f"python-magic detection failed: {e}")
    
    # Fallback to mimetypes based on filename extension
    guessed_type, _ = mimetypes.guess_type(filename)
    if guessed_type:
        return guessed_type
    
    # Default fallback
    return 'application/octet-stream'

@s3_bp.route('/buckets', methods=['GET'])
@login_required
@permission_required('view')
def list_buckets():
    """List all S3 buckets"""
    try:
        s3_client = get_s3_client()
        response = s3_client.list_buckets()
        
        buckets = [
            {
                'name': bucket['Name'],
                'creationDate': bucket['CreationDate'].isoformat()
            }
            for bucket in response.get('Buckets', [])
        ]
        
        return jsonify({'buckets': buckets})
    except ClientError as e:
        current_app.logger.error(f"S3 ClientError: {e}")
        return jsonify({'error': 'Failed to list buckets', 'details': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error listing buckets: {e}")
        return jsonify({'error': 'Failed to list buckets'}), 500

@s3_bp.route('/buckets/<bucket_name>/objects', methods=['GET'])
@login_required
@permission_required('view')
def list_objects(bucket_name):
    """List objects in a bucket"""
    prefix = request.args.get('prefix', '')
    max_keys = int(request.args.get('max_keys', 1000))
    continuation_token = request.args.get('continuation_token', '')
    
    try:
        s3_client = get_s3_client()
        
        kwargs = {
            'Bucket': bucket_name,
            'Prefix': prefix,
            'MaxKeys': max_keys
        }
        
        if continuation_token:
            kwargs['ContinuationToken'] = continuation_token
        
        response = s3_client.list_objects_v2(**kwargs)
        
        objects = [
            {
                'key': obj['Key'],
                'size': obj['Size'],
                'lastModified': obj['LastModified'].isoformat(),
                'etag': obj['ETag']
            }
            for obj in response.get('Contents', [])
        ]
        
        result = {
            'objects': objects,
            'isTruncated': response.get('IsTruncated', False),
            'keyCount': response.get('KeyCount', 0)
        }
        
        if 'NextContinuationToken' in response:
            result['nextContinuationToken'] = response['NextContinuationToken']
        
        return jsonify(result)
    except ClientError as e:
        current_app.logger.error(f"S3 ClientError: {e}")
        return jsonify({'error': 'Failed to list objects', 'details': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error listing objects: {e}")
        return jsonify({'error': 'Failed to list objects'}), 500

@s3_bp.route('/buckets/<bucket_name>/objects/<path:object_key>', methods=['GET'])
@login_required
@permission_required('view')
def get_object(bucket_name, object_key):
    """Get object metadata or generate presigned URL for download"""
    try:
        s3_client = get_s3_client()
        
        # Get object metadata
        response = s3_client.head_object(Bucket=bucket_name, Key=object_key)
        
        # Generate presigned URL for download
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket_name, 'Key': object_key},
            ExpiresIn=3600  # 1 hour
        )
        
        return jsonify({
            'key': object_key,
            'size': response.get('ContentLength'),
            'contentType': response.get('ContentType'),
            'lastModified': response.get('LastModified').isoformat(),
            'etag': response.get('ETag'),
            'downloadUrl': url
        })
    except ClientError as e:
        current_app.logger.error(f"S3 ClientError: {e}")
        return jsonify({'error': 'Failed to get object', 'details': str(e)}), 404
    except Exception as e:
        current_app.logger.error(f"Error getting object: {e}")
        return jsonify({'error': 'Failed to get object'}), 500

@s3_bp.route('/buckets/<bucket_name>/objects/<path:object_key>', methods=['PUT'])
@login_required
@permission_required('write')
def upload_object(bucket_name, object_key):
    """Upload an object to S3"""
    try:
        s3_client = get_s3_client()
        
        # Get file from request
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        
        # Upload to S3
        s3_client.upload_fileobj(
            file,
            bucket_name,
            object_key,
            ExtraArgs={'ContentType': file.content_type} if file.content_type else {}
        )
        
        return jsonify({'message': 'Object uploaded successfully', 'key': object_key})
    except ClientError as e:
        current_app.logger.error(f"S3 ClientError: {e}")
        return jsonify({'error': 'Failed to upload object', 'details': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error uploading object: {e}")
        return jsonify({'error': 'Failed to upload object'}), 500

@s3_bp.route('/buckets/<bucket_name>/objects/<path:object_key>', methods=['DELETE'])
@login_required
@permission_required('delete')
def delete_object(bucket_name, object_key):
    """Delete an object from S3"""
    try:
        s3_client = get_s3_client()
        s3_client.delete_object(Bucket=bucket_name, Key=object_key)
        
        return jsonify({'message': 'Object deleted successfully'})
    except ClientError as e:
        current_app.logger.error(f"S3 ClientError: {e}")
        return jsonify({'error': 'Failed to delete object', 'details': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error deleting object: {e}")
        return jsonify({'error': 'Failed to delete object'}), 500

@s3_bp.route('/browse', methods=['GET'])
@s3_bp.route('/browse/<path:virtual_path>', methods=['GET'])
@login_required
@permission_required('view')
def browse_filesystem(virtual_path=''):
    """
    Browse S3 as a unified virtual filesystem.
    
    Examples:
      /api/s3/browse          -> List all buckets (root directory)
      /api/s3/browse/my-bucket -> List contents of my-bucket
      /api/s3/browse/my-bucket/folder1 -> List contents of folder1
    """
    try:
        s3_client = get_s3_client()
        
        # Clean up path
        virtual_path = virtual_path.strip('/')
        
        # Root: list all buckets as directories
        if not virtual_path:
            response = s3_client.list_buckets()
            
            items = [
                {
                    'name': bucket['Name'],
                    'type': 'directory',
                    'path': bucket['Name'],
                    'size': None,
                    'lastModified': bucket['CreationDate'].isoformat(),
                    'icon': '📁'
                }
                for bucket in response.get('Buckets', [])
            ]
            
            return jsonify({
                'path': '/',
                'breadcrumbs': [{'name': 'Home', 'path': ''}],
                'items': items
            })
        
        # Parse path: bucket/prefix
        path_parts = virtual_path.split('/', 1)
        bucket_name = path_parts[0]
        prefix = path_parts[1] + '/' if len(path_parts) > 1 else ''
        
        # List objects with delimiter to get folder structure
        kwargs = {
            'Bucket': bucket_name,
            'Prefix': prefix,
            'Delimiter': '/'
        }
        
        response = s3_client.list_objects_v2(**kwargs)
        
        items = []
        
        # Add subdirectories (common prefixes)
        for common_prefix in response.get('CommonPrefixes', []):
            folder_prefix = common_prefix['Prefix']
            folder_name = folder_prefix[len(prefix):-1]  # Remove parent prefix and trailing slash
            
            items.append({
                'name': folder_name,
                'type': 'directory',
                'path': f"{bucket_name}/{folder_prefix.rstrip('/')}",
                'size': None,
                'lastModified': None,
                'icon': '📁'
            })
        
        # Add files (objects)
        for obj in response.get('Contents', []):
            # Skip the prefix itself if it's a directory marker
            if obj['Key'] == prefix:
                continue
                
            file_name = obj['Key'][len(prefix):]  # Remove parent prefix
            
            items.append({
                'name': file_name,
                'type': 'file',
                'path': f"{bucket_name}/{obj['Key']}",
                'size': obj['Size'],
                'lastModified': obj['LastModified'].isoformat(),
                'etag': obj['ETag'],
                'icon': get_file_icon(file_name)
            })
        
        # Build breadcrumbs
        breadcrumbs = [{'name': 'Home', 'path': ''}]
        if virtual_path:
            current_path = ''
            for part in virtual_path.split('/'):
                current_path = f"{current_path}/{part}" if current_path else part
                breadcrumbs.append({
                    'name': part,
                    'path': current_path
                })
        
        return jsonify({
            'path': f"/{virtual_path}",
            'breadcrumbs': breadcrumbs,
            'items': sorted(items, key=lambda x: (x['type'] == 'file', x['name'].lower()))
        })
        
    except ClientError as e:
        current_app.logger.error(f"S3 ClientError: {e}")
        return jsonify({'error': 'Failed to browse filesystem', 'details': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error browsing filesystem: {e}")
        return jsonify({'error': 'Failed to browse filesystem', 'details': str(e)}), 500

def get_file_icon(filename):
    """Get appropriate icon based on file extension"""
    ext = filename.lower().split('.')[-1] if '.' in filename else ''
    
    icon_map = {
        # Documents
        'pdf': '📄',
        'doc': '📝', 'docx': '📝',
        'txt': '📃', 'md': '📃',
        'xls': '📊', 'xlsx': '📊', 'csv': '📊',
        'ppt': '📊', 'pptx': '📊',
        
        # Images
        'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
        'svg': '🖼️', 'bmp': '🖼️', 'ico': '🖼️',
        
        # Video
        'mp4': '🎥', 'avi': '🎥', 'mov': '🎥', 'mkv': '🎥',
        'webm': '🎥', 'flv': '🎥',
        
        # Audio
        'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵', 'flac': '🎵',
        
        # Archives
        'zip': '🗜️', 'tar': '🗜️', 'gz': '🗜️', 'rar': '🗜️',
        '7z': '🗜️', 'bz2': '🗜️',
        
        # Code
        'py': '🐍', 'js': '📜', 'html': '🌐', 'css': '🎨',
        'json': '📋', 'xml': '📋', 'yaml': '📋', 'yml': '📋',
        'sh': '⚙️', 'bat': '⚙️',
        
        # Other
        'log': '📋',
    }
    
    return icon_map.get(ext, '📄')

@s3_bp.route('/operations/upload', methods=['POST'])
@login_required
@permission_required('write')
def upload_to_path():
    """
    Upload file(s) to a virtual path with automatic MIME type detection.
    
    Form data:
      - files[]: One or more files to upload (required)
      - path: Virtual path (e.g., 'bucket-name/folder1/folder2')
      - relativePaths[]: Optional relative paths for folder uploads
    """
    try:
        # Get all uploaded files
        uploaded_files = request.files.getlist('files[]')
        if not uploaded_files or len(uploaded_files) == 0:
            # Fallback to single file upload for backward compatibility
            if 'file' in request.files:
                uploaded_files = [request.files['file']]
            else:
                return jsonify({'error': 'No files provided'}), 400
        
        virtual_path = request.form.get('path', '').strip('/')
        relative_paths = request.form.getlist('relativePaths[]')
        
        if not virtual_path:
            return jsonify({'error': 'Cannot upload to root. Please select a bucket.'}), 400
        
        # Parse virtual path
        path_parts = virtual_path.split('/', 1)
        bucket_name = path_parts[0]
        prefix = path_parts[1] + '/' if len(path_parts) > 1 else ''
        
        s3_client = get_s3_client()
        uploaded_count = 0
        uploaded_files_info = []
        
        for idx, file in enumerate(uploaded_files):
            if not file or not file.filename:
                continue
            
            # Determine object key
            if relative_paths and idx < len(relative_paths) and relative_paths[idx]:
                # Use relative path for folder uploads
                object_key = prefix + relative_paths[idx]
            else:
                # Simple file upload
                object_key = prefix + file.filename
            
            # Read file content for MIME detection
            file_content = file.read()
            file.seek(0)  # Reset file pointer
            
            # Detect MIME type
            content_type = detect_mime_type(file.filename, file_content)
            
            # Upload to S3 with detected MIME type
            s3_client.put_object(
                Bucket=bucket_name,
                Key=object_key,
                Body=file_content,
                ContentType=content_type
            )
            
            uploaded_count += 1
            uploaded_files_info.append({
                'filename': file.filename,
                'path': f"{bucket_name}/{object_key}",
                'contentType': content_type,
                'size': len(file_content)
            })
        
        if uploaded_count == 0:
            return jsonify({'error': 'No valid files to upload'}), 400
        
        return jsonify({
            'success': True,
            'message': f'{uploaded_count} file(s) uploaded successfully',
            'count': uploaded_count,
            'files': uploaded_files_info
        })
        
    except ClientError as e:
        current_app.logger.error(f"S3 ClientError: {e}")
        return jsonify({'error': 'Failed to upload file(s)', 'details': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error uploading file(s): {e}")
        return jsonify({'error': 'Failed to upload file(s)', 'details': str(e)}), 500

@s3_bp.route('/operations/create-folder', methods=['POST'])
@login_required
@permission_required('write')
def create_folder():
    """
    Create a new folder (S3 prefix) at the given virtual path.
    
    JSON body:
      - path: Parent virtual path (e.g., 'bucket-name/folder1')
      - folderName: Name of the new folder
    """
    try:
        data = request.get_json()
        virtual_path = data.get('path', '').strip('/')
        folder_name = data.get('folderName', '').strip('/')
        
        if not folder_name:
            return jsonify({'error': 'Folder name is required'}), 400
        
        if not virtual_path:
            return jsonify({'error': 'Cannot create folder in root. Please select a bucket.'}), 400
        
        # Parse virtual path
        path_parts = virtual_path.split('/', 1)
        bucket_name = path_parts[0]
        prefix = path_parts[1] + '/' if len(path_parts) > 1 else ''
        
        # Create folder by uploading an empty object with trailing slash
        folder_key = prefix + folder_name + '/'
        
        s3_client = get_s3_client()
        s3_client.put_object(
            Bucket=bucket_name,
            Key=folder_key,
            Body=b''
        )
        
        return jsonify({
            'message': 'Folder created successfully',
            'folderName': folder_name,
            'path': f"{bucket_name}/{folder_key}"
        })
        
    except ClientError as e:
        current_app.logger.error(f"S3 ClientError: {e}")
        return jsonify({'error': 'Failed to create folder', 'details': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error creating folder: {e}")
        return jsonify({'error': 'Failed to create folder', 'details': str(e)}), 500

@s3_bp.route('/operations/delete-folder', methods=['DELETE'])
@login_required
@permission_required('delete')
def delete_folder():
    """
    Delete a folder and all its contents.
    
    JSON body:
      - path: Virtual path to the folder (e.g., 'bucket-name/folder1/subfolder')
    """
    try:
        data = request.get_json()
        virtual_path = data.get('path', '').strip('/')
        
        if not virtual_path:
            return jsonify({'error': 'Path is required'}), 400
        
        # Parse virtual path
        path_parts = virtual_path.split('/', 1)
        bucket_name = path_parts[0]
        
        if len(path_parts) < 2:
            return jsonify({'error': 'Cannot delete buckets. Use S3/Rook-Ceph tools to manage buckets.'}), 400
        
        prefix = path_parts[1] + '/'
        
        s3_client = get_s3_client()
        
        # List all objects with this prefix
        objects_to_delete = []
        continuation_token = None
        
        while True:
            kwargs = {
                'Bucket': bucket_name,
                'Prefix': prefix
            }
            
            if continuation_token:
                kwargs['ContinuationToken'] = continuation_token
            
            response = s3_client.list_objects_v2(**kwargs)
            
            # Collect objects to delete
            for obj in response.get('Contents', []):
                objects_to_delete.append({'Key': obj['Key']})
            
            # Check if there are more objects
            if not response.get('IsTruncated', False):
                break
            
            continuation_token = response.get('NextContinuationToken')
        
        if not objects_to_delete:
            return jsonify({'message': 'Folder is already empty or does not exist'}), 200
        
        # Delete all objects (S3 allows up to 1000 objects per request)
        deleted_count = 0
        for i in range(0, len(objects_to_delete), 1000):
            batch = objects_to_delete[i:i+1000]
            s3_client.delete_objects(
                Bucket=bucket_name,
                Delete={'Objects': batch}
            )
            deleted_count += len(batch)
        
        return jsonify({
            'message': 'Folder deleted successfully',
            'deletedCount': deleted_count
        })
        
    except ClientError as e:
        current_app.logger.error(f"S3 ClientError: {e}")
        return jsonify({'error': 'Failed to delete folder', 'details': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error deleting folder: {e}")
        return jsonify({'error': 'Failed to delete folder', 'details': str(e)}), 500

@s3_bp.route('/operations/rename', methods=['POST'])
@login_required
@permission_required('write')
def rename_item():
    """
    Rename a file or folder by copying to new name and deleting old.
    
    JSON body:
      - oldPath: Current virtual path
      - newName: New name (just the name, not full path)
    """
    try:
        data = request.get_json()
        old_virtual_path = data.get('oldPath', '').strip('/')
        new_name = data.get('newName', '').strip('/')
        
        if not old_virtual_path or not new_name:
            return jsonify({'error': 'Both oldPath and newName are required'}), 400
        
        # Parse old path
        old_parts = old_virtual_path.split('/')
        bucket_name = old_parts[0]
        
        if len(old_parts) < 2:
            return jsonify({'error': 'Cannot rename buckets'}), 400
        
        old_key = '/'.join(old_parts[1:])
        
        # Construct new path (same parent, new name)
        parent_parts = old_parts[:-1]
        new_virtual_path = '/'.join(parent_parts + [new_name])
        new_key = '/'.join(old_parts[1:-1] + [new_name])
        
        s3_client = get_s3_client()
        
        # Check if it's a folder (ends with /)
        is_folder = old_key.endswith('/')
        
        if is_folder:
            # For folders, need to rename all objects with this prefix
            new_key = new_key + '/'
            prefix = old_key
            
            # List all objects
            objects_to_rename = []
            continuation_token = None
            
            while True:
                kwargs = {
                    'Bucket': bucket_name,
                    'Prefix': prefix
                }
                
                if continuation_token:
                    kwargs['ContinuationToken'] = continuation_token
                
                response = s3_client.list_objects_v2(**kwargs)
                
                for obj in response.get('Contents', []):
                    objects_to_rename.append(obj['Key'])
                
                if not response.get('IsTruncated', False):
                    break
                
                continuation_token = response.get('NextContinuationToken')
            
            # Copy each object to new location
            for obj_key in objects_to_rename:
                # Replace old prefix with new prefix
                new_obj_key = obj_key.replace(prefix, new_key, 1)
                
                s3_client.copy_object(
                    Bucket=bucket_name,
                    CopySource={'Bucket': bucket_name, 'Key': obj_key},
                    Key=new_obj_key
                )
                
                # Delete old object
                s3_client.delete_object(Bucket=bucket_name, Key=obj_key)
            
            return jsonify({
                'message': 'Folder renamed successfully',
                'oldPath': old_virtual_path,
                'newPath': new_virtual_path,
                'itemsRenamed': len(objects_to_rename)
            })
        else:
            # For files, simple copy and delete
            s3_client.copy_object(
                Bucket=bucket_name,
                CopySource={'Bucket': bucket_name, 'Key': old_key},
                Key=new_key
            )
            
            s3_client.delete_object(Bucket=bucket_name, Key=old_key)
            
            return jsonify({
                'message': 'File renamed successfully',
                'oldPath': old_virtual_path,
                'newPath': new_virtual_path
            })
        
    except ClientError as e:
        current_app.logger.error(f"S3 ClientError: {e}")
        return jsonify({'error': 'Failed to rename item', 'details': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error renaming item: {e}")
        return jsonify({'error': 'Failed to rename item', 'details': str(e)}), 500

@s3_bp.route('/operations/delete-multiple', methods=['DELETE'])
@login_required
@permission_required('delete')
def delete_multiple():
    """
    Delete multiple files/folders.
    
    JSON body:
      - paths: Array of virtual paths to delete
    """
    try:
        data = request.get_json()
        paths = data.get('paths', [])
        
        if not paths:
            return jsonify({'error': 'No paths provided'}), 400
        
        s3_client = get_s3_client()
        deleted_items = 0
        errors = []
        
        for virtual_path in paths:
            try:
                virtual_path = virtual_path.strip('/')
                path_parts = virtual_path.split('/')
                bucket_name = path_parts[0]
                
                if len(path_parts) < 2:
                    errors.append({'path': virtual_path, 'error': 'Cannot delete buckets'})
                    continue
                
                object_key = '/'.join(path_parts[1:])
                
                # Check if it's a folder
                if object_key.endswith('/'):
                    # Delete folder and contents
                    prefix = object_key
                    objects_to_delete = []
                    
                    response = s3_client.list_objects_v2(Bucket=bucket_name, Prefix=prefix)
                    
                    for obj in response.get('Contents', []):
                        objects_to_delete.append({'Key': obj['Key']})
                    
                    if objects_to_delete:
                        s3_client.delete_objects(
                            Bucket=bucket_name,
                            Delete={'Objects': objects_to_delete}
                        )
                        deleted_items += len(objects_to_delete)
                else:
                    # Delete single file
                    s3_client.delete_object(Bucket=bucket_name, Key=object_key)
                    deleted_items += 1
                    
            except ClientError as e:
                errors.append({'path': virtual_path, 'error': str(e)})
        
        result = {
            'message': f'Deleted {deleted_items} item(s)',
            'deletedCount': deleted_items
        }
        
        if errors:
            result['errors'] = errors
        
        return jsonify(result)
        
    except Exception as e:
        current_app.logger.error(f"Error deleting multiple items: {e}")
        return jsonify({'error': 'Failed to delete items', 'details': str(e)}), 500
