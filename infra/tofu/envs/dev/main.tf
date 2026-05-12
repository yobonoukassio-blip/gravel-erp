provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "gravel-ivoire-erp"
      Environment = var.environment
      Phase       = "1"
      ManagedBy   = "opentofu"
    }
  }
}

module "vpc" {
  source      = "../../modules/vpc"
  environment = var.environment
  vpc_cidr    = var.vpc_cidr
}

module "iam" {
  source      = "../../modules/iam"
  environment = var.environment
}

module "eks" {
  source             = "../../modules/eks"
  environment        = var.environment
  cluster_version    = var.eks_cluster_version
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
}

module "rds" {
  source             = "../../modules/rds"
  environment        = var.environment
  engine_version     = var.rds_postgres_version
  instance_class     = var.rds_instance_class
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
}

module "s3" {
  source      = "../../modules/s3"
  environment = var.environment
}
