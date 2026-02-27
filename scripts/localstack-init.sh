#!/bin/bash

set -euo pipefail

echo "Initializing LocalStack S3 buckets..."

# Wait for LocalStack to be ready
sleep 5

ensure_bucket() {
  local bucket="$1"

  if awslocal s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
    return
  fi

  awslocal s3 mb "s3://$bucket" >/dev/null
}

for bucket in test-bucket demo-bucket uploads; do
  ensure_bucket "$bucket"
done

# Configure CORS so browser uploads from the local web app can use presigned URLs
CORS_CONFIGURATION='{"CORSRules":[{"AllowedOrigins":["http://localhost:5173","http://127.0.0.1:5173"],"AllowedMethods":["GET","PUT","POST","DELETE","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3000}]}'
for bucket in test-bucket demo-bucket uploads; do
  awslocal s3api put-bucket-cors --bucket "$bucket" --cors-configuration "$CORS_CONFIGURATION"
done

# Seed demo content only once (for persistent LocalStack mode)
SEED_MARKER_KEY="seed/.sample-content-v1"
if awslocal s3api head-object --bucket demo-bucket --key "$SEED_MARKER_KEY" >/dev/null 2>&1; then
  echo "Demo content already seeded, skipping sample upload."
else
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT

  # txt
  cat > "$tmp_dir/readme.txt" <<'EOF'
S3 Manager demo content

This bucket is pre-populated for local testing.
EOF

  # html
  cat > "$tmp_dir/index.html" <<'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>S3 Manager Demo</title>
  </head>
  <body>
    <h1>S3 Manager LocalStack Demo</h1>
    <p>This file was created during LocalStack initialization.</p>
  </body>
</html>
EOF

  # svg
  cat > "$tmp_dir/logo.svg" <<'EOF'
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="24" fill="#0f172a" />
  <circle cx="128" cy="104" r="56" fill="#14b8a6" />
  <path d="M64 188h128" stroke="#e2e8f0" stroke-width="12" stroke-linecap="round" />
</svg>
EOF

  # png (1x1 pixel)
  base64 -d > "$tmp_dir/pixel.png" <<'EOF'
iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZxXcAAAAASUVORK5CYII=
EOF

  # mp4 placeholder (minimal MP4 ftyp box for extension/type testing)
  printf '\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom' > "$tmp_dir/sample.mp4"

  # Root-level files
  awslocal s3 cp "$tmp_dir/readme.txt" s3://demo-bucket/readme.txt
  awslocal s3 cp "$tmp_dir/index.html" s3://demo-bucket/index.html

  # Nested folders with mixed types
  awslocal s3 cp "$tmp_dir/logo.svg" s3://demo-bucket/assets/logo.svg
  awslocal s3 cp "$tmp_dir/pixel.png" s3://demo-bucket/assets/images/pixel.png
  awslocal s3 cp "$tmp_dir/sample.mp4" s3://demo-bucket/media/sample.mp4
  awslocal s3 cp "$tmp_dir/readme.txt" s3://demo-bucket/docs/guides/getting-started.txt

  # Seed marker
  printf 'seeded\n' | awslocal s3 cp - "s3://demo-bucket/$SEED_MARKER_KEY"

  echo "Uploaded demo content to demo-bucket."
fi

echo "LocalStack S3 initialization complete!"
echo "Created buckets:"
awslocal s3 ls
