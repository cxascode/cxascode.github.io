# this tests connectivity to terraform registry and github (our downloads live there)

terraform {
  required_providers {
    genesyscloud = {
      source  = "mypurecloud/genesyscloud"
      version = "~> 1.60.0"
    }
  }
}

provider "genesyscloud" {
  sdk_debug          = false
}
