variable "aws_region" {
  description = "The primary AWS region for resources"
  type        = string
  default     = "us-west-2"
}

variable "domain_name" {
  description = "The main domain name registered in Porkbun"
  type        = string
  default     = "agrivia.ai"
}

variable "environment" {
  description = "Environment name (e.g. prod, dev)"
  type        = string
  default     = "prod"
}
