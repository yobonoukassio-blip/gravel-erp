output "bucket_id" {
  description = "S3 bucket ID (== bucket name)."
  value       = aws_s3_bucket.this.id
}

output "bucket_arn" {
  description = "S3 bucket ARN, used by IAM policies (HSE service, alerts attachments worker)."
  value       = aws_s3_bucket.this.arn
}

output "object_lock_mode" {
  description = "Configured default retention mode (GOVERNANCE for Phase 2)."
  value       = aws_s3_bucket_object_lock_configuration.this.rule[0].default_retention[0].mode
}

output "object_lock_years" {
  description = "Configured default retention years (7 for Phase 2 — OHADA alignment)."
  value       = aws_s3_bucket_object_lock_configuration.this.rule[0].default_retention[0].years
}
