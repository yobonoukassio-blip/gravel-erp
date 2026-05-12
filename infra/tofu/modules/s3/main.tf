terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

variable "environment" {
  type = string
}

resource "random_id" "suffix" {
  byte_length = 4
}

# Attachments bucket — D-41 requires object lock for audit/incidents/permits.
# object_lock_enabled cannot be toggled after creation.
resource "aws_s3_bucket" "attachments" {
  bucket              = "gravel-attachments-${var.environment}-${random_id.suffix.hex}"
  object_lock_enabled = true

  tags = {
    Name    = "gravel-attachments-${var.environment}"
    Purpose = "immutable-attachments"
  }
}

resource "aws_s3_bucket_versioning" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_object_lock_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  rule {
    default_retention {
      mode = "GOVERNANCE"
      days = 365
    }
  }

  depends_on = [aws_s3_bucket_versioning.attachments]
}

output "bucket_name" {
  value = aws_s3_bucket.attachments.id
}

output "bucket_arn" {
  value = aws_s3_bucket.attachments.arn
}
