terraform {
  required_version = ">= 1.8.0"

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

  # S3 state backend — provision the bucket out-of-band before `tofu init`.
  # Disabled in CI validation via `tofu init -backend=false`.
  backend "s3" {
    bucket = "gravel-tofu-state-dev"
    key    = "phase1/terraform.tfstate"
    region = "eu-west-3"
  }
}
