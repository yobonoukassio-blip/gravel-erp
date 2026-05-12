terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

# S3 bucket with Object Lock enabled for HSE attachments.
# Decision D2-61: Governance mode (overridable by root) with 7-year retention,
# aligned with OHADA audit requirements. Phase 6 may switch to Compliance
# after pen-test; legal review tracked in docs/operations/legal-review-queue.md.
resource "aws_s3_bucket" "this" {
  bucket              = var.bucket_name
  object_lock_enabled = true
  tags                = var.tags

  # Object Lock requires versioning; configured below.
}

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_object_lock_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    default_retention {
      mode  = "GOVERNANCE"
      years = 7
    }
  }

  # Object Lock can only be enabled at bucket creation. The configuration
  # itself can be tightened later (extend retention, switch to Compliance)
  # but the enabled flag is sticky for the lifetime of the bucket.
  depends_on = [aws_s3_bucket_versioning.this]
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block public access — HSE attachments are tenant-scoped and accessed via
# pre-signed URLs only.
resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
