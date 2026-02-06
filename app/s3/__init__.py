from flask import Blueprint, jsonify, request, current_app
import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError
from app.auth import login_required, permission_required

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
