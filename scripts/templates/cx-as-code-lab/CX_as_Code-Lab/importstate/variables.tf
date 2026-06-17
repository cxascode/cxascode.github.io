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
