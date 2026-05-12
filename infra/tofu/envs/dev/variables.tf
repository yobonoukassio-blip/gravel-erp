variable "region" {
  description = "AWS region. eu-west-3 (Paris) is the Phase 1 fallback per D-39; switch to af-south-1 if SLA acceptable."
  type        = string
  default     = "eu-west-3"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)."
  type        = string
  default     = "dev"
}

variable "tenant_id_dev" {
  description = "Seed tenant UUID for dev environment fixtures."
  type        = string
  default     = "00000000-0000-0000-0000-000000000001"
}

variable "vpc_cidr" {
  description = "Top-level CIDR for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "eks_cluster_version" {
  description = "EKS Kubernetes version (1.30+ per STACK.md)."
  type        = string
  default     = "1.30"
}

variable "rds_postgres_version" {
  description = "RDS PostgreSQL engine version. D-40 pins 18.x."
  type        = string
  default     = "18.0"
}

variable "rds_instance_class" {
  description = "RDS instance class for dev."
  type        = string
  default     = "db.t3.medium"
}
