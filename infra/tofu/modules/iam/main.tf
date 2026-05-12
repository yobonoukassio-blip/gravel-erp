terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

variable "environment" {
  type = string
}

# Placeholder IRSA roles. Concrete trust policies wiring to the EKS OIDC provider
# are bound in plan W1-P01 (deploy bootstrap) once cluster identity exists.
resource "aws_iam_role" "api_pod" {
  name = "gravel-${var.environment}-api-pod"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "pods.eks.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role" "sync_pod" {
  name = "gravel-${var.environment}-sync-pod"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "pods.eks.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role" "keycloak_pod" {
  name = "gravel-${var.environment}-keycloak-pod"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "pods.eks.amazonaws.com"
      }
    }]
  })
}

output "api_pod_role_arn" {
  value = aws_iam_role.api_pod.arn
}

output "sync_pod_role_arn" {
  value = aws_iam_role.sync_pod.arn
}

output "keycloak_pod_role_arn" {
  value = aws_iam_role.keycloak_pod.arn
}
