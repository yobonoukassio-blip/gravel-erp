variable "bucket_name" {
  description = "Globally unique S3 bucket name. Suggested pattern: gravel-<env>-<purpose>-<region>."
  type        = string
}

variable "region" {
  description = "AWS region for tagging / clarity. Provider region is configured at the root module."
  type        = string
}

variable "tags" {
  description = "Tags applied to the bucket. Should include Environment, Tenant (when applicable), Owner, CostCenter."
  type        = map(string)
  default     = {}
}
