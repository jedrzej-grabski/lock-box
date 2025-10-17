#!/bin/bash
set -e

echo "🪣 Setting up LocalStack S3..."

# Wait for S3 to be ready (sometimes needed for fast startup)
until awslocal s3 ls >/dev/null 2>&1; do
  echo "⏳ Waiting for S3 service..."
  sleep 2
done

# Create bucket (ignore if it already exists)
if ! awslocal s3 ls | grep -q lockbox-bucket; then
  awslocal s3 mb s3://lockbox-bucket
  echo "✅ Created S3 bucket: lockbox-bucket"
else
  echo "ℹ️ Bucket lockbox-bucket already exists"
fi

# Apply CORS configuration
awslocal s3api put-bucket-cors \
  --bucket lockbox-bucket \
  --cors-configuration file:///etc/localstack/init/ready.d/s3-cors.json

echo "✅ CORS applied to S3 bucket 'lockbox-bucket'"
