
provider "genesyscloud" {
  oauthclient_id     = var.genesyscloud_oauthclient_id
  oauthclient_secret = var.genesyscloud_oauthclient_secret
  aws_region         = var.genesyscloud_region
  sdk_debug          = false
  #sdk_debug_format   = "Json"
}
