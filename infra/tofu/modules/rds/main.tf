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

variable "engine_version" {
  description = "PostgreSQL major.minor version (D-40: 18.x)."
  type        = string
  default     = "18.0"
}

variable "instance_class" {
  type    = string
  default = "db.t3.medium"
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

resource "random_password" "master" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = "gravel-${var.environment}-db"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "gravel-${var.environment}-db-subnet-group"
  }
}

resource "aws_security_group" "rds" {
  name        = "gravel-${var.environment}-rds"
  description = "Allow Postgres traffic from inside VPC"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Parameter group — CRITICAL for PowerSync logical replication (PITFALLS.md #3).
#   wal_level = logical              : enables logical replication slots
#   max_replication_slots = 20       : headroom for PowerSync + read replicas + Debezium future
#   max_wal_senders = 10             : matches expected concurrent senders
#   shared_preload_libraries         : load extensions on startup
resource "aws_db_parameter_group" "main" {
  name        = "gravel-${var.environment}-pg18"
  family      = "postgres18"
  description = "Gravel ERP — Postgres 18 with logical replication for PowerSync"

  parameter {
    name         = "wal_level"
    value        = "logical"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "max_replication_slots"
    value        = "20"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "max_wal_senders"
    value        = "10"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements,postgis,timescaledb,pgcrypto"
    apply_method = "pending-reboot"
  }
}

resource "aws_db_instance" "main" {
  identifier        = "gravel-${var.environment}"
  engine            = "postgres"
  engine_version    = var.engine_version
  instance_class    = var.instance_class
  allocated_storage = 50
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "gravel"
  username = "gravel_admin"
  password = random_password.master.result

  multi_az               = true
  publicly_accessible    = false
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.main.name

  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  performance_insights_enabled = true
  deletion_protection          = false
  skip_final_snapshot          = true

  tags = {
    Name = "gravel-${var.environment}-rds"
  }
}

output "endpoint" {
  value = aws_db_instance.main.endpoint
}

output "port" {
  value = aws_db_instance.main.port
}

output "db_name" {
  value = aws_db_instance.main.db_name
}
