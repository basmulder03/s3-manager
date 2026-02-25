"""
Pytest configuration and fixtures for S3 Manager tests.

This module provides shared fixtures for:
- Flask app instance with test configuration
- LocalStack S3 client
- Test buckets and data
- Playwright browser instances
"""

import os
import pytest
import boto3
from typing import Generator
from app import create_app
from flask import Flask
from flask.testing import FlaskClient


# ============================================================================
# Environment Setup
# ============================================================================

@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    """Set up test environment variables."""
    os.environ["LOCAL_DEV_MODE"] = "true"
    os.environ["FLASK_DEBUG"] = "true"
    os.environ["S3_ENDPOINT"] = os.environ.get("S3_ENDPOINT", "http://localhost:4566")
    os.environ["AWS_ACCESS_KEY_ID"] = "test"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "test"
    os.environ["AWS_DEFAULT_REGION"] = "us-east-1"
    os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only"
    yield


# ============================================================================
# Flask App Fixtures
# ============================================================================

@pytest.fixture(scope="session")
def app() -> Generator[Flask, None, None]:
    """Create and configure a Flask app instance for testing."""
    app = create_app()
    app.config.update({
        "TESTING": True,
        "WTF_CSRF_ENABLED": False,
        "SECRET_KEY": "test-secret-key",
    })
    
    with app.app_context():
        yield app


@pytest.fixture(scope="function")
def client(app: Flask) -> FlaskClient:
    """Create a test client for the Flask app."""
    return app.test_client()


@pytest.fixture(scope="function")
def authenticated_client(client: FlaskClient) -> FlaskClient:
    """Create an authenticated test client with mock session."""
    with client.session_transaction() as session:
        session['user'] = {
            'name': 'Test User',
            'email': 'test@localhost',
            'roles': ['S3-Admin']
        }
    return client


# ============================================================================
# S3 / LocalStack Fixtures
# ============================================================================

@pytest.fixture(scope="session")
def s3_client():
    """Create an S3 client connected to LocalStack."""
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("S3_ENDPOINT", "http://localhost:4566"),
        aws_access_key_id="test",
        aws_secret_access_key="test",
        region_name="us-east-1",
    )


@pytest.fixture(scope="function")
def test_bucket(s3_client):
    """Create a test bucket and clean it up after the test."""
    bucket_name = "test-bucket"
    
    # Create bucket
    try:
        s3_client.create_bucket(Bucket=bucket_name)
    except s3_client.exceptions.BucketAlreadyExists:
        # Clean existing bucket
        _delete_bucket_contents(s3_client, bucket_name)
    
    yield bucket_name
    
    # Cleanup
    _delete_bucket_contents(s3_client, bucket_name)
    try:
        s3_client.delete_bucket(Bucket=bucket_name)
    except:
        pass


@pytest.fixture(scope="function")
def test_bucket_with_data(s3_client, test_bucket):
    """Create a test bucket with sample data structure."""
    # Create folders (prefix markers)
    s3_client.put_object(Bucket=test_bucket, Key="folder1/")
    s3_client.put_object(Bucket=test_bucket, Key="folder2/")
    s3_client.put_object(Bucket=test_bucket, Key="folder1/subfolder/")
    
    # Create files
    s3_client.put_object(Bucket=test_bucket, Key="file1.txt", Body=b"Content of file1")
    s3_client.put_object(Bucket=test_bucket, Key="file2.pdf", Body=b"PDF content")
    s3_client.put_object(Bucket=test_bucket, Key="folder1/file3.jpg", Body=b"Image data")
    s3_client.put_object(Bucket=test_bucket, Key="folder1/subfolder/file4.txt", Body=b"Nested file")
    
    yield test_bucket


def _delete_bucket_contents(s3_client, bucket_name: str):
    """Delete all objects in a bucket."""
    try:
        paginator = s3_client.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=bucket_name)
        
        objects_to_delete = []
        for page in pages:
            if 'Contents' in page:
                objects_to_delete.extend([{'Key': obj['Key']} for obj in page['Contents']])
        
        if objects_to_delete:
            # Delete in batches of 1000
            for i in range(0, len(objects_to_delete), 1000):
                batch = objects_to_delete[i:i+1000]
                s3_client.delete_objects(
                    Bucket=bucket_name,
                    Delete={'Objects': batch}
                )
    except:
        pass


# ============================================================================
# Playwright Fixtures
# ============================================================================

@pytest.fixture(scope="session")
def browser_context_args():
    """Configure Playwright browser context."""
    return {
        "viewport": {"width": 1920, "height": 1080},
        "locale": "en-US",
        "timezone_id": "America/New_York",
    }


@pytest.fixture(scope="function")
def base_url():
    """Base URL for the running app (configure via env var or pytest arg)."""
    return os.environ.get("TEST_BASE_URL", "http://localhost:8080")


# ============================================================================
# Helper Functions
# ============================================================================

def upload_test_file(s3_client, bucket: str, key: str, content: bytes = b"test content"):
    """Helper to upload a test file to S3."""
    s3_client.put_object(Bucket=bucket, Key=key, Body=content)


def get_object_content(s3_client, bucket: str, key: str) -> bytes:
    """Helper to get object content from S3."""
    response = s3_client.get_object(Bucket=bucket, Key=key)
    return response['Body'].read()


def list_bucket_objects(s3_client, bucket: str, prefix: str = "") -> list:
    """Helper to list all objects in a bucket with optional prefix."""
    objects = []
    paginator = s3_client.get_paginator('list_objects_v2')
    pages = paginator.paginate(Bucket=bucket, Prefix=prefix)
    
    for page in pages:
        if 'Contents' in page:
            objects.extend([obj['Key'] for obj in page['Contents']])
    
    return objects
