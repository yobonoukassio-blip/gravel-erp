# tofu test — runs against the AWS mock provider.
# Asserts the module produces the expected resource shape without
# actually creating buckets in AWS.

variables {
  bucket_name = "gravel-test-hse-attachments-af-south-1"
  region      = "af-south-1"
  tags = {
    Environment = "test"
    Module      = "s3-objectlock"
  }
}

run "plan_creates_object_locked_bucket" {
  command = plan

  assert {
    condition     = aws_s3_bucket.this.object_lock_enabled == true
    error_message = "Object Lock must be enabled at bucket creation."
  }

  assert {
    condition     = aws_s3_bucket_object_lock_configuration.this.rule[0].default_retention[0].mode == "GOVERNANCE"
    error_message = "Default retention mode must be GOVERNANCE per D2-61."
  }

  assert {
    condition     = aws_s3_bucket_object_lock_configuration.this.rule[0].default_retention[0].years == 7
    error_message = "Default retention must be 7 years (OHADA alignment)."
  }

  assert {
    condition     = aws_s3_bucket_versioning.this.versioning_configuration[0].status == "Enabled"
    error_message = "Versioning must be Enabled (required by Object Lock)."
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.this.block_public_acls == true
    error_message = "Bucket must block all forms of public access — HSE attachments are tenant-scoped."
  }

  assert {
    condition     = aws_s3_bucket_server_side_encryption_configuration.this.rule[0].apply_server_side_encryption_by_default[0].sse_algorithm == "AES256"
    error_message = "Server-side encryption must default to AES256."
  }
}

run "outputs_expose_arn_and_retention" {
  command = plan

  assert {
    condition     = output.object_lock_mode == "GOVERNANCE"
    error_message = "Output object_lock_mode must echo the configured mode."
  }

  assert {
    condition     = output.object_lock_years == 7
    error_message = "Output object_lock_years must echo 7."
  }
}
