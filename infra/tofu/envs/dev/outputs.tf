output "vpc_id" {
  description = "Dev VPC id."
  value       = module.vpc.vpc_id
}

output "eks_cluster_endpoint" {
  description = "EKS API endpoint."
  value       = module.eks.cluster_endpoint
  sensitive   = true
}

output "rds_endpoint" {
  description = "RDS Postgres endpoint."
  value       = module.rds.endpoint
  sensitive   = true
}

output "attachments_bucket" {
  description = "S3 bucket for tenant attachments with object lock."
  value       = module.s3.bucket_name
}
