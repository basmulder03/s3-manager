#!/bin/bash

echo "Initializing LocalStack S3 buckets..."

# Wait for LocalStack to be ready
sleep 5

# Create test buckets
awslocal s3 mb s3://test-bucket
awslocal s3 mb s3://demo-bucket
awslocal s3 mb s3://uploads

# Add some sample objects
echo "Sample file 1" > /tmp/sample1.txt
echo "Sample file 2" > /tmp/sample2.txt
awslocal s3 cp /tmp/sample1.txt s3://demo-bucket/sample1.txt
awslocal s3 cp /tmp/sample2.txt s3://demo-bucket/sample2.txt

# Create a folder structure
awslocal s3 cp /tmp/sample1.txt s3://demo-bucket/folder1/file1.txt
awslocal s3 cp /tmp/sample2.txt s3://demo-bucket/folder1/folder2/file2.txt

echo "LocalStack S3 initialization complete!"
echo "Created buckets:"
awslocal s3 ls
