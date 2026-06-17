#this tests connectivity to genesys cloud

terraform {
  required_providers {
    genesyscloud = {
      source  = "mypurecloud/genesyscloud"
      version = "~> 1.69.0"
    }
  }
}

provider "genesyscloud" {
  oauthclient_id     = var.genesyscloud_oauthclient_id
  oauthclient_secret = var.genesyscloud_oauthclient_secret
  aws_region         = var.genesyscloud_region
  sdk_debug          = false
  #sdk_debug_format   = "Json"
}

variable "genesyscloud_oauthclient_id" {
  description = "OAuthClient ID found on the OAuth page of Admin UI."
  type        = string
}

variable "genesyscloud_oauthclient_secret" {
  description = "OAuthClient secret found on the OAuth page of Admin UI."
  type        = string
  sensitive   = true
}

variable "genesyscloud_region" {
  description = "AWS region where org exists. e.g. us-east-1."
  type        = string
}

data "genesyscloud_auth_division" "home" {
  name = "Home"
}
